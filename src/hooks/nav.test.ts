import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import { useNavCounts, type NavCounts } from "./nav"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const COUNTS: NavCounts = { clientes: 12, tablero: 3, documentos: 0 }

describe("useNavCounts", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts loading and then resolves the counts from GET /api/v1/nav/counts", async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = res
      }),
    )

    const { result } = renderHook(() => useNavCounts(), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()

    await act(async () => {
      resolve(jsonResponse(COUNTS))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/nav/counts", expect.any(Object))
    await waitFor(() => expect(result.current.data).toEqual(COUNTS))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it("propagates the ApiError from a 500 response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500))

    const { result } = renderHook(() => useNavCounts(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).message).toBe("boom")
    expect((result.current.error as ApiError).status).toBe(500)
  })

  it("recovers via refetch after an error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
    fetchMock.mockResolvedValueOnce(jsonResponse(COUNTS))

    const { result } = renderHook(() => useNavCounts(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(result.current.isError).toBe(false))
    expect(result.current.data).toEqual(COUNTS)
  })
})