import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Header } from "./header"

const { nav } = vi.hoisted(() => ({ nav: { pathname: "/" } }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@/lib/api/http", () => ({ apiGet: vi.fn(async () => ({})) }))
vi.mock("@/components/shell/notification-panel", () => ({
  NotificationPanel: () => <div data-testid="notifications" />,
  notificationQueryKey: ["notifications"],
}))
vi.mock("@/components/shell/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}))

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Header initialUser={{ id: "u-1", nombre: "Felipe Ortiz", rol: "ADMINISTRADOR" }} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  nav.pathname = "/"
})

describe("Header title", () => {
  it("renders no h1 on the project ficha but keeps the controls", () => {
    nav.pathname = "/proyectos/3f2b8c1e-0000-4000-8000-000000000001"
    renderHeader()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByText("Muttu Hub")).toBeNull()
    expect(screen.getByTestId("notifications")).toBeTruthy()
    expect(screen.getByTestId("user-menu")).toBeTruthy()
    expect(screen.getByRole("button", { name: /modo (oscuro|claro)/i })).toBeTruthy()
  })

  it("keeps Proyectos as h1 on the list", () => {
    nav.pathname = "/proyectos"
    renderHeader()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Proyectos")
  })

  it("falls back to Muttu Hub on an unknown route", () => {
    nav.pathname = "/desconocida"
    renderHeader()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Muttu Hub")
  })
})
