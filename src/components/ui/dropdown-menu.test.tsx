import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"

describe("DropdownMenu", () => {
  it("opens from the trigger and exposes menu items", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Acciones" }))
    expect(await screen.findByRole("menuitem", { name: "Editar" })).toBeInTheDocument()
  })

  it("renders the menu without a drop shadow (v6: none except toast)", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Acciones" }))
    const menu = await screen.findByRole("menu")
    const content = menu.closest("[data-slot=dropdown-menu-content]") ?? menu
    expect(content.className).not.toMatch(/shadow-/)
  })
})
