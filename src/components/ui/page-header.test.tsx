import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageHeader } from "./page-header"

// v6 "Page header" (gap map §2/§3): Bricolage display title + eyebrow +
// actions slot, replacing per-page ad hoc sizes (project-list.tsx,
// project-workspace.tsx, dashboard-page.tsx handled screen-by-screen later).

describe("PageHeader", () => {
  it("renders the title as an h1 with the display-title classes", () => {
    render(<PageHeader title="Proyectos" />)
    const title = screen.getByRole("heading", { level: 1, name: "Proyectos" })
    expect(title).toHaveClass("font-display", "font-extrabold", "tracking-[-0.03em]")
  })

  it("renders the eyebrow above the title when provided", () => {
    render(<PageHeader eyebrow="Dirección" title="Proyectos" />)
    expect(screen.getByText("Dirección")).toHaveAttribute("data-slot", "eyebrow")
  })

  it("omits the eyebrow node when not provided", () => {
    const { container } = render(<PageHeader title="Proyectos" />)
    expect(container.querySelector('[data-slot="eyebrow"]')).not.toBeInTheDocument()
  })

  it("renders the subtitle when provided", () => {
    render(<PageHeader title="Proyectos" subtitle="12 activos" />)
    expect(screen.getByText("12 activos")).toBeInTheDocument()
  })

  it("renders the actions slot content", () => {
    render(
      <PageHeader title="Proyectos" actions={<button>Nuevo proyecto</button>} />
    )
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toBeInTheDocument()
  })

  it("omits the actions slot when not provided", () => {
    const { container } = render(<PageHeader title="Proyectos" />)
    expect(container.querySelector('[data-slot="page-header-actions"]')).not.toBeInTheDocument()
  })

  it("carries the page-header data-slot on the root element", () => {
    const { container } = render(<PageHeader title="Proyectos" />)
    expect(container.firstElementChild).toHaveAttribute("data-slot", "page-header")
  })
})
