// Resumen compacto del libro de Gastos: una sola línea con los conteos del servidor (`totales` y
// `resumen`); el cliente no recalcula nada. Los segmentos en cero se ocultan, salvo el total.

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectExpenses } from "@/hooks/projects"
import { GastosResumen } from "./gastos-kpis"

const DATOS: ProjectExpenses = {
  gastos: [],
  totales: {
    REGISTRADO: { cantidad: 3, valor: "12150000.00" },
    VALIDADO: { cantidad: 8, valor: "20500000.00" },
    RECHAZADO: { cantidad: 1, valor: "900000.00" },
    ANULADO: { cantidad: 1, valor: "300000.00" },
  },
  resumen: { vigentes: 12, con_soporte: 10, observados: { cantidad: 1, valor: "450000.00" } },
}

const linea = () => screen.getByTestId("gastos-resumen").textContent

describe("GastosResumen", () => {
  it("shows total, validated, pending, pending-review and with-support counts in one line", () => {
    render(<GastosResumen data={DATOS} />)
    expect(linea()).toBe("12 gastos · 8 validados · 3 por validar · 1 pendiente por revisión · 10 con soporte")
  })

  it("pluralizes pending review and singularizes a single validated expense", () => {
    render(
      <GastosResumen
        data={{
          ...DATOS,
          totales: { ...DATOS.totales, VALIDADO: { cantidad: 1, valor: "1.00" } },
          resumen: { vigentes: 1, con_soporte: 1, observados: { cantidad: 2, valor: "1.00" } },
        }}
      />,
    )
    expect(linea()).toBe("1 gasto · 1 validado · 3 por validar · 2 pendientes por revisión · 1 con soporte")
  })

  it("hides the zero segments but keeps the total", () => {
    render(
      <GastosResumen
        data={{
          ...DATOS,
          totales: { ...DATOS.totales, REGISTRADO: { cantidad: 0, valor: "0.00" } },
          resumen: { vigentes: 8, con_soporte: 0, observados: { cantidad: 0, valor: "0.00" } },
        }}
      />,
    )
    expect(linea()).toBe("8 gastos · 8 validados")
  })

  it("does not invent a support count when the server omits it (no access to supports, RNF-03)", () => {
    render(<GastosResumen data={{ ...DATOS, resumen: { vigentes: 12, observados: DATOS.resumen.observados } }} />)
    expect(linea()).toBe("12 gastos · 8 validados · 3 por validar · 1 pendiente por revisión")
    expect(linea()).not.toMatch(/soporte/)
  })

  it("shows only the total for a project without expenses", () => {
    const vacio: ProjectExpenses = {
      gastos: [],
      totales: Object.fromEntries(
        ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((e) => [e, { cantidad: 0, valor: "0.00" }]),
      ) as ProjectExpenses["totales"],
      resumen: { vigentes: 0, con_soporte: 0, observados: { cantidad: 0, valor: "0.00" } },
    }
    render(<GastosResumen data={vacio} />)
    expect(linea()).toBe("0 gastos")
  })

  it("tolerates a response without totales or resumen (older API): zeros, never an error", () => {
    render(<GastosResumen data={{ gastos: [] } as unknown as ProjectExpenses} />)
    expect(linea()).toBe("0 gastos")
  })
})
