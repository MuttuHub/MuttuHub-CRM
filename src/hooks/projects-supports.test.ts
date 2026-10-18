// Project-origin documents of the Documentos tab: create (signed upload or link), delete and open.
// Real hooks, only `fetch` and `window.open` are mocked, same as projects.test.ts.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  downloadProjectDocument,
  projectQueryKeys,
  useCreateProjectDocument,
  useDeleteProjectDocument,
} from "./projects"

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, invalidate }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const SIGNED = {
  storage_path: "proyectos/p1/soportes/u_contrato.pdf",
  token: "tok",
  signed_url: "https://storage.example/up",
  max_bytes: 10,
  allowed_extensions: ["pdf"],
}

describe("project documents hooks", () => {
  const fetchMock = vi.fn()
  const openMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    openMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("open", openMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("uploads a file: sign, PUT to storage, confirm, then refreshes the supports list", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/supports/sign")) return Promise.resolve(jsonResponse(SIGNED))
      if (url === SIGNED.signed_url) return Promise.resolve(new Response(null, { status: 200 }))
      return Promise.resolve(jsonResponse({ soporte: { id: "d1" } }, 201))
    })
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useCreateProjectDocument("p1"), { wrapper })
    const file = new File(["%PDF"], "contrato.pdf", { type: "application/pdf" })

    await act(() => result.current.mutateAsync({ tipo: "archivo", file }))

    const calls = fetchMock.mock.calls.map((call) => [String(call[0]), (call[1] as RequestInit | undefined)?.method])
    expect(calls).toEqual([
      ["/api/v1/projects/p1/supports/sign", "POST"],
      [SIGNED.signed_url, "PUT"],
      ["/api/v1/projects/p1/supports", "POST"],
    ])
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({
      storage_path: SIGNED.storage_path,
      nombre: "contrato.pdf",
      tamano_bytes: 4,
      tipo_mime: "application/pdf",
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.supports("p1") })
  })

  it("stores a link with its name in one call", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ soporte: { id: "d1" } }, 201)))
    const { wrapper } = setup()
    const { result } = renderHook(() => useCreateProjectDocument("p1"), { wrapper })

    await act(() => result.current.mutateAsync({ tipo: "enlace", url_externa: "https://x.test/a", nombre: "Acta" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/projects/p1/supports")
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      url_externa: "https://x.test/a",
      nombre: "Acta",
    })
  })

  it("surfaces a storage failure and never confirms", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/supports/sign")) return Promise.resolve(jsonResponse(SIGNED))
      return Promise.resolve(new Response(null, { status: 500 }))
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useCreateProjectDocument("p1"), { wrapper })
    const file = new File(["x"], "contrato.pdf", { type: "application/pdf" })

    await act(async () => {
      await expect(result.current.mutateAsync({ tipo: "archivo", file })).rejects.toThrow()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("deletes a document and refreshes the supports list", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ soporte: { id: "d1" } })))
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(() => useDeleteProjectDocument("p1"), { wrapper })

    await act(() => result.current.mutateAsync("d1"))

    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/projects/p1/supports/d1")
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.supports("p1") }))
  })

  it("opens a project document through its download route, never caching the URL", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 })),
    )
    await downloadProjectDocument("p1", "d1")
    await downloadProjectDocument("p1", "d1")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/projects/p1/supports/d1/download")
    expect(openMock).toHaveBeenCalledWith("https://s.example/dl", "_blank", "noopener,noreferrer")
  })
})
