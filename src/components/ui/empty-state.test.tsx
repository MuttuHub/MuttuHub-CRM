import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EmptyState } from "./empty-state"

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="Todo al día" description="No hay alertas." />)
    expect(screen.getByText("Todo al día")).toBeInTheDocument()
    expect(screen.getByText("No hay alertas.")).toBeInTheDocument()
  })

  it("renders only the description when no title is given", () => {
    const { container } = render(<EmptyState description="Sin datos" />)
    expect(screen.getByText("Sin datos")).toBeInTheDocument()
    expect(container.querySelector("[data-slot=empty-state-title]")).toBeNull()
  })

  it("renders icon and action slots", () => {
    render(
      <EmptyState
        description="Nada"
        icon={<svg data-testid="ico" />}
        action={<button type="button">Crear</button>}
      />,
    )
    expect(screen.getByTestId("ico")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument()
  })

  it("has a dashed bordered variant", () => {
    const { container } = render(<EmptyState description="x" bordered />)
    expect(container.firstElementChild).toHaveClass("border-dashed", "border-ink-300")
  })

  it("is borderless by default and merges className", () => {
    const { container } = render(<EmptyState description="x" className="custom" />)
    expect(container.firstElementChild).toHaveAttribute("data-slot", "empty-state")
    expect(container.firstElementChild).not.toHaveClass("border-dashed")
    expect(container.firstElementChild).toHaveClass("custom")
  })
})
