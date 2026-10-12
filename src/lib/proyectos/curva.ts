/**
 * Pure S-curve math for the v2 projects module (S14 P7). No DB, no framework.
 *
 * TWO curves, never mixed: the technical one measures schedule progress (fraction
 * of the weighted plan), the financial one measures spend (fraction of the
 * assigned budget). Both come out as percentages 0..100 with one decimal, so a
 * single chart can plot them on a shared axis without ever blending the two.
 *
 * The planned technical curve is linear by days at month end (D1): the very same
 * `avanceProgramado` formula the semáforo uses, evaluated at the last day of each
 * period. `ejecutado` is null for every period after the corte, so the chart can
 * never draw an execution that has not happened yet.
 */

import { avanceProgramado } from "./avance"
import type { IsoDate, Periodo } from "./weeks"

/** One decimal, half-up: the same rounding the KPI percentages use. */
const round1 = (value: number): number => Math.round(value * 10) / 10

/** Last calendar day of an `"AAAA-MM"` period. */
export function finDeMes(periodo: Periodo): IsoDate {
  const year = Number(periodo.slice(0, 4))
  const month = Number(periodo.slice(5, 7))
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${periodo}-${String(day).padStart(2, "0")}`
}

/**
 * Date a period is measured at: its month end, capped at the corte date so the
 * corte month never measures into the future.
 */
export function fechaMedicion(periodo: Periodo, corte: IsoDate): IsoDate {
  const fin = finDeMes(periodo)
  return fin <= corte ? fin : corte
}

export type TecnicoPlaneadoInput = { peso: number; inicio: IsoDate; fin: IsoDate }

/**
 * Planned technical fraction 0..1 at each period's month end (D1, linear by
 * days): the weighted mean of every activity's elapsed fraction, reused from the
 * technical semáforo so the curve and the KPI cannot drift.
 */
export function tecnicoPlaneado(
  actividades: readonly TecnicoPlaneadoInput[],
  periodos: readonly Periodo[],
): number[] {
  return periodos.map((periodo) => avanceProgramado([...actividades], finDeMes(periodo)))
}

/** Cumulative sum, index-aligned: a monthly series becomes its running total. */
export function acumular(valores: readonly number[]): number[] {
  let running = 0
  return valores.map((valor) => (running += valor))
}

/** Planned and executed fractions 0..1, index-aligned with the project periods. */
export type CurvaSerie = { planeado: readonly number[]; ejecutado: readonly number[] }

export type CurvaPunto = {
  periodo: Periodo
  tecnico: { planeado: number; ejecutado: number | null }
  financiero: { planeado: number; ejecutado: number | null }
}

function pct(fraction: number): number {
  return round1(fraction * 100)
}

/** Every series must line up with the periods; a mismatch is a programming error. */
function validarSeries(periodos: readonly Periodo[], series: readonly (readonly number[])[]): void {
  for (const serie of series) {
    if (serie.length !== periodos.length) {
      throw new RangeError(`La serie (${serie.length}) no coincide con los periodos (${periodos.length}).`)
    }
  }
}

/**
 * Assembles the S-curve rows, one per period in order. The planned lines always
 * paint (the plan reaches every period); the executed lines are null after the
 * corte.
 */
export function construirCurva(input: {
  periodos: readonly Periodo[]
  corte: Periodo
  tecnico: CurvaSerie
  financiero: CurvaSerie
}): CurvaPunto[] {
  const { periodos, corte } = input
  validarSeries(periodos, [
    input.tecnico.planeado,
    input.tecnico.ejecutado,
    input.financiero.planeado,
    input.financiero.ejecutado,
  ])
  return periodos.map((periodo, index) => {
    const yaEjecutado = periodo <= corte
    return {
      periodo,
      tecnico: {
        planeado: pct(input.tecnico.planeado[index]),
        ejecutado: yaEjecutado ? pct(input.tecnico.ejecutado[index]) : null,
      },
      financiero: {
        planeado: pct(input.financiero.planeado[index]),
        ejecutado: yaEjecutado ? pct(input.financiero.ejecutado[index]) : null,
      },
    }
  })
}
