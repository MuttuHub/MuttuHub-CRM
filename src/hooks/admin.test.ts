import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { adminQueryKeys, useSaveSettings, useTaskTags, type SettingsSnapshot } from "./admin"
import { documentQueryKeys } from "./documents"

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

const SNAPSHOT: SettingsSnapshot = {
  task_tags: ["Comercial"],
  doc_categories: [{ nombre: "Comercial", restringida: false }],
}

describe("useSaveSettings", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Code review finding on PR #19: saving doc_categories only invalidated
  // adminQueryKeys.settings, not documentQueryKeys.categories (the key
  // useDocCategories uses) — an already-mounted upload dialog or the
  // Repository's filters kept showing the stale catalog after a save.
  it("invalidates both the admin settings cache and the live doc categories cache", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useSaveSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(SNAPSHOT)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.settings })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.categories })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.taskTags })
  })
})

describe("useTaskTags", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Jefe 2026-10-28 lane 1 task 1.1 (S1): a tag created in admin must reach
  // the task forms without a reload. useTaskTags reads the same public
  // catalogs endpoint as useDocCategories — no admin role required — so the
  // chips always mirror what the server validates on POST/PATCH /tasks.
  it("serves the live task-tags catalog from the public catalogs endpoint", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ task_tags: ["Legal", "Alianza regional"], doc_categories: [] }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTaskTags(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(["Legal", "Alianza regional"]))
  })
})
