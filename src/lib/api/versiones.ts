// Server side of the S8 versions: the loader of the live project as a plain-data model and the
// atomic baseline approval (E-25). Pure rules live in `proyectos/versiones.ts` and
// `proyectos/linea-base.ts`; this file only reads rows, calls them and writes in ONE transaction.

import type { Prisma } from "@prisma/client";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { lockProyecto } from "@/lib/api/presupuesto";
import { precondicionesLineaBase, type EntradaLineaBase } from "@/lib/proyectos/linea-base";
import { toCents } from "@/lib/proyectos/money";
import { buildSnapshot, type LiveProyecto } from "@/lib/proyectos/versiones";
import { randomUUID } from "node:crypto";

export const BASELINE_YA_APROBADA_MESSAGE = "El proyecto ya tiene línea base aprobada.";
export const BASELINE_ESTADO_MESSAGE = "Solo se puede aprobar la línea base de un proyecto en Borrador.";
export const BASELINE_PRECONDICIONES_MESSAGE = "La línea base no se puede aprobar: hay precondiciones sin cumplir.";

export type CargaProyecto = {
  /** Input of `precondicionesLineaBase`: always available, even for an incomplete draft. */
  entrada: EntradaLineaBase;
  /** The snapshot model; null while the project header is incomplete (no valor_total or dates). */
  live: LiveProyecto | null;
};

type Reader = Pick<
  Prisma.TransactionClient,
  "proyecto" | "lineaPresupuestal" | "programacionPeriodo" | "objetivo" | "actividad" | "entregable" | "indicador"
>;

const isoDate = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Reads the live project (soft-deleted rows dropped) as the plain strings and numbers the pure
 * libs consume. Lines with A = 0 and no programming above $0 stay out of the snapshot (D6).
 * Call it under `lockProyecto` so the structure cannot change while it is read.
 */
