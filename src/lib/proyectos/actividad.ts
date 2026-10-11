/**
 * Pure model of a week-based activity (S3, REQ-STR-02..04). Framework- and
 * DB-free, like `weeks.ts`, which it builds on.
 *
 * Calendar dates are NEVER stored: `fecha_inicio`/`fecha_fin` of an activity are
 * derived here from its weeks and the project start, so a change of the project
 * start can never leave a stale date behind (REQ-STR-08).
 */

import {
  activityDates,
  daysBetweenInclusive,
  defaultWeight,
  durationWeeks,
  type IsoDate,
} from "./weeks"
import { colorTecnicoV2, type ColorSemaforo } from "./semaforo-v2"

/** A value Prisma's Decimal and a plain number both satisfy. */
type NumericLike = number | { toString(): string }

function toNumber(value: NumericLike): number {
  return typeof value === "number" ? value : Number(value.toString())
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Weight the activity carries: the typed one while `peso_manual`, otherwise its
 * duration in weeks, derived rather than trusted from the stored column.
 */
export function pesoEfectivo(actividad: {
  semana_inicio: number
  semana_fin: number
  peso: NumericLike
  peso_manual: boolean
}): number {
  return actividad.peso_manual
    ? toNumber(actividad.peso)
    : defaultWeight(actividad.semana_inicio, actividad.semana_fin)
}

/**
 * REQ-STR-04: decides the `(peso, peso_manual)` pair to store.
 *
 * - a supplied number sets a manual weight (rounded to the column's 2 decimals);
 * - an explicit `null` clears the manual weight back to the default;
 * - nothing supplied keeps an existing manual weight untouched when the weeks
 *   change, and recomputes a non-manual one from the new weeks.
 */
export function resolvePeso(input: {
  semana_inicio: number
  semana_fin: number
  peso?: number | null
  actual?: { peso: NumericLike; peso_manual: boolean }
}): { peso: number; peso_manual: boolean } {
  if (typeof input.peso === "number") {
    return { peso: round2(input.peso), peso_manual: true }
  }
  if (input.peso === undefined && input.actual?.peso_manual) {
    return { peso: toNumber(input.actual.peso), peso_manual: true }
  }
  return { peso: defaultWeight(input.semana_inicio, input.semana_fin), peso_manual: false }
}

/** Calendar days an activity spans, both endpoints included (the v6 "Días" column). */
export function duracionDias(inicio: IsoDate, fin: IsoDate): number {
  return daysBetweenInclusive(inicio, fin)
}

/**
 * Days of the activity already elapsed at `corte`, both endpoints included and
 * clamped to `[0, duración]` (the v6 "Al corte" column): 0 before it starts, the
 * full duration once it has ended.
 */
export function diasAlCorte(corte: IsoDate, inicio: IsoDate, fin: IsoDate): number {
  const total = daysBetweenInclusive(inicio, fin)
  return Math.min(Math.max(daysBetweenInclusive(inicio, corte), 0), total)
}

export type ObjetivoResumenInput = {
  objetivo_codigo: string
  /** Effective weight of the activity; a zero total weight yields zero progress. */
  peso: number
  /** Real progress 0..1 at the corte. */
  progreso: number
  /** Planned fraction 0..1 at the corte. */
  programado: number
}

export type ObjetivoResumen = {
  codigo: string
  /** Weighted mean of the activities' planned fraction (0..1). */
  programado: number
  /** Weighted mean of the activities' real progress (0..1). */
  ejecutado: number
  /** `(programado - ejecutado) * 100`, in percentage points. */
  desviacion_pp: number
  /** Server-computed semáforo band; the client never derives it (D11). */
  color: ColorSemaforo
}

/**
 * Roll-up per objective (S14 P6): the weighted mean of its activities' planned
 * and executed fractions, the deviation in percentage points and the semáforo
 * from the API thresholds. Objectives keep the order of first appearance.
 */
export function resumenObjetivos(
  actividades: readonly ObjetivoResumenInput[],
  umbrales: { umbral1: number; umbral2: number },
): ObjetivoResumen[] {
  const orden: string[] = []
  const grupos = new Map<string, { peso: number; programado: number; ejecutado: number }>()
  for (const actividad of actividades) {
    let grupo = grupos.get(actividad.objetivo_codigo)
    if (!grupo) {
      grupo = { peso: 0, programado: 0, ejecutado: 0 }
      grupos.set(actividad.objetivo_codigo, grupo)
      orden.push(actividad.objetivo_codigo)
    }
    grupo.peso += actividad.peso
    grupo.programado += actividad.peso * actividad.programado
    grupo.ejecutado += actividad.peso * actividad.progreso
  }

  return orden.map((codigo) => {
    const grupo = grupos.get(codigo)!
    const programado = grupo.peso > 0 ? grupo.programado / grupo.peso : 0
    const ejecutado = grupo.peso > 0 ? grupo.ejecutado / grupo.peso : 0
    const desviacion_pp = (programado - ejecutado) * 100
    return { codigo, programado, ejecutado, desviacion_pp, color: colorTecnicoV2(desviacion_pp, umbrales) }
  })
}

export type SemanasValidation = { ok: true } | { ok: false; message: string }

/** V-07: `1 <= semana_inicio <= semana_fin <= duración del proyecto`. */
export function validarSemanas(
  semanaInicio: number,
  semanaFin: number,
  duracionSemanas: number,
): SemanasValidation {
  if (!Number.isInteger(semanaInicio) || !Number.isInteger(semanaFin)) {
    return { ok: false, message: "Las semanas deben ser números enteros." }
  }
  if (semanaInicio < 1) {
    return { ok: false, message: "La semana inicial debe ser al menos 1." }
  }
  if (semanaFin < semanaInicio) {
    return { ok: false, message: "La semana final no puede ser anterior a la inicial." }
  }
  if (semanaFin > duracionSemanas) {
    return {
      ok: false,
      message: `La semana final no puede superar la duración del proyecto (${duracionSemanas} semanas).`,
    }
  }
  return { ok: true }
}

export type ActividadRow = {
  id: string
  proyecto_id: string
  objetivo_id: string
  codigo: string
  nombre: string
  semana_inicio: number
  semana_fin: number
  peso: NumericLike
  peso_manual: boolean
  responsable_id: string | null
  created_at: Date
  updated_at: Date
}

export type ActividadV2View = {
  id: string
  proyecto_id: string
  objetivo_id: string
  codigo: string
  nombre: string
  semana_inicio: number
  semana_fin: number
  /** Derived: start of `semana_inicio` from the project start; null without project dates. */
  fecha_inicio: IsoDate | null
  /** Derived: end of `semana_fin`; not clamped to the project end (A-03). */
  fecha_fin: IsoDate | null
  peso: number
  peso_manual: boolean
  responsable_id: string | null
  /** True when the weeks exceed the project's current duration (it shrank after the activity was placed). */
  fuera_de_duracion: boolean
  created_at: string
  updated_at: string
}

/** `@db.Date` columns read back as UTC midnight: the calendar day is its ISO prefix. */
function isoDay(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

export function toActividadV2View(
  row: ActividadRow,
  proyecto: { fecha_inicio: Date | null; fecha_fin: Date | null },
): ActividadV2View {
  const tieneFechas = proyecto.fecha_inicio !== null && proyecto.fecha_fin !== null
  const dates = proyecto.fecha_inicio
    ? activityDates(isoDay(proyecto.fecha_inicio), row.semana_inicio, row.semana_fin)
    : null
  const duracion = tieneFechas
    ? durationWeeks(isoDay(proyecto.fecha_inicio!), isoDay(proyecto.fecha_fin!))
    : null

  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    objetivo_id: row.objetivo_id,
    codigo: row.codigo,
    nombre: row.nombre,
    semana_inicio: row.semana_inicio,
    semana_fin: row.semana_fin,
    fecha_inicio: dates?.inicio ?? null,
    fecha_fin: dates?.fin ?? null,
    peso: pesoEfectivo(row),
    peso_manual: row.peso_manual,
    responsable_id: row.responsable_id,
    fuera_de_duracion: duracion !== null && row.semana_fin > duracion,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}
