import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Label } from "./label"

describe("Label", () => {
  it("renders a label with the slot and htmlFor", () => {
    const { container } = render(<Label htmlFor="campo">Nombre</Label>)
    expect(screen.getByText("Nombre")).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute("data-slot", "label")
    expect(container.firstElementChild).toHaveAttribute("for", "campo")
    expect(container.firstElementChild?.tagName).toBe("LABEL")
  })

  it("merges className", () => {
    const { container } = render(<Label className="sr-only">X</Label>)
    expect(container.firstElementChild).toHaveClass("sr-only")
  })
})