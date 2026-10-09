// Server side of the S8 modification requests (E-26): the gates, the body schema, the dry run of the
// RF-28 rules against the live project, and the view of a request. The rules themselves are pure
// (`proyectos/modificaciones.ts`); this file reads rows and calls them.
//
// Order of every route here: project (404) -> permission (403) -> estado (409) -> body (400).

import type { Prisma, Usuario } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { canExecuteProject } from "@/lib/permissions";
import { canReadProject, loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import type { GateResult } from "@/lib/api/estructura";
import { loadLiveProyecto } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { toCents, type Cents } from "@/lib/proyectos/money";
import {
  validarModificacion,
  type DetalleItem,
  type ErrorRegla,
  type TipoModificacion,
} from "@/lib/proyectos/modificaciones";
import type { LiveProyecto } from "@/lib/proyectos/versiones";
import { periodOf, todayInBogota } from "@/lib/proyectos/weeks";

export const MODIFICACION_FORBIDDEN_MESSAGE = "No tienes permisos sobre este proyecto.";
export const MODIFICACION_ESTADO_MESSAGE = "Solo se pueden solicitar modificaciones de un proyecto en ejecución.";
export const MODIFICACION_SIN_BASE_MESSAGE = "El proyecto no tiene línea base aprobada.";
export const PROYECTO_NO_EXISTE = "El proyecto no existe.";
export const SOLICITUD_NO_EXISTE = "La solicitud no existe.";

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
