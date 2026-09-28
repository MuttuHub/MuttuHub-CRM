import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { ThemeToaster } from "./theme-toaster"

// v6 contract (gap map §1 "Toast"): the toast card is a FIXED light card —
// it must not flip to dark even when the app theme (html.dark) is dark —
// with a 5s duration and a visible "Cerrar" close action.

describe("ThemeToaster", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("forces the sonner theme to light regardless of the app theme", async () => {
    document.documentElement.classList.add("dark")
    const { container } = render(<ThemeToaster />)
    act(() => {
      toast("Disparador para materializar el contenedor")
    })
    const toaster = await screen.findByText(
      "Disparador para materializar el contenedor"
    )
    expect(toaster).toBeInTheDocument()
    const toasterRoot = container.querySelector("[data-sonner-toaster]")
    expect(toasterRoot).toHaveAttribute("data-sonner-theme", "light")
  })

  it("shows a close button labeled Cerrar on every toast", async () => {
    render(<ThemeToaster />)
    act(() => {
      toast("Guardado correctamente")
    })
    const closeButton = await screen.findByLabelText("Cerrar")
    expect(closeButton).toBeInTheDocument()
  })

  it("dismisses a toast automatically after 5 seconds", () => {
    vi.useFakeTimers()
    render(<ThemeToaster />)
    act(() => {
      toast("Mensaje temporal")
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByText("Mensaje temporal")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(screen.getByText("Mensaje temporal")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByText("Mensaje temporal")).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
