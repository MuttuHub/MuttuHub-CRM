// Barra de las vistas de impresión (S4): las vistas se abren en la misma pestaña, así que cada una ofrece
// «Volver» (historial del navegador, o una ruta de respaldo si se abrió directo) junto a «Imprimir».
// Se prueba el componente compartido y que cada vista de /print lo muestre con su ruta de respaldo.

import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PrintToolbar } from "./print-toolbar"
import { PrintFicha } from "@/components/crm/print-ficha"
import { PrintClientes } from "@/components/crm/print-list"
import { PrintDashboardCara } from "@/components/dashboard/print-dashboard"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

// Las vistas se quedan en "cargando": la barra se pinta igual y así no se dispara la auto-impresión.
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(() => new Promise(() => {})),
}))

describe("PrintToolbar", () => {
  const printMock = vi.fn()

  beforeEach(() => {
    printMock.mockReset()
    vi.stubGlobal("print", printMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shows Volver next to Imprimir, inside a bar hidden on paper, with no new tab", async () => {
    const user = userEvent.setup()
    render(<PrintToolbar description="Vista de impresión." fallbackHref="/clientes" />)

    const volver = screen.getByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/clientes")
    expect(volver).not.toHaveAttribute("target")
    expect(screen.getByText("Vista de impresión.")).toBeInTheDocument()

    const imprimir = screen.getByRole("button", { name: "Imprimir" })
    await user.click(imprimir)
    expect(printMock).toHaveBeenCalledTimes(1)
    expect(imprimir.closest("[data-testid='imprimir-barra']")).toHaveClass("print-hide")
    expect(volver.closest("[data-testid='imprimir-barra']")).toHaveClass("print-hide")
  })

  // Lee si el clic llegó al documento ya prevenido por «Volver» y lo previene después, para que jsdom no
  // intente navegar.
  function clicEnVolver(): boolean {
    let prevenido = false
    document.addEventListener(
      "click",
      (e) => {
        prevenido = e.defaultPrevented
        e.preventDefault()
      },
      { once: true },
    )
    fireEvent.click(screen.getByRole("link", { name: "Volver" }))
    return prevenido
  }

  it("goes back in the browser history when there is a previous page", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(3)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    render(<PrintToolbar description="x" fallbackHref="/clientes" />)

    expect(clicEnVolver()).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it("follows the fallback route when the view was opened directly (no history)", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(1)
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    render(<PrintToolbar description="x" fallbackHref="/clientes" />)

    // Sin historial el clic no se intercepta: el enlace lleva a su href (la ruta de respaldo).
    expect(clicEnVolver()).toBe(false)
    expect(back).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/clientes")
  })

  it("accepts a custom print label", () => {
    render(<PrintToolbar description="x" fallbackHref="/" printLabel="Imprimir / Guardar PDF" />)
    expect(screen.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeInTheDocument()
  })
})

describe("vistas de /print con «Volver» (S4)", () => {
  it.each([
    ["la ficha de un cliente", () => <PrintFicha clientId="c1" />, "/clientes?cliente=c1"],
    ["el listado de clientes", () => <PrintClientes />, "/clientes"],
    ["una cara del dashboard", () => <PrintDashboardCara cara="pipeline" />, "/"],
  ] as const)("%s muestra Volver con su ruta de respaldo e Imprimir", (_vista, vista, respaldo) => {
    render(vista())

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", respaldo)
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument()
  })
})
