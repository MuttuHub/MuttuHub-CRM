import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { KpiTile } from "./kpi-tile"

describe("KpiTile", () => {
  it("renders the eyebrow label and the numeral value", () => {
    render(<KpiTile label="Proyectos activos" value="12" />)
    const label = screen.getByText("Proyectos activos")
    expect(label).toHaveAttribute("data-slot", "eyebrow")
    const value = screen.getByText("12")
    expect(value).toHaveAttribute("data-slot", "kpi-numeral")
  })

  it("renders the optional hint only when provided", () => {
    const { rerender } = render(<KpiTile label="A" value="1" />)
    expect(screen.queryByText("vs. mes anterior")).not.toBeInTheDocument()
    rerender(<KpiTile label="A" value="1" hint="vs. mes anterior" />)
    expect(screen.getByText("vs. mes anterior")).toBeInTheDocument()
  })

  it("carries data-slot and no data-tone by default", () => {
    const { container } = render(<KpiTile label="A" value="1" />)
    const root = container.firstElementChild
    expect(root).toHaveAttribute("data-slot", "kpi-tile")
    expect(root).not.toHaveAttribute("data-tone")
  })

  it("colors the numeral by tone and exposes data-tone", () => {
    const { container } = render(
      <KpiTile label="Riesgo" value="3" tone="destructivo" />
    )
    expect(container.firstElementChild).toHaveAttribute(
      "data-tone",
      "destructivo"
    )
    expect(screen.getByText("3")).toHaveClass("text-destructivo")
  })

  it("merges an extra className", () => {
    const { container } = render(
      <KpiTile label="A" value="1" className="col-span-2" />
    )
    expect(container.firstElementChild).toHaveClass("col-span-2")
  })
})
