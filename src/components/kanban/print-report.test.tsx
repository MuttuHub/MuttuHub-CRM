// Reporte imprimible de tareas (S4, jefe 2.4b): se abre en la misma pestaña desde el tablero y desde Reportes,
// así que su barra es la compartida — «Volver» (historial, o /reportes si se abrió directo) junto a «Imprimir».

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiGet } from "@/lib/api/http"
import type { TaskReportResponse } from "@/hooks/kanban"
import { PrintReportes } from "./print-report"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("rango=week"),
}))

// El reporte se queda en "cargando": la barra se pinta igual y no se dispara la auto-impresión.
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(() => new Promise(() => {})),
}))

describe("PrintReportes", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))
  })

  it("shows the shared toolbar: Volver (fallback /reportes, same tab) next to Imprimir", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    const user = userEvent.setup()
    render(<PrintReportes />)

    const barra = screen.getByTestId("imprimir-barra")
    expect(barra).toHaveClass("print-hide")
    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/reportes")
    expect(volver).not.toHaveAttribute("target")
    expect(barra).toContainElement(volver)
    expect(screen.getAllByRole("link", { name: "Volver" })).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Imprimir" }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it("keeps its content inside the shared print sheet and prints once the report is on screen", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    vi.mocked(apiGet).mockImplementation((url: string) =>
      Promise.resolve(url.startsWith("/api/v1/auth/me") ? { usuario: { id: "u1", nombre: "Ana", rol: "admin" } } : REPORTE),
    )
    render(<PrintReportes />)

    expect(await screen.findByRole("heading", { name: "Reporte de tareas" })).toBeInTheDocument()
    expect(screen.getByText("Tasa de cumplimiento")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Por persona" })).toBeInTheDocument()
    expect(screen.getByText("Laura")).toBeInTheDocument()
    expect(screen.getByText("Período: Última semana")).toBeInTheDocument()

    expect(screen.getByTestId("print-sheet-header")).toHaveTextContent("Interno · Gerencia")
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Muttu Hub · Reporte de tareas")
    await waitFor(() => expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("por Ana"))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })
})

const REPORTE: TaskReportResponse = {
  rango: "week",
  resumen: { total_asignadas: 3, vencidas_activas: 1, completadas: 2, tasa_cumplimiento: 67, a_tiempo: 1, tarde: 1 },
  por_persona: [{ id: "p1", nombre: "Laura", asignadas: 3, en_curso: 1, vencidas: 1, completadas: 2, a_tiempo: 1, tarde: 1 }],
  por_estado: [{ estado: "COMPLETADA", cantidad: 2 }],
  por_cliente: [],
  vencimientos_por_antiguedad: [],
  carga_semanal: [],
  tendencia_cierre: [],
  meta: { criterio_rango: "fecha_entrega" },
}
