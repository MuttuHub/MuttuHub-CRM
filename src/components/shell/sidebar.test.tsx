import { act, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Sidebar } from "./sidebar"
import { useSidebarStore } from "@/store/sidebar"

let currentPath = "/tablero"

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
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

  describe("v6 sidebar (U3)", () => {
    const link = (name: string) => screen.getByRole("link", { name })

    it("marks the active item with a tint, a 3px accent rail and aria-current", () => {
      render(<Sidebar />)
      const active = link("Tablero")
      expect(active).toHaveAttribute("aria-current", "page")
      expect(active.className).toContain("bg-shell-active")
      expect(active.className).toContain("text-shell-text")
      expect(active.className).toContain("before:w-[3px]")
      expect(active.className).toContain("before:rounded-full")
      expect(active.className).toContain("before:bg-accent-bar")
    })

    it("drops the solid pink pill (no rose fill, no white text)", () => {
      render(<Sidebar />)
      const active = link("Tablero")
      expect(active.className).not.toContain("bg-rose-500")
      expect(active.className).not.toMatch(/(^|\s)text-white/)
    })

    it("gives inactive items no rail, no aria-current and a subtle hover", () => {
      render(<Sidebar />)
      const inactive = link("Clientes")
      expect(inactive).not.toHaveAttribute("aria-current")
      expect(inactive.className).not.toContain("before:bg-accent-bar")
      expect(inactive.className).not.toContain("bg-shell-active")
      expect(inactive.className).toContain("hover:bg-shell-hover")
    })

    it("uses a single 220px expanded width (no 200px / xl 244px steps)", () => {
      render(<Sidebar />)
      const aside = screen.getByRole("complementary")
      expect(aside.className).toContain("w-[220px]")
      expect(aside.className).not.toContain("w-[200px]")
      expect(aside.className).not.toContain("xl:w-[244px]")
    })

    it("keeps the 72px collapsed rail with the same active treatment", () => {
      useSidebarStore.setState({ collapsed: true })
      render(<Sidebar />)
      const aside = screen.getByRole("complementary")
      expect(aside.className).toContain("w-[72px]")
      expect(aside.className).not.toContain("w-[220px]")
      // Icon-only links: the tooltip mock drops the aria-label, so find by href.
      const active = document.querySelector('a[href="/tablero"]')!
      expect(active).toHaveAttribute("aria-current", "page")
      expect(active.className).toContain("before:bg-accent-bar")
    })

    it("paints the sidebar from the theme-aware token, in the drawer too", () => {
      useSidebarStore.setState({ mobileOpen: true })
      render(<Sidebar />)
      expect(screen.getAllByRole("complementary")[0].className).toContain("bg-sidebar")
      expect(document.getElementById("sidebar-drawer")!.className).toContain("bg-sidebar")
    })

    it("swaps the logo per theme: colour on white, white variant on dark", () => {
      render(<Sidebar />)
      const color = document.querySelector('img[src="/brand/logo-color.svg"]')
      const white = document.querySelector('img[src="/brand/logo-blanco.svg"]')
      expect(color?.className).toContain("dark:hidden")
      expect(white?.className).toContain("hidden")
      expect(white?.className).toContain("dark:block")
    })
  })
})