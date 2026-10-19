import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProgressBar } from "./progress-bar"

// The band (verde/amarillo/rojo) is computed by the server and only painted
// here: the client never recomputes a semáforo.
describe("ProgressBar", () => {
  it("exposes progressbar semantics", () => {
    render(<ProgressBar value={42} band="amarillo" aria-label="Avance" />)
    const bar = screen.getByRole("progressbar", { name: "Avance" })
    expect(bar).toHaveAttribute("aria-valuenow", "42")
    expect(bar).toHaveAttribute("aria-valuemin", "0")
    expect(bar).toHaveAttribute("aria-valuemax", "100")
  })

  it("sizes the fill to the value", () => {
    const { container } = render(<ProgressBar value={42} band="verde" />)
    const fill = container.querySelector("[data-slot='progress-bar-fill']")
    expect(fill).toHaveStyle({ width: "42%" })
  })

  it.each([
    ["verde", "exito", "bg-exito"],
    ["amarillo", "alerta", "bg-alerta"],
    ["rojo", "destructivo", "bg-destructivo"],
  ] as const)("band %s -> tone %s", (band, tone, cls) => {
    render(<ProgressBar value={50} band={band} />)
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("data-band", band)
    expect(bar).toHaveAttribute("data-tone", tone)
    expect(bar.querySelector("[data-slot='progress-bar-fill']")).toHaveClass(cls)
  })

  it("clamps out-of-range values", () => {
    const { rerender } = render(<ProgressBar value={150} band="verde" />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    rerender(<ProgressBar value={-20} band="verde" />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
    rerender(<ProgressBar value={Number.NaN} band="verde" />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  })

  it("without a band it renders a neutral fill", () => {
    render(<ProgressBar value={30} />)
    const bar = screen.getByRole("progressbar")
    expect(bar).not.toHaveAttribute("data-band")
    expect(bar.querySelector("[data-slot='progress-bar-fill']")).toHaveClass("bg-ink-500")
  })

  it("merges an extra className", () => {
    render(<ProgressBar value={10} band="rojo" className="mt-2" />)
    expect(screen.getByRole("progressbar")).toHaveClass("mt-2")
  })
})
