/**
 * Pure KPI math for the v2 project dashboards (S9, RF-30, REQ-DSH-01). No DB, no framework.
 *
 * Inputs are plain values already filtered by the loader at the corte (avances and mediciones dated
 * up to it, expenses validated). Percentages are 0..100 with one decimal; money stays bigint cents;
 * `null` means "not measurable" and is never turned into 0. Every KPI block carries the `corte` it
 * was computed at. The semáforo parameters are unconfirmed placeholders until the PO confirms
 * them, so the result exposes `confirmado`.
 */

import {
  acumuladoContable,
  calcularTecnico,
  type ActividadTecnicaInput,
  type EstadoActividad,
} from "./avance"
import { percentTenths, sumCents, type Cents } from "./money"
import {
  alertaRetraso,
  colorFinancieroV2,
  colorTecnicoV2,
  toleranciaBp,
  type ColorSemaforo,
  type ParametrosV2,
} from "./semaforo-v2"
import type { IsoDate } from "./weeks"

export type KpiActividadInput = ActividadTecnicaInput

/** Project states whose KPIs are computed (D5); the rest are listed with null KPIs. */
export const ESTADOS_MEDIBLES = ["EN_EJECUCION", "SUSPENDIDO", "CERRADO"] as const

export type MedicionInput = { fecha: IsoDate; valor: number; anulado: boolean; createdAt?: string }
export type IndicadorKpiInput = { id: string; meta: number; mediciones: MedicionInput[] }

const round1 = (value: number): number => Math.round(value * 10) / 10

/** `numerator / denominator` as a 0..100 percentage with one decimal; denominator 0 yields null. */
function pct(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round1((numerator / denominator) * 100)
}

const tenthsToPct = (tenths: bigint | null): number | null => (tenths === null ? null : Number(tenths) / 10)

// ---------------------------------------------------------------------------
// Schedule compliance
// ---------------------------------------------------------------------------

export type CumplimientoCronograma = {
  corte: IsoDate
  /** Activities whose end date is on or before the corte. */
  vencidas: number
  /** Of those, the ones finished within their dates (FINALIZADA, never _CON_RETRASO). */
  a_tiempo: number
  valor: number | null
}

export function cumplimientoCronograma(
  actividades: readonly { fin: IsoDate; estado: EstadoActividad }[],
  corte: IsoDate,
): CumplimientoCronograma {
  const vencidas = actividades.filter((a) => a.fin <= corte)
  const aTiempo = vencidas.filter((a) => a.estado === "FINALIZADA").length
  return { corte, vencidas: vencidas.length, a_tiempo: aTiempo, valor: pct(aTiempo, vencidas.length) }
}

// ---------------------------------------------------------------------------
// Deliverables achieved
// ---------------------------------------------------------------------------

export type EntregablesLogrados = { corte: IsoDate; programados: number; logrados: number; valor: number | null }

/**
 * Programmed = deliverables of activities due by the corte (D2). Achieved = the counted quantity
 * reaches the goal AND at least one avance has a live support, whatever `avance_requiere_medio` says.
 */
export function entregablesLogrados(
  actividades: readonly KpiActividadInput[],
  corte: IsoDate,
  requiereMedio: boolean,
): EntregablesLogrados {
  const entregables = actividades.filter((a) => a.fin <= corte).flatMap((a) => a.entregables)
  const logrados = entregables.filter(
    (e) =>
      e.meta > 0 &&
      acumuladoContable(e.avances, requiereMedio) >= e.meta &&
      e.avances.some((a) => !a.anulado && a.tieneMedio),
  ).length
  return { corte, programados: entregables.length, logrados, valor: pct(logrados, entregables.length) }
}

// ---------------------------------------------------------------------------
// Indicators (DP-09)
// ---------------------------------------------------------------------------

export type CumplimientoIndicadores = {
  corte: IsoDate
  valor: number | null
  medidos: number
  sin_medir: number
  sin_medir_ids: string[]
}

function ultimaMedicion(mediciones: readonly MedicionInput[], corte: IsoDate): MedicionInput | null {
  const vivas = mediciones
    .filter((m) => !m.anulado && m.fecha <= corte)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
  return vivas.length === 0 ? null : vivas[vivas.length - 1]
}

