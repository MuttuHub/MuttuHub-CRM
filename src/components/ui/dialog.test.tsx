import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  Dialog,
  DialogCode,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"

function renderOpen(content?: Partial<React.ComponentProps<typeof DialogContent>>, onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent {...content}>
        <DialogHeader>
          <DialogCode>REQ-0042</DialogCode>
          <DialogTitle>Nuevo aliado</DialogTitle>
          <DialogDescription>Descripción</DialogDescription>
        </DialogHeader>
        <DialogFooter>Pie</DialogFooter>
      </DialogContent>
    </Dialog>,
  )
  return onOpenChange
}

describe("Dialog", () => {
  it("exposes the dialog role with its accessible name and description", () => {
    renderOpen()
    const dialog = screen.getByRole("dialog", { name: "Nuevo aliado" })
    expect(dialog).toHaveAttribute("data-slot", "dialog-content")
    expect(screen.getByText("Descripción")).toBeInTheDocument()
  })

  it("uses the v6 chrome: 600px max width, 22px radius, 26/28 padding, border and no shadow", () => {
    renderOpen()
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("sm:max-w-[600px]", "rounded-[22px]", "px-7", "py-[26px]", "border", "border-border")
    expect(dialog).not.toHaveClass("ring-1", "sm:max-w-sm", "p-4")
    expect(dialog.className).not.toMatch(/shadow-/)
  })

  it("keeps caller className overrides winning over the defaults", () => {
    renderOpen({ className: "sm:max-w-[400px] rounded-[20px]" })
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("sm:max-w-[400px]", "rounded-[20px]")
    expect(dialog).not.toHaveClass("sm:max-w-[600px]", "rounded-[22px]")
  })

  it("renders the overlay with the --overlay token instead of bg-black/10", () => {
    renderOpen()
    const overlay = document.querySelector("[data-slot=dialog-overlay]")
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveClass("bg-(--overlay)")
    expect(overlay).not.toHaveClass("bg-black/10")
  })

  it("renders the optional mono code slot above a 26px title", () => {
    renderOpen()
    const code = screen.getByText("REQ-0042")
    expect(code).toHaveAttribute("data-slot", "dialog-code")
    expect(code).toHaveClass("font-mono")
    expect(screen.getByText("Nuevo aliado")).toHaveClass("text-[26px]")
  })

  it("pads the footer to match the 26/28 content padding", () => {
    renderOpen()
    expect(screen.getByText("Pie")).toHaveClass("-mx-7", "-mb-[26px]", "px-7")
  })

  it("closes through the close button and keeps the sr-only label", async () => {
    const onOpenChange = renderOpen()
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    expect(onOpenChange).toHaveBeenCalled()
    expect(onOpenChange.mock.calls[0][0]).toBe(false)
  })

  it("closes on Escape and can hide the close button", async () => {
    const onOpenChange = renderOpen({ showCloseButton: false })
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalled()
  })
})
