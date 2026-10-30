/**
 * Pure activity-state rules shared by the "Requiere atención" list and the Tablero view of the
 * Actividades tab. No DB, no framework. The server colour is never recomputed here (D11): the
 * Tablero only reads it, and the date rule is the same one `atencion.ts` already applies.
 */

import { alcanzaTope } from "./avance"
import type { IsoDate } from "./weeks"

/** Board columns, in the order the Tablero shows them. */
export const COLUMNAS_TABLERO = ["por_iniciar", "en_curso", "atrasada", "terminada"] as const

export type ColumnaTablero = (typeof COLUMNAS_TABLERO)[number]

/** An activity whose last day is on or before the corte and that is not finished is overdue. */
export function vencidaSinTerminar(input: {
  fin: IsoDate
  corte: IsoDate
  terminada: boolean
}): boolean {
  return input.fin <= input.corte && !input.terminada
}

/**
 * Column of one activity on the Tablero. `progreso` is a PERCENTAGE 0..100 (the shape
 * `technical-status` returns, not the 0..1 fraction `calcularTecnico` works with).
 * Terminada wins; then Atrasada (server colour red, or overdue by date and still below the tope — AJ-03: an
 * activity at the tope only waits for soportes); then En curso; else Por iniciar.
 */
export function columnaTablero(input: {
  progreso: number
  color: "verde" | "amarillo" | "rojo" | null
  /** Last day of the activity; null when unknown (then only the server colour can mark it late). */
  fin: IsoDate | null
  corte: IsoDate
  /** `tope_en_curso`, as a PERCENTAGE 0..100 like `progreso`. */
  tope: number
}): ColumnaTablero {
  if (input.progreso >= 100) return "terminada"
  const vencida =
    input.fin !== null &&
    vencidaSinTerminar({ fin: input.fin, corte: input.corte, terminada: alcanzaTope(input.progreso, input.tope) })
  if (input.color === "rojo" || vencida) return "atrasada"
  if (input.progreso > 0) return "en_curso"
  return "por_iniciar"
}
