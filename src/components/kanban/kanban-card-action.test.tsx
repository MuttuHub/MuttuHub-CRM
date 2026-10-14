import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CardActionView } from "./kanban-board"

describe("CardActionView", () => {
  it("links the 'convert' action to the stepper page with the opportunity preselected", () => {
    render(
      <CardActionView
        action={{ kind: "convert", oportunidadId: "op-9", label: "Pasar a nuevo proyecto →" }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByRole("link", { name: "Pasar a nuevo proyecto →" })).toHaveAttribute(
      "href",
      "/proyectos/nuevo?oportunidad=op-9",
    )
  })

  it("keeps the 'advance' action as a button that runs the handler", () => {
    const onRun = vi.fn()
    render(<CardActionView action={{ kind: "advance", to: "EN_CURSO", label: "Avanzar →" }} onRun={onRun} />)

    screen.getByRole("button", { name: "Avanzar →" }).click()
    expect(onRun).toHaveBeenCalledTimes(1)
  })
})
