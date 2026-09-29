import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { UmbralesSemaforo } from "@/lib/semaforo"
import { ProgressBar } from "./progress-bar"

// Ratio thresholds: value/100 is compared with the same `colorIndicador`
// logic used elsewhere (verde >= 0.9, amarillo >= 0.6, else rojo).
const UMBRALES: UmbralesSemaforo = {
  confirmado: true,
  tecnico: { verde: 0.9, rojo: 0.6 },
  financiero: {
    verde_min: 0.9,
    verde_max: 1.1,
    amarillo_min: 0.7,
    amarillo_max: 1.3,
  },
  indicador: { verde: 0.9, amarillo: 0.6 },
}

describe("ProgressBar", () => {
  it("exposes progressbar semantics", () => {
    render(<ProgressBar value={42} umbrales={UMBRALES} aria-label="Avance" />)
    const bar = screen.getByRole("progressbar", { name: "Avance" })
    expect(bar).toHaveAttribute("aria-valuenow", "42")
    expect(bar).toHaveAttribute("aria-valuemin", "0")
    expect(bar).toHaveAttribute("aria-valuemax", "100")
  })

  it("sizes the fill to the value", () => {
    const { container } = render(<ProgressBar value={42} umbrales={UMBRALES} />)
    const fill = container.querySelector("[data-slot='progress-bar-fill']")
    expect(fill).toHaveStyle({ width: "42%" })
  })

  it.each([
    [95, "verde", "exito", "bg-exito"],
    [70, "amarillo", "alerta", "bg-alerta"],
    [30, "rojo", "destructivo", "bg-destructivo"],
  ])("value %i -> band %s -> tone %s", (value, band, tone, cls) => {
    render(<ProgressBar value={value} umbrales={UMBRALES} />)
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("data-band", band)
    expect(bar).toHaveAttribute("data-tone", tone)
    expect(bar.querySelector("[data-slot='progress-bar-fill']")).toHaveClass(cls)
  })

  it("clamps out-of-range values", () => {
    const { rerender } = render(<ProgressBar value={150} umbrales={UMBRALES} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    rerender(<ProgressBar value={-20} umbrales={UMBRALES} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
    rerender(<ProgressBar value={Number.NaN} umbrales={UMBRALES} />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  })

  it("merges an extra className", () => {
    render(<ProgressBar value={10} umbrales={UMBRALES} className="mt-2" />)
    expect(screen.getByRole("progressbar")).toHaveClass("mt-2")
  })
})
