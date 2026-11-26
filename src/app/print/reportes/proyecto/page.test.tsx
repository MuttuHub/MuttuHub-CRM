// /print/reportes/proyecto (T9c, S17): the printable project report. It opens in the same tab, so its toolbar
// brings «Volver» (fallback: /reportes) next to «Imprimir».

import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { REPORTE_PROYECTO } from "@/components/reportes/reporte-proyecto.fixture"

const useReporteProyecto = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteProyecto: (proyectoId: string) => useReporteProyecto(proyectoId),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("proyecto=p1") }))

import PrintReporteProyectoPage from "./page"

afterEach(() => vi.clearAllMocks())

describe("/print/reportes/proyecto", () => {
  it("prints the requested project with Volver falling back to Reportes", () => {
    useReporteProyecto.mockReturnValue({ data: REPORTE_PROYECTO, isLoading: false, isError: false, error: null })
    vi.spyOn(window, "print").mockImplementation(() => undefined)
    render(<PrintReporteProyectoPage />)

    expect(useReporteProyecto).toHaveBeenCalledWith("p1")
    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/reportes")
    expect(volver).not.toHaveAttribute("target")
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Reporte de proyecto · PRY-0007 Moda circular" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Aliados" })).toHaveTextContent("Fundación Telar")
  })

  it("explains a failed load instead of printing an empty page", () => {
    useReporteProyecto.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("El proyecto no existe.") })
    render(<PrintReporteProyectoPage />)
    expect(screen.getByRole("alert")).toHaveTextContent("El proyecto no existe.")
  })
})
