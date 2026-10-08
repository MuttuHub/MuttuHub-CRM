import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import {
  projectQueryKeys,
  useCreateProject,
  useCreateProjectFromOpportunity,
  useEligibleOpportunities,
  useMunicipalities,
  useProject,
  useAddProjectMember,
  useProjectAudit,
  useProjectMembers,
  useRemoveProjectMember,
  useProjects,
  useStrategicLines,
  type EligibleOpportunity,
  type Municipality,
  type ProjectCreateInput,
  type ProjectListResponse,
  type ProjectListRow,
  type StrategicLine,
} from "./projects"

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, queryClient }
}

function createWrapper() {
  return createWrapperWithClient().wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// Los dos decimales llegan por HTTP como string ("180000000.00"), no como
// número: el DTO del cliente los declara así y nunca los convierte.
const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento de capacidades locales",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: "-5000000.00",
  beneficiarios_meta: 1200,
  lineas: [{ id: "l1", codigo: "LE-01", nombre: "Educación", principal: true }],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}

const LISTA: ProjectListResponse = { proyectos: [PROYECTO] }

describe("useProjects", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("serializes the five supported filters into the query string", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(LISTA)))

    const filters = {
      estado: "EN_EJECUCION",
      cliente_id: "c1",
      linea_id: "l1",
      municipio_id: "m1",
      responsable_id: "u1",
    }
    const { result } = renderHook(() => useProjects(filters), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(LISTA))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects?estado=EN_EJECUCION&cliente_id=c1&linea_id=l1&municipio_id=m1&responsable_id=u1",
      expect.any(Object),
    )
  })

  it("omits absent and empty filters", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(LISTA)))

    const { result } = renderHook(() => useProjects({ estado: "", cliente_id: "c1" }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).toEqual(LISTA))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects?cliente_id=c1", expect.any(Object))

    fetchMock.mockClear()
    const sinFiltros = renderHook(() => useProjects({}), { wrapper: createWrapper() })
    await waitFor(() => expect(sinFiltros.result.current.data).toEqual(LISTA))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects?", expect.any(Object))
  })

  it("returns the server envelope untouched, decimals as strings", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(LISTA)))

    const { result } = renderHook(() => useProjects({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data?.proyectos).toHaveLength(1))
    const fila = result.current.data!.proyectos[0]
    expect(fila.valor_total).toBe("180000000.00")
    expect(fila.diferencia_valor_oportunidad).toBe("-5000000.00")
    expect(fila.responsable).toEqual({ id: "u1", nombre: "Ana Pérez" })
  })

  it("surfaces the server envelope as an ApiError", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ error: "No tienes permisos para ver proyectos.", code: "FORBIDDEN" }, 403),
      ),
    )

    const { result } = renderHook(() => useProjects({}), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).message).toBe("No tienes permisos para ver proyectos.")
    expect((result.current.error as ApiError).status).toBe(403)
    expect((result.current.error as ApiError).code).toBe("FORBIDDEN")
  })

  it("namespaces the list cache under `projects`", () => {
    const filters = { estado: "BORRADOR" }
    expect(projectQueryKeys.all).toEqual(["projects"])
    expect(projectQueryKeys.list(filters)).toEqual(["projects", "list", filters])
  })
})

/* ── Unidad 3: ficha de solo lectura (useProject) ──────────────────────── */

describe("useProject", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests the ficha endpoint and returns the detail DTO untouched", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ proyecto: PROYECTO })))

    const { result } = renderHook(() => useProject("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(PROYECTO))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1", expect.any(Object))
    // Decimales como string, igual que en la lista.
    expect(result.current.data?.valor_total).toBe("180000000.00")
  })

  it("does not request anything while the id is empty", () => {
    const { result } = renderHook(() => useProject(""), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe("idle")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("surfaces a 403 envelope as an ApiError so the dialog can read it", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" },
          403,
        ),
      ),
    )

    const { result } = renderHook(() => useProject("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).message).toBe("No tienes permisos sobre este proyecto.")
    expect((result.current.error as ApiError).status).toBe(403)
  })
})

/* ── Historial de cambios (useProjectAudit) ────────────────────────────── */

const AUDITORIA = [
  {
    id: "aud-1",
    created_at: "2026-10-06T20:39:51.751Z",
    usuario_id: "u1",
    usuario_nombre: "Ana Pérez",
    accion: "CONVERTIR",
    entidad: "oportunidad",
    entidad_id: "op-1",
    campo: null,
    valor_anterior: { fase: "PROSPECCION", fecha_adjudicacion: null },
    valor_nuevo: { fase: "EJECUCION" },
    lote_id: "lote-1",
  },
  {
    id: "aud-2",
    created_at: "2026-10-06T20:39:51.751Z",
    usuario_id: "u1",
    usuario_nombre: "Ana Pérez",
    accion: "CREAR",
    entidad: "proyecto",
    entidad_id: "p1",
    campo: null,
    valor_anterior: null,
    valor_nuevo: { codigo: "PRY-2026-001" },
    lote_id: "lote-1",
  },
]

