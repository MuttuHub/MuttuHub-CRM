// Printable project report (T9c, S17) inside the shared print sheet: same body as the «Proyecto» tab, plus the
// repeated header/footer; it prints once the data and the fonts are ready.

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { REPORTE_PROYECTO } from "./reporte-proyecto.fixture"
import { PrintReporteProyecto } from "./print-reporte-proyecto"

const useReporteProyecto = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteProyecto: (proyectoId: string) => useReporteProyecto(proyectoId),
}))
const searchParams = { current: new URLSearchParams("proyecto=p1") }
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.current }))
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(() => Promise.resolve({ usuario: { id: "u1", nombre: "Mariana Ortiz", rol: "admin" } })),
}))

describe("PrintReporteProyecto", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useReporteProyecto.mockReset()
    searchParams.current = new URLSearchParams("proyecto=p1")
  })

  it("renders the project report inside the shared sheet and prints it", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteProyecto.mockReturnValue({ data: REPORTE_PROYECTO, isLoading: false, isError: false, error: null })
    render(<PrintReporteProyecto />)

    expect(useReporteProyecto).toHaveBeenCalledWith("p1")
    expect(screen.getByRole("heading", { level: 1, name: "Reporte de proyecto · PRY-0007 Moda circular" })).toBeInTheDocument()
    expect(screen.getByText("Posición propia · 2 aliados · Corte 26 de nov de 2026")).toBeInTheDocument()
    for (const titulo of ["Resumen", "Aliados", "Oportunidades", "Bitácora", "Tareas"]) {
      expect(screen.getByRole("region", { name: titulo })).toBeInTheDocument()
    }
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Muttu Hub · Reporte de proyecto · PRY-0007 Moda circular")
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it("does not print while the report is still loading", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteProyecto.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    render(<PrintReporteProyecto />)

    expect(screen.getByText("Preparando el reporte…")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(print).not.toHaveBeenCalled()
  })

  it("asks for a project when the URL has none", () => {
    searchParams.current = new URLSearchParams("")
    useReporteProyecto.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null })
    render(<PrintReporteProyecto />)
    expect(useReporteProyecto).toHaveBeenCalledWith("")
    expect(screen.getByRole("alert")).toHaveTextContent("Elige un proyecto para ver su reporte.")
  })
})
