// Hooks de la estructura técnica del proyecto (S3 U4): objetivos, actividades,
// entregables e indicadores. Mismo patrón que los hooks del equipo: la query y
// las mutaciones son reales y solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import * as hooks from "./projects"

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, queryClient }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type Hook = (projectId: string) => never

type Entity = {
  name: string
  path: string
  listKey: string
  itemKey: string
  keyFactory: "objectives" | "activities" | "deliverables" | "indicators"
  useList: string
  useCreate: string
  useUpdate: string
  useDelete: string
  createInput: Record<string, unknown>
}

const ENTITIES: Entity[] = [
  {
    name: "objectives",
    path: "objectives",
    listKey: "objetivos",
    itemKey: "objetivo",
    keyFactory: "objectives",
    useList: "useProjectObjectives",
    useCreate: "useCreateObjective",
    useUpdate: "useUpdateObjective",
    useDelete: "useDeleteObjective",
    createInput: { codigo: "OBJ-1", descripcion: "Fortalecer capacidades" },
  },
  {
    name: "activities",
    path: "activities",
    listKey: "actividades",
    itemKey: "actividad",
    keyFactory: "activities",
    useList: "useProjectActivities",
    useCreate: "useCreateActivity",
    useUpdate: "useUpdateActivity",
    useDelete: "useDeleteActivity",
    createInput: { objetivo_id: "o1", codigo: "ACT-1", nombre: "Taller", semana_inicio: 1, semana_fin: 3 },
  },
  {
    name: "deliverables",
    path: "deliverables",
    listKey: "entregables",
    itemKey: "entregable",
    keyFactory: "deliverables",
    useList: "useProjectDeliverables",
    useCreate: "useCreateDeliverable",
    useUpdate: "useUpdateDeliverable",
    useDelete: "useDeleteDeliverable",
    createInput: {
      actividad_id: "a1",
      codigo: "ENT-1",
      descripcion: "Informe",
      cantidad_meta: 4,
      unidad: "informes",
      tipo_medio_exigido: "PDF",
    },
  },
  {
    name: "indicators",
    path: "indicators",
    listKey: "indicadores",
    itemKey: "indicador",
    keyFactory: "indicators",
    useList: "useProjectIndicators",
    useCreate: "useCreateIndicator",
    useUpdate: "useUpdateIndicator",
    useDelete: "useDeleteIndicator",
    createInput: { objetivo_id: "o1", codigo: "IND-1", nombre: "Personas", meta: 100, unidad: "personas" },
  },
]

function pick(name: string) {
  return (hooks as unknown as Record<string, unknown>)[name] as (...args: unknown[]) => never
}

describe.each(ENTITIES)("project structure hooks: $name", (e) => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists from the endpoint and unwraps the collection", async () => {
    const row = { id: "x1" }
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ [e.listKey]: [row] })))
    const useList = pick(e.useList) as unknown as Hook

    const { result } = renderHook(() => useList("p1"), { wrapper: createWrapperWithClient().wrapper })

    await waitFor(() => expect((result.current as { data?: unknown }).data).toEqual([row]))
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/projects/p1/${e.path}`, expect.any(Object))
  })

  it("does not fetch with an empty project id", () => {
    const useList = pick(e.useList) as unknown as Hook
    renderHook(() => useList(""), { wrapper: createWrapperWithClient().wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("exposes a stable query key under the projects prefix", () => {
    const factory = hooks.projectQueryKeys[e.keyFactory]
    expect(factory("p1")).toEqual(["projects", e.keyFactory, "p1"])
  })

  it("creates with POST and refreshes its list", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ [e.itemKey]: { id: "x1" } }, 201)))
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const useCreate = pick(e.useCreate) as unknown as (id: string) => {
      mutateAsync: (input: unknown) => Promise<unknown>
    }

    const { result } = renderHook(() => useCreate("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(e.createInput)
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/v1/projects/p1/${e.path}`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual(e.createInput)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: hooks.projectQueryKeys[e.keyFactory]("p1") })
  })

  it("surfaces a 409 envelope as an ApiError without a toast", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "Ya existe con ese código.", code: "CONFLICT" }, 409)),
    )
    const useCreate = pick(e.useCreate) as unknown as (id: string) => {
      mutateAsync: (input: unknown) => Promise<unknown>
    }

    const { result } = renderHook(() => useCreate("p1"), { wrapper: createWrapperWithClient().wrapper })
    let caught: unknown
    await act(async () => {
      caught = await result.current.mutateAsync(e.createInput).catch((err: unknown) => err)
    })

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(409)
    expect((caught as ApiError).message).toBe("Ya existe con ese código.")
  })

  it("updates with PATCH on the item and refreshes its list", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ [e.itemKey]: { id: "x1" } })))
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const useUpdate = pick(e.useUpdate) as unknown as (id: string) => {
      mutateAsync: (input: unknown) => Promise<unknown>
    }

    const { result } = renderHook(() => useUpdate("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: "x1", data: { codigo: "NEW-1" } })
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/v1/projects/p1/${e.path}/x1`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual({ codigo: "NEW-1" })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: hooks.projectQueryKeys[e.keyFactory]("p1") })
  })

  it("deletes with DELETE on the item and refreshes its list", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ [e.itemKey]: { id: "x1" } })))
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const useDelete = pick(e.useDelete) as unknown as (id: string) => {
      mutateAsync: (id: string) => Promise<unknown>
    }

    const { result } = renderHook(() => useDelete("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync("x1")
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/v1/projects/p1/${e.path}/x1`)
    expect(init.method).toBe("DELETE")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: hooks.projectQueryKeys[e.keyFactory]("p1") })
  })
})
