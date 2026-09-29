import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SESSION, SESSION_STORAGE_KEY } from "@/lib/auth/types"
import { SessionBanner } from "./session-banner"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: () => Promise.resolve() } }),
}))

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
})

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe("SessionBanner", () => {
  it("renders nothing before the warning window", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, String(Date.now() + SESSION.durationMs))
    render(<SessionBanner />)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("renders a non-dismissible alert with alerta tokens and no shadow", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, String(Date.now() + 5 * 60 * 1000))
    render(<SessionBanner />)

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Tu sesión se cerrará en 10 minutos.")
    expect(alert.className).toContain("bg-alerta-bg")
    expect(alert.className).toContain("text-alerta")
    expect(alert.className).not.toMatch(/shadow/)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
