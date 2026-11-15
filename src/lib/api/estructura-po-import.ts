// Server layer of the B3 PO structure import (`POST /projects/:id/structure/import`).
//
// The parsed PO plan (`parseEstructuraPO`) is mapped onto the template importer's
// structure shape and written structure-only (PO decision D-A: «modo "solo
// estructura" que conserva el presupuesto existente»). It reuses the template
// writer's steps — the history guard, the soft-delete and the createMany with
// one `IMPORTAR` audit row per created row. It keeps the budget (T13 S6): each line
// moves to the new activity with the same code, and only the lines of an activity
// the file drops go (T13 S8), with valor_total recomputed. It never touches the
// other project fields.

import type { Prisma } from "@prisma/client";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { fijarValorTotal, limpiarConfirmacion, lockProyectoBorrador } from "@/lib/api/presupuesto";
import {
  LINEA_CON_GASTOS_MESSAGE,
  borrarEstructura,
  clave,
  crearEstructura,
  exigirSinHistorial,
  type AuditoriaImportacion,
  type EstructuraPlan,
} from "@/lib/api/plantilla-import";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { durationWeeks } from "@/lib/proyectos/weeks";
import type { PlanEstructuraPO } from "@/lib/proyectos/estructura-po/parse";

export type ResumenEstructuraPO = { objetivos: number; actividades: number; entregables: number; indicadores: number };

/**
 * The PO plan in the template importer's shape. The PO file carries no weight,
 * responsable, medio or indicator unit (PO 2026-10-23), so they take the
 * template's defaults: the default weight, no responsable and empty strings.
 */
function aEstructuraPlan(plan: PlanEstructuraPO): EstructuraPlan {
  return {
    objetivos: plan.objetivos.map((o, indice) => ({ codigo: o.codigo, descripcion: o.descripcion, orden: indice + 1 })),
    actividades: plan.actividades.map((a) => ({
      codigo: a.codigo,
      objetivoCodigo: a.objetivoCodigo,
      nombre: a.nombre,
      semanaInicio: a.semanaInicio,
      semanaFin: a.semanaFin,
      responsableId: null,
    })),
    entregables: plan.entregables.map((e) => ({
      codigo: e.codigo,
      actividadCodigo: e.actividadCodigo,
      descripcion: e.descripcion,
      cantidadMeta: e.cantidadMeta,
      unidad: e.unidad,
      tipoMedio: "",
    })),
    indicadores: plan.indicadores.map((i) => ({
      codigo: i.codigo,
      objetivoCodigo: i.objetivoCodigo,
      nombre: i.nombre,
      meta: i.meta,
      unidad: "",
      lineaBase: null,
    })),
  };
}

/** The project's duration in weeks, or `null` while it has no (valid) dates. */
export function duracionSemanas(proyecto: { fecha_inicio: Date | null; fecha_fin: Date | null }): number | null {
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return null;
  try {
    return durationWeeks(isoDate(proyecto.fecha_inicio), isoDate(proyecto.fecha_fin));
  } catch {
    return null;
  }
}

type ImportarEstructuraArgs = {
  proyectoId: string;
  usuarioId: string;
  plan: PlanEstructuraPO;
  loteId: string;
  /** The 409 copy when the project left BORRADOR before the row lock. */
  stateMessage: string;
};

/**
 * T13 S6 — D-A: «modo "solo estructura" que conserva el presupuesto existente». The structure was just re-created
 * with new ids, so each budget line moves to the new activity with the same code (value and programming kept, the
 * way the template import matches lines). T13 S8 — «si tiene un presupuesto asignado se borra junto con la
 * actividad, le toca hacerlo de cero»: a line whose activity code the file drops goes, with its programming; then
 * valor_total is the sum of what is left and the programming confirmation is reopened. Lines without an activity
 * (legacy) are not the structure's and stay as they are. 409 when a dropped line already has expenses.
 */
