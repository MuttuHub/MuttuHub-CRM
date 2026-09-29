import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/crm", () => ({
  iniciales: (nombre: string) => nombre.slice(0, 2).toUpperCase(),
}))

import { InitialsAvatar, PrioridadChip, ResponsableCell } from "./shared"

describe("crm/shared v6 primitives", () => {
  it("InitialsAvatar is 40px with a 12px radius by default", () => {
    render(<InitialsAvatar nombre="Ana Pérez" />)
    const avatar = screen.getByText("AN")
    expect(avatar).toHaveClass("size-10", "rounded-12")
    expect(avatar).not.toHaveClass("size-8")
  })

  it("ResponsableCell keeps a compact avatar inside 44px table rows", () => {
    render(<ResponsableCell nombre="Ana Pérez" />)
    expect(screen.getByText("AN")).toHaveClass("size-8", "rounded-10")
  })

  it("PrioridadChip renders through the shared StatusChip with the priority tone", () => {
    const { container, rerender } = render(<PrioridadChip prioridad="ALTA" />)
    const chip = container.querySelector('[data-slot="status-chip"]')
    expect(chip).toHaveAttribute("data-tone", "destructivo")
    expect(chip).toHaveTextContent("Alta")
    rerender(<PrioridadChip prioridad="MEDIA" />)
    expect(container.querySelector('[data-slot="status-chip"]')).toHaveAttribute("data-tone", "alerta")
    rerender(<PrioridadChip prioridad="BAJA" />)
    expect(container.querySelector('[data-slot="status-chip"]')).toHaveAttribute("data-tone", "info")
  })

  it("PrioridadChip shows an em dash when there is no priority", () => {
    render(<PrioridadChip prioridad={null} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})
