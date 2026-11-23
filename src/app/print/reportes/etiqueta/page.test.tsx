// /print/reportes/etiqueta (T3, S6): the printable tag report. It opens in the same tab, so its toolbar brings
// «Volver» (fallback: /reportes) next to «Imprimir».

import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReporteEtiquetaParams } from "@/hooks/reportes"
import { REPORTE_ETIQUETA } from "@/components/reportes/reporte-etiqueta.fixture"

const useReporteEtiqueta = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteEtiqueta: (params: ReporteEtiquetaParams) => useReporteEtiqueta(params),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("etiqueta=Comercial&hasta=2026-10-31") }))

import PrintReporteEtiquetaPage from "./page"

afterEach(() => vi.clearAllMocks())

describe("/print/reportes/etiqueta", () => {
  it("prints the requested tag with Volver falling back to Reportes", () => {
    useReporteEtiqueta.mockReturnValue({ data: REPORTE_ETIQUETA, isLoading: false, isError: false, error: null })
    vi.spyOn(window, "print").mockImplementation(() => undefined)
    render(<PrintReporteEtiquetaPage />)

    expect(useReporteEtiqueta).toHaveBeenCalledWith({ etiqueta: "Comercial", desde: "", hasta: "2026-10-31" })
    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/reportes")
    expect(volver).not.toHaveAttribute("target")
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Reporte por etiqueta · Comercial" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Proyectos" })).toHaveTextContent("PRY-0001")
  })

  it("explains a failed load instead of printing an empty page", () => {
    useReporteEtiqueta.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("Elige una etiqueta.") })
    render(<PrintReporteEtiquetaPage />)
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una etiqueta.")
  })
})
