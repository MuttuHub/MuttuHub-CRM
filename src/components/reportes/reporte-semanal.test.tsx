// Reportes › Semanal (S5): el reporte para presentar cada semana, con vista de impresión en la misma pestaña y
// exportación a Excel. La pantalla solo pinta lo que calcula el servidor.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { REPORTE_SEMANAL } from "./reporte-semanal.fixture"

const useReporteSemanal = vi.fn()
const downloadReporteSemanal = vi.fn<(semana: string | null) => Promise<void>>(async () => undefined)
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteSemanal: (semana: string | null) => useReporteSemanal(semana),
  downloadReporteSemanal: (semana: string | null) => downloadReporteSemanal(semana),
}))

import { ReporteSemanalTab } from "./reporte-semanal"

beforeEach(() => {
  useReporteSemanal.mockReturnValue({ data: REPORTE_SEMANAL, isLoading: false, isError: false, error: null })
})
afterEach(() => vi.clearAllMocks())

describe("ReporteSemanalTab", () => {
  it("renders every section of the week from the server data", () => {
    render(<ReporteSemanalTab />)

    expect(screen.getByText("Semana del 19 de oct de 2026 al 25 de oct de 2026")).toBeInTheDocument()

    const proyectos = screen.getByRole("region", { name: "Portafolio por proyecto" })
    const fila = within(proyectos).getByRole("row", { name: /PRY-0001/ })
    expect(within(fila).getByText("Verde")).toBeInTheDocument()
    expect(within(fila).getByText("Rojo")).toBeInTheDocument()
    expect(within(fila).getByText("42,5 %")).toBeInTheDocument()
    expect(within(fila).getByText(/1\.000\.000/)).toBeInTheDocument()
    expect(within(fila).getByText(/120\.000/)).toBeInTheDocument()

    const clientes = screen.getByRole("region", { name: "Portafolio por cliente" })
    expect(within(clientes).getByRole("row", { name: /Acme/ })).toHaveTextContent(/500\.000/)

    const actividades = screen.getByRole("region", { name: "Actividades atrasadas" })
    expect(within(actividades).getByText("A1 Diagnóstico: vencida el 20 oct 2026 con avance 40 %.")).toBeInTheDocument()

    const atencion = screen.getByRole("region", { name: "Requiere atención" })
    expect(within(atencion).getByText("R01 Personal: ejecutado supera lo asignado.")).toBeInTheDocument()

    const gastos = screen.getByRole("region", { name: "Gastos por validar" })
    expect(within(gastos).getByRole("row", { name: /PRY-0001/ })).toHaveTextContent(/300\.000/)
  })

  it("compares closed and overdue tasks with the previous week", () => {
    render(<ReporteSemanalTab />)

    const tareas = screen.getByRole("region", { name: "Tareas: esta semana frente a la anterior" })
    const cerradas = within(tareas).getByRole("row", { name: /Cerradas/ })
    expect(within(cerradas).getAllByRole("cell").map((c) => c.textContent)).toEqual(["5", "3", "+2"])
    const vencidas = within(tareas).getByRole("row", { name: /Vencidas/ })
    expect(within(vencidas).getAllByRole("cell").map((c) => c.textContent)).toEqual(["2", "4", "−2"])
  })

  it("hides the validation queue for a role that does not validate expenses", () => {
    useReporteSemanal.mockReturnValue({
      data: { ...REPORTE_SEMANAL, gastos_por_validar: null },
      isLoading: false,
      isError: false,
      error: null,
    })
    render(<ReporteSemanalTab />)
    expect(screen.queryByRole("region", { name: "Gastos por validar" })).toBeNull()
  })

  it("opens the printable weekly report in the same tab", () => {
    render(<ReporteSemanalTab />)
    const generar = screen.getByRole("link", { name: "Generar reporte" })
    expect(generar).toHaveAttribute("href", "/print/reportes/semanal?semana=2026-10-19")
    expect(generar).not.toHaveAttribute("target")
  })

  it("moves to the previous week and exports that week to Excel", async () => {
    const user = userEvent.setup()
    render(<ReporteSemanalTab />)
    expect(useReporteSemanal).toHaveBeenLastCalledWith(null)

    await user.click(screen.getByRole("button", { name: "Semana anterior" }))
    expect(useReporteSemanal).toHaveBeenLastCalledWith("2026-10-12")

    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(downloadReporteSemanal).toHaveBeenCalledWith("2026-10-12")
  })
})
