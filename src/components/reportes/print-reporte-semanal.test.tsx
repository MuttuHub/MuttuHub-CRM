// Printable weekly report (S5) inside the shared print sheet (PR-R2): same body as the «Semanal» tab, plus
// the repeated header/footer; it prints once the data and the fonts are ready.

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { REPORTE_SEMANAL } from "./reporte-semanal.fixture"
import { PrintReporteSemanal } from "./print-reporte-semanal"

const useReporteSemanal = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteSemanal: (semana: string | null) => useReporteSemanal(semana),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("semana=2026-10-19") }))
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(() => Promise.resolve({ usuario: { id: "u1", nombre: "Mariana Ortiz", rol: "admin" } })),
}))

describe("PrintReporteSemanal", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useReporteSemanal.mockReset()
  })

  it("renders the weekly report inside the shared sheet and prints it", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteSemanal.mockReturnValue({ data: REPORTE_SEMANAL, isLoading: false, isError: false, error: null })
    render(<PrintReporteSemanal />)

    expect(screen.getByRole("heading", { name: "Reporte semanal" })).toBeInTheDocument()
    expect(screen.getAllByText("Ruta del emprendimiento").length).toBeGreaterThan(0)
    expect(screen.getByTestId("print-sheet-header")).toHaveTextContent("Interno · Gerencia")
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Muttu Hub · Reporte semanal")
    await waitFor(() => expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("por Mariana Ortiz"))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it("does not print while the report is still loading", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteSemanal.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    render(<PrintReporteSemanal />)

    expect(screen.getByText("Preparando el reporte…")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(print).not.toHaveBeenCalled()
  })
})
