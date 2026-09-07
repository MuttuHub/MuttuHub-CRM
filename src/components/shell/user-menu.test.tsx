import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CurrentUser } from "@/hooks/kanban"
import { UserMenu } from "./user-menu"

// The user menu used to fall back to a demo persona (DEMO_USER = "Adriana
// Gómez") whenever the resolved user was null. The layout passes
// `initialUser ?? null`, which react-query treats as settled data, so
// `isLoading` was false while GET /api/v1/auth/me was still in flight — the
// loading branch never ran and the demo name showed during load (and for 5
// minutes if /me failed, because the hook catches and resolves to null).
// Regression: the menu must show "…", never the demo persona.

const { toast, apiGet } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  apiGet: vi.fn<(path: string) => Promise<{ usuario: CurrentUser | null }>>(),
}))

vi.mock("sonner", () => ({ toast }))

vi.mock("@/lib/api/http", () => ({
  apiGet: (path: string) => apiGet(path),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const USUARIO_REAL: CurrentUser = {
  id: "u-1",
  nombre: "Felipe Ortiz",
  rol: "ADMINISTRADOR",
}

function renderMenu(initialUser?: CurrentUser | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <UserMenu initialUser={initialUser} />
    </QueryClientProvider>,
  )
}

function pendingMe(): (usuario: CurrentUser | null) => void {
  let resolveMe!: (value: { usuario: CurrentUser | null }) => void
  apiGet.mockReturnValue(
    new Promise<{ usuario: CurrentUser | null }>((resolve) => {
      resolveMe = resolve
    }),
  )
  return (usuario: CurrentUser | null) => resolveMe({ usuario })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("UserMenu — nunca muestra la persona demo", () => {
  it("con initialData=null y /me en vuelo muestra '…' y no 'Adriana Gómez' (regresión del bug)", () => {
    pendingMe()
    renderMenu(null)

    expect(screen.getAllByText("…").length).toBeGreaterThan(0)
    expect(screen.queryByText("Adriana Gómez")).toBeNull()
  })

  it("muestra el nombre real apenas responde /me", async () => {
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    renderMenu()

    await waitFor(() => {
      expect(screen.getByText("Felipe Ortiz")).toBeTruthy()
    })
    expect(screen.queryByText("Adriana Gómez")).toBeNull()
    expect(screen.queryByText("…")).toBeNull()
  })

  it("si /me resuelve null (fallo silencioso) sigue mostrando '…', no el mock", async () => {
    apiGet.mockResolvedValue({ usuario: null })
    renderMenu()

    await waitFor(() => {
      expect(screen.getAllByText("…").length).toBeGreaterThan(0)
    })
    expect(screen.queryByText("Adriana Gómez")).toBeNull()
  })
})

describe("UserMenu — pedido #2 del jefe: cambiar contraseña desde el panel", () => {
  it("abre el diálogo de cambiar contraseña desde el dropdown", async () => {
    const user = userEvent.setup()
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    renderMenu()

    await waitFor(() => screen.getByText("Felipe Ortiz"))
    await user.click(screen.getByRole("button", { name: "Menú de usuario" }))
    await user.click(
      await screen.findByRole("menuitem", { name: /cambiar contraseña/i }),
    )

    expect(
      await screen.findByRole("heading", { name: /cambiar contraseña/i }),
    ).toBeInTheDocument()
  })
})
