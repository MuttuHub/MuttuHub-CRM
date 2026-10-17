/**
 * The validate-only preview of a PO budget import: each rubro's current and new
 * assigned amount and the new sum against `valor_total`. Pure.
 *
 * The import replaces the budget of every ACTIVE rubro, like the manual edit
 * (`PUT /budget` covers every active rubro): an active rubro missing from the
 * file goes to $0. A suspended rubro that still holds a line is never in the
 * file (only active rubros match), so it keeps its amount and keeps counting in
 * the sum, as in the budget view.
 */
import type { BudgetView } from "@/lib/api/presupuesto"
import { fromCents, sumCents, toCents, type Cents } from "../money"

export type FilaVistaPrevia = {
  rubro_id: string
  codigo: string | null
  nombre: string
  actual: string
  nuevo: string
  /** nuevo − actual. */
  diferencia: string
  /** False for an active rubro the file did not list (it goes to $0) and for a suspended one (unchanged). */
  en_archivo: boolean
}

export type VistaPreviaPresupuesto = {
  rubros: FilaVistaPrevia[]
  suma_actual: string
  suma_nueva: string
  valor_total: string | null
  /** suma_nueva − valor_total; null while the project has no valor_total. */
  diferencia: string | null
  /** Rubros whose amount changes. */
  cambios: number
}

const ZERO = toCents("0")

export function construirVistaPrevia(view: BudgetView, montos: ReadonlyMap<string, Cents>): VistaPreviaPresupuesto {
  const rubros = view.rubros.map((r): FilaVistaPrevia => {
    const actual = toCents(r.asignado)
    const enArchivo = r.activo && montos.has(r.rubro_id)
    const nuevo = r.activo ? (montos.get(r.rubro_id) ?? ZERO) : actual
    return {
      rubro_id: r.rubro_id,
      codigo: r.codigo,
      nombre: r.nombre,
      actual: fromCents(actual),
      nuevo: fromCents(nuevo),
      diferencia: fromCents(nuevo - actual),
      en_archivo: enArchivo,
    }
  })

  const sumaNueva = sumCents(rubros.map((r) => toCents(r.nuevo)))
  const total = view.valor_total === null ? null : toCents(view.valor_total)
  return {
    rubros,
    suma_actual: view.suma,
    suma_nueva: fromCents(sumaNueva),
    valor_total: view.valor_total,
    diferencia: total === null ? null : fromCents(sumaNueva - total),
    cambios: rubros.filter((r) => r.nuevo !== r.actual).length,
  }
}
