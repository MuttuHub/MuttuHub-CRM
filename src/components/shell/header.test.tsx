import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSidebarStore } from "@/store/sidebar"
import { useFiltersStore } from "@/store/filters"
import { Header } from "./header"

// Audit UX Critical #4: on a 390px mobile viewport the shared page header
// broke two ways — the title "Proyectos" got clipped to "Proyecto", and the
// longer title "Repositorio documental" (on /documentos) overlapped the
// right-hand icon row (theme toggle, notifications, user avatar). Both bugs
// came from the title block and the icon row competing for the same row's
// width with no fallback to a second line. The fix wraps the icon row onto
// its own row below the title on narrow screens (`flex-col` + `sm:flex-row`)
// instead of forcing both into one row.

let currentPath = "/proyectos"

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}))

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string) => Promise<unknown>>(async () => ({ usuario: null })),
}))

vi.mock("@/lib/api/http", () => ({
  apiGet: (path: string) => apiGet(path),
}))

// NotificationPanel has their own dedicated tests (and their
// own data fetching); Header only needs to render them, so they are stubbed
// here to keep this test focused on Header's own layout/behavior.
vi.mock("@/components/shell/notification-panel", () => ({
  NotificationPanel: () => (
    <button type="button" aria-label="Notificaciones, 0 sin leer">
      Notificaciones
    </button>
  ),
  notificationQueryKey: ["notifications"],
}))

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Header />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSidebarStore.setState({ collapsed: false, mobileOpen: false })
  useFiltersStore.setState({ rango: "mes" })
})

describe("Header — layout compartido roto en mobile (audit Critical #4)", () => {
  it("on /proyectos renders the full title 'Proyectos', not clipped to 'Proyecto'", () => {
    currentPath = "/proyectos"
    renderHeader()

    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.textContent).toBe("Proyectos")
  })

  it("on /documentos renders the full title and every icon-row control stays accessible (no overlap)", () => {
    currentPath = "/documentos"
    renderHeader()

    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.textContent).toBe("Repositorio documental")

    // All icon-row controls must still be present and individually
    // clickable — the regression made the title overlap this row on mobile.
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activar modo oscuro" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Notificaciones, 0 sin leer" })).toBeInTheDocument()
  })

  it("stacks the title above the icon row on mobile instead of forcing them side by side", () => {
    currentPath = "/documentos"
    const { container } = renderHeader()

    // jsdom does not perform real layout (no computed widths/overflow), so
    // clipping/overlap itself cannot be asserted directly here. As the one
    // reasonable proxy, we assert the root row uses a mobile-first column
    // layout that switches to a row from `sm:` up — the actual mechanism
    // that gives the title full width on mobile and pushes the icon row to
    // its own line, instead of both fighting for one row's width.
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain("flex-col")
    expect(root.className).toMatch(/sm:flex-row/)
  })
})

// V1.2 (D9): profile + Salir moved to the sidebar; the header hosts the shared
// PageHeader for the title block.
describe("Header — V1.2", () => {
  it("no longer renders the user menu (moved to the sidebar)", () => {
    currentPath = "/proyectos"
    renderHeader()
    expect(screen.queryByRole("button", { name: "Menú de usuario" })).toBeNull()
  })

  it("renders its title block through the shared PageHeader", () => {
    currentPath = "/proyectos"
    const { container } = renderHeader()
    const slot = container.querySelector('[data-slot="page-header"]')
    expect(slot).not.toBeNull()
    expect(slot!.querySelector("h1")?.textContent).toBe("Proyectos")
  })
})
