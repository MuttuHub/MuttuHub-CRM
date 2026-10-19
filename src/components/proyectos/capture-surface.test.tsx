import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mockViewport } from "@/test/viewport"
import { CaptureSurface } from "./capture-surface"

afterEach(() => mockViewport(false))

describe("CaptureSurface", () => {
  it("renders the form inline on desktop (no dialog)", () => {
    render(
      <CaptureSurface title="Registrar avance" onClose={() => {}}>
        <form aria-label="f">
          <input aria-label="Cantidad" />
        </form>
      </CaptureSurface>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("form", { name: "f" })).toBeInTheDocument()
  })

  it("opens a named bottom sheet below md and closes it with Escape", async () => {
    mockViewport(true)
    const onClose = vi.fn()
    render(
      <CaptureSurface title="Registrar avance" onClose={onClose}>
        <form aria-label="f">
          <input aria-label="Cantidad" />
        </form>
      </CaptureSurface>,
    )
    const dialog = await screen.findByRole("dialog", { name: "Registrar avance" })
    expect(dialog).toHaveAttribute("data-side", "bottom")
    expect(dialog.querySelector("form")).not.toBeNull()
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })
})
