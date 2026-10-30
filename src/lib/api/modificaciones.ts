// Server side of the S8 modification requests (E-26): the gates, the body schema, the dry run of the
// RF-28 rules against the live project, and the view of a request. The rules themselves are pure
// (`proyectos/modificaciones.ts`); this file reads rows and calls them.
//
// Order of every route here: project (404) -> permission (403) -> estado (409) -> body (400).

import { randomUUID } from "node:crypto";
import { Prisma, type Usuario } from "@prisma/client";
import { z } from "zod";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { db } from "@/lib/db";
import { canApproveModification, canExecuteProject } from "@/lib/permissions";
import { decimalFromCents, lockProyecto } from "@/lib/api/presupuesto";
import { canReadProject, loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { loadLiveProyecto } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { toCents, type Cents } from "@/lib/proyectos/money";
import {
  applyModificacion,
  validarModificacion,
  type DetalleItem,
  type ErrorRegla,
  type TipoModificacion,
} from "@/lib/proyectos/modificaciones";
import { buildSnapshot, diffSnapshots, type LiveProyecto, type SnapshotV1 } from "@/lib/proyectos/versiones";
import { periodOf, todayInBogota } from "@/lib/proyectos/weeks";
import { estaCongelado } from "@/lib/proyectos/transiciones-estado";

export const MODIFICACION_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
export const MODIFICACION_ESTADO_MESSAGE = "Solo se pueden solicitar modificaciones de un proyecto en ejecución.";
export const MODIFICACION_SIN_BASE_MESSAGE = "El proyecto no tiene línea base aprobada.";
export const PROYECTO_NO_EXISTE = "El proyecto no existe.";
export const SOLICITUD_NO_EXISTE = "La solicitud no existe.";
export const SOLICITUD_DECIDIDA_MESSAGE = "La solicitud ya fue decidida.";
export const SOLICITUD_OBSOLETA_MESSAGE = "La solicitud se basa en una versión anterior; vuelve a crearla.";
export const APLICAR_ESTADO_MESSAGE = "Solo se pueden aplicar modificaciones a un proyecto en ejecución.";
export const DECISION_ESTADO_MESSAGE = "No se pueden aprobar o rechazar modificaciones de un proyecto suspendido, cerrado o cancelado.";
export const APLICAR_REGLAS_MESSAGE = "La modificación ya no cumple las reglas.";

export const TIPOS_MODIFICACION = ["TRASLADO", "ADICION", "REDUCCION", "REPROGRAMACION", "CRONOGRAMA", "ENTREGABLES"] as const;
const ELEMENTOS = ["presupuesto", "programacion", "proyecto", "actividad", "entregable", "indicador"] as const;

export const MODIFICACION_SCHEMA = z
  .object({
    tipo: z.enum(TIPOS_MODIFICACION, { error: "El tipo de modificación no es válido." }),
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo es obligatorio.")
      .max(1000, "El motivo es demasiado largo."),
    detalle: z
      .array(
        z
          .object({
            elemento: z.enum(ELEMENTOS, { error: "El elemento del cambio no es válido." }),
            clave: z.string({ error: "La clave del cambio es obligatoria." }).trim().min(1, "La clave del cambio es obligatoria.").max(100),
            campo: z.string().trim().min(1).max(50).optional(),
            antes: z.string({ error: "El valor actual del cambio es obligatorio." }).max(500),
            despues: z.string({ error: "El valor propuesto del cambio es obligatorio." }).max(500),
          })
          .strict(),
        { error: "Envía la lista de cambios." },
      )
      .min(1, "La solicitud debe incluir al menos un cambio.")
      .max(500, "La solicitud tiene demasiados cambios."),
  })
  .strict();

export type ModificacionBody = z.infer<typeof MODIFICACION_SCHEMA>;

export const DECISION_SCHEMA = z
  .object({
    comentario: z
      .string({ error: "El comentario es obligatorio al rechazar." })
      .trim()
      .min(1, "El comentario es obligatorio al rechazar.")
      .max(1000, "El comentario es demasiado largo."),
  })
  .strict();

const SCOPE_SELECT = { id: true, estado: true } as const;

/** 404 -> 403 (manager or member COORDINADOR, A-01) -> 409 (EN_EJECUCION) -> 409 (v0 exists). */
export async function gateModificacionRequest(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ id: string; estado: string }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, SCOPE_SELECT);
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canExecuteProject(projectReadActor(usuario, scoped.es_miembro))) {
    return { ok: false, response: apiError(MODIFICACION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  if (scoped.row.estado !== "EN_EJECUCION") {
    return { ok: false, response: apiError(MODIFICACION_ESTADO_MESSAGE, 409, "INVALID_STATE") };
  }
  const base = await db.versionProyecto.findFirst({ where: { proyecto_id: proyectoId, numero: 0 }, select: { id: true } });
  if (!base) return { ok: false, response: apiError(MODIFICACION_SIN_BASE_MESSAGE, 409, "INVALID_STATE") };
  return { ok: true, value: scoped.row };
}

/** 404 -> 403 for the list: whoever can read the project. */
export async function gateModificacionRead(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ id: string; estado: string }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, SCOPE_SELECT);
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canReadProject(usuario, scoped.es_miembro)) {
    return { ok: false, response: apiError(MODIFICACION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  return { ok: true, value: scoped.row };
}

/**
 * 404 (project) -> 403 (ADM/GER) -> 409 (project frozen, B7) -> 404 (request of that project) -> 409 (still
 * PENDIENTE).
 */
export async function gateModificacionDecision(
  usuario: Usuario,
  proyectoId: string,
  solicitudId: string,
): Promise<GateResult<{ id: string }>> {
  const proyecto = await db.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: { id: true, estado: true },
  });
  if (!proyecto) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  if (!canApproveModification(usuario)) {
    return { ok: false, response: apiError(MODIFICACION_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  if (estaCongelado(proyecto.estado)) {
    return { ok: false, response: apiError(DECISION_ESTADO_MESSAGE, 409, "INVALID_STATE") };
  }
  const solicitud = await db.solicitudModificacion.findFirst({
    where: { id: solicitudId, proyecto_id: proyectoId },
    select: { id: true, estado: true },
  });
  if (!solicitud) return { ok: false, response: apiError(SOLICITUD_NO_EXISTE, 404, "NOT_FOUND") };
  if (solicitud.estado !== "PENDIENTE") {
    return { ok: false, response: apiError(SOLICITUD_DECIDIDA_MESSAGE, 409, "INVALID_STATE") };
  }
  return { ok: true, value: solicitud };
}

/** The request as the routes answer it after a decision. */
export async function loadSolicitudView(solicitudId: string): Promise<SolicitudView> {
  const fila = await db.solicitudModificacion.findFirstOrThrow({ where: { id: solicitudId }, select: SOLICITUD_SELECT });
  const nombres = await loadNombres([fila.solicitado_por_id, ...(fila.decidido_por_id ? [fila.decidido_por_id] : [])]);
  return toSolicitudView(fila, nombres);
}

type EjecutadoReader = Pick<Prisma.TransactionClient, "gasto">;

/**
 * VALIDADO total per rubro code (E). At approval time it runs under the line locks, so no
 * validation can commit between this read and the write.
 */
export async function loadEjecutadoPorRubro(client: EjecutadoReader, proyectoId: string): Promise<Map<string, Cents>> {
  const filas = await client.gasto.findMany({
    where: { proyecto_id: proyectoId, estado: "VALIDADO" },
    select: { monto_cop: true, linea: { select: { rubro: { select: { codigo: true } } } } },
  });
  const total = new Map<string, Cents>();
  for (const fila of filas) {
    const codigo = fila.linea.rubro.codigo;
    if (codigo === null) continue;
    total.set(codigo, (total.get(codigo) ?? BigInt(0)) + toCents(fila.monto_cop));
  }
  return total;
}

type EvaluarClient = Pick<
  Prisma.TransactionClient,
  "proyecto" | "lineaPresupuestal" | "programacionPeriodo" | "objetivo" | "actividad" | "entregable" | "indicador" | "gasto" | "rubro"
>;

export type Evaluacion = {
  live: LiveProyecto;
  reglas: ErrorRegla[];
  /** Names of the rubros the modification brings into the budget (code -> name). */
  catalogo: Map<string, string>;
};

/**
 * Dry run of a request against the live project: structural checks, RF-28 and REQ-GAS-06. The
 * request route calls it for early feedback; the approval calls it again under the locks.
 */
export async function evaluarSolicitud(
  client: EvaluarClient,
  proyectoId: string,
  solicitud: { tipo: TipoModificacion; detalle: readonly DetalleItem[] },
): Promise<Evaluacion> {
  const { live } = await loadLiveProyecto(client, proyectoId);
  if (live === null) {
    throw new Error("A project with an approved baseline always has its header complete.");
  }

  // A rubro that is not in the budget yet must exist in the catalog and be active.
  const enPresupuesto = new Set(live.presupuesto.map((r) => r.rubro_codigo));
  const nuevos = [
    ...new Set(solicitud.detalle.filter((i) => i.elemento === "presupuesto" && !enPresupuesto.has(i.clave)).map((i) => i.clave)),
  ];
  const catalogo = new Map<string, string>();
  const reglas: ErrorRegla[] = [];
  if (nuevos.length > 0) {
    const rubros = await client.rubro.findMany({ where: { codigo: { in: nuevos }, activo: true }, select: { codigo: true, nombre: true } });
    for (const rubro of rubros) if (rubro.codigo !== null) catalogo.set(rubro.codigo, rubro.nombre);
    for (const codigo of nuevos) {
      if (!catalogo.has(codigo)) {
        reglas.push({ codigo: "ELEMENTO_INEXISTENTE", clave: codigo, mensaje: `El rubro «${codigo}» no existe o está suspendido.` });
      }
    }
  }
  if (reglas.length > 0) return { live, reglas, catalogo };

  const [ejecutado, parametros] = await Promise.all([loadEjecutadoPorRubro(client, proyectoId), getSemaforoParametrosV2()]);
  const errores = validarModificacion(live, solicitud, ejecutado, periodOf(todayInBogota()), {
    bloqueaPeriodosPasados: parametros.modificacion_bloquea_periodos_pasados.valor,
  });
  return { live, reglas: errores, catalogo };
}

const USUARIO_SELECT = { id: true, nombre: true } as const;

export const SOLICITUD_SELECT = {
  id: true,
  tipo: true,
  motivo: true,
  detalle: true,
  version_base_numero: true,
  estado: true,
  solicitado_por_id: true,
  solicitado_at: true,
  decidido_por_id: true,
  decidido_at: true,
  comentario_decision: true,
  version: { select: { numero: true } },
} as const;

export type SolicitudRow = Prisma.SolicitudModificacionGetPayload<{ select: typeof SOLICITUD_SELECT }>;

export type SolicitudView = {
  id: string;
  tipo: TipoModificacion;
  motivo: string;
  detalle: DetalleItem[];
  version_base_numero: number;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitado_por: { id: string; nombre: string | null };
  solicitado_at: string;
  decidido_por: { id: string; nombre: string | null } | null;
  decidido_at: string | null;
  comentario_decision: string | null;
  /** Number of the version the approval created; null while pending or when rejected. */
  version_numero: number | null;
};

/** Resolves the audit pointers (no FK) into `{id, nombre}`. */
export async function loadNombres(ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const usuarios = await db.usuario.findMany({ where: { id: { in: unicos } }, select: USUARIO_SELECT });
  return new Map(usuarios.map((u) => [u.id, u.nombre]));
}

export function toSolicitudView(row: SolicitudRow, nombres: ReadonlyMap<string, string>): SolicitudView {
  const persona = (id: string) => ({ id, nombre: nombres.get(id) ?? null });
  return {
    id: row.id,
    tipo: row.tipo,
    motivo: row.motivo,
    detalle: row.detalle as unknown as DetalleItem[],
    version_base_numero: row.version_base_numero,
    estado: row.estado,
    solicitado_por: persona(row.solicitado_por_id),
    solicitado_at: row.solicitado_at.toISOString(),
    decidido_por: row.decidido_por_id ? persona(row.decidido_por_id) : null,
    decidido_at: row.decidido_at ? row.decidido_at.toISOString() : null,
    comentario_decision: row.comentario_decision,
    version_numero: row.version?.numero ?? null,
  };
}

// ---------------------------------------------------------------------------
// Decision writers
// ---------------------------------------------------------------------------

const aborta = (message: string, status: number, code: "NOT_FOUND" | "INVALID_STATE"): never => {
  throw new RespuestaAbortada(apiError(message, status, code));
};

const fechaDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const decimal2 = (text: string) => new Prisma.Decimal(text);

type Aplicador = Prisma.TransactionClient;

/** Maps a (project) code to the row id and writes the new values by diff. Returns ids for the audit. */
async function escribirCambios(tx: Aplicador, proyectoId: string, antes: LiveProyecto, despues: LiveProyecto) {
  const ids = { linea: new Map<string, string>(), actividad: new Map<string, string>(), entregable: new Map<string, string>(), indicador: new Map<string, string>() };

  if (
    antes.proyecto.valor_total !== despues.proyecto.valor_total ||
    antes.proyecto.fecha_inicio !== despues.proyecto.fecha_inicio ||
    antes.proyecto.fecha_fin !== despues.proyecto.fecha_fin
  ) {
    await tx.proyecto.update({
      where: { id: proyectoId },
      data: {
        valor_total: decimal2(despues.proyecto.valor_total),
        fecha_inicio: fechaDb(despues.proyecto.fecha_inicio),
        fecha_fin: fechaDb(despues.proyecto.fecha_fin),
      },
    });
  }

  // Budget lines: a rubro leaving the budget keeps its row at A = 0 (expenses may reference it).
  const lineas = await tx.lineaPresupuestal.findMany({
    where: { proyecto_id: proyectoId },
    select: { id: true, monto_proyectado_cop: true, rubro: { select: { codigo: true } } },
  });
  for (const linea of lineas) if (linea.rubro.codigo) ids.linea.set(linea.rubro.codigo, linea.id);
  const asignado = (live: LiveProyecto, codigo: string) => live.presupuesto.find((r) => r.rubro_codigo === codigo)?.asignado ?? "0";
  const codigos = new Set([...antes.presupuesto, ...despues.presupuesto].map((r) => r.rubro_codigo ?? ""));
  for (const codigo of [...codigos].sort()) {
    const nuevo = toCents(asignado(despues, codigo));
    const existente = lineas.find((l) => l.rubro.codigo === codigo);
    if (existente) {
      if (toCents(existente.monto_proyectado_cop) !== nuevo) {
        await tx.lineaPresupuestal.update({ where: { id: existente.id }, data: { monto_proyectado_cop: decimalFromCents(nuevo) } });
      }
    } else if (nuevo > BigInt(0)) {
      const rubro = await tx.rubro.findFirstOrThrow({ where: { codigo }, select: { id: true } });
      const creada = await tx.lineaPresupuestal.create({
        data: { proyecto_id: proyectoId, rubro_id: rubro.id, monto_proyectado_cop: decimalFromCents(nuevo) },
        select: { id: true },
      });
      ids.linea.set(codigo, creada.id);
    }
  }

  // Programming cells: a cell that becomes $0 is deleted (S5 pattern).
  const valorCelda = (live: LiveProyecto) =>
    new Map(live.programacion.map((c) => [`${c.rubro_codigo}|${c.periodo}`, toCents(c.valor)]));
  const previas = valorCelda(antes);
  const nuevas = valorCelda(despues);
  for (const clave of [...new Set([...previas.keys(), ...nuevas.keys()])].sort()) {
    const previo = previas.get(clave) ?? BigInt(0);
    const nuevo = nuevas.get(clave) ?? BigInt(0);
    if (previo === nuevo) continue;
    const [codigo = "", periodo = ""] = clave.split("|");
    const lineaId = ids.linea.get(codigo) as string;
    if (nuevo === BigInt(0)) {
      await tx.programacionPeriodo.deleteMany({ where: { linea_id: lineaId, periodo } });
    } else {
      await tx.programacionPeriodo.upsert({
        where: { linea_id_periodo: { linea_id: lineaId, periodo } },
        create: { proyecto_id: proyectoId, linea_id: lineaId, periodo, valor: decimalFromCents(nuevo) },
        update: { valor: decimalFromCents(nuevo) },
      });
    }
  }

  const [actividades, entregables, indicadores] = await Promise.all([
    tx.actividad.findMany({ where: { proyecto_id: proyectoId, deleted_at: null }, select: { id: true, codigo: true } }),
    tx.entregable.findMany({ where: { proyecto_id: proyectoId, deleted_at: null }, select: { id: true, codigo: true } }),
    tx.indicador.findMany({ where: { proyecto_id: proyectoId, deleted_at: null }, select: { id: true, codigo: true } }),
  ]);
  for (const a of actividades) ids.actividad.set(a.codigo, a.id);
  for (const e of entregables) ids.entregable.set(e.codigo, e.id);
  for (const i of indicadores) ids.indicador.set(i.codigo, i.id);

  for (const a of despues.actividades) {
    const previa = antes.actividades.find((x) => x.codigo === a.codigo);
    if (!previa || (previa.semana_inicio === a.semana_inicio && previa.semana_fin === a.semana_fin)) continue;
    await tx.actividad.update({
      where: { id: ids.actividad.get(a.codigo) as string },
      data: { semana_inicio: a.semana_inicio, semana_fin: a.semana_fin },
    });
  }
  for (const e of despues.entregables) {
    const previa = antes.entregables.find((x) => x.codigo === e.codigo);
    if (!previa || (previa.cantidad_meta === e.cantidad_meta && previa.descripcion === e.descripcion && previa.unidad === e.unidad)) continue;
    await tx.entregable.update({
      where: { id: ids.entregable.get(e.codigo) as string },
      data: { cantidad_meta: decimal2(e.cantidad_meta), descripcion: e.descripcion, unidad: e.unidad },
    });
  }
  for (const i of despues.indicadores) {
    const previa = antes.indicadores.find((x) => x.codigo === i.codigo);
    if (!previa || (previa.meta === i.meta && previa.nombre === i.nombre && previa.unidad === i.unidad)) continue;
    await tx.indicador.update({
      where: { id: ids.indicador.get(i.codigo) as string },
      data: { meta: decimal2(i.meta), nombre: i.nombre, unidad: i.unidad },
    });
  }
  return ids;
}

/** One audit row per changed field. A line or cell that appears/disappears is recorded as A or P going to/from $0. */
function auditoriaDeCambios(
  base: { usuario_id: string; proyecto_id: string; lote_id: string },
  proyectoId: string,
  antes: SnapshotV1,
  despues: SnapshotV1,
  ids: { linea: Map<string, string>; actividad: Map<string, string>; entregable: Map<string, string>; indicador: Map<string, string> },
): CambioInput[] {
  const asignado = (s: SnapshotV1, codigo: string) => s.presupuesto.find((r) => r.rubro_codigo === codigo)?.asignado ?? "0.00";
  const programado = (s: SnapshotV1, clave: string) => s.programacion.find((c) => `${c.rubro_codigo}|${c.periodo}` === clave)?.valor ?? "0.00";
  return diffSnapshots(antes, despues).map((d): CambioInput => {
    switch (d.elemento) {
      case "proyecto":
        return { ...base, accion: "EDITAR", entidad: "proyecto", entidad_id: proyectoId, campo: d.campo, valor_anterior: d.desde, valor_nuevo: d.hasta };
      case "presupuesto":
        return {
          ...base,
          accion: "EDITAR",
          entidad: "presupuesto",
          entidad_id: ids.linea.get(d.clave) ?? proyectoId,
          campo: "asignado",
          valor_anterior: asignado(antes, d.clave),
          valor_nuevo: asignado(despues, d.clave),
        };
      case "programacion": {
        const [codigo = "", periodo = ""] = d.clave.split("|");
        return {
          ...base,
          accion: "EDITAR",
          entidad: "programacion",
          entidad_id: ids.linea.get(codigo) ?? proyectoId,
          campo: periodo,
          valor_anterior: programado(antes, d.clave),
          valor_nuevo: programado(despues, d.clave),
        };
      }
      case "actividad":
      case "entregable":
      case "indicador":
        return { ...base, accion: "EDITAR", entidad: d.elemento, entidad_id: ids[d.elemento].get(d.clave) ?? proyectoId, campo: d.campo, valor_anterior: d.desde, valor_nuevo: d.hasta };
    }
  });
}

export type AprobacionResult = { version: { id: string; numero: number; aprobado_at: string } };

/**
 * E-26 approval in ONE transaction (the caller's), lock order project -> budget lines by id:
 * re-check the estado and the request under the project lock, refuse a request based on an older
 * version, compute E under the line locks, run the RF-28 rules again, write the changes by diff, store
 * the new immutable version and audit the lote. Aborts with `RespuestaAbortada` so everything rolls back.
 */
export async function aplicarModificacion(
  tx: Prisma.TransactionClient,
  input: { proyectoId: string; solicitudId: string; usuarioId: string; loteId?: string },
): Promise<AprobacionResult> {
  const proyecto = await lockProyecto(tx, input.proyectoId);
  if (proyecto.estado !== "EN_EJECUCION") aborta(APLICAR_ESTADO_MESSAGE, 409, "INVALID_STATE");

  const solicitud = await tx.solicitudModificacion.findFirst({ where: { id: input.solicitudId, proyecto_id: input.proyectoId } });
  if (!solicitud) aborta(SOLICITUD_NO_EXISTE, 404, "NOT_FOUND");
  if (solicitud!.estado !== "PENDIENTE") aborta(SOLICITUD_DECIDIDA_MESSAGE, 409, "INVALID_STATE");

  const { _max } = await tx.versionProyecto.aggregate({ where: { proyecto_id: input.proyectoId }, _max: { numero: true } });
  const vigente = _max.numero;
  if (vigente === null || vigente !== solicitud!.version_base_numero) aborta(SOLICITUD_OBSOLETA_MESSAGE, 409, "INVALID_STATE");

  // Every line is locked (id order, like the expense validation takes it) BEFORE E is read: a
  // validation that is mid-flight finishes first and one that starts later waits for this commit.
  await tx.$queryRaw`SELECT "id" FROM "lineas_presupuestales" WHERE "proyecto_id" = ${input.proyectoId} ORDER BY "id" FOR UPDATE`;

  const s = { tipo: solicitud!.tipo as TipoModificacion, detalle: solicitud!.detalle as unknown as DetalleItem[] };
  const { live, reglas, catalogo } = await evaluarSolicitud(tx, input.proyectoId, s);
  if (reglas.length > 0) {
    throw new RespuestaAbortada(apiError(reglas[0]!.mensaje, 400, "VALIDATION_ERROR", { reglas }));
  }

  const despues = applyModificacion(live, s, catalogo);
  const ids = await escribirCambios(tx, input.proyectoId, live, despues);

  // What was written must be exactly what the pure rules computed, or the transaction is rolled back.
  const releido = (await loadLiveProyecto(tx, input.proyectoId)).live;
  const esperado = buildSnapshot(despues);
  const snapshot = buildSnapshot(releido as LiveProyecto);
  if (JSON.stringify(snapshot) !== JSON.stringify(esperado)) {
    throw new Error("The applied modification does not match the computed snapshot.");
  }

  const version = await tx.versionProyecto.create({
    data: {
      proyecto_id: input.proyectoId,
      numero: (vigente as number) + 1,
      tipo: "MODIFICACION",
      solicitud_id: solicitud!.id,
      aprobado_por_id: input.usuarioId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  const { count } = await tx.solicitudModificacion.updateMany({
    where: { id: solicitud!.id, estado: "PENDIENTE" },
    data: { estado: "APROBADA", decidido_por_id: input.usuarioId, decidido_at: new Date() },
  });
  if (count === 0) aborta(SOLICITUD_DECIDIDA_MESSAGE, 409, "INVALID_STATE");

  const lote_id = input.loteId ?? randomUUID();
  const base = { usuario_id: input.usuarioId, proyecto_id: input.proyectoId, lote_id } as const;
  await logChanges(tx, [
    { ...base, accion: "APROBAR", entidad: "solicitud", entidad_id: solicitud!.id, campo: "estado", valor_anterior: "PENDIENTE", valor_nuevo: "APROBADA" },
    { ...base, accion: "APROBAR", entidad: "version", entidad_id: version.id, valor_nuevo: { numero: version.numero, tipo: "MODIFICACION" } },
    ...auditoriaDeCambios(base, input.proyectoId, buildSnapshot(live), esperado, ids),
  ]);

  return { version: { id: version.id, numero: version.numero, aprobado_at: version.aprobado_at.toISOString() } };
}

/** Rejection: the request becomes RECHAZADA with the comment; no domain data changes. */
export async function rechazarModificacion(
  tx: Prisma.TransactionClient,
  input: { proyectoId: string; solicitudId: string; usuarioId: string; comentario: string },
): Promise<void> {
  const solicitud = await tx.solicitudModificacion.findFirst({
    where: { id: input.solicitudId, proyecto_id: input.proyectoId },
    select: { id: true },
  });
  if (!solicitud) aborta(SOLICITUD_NO_EXISTE, 404, "NOT_FOUND");
  const { count } = await tx.solicitudModificacion.updateMany({
    where: { id: input.solicitudId, estado: "PENDIENTE" },
    data: { estado: "RECHAZADA", decidido_por_id: input.usuarioId, decidido_at: new Date(), comentario_decision: input.comentario },
  });
  if (count === 0) aborta(SOLICITUD_DECIDIDA_MESSAGE, 409, "INVALID_STATE");
  await logChanges(tx, [
    {
      usuario_id: input.usuarioId,
      proyecto_id: input.proyectoId,
      accion: "RECHAZAR",
      entidad: "solicitud",
      entidad_id: input.solicitudId,
      campo: "estado",
      valor_anterior: "PENDIENTE",
      valor_nuevo: "RECHAZADA",
    },
  ]);
}