/** Mean of `min(1, last / meta)` over the measured indicators; the unmeasured are listed apart. */
export function cumplimientoIndicadores(indicadores: readonly IndicadorKpiInput[], corte: IsoDate): CumplimientoIndicadores {
  const ratios: number[] = []
  const sinMedir: string[] = []
  for (const indicador of indicadores) {
    const ultima = indicador.meta > 0 ? ultimaMedicion(indicador.mediciones, corte) : null
    if (ultima === null) sinMedir.push(indicador.id)
    else ratios.push(Math.min(1, ultima.valor / indicador.meta))
  }
  const valor = ratios.length === 0 ? null : round1((ratios.reduce((sum, r) => sum + r, 0) / ratios.length) * 100)
  return { corte, valor, medidos: ratios.length, sin_medir: sinMedir.length, sin_medir_ids: sinMedir }
}

// ---------------------------------------------------------------------------
// Beneficiaries
// ---------------------------------------------------------------------------

export type BeneficiariosVsMeta = { corte: IsoDate; total: number; meta: number | null; valor: number | null }

/** Registered beneficiaries over the project goal; not capped; a null or zero goal yields null. */
export function beneficiariosVsMeta(total: number, meta: number | null, corte: IsoDate): BeneficiariosVsMeta {
  return { corte, total, meta, valor: meta === null || meta <= 0 ? null : pct(total, meta) }
}

// ---------------------------------------------------------------------------
// One project
// ---------------------------------------------------------------------------

export type KpiProyectoInput = {
  corte: IsoDate
  estado: string
  parametros: ParametrosV2
  actividades: readonly KpiActividadInput[]
  indicadores: readonly IndicadorKpiInput[]
  beneficiarios: { total: number; meta: number | null }
  /** Totals of the financial ficha at the corte period (A assigned, P programmed, E validated). */
  financiero: { asignado: Cents; programado: Cents; ejecutado: Cents }
}

export type KpiTecnico = {
  corte: IsoDate
  avance_real: number
  avance_programado: number
  desviacion_pp: number
  color: ColorSemaforo
}

export type KpiFinanciero = {
  corte: IsoDate
  asignado: Cents
  programado: Cents
  ejecutado: Cents
  /** E / A. */
  ea: number | null
  /** E / P. */
  ep: number | null
  color: ColorSemaforo
  alerta_retraso: boolean
}

export type KpisProyecto = {
  corte: IsoDate
  estado: string
  /** False for BORRADOR / PLANIFICACION / CANCELADO: every KPI block is null. */
  medible: boolean
  /** True only when every semáforo parameter was confirmed by the PO. */
  confirmado: boolean
  tecnico: KpiTecnico | null
  cronograma: CumplimientoCronograma | null
  entregables: EntregablesLogrados | null
  indicadores: CumplimientoIndicadores | null
  beneficiarios: BeneficiariosVsMeta | null
  financiero: KpiFinanciero | null
}

export function esMedible(estado: string): boolean {
  return (ESTADOS_MEDIBLES as readonly string[]).includes(estado)
}

/** A project listed with its state but without KPIs (state outside D5, or no dates yet). */
export function kpisNoMedible(corte: IsoDate, estado: string, parametros: ParametrosV2): KpisProyecto {
  return {
    corte,
    estado,
    confirmado: parametrosConfirmados(parametros),
    medible: false,
    tecnico: null,
    cronograma: null,
    entregables: null,
    indicadores: null,
    beneficiarios: null,
    financiero: null,
  }
}

function parametrosConfirmados(p: ParametrosV2): boolean {
  return p.umbral1.confirmado && p.umbral2.confirmado && p.tolerancia.confirmado && p.retraso.confirmado
}

