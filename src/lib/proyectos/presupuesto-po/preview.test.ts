// @vitest-environment node
// P2 — the validate-only preview: current vs new amount per rubro and the sum
// against valor_total, computed from the budget view and the parsed amounts.
import { describe, expect, it } from "vitest"
import type { BudgetView } from "@/lib/api/presupuesto"
import { toCents } from "../money"
import { construirVistaPrevia } from "./preview"

const fila = (rubro_id: string, codigo: string | null, nombre: string, asignado: string, activo = true) => ({
  rubro_id,
  codigo,
  nombre,
  activo,
  linea_id: asignado === "0.00" ? null : `l-${rubro_id}`,
  asignado,
  heredado_pendiente: !activo,
})

const VIEW: BudgetView = {
  estado: "BORRADOR",
  rubros: [
    fila("r1", "R01", "Personal", "1000.00"),
    fila("r2", "R02", "Consultor", "500.00"),
    fila("r3", "R03", "Subsidio arriendo", "0.00"),
    fila("pop", null, "Material POP", "300.00", false),
  ],
  suma: "1800.00",
  valor_total: "2000.00",
  diferencia: "-200.00",
}

describe("construirVistaPrevia", () => {
  it("compares each rubro's current and new amount; a rubro missing from the file goes to $0", () => {
    const vista = construirVistaPrevia(
      VIEW,
      new Map([
        ["r1", toCents("1200")],
        ["r3", toCents("0")],
      ]),
    )
    expect(vista.rubros).toEqual([
      { rubro_id: "r1", codigo: "R01", nombre: "Personal", actual: "1000.00", nuevo: "1200.00", diferencia: "200.00", en_archivo: true },
      { rubro_id: "r2", codigo: "R02", nombre: "Consultor", actual: "500.00", nuevo: "0.00", diferencia: "-500.00", en_archivo: false },
      { rubro_id: "r3", codigo: "R03", nombre: "Subsidio arriendo", actual: "0.00", nuevo: "0.00", diferencia: "0.00", en_archivo: true },
      { rubro_id: "pop", codigo: null, nombre: "Material POP", actual: "300.00", nuevo: "300.00", diferencia: "0.00", en_archivo: false },
    ])
    expect(vista.cambios).toBe(2)
  })

  it("sums the new budget (a suspended line keeps counting) against valor_total", () => {
    const vista = construirVistaPrevia(VIEW, new Map([["r1", toCents("1700")], ["r2", toCents("0")]]))
    expect(vista.suma_actual).toBe("1800.00")
    expect(vista.suma_nueva).toBe("2000.00")
    expect(vista.valor_total).toBe("2000.00")
    expect(vista.diferencia).toBe("0.00")
  })

  it("has no difference while the project has no valor_total", () => {
    const vista = construirVistaPrevia({ ...VIEW, valor_total: null, diferencia: null }, new Map())
    expect(vista.valor_total).toBeNull()
    expect(vista.diferencia).toBeNull()
  })
})