export async function loadLiveProyecto(client: Reader, proyectoId: string): Promise<CargaProyecto> {
  const [proyecto, lineas, celdas, objetivos, actividades, entregables, indicadores] = await Promise.all([
    client.proyecto.findUniqueOrThrow({
      where: { id: proyectoId },
      select: { valor_total: true, fecha_inicio: true, fecha_fin: true, beneficiarios_meta: true },
    }),
    client.lineaPresupuestal.findMany({
      where: { proyecto_id: proyectoId },
      select: { id: true, rubro_id: true, monto_proyectado_cop: true, rubro: { select: { codigo: true, nombre: true, activo: true } } },
    }),
    client.programacionPeriodo.findMany({
      where: { proyecto_id: proyectoId },
      select: { linea_id: true, periodo: true, valor: true },
    }),
    client.objetivo.findMany({ where: { proyecto_id: proyectoId, deleted_at: null }, select: { id: true, codigo: true } }),
    client.actividad.findMany({
      where: { proyecto_id: proyectoId, deleted_at: null },
      select: { id: true, codigo: true, objetivo_id: true, nombre: true, semana_inicio: true, semana_fin: true, peso: true, peso_manual: true },
    }),
    client.entregable.findMany({
      where: { proyecto_id: proyectoId, deleted_at: null },
      select: { codigo: true, actividad_id: true, descripcion: true, cantidad_meta: true, unidad: true },
    }),
    client.indicador.findMany({
      where: { proyecto_id: proyectoId, deleted_at: null },
      select: { codigo: true, objetivo_id: true, nombre: true, meta: true, unidad: true, linea_base: true },
    }),
  ]);

  const ZERO = BigInt(0);
  const codigoObjetivo = new Map(objetivos.map((o) => [o.id, o.codigo]));
  const codigoActividad = new Map(actividades.map((a) => [a.id, a.codigo]));
  const rubroDeLinea = new Map(lineas.map((l) => [l.id, l.rubro_id]));
  const celdasVivas = celdas.filter((c) => rubroDeLinea.has(c.linea_id));
  const conProgramacion = new Set(celdasVivas.filter((c) => toCents(c.valor) > ZERO).map((c) => c.linea_id));
  const lineasEnVersion = lineas.filter((l) => toCents(l.monto_proyectado_cop) > ZERO || conProgramacion.has(l.id));
  const enVersion = new Set(lineasEnVersion.map((l) => l.id));

  const valorTotal = proyecto.valor_total === null ? null : toCents(proyecto.valor_total);
  const fechaInicio = isoDate(proyecto.fecha_inicio);
  const fechaFin = isoDate(proyecto.fecha_fin);

  const entrada: EntradaLineaBase = {
    valorTotal,
    fechaInicio,
    fechaFin,
    beneficiariosMeta: proyecto.beneficiarios_meta,
    objetivos: objetivos.map((o) => ({ codigo: o.codigo })),
    actividades: actividades.map((a) => ({ codigo: a.codigo, objetivoCodigo: codigoObjetivo.get(a.objetivo_id) ?? "" })),
    entregables: entregables.map((e) => ({ codigo: e.codigo, actividadCodigo: codigoActividad.get(e.actividad_id) ?? "" })),
    lineas: lineas.map((l) => ({
      rubroId: l.rubro_id,
      nombre: l.rubro.nombre,
      asignado: toCents(l.monto_proyectado_cop),
      activo: l.rubro.activo,
    })),
    programacion: celdasVivas.map((c) => ({
      rubroId: rubroDeLinea.get(c.linea_id)!,
      periodo: c.periodo,
      valor: toCents(c.valor),
    })),
  };

  if (proyecto.valor_total === null || fechaInicio === null || fechaFin === null) {
    return { entrada, live: null };
  }

  const codigoRubro = new Map(lineas.map((l) => [l.id, l.rubro.codigo]));
  const live: LiveProyecto = {
    proyecto: {
      valor_total: proyecto.valor_total.toString(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      beneficiarios_meta: proyecto.beneficiarios_meta,
    },
    presupuesto: lineasEnVersion.map((l) => ({
      rubro_codigo: l.rubro.codigo,
      rubro_nombre: l.rubro.nombre,
      asignado: l.monto_proyectado_cop.toString(),
    })),
    programacion: celdasVivas
      .filter((c) => enVersion.has(c.linea_id))
      .map((c) => ({ rubro_codigo: codigoRubro.get(c.linea_id) ?? null, periodo: c.periodo, valor: c.valor.toString() })),
    actividades: actividades.map((a) => ({
      codigo: a.codigo,
      objetivo_codigo: codigoObjetivo.get(a.objetivo_id) ?? "",
      nombre: a.nombre,
      semana_inicio: a.semana_inicio,
      semana_fin: a.semana_fin,
      peso: a.peso.toString(),
      peso_manual: a.peso_manual,
    })),
    entregables: entregables.map((e) => ({
      codigo: e.codigo,
      actividad_codigo: codigoActividad.get(e.actividad_id) ?? "",
      descripcion: e.descripcion,
      cantidad_meta: e.cantidad_meta.toString(),
      unidad: e.unidad,
    })),
    indicadores: indicadores.map((i) => ({
      codigo: i.codigo,
      objetivo_codigo: codigoObjetivo.get(i.objetivo_id) ?? "",
      nombre: i.nombre,
      meta: i.meta.toString(),
      unidad: i.unidad,
      linea_base: i.linea_base === null ? null : i.linea_base.toString(),
    })),
  };
  return { entrada, live };
}

export type BaselineResult = {
  version: { id: string; numero: number; aprobado_at: string };
  proyecto: { id: string; estado: string };
};

/**
 * E-25 in ONE transaction (the caller's): lock the project row, re-read the structure under the
 * lock, check every REQ-VER-01 precondition, write v0 and move BORRADOR -> EN_EJECUCION with the
 * audit lote. Aborts with `RespuestaAbortada` (404/409) so the whole transaction rolls back.
 */
export async function aprobarLineaBase(
  tx: Prisma.TransactionClient,
  input: { proyectoId: string; usuarioId: string; loteId?: string },
): Promise<BaselineResult> {
  const bloqueado = await lockProyecto(tx, input.proyectoId);
  if (bloqueado.estado === "EN_EJECUCION") {
    throw new RespuestaAbortada(apiError(BASELINE_YA_APROBADA_MESSAGE, 409, "INVALID_STATE"));
  }
  if (bloqueado.estado !== "BORRADOR") {
    throw new RespuestaAbortada(apiError(BASELINE_ESTADO_MESSAGE, 409, "INVALID_STATE"));
  }

  const { entrada, live } = await loadLiveProyecto(tx, input.proyectoId);
  const fallas = precondicionesLineaBase(entrada);
  if (fallas.length > 0 || live === null) {
    throw new RespuestaAbortada(
      apiError(BASELINE_PRECONDICIONES_MESSAGE, 409, "INVALID_STATE", { precondiciones: fallas }),
    );
  }

  const version = await tx.versionProyecto.create({
    data: {
      proyecto_id: input.proyectoId,
      numero: 0,
      tipo: "LINEA_BASE",
      aprobado_por_id: input.usuarioId,
      snapshot: buildSnapshot(live) as unknown as Prisma.InputJsonValue,
    },
  });
  await tx.proyecto.update({ where: { id: input.proyectoId }, data: { estado: "EN_EJECUCION" } });

  const lote_id = input.loteId ?? randomUUID();
  const base = { usuario_id: input.usuarioId, proyecto_id: input.proyectoId, lote_id } as const;
  const cambios: CambioInput[] = [
    { ...base, accion: "APROBAR", entidad: "version", entidad_id: version.id, valor_nuevo: { numero: 0, tipo: "LINEA_BASE" } },
    {
      ...base,
      accion: "EDITAR",
      entidad: "proyecto",
      entidad_id: input.proyectoId,
      campo: "estado",
      valor_anterior: "BORRADOR",
      valor_nuevo: "EN_EJECUCION",
    },
  ];
  await logChanges(tx, cambios);

  return {
    version: { id: version.id, numero: 0, aprobado_at: version.aprobado_at.toISOString() },
    proyecto: { id: input.proyectoId, estado: "EN_EJECUCION" },
  };
}
