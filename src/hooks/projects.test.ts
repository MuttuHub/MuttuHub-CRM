import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import {
  projectQueryKeys,
  useProjects,
  type ProjectListResponse,
  type ProjectListRow,
} from "./projects"

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
