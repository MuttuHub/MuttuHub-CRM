// The generic checklist of Proyectos v3: a list of requirements with their state and an optional action.
// Pure presentation — the caller decides which items are done, the wording and what the action does — so
// the same piece serves the baseline checklist (B5) and the closing checklist (B7) without changing.

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ListaVerificacion, type ItemVerificacion } from "./lista-verificacion"

const ITEMS: ItemVerificacion[] = [
  { id: "valor", etiqueta: "Valor total y fechas", listo: true },
  { id: "beneficiarios", etiqueta: "Meta de beneficiarios", detalle: "Hoy está en 0.", listo: false, accion: <button>Corregir aquí</button> },
]

describe("ListaVerificacion", () => {
  it("renders one list item per requirement, with its detail", () => {
    render(<ListaVerificacion items={ITEMS} />)
    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("Valor total y fechas")).toBeInTheDocument()
    expect(screen.getByText("Hoy está en 0.")).toBeInTheDocument()
  })

  it("announces the state in text, not only in colour", () => {
    render(<ListaVerificacion items={ITEMS} />)
    const [listo, pendiente] = screen.getAllByRole("listitem")
    expect(within(listo).getByText("Listo:")).toBeInTheDocument()
    expect(within(pendiente).getByText("Pendiente:")).toBeInTheDocument()
  })

  it("renders the action only where the caller passes one", () => {
    render(<ListaVerificacion items={ITEMS} />)
    const [listo, pendiente] = screen.getAllByRole("listitem")
    expect(within(pendiente).getByRole("button", { name: "Corregir aquí" })).toBeInTheDocument()
    expect(within(listo).queryByRole("button")).not.toBeInTheDocument()
  })

  it("keeps the decorative icon out of the accessibility tree", () => {
    const { container } = render(<ListaVerificacion items={ITEMS} />)
    const icons = container.querySelectorAll("[data-slot='lista-verificacion-icono']")
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true")
  })

  it("paints the state with the semantic tokens that flip in dark mode", () => {
    const { container } = render(<ListaVerificacion items={ITEMS} />)
    const icons = container.querySelectorAll("[data-slot='lista-verificacion-icono']")
    expect(icons[0]).toHaveClass("text-exito")
    expect(icons[1]).toHaveClass("text-alerta")
  })
})
