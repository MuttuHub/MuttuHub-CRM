/**
 * Multi-month fixture F-C1 for the S-curve (S14 P7). The demo seed only has
 * 2026-10, so the curve needs a richer timeline to be meaningful: a project that
 * runs 2026-08-03 -> 2026-12-31 (periods 2026-08..2026-12) with three activities
 * of different spans and weights, plus one planned/executed series per curve.
 *
 *   A1  weeks 1-8   peso 2   2026-08-03 .. 2026-09-27
 *   A2  weeks 9-18  peso 4   2026-09-28 .. 2026-12-06
 *   A3  weeks 19-22 peso 2   2026-12-07 .. 2027-01-03 (past the project end, A-03)
 *
 * All values are plain: fractions 0..1 at each period's month end, no DB, no money.
 */
import { activityDates } from "../weeks"
import type { Periodo } from "../weeks"

export const F_C1_INICIO = "2026-08-03"
export const F_C1_FIN = "2026-12-31"
export const F_C1_PERIODOS: Periodo[] = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
export const F_C1_CORTE: Periodo = "2026-11"

export type CurvaActividadFixture = { peso: number; inicio: string; fin: string }

export function fixtureF_C1Actividades(): CurvaActividadFixture[] {
  const weeks: [number, number, number][] = [
    [1, 8, 2],
    [9, 18, 4],
    [19, 22, 2],
  ]
  return weeks.map(([semanaInicio, semanaFin, peso]) => ({
    peso,
    ...activityDates(F_C1_INICIO, semanaInicio, semanaFin),
  }))
}

/** Real technical fraction 0..1 at each period's month end (deliberately behind plan). */
export const F_C1_TECNICO_EJECUTADO = [0.05, 0.2, 0.4, 0.65, 0.8]

/** Cumulative programmed fraction of the assigned budget (E/A style) per month. */
export const F_C1_FINANCIERO_PLANEADO = [0.1, 0.3, 0.55, 0.8, 1]
/** Cumulative validated fraction of the assigned budget per month. */
export const F_C1_FINANCIERO_EJECUTADO = [0.08, 0.25, 0.45, 0.6, 0.7]
