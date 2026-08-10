import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"

const VARIANT_MARKERS: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border-border text-foreground",
  ghost: "hover:bg-muted",
  link: "text-primary underline-offset-4",
}

describe("Badge", () => {
  it("renders a span with children and the default variant styling", () => {
    const { container } = render(<Badge>Nuevo</Badge>)
    expect(screen.getByText("Nuevo")).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute("data-slot", "badge")
    expect(container.firstElementChild).toHaveClass("inline-flex", "rounded-4xl")
    expect(container.firstElementChild).toHaveClass(...VARIANT_MARKERS.default.split(" "))
  })

  it("applies every cva variant", () => {
    for (const variant of ["default", "secondary", "destructive", "outline", "ghost", "link"] as const) {
      const { container, unmount } = render(<Badge variant={variant} />)
      expect(container.firstElementChild).toHaveClass(...VARIANT_MARKERS[variant].split(" "))
      if (variant !== "default") expect(container.firstElementChild).not.toHaveClass("bg-primary")
      unmount()
    }
  })

  it("merges className with the variant classes", () => {
    const { container } = render(<Badge className="custom-badge" />)
    expect(container.firstElementChild).toHaveClass("custom-badge", "inline-flex")
  })

  it("forwards extra props and render-as support", () => {
    const { container } = render(<Badge aria-label="estado" data-testid="b" />)
    expect(container.querySelector('[data-testid="b"]')).toHaveAttribute("aria-label", "estado")
  })
})