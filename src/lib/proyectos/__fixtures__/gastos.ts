/**
 * Fixtures for the S6 expense rules. Plain data, no DB. Amounts go through `toCents`.
 *
 * Overspend scenario "Transporte": A 24.000.000, validated 23.500.000 (one VALIDADO row), plus noise
 * (REGISTRADO, RECHAZADO, ANULADO) that must never count toward the validated total.
 */
import { toCents } from "../money"
import type { GastoInput } from "../ficha-financiera"

export const TRANSPORTE_ASIGNADO = toCents("24000000")

export function gastosTransporte(): GastoInput[] {
  return [
    { periodo: "2026-10", valor: toCents("23500000"), estado: "VALIDADO" },
    { periodo: "2026-11", valor: toCents("4000000"), estado: "REGISTRADO" },
    { periodo: "2026-11", valor: toCents("900000"), estado: "RECHAZADO" },
    { periodo: "2026-10", valor: toCents("2000000"), estado: "ANULADO" },
  ]
}
