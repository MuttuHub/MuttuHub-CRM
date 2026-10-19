import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Input } from "./input"

describe("Input", () => {
  it("renders an input with the given type and placeholder", () => {
    render(<Input type="search" placeholder="Buscar…" aria-label="búsqueda" />)
    const input = screen.getByRole("searchbox", { name: "búsqueda" })
    expect(input).toHaveAttribute("placeholder", "Buscar…")
    expect(input).toHaveAttribute("data-slot", "input")
  })

  it("reports typed values through onChange", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input aria-label="campo" onChange={onChange} />)
    await user.type(screen.getByRole("textbox", { name: "campo" }), "hola")
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole("textbox", { name: "campo" })).toHaveValue("hola")
  })

  it("shows the controlled value and honors disabled", () => {
    render(<Input aria-label="fijo" value="abc" onChange={() => {}} disabled />)
    const input = screen.getByRole("textbox", { name: "fijo" })
    expect(input).toHaveValue("abc")
    expect(input).toBeDisabled()
  })
})