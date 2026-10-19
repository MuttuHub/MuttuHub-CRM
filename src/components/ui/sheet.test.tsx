import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet"

function renderOpen(
  content?: Partial<React.ComponentProps<typeof SheetContent>>,
  onOpenChange = vi.fn(),
) {
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent {...content}>
        <SheetHeader>
          <SheetTitle>Ficha</SheetTitle>
          <SheetDescription>Detalle</SheetDescription>
        </SheetHeader>
        <SheetFooter>Pie</SheetFooter>
      </SheetContent>
    </Sheet>,
    )
  return onOpenChange
}

describe("Sheet", () => {
  it("exposes the dialog role with its accessible name and the side attribute", () => {
    renderOpen()
    const sheet = screen.getByRole("dialog", { name: "Ficha" })
    expect(sheet).toHaveAttribute("data-slot", "sheet-content")
    expect(sheet).toHaveAttribute("data-side", "right")
  })

  it("supports the other sides", () => {
    renderOpen({ side: "left" })
    expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "left")
  })

  it("has no drop shadow (v6: none except toast)", () => {
    renderOpen()
    expect(screen.getByRole("dialog").className).not.toMatch(/shadow-/)
  })

  it("renders the overlay with the --overlay token instead of bg-black/10", () => {
    renderOpen()
    const overlay = document.querySelector("[data-slot=sheet-overlay]")
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveClass("bg-(--overlay)")
    expect(overlay).not.toHaveClass("bg-black/10")
  })

  it("uses the 26/28 header and footer padding", () => {
    renderOpen()
    expect(screen.getByText("Ficha").closest("[data-slot=sheet-header]")).toHaveClass("px-7", "py-[26px]")
    expect(screen.getByText("Pie")).toHaveClass("px-7", "py-[26px]")
  })

  it("closes through the close button and hides it on request", async () => {
    const onOpenChange = renderOpen()
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    expect(onOpenChange.mock.calls[0][0]).toBe(false)
  })

  it("omits the close button when showCloseButton is false", () => {
    renderOpen({ showCloseButton: false })
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument()
  })
})
