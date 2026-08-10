import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Sparkline } from "./sparkline"

function svgParts(ui: React.ReactElement) {
  const { container } = render(ui)
  const svg = container.querySelector("svg")
  const polyline = svg?.querySelector("polyline")
  const circle = svg?.querySelector("circle")
  return { svg, polyline, circle }
}

describe("Sparkline", () => {
  it("renders an svg with the fixed viewBox and decorative role", () => {
    const { svg } = svgParts(<Sparkline data={[0, 10]} />)
    expect(svg).toHaveAttribute("viewBox", "0 0 96 28")
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg).toHaveAttribute("role", "img")
  })

  it("draws the normalized polyline for a known two-point series", () => {
    const { polyline, circle } = svgParts(<Sparkline data={[0, 10]} />)
    expect(polyline).toHaveAttribute("points", "0,26 96,4")
    expect(circle).toHaveAttribute("cx", "96")
    expect(circle).toHaveAttribute("cy", "4")
  })

  it("plots intermediate values proportionally", () => {
    const { polyline, circle } = svgParts(<Sparkline data={[0, 5, 10]} />)
    expect(polyline).toHaveAttribute("points", "0,26 48,15 96,4")
    expect(circle).toHaveAttribute("cx", "96")
    expect(circle).toHaveAttribute("cy", "4")
  })

  it("centers a single-point series", () => {
    const { polyline, circle } = svgParts(<Sparkline data={[5]} />)
    expect(polyline).toHaveAttribute("points", "48,4")
    expect(circle).toHaveAttribute("cx", "48")
    expect(circle).toHaveAttribute("cy", "4")
  })

  it("keeps negative values inside the viewBox (min scales below zero)", () => {
    const { polyline } = svgParts(<Sparkline data={[0, -5]} />)
    expect(polyline).toHaveAttribute("points", "0,7.7 96,26")
  })

  it("renders an empty svg (no shapes) for an empty series", () => {
    const { polyline, circle } = svgParts(<Sparkline data={[]} />)
    expect(polyline).toBeNull()
    expect(circle).toBeNull()
  })

  it("applies the custom stroke to line and dot", () => {
    const { polyline, circle } = svgParts(<Sparkline data={[0, 10]} stroke="red" />)
    expect(polyline).toHaveAttribute("stroke", "red")
    expect(circle).toHaveAttribute("stroke", "red")
  })

  it("merges the className into the svg", () => {
    const { svg } = svgParts(<Sparkline data={[0, 10]} className="my-extra" />)
    expect(svg).toHaveClass("h-7", "w-24", "overflow-visible", "my-extra")
  })
})