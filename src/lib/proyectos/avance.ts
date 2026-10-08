/**
 * Pure progress math for the v2 technical execution (S4, RF-12..RF-17).
 * No DB, no framework. Plain numbers: convert Prisma Decimals with
 * `Number(x.toString())` before calling in here.
 *
 * Voided avances never count (REQ-EXE-07); when the project requires a medio
 * (`avance_requiere_medio`), an avance only counts once it has a live medio.
 */

import { toDayNumber, type IsoDate } from "./weeks"

export type AvanceInput = {
  fecha: IsoDate
  cantidad: number
  anulado: boolean
  /** True when the avance has at least one non-deleted medio. */
  tieneMedio: boolean
  /** Tie-break for avances of the same day (ISO timestamp or epoch ms). */
  createdAt?: string | number
}

export type EntregableTecnicoInput = { id: string; meta: number; avances: AvanceInput[] }

export type ActividadTecnicaInput = {
  id: string
  codigo: string
  peso: number
  inicio: IsoDate
  fin: IsoDate
  entregables: EntregableTecnicoInput[]
}

export type EstadoActividad = "NO_INICIADA" | "EN_CURSO" | "FINALIZADA" | "FINALIZADA_CON_RETRASO"
export type Tendencia = "sube" | "baja" | "igual"

function counts(avance: AvanceInput, requiereMedio: boolean): boolean {
  return !avance.anulado && (!requiereMedio || avance.tieneMedio)
}

function timeOf(value: string | number | undefined): number {
  if (value === undefined) return 0
  return typeof value === "number" ? value : Date.parse(value) || 0
}

/** Sum of the quantities that count towards the goal. */
export function acumuladoContable(avances: AvanceInput[], requiereMedio: boolean): number {
  return avances.reduce((sum, a) => (counts(a, requiereMedio) ? sum + a.cantidad : sum), 0)
}

/** Date of the avance (ordered by fecha, then creation) where the running counted sum first reaches the goal. */
export function fechaCumplimiento(
  avances: AvanceInput[],
  meta: number,
  requiereMedio: boolean,
): IsoDate | null {
  if (meta <= 0) return null
  const ordered = avances
    .filter((a) => counts(a, requiereMedio))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || timeOf(a.createdAt) - timeOf(b.createdAt))
  let running = 0
  for (const a of ordered) {
    running += a.cantidad
    if (running >= meta) return a.fecha
  }
  return null
}

/** `min(1, acumulado / meta)`; a non-positive goal yields 0. */
export function avanceEntregable(acumulado: number, meta: number): number {
  if (meta <= 0) return 0
  return Math.min(1, acumulado / meta)
}

/** Mean of the deliverable progresses; an activity without deliverables is 0. */
export function avanceActividad(progresos: number[]): number {
  if (progresos.length === 0) return 0
  return progresos.reduce((sum, p) => sum + p, 0) / progresos.length
}

/** Weighted mean of the activity progresses; zero total weight yields 0. */
export function avanceReal(actividades: { peso: number; progreso: number }[]): number {
  const total = actividades.reduce((sum, a) => sum + a.peso, 0)
  if (total <= 0) return 0
  return actividades.reduce((sum, a) => sum + a.peso * a.progreso, 0) / total
}

/** Elapsed fraction of `inicio..fin` at `corte`, both ends inclusive, clamped to [0, 1]. */
export function fraccionTiempo(corte: IsoDate, inicio: IsoDate, fin: IsoDate): number {
  const total = toDayNumber(fin) - toDayNumber(inicio) + 1
  if (total <= 0) return 0
  const elapsed = toDayNumber(corte) - toDayNumber(inicio) + 1
  return Math.min(1, Math.max(0, elapsed / total))
}

/** Weighted mean of the elapsed fractions; zero total weight yields 0. */
export function avanceProgramado(
  actividades: { peso: number; inicio: IsoDate; fin: IsoDate }[],
  corte: IsoDate,
): number {
  const total = actividades.reduce((sum, a) => sum + a.peso, 0)
  if (total <= 0) return 0
  return (
    actividades.reduce((sum, a) => sum + a.peso * fraccionTiempo(corte, a.inicio, a.fin), 0) / total
  )
}

/** Percentage points the project is behind schedule (negative when ahead). */
export function desviacionPp(programado: number, real: number): number {
  return (programado - real) * 100
}

export function estadoActividad(input: {
  progreso: number
  inicio: IsoDate
  fin: IsoDate
  corte: IsoDate
  fechaCumplimiento: IsoDate | null
}): EstadoActividad {
  if (input.progreso >= 1) {
    const late = input.fechaCumplimiento !== null && input.fechaCumplimiento > input.fin
    return late ? "FINALIZADA_CON_RETRASO" : "FINALIZADA"
  }
  if (input.progreso > 0 || input.corte >= input.inicio) return "EN_CURSO"
  return "NO_INICIADA"
}

/** Trend of the last measurement against the previous one; null without both. */
export function tendencia(ultima: number | null, previa: number | null): Tendencia | null {
  if (ultima === null || previa === null) return null
  if (ultima > previa) return "sube"
  if (ultima < previa) return "baja"
  return "igual"
}

export type ActividadTecnicaResultado = {
  id: string
  codigo: string
  peso: number
  progreso: number
  estado: EstadoActividad
  /** Date the last deliverable reached its goal; null while any is open (or there are none). */
  fecha_cumplimiento: IsoDate | null
}

/** Composes the whole technical read: real, programmed, deviation and per-activity estado. */
export function calcularTecnico(input: {
  corte: IsoDate
  requiereMedio: boolean
  actividades: ActividadTecnicaInput[]
}): {
  avance_real: number
  avance_programado: number
  desviacion_pp: number
  actividades: ActividadTecnicaResultado[]
} {
  const { corte, requiereMedio } = input
  const actividades = input.actividades.map((a) => {
    const progreso = avanceActividad(
      a.entregables.map((e) => avanceEntregable(acumuladoContable(e.avances, requiereMedio), e.meta)),
    )
    const fechas = a.entregables.map((e) => fechaCumplimiento(e.avances, e.meta, requiereMedio))
    const done = fechas.length > 0 && fechas.every((f) => f !== null)
    const cumplimiento = done ? (fechas as IsoDate[]).reduce((max, f) => (f > max ? f : max)) : null
    return {
      id: a.id,
      codigo: a.codigo,
      peso: a.peso,
      progreso,
      estado: estadoActividad({ progreso, inicio: a.inicio, fin: a.fin, corte, fechaCumplimiento: cumplimiento }),
      fecha_cumplimiento: cumplimiento,
    }
  })

  const real = avanceReal(actividades)
  const programado = avanceProgramado(input.actividades, corte)
  return {
    avance_real: real,
    avance_programado: programado,
    desviacion_pp: desviacionPp(programado, real),
    actividades,
  }
}
