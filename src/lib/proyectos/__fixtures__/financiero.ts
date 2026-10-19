/**
 * Golden fixture F-F1 for the financial ficha (S5). Project 2026-10-05 -> 2027-01-29
 * (periods 2026-10..2027-01), tolerance 1000 bp, corte 2026-11. Plain data, no DB.
 * Amounts go through `toCents`, never bigint literals (tsconfig target ES2017).
 *
 *  R01 Personal   A 59.500.000, P 14.875.000 x4, E validated 12.000.000 (10) + 15.000.000 (11)
 *  R12 Transporte A 24.000.000, P 6.000.000 x4,  E validated 7.000.000 (10) + 6.500.000 (11)
 *  Noise that must NOT move E: REGISTRADO 5.000.000 (R01, 11), RECHAZADO 800.000 (R12, 10),
 *  VALIDADO 3.000.000 (R01, 12: after the corte).
 */
import { toCents } from "../money"
import type { FichaRubroInput } from "../ficha-financiera"

export const F_F1_INICIO = "2026-10-05"
export const F_F1_FIN = "2027-01-29"
export const F_F1_PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"]
export const F_F1_CORTE = "2026-11"
export const F_F1_TOLERANCIA_BP = BigInt(1000)

function cells(valor: string) {
  return F_F1_PERIODOS.map((periodo) => ({ periodo, valor: toCents(valor) }))
}

export function fixtureF_F1(): FichaRubroInput[] {
  return [
    {
      rubroId: "r01",
      codigo: "R01",
      nombre: "Personal",
      asignado: toCents("59500000"),
      programacion: cells("14875000"),
      gastos: [
        { periodo: "2026-10", valor: toCents("12000000"), estado: "VALIDADO" },
        { periodo: "2026-11", valor: toCents("15000000"), estado: "VALIDADO" },
        { periodo: "2026-11", valor: toCents("5000000"), estado: "REGISTRADO" },
        { periodo: "2026-12", valor: toCents("3000000"), estado: "VALIDADO" },
      ],
    },
    {
      rubroId: "r12",
      codigo: "R12",
      nombre: "Transporte",
      asignado: toCents("24000000"),
      programacion: cells("6000000"),
      gastos: [
        { periodo: "2026-10", valor: toCents("7000000"), estado: "VALIDADO" },
        { periodo: "2026-11", valor: toCents("6500000"), estado: "VALIDADO" },
        { periodo: "2026-10", valor: toCents("800000"), estado: "RECHAZADO" },
      ],
    },
  ]
}
