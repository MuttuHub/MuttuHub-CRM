// Reportes › caras del dashboard (S4): «Generar reporte» abre la vista de impresión en la misma pestaña (la
// vista trae su propio «Volver»), con los filtros de la cara en la URL.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportesPage } from "./reportes-page"

const searchParams = { current: new URLSearchParams("") }
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.current }))
afterEach(() => {
  searchParams.current = new URLSearchParams("")
})

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
  const { REPORTE_PROYECTO } = await import("./reporte-proyecto.fixture")
  return {
    ...(await importOriginal<typeof import("@/hooks/reportes")>()),
    useReporteSemanal: () => ({ data: REPORTE_SEMANAL, isLoading: false, isError: false, error: null }),
    useReporteEtiqueta: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
    useReporteProyecto: (proyectoId: string) =>
      proyectoId
        ? { data: REPORTE_PROYECTO, isLoading: false, isError: false, error: null }
        : { data: undefined, isLoading: false, isError: false, error: null },
  }
})
vi.mock("@/hooks/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/projects")>()),
  useProjects: () => ({ data: { proyectos: [{ id: "p1", codigo: "PRY-0007", nombre: "Moda circular" }] }, isLoading: false }),
}))
vi.mock("@/hooks/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/admin")>()),
  useTaskTags: () => ({ data: ["Comercial"] }),
}))

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

  it("adds an Etiqueta tab next to Tareas and Semanal and keeps the other tabs (S7)", async () => {
    const user = userEvent.setup()
    render(<ReportesPage />)

    const tabs = screen.getAllByRole("tab").map((t) => t.textContent)
    expect(tabs).toEqual([
      "Tareas",
      "Semanal",
      "Etiqueta",
      "Proyecto",
      "Pipeline comercial",
      "Gestión de tareas",
      "Actividad de clientes",
      "Mi resumen",
    ])

    await user.click(screen.getByRole("tab", { name: "Etiqueta" }))
    expect(await screen.findByText("Elige una etiqueta para ver su reporte.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Etiqueta" })).toBeInTheDocument()
  })

  it("adds a Proyecto tab next to Etiqueta that asks for a project (S17)", async () => {
    const user = userEvent.setup()
    render(<ReportesPage />)

    await user.click(screen.getByRole("tab", { name: "Proyecto" }))
    expect(await screen.findByText("Elige un proyecto para ver su reporte.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Proyecto" })).toBeInTheDocument()
  })

  it("opens the Proyecto tab on the project of the deep link (S17, the ficha's «Reporte» button)", () => {
    searchParams.current = new URLSearchParams("tab=proyecto&proyecto=p1")
    render(<ReportesPage />)

    expect(screen.getByRole("tab", { name: "Proyecto" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("region", { name: "Aliados" })).toHaveTextContent("Fundación Telar")
    expect(screen.getByRole("link", { name: "Generar reporte" })).toHaveAttribute("href", "/print/reportes/proyecto?proyecto=p1")
  })

  it("ignores an unknown tab in the URL and opens Tareas", () => {
    searchParams.current = new URLSearchParams("tab=nada")
    render(<ReportesPage />)

    expect(screen.getByRole("tab", { name: "Tareas" })).toHaveAttribute("aria-selected", "true")
  })
})
