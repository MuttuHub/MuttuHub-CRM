import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CurrentUser } from "@/hooks/kanban"
import { SidebarProfile } from "./sidebar-profile"

// The profile block (ex header user menu) used to fall back to a demo persona (DEMO_USER = "Adriana
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

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}))

const USUARIO_REAL: CurrentUser = {
  id: "u-1",
  nombre: "Felipe Ortiz",
  rol: "ADMINISTRADOR",
}

function renderMenu(initialUser?: CurrentUser | null, rail = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SidebarProfile initialUser={initialUser} rail={rail} />
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

describe("SidebarProfile — nunca muestra la persona demo", () => {
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

describe("SidebarProfile — pedido #2 del jefe: cambiar contraseña desde el panel", () => {
  it("abre el diálogo de cambiar contraseña desde el botón del bloque", async () => {
    const user = userEvent.setup()
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    renderMenu()

    await waitFor(() => screen.getByText("Felipe Ortiz"))
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }))

    expect(
      await screen.findByRole("heading", { name: /cambiar contraseña/i }),
    ).toBeInTheDocument()
  })
})

// V1.2 (D9: profile + Salir live in the sidebar only).
describe("SidebarProfile — bloque de perfil y Salir (V1.2)", () => {
  it("muestra iniciales, nombre y rol", async () => {
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    renderMenu()

    await waitFor(() => screen.getByText("Felipe Ortiz"))
    expect(screen.getByText("FO")).toBeInTheDocument()
    expect(screen.getByText("Administrador")).toBeInTheDocument()
  })

  it("expone un botón visible 'Salir' que cierra la sesión (POST logout + redirect)", async () => {
    const user = userEvent.setup()
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    renderMenu()

    await waitFor(() => screen.getByText("Felipe Ortiz"))
    await user.click(screen.getByRole("button", { name: "Salir" }))

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/logout", { method: "POST" })
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"))
    vi.unstubAllGlobals()
  })

  it("si el logout falla avisa con un toast y vuelve a habilitar Salir", async () => {
    const user = userEvent.setup()
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    renderMenu()

    await waitFor(() => screen.getByText("Felipe Ortiz"))
    await user.click(screen.getByRole("button", { name: "Salir" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "Salir" })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("en modo rail oculta nombre/rol pero mantiene Salir y Cambiar contraseña accesibles", async () => {
    apiGet.mockResolvedValue({ usuario: USUARIO_REAL })
    renderMenu(undefined, true)

    await waitFor(() => screen.getByText("FO"))
    expect(screen.queryByText("Felipe Ortiz")).toBeNull()
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cambiar contraseña/i })).toBeInTheDocument()
  })
})
