import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { adminQueryKeys, useSaveSettings, type SettingsSnapshot } from "./admin"
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
  })

  // admin-umbrales-semaforo-ui: the new UmbralesSection sends semaforo_umbrales
  // in the input snapshot; CatalogsSection keeps sending SNAPSHOT without it,
  // so the PUT body must omit the key entirely rather than send `undefined`.
  it("omits semaforo_umbrales from the PUT body when the input snapshot doesn't set it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useSaveSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(SNAPSHOT)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse((init as RequestInit).body as string)
    expect(sentBody).not.toHaveProperty("semaforo_umbrales")
  })

  it("includes semaforo_umbrales in the PUT body when the input snapshot sets it", async () => {
    const umbrales = {
      confirmado: true,
      tecnico: { verde: 0.9, rojo: 0.5 },
      financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
    }
    fetchMock.mockResolvedValue(jsonResponse({ ...SNAPSHOT, semaforo_umbrales: umbrales }))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useSaveSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ ...SNAPSHOT, semaforo_umbrales: umbrales })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse((init as RequestInit).body as string)
    expect(sentBody.semaforo_umbrales).toEqual(umbrales)
  })
})
