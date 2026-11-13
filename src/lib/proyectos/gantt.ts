/**
 * Pure layout of the week Gantt (S3.6b, RF-08). No DB, no framework.
 *
 * One bar per activity, from `semana_inicio` to `semana_fin`. Grid columns are
 * 1-based week numbers, so a bar occupies grid lines `columnaInicio` to
 * `columnaFin` (end-exclusive, the CSS `grid-column: start / end` contract).
 * An activity whose weeks exceed the project duration is flagged, never
 * clamped (A-03): the grid grows (`totalSemanas`) so the bar stays whole.
 *
 * T12 (S6): a transversal has no objective, so its bar carries `objetivoId: null` and the chart
 * groups it apart, under «Gestión del proyecto».
 */

import type { TipoActividad } from "./actividad"

export type GanttActividad = {
  id: string
  /** `null` en una transversal (S6): no tiene objetivo y se agrupa en «Gestión del proyecto». */
  objetivo_id: string | null
  /** S6 (EV-02): Normal o Transversal; sin `tipo` la actividad vale como Normal, como en la API. */
  tipo?: TipoActividad | null
  codigo: string
  nombre: string
  semana_inicio: number
  semana_fin: number
}

export type GanttBarra = {
  id: string
  objetivoId: string | null
  /** Copia del tipo para que el cronograma decida el grupo con la misma regla que el resto (T12). */
  tipo?: TipoActividad | null
  codigo: string
  nombre: string
  semanaInicio: number
  semanaFin: number
  /** CSS grid line where the bar starts (= `semana_inicio`). */
  columnaInicio: number
  /** CSS grid line where the bar ends, exclusive (= `semana_fin + 1`). */
  columnaFin: number
  semanas: number
  fueraDeDuracion: boolean
}

export type GanttLayout = {
  /** Project duration in weeks; 0 while the project has no dates. */
  duracionSemanas: number
  /** Columns to draw: the duration, grown to the last overflowing week. 0 = nothing to draw. */
  totalSemanas: number
  barras: GanttBarra[]
}

export function ganttLayout(
  actividades: readonly GanttActividad[],
  duracionSemanas: number | null,
): GanttLayout {
  const duracion = duracionSemanas ?? 0
  if (duracion < 1) return { duracionSemanas: 0, totalSemanas: 0, barras: [] }
  if (actividades.length === 0) return { duracionSemanas: duracion, totalSemanas: 0, barras: [] }

  const barras = actividades
    .map<GanttBarra>((a) => ({
      id: a.id,
      objetivoId: a.objetivo_id,
      tipo: a.tipo,
      codigo: a.codigo,
      nombre: a.nombre,
      semanaInicio: a.semana_inicio,
      semanaFin: a.semana_fin,
      columnaInicio: a.semana_inicio,
      columnaFin: a.semana_fin + 1,
      semanas: a.semana_fin - a.semana_inicio + 1,
      fueraDeDuracion: a.semana_fin > duracion,
    }))
    .sort((x, y) => x.semanaInicio - y.semanaInicio || x.codigo.localeCompare(y.codigo, "es"))

  const ultima = Math.max(...barras.map((b) => b.semanaFin))
  return { duracionSemanas: duracion, totalSemanas: Math.max(duracion, ultima), barras }
}
