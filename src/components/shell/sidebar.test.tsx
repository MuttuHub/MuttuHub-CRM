import { act, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Sidebar } from "./sidebar"
import { useSidebarStore } from "@/store/sidebar"

const RAIL = "shadow-[inset_3px_0_0_var(--primary)]"

let currentPath = "/tablero"
let currentSearch = ""

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/hooks/nav", () => ({
  useNavCounts: () => ({ data: undefined }),
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render?: React.ReactNode }) => <>{render}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("./sidebar-profile", () => ({
  SidebarProfile: ({ rail }: { rail: boolean }) => (
    <div data-testid="sidebar-profile" data-rail={String(rail)} />
  ),
}))

describe("Sidebar", () => {
  beforeEach(() => {
    currentPath = "/tablero"
    currentSearch = ""
    localStorage.clear()
    useSidebarStore.setState({ collapsed: false, mobileOpen: false })
    document.body.style.overflow = ""
  })

  it("renders the desktop rail on lg screens", () => {
    render(<Sidebar />)
    expect(screen.getByRole("complementary")).toBeInTheDocument()
  })

  it("closes the mobile drawer when navigating to another route", () => {
    useSidebarStore.setState({ mobileOpen: true })
    const { rerender } = render(<Sidebar />)
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeInTheDocument()

    // Navigation happens (Next.js changes the pathname); the drawer unmounts.
    currentPath = "/clientes"
    act(() => {
      rerender(<Sidebar />)
    })

    expect(screen.queryByRole("button", { name: "Cerrar menú" })).not.toBeInTheDocument()
    expect(useSidebarStore.getState().mobileOpen).toBe(false)
  })

  it("locks body scroll while the drawer is open and releases it on close", () => {
    useSidebarStore.setState({ mobileOpen: true })
    const { unmount } = render(<Sidebar />)
    expect(document.body.style.overflow).toBe("hidden")

    unmount()
    expect(document.body.style.overflow).toBe("")
  })

  it("does not render the desktop collapse toggle inside the drawer", () => {
    useSidebarStore.setState({ mobileOpen: true })
    render(<Sidebar />)
    const drawer = document.getElementById("sidebar-drawer")
    expect(drawer).not.toBeNull()
    // The drawer must not offer a button that mutates the PERSISTED desktop
    // collapsed state invisibly (plan Fase 5, bug 0a). The desktop rail still
    // keeps its own toggle.
    expect(within(drawer!).queryByRole("button", { name: "Contraer menú" })).not.toBeInTheDocument()
  })

  // F1.6 (tablero-gerencial-unificado, design.md D3): "Tablero Gerencial"
  // ahora apunta a "/?cara=management" — sin leer el `cara` actual, este item
  // e "Inicio" se resaltarían juntos en cualquier pestaña de "/".
  it("highlights 'Tablero Gerencial' only when its own cara is active, not on every '/' tab", () => {
    currentPath = "/"
    currentSearch = "cara=pipeline"
    render(<Sidebar />)
    const inicio = screen.getByRole("link", { name: "Inicio" })
    const tableroGerencial = screen.getByRole("link", { name: "Tablero Gerencial" })
    expect(inicio.className).toContain(RAIL)
    expect(tableroGerencial.className).not.toContain(RAIL)
  })

  it("highlights 'Tablero Gerencial' when cara=management is active (design.md D3, option a)", () => {
    currentPath = "/"
    currentSearch = "cara=management"
    render(<Sidebar />)
    const tableroGerencial = screen.getByRole("link", { name: "Tablero Gerencial" })
    expect(tableroGerencial.className).toContain(RAIL)
  })

  // V1.1 (v6 visual alignment): 44px items, r12, surface bg + 3px left rail.
  it("renders nav items at 44px with radius 12", () => {
    render(<Sidebar />)
    const link = screen.getByRole("link", { name: "Inicio" })
    expect(link.className).toContain("h-11")
    expect(link.className).toContain("rounded-12")
    expect(link.className).not.toContain("h-[36px]")
  })

  it("marks the active item with a surface background and rail, not a solid magenta fill", () => {
    currentPath = "/"
    currentSearch = "cara=pipeline"
    render(<Sidebar />)
    const active = screen.getByRole("link", { name: "Inicio" })
    expect(active.className).toContain("bg-shell-surface")
    expect(active.className).toContain("text-white")
    expect(active.className).not.toContain("bg-rose-500")
    const inactive = screen.getByRole("link", { name: "Tablero Gerencial" })
    expect(inactive.className).not.toContain("bg-shell-surface")
  })

  it("sizes the expanded lockup at 92px with a plain 17px Hub wordmark", () => {
    render(<Sidebar />)
    const aside = screen.getByRole("complementary")
    const logo = within(aside).getByAltText("Muttu")
    expect(logo.className).toContain("w-[92px]")
    const hub = within(aside).getByText("Hub")
    expect(hub.className).toContain("text-[17px]")
    expect(hub.className).not.toContain("bg-shell-chip")
  })

  // V1.2 (D9): profile + Salir live in the sidebar only.
  it("renders the profile block inside the desktop aside, expanded", () => {
    render(<Sidebar />)
    const aside = screen.getByRole("complementary")
    const block = within(aside).getByTestId("sidebar-profile")
    expect(block.dataset.rail).toBe("false")
  })

  it("renders the profile block in rail mode when collapsed", () => {
    useSidebarStore.setState({ collapsed: true })
    render(<Sidebar />)
    const block = within(screen.getByRole("complementary")).getByTestId("sidebar-profile")
    expect(block.dataset.rail).toBe("true")
  })

  it("renders the profile block in the mobile drawer, never in rail mode", () => {
    useSidebarStore.setState({ mobileOpen: true, collapsed: true })
    render(<Sidebar />)
    const drawer = document.getElementById("sidebar-drawer")!
    expect(within(drawer).getByTestId("sidebar-profile").dataset.rail).toBe("false")
  })
})
