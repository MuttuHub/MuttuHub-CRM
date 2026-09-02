import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as kanban from "./kanban"
import { taskQueryKeys, useTasks, useUploadAttachment } from "./kanban"
import type { TaskItem, TaskListResponse } from "./crm"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, invalidateSpy }
}

function makeTask(id: string): TaskItem {
  return {
    id,
    titulo: `Tarea ${id}`,
    descripcion: null,
    responsable_id: "u-1",
    responsable_nombre: "User",
    cliente_id: null,
    cliente_nombre: null,
    estado: "POR_HACER",
    origen: "KANBAN",
    prioridad: null,
    fecha_entrega: null,
    etiquetas: [],
    motivo_bloqueo: null,
    comentarios_count: 0,
    subtotal: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    puede_editar: false,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function pageResponse(
  page: number,
  limit: number,
  total: number,
  items: TaskItem[],
): TaskListResponse {
  return { page, limit, total, items }
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

// PR 6: prioriy/tag/date filters moved to the server (synthetic-rabin
// §"El tope de 100"). The client-side helpers (`applyLocalFilters`,
// `localFiltersActive`, `LocalTaskFilters`, `EMPTY_LOCAL_TASK_FILTERS`) are
// no longer needed — the kanban feeds them as server params instead. The
// board now reads the honest `total` from the API response and renders the
// truncation banner when items.length < total.
//
// Runtime check: the four names must NOT be exported. The TypeScript-level
// half of the invariant (no remaining type references) is caught by the build.
describe("PR 6 — local filter helpers removed", () => {
  it("does not export applyLocalFilters", () => {
    expect((kanban as Record<string, unknown>).applyLocalFilters).toBeUndefined()
  })

  it("does not export localFiltersActive", () => {
    expect((kanban as Record<string, unknown>).localFiltersActive).toBeUndefined()
  })

  it("does not export EMPTY_LOCAL_TASK_FILTERS", () => {
    expect((kanban as Record<string, unknown>).EMPTY_LOCAL_TASK_FILTERS).toBeUndefined()
  })
})

// PR 7 (close-phase-1) — `useInfiniteQuery` pagination replaces the flat
// `limit: 100` cap. Server already paginates (GET /api/v1/tasks accepts
// page/limit and returns `page`, `limit`, `total`, `items`); the hook now
// uses TanStack's `useInfiniteQuery` so the kanban board can show every
// task instead of a silent 100-row cut. Spec scenarios from
// openspec/changes/close-phase-1/specs/global-task-board/spec.md §PR 7.
//
// Board-level assertions ("Cargar más" visible / absent) live in the hook
// tests because the same `hasNextPage` boolean drives the button — a render
// test of the board would mostly exercise our own wiring, not the
// pagination contract.
describe("PR 7 — useTasks pagination (useInfiniteQuery)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests page=1 with limit=100 on the first render", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(1, 100, 150, [makeTask("t1"), makeTask("t2")])),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTasks({}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain("/api/v1/tasks?")
    expect(calledUrl).toContain("page=1")
    expect(calledUrl).toContain("limit=100")
  })

  it("exposes the first page's items via data.pages", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(1, 100, 150, [makeTask("t1"), makeTask("t2")])),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTasks({}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.data?.pages[0]?.items.map((t) => t.id)).toEqual(["t1", "t2"])
    expect(result.current.data?.pages[0]?.total).toBe(150)
  })

  it("reports hasNextPage true when accumulated items < total", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(1, 100, 200, [makeTask("t1")])),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTasks({}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)
  })

  it("reports hasNextPage false when accumulated items === total", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(1, 100, 2, [makeTask("t1"), makeTask("t2")])),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTasks({}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(false)
  })

  it("fetchNextPage requests page=2 and appends items without duplicates", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(1, 100, 4, [makeTask("t1"), makeTask("t2")])),
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse(pageResponse(2, 100, 4, [makeTask("t3"), makeTask("t4")])),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTasks({}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    const flat = result.current.data?.pages.flatMap((p) => p.items) ?? []
    expect(flat.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"])
    // No duplicates across the appended page.
    expect(new Set(flat.map((t) => t.id)).size).toBe(flat.length)
    // Loaded everything → no more pages.
    expect(result.current.hasNextPage).toBe(false)
    // The second fetch used page=2 (pageParam semantics).
    const secondUrl = String(fetchMock.mock.calls[1][0])
    expect(secondUrl).toContain("page=2")
  })
})
