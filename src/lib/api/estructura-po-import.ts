// Server layer of the B3 PO structure import (`POST /projects/:id/structure/import`).
//
// The parsed PO plan (`parseEstructuraPO`) is mapped onto the template importer's
// structure shape and written structure-only (PO decision D-A: «modo "solo
// estructura" que conserva el presupuesto existente»). It reuses the template
// writer's steps — the history guard, the soft-delete and the createMany with
// one `IMPORTAR` audit row per created row — and never touches the budget, the
// programming or the project fields.

import type { Prisma } from "@prisma/client";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { lockProyectoBorrador } from "@/lib/api/presupuesto";
import {
  borrarEstructura,
  crearEstructura,
  exigirSinHistorial,
  type AuditoriaImportacion,
  type EstructuraPlan,
} from "@/lib/api/plantilla-import";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { defaultWeight, durationWeeks } from "@/lib/proyectos/weeks";
import type { PlanEstructuraPO } from "@/lib/proyectos/estructura-po/parse";

export type ResumenEstructuraPO = { objetivos: number; actividades: number; entregables: number; indicadores: number };

/**
 * The PO plan in the template importer's shape. The PO file carries no weight,
 * responsable, medio or indicator unit (PO 2026-10-23), so they take the
 * template's defaults: the default weight, no responsable and empty strings.
 */
export function aEstructuraPlan(plan: PlanEstructuraPO): EstructuraPlan {
  return {
    objetivos: plan.objetivos.map((o, indice) => ({ codigo: o.codigo, descripcion: o.descripcion, orden: indice + 1 })),
    actividades: plan.actividades.map((a) => ({
      codigo: a.codigo,
      objetivoCodigo: a.objetivoCodigo,
      nombre: a.nombre,
      semanaInicio: a.semanaInicio,
      semanaFin: a.semanaFin,
      peso: fromCents(toCents(String(defaultWeight(a.semanaInicio, a.semanaFin)))),
      pesoManual: false,
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
  await crearEstructura(tx, id, aEstructuraPlan(plan), base, cambios);

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
