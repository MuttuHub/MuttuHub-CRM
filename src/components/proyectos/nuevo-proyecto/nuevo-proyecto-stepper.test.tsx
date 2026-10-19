// The step indicator as in v7: numbers for pending steps, a check for done ones, the active step marked and
// disabled steps not clickable.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { NuevoProyectoStepper } from "./nuevo-proyecto-stepper"

describe("NuevoProyectoStepper", () => {
  it("renders the five labelled steps in order", () => {
    render(<NuevoProyectoStepper actual={1} hayProyecto={false} onSeleccionar={vi.fn()} />)
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["1General", "2Metas", "3Cronograma", "4Presupuesto", "5Revisión"])
  })

  it("replaces the number with a check on done steps and flags them for assistive tech", () => {
    render(<NuevoProyectoStepper actual={3} hayProyecto onSeleccionar={vi.fn()} />)
    const general = screen.getByRole("button", { name: /^General/ })
    expect(general).toHaveTextContent("(completado)")
    expect(general).not.toHaveTextContent("1")
    expect(screen.getByRole("button", { name: /^Cronograma/ })).toHaveAttribute("aria-current", "step")
    expect(screen.getByRole("button", { name: /^Presupuesto/ })).toHaveTextContent("4")
  })

  it("only lets the user click enabled steps", async () => {
    const user = userEvent.setup()
    const onSeleccionar = vi.fn()
    render(<NuevoProyectoStepper actual={1} hayProyecto={false} onSeleccionar={onSeleccionar} />)

    await user.click(screen.getByRole("button", { name: /^Metas/ }))
    expect(onSeleccionar).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /^General/ }))
    expect(onSeleccionar).toHaveBeenCalledWith(1)
  })

  it("shows the Revisión pill as done once the baseline is approved, keeping it the current step", () => {
    render(<NuevoProyectoStepper actual={5} hayProyecto aprobado onSeleccionar={vi.fn()} />)
    const revision = screen.getByRole("button", { name: /^Revisión/ })
    expect(revision).toHaveAttribute("data-estado", "hecho")
    expect(revision).toHaveAttribute("aria-current", "step")
    expect(revision).toHaveTextContent("(completado)")
  })

  it("keeps Revisión pending while the project is still a draft", () => {
    render(<NuevoProyectoStepper actual={3} hayProyecto onSeleccionar={vi.fn()} />)
    expect(screen.getByRole("button", { name: /^Revisión/ })).toHaveAttribute("data-estado", "pendiente")
  })
})
