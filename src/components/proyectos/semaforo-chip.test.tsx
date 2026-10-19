import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SemaforoChip } from "./semaforo-chip"

describe("SemaforoChip", () => {
  it.each([
    ["verde", "Verde", "exito"],
    ["amarillo", "Amarillo", "alerta"],
    ["rojo", "Rojo", "destructivo"],
  ] as const)("%s renders the colour word and the %s tone", (color, word, tone) => {
    render(<SemaforoChip color={color} />)
    const chip = screen.getByText(word).closest("[data-slot='status-chip']")
    expect(chip).not.toBeNull()
    expect(chip).toHaveAttribute("data-tone", tone)
    expect(chip).toHaveAttribute("data-color", color)
  })

  it("never relies on colour alone: the text always carries the colour word", () => {
    render(<SemaforoChip color="rojo" prefix="Semáforo técnico" />)
    expect(screen.getByText("Semáforo técnico: Rojo")).toBeInTheDocument()
  })

  it("forwards a test id and className", () => {
    render(<SemaforoChip color="verde" data-testid="x" className="ml-2" />)
    expect(screen.getByTestId("x")).toHaveClass("ml-2")
    expect(screen.getByTestId("x")).toHaveAttribute("data-color", "verde")
  })
})
