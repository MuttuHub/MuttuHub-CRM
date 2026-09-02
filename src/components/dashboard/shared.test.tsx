import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  BarRow,
  CardSection,
  ChipSelector,
  DashboardSkeleton,
  diasDesde,
  esEnvelopeNoConfigurado,
  SinConexionCard,
  StackedBarRow,
  StatTile,
  TONE_BAR,
  TONE_DOT,
} from "./shared"

const MS_DIA = 24 * 60 * 60 * 1000

describe("diasDesde", () => {
  it("returns null for missing or invalid dates", () => {
    expect(diasDesde(null)).toBeNull()
    expect(diasDesde(undefined)).toBeNull()
    expect(diasDesde("not-a-date")).toBeNull()
  })

  it("returns 0 for today and future dates (clamped)", () => {
    expect(diasDesde(new Date().toISOString())).toBe(0)
    const future = new Date(Date.now() + MS_DIA).toISOString()
    expect(diasDesde(future)).toBe(0)
  })

  it("counts full days elapsed since the ISO date", () => {
    const hace5 = new Date(Date.now() - 5 * MS_DIA).toISOString()
    expect(diasDesde(hace5)).toBe(5)
  })
})

describe("esEnvelopeNoConfigurado", () => {
  it("detects the 'no configurada' envelope error", () => {
    expect(esEnvelopeNoConfigurado(new Error("supabase no configurada"))).toBe(true)
  })

  it("rejects other errors and non-Error values", () => {
    expect(esEnvelopeNoConfigurado(new Error("timeout"))).toBe(false)
    expect(esEnvelopeNoConfigurado(null)).toBe(false)
    expect(esEnvelopeNoConfigurado("no configurada")).toBe(false)
  })
})

describe("TONE_DOT and TONE_BAR", () => {
  it("map every UiTone to a class", () => {
    for (const tone of ["neutro", "activo", "alerta", "riesgo", "exito", "info", "destructivo"] as const) {
      expect(TONE_DOT[tone]).toBeTruthy()
      expect(TONE_BAR[tone]).toBeTruthy()
    }
  })
})

describe("CardSection", () => {
  it("renders title, subtitle, action and children", () => {
    render(
      <CardSection
        title="Mi resumen"
        subtitle="Este mes"
        action={<button type="button">Ver todo</button>}
        className="custom-card"
      >
        <p>contenido</p>
      </CardSection>,
    )
    expect(screen.getByText("Mi resumen")).toBeInTheDocument()
    expect(screen.getByText("Este mes")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ver todo" })).toBeInTheDocument()
    expect(screen.getByText("contenido")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Mi resumen")
    const section = screen.getByText("Mi resumen").closest("section")
    expect(section).toHaveClass("custom-card")
  })

  it("omits the subtitle when not provided", () => {
    const { container } = render(<CardSection title="Solo título">x</CardSection>)
    expect(screen.getByText("Solo título")).toBeInTheDocument()
    expect(container.querySelector("p")).toBeNull()
  })
})

describe("StatTile", () => {
  it("renders label, value and foot", () => {
    render(<StatTile label="Activas" value={12} foot="vs 8 antes" />)
    expect(screen.getByText("Activas")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("vs 8 antes")).toBeInTheDocument()
  })

  it("omits the foot when not provided", () => {
    render(<StatTile label="Activas" value={1} />)
    expect(screen.queryByText("vs 8 antes")).toBeNull()
  })

  it("applies the accent styling when acento is set", () => {
    const { container } = render(<StatTile label="Acento" value={1} acento />)
    expect(container.firstElementChild).toHaveClass("border-rose-500", "bg-rose-500")
  })
})

describe("BarRow", () => {
  it("shows count and rounded percentage", () => {
    render(<BarRow label="Gobierno" count={4} total={10} />)
    expect(screen.getByText("Gobierno")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("renders an empty bar when total is zero", () => {
    const { container } = render(<BarRow label="Nada" count={0} total={0} />)
    const inner = container.querySelector("[style*='width']")
    expect(screen.getByText("0%")).toBeInTheDocument()
    expect(inner).toHaveStyle({ width: "0%" })
  })

  it("keeps a 3% minimum bar width when count > 0 but total is 0", () => {
    const { container } = render(<BarRow label="Rara" count={5} total={0} />)
    const inner = container.querySelector("[style*='width']")
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(inner).toHaveStyle({ width: "3%" })
  })

  it("renders the tone dot for the given tone", () => {
    const { container } = render(<BarRow label="Activos" count={1} total={2} tone="exito" />)
    const dot = container.querySelector(".size-\\[7px\\]")
    expect(dot).toHaveClass(TONE_DOT.exito)
  })
})

describe("StackedBarRow (PR 19 — carga por persona)", () => {
  it("is accessible: the bar is aria-hidden and the data lives in a sr-only sentence", () => {
    const { container } = render(
      <StackedBarRow
        label="Ana"
        total={10}
        segments={[
          { name: "completadas", value: 6, tone: "exito" },
          { name: "en curso", value: 3, tone: "activo" },
          { name: "vencidas", value: 1, tone: "destructivo" },
        ]}
      />,
    )
    expect(screen.getByText("Ana")).toBeInTheDocument()
    expect(screen.getByText("10")).toBeInTheDocument()
    // La barra visible es aria-hidden: el dato se lee del sr-only.
    const bar = container.querySelector("[aria-hidden]")
    expect(bar).not.toBeNull()
    const sr = container.querySelector(".sr-only")
    expect(sr?.textContent).toContain("Ana: 6 completadas, 3 en curso, 1 vencidas de 10")
  })

  it("renders one segment per tone with a TONE_BAR class", () => {
    const { container } = render(
      <StackedBarRow
        label="Luis"
        total={4}
        segments={[
          { name: "completadas", value: 2, tone: "exito" },
          { name: "en curso", value: 2, tone: "activo" },
        ]}
      />,
    )
    const segments = container.querySelectorAll("[aria-hidden] > div")
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveClass(TONE_BAR.exito)
    expect(segments[1]).toHaveClass(TONE_BAR.activo)
  })
})

describe("ChipSelector", () => {
  const options = [
    { value: "mes", label: "Este mes" },
    { value: "30", label: "30 días" },
  ]

  it("marks the selected option as pressed", () => {
    render(<ChipSelector options={options} value="mes" onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Este mes" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onChange with the clicked option value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChipSelector options={options} value="mes" onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "30 días" }))
    expect(onChange).toHaveBeenCalledWith("30")
  })
})

describe("SinConexionCard", () => {
  it("renders the disconnected state and triggers retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<SinConexionCard onRetry={onRetry} />)
    expect(screen.getByText("Plataforma no conectada")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("DashboardSkeleton", () => {
  it("renders the skeleton grid (22 skeleton blocks)", () => {
    const { container } = render(<DashboardSkeleton />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(22)
  })
})