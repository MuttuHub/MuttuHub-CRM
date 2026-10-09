import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

// Regression tests for QA audit finding #7: selecting an item made the
// trigger show the raw `value` (a UUID/enum) instead of its label, because
// nothing passed `items` to the base-ui Select root.

function BasicSelect(props: { items?: Record<string, string> }) {
  return (
    <Select {...props}>
      <SelectTrigger>
        <SelectValue placeholder="Responsable" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="u1">Ana Pérez</SelectItem>
        <SelectItem value="u2">Bruno Díaz</SelectItem>
      </SelectContent>
    </Select>
  )
}

describe("Select", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<BasicSelect />)
    expect(screen.getByRole("combobox")).toHaveTextContent("Responsable")
  })

  it("sizes the trigger at 44px (default) and 40px (sm)", () => {
    render(<BasicSelect />)
    expect(screen.getByRole("combobox")).toHaveClass("data-[size=default]:h-11")
    expect(screen.getByRole("combobox")).toHaveClass("data-[size=sm]:h-10")
  })

  it("uses the v6 radius (12px) and control surface tokens on the trigger", () => {
    render(<BasicSelect />)
    expect(screen.getByRole("combobox")).toHaveClass("rounded-12", "border-border-strong", "bg-input-bg")
    expect(screen.getByRole("combobox")).not.toHaveClass("rounded-lg")
  })

  it("shows the item's label instead of the raw value once selected (BUG #7)", async () => {
    const user = userEvent.setup()
    render(<BasicSelect />)
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Ana Pérez" }))
    const trigger = screen.getByRole("combobox")
    expect(trigger).toHaveTextContent("Ana Pérez")
    expect(trigger).not.toHaveTextContent("u1")
  })

  it("respects an explicit items prop instead of deriving one", () => {
    render(
      <Select items={{ u1: "Etiqueta manual" }} defaultValue="u1">
        <SelectTrigger>
          <SelectValue placeholder="Responsable" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="u1">Ana Pérez</SelectItem>
        </SelectContent>
      </Select>,
    )
    const trigger = screen.getByRole("combobox")
    expect(trigger).toHaveTextContent("Etiqueta manual")
    expect(trigger).not.toHaveTextContent("Ana Pérez")
  })

  it("renders the listbox without a drop shadow (v6: none except toast)", async () => {
    render(<BasicSelect />)
    await userEvent.click(screen.getByRole("combobox"))
    const list = await screen.findByRole("listbox")
    const content = list.closest("[data-slot=select-content]")
    expect(content).toBeInTheDocument()
    expect(content?.className).not.toMatch(/shadow-/)
  })
})