export function kpisProyecto(input: KpiProyectoInput): KpisProyecto {
  const { corte, parametros } = input
  const p = parametros
  if (!esMedible(input.estado)) return kpisNoMedible(corte, input.estado, p)
  const base = { corte, estado: input.estado, confirmado: parametrosConfirmados(p) }

  const requiereMedio = p.avance_requiere_medio.valor
  const resultado = calcularTecnico({ corte, requiereMedio, actividades: [...input.actividades] })
  const color = colorTecnicoV2(resultado.desviacion_pp, { umbral1: p.umbral1.valor, umbral2: p.umbral2.valor })
  const fin = new Map(input.actividades.map((a) => [a.id, a.fin]))

  const { asignado, programado, ejecutado } = input.financiero
  const epTenths = percentTenths(ejecutado, programado)
  return {
    ...base,
    medible: true,
    tecnico: {
      corte,
      avance_real: round1(resultado.avance_real * 100),
      avance_programado: round1(resultado.avance_programado * 100),
      desviacion_pp: round1(resultado.desviacion_pp),
      color,
    },
    cronograma: cumplimientoCronograma(
      resultado.actividades.map((a) => ({ fin: fin.get(a.id) as IsoDate, estado: a.estado })),
      corte,
    ),
    entregables: entregablesLogrados(input.actividades, corte, requiereMedio),
    indicadores: cumplimientoIndicadores(input.indicadores, corte),
    beneficiarios: beneficiariosVsMeta(input.beneficiarios.total, input.beneficiarios.meta, corte),
    financiero: {
      corte,
      asignado,
      programado,
      ejecutado,
      ea: tenthsToPct(percentTenths(ejecutado, asignado)),
      ep: tenthsToPct(epTenths),
      color: colorFinancieroV2({ A: asignado, P: programado, E: ejecutado }, toleranciaBp(p.tolerancia)),
      alerta_retraso: alertaRetraso({ epTenths, colorTecnico: color }, p.retraso.valor),
    },
  }
}

// ---------------------------------------------------------------------------
// Portfolio (A-13)
// ---------------------------------------------------------------------------

export type KpisPortafolio = {
  corte: IsoDate
  tecnico: { proyectos: number; avance_real: number | null; avance_programado: number | null }
  financiero: {
    proyectos: number
    asignado: Cents
    programado: Cents
    ejecutado: Cents
    /** ΣE / ΣA, money-weighted. */
    ea: number | null
    /** ΣE / ΣP, money-weighted. */
    ep: number | null
  }
  por_estado: Record<string, number>
  por_color_tecnico: Record<ColorSemaforo, number>
  por_color_financiero: Record<ColorSemaforo, number>
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : round1(values.reduce((sum, v) => sum + v, 0) / values.length)

/**
 * Financial: ΣE/ΣA and ΣE/ΣP over the projects with financial data (never the mean of ratios).
 * Technical: the simple mean of the measured projects. Non-measured projects only feed `por_estado`.
 */
export function kpisPortafolio(proyectos: readonly KpisProyecto[], corte: IsoDate): KpisPortafolio {
  const tecnicos = proyectos.flatMap((k) => (k.tecnico ? [k.tecnico] : []))
  const financieros = proyectos.flatMap((k) => (k.financiero ? [k.financiero] : []))
  const asignado = sumCents(financieros.map((f) => f.asignado))
  const programado = sumCents(financieros.map((f) => f.programado))
  const ejecutado = sumCents(financieros.map((f) => f.ejecutado))

  const porEstado: Record<string, number> = {}
  for (const k of proyectos) porEstado[k.estado] = (porEstado[k.estado] ?? 0) + 1
  const colores = (items: readonly { color: ColorSemaforo }[]) => {
    const count: Record<ColorSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0 }
    for (const item of items) count[item.color] += 1
    return count
  }

  return {
    corte,
    tecnico: {
      proyectos: tecnicos.length,
      avance_real: mean(tecnicos.map((t) => t.avance_real)),
      avance_programado: mean(tecnicos.map((t) => t.avance_programado)),
    },
    financiero: {
      proyectos: financieros.length,
      asignado,
      programado,
      ejecutado,
      ea: tenthsToPct(percentTenths(ejecutado, asignado)),
      ep: tenthsToPct(percentTenths(ejecutado, programado)),
    },
    por_estado: porEstado,
    por_color_tecnico: colores(tecnicos),
    por_color_financiero: colores(financieros),
  }
}
