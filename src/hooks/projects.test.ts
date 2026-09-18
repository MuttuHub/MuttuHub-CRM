import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  projectDetailQueryKeys,
  useActivities,
  useAttachments,
  useDeleteAttachment,
  useGoals,
  useProjectDetail,
  useUploadAttachment,
} from "./projects"

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

describe("useProjectDetail", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("fetches the project detail from the right endpoint", async () => {
    const proyecto = { id: "proy-1", codigo: "P-01", nombre: "Proyecto Uno" }
    fetchMock.mockResolvedValue(jsonResponse({ proyecto }))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useProjectDetail("proy-1"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ id: "proy-1", codigo: "P-01" })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/proy-1",
      expect.objectContaining({ method: "GET" }),
    )
  })
})

describe("useGoals", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("fetches the metas for the project", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ metas: [{ id: "meta-1", nombre: "Meta Uno" }] }))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useGoals("proy-1"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/proy-1/goals",
      expect.objectContaining({ method: "GET" }),
    )
  })
})

describe("useActivities", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("fetches the actividades for the project", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ actividades: [{ id: "act-1", meta_id: "meta-1", fecha_planificada: "2026-01-01" }] }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useActivities("proy-1"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/proy-1/activities",
      expect.objectContaining({ method: "GET" }),
    )
  })
})

describe("useAttachments", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("fetches the soportes for the project", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ soportes: [{ id: "sop-1", nombre: "Acta.pdf", download_url: null }] }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAttachments("proy-1"), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/proy-1/attachments",
      expect.objectContaining({ method: "GET" }),
    )
  })
})

describe("useUploadAttachment", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("posts a multipart form with the file (not the url field) and invalidates the attachments list", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ soporte: { id: "sop-1", nombre: "Acta.pdf", download_url: null } }, 201),
    )
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useUploadAttachment("proy-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        nombre: "Acta.pdf",
        tipo: "VERIFICACION",
        file: new File(["x"], "Acta.pdf"),
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/api/v1/projects/proy-1/attachments")
    expect(init.method).toBe("POST")
    const form = init.body as FormData
    expect(form.get("nombre")).toBe("Acta.pdf")
    expect(form.get("tipo")).toBe("VERIFICACION")
    expect(form.get("file")).toBeInstanceOf(File)
    expect(form.get("url")).toBeNull()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectDetailQueryKeys.attachments("proy-1") })
  })

  it("posts a multipart form with the url (not the file field) when uploading a link", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ soporte: { id: "sop-2", nombre: "Enlace", download_url: "https://drive.example/x" } }, 201),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useUploadAttachment("proy-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        nombre: "Enlace",
        tipo: "LEGALIZACION",
        url: "https://drive.example/x",
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [, init] = fetchMock.mock.calls[0]!
    const form = init.body as FormData
    expect(form.get("url")).toBe("https://drive.example/x")
    expect(form.get("file")).toBeNull()
  })
})

describe("useDeleteAttachment", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("deletes the soporte and invalidates the attachments list", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useDeleteAttachment("proy-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("sop-1")
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/proy-1/attachments/sop-1",
      expect.objectContaining({ method: "DELETE" }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectDetailQueryKeys.attachments("proy-1") })
  })
})
