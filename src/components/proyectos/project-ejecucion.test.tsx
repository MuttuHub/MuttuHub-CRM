// S4 U6: sección "Ejecución técnica" de la ficha. Las queries son reales; solo
// se burla `fetch`, igual que en project-estructura.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectEjecucion } from "./project-ejecucion"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
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

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-29",
  duracion_semanas: 12,
  valor_total: null,
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const STAMP = { created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const ACTIVIDAD = {
  ...STAMP,
  id: "a1",
  proyecto_id: "p1",
  objetivo_id: "o1",
  codigo: "1.1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-10-25",
  peso: 1,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: false,
}

const ENTREGABLE = {
  ...STAMP,
  id: "e1",
  proyecto_id: "p1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta de asistencia",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

const AVANCE = {
  id: "av1",
  proyecto_id: "p1",
  entregable_id: "e1",
  fecha: "2026-10-20",
  cantidad: "2.00",
  observacion: null,
  justificacion_exceso: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
  medios: 0,
  cuenta: false,
}

const TECNICO = {
  base: "vigente",
  corte: "2026-10-25",
  estado: "EN_EJECUCION",
  avance_real: 21.4,
  avance_programado: 57.1,
  desviacion_pp: 35.7,
  color: "rojo",
  actividades: [
    { id: "a1", codigo: "1.1", peso: 1, progreso: 100, estado: "FINALIZADA", fecha_cumplimiento: "2026-10-20" },
  ],
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
}

type Setup = {
  proyecto?: Partial<ProjectListRow>
  tecnico?: unknown
  tecnicoStatus?: number
  actividades?: unknown[]
  actividadesStatus?: number
  entregables?: unknown[]
}

describe("ProjectEjecucion", () => {
  const fetchMock = vi.fn()

  function setup({
    proyecto = {},
    tecnico = TECNICO,
    tecnicoStatus = 200,
    actividades = [ACTIVIDAD],
    actividadesStatus = 200,
    entregables = [ENTREGABLE],
  }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol: "ADMINISTRADOR" } }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      if (url.endsWith("/technical-status")) {
        return Promise.resolve(jsonResponse(tecnico, tecnicoStatus))
      }
      if (url.endsWith("/activities")) {
        return Promise.resolve(
          actividadesStatus === 200
            ? jsonResponse({ actividades })
            : jsonResponse({ error: "No pudimos cargar las actividades.", code: "INTERNAL_ERROR" }, actividadesStatus),
        )
      }
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables }))
      if (url.endsWith("/deliverables/e1/progress")) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", meta: "2.00", avances: [AVANCE] }))
      }
      if (url.endsWith("/beneficiaries")) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [], total: 0 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectEjecucion proyecto={{ ...PROYECTO, ...proyecto }} />, {
      wrapper: createWrapper(),
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders only a hint for a BORRADOR project, and does not read the semáforo", () => {
    setup({ proyecto: { estado: "BORRADOR" } })

    expect(screen.getByTestId("ejecucion")).toHaveTextContent("Ejecución técnica")
    expect(screen.getByText(/línea base aprobada/i)).toBeInTheDocument()
    expect(screen.queryByTestId("semaforo-tecnico")).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/technical-status")),
    ).toBe(false)
  })

  it("renders the technical semáforo with the API color for an EN_EJECUCION project", async () => {
    setup()

    const semaforo = await screen.findByTestId("semaforo-tecnico")
    expect(semaforo).toHaveAttribute("data-color", "rojo")
    expect(semaforo).toHaveTextContent("21,4 %")
    expect(semaforo).toHaveTextContent("No confirmado")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/technical-status", expect.any(Object)),
    )
  })

  it("lists each activity with its progress and pending-support counter", async () => {
    setup()

    const actividad = await screen.findByTestId("ejecucion-actividad")
    expect(actividad).toHaveTextContent("1.1")
    expect(actividad).toHaveTextContent("Taller de formación")
    const entregable = within(actividad).getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("Acta de asistencia")
    expect(entregable).toHaveTextContent("Contado 0 actas")
    expect(entregable).toHaveTextContent("1 pendiente de soporte")
  })

  it("keeps the semáforo visible and explains a failing activities read", async () => {
    setup({ actividadesStatus: 500 })

    expect(await screen.findByTestId("semaforo-tecnico")).toBeInTheDocument()
    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos cargar las actividades.")
  })

  it("shows a readable error when the technical status cannot be loaded", async () => {
    setup({ tecnicoStatus: 500, tecnico: { error: "No pudimos calcular el semáforo técnico.", code: "INTERNAL_ERROR" } })

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos calcular el semáforo técnico.")
    expect(screen.queryByTestId("semaforo-tecnico")).not.toBeInTheDocument()
  })
})
