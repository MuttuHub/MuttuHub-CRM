// Reportes › caras del dashboard (S4): «Generar reporte» abre la vista de impresión en la misma pestaña (la
// vista trae su propio «Volver»), con los filtros de la cara en la URL.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ReportesPage } from "./reportes-page"

vi.mock("@/hooks/crm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/crm")>()),
  useUsers: () => ({ data: [], isLoading: false }),
}))
vi.mock("@/components/kanban/report-view", () => ({ ReportView: () => null }))
vi.mock("@/components/dashboard/cara-pipeline", () => ({ CaraPipeline: () => null }))
vi.mock("@/components/dashboard/cara-tasks", () => ({ CaraTareas: () => null }))
vi.mock("@/components/dashboard/cara-clients-activity", () => ({ CaraClientesActividad: () => null }))
vi.mock("@/components/dashboard/cara-my-summary", () => ({ CaraMiResumen: () => null }))
vi.mock("@/hooks/reportes", async (importOriginal) => {
  const { REPORTE_SEMANAL } = await import("./reporte-semanal.fixture")
  return {
    ...(await importOriginal<typeof import("@/hooks/reportes")>()),
    useReporteSemanal: () => ({ data: REPORTE_SEMANAL, isLoading: false, isError: false, error: null }),
  }
})

describe("ReportesPage", () => {
  it("opens the printable report of a cara in the same tab (S4)", async () => {
    const user = userEvent.setup()
    render(<ReportesPage />)

    await user.click(screen.getByRole("tab", { name: "Pipeline comercial" }))
    const generar = await screen.findByRole("link", { name: "Generar reporte" })

    expect(generar.getAttribute("href")).toMatch(/^\/print\/dashboard\/pipeline(\?|$)/)
    expect(generar).not.toHaveAttribute("target")
  })

  it("has a Semanal tab whose printable report opens in the same tab (S5)", async () => {
    const user = userEvent.setup()
    render(<ReportesPage />)

    await user.click(screen.getByRole("tab", { name: "Semanal" }))
    const generar = await screen.findByRole("link", { name: "Generar reporte" })

    expect(generar).toHaveAttribute("href", "/print/reportes/semanal?semana=2026-10-19")
    expect(generar).not.toHaveAttribute("target")
    expect(screen.getByRole("region", { name: "Portafolio por proyecto" })).toBeInTheDocument()
  })
})
