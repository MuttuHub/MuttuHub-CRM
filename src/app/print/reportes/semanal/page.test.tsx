// /print/reportes/semanal (S5): la versión imprimible del reporte semanal. Se abre en la misma pestaña (S4),
// así que su barra trae «Volver» (respaldo: /reportes) junto a «Imprimir».

import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { REPORTE_SEMANAL } from "@/components/reportes/reporte-semanal.fixture"

const useReporteSemanal = vi.fn()
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteSemanal: (semana: string | null) => useReporteSemanal(semana),
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("semana=2026-10-19") }))

import PrintReporteSemanalPage from "./page"

afterEach(() => vi.clearAllMocks())

describe("/print/reportes/semanal", () => {
  it("prints the requested week with Volver falling back to Reportes", () => {
    useReporteSemanal.mockReturnValue({ data: REPORTE_SEMANAL, isLoading: false, isError: false, error: null })
    vi.spyOn(window, "print").mockImplementation(() => undefined)
    render(<PrintReporteSemanalPage />)

    expect(useReporteSemanal).toHaveBeenCalledWith("2026-10-19")
    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/reportes")
    expect(volver).not.toHaveAttribute("target")
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Reporte semanal" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Portafolio por proyecto" })).toHaveTextContent("PRY-0001")
  })

  it("explains a failed load instead of printing an empty page", () => {
    useReporteSemanal.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("La semana todavía no empieza.") })
    render(<PrintReporteSemanalPage />)
    expect(screen.getByRole("alert")).toHaveTextContent("La semana todavía no empieza.")
  })
})
