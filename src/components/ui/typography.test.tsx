import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Eyebrow, KpiNumeral, MonoData, SectionTitle } from "./typography"

// v6 type utilities (gap map §1): eyebrow (12/700/upper/.1em/text-3), section
// title (20-28/700), KPI numeral (28-32/800 display, tabular-nums), mono data
// (font-mono tabular-nums).

describe("Eyebrow", () => {
  it("renders its text with the eyebrow classes", () => {
    render(<Eyebrow>Resumen</Eyebrow>)
    const el = screen.getByText("Resumen")
    expect(el).toHaveAttribute("data-slot", "eyebrow")
    expect(el).toHaveClass("uppercase", "tracking-widest", "font-bold", "text-ink-500")
  })

  it("merges an extra className", () => {
    render(<Eyebrow className="mb-2">Resumen</Eyebrow>)
    expect(screen.getByText("Resumen")).toHaveClass("mb-2", "uppercase")
  })
})

describe("SectionTitle", () => {
  it("renders as a heading with the section-title classes", () => {
    render(<SectionTitle>Indicadores</SectionTitle>)
    const el = screen.getByRole("heading", { name: "Indicadores" })
    expect(el).toHaveAttribute("data-slot", "section-title")
    expect(el).toHaveClass("font-bold")
  })
})

describe("KpiNumeral", () => {
  it("renders the numeral with display/extrabold/tabular-nums classes", () => {
    render(<KpiNumeral>128</KpiNumeral>)
    const el = screen.getByText("128")
    expect(el).toHaveAttribute("data-slot", "kpi-numeral")
    expect(el).toHaveClass("font-display", "font-extrabold", "tabular-nums")
  })
})

describe("MonoData", () => {
  it("renders monospace tabular-nums data", () => {
    render(<MonoData>PRJ-2026-004</MonoData>)
    const el = screen.getByText("PRJ-2026-004")
    expect(el).toHaveAttribute("data-slot", "mono-data")
    expect(el).toHaveClass("font-mono", "tabular-nums")
  })
})
