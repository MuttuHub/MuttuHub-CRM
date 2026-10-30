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

/** One non-voided ReporteActividad (AJ-01). */
export type ReporteActividadInput = { fecha: IsoDate; porcentaje: number }

export type ActividadTecnicaInput = {
  id: string
  codigo: string
  peso: number
  inicio: IsoDate
  fin: IsoDate
  entregables: EntregableTecnicoInput[]
  /**
   * Non-voided reports (AJ-01), chronologically sorted by the caller — the last entry is
   * the latest. Kept as the full history (not just the latest) so a later feature (AJ-03)
   * can find when the activity first reached a given percentage without a breaking change
   * here. Omitted or empty means the activity has never had a report (S5.2: every
   * computation below then matches today's behavior byte-for-byte).
   */
  reportes?: ReporteActividadInput[]
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

/**
 * Whether one deliverable is complete: its counted quantity reached the goal AND it has at
 * least one live (non-voided, supported) avance — identical to `kpis.ts`'s
 * `entregablesLogrados` criterion, applied per deliverable instead of aggregated across many
 * so this and that stay consistent.
 */
export function entregableCompleto(entregable: EntregableTecnicoInput, requiereMedio: boolean): boolean {
  return (
    entregable.meta > 0 &&
    acumuladoContable(entregable.avances, requiereMedio) >= entregable.meta &&
    entregable.avances.some((a) => !a.anulado && a.tieneMedio)
  )
}

/**
 * Whether every deliverable of an activity is complete (S8). An activity without
 * deliverables is never complete (mirrors the existing `fecha_cumplimiento` "done" gate).
 */
export function entregablesCompletos(entregables: EntregableTecnicoInput[], requiereMedio: boolean): boolean {
  return entregables.length > 0 && entregables.every((e) => entregableCompleto(e, requiereMedio))
}

/** Float slack so a progress equal to the tope (e.g. 9 of 10 deliverables against 90 %) reaches it. */
const EPSILON_TOPE = 1e-9

/**
 * AJ-03: whether a progress reached the tope (`tope_en_curso`), inclusive. Both in the same unit
 * (0..1 fractions, or 0..100 percentages).
 */
export function alcanzaTope(avance: number, tope: number): boolean {
  return avance + EPSILON_TOPE >= tope
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

/**
 * User-facing deviation: real - plan in percentage points, positive when the project is ahead of the plan.
 * Display only; `desviacionPp` (plan - real) stays the input of the semáforo thresholds.
 */
export function diferenciaRealPlanPp(desviacion: number): number {
  return desviacion === 0 ? 0 : -desviacion
}

export function estadoActividad(input: {
  progreso: number
  inicio: IsoDate
  fin: IsoDate
  corte: IsoDate
  fechaCumplimiento: IsoDate | null
  /** S8: whether the activity has at least one non-voided ReporteActividad (AJ-01). */
  hasReports?: boolean
  /** S8: whether every deliverable of the activity is complete (only read when `hasReports`). */
  entregablesCompletos?: boolean
}): EstadoActividad {
  if (input.hasReports) {
    // Once there is a report, there is no going back to NO_INICIADA (S2/S3): the activity
    // only finishes once every deliverable is actually complete, regardless of the reported
    // percentage — never "stays Sin iniciar" and never finishes on the report alone.
    if (input.entregablesCompletos) {
      const late = input.fechaCumplimiento !== null && input.fechaCumplimiento > input.fin
      return late ? "FINALIZADA_CON_RETRASO" : "FINALIZADA"
    }
    return "EN_CURSO"
  }
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
  /** S8: whether every deliverable of the activity is complete (AJ-01; consumed by AJ-03 later). */
  entregables_completos: boolean
  /**
   * AJ-03: the same progress (decision 1) computed only from the avances and reports dated on or
   * before the activity's fin — what «llegó al tope en su fecha fin» is measured against.
   */
  avance_al_fin: number
}

/**
 * Decision S5.1 progress of one activity: the greater of the last report and the deliverable
 * average; a report-less activity keeps the deliverable average (S5.2). With `hasta`, only the
 * avances and reports dated on or before it count.
 */
function progresoActividad(a: ActividadTecnicaInput, requiereMedio: boolean, hasta?: IsoDate): number {
  const vigente = (fecha: IsoDate) => hasta === undefined || fecha <= hasta
  const progresoEntregables = avanceActividad(
    a.entregables.map((e) =>
      avanceEntregable(acumuladoContable(e.avances.filter((av) => vigente(av.fecha)), requiereMedio), e.meta),
    ),
  )
  const reportes = (a.reportes ?? []).filter((r) => vigente(r.fecha))
  return reportes.length > 0
    ? Math.max(reportes[reportes.length - 1].porcentaje / 100, progresoEntregables)
    : progresoEntregables
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
    const fechas = a.entregables.map((e) => fechaCumplimiento(e.avances, e.meta, requiereMedio))
    const done = fechas.length > 0 && fechas.every((f) => f !== null)
    const cumplimiento = done ? (fechas as IsoDate[]).reduce((max, f) => (f > max ? f : max)) : null

    const completos = entregablesCompletos(a.entregables, requiereMedio)
    const hasReports = (a.reportes ?? []).length > 0
    const progreso = progresoActividad(a, requiereMedio)

    return {
      id: a.id,
      codigo: a.codigo,
      peso: a.peso,
      progreso,
      estado: estadoActividad({
        progreso,
        inicio: a.inicio,
        fin: a.fin,
        corte,
        fechaCumplimiento: cumplimiento,
        hasReports,
        entregablesCompletos: completos,
      }),
      fecha_cumplimiento: cumplimiento,
      entregables_completos: completos,
      avance_al_fin: progresoActividad(a, requiereMedio, a.fin),
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

// ---------------------------------------------------------------------------
// ReporteActividad submission validation (S9.1-S9.4)
// ---------------------------------------------------------------------------

/** Pure check result: `{ ok: true }` or `{ ok: false; message }`. HTTP-shaping (404/403/409) happens one layer up. */
export type ValidacionReporte = { ok: true } | { ok: false; message: string }

/**
 * Pure submission validation for a new ReporteActividad (S9.1-S9.4). Takes already-loaded
 * data: the activity's non-voided reports (chronologically sorted by the caller — the last
 * entry is the latest), its `entregablesCompletos` flag, the `tope_en_curso` value, and the
 * new submission. Checks run in order and stop at the first failure, matching S3's examples:
 *
 *  1. `porcentaje` in `(0, 100]`.
 *  2. `observacion` non-empty after trim.
 *  3. Strictly greater than the latest non-voided report, else the exact message naming it.
 *  4. `porcentaje <= tope` while `entregablesCompletos` is false, else the exact message
 *     naming the tope (this also means 100% is only ever accepted once deliverables are
 *     already complete).
 */
export function validarNuevoReporte(input: {
  porcentaje: number
  observacion: string
  /** Non-voided reports, chronologically sorted; the last entry is the latest. */
  reportes: ReporteActividadInput[]
  entregablesCompletos: boolean
  tope: number
}): ValidacionReporte {
  const { porcentaje, observacion, reportes, entregablesCompletos: completos, tope } = input

  if (!(porcentaje > 0 && porcentaje <= 100)) {
    return { ok: false, message: "El porcentaje debe ser mayor que 0 y menor o igual a 100." }
  }
  if (observacion.trim().length === 0) {
    return { ok: false, message: "La observación es obligatoria." }
  }
  const anterior = reportes.length > 0 ? reportes[reportes.length - 1] : null
  if (anterior !== null && porcentaje <= anterior.porcentaje) {
    return { ok: false, message: `El avance debe ser mayor que el último reportado (${anterior.porcentaje}%).` }
  }
  if (!completos && porcentaje > tope) {
    return { ok: false, message: `El avance máximo sin entregables completos es ${tope}%.` }
  }
  return { ok: true }
}
