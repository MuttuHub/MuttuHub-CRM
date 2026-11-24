// Dashboard (S4): «Generar reporte» lleva a la vista de impresión de la cara activa en la misma pestaña (la
// vista trae su propio «Volver»), nunca con window.open.

import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardTabs } from "./dashboard-page"
import { useFiltersStore } from "@/store/filters"

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

  // Pendientes #27: a custom date range, local to the dashboard (the shared header range keeps its presets).
  function reporteQuery(): URLSearchParams {
    fireEvent.click(screen.getByRole("button", { name: /Generar reporte/ }))
    const url = String(router.push.mock.calls.at(-1)![0])
    return new URLSearchParams(url.split("?")[1] ?? "")
  }

  it("applies a custom range to the report and leaves the shared header range untouched", () => {
    useFiltersStore.setState({ rango: "90" })
    render(<DashboardTabs />)
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }))
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } })
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-31" } })

    const qs = reporteQuery()
    expect(qs.get("desde")).toBe("2026-10-01")
    expect(qs.get("hasta")).toBe("2026-10-31")
    expect(useFiltersStore.getState().rango).toBe("90")
  })

  it("refuses a range that ends before it starts and blocks the report", () => {
    render(<DashboardTabs />)
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }))
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-31" } })
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-01" } })

    expect(screen.getByText("La fecha inicial debe ser anterior o igual a la final.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Generar reporte/ })).toBeDisabled()
  })

  it("goes back to a preset: the custom dates stop applying and the preset is stored", () => {
    render(<DashboardTabs />)
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }))
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-31" } })
    fireEvent.click(screen.getByRole("button", { name: "Todo" }))

    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument()
    const qs = reporteQuery()
    expect(qs.get("desde")).toBeNull()
    expect(qs.get("hasta")).toBeNull()
    expect(useFiltersStore.getState().rango).toBe("todo")
  })

  it("keeps the presets working as before (30 días: desde only)", () => {
    render(<DashboardTabs />)
    fireEvent.click(screen.getByRole("button", { name: "30 días" }))
    const qs = reporteQuery()
    expect(qs.get("desde")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(qs.get("hasta")).toBeNull()
    expect(useFiltersStore.getState().rango).toBe("30")
  })
})
