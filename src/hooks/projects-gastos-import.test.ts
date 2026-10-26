// Hooks of the expenses import (B8): attach a support to an existing expense (S2) and, below, the
// workbook import. The mutations are real; only `fetch` and `sonner` are mocked.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import { useAttachExpenseSupport } from "./projects"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const fetchMock = vi.fn()
let queryClient: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

describe("useAttachExpenseSupport", () => {
  it("posts a link straight to the expense attachments and refreshes the expenses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gasto: { id: "g1" } }, 201))
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", soporte: { tipo: "enlace", url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" } })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/v1/projects/p1/expenses/g1/attachments")
    expect(init.method).toBe("POST")
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" })
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toContainEqual(["projects", "expenses"])
  })

  it("signs, uploads the file and then confirms it (sign -> PUT -> attachments)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ storage_path: "proyectos/p1/soportes/k_f.pdf", token: "t", signed_url: "https://storage.example.com/up", max_bytes: 1, allowed_extensions: [] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ gasto: { id: "g1" } }, 201))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })
    const file = new File([new Uint8Array(8)], "factura.pdf", { type: "application/pdf" })

    await act(async () => {
      await result.current.mutateAsync({ id: "g1", soporte: { tipo: "archivo", file } })
    })

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/projects/p1/expenses/sign",
      "https://storage.example.com/up",
      "/api/v1/projects/p1/expenses/g1/attachments",
    ])
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ nombre: "factura.pdf", tamano_bytes: 8, tipo_mime: "application/pdf" })
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("PUT")
    expect(bodyOf(fetchMock.mock.calls[2])).toEqual({
      storage_path: "proyectos/p1/soportes/k_f.pdf",
      nombre: "factura.pdf",
      tamano_bytes: 8,
      tipo_mime: "application/pdf",
    })
  })

  it("does not confirm anything when the upload fails and keeps the server error", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ storage_path: "k", token: "t", signed_url: "https://storage.example.com/up", max_bytes: 1, allowed_extensions: [] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync({ id: "g1", soporte: { tipo: "archivo", file: new File([new Uint8Array(1)], "a.pdf") } })
        .catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("rethrows the API error of the attach (for example the 5-support limit) without a toast", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Puedes adjuntar máximo 5 soportes.", code: "VALIDATION_ERROR" }, 400))
    const { result } = renderHook(() => useAttachExpenseSupport("p1"), { wrapper })

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync({ id: "g1", soporte: { tipo: "enlace", url_externa: "https://x.co", nombre: "x" } })
        .catch((e: unknown) => e)
    })
    expect((error as ApiError).message).toBe("Puedes adjuntar máximo 5 soportes.")
    expect((error as ApiError).status).toBe(400)
    expect(toast.error).not.toHaveBeenCalled()
  })
})
