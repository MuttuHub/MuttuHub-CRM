import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { HelpHint } from "./help-hint"

describe("HelpHint", () => {
  it("exposes an accessible name that says which field it explains", () => {
    render(<HelpHint label="Valor total">Debe ser mayor que cero.</HelpHint>)
    expect(screen.getByRole("button", { name: "Ayuda: Valor total" })).toBeInTheDocument()
    expect(screen.queryByText("Debe ser mayor que cero.")).not.toBeInTheDocument()
  })

  it("opens on click and closes on Escape", async () => {
    const user = userEvent.setup()
    render(<HelpHint label="Valor total">Debe ser mayor que cero.</HelpHint>)
    await user.click(screen.getByRole("button", { name: "Ayuda: Valor total" }))
    expect(await screen.findByText("Debe ser mayor que cero.")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByText("Debe ser mayor que cero.")).not.toBeInTheDocument()
  })

  it("opens from the keyboard (focus + Enter)", async () => {
    const user = userEvent.setup()
    render(<HelpHint label="Fechas">Inicio antes que fin.</HelpHint>)
    await user.tab()
    expect(screen.getByRole("button", { name: "Ayuda: Fechas" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(await screen.findByText("Inicio antes que fin.")).toBeInTheDocument()
  })

  it("does not submit a surrounding form when pressed", async () => {
    const user = userEvent.setup()
    let enviado = false
    render(
      <form onSubmit={(e) => { e.preventDefault(); enviado = true }}>
        <HelpHint label="Fechas">Inicio antes que fin.</HelpHint>
      </form>,
    )
    await user.click(screen.getByRole("button", { name: "Ayuda: Fechas" }))
    expect(enviado).toBe(false)
  })
})
