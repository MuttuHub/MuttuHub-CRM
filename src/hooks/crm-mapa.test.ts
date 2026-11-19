// V5: the allies map aggregates clients by departamento, so every client write must refresh it too;
// otherwise a client moved to another departamento stays on its old tile until the page is reopened.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useCreateClient, useDeleteClient, useUpdateClient } from "./crm"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, invalidateSpy }
}

const ok = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("client writes refresh the allies map (V5)", () => {
  const fetchMock = vi.fn()
  beforeEach(() => vi.stubGlobal("fetch", fetchMock))
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it("useUpdateClient invalidates the map", async () => {
    fetchMock.mockResolvedValueOnce(ok({ cliente: { id: "c-1" } }))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useUpdateClient("c-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ departamento: "Atlántico" } as never)
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients", "map"] })
  })

  it("useCreateClient invalidates the map", async () => {
    fetchMock.mockResolvedValueOnce(ok({ cliente: { id: "c-2" } }, 201))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useCreateClient(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ nombre: "Nuevo" } as never)
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients", "map"] })
  })

  it("useDeleteClient invalidates the map", async () => {
    fetchMock.mockResolvedValueOnce(ok(null, 204))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useDeleteClient("c-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients", "map"] })
  })
})
