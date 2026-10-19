import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { documentQueryKeys, useDeleteDocument, useUploadDocument, type DocumentUploadResponse } from "./documents"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, invalidateSpy }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const UPLOADED: DocumentUploadResponse = {
  id: "doc-1",
  titulo: "Informe final",
  categoria: "Comercial",
  etiquetas: [],
  autor_id: "u1",
  autor_nombre: "Ana",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  cliente_ids: [],
  clientes: [],
  version_activa: null,
  version: 1,
}

describe("useUploadDocument / useDeleteDocument", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Bug report: uploading a document updated the Repository list but never
  // refreshed the sidebar's "documentos" badge (GET /api/v1/nav/counts just
  // counts Documento rows — nothing told it to refetch).
  it("invalidates both the document list and the nav counts badge on upload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(UPLOADED, 201))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useUploadDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] });
  })

  it("invalidates the nav counts badge on delete too", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useDeleteDocument("doc-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] })
  })
})
