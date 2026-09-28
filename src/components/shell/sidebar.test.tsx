import { act, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Sidebar } from "./sidebar"
import { useSidebarStore } from "@/store/sidebar"

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
    expect(inicio.className).toContain("bg-rose-500")
    expect(tableroGerencial.className).not.toContain("bg-rose-500")
  })

  it("highlights 'Tablero Gerencial' when cara=management is active (design.md D3, option a)", () => {
    currentPath = "/"
    currentSearch = "cara=management"
    render(<Sidebar />)
    const tableroGerencial = screen.getByRole("link", { name: "Tablero Gerencial" })
    expect(tableroGerencial.className).toContain("bg-rose-500")
  })
})