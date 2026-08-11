import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { EstadoOportunidad, EstadoTarea } from "@prisma/client"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildDashboardQuery,
  rangoMesActual,
  useDashboardClientsActivity,
  useDashboardMySummary,
  useDashboardPipeline,
  useDashboardTasks,
  type DashboardClientsActivity,
  type DashboardMySummary,
  type DashboardPipeline,
  type DashboardTasks,
} from "./dashboard"

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

describe("rangoMesActual", () => {
  it("returns the first day of the month through today (local time)", () => {
    expect(rangoMesActual(new Date(2026, 7, 10))).toEqual({ desde: "2026-08-01", hasta: "2026-08-10" })
  })

  it("zero-pads month and day", () => {
    expect(rangoMesActual(new Date(2026, 0, 5))).toEqual({ desde: "2026-01-01", hasta: "2026-01-05" })
  })

  it("defaults to the current date", () => {
    const now = new Date()
    const { desde, hasta } = rangoMesActual()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    expect(desde).toBe(`${yyyy}-${mm}-01`)
    expect(hasta).toBe(`${yyyy}-${mm}-${dd}`)
  })
})

describe("buildDashboardQuery", () => {
  it("returns an empty string for empty filters", () => {
    expect(buildDashboardQuery({})).toBe("")
  })

  it("serializes present values in order", () => {
    const qs = buildDashboardQuery({
      desde: "2026-08-01",
      hasta: "2026-08-10",
      responsable_id: "u1",
    })
    expect(qs).toBe("desde=2026-08-01&hasta=2026-08-10&responsable_id=u1")
  })

  it("omits undefined and empty-string values", () => {
    const qs = buildDashboardQuery({ desde: "", hasta: undefined, tipo_cliente: "gobierno" })
    expect(qs).toBe("tipo_cliente=gobierno")
  })

  it("appends dias_sin_gestion when provided", () => {
    expect(buildDashboardQuery({}, { dias_sin_gestion: 30 })).toBe("dias_sin_gestion=30")
    expect(buildDashboardQuery({ desde: "2026-08-01" }, { dias_sin_gestion: 7 })).toBe(
      "desde=2026-08-01&dias_sin_gestion=7",
    )
  })

  it("omits dias_sin_gestion when falsy (0 or undefined)", () => {
    expect(buildDashboardQuery({}, { dias_sin_gestion: 0 })).toBe("")
    expect(buildDashboardQuery({}, {})).toBe("")
  })
})

const PIPELINE: DashboardPipeline = {
  scope: "own",
  total_activas: 5,
  valor_activo: 1200000,
  embudo: [{ estado: "OPORTUNIDAD_ABIERTA" as unknown as EstadoOportunidad, count: 2 }],
  top_clientes: [{ cliente_id: "c1", nombre: "Alcaldía de Barranquilla", valor_potencial: 1000000 }],
  comparativo: { potencial_activo: 1200000, ganado_historico: 800000, ratio: 1.5 },
}

const TASKS: DashboardTasks = {
  scope: "own",
  por_columna: [{ estado: "TAREA_PENDIENTE" as unknown as EstadoTarea, label: "Pendientes", count: 6 }],
  cumplimiento_por_persona: [
    { responsable_id: "u1", nombre: "Ana Pérez", total: 4, completadas: 3, cumplidas: 2, porc: 50 },
  ],
  vencidas: { count: 0, lista: [] },
}

const ACTIVITY: DashboardClientsActivity = {
  scope: "own",
  sin_gestion: { dias: 30, clientes: [] },
  distribucion: { por_tipo: [], por_estado: [], por_prioridad: [] },
  actividad_por_responsable: [],
}

const SUMMARY: DashboardMySummary = {
  scope: "own",
  activas: { count: 1, items: [] },
  vencidas: { count: 0, items: [] },
  hoy: { count: 2 },
  compromisos_pendientes: { count: 1, vencidos: 0 },
  clientes_asignados: { count: 0, items: [] },
}

describe("useDashboardPipeline", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts loading and then resolves the pipeline with the serialized filters", async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = res
      }),
    )

    const { result } = renderHook(
      () => useDashboardPipeline({ desde: "2026-08-01", tipo_cliente: "gobierno" }),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolve(jsonResponse(PIPELINE))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/dashboard/pipeline?desde=2026-08-01&tipo_cliente=gobierno",
      expect.any(Object),
    )
    await waitFor(() => expect(result.current.data).toEqual(PIPELINE))
    expect(result.current.isError).toBe(false)
  })

  it("surfaces errors without crashing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500))

    const { result } = renderHook(() => useDashboardPipeline({ desde: "2026-08-01" }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe("useDashboardTasks", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests /api/v1/dashboard/tasks with empty filters (trailing ?) and resolves", async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = res
      }),
    )

    const { result } = renderHook(() => useDashboardTasks({}), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolve(jsonResponse(TASKS))
    })

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/dashboard/tasks?", expect.any(Object))
    await waitFor(() => expect(result.current.data).toEqual(TASKS))
  })

  it("serializes desde/hasta into the URL and resolves", async () => {
    fetchMock.mockResolvedValue(jsonResponse(TASKS))

    const { result } = renderHook(
      () => useDashboardTasks({ desde: "2026-08-01", hasta: "2026-08-10" }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.data).toEqual(TASKS))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/dashboard/tasks?desde=2026-08-01&hasta=2026-08-10",
      expect.any(Object),
    )
  })

  it("surfaces errors without crashing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500))

    const { result } = renderHook(() => useDashboardTasks({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe("useDashboardClientsActivity", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts loading and then resolves activity with dias_sin_gestion in the query string", async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = res
      }),
    )

    const { result } = renderHook(
      () => useDashboardClientsActivity({ desde: "2026-08-01" }, 30),
      { wrapper: createWrapper() },
    )

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolve(jsonResponse(ACTIVITY))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/dashboard/clients-activity?desde=2026-08-01&dias_sin_gestion=30",
      expect.any(Object),
    )
    await waitFor(() => expect(result.current.data).toEqual(ACTIVITY))
    expect(result.current.isError).toBe(false)
  })

  it("surfaces errors without crashing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500))

    const { result } = renderHook(() => useDashboardClientsActivity({}, 7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

describe("useDashboardMySummary", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("starts loading and then resolves the summary with the serialized filters", async () => {
    let resolve!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = res
      }),
    )

    const { result } = renderHook(() => useDashboardMySummary({ responsable_id: "u1" }), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolve(jsonResponse(SUMMARY))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/dashboard/my-summary?responsable_id=u1",
      expect.any(Object),
    )
    await waitFor(() => expect(result.current.data).toEqual(SUMMARY))
    expect(result.current.isError).toBe(false)
  })

  it("surfaces errors without crashing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500))

    const { result } = renderHook(() => useDashboardMySummary({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})