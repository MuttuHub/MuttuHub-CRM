import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Skeleton } from "./skeleton"

describe("Skeleton", () => {
  it("renders a pulse div with the skeleton slot", () => {
    const { container } = render(<Skeleton className="h-44 w-full" />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute("data-slot", "skeleton")
    expect(el).toHaveClass("animate-pulse")
    expect(el).toHaveClass("h-44", "w-full")
  })

  it("forwards DOM props", () => {
    const { container } = render(<Skeleton aria-label="cargando" />)
    expect(container.firstElementChild).toHaveAttribute("aria-label", "cargando")
  })
})