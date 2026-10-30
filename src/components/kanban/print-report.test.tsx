// Reporte imprimible de tareas (S4, jefe 2.4b): se abre en la misma pestaña desde el tablero y desde Reportes,
// así que su barra es la compartida — «Volver» (historial, o /reportes si se abrió directo) junto a «Imprimir».

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
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
})
