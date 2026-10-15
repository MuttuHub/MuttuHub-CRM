// P3: fila de KPIs del libro de Gastos (v6). Los valores salen de `totales` y `resumen` del servidor; el cliente
// no recalcula nada. Dinero en estilo compacto con el monto exacto en `title`.

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectExpenses } from "@/hooks/projects"
import { GastosKpis } from "./gastos-kpis"

const DATOS: ProjectExpenses = {
  gastos: [],
  totales: {
    REGISTRADO: { cantidad: 3, valor: "12150000.00" },
    VALIDADO: { cantidad: 2, valor: "20500000.00" },
    RECHAZADO: { cantidad: 1, valor: "900000.00" },
    ANULADO: { cantidad: 1, valor: "300000.00" },
  },
  resumen: { vigentes: 5, con_soporte: 4, observados: { cantidad: 2, valor: "450000.00" } },
}

describe("GastosKpis", () => {
  it("shows total, validated, pending, with-support share and pending-review from the server numbers", () => {
    render(<GastosKpis data={DATOS} isLoading={false} isError={false} />)
    const total = screen.getByTestId("gastos-kpi-total")
    expect(total).toHaveTextContent("Total registrado")
    expect(total).toHaveTextContent("$ 32,7 M")
    expect(total).toHaveTextContent("5 gastos vigentes")
    const validados = screen.getByTestId("gastos-kpi-validados")
    expect(validados).toHaveTextContent("$ 20,5 M")
    expect(validados).toHaveTextContent("2 gastos")
    const porValidar = screen.getByTestId("gastos-kpi-por-validar")
    expect(porValidar).toHaveTextContent("Por validar")
    expect(porValidar).toHaveTextContent("$ 12,2 M")
    expect(porValidar).toHaveTextContent("3 gastos")
    const soporte = screen.getByTestId("gastos-kpi-con-soporte")
    expect(soporte).toHaveTextContent("4 de 5")
    const observados = screen.getByTestId("gastos-kpi-observados")
    expect(observados).toHaveTextContent("Pendiente por revisión")
    expect(observados).toHaveTextContent("2")
    expect(observados).toHaveTextContent("$ 450.000")
  })

  it("keeps the exact amount in a title next to the compact one", () => {
    render(<GastosKpis data={DATOS} isLoading={false} isError={false} />)
    const monto = within(screen.getByTestId("gastos-kpi-total")).getByTitle("$ 32.650.000")
    expect(monto).toHaveTextContent("$ 32,7 M")
  })

  it("flags pending-review expenses with the alert tone only when there are some", () => {
    const { rerender } = render(<GastosKpis data={DATOS} isLoading={false} isError={false} />)
    expect(screen.getByTestId("gastos-kpi-observados")).toHaveAttribute("data-tone", "alerta")
    rerender(
      <GastosKpis
        data={{ ...DATOS, resumen: { ...DATOS.resumen, observados: { cantidad: 0, valor: "0.00" } } }}
        isLoading={false}
        isError={false}
      />,
    )
    expect(screen.getByTestId("gastos-kpi-observados")).not.toHaveAttribute("data-tone", "alerta")
  })

  it("does not invent a support share when the server omits it (no access to supports)", () => {
    render(
      <GastosKpis
        data={{ ...DATOS, resumen: { vigentes: 5, observados: DATOS.resumen.observados } }}
        isLoading={false}
        isError={false}
      />,
    )
    const soporte = screen.getByTestId("gastos-kpi-con-soporte")
    expect(soporte).toHaveTextContent("—")
    expect(soporte).toHaveTextContent("Sin acceso a soportes")
  })

  it("shows zeros for a project without expenses", () => {
    const vacio: ProjectExpenses = {
      gastos: [],
      totales: Object.fromEntries(
        ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"].map((e) => [e, { cantidad: 0, valor: "0.00" }]),
      ) as ProjectExpenses["totales"],
      resumen: { vigentes: 0, con_soporte: 0, observados: { cantidad: 0, valor: "0.00" } },
    }
    render(<GastosKpis data={vacio} isLoading={false} isError={false} />)
    expect(screen.getByTestId("gastos-kpi-total")).toHaveTextContent("$ 0")
    expect(screen.getByTestId("gastos-kpi-con-soporte")).toHaveTextContent("0 de 0")
  })

  it("shows skeletons while loading and an inline error on failure", () => {
    const { rerender } = render(<GastosKpis data={undefined} isLoading isError={false} />)
    expect(screen.getByTestId("gastos-kpis-cargando")).toBeInTheDocument()
    rerender(<GastosKpis data={undefined} isLoading={false} isError />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los gastos")
  })
})
