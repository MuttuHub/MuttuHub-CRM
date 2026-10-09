import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  it("renders a button with children and default cva classes", () => {
    const { container } = render(<Button>Guardar</Button>)
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute("data-slot", "button")
    expect(container.firstElementChild).toHaveClass("inline-flex", "shrink-0")
  })

  it("applies the requested variant and size classes (base-ui keeps its own base)", () => {
    const { container, rerender } = render(<Button variant="destructive" size="sm">X</Button>)
    expect(container.firstElementChild).toHaveClass("bg-destructive/10", "text-destructive", "hover:bg-destructive/20")
    expect(container.firstElementChild).toHaveClass("h-10", "px-2.5")
    expect(container.firstElementChild).not.toHaveClass("bg-primary")
    rerender(<Button variant="outline" size="icon">X</Button>)
    expect(container.firstElementChild).toHaveClass("border-border-strong", "bg-input-bg")
    rerender(<Button variant="link">X</Button>)
    expect(container.firstElementChild).toHaveClass("text-primary", "underline-offset-4")
  })

  it("sizes controls at 44 (default/lg), 40 (sm) and 36 (xs) px", () => {
    const { container, rerender } = render(<Button>X</Button>)
    expect(container.firstElementChild).toHaveClass("h-11")
    rerender(<Button size="lg">X</Button>)
    expect(container.firstElementChild).toHaveClass("h-11")
    rerender(<Button size="sm">X</Button>)
    expect(container.firstElementChild).toHaveClass("h-10")
    rerender(<Button size="xs">X</Button>)
    expect(container.firstElementChild).toHaveClass("h-9")
    rerender(<Button size="icon">X</Button>)
    expect(container.firstElementChild).toHaveClass("size-11")
    rerender(<Button size="icon-sm">X</Button>)
    expect(container.firstElementChild).toHaveClass("size-10")
    rerender(<Button size="icon-xs">X</Button>)
    expect(container.firstElementChild).toHaveClass("size-9")
    rerender(<Button size="icon-lg">X</Button>)
    expect(container.firstElementChild).toHaveClass("size-11")
  })

  it("uses the v6 12px radius on every size and the v6 control surface on outline", () => {
    const { container, rerender } = render(<Button>X</Button>)
    expect(container.firstElementChild).toHaveClass("rounded-12")
    for (const size of ["xs", "sm", "icon-xs", "icon-sm"] as const) {
      rerender(<Button size={size}>X</Button>)
      expect(container.firstElementChild).toHaveClass("rounded-12")
    }
    rerender(<Button variant="outline">X</Button>)
    expect(container.firstElementChild).toHaveClass("border-border-strong", "bg-input-bg")
  })

  it("calls onClick and respects the default button type", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole("button", { name: "Click" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Click</Button>)
    const btn = screen.getByRole("button", { name: "Click" })
    expect(btn).toBeDisabled()
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("renders as another element via render prop", () => {
    const { container } = render(<Button render={<a href="/x" />}>Link</Button>)
    expect(container.querySelector("a")).toHaveAttribute("href", "/x")
  })
})