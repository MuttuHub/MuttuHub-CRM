import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Separator } from "./separator"

describe("Separator", () => {
  it("renders a horizontal separator by default", () => {
    const { container } = render(<Separator />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute("data-slot", "separator")
    expect(el).toHaveAttribute("data-orientation", "horizontal")
    expect(el).toHaveAttribute("role", "separator")
  })

  it("renders a vertical separator when requested", () => {
    const { container } = render(<Separator orientation="vertical" />)
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "vertical")
  })
})