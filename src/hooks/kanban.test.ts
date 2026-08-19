import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { taskQueryKeys, useUploadAttachment } from "./kanban"

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

describe("useUploadAttachment", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Bug report: uploading a task attachment mirrors it into the Document
  // Repository (POST /api/v1/tasks/[id]/attachments does this server-side),
  // which changes the count GET /api/v1/nav/counts returns — but nothing
  // invalidated ["nav","counts"], so the sidebar's "documentos" badge stayed
  // stale after the upload.
  it("invalidates both the task's attachments and the nav counts badge", async () => {
    const adjunto = { adjunto: { id: "adj-1", nombre: "informe.pdf", tamano_bytes: 3, created_at: "2026-01-01T00:00:00.000Z" } }
    fetchMock.mockResolvedValue(jsonResponse(adjunto, 201))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useUploadAttachment("task-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(new File(["x"], "informe.pdf"))
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.attachments("task-1") })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] })
  })
})
