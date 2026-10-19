// S8 U6: versions, comparison and modification hooks, and the `base` of the two ficha queries. Real
// hooks, only `fetch` and `sonner` are mocked, same as projects-ejecucion.test.ts.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ModificacionReglasError,
  projectQueryKeys,
  useApproveModification,
  useProjectFinancialSheet,
  useProjectModifications,
  useProjectTechnicalStatus,
  useProjectVersionCompare,
  useProjectVersions,
  useRejectModification,
  useRequestModification,
} from "./projects"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

let queryClient: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const SOLICITUD = {
  id: "s1",
  tipo: "TRASLADO",
  motivo: "Mover",
  detalle: [],
  version_base_numero: 0,
  estado: "PENDIENTE",
  solicitado_por: { id: "u1", nombre: "Ana" },
  solicitado_at: "2026-10-08T12:00:00.000Z",
  decidido_por: null,
  decidido_at: null,
  comentario_decision: null,
  version_numero: null,
}
const BODY = {
  tipo: "TRASLADO" as const,
  motivo: "Mover transporte",
  detalle: [{ elemento: "presupuesto" as const, clave: "R12", campo: "asignado", antes: "24000000", despues: "23000000" }],
}

describe("S8 hooks", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reads the versions, the comparison and the modification requests", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/versions/compare")) return Promise.resolve(jsonResponse({ desde: "0", hasta: "vigente", diferencias: [{ elemento: "presupuesto", clave: "R12", campo: "asignado", desde: "1.00", hasta: "2.00" }] }))
      if (url.endsWith("/versions")) return Promise.resolve(jsonResponse({ versiones: [{ numero: 0 }] }))
      return Promise.resolve(jsonResponse({ solicitudes: [SOLICITUD] }))
    })

    const versiones = renderHook(() => useProjectVersions("p1"), { wrapper })
    await waitFor(() => expect(versiones.result.current.data).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions", expect.any(Object))

    const comparacion = renderHook(() => useProjectVersionCompare("p1", "0", "vigente"), { wrapper })
    await waitFor(() => expect(comparacion.result.current.data?.diferencias).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/compare?from=0&to=vigente", expect.any(Object))

    const solicitudes = renderHook(() => useProjectModifications("p1"), { wrapper })
    await waitFor(() => expect(solicitudes.result.current.data).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/modifications", expect.any(Object))
  })

  it("passes `base` to the financial sheet and the technical status, and keeps the keys apart", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ base: "original" })))
    renderHook(() => useProjectFinancialSheet("p1", "2026-11", "original"), { wrapper })
    renderHook(() => useProjectFinancialSheet("p1", null), { wrapper })
    renderHook(() => useProjectTechnicalStatus("p1", "original"), { wrapper })
    renderHook(() => useProjectTechnicalStatus("p1"), { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toContain("/api/v1/projects/p1/financial-sheet?corte=2026-11&base=original")
    expect(urls).toContain("/api/v1/projects/p1/financial-sheet")
    expect(urls).toContain("/api/v1/projects/p1/technical-status?base=original")
    expect(urls).toContain("/api/v1/projects/p1/technical-status")
    expect(projectQueryKeys.technicalStatus("p1", "original")).not.toEqual(projectQueryKeys.technicalStatus("p1", "vigente"))
    expect(projectQueryKeys.technicalStatus("p1")).toEqual(["projects", "technical-status", "p1"])
  })

  it("requests a modification, refreshes the list and toasts; the broken rules arrive without a toast", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ solicitud: SOLICITUD }, 201)))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRequestModification("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(BODY)
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/modifications")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual(BODY)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.modifications("p1") })
    expect(toast.success).toHaveBeenCalledWith("Solicitud de modificación enviada.")

    toast.success.mockReset()
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).", code: "VALIDATION_ERROR", reglas: [{ codigo: "A_MENOR_QUE_EJECUTADO", mensaje: "uno" }, { codigo: "PERIODO_PASADO", mensaje: "dos" }] }, 400)),
    )
    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync(BODY).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ModificacionReglasError)
    expect((error as ModificacionReglasError).reglas.map((r) => r.mensaje)).toEqual(["uno", "dos"])
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("approves: refreshes everything a new version changes and toasts", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ version: { id: "v1", numero: 1, aprobado_at: "x" }, solicitud: SOLICITUD })))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useApproveModification("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("s1")
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/modifications/s1/approve")
    expect(init.method).toBe("POST")
    const claves = invalidate.mock.calls.map(([filtro]) => JSON.stringify((filtro as { queryKey: unknown }).queryKey))
    for (const esperada of [
      projectQueryKeys.modifications("p1"),
      projectQueryKeys.versions("p1"),
      projectQueryKeys.budget("p1"),
      projectQueryKeys.programming("p1"),
      projectQueryKeys.activities("p1"),
      projectQueryKeys.technicalStatus("p1"),
      ["projects", "financial-sheet", "p1"],
      ["projects", "version-compare", "p1"],
    ]) {
      expect(claves).toContain(JSON.stringify(esperada))
    }
    expect(toast.success).toHaveBeenCalledWith("Modificación aprobada.")
  })

  it("surfaces the approval 400 rules and a 409 inline, without a toast", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: "La solicitud se basa en una versión anterior; vuelve a crearla.", code: "INVALID_STATE" }, 409)))
    const { result } = renderHook(() => useApproveModification("p1"), { wrapper })
    let error: unknown
    await act(async () => {
      error = await result.current.mutateAsync("s1").catch((e: unknown) => e)
    })
    expect((error as Error).message).toBe("La solicitud se basa en una versión anterior; vuelve a crearla.")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("rejects with the comment", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ solicitud: { ...SOLICITUD, estado: "RECHAZADA" } })))
    const { result } = renderHook(() => useRejectModification("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ solicitudId: "s1", comentario: "No hay presupuesto" })
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/modifications/s1/reject")
    expect(JSON.parse(String(init.body))).toEqual({ comentario: "No hay presupuesto" })
    expect(toast.success).toHaveBeenCalledWith("Solicitud rechazada.")
  })
})
