import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { UiTone } from "@/lib/catalogs"
import { StatusChip } from "./status-chip"

// v6 "StatusChip" (gap map §3 P-level primitive): dot + tinted text, one
// shared component instead of the per-feature reimplementations (some solid
// fill + white text, which the UIUX spec calls wrong).

const ALL_TONES: UiTone[] = [
  "neutro",
  "activo",
  "info",
  "riesgo",
  "exito",
  "alerta",
  "destructivo",
]

describe("StatusChip", () => {
  it("renders the label text and a leading dot", () => {
    const { container } = render(<StatusChip tone="exito">Ganada</StatusChip>)
    expect(screen.getByText("Ganada")).toBeInTheDocument()
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass(
      "rounded-full",
      "bg-current"
    )
  })

  it("carries data-slot and data-tone", () => {
    render(<StatusChip tone="alerta">En pausa</StatusChip>)
    const chip = screen.getByText("En pausa").closest("span")
    expect(chip).toHaveAttribute("data-slot", "status-chip")
    expect(chip).toHaveAttribute("data-tone", "alerta")
  })

  it("is a TINTED chip, never a solid fill (no white-on-color text)", () => {
    render(<StatusChip tone="destructivo">Perdida</StatusChip>)
    const chip = screen.getByText("Perdida").closest("span")
    expect(chip).toHaveClass("bg-destructivo-bg", "text-destructivo")
    expect(chip).not.toHaveClass("text-white")
  })

  it.each(ALL_TONES)("renders every catalog tone (%s) without throwing", (tone) => {
    const { unmount } = render(<StatusChip tone={tone}>x</StatusChip>)
    expect(screen.getByText("x")).toBeInTheDocument()
    unmount()
  })

  it("merges an extra className", () => {
    render(
      <StatusChip tone="info" className="ml-2">
        Prospecto
      </StatusChip>
    )
    expect(screen.getByText("Prospecto").closest("span")).toHaveClass("ml-2")
  })
})
