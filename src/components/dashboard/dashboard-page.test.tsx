// Dashboard (S4): «Generar reporte» lleva a la vista de impresión de la cara activa en la misma pestaña (la
// vista trae su propio «Volver»), nunca con window.open.

import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardTabs } from "./dashboard-page"

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }))

vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/hooks/crm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/crm")>()),
  useUsers: () => ({ data: [], isLoading: false }),
}))
vi.mock("@/components/dashboard/cara-pipeline", () => ({ CaraPipeline: () => null }))
vi.mock("@/components/dashboard/cara-tasks", () => ({ CaraTareas: () => null }))
vi.mock("@/components/dashboard/cara-clients-activity", () => ({ CaraClientesActividad: () => null }))
vi.mock("@/components/dashboard/cara-my-summary", () => ({ CaraMiResumen: () => null }))

describe("DashboardTabs", () => {
  const open = vi.fn()

  beforeEach(() => {
    router.push.mockReset()
    open.mockReset()
    vi.stubGlobal("open", open)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("opens the printable report of the active cara in the same tab (S4)", () => {
    render(<DashboardTabs />)

    fireEvent.click(screen.getByRole("button", { name: /Gestión de tareas/ }))
    fireEvent.click(screen.getByRole("button", { name: /Generar reporte/ }))

    expect(router.push).toHaveBeenCalledTimes(1)
    expect(String(router.push.mock.calls[0][0])).toMatch(/^\/print\/dashboard\/tasks(\?|$)/)
    expect(open).not.toHaveBeenCalled()
  })
})
