// Printable tag report (T3, S6) inside the shared print sheet: same body as the «Etiqueta» tab, plus the repeated
// header/footer; it prints once the data and the fonts are ready.

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReporteEtiquetaParams } from "@/hooks/reportes"
import { REPORTE_ETIQUETA } from "./reporte-etiqueta.fixture"
import { PrintReporteEtiqueta } from "./print-reporte-etiqueta"

const useReporteEtiqueta = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteEtiqueta: (params: ReporteEtiquetaParams) => useReporteEtiqueta(params),
}))
const searchParams = { current: new URLSearchParams("etiqueta=Comercial&desde=2026-10-01&hasta=2026-10-31") }
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.current }))
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(() => Promise.resolve({ usuario: { id: "u1", nombre: "Mariana Ortiz", rol: "admin" } })),
}))

describe("PrintReporteEtiqueta", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useReporteEtiqueta.mockReset()
    searchParams.current = new URLSearchParams("etiqueta=Comercial&desde=2026-10-01&hasta=2026-10-31")
  })

  it("renders the tag report inside the shared sheet and prints it", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteEtiqueta.mockReturnValue({ data: REPORTE_ETIQUETA, isLoading: false, isError: false, error: null })
    render(<PrintReporteEtiqueta />)

    expect(useReporteEtiqueta).toHaveBeenCalledWith({ etiqueta: "Comercial", desde: "2026-10-01", hasta: "2026-10-31" })
    expect(screen.getByRole("heading", { level: 1, name: "Reporte por etiqueta · Comercial" })).toBeInTheDocument()
    expect(screen.getByText("Del 01 de oct de 2026 al 31 de oct de 2026 · Corte 31 de oct de 2026")).toBeInTheDocument()
    expect(screen.getAllByText("Ruta del emprendimiento").length).toBeGreaterThan(0)
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Muttu Hub · Reporte por etiqueta · Comercial")
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it("does not print while the report is still loading", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    useReporteEtiqueta.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    render(<PrintReporteEtiqueta />)

    expect(screen.getByText("Preparando el reporte…")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 300))
    expect(print).not.toHaveBeenCalled()
  })

  it("asks for a tag when the URL has none", () => {
    searchParams.current = new URLSearchParams("")
    useReporteEtiqueta.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null })
    render(<PrintReporteEtiqueta />)
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una etiqueta para ver su reporte.")
  })
})
