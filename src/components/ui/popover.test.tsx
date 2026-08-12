import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./popover"

function SamplePopover({ buttonLabel = "Abrir panel" }: { buttonLabel?: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<button type="button">{buttonLabel}</button>} />
      <PopoverContent>
        <PopoverTitle>Panel de filtros</PopoverTitle>
        <PopoverDescription>Opciones avanzadas</PopoverDescription>
        <button type="button" onClick={() => {}}>
          Aplicar
        </button>
      </PopoverContent>
    </Popover>
  )
}

describe("Popover", () => {
  it("stays hidden until the trigger is clicked and then shows the content", async () => {
    const user = userEvent.setup()
    render(<SamplePopover />)
    expect(screen.queryByRole("heading", { name: "Panel de filtros" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Abrir panel" }))
    expect(await screen.findByRole("heading", { name: "Panel de filtros" })).toBeInTheDocument()
    expect(screen.getByText("Opciones avanzadas")).toBeInTheDocument()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<SamplePopover />)
    await user.click(screen.getByRole("button", { name: "Abrir panel" }))
    expect(await screen.findByRole("heading", { name: "Panel de filtros" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("heading", { name: "Panel de filtros" })).not.toBeInTheDocument()
  })

  it("closes on outside pointer press", async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button type="button">Fuera</button>
        <SamplePopover />
      </div>
    )
    await user.click(screen.getByRole("button", { name: "Abrir panel" }))
    expect(await screen.findByRole("heading", { name: "Panel de filtros" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Fuera" }))
    expect(screen.queryByRole("heading", { name: "Panel de filtros" })).not.toBeInTheDocument()
  })
})