async function reubicarPresupuesto(
  tx: Prisma.TransactionClient,
  input: {
    proyectoId: string;
    usuarioId: string;
    loteId: string;
    base: AuditoriaImportacion;
    cambios: CambioInput[];
    actividadIds: Map<string, string>;
  },
): Promise<void> {
  const { proyectoId: id, base, cambios } = input;
  const lineas = await tx.lineaPresupuestal.findMany({
    where: { proyecto_id: id, actividad_id: { not: null } },
    select: { id: true, actividad_id: true, monto_proyectado_cop: true, actividad: { select: { codigo: true } } },
  });
  const quitadas: typeof lineas = [];
  for (const linea of lineas) {
    const nueva = linea.actividad ? input.actividadIds.get(clave(linea.actividad.codigo)) : undefined;
    if (nueva === undefined) {
      quitadas.push(linea);
      continue;
    }
    if (nueva === linea.actividad_id) continue;
    await tx.lineaPresupuestal.update({ where: { id: linea.id }, data: { actividad_id: nueva } });
    cambios.push({
      ...base,
      entidad: "presupuesto",
      entidad_id: linea.id,
      campo: "actividad_id",
      valor_anterior: linea.actividad_id,
      valor_nuevo: nueva,
    });
  }
  if (quitadas.length === 0) return;

  const ids = quitadas.map((linea) => linea.id);
  if ((await tx.gasto.count({ where: { proyecto_id: id, linea_id: { in: ids } } })) > 0) {
    throw new RespuestaAbortada(apiError(LINEA_CON_GASTOS_MESSAGE, 409, "CONFLICT"));
  }
  await tx.programacionPeriodo.deleteMany({ where: { proyecto_id: id, linea_id: { in: ids } } });
  await tx.lineaPresupuestal.deleteMany({ where: { proyecto_id: id, id: { in: ids } } });
  for (const linea of quitadas) {
    cambios.push({
      ...base,
      entidad: "presupuesto",
      entidad_id: linea.id,
      campo: "asignado",
      valor_anterior: fromCents(toCents(linea.monto_proyectado_cop)),
      valor_nuevo: fromCents(BigInt(0)),
    });
  }

  const [proyecto, restantes] = await Promise.all([
    tx.proyecto.findUniqueOrThrow({
      where: { id },
      select: { valor_total: true, oportunidad: { select: { valor_estimado_cop: true } } },
    }),
    tx.lineaPresupuestal.findMany({ where: { proyecto_id: id }, select: { monto_proyectado_cop: true } }),
  ]);
  const valorTotal = await fijarValorTotal(tx, {
    proyectoId: id,
    usuarioId: input.usuarioId,
    anterior: proyecto.valor_total === null ? null : toCents(proyecto.valor_total),
    suma: sumCents(restantes.map((linea) => toCents(linea.monto_proyectado_cop))),
    oportunidad: proyecto.oportunidad,
  });
  if (valorTotal) cambios.push({ ...valorTotal, accion: base.accion, lote_id: input.loteId });
  await limpiarConfirmacion(tx, { proyectoId: id, usuarioId: input.usuarioId, loteId: input.loteId, accion: "IMPORTAR" });
}

/**
 * Replaces the live structure with the (already validated) PO plan. It must run
 * inside ONE `$transaction` supplied by the caller: the soft-delete, the creates
 * and the audit lote commit or roll back together. Throws `RespuestaAbortada`
 * (404/409) for a project that is gone, left BORRADOR, or carries execution history.
 */
export async function importarEstructuraPO(
  tx: Prisma.TransactionClient,
  { proyectoId: id, usuarioId, plan, loteId, stateMessage }: ImportarEstructuraArgs,
): Promise<ResumenEstructuraPO> {
  await lockProyectoBorrador(tx, id, stateMessage);
  await exigirSinHistorial(tx, id);

  const base: AuditoriaImportacion = { usuario_id: usuarioId, accion: "IMPORTAR", proyecto_id: id, lote_id: loteId };
  const cambios: CambioInput[] = [];
  const reemplazados = await borrarEstructura(tx, id);
  const actividadIds = await crearEstructura(tx, id, aEstructuraPlan(plan), base, cambios);
  await reubicarPresupuesto(tx, { proyectoId: id, usuarioId, loteId, base, cambios, actividadIds });

  const resumen: ResumenEstructuraPO = {
    objetivos: plan.objetivos.length,
    actividades: plan.actividades.length,
    entregables: plan.entregables.length,
    indicadores: plan.indicadores.length,
  };
  cambios.push({
    ...base,
    entidad: "proyecto",
    entidad_id: id,
    campo: "reemplazo",
    valor_anterior: reemplazados,
    valor_nuevo: resumen,
  });
  await logChanges(tx, cambios);
  return resumen;
}
