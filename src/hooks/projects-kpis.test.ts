// S9 U6: KPI and portfolio hooks and the Excel downloads. Real hooks; only `fetch` is mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  downloadPortfolioExport,
  downloadProjectExport,
  projectQueryKeys,
  useProjectKpis,
  useProjectsPortfolio,
} from "./projects"

let queryClient: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("S9 hooks", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("keys: the portfolio key carries every filter, the kpis key the corte and the base", () => {
    expect(projectQueryKeys.portfolio({ estado: "EN_EJECUCION", corte: "2026-03-15" })).not.toEqual(projectQueryKeys.portfolio({ corte: "2026-03-15" }))
    expect(projectQueryKeys.kpis("p1", null, "vigente")).not.toEqual(projectQueryKeys.kpis("p1", null, "original"))
    expect(projectQueryKeys.kpis("p1", "2026-03-15")).not.toEqual(projectQueryKeys.kpis("p1", null))
  })

  it("useProjectKpis asks the route with corte and base only when given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ base: "original", corte: "2026-03-15", medible: true }))
    const { result } = renderHook(() => useProjectKpis("p1", "2026-03-15", "original"), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/projects/p1/kpis?corte=2026-03-15&base=original")

    fetchMock.mockClear()
    renderHook(() => useProjectKpis("p2", null), { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/projects/p2/kpis")
  })

  it("useProjectsPortfolio sends the non-empty filters and refetches when one changes", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ corte: "2026-03-15", proyectos: [] }))
    const { result, rerender } = renderHook(({ filters }) => useProjectsPortfolio(filters), {
      wrapper,
      initialProps: { filters: { corte: "2026-03-15", estado: "", linea_id: "l1" } },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/dashboard/portfolio?corte=2026-03-15&linea_id=l1")

    rerender({ filters: { corte: "2026-03-15", estado: "EN_EJECUCION", linea_id: "l1" } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/dashboard/portfolio?corte=2026-03-15&estado=EN_EJECUCION&linea_id=l1")
  })

  it("useProjectsPortfolio does not fire when disabled", () => {
    renderHook(() => useProjectsPortfolio({}, { enabled: false }), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("downloadProjectExport fetches the route and saves the blob under the server's file name", async () => {
    const click = vi.fn()
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => "blob:x")
    URL.revokeObjectURL = vi.fn()
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click)
    fetchMock.mockResolvedValue(new Response(new Blob(["x"]), { headers: { "Content-Disposition": 'attachment; filename="PRY-1-financiera.xlsx"' } }))
    await downloadProjectExport("p1", { ficha: "financiera", corte: "2026-03", base: "original" })
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/projects/p1/export?ficha=financiera&corte=2026-03&base=original")
    expect(click).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
  })

  it("downloadPortfolioExport hits the export route with the filters and surfaces a server error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "No tienes permisos para ver el tablero de proyectos.", code: "FORBIDDEN" }, 403))
    await expect(downloadPortfolioExport({ corte: "2026-03-15", estado: "EN_EJECUCION" })).rejects.toThrow("No tienes permisos para ver el tablero de proyectos.")
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/dashboard/portfolio/export?corte=2026-03-15&estado=EN_EJECUCION")
  })
})
