import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  BigValue,
  EmptyBlock,
  InlineError,
  MetricRow,
  MetricTile,
  SectionHeader,
  SELECT_CLASS,
} from "./ui"

describe("proyectos/ui", () => {
  it("SectionHeader renders an eyebrow heading at the requested level with a decorative icon", () => {
    const { container } = render(
      <SectionHeader icon={<svg data-testid="ico" />} as="h4">
        Historial
      </SectionHeader>,
    )
    const heading = screen.getByRole("heading", { level: 4, name: "Historial" })
    expect(heading).toHaveClass("uppercase", "text-ink-500")
    expect(container.querySelector("[data-testid='ico']")).not.toBeNull()
  })

  it("SectionHeader defaults to h3", () => {
    render(<SectionHeader>Equipo</SectionHeader>)
    expect(screen.getByRole("heading", { level: 3, name: "Equipo" })).toBeInTheDocument()
  })

  it("EmptyBlock shows the message", () => {
    render(<EmptyBlock>Sin movimientos registrados.</EmptyBlock>)
    expect(screen.getByText("Sin movimientos registrados.")).toBeInTheDocument()
  })

  it("InlineError renders an alert and nothing without a message", () => {
    const { rerender, container } = render(<InlineError message="Falló" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Falló")
    rerender(<InlineError message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("MetricTile keeps test id and colour, MetricRow and BigValue show label/value", () => {
    render(
      <MetricTile testId="t" title="Cumplimiento" color="rojo">
        <MetricRow label="Real" value="10 %" />
        <BigValue value="55 %" detalle="3 de 4" />
      </MetricTile>,
    )
    expect(screen.getByTestId("t")).toHaveAttribute("data-color", "rojo")
    expect(screen.getByText("Real")).toBeInTheDocument()
    expect(screen.getByText("10 %")).toBeInTheDocument()
    expect(screen.getByText("55 %")).toBeInTheDocument()
    expect(screen.getByText("3 de 4")).toBeInTheDocument()
  })

  it("exports one native-select class constant", () => {
    expect(SELECT_CLASS).toContain("rounded-12")
  })
})
