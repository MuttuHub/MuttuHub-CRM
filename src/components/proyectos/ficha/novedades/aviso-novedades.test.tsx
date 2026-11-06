// Aviso «Novedades» del Resumen (rediseño S2): franja informativa con el texto largo en escritorio y el corto en
// el teléfono, el enlace «Ver qué cambió» a la página de Novedades y un ✕ que lo cierra, recuerda el cierre en
// este navegador para esta novedad y devuelve el foco al título de la ficha.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AvisoNovedades, NOVEDAD_ACTUAL } from "./aviso-novedades"

const LARGO =
  "Desde el 05 de nov cualquier integrante del equipo puede registrar avance, el historial muestra quién lo hizo y Finanzas habla en «% de lo programado»."
const CORTO = "Cualquier integrante del equipo ya puede registrar avance."

function renderAviso() {
  return render(
    <>
      <h1 id="ficha-titulo" tabIndex={-1}>
        Demo
      </h1>
      <AvisoNovedades proyectoId="p 1" />
    </>,
  )
}

describe("AvisoNovedades", () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it("announces the news with the long text on desktop and the short one on a phone", () => {
    renderAviso()

    const aviso = screen.getByRole("status")
    expect(aviso).toHaveTextContent("Novedades")
    const largo = within(aviso).getByText(LARGO)
    const corto = within(aviso).getByText(CORTO)
    expect(largo.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(largo.className).toMatch(/(^|\s)sm:inline(\s|$)/)
    expect(corto.className).toMatch(/(^|\s)sm:hidden(\s|$)/)
  })

  it("links to the Novedades page, remembering the project to come back to", () => {
    renderAviso()

    const enlace = screen.getByRole("link", { name: "Ver qué cambió" })
    expect(enlace).toHaveAttribute("href", "/proyectos/novedades?desde=p%201")
    expect(enlace.className).toMatch(/(^|\s)min-h-11(\s|$)/)
  })

  it("closes with the ✕, moves the focus to the ficha title and stays closed for this news", async () => {
    const user = userEvent.setup()
    const primero = renderAviso()

    const cerrar = screen.getByRole("button", { name: "Cerrar aviso de novedades" })
    expect(cerrar.className).toMatch(/(^|\s)size-11(\s|$)/)
    await user.click(cerrar)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Demo" })).toHaveFocus()
    expect(window.localStorage.getItem("muttu.proyectos.novedades.cerrada")).toBe(NOVEDAD_ACTUAL.id)
    primero.unmount()

    renderAviso()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("closes with the keyboard", async () => {
    const user = userEvent.setup()
    renderAviso()

    screen.getByRole("button", { name: "Cerrar aviso de novedades" }).focus()
    await user.keyboard("{Enter}")

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows again for a newer news than the one closed", () => {
    window.localStorage.setItem("muttu.proyectos.novedades.cerrada", "2026-01-01")

    renderAviso()

    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("still closes when the browser blocks the storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const user = userEvent.setup()
    renderAviso()

    await user.click(screen.getByRole("button", { name: "Cerrar aviso de novedades" }))

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
