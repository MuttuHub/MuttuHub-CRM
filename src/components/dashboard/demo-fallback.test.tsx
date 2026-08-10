import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AGENDA, KPIS_INICIO, MESES } from "@/lib/mock/demo"
import { DemoFallback } from "./demo-fallback"

describe("DemoFallback", () => {
  it("renders the demo banner and badges", () => {
    render(<DemoFallback />)
    expect(screen.getByText("Vista de demostración")).toBeInTheDocument()
    expect(screen.getByText("datos de ejemplo")).toBeInTheDocument()
  })

  it("renders every KPI card from the demo data", () => {
    render(<DemoFallback />)
    for (const kpi of KPIS_INICIO) {
      expect(screen.getByText(kpi.label)).toBeInTheDocument()
      expect(screen.getByText(kpi.val)).toBeInTheDocument()
      expect(screen.getByText(kpi.delta)).toBeInTheDocument()
      expect(screen.getByText(kpi.foot)).toBeInTheDocument()
    }
  })

  it("renders the pipeline chart with one bar per month", () => {
    const { container } = render(<DemoFallback />)
    expect(screen.getByText("Pipeline del año")).toBeInTheDocument()
    const bars = container.querySelectorAll("[style*='height']")
    expect(bars).toHaveLength(MESES.length)
    for (const mes of MESES) expect(screen.getByText(mes.label)).toBeInTheDocument()
  })

  it("renders the day agenda (AGENDA[6]) with hour, title and badge", () => {
    render(<DemoFallback />)
    expect(screen.getByText("Agenda del día")).toBeInTheDocument()
    const agenda = AGENDA[6] ?? []
    for (const item of agenda) {
      expect(screen.getByText(item.hora)).toBeInTheDocument()
      expect(screen.getByText(item.titulo)).toBeInTheDocument()
      expect(screen.getByText(item.badge)).toBeInTheDocument()
    }
  })

  it("tolerates a missing agenda bucket (renders empty list)", () => {
    const original = AGENDA[6]
    delete AGENDA[6]
    try {
      render(<DemoFallback />)
      expect(screen.getByText("Agenda del día")).toBeInTheDocument()
      expect(document.querySelectorAll("li")).toHaveLength(0)
    } finally {
      AGENDA[6] = original
    }
  })
})