describe("useProjectAudit", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests the audit endpoint and returns the historial array", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ historial: AUDITORIA })))

    const { result } = renderHook(() => useProjectAudit("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(AUDITORIA))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/audit", expect.any(Object))
    // El nombre del actor y el lote viajan tal cual; el JSON no se reescribe.
    expect(result.current.data?.[0].usuario_nombre).toBe("Ana Pérez")
    expect(result.current.data?.[1].lote_id).toBe("lote-1")
  })

  it("does not request anything while the id is empty", () => {
    const { result } = renderHook(() => useProjectAudit(""), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe("idle")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("namespaces the history under the same `projects` prefix", () => {
    expect(projectQueryKeys.audit("p1")).toEqual(["projects", "audit", "p1"])
  })
})

/* ── Unidad 2: elegibles, catálogos y creación ─────────────────────────── */

const OPORTUNIDAD: EligibleOpportunity = {
  id: "op-1",
  nombre: "Consultoría línea base",
  cliente_id: "cli-1",
  cliente_nombre: "Alcaldía de Barranquilla",
  valor_estimado_cop: "180000000.00",
}

const INPUT: ProjectCreateInput = {
  nombre: "Proyecto nuevo",
  cliente_id: "cli-1",
  responsable_id: "u1",
  lineas: [{ id: "l1", principal: true }],
  municipio_ids: ["m1"],
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-04-05",
  valor_total: 180000000,
}

describe("unidad 2: creación y catálogos", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads the eligible opportunities and keeps the estimate as a decimal string", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ oportunidades: [OPORTUNIDAD] })),
    )

    const { result } = renderHook(() => useEligibleOpportunities(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual([OPORTUNIDAD]))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/eligible-opportunities",
      expect.any(Object),
    )
    expect(result.current.data?.[0].valor_estimado_cop).toBe("180000000.00")
  })

  it("loads the strategic lines catalog", async () => {
    const lineas: StrategicLine[] = [
      { id: "l1", codigo: "LE-01", nombre: "Educación", activo: true, fecha_suspension: null, orden: 0, created_at: "", updated_at: "" },
    ]
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ lineas })))

    const { result } = renderHook(() => useStrategicLines(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(lineas))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/strategic-lines", expect.any(Object))
  })

  it("loads the municipalities catalog", async () => {
    const municipios: Municipality[] = [
      { id: "m1", nombre: "Barranquilla", departamento: "Atlántico", codigo_dane: "08001", activo: true, fecha_suspension: null, orden: 0, created_at: "", updated_at: "" },
    ]
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ municipios })))

    const { result } = renderHook(() => useMunicipalities(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(municipios))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/municipalities", expect.any(Object))
  })

  it("posts the independent body and invalidates the project queries on success", async () => {
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ proyecto: PROYECTO }, 201)))

    const { result } = renderHook(() => useCreateProject(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(INPUT)
    })

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/projects")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual(INPUT)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] })
  })

  it("posts to the client/opportunity URL without cliente_id", async () => {
    const { wrapper } = createWrapperWithClient()
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ proyecto: PROYECTO }, 201)))

    const sinCliente = { ...INPUT }
    delete (sinCliente as { cliente_id?: string }).cliente_id
    const { result } = renderHook(() => useCreateProjectFromOpportunity("cli-1", "op-1"), {
      wrapper,
    })
    await act(async () => {
      await result.current.mutateAsync(sinCliente)
    })

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/clients/cli-1/opportunities/op-1/project")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty("cliente_id")
    expect(body).not.toHaveProperty("oportunidad_id")
  })

  it("re-throws the server envelope so callers can branch", async () => {
    const { wrapper } = createWrapperWithClient()
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "Esta oportunidad ya tiene un proyecto.", code: "CONFLICT" }, 409)),
    )

    const { result } = renderHook(() => useCreateProjectFromOpportunity("cli-1", "op-1"), {
      wrapper,
    })
    let error: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync(INPUT)
      } catch (err) {
        error = err
      }
    })

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe("Esta oportunidad ya tiene un proyecto.")
    expect((error as ApiError).status).toBe(409)
  })

  it("namespaces the catalog and eligible-opportunity keys outside the list", () => {
    expect(projectQueryKeys.detail("p1")).toEqual(["projects", "detail", "p1"])
    expect(projectQueryKeys.eligibleOpportunities).toEqual(["projects", "eligible-opportunities"])
    expect(projectQueryKeys.strategicLines).toEqual(["catalogs", "strategic-lines"])
    expect(projectQueryKeys.municipalities).toEqual(["catalogs", "municipalities"])
  })
})

/* ── Equipo del proyecto (E-07) ────────────────────────────────────────── */

const MIEMBRO = {
  id: "m1",
  usuario: { id: "u9", nombre: "Carla Ruiz", rol: "COORDINADOR" },
  agregado_por_id: "u1",
  created_at: "2026-10-07T13:00:00.000Z",
  removed_at: null,
}

describe("project team hooks", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("useProjectMembers requests the members endpoint and returns the miembros array", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ miembros: [MIEMBRO] })))

    const { result } = renderHook(() => useProjectMembers("p1"), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data).toEqual([MIEMBRO]))
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object))
  })

  it("useProjectMembers does not fetch with an empty id", () => {
    renderHook(() => useProjectMembers(""), { wrapper: createWrapper() })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("useAddProjectMember posts {usuario_id} and refreshes the team", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ miembro: MIEMBRO }, 201)),
    )
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useAddProjectMember("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync("u9")
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/projects/p1/members")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ usuario_id: "u9" })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.members("p1") })
  })

  it("useAddProjectMember surfaces the 409 envelope as an ApiError", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ error: "El usuario ya es integrante del proyecto.", code: "CONFLICT" }, 409),
      ),
    )

    const { result } = renderHook(() => useAddProjectMember("p1"), { wrapper: createWrapper() })
    let caught: unknown
    await act(async () => {
      caught = await result.current.mutateAsync("u9").catch((e: unknown) => e)
    })

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(409)
  })

  it("useRemoveProjectMember issues DELETE on the member and refreshes the team", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ miembro: MIEMBRO })))
    const { wrapper, queryClient } = createWrapperWithClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useRemoveProjectMember("p1"), { wrapper })
    await act(async () => {
      await result.current.mutateAsync("u9")
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/projects/p1/members/u9")
    expect(init.method).toBe("DELETE")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectQueryKeys.members("p1") })
  })
})
