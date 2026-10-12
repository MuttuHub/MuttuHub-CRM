// Metas e indicadores (S14 P6): el roll-up por objetivo dentro de la lista. La
// vista lee el estado técnico UNA vez (`useProjectTechnicalStatus`) y reparte el
// acumulado a cada tarjeta por código; el semáforo llega calculado por el
// servidor y aquí solo se pinta (D11). Las queries son reales y solo se burla
// `fetch`, igual que en project-estructura.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow, ProjectTechnicalObjective } from "@/hooks/projects"
import { EstructuraObjetivos } from "./estructura-objetivos"

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

const STAMP = { proyecto_id: "p1", created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const OBJ1 = { ...STAMP, id: "o1", codigo: "OBJ-1", descripcion: "Fortalecer capacidades", orden: 1 }
const OBJ2 = { ...STAMP, id: "o2", codigo: "OBJ-2", descripcion: "Medir resultados", orden: 2 }
const OBJ3 = { ...STAMP, id: "o3", codigo: "OBJ-3", descripcion: "Sostener el cambio", orden: 3 }

const ACT1 = {
  ...STAMP,
  id: "a1",
  objetivo_id: "o1",
  codigo: "ACT-1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-01-25",
  peso: 2.5,
  peso_manual: true,
  responsable_id: null,
  fuera_de_duracion: false,
}

const ROLLUP1: ProjectTechnicalObjective = {
  codigo: "OBJ-1",
  programado: 80,
  ejecutado: 60,
  desviacion_pp: 20,
  color: "amarillo",
}
const ROLLUP2: ProjectTechnicalObjective = {
  codigo: "OBJ-2",
  programado: 100,
  ejecutado: 100,
  desviacion_pp: 0,
  color: "verde",
}

type Setup = {
  objetivos?: unknown[]
  actividades?: unknown[]
  entregables?: unknown[]
  indicadores?: unknown[]
  rollups?: ProjectTechnicalObjective[]
  /** Estado HTTP del estado técnico; 200 devuelve los roll-ups. */
  status?: number
}

describe("EstructuraObjetivos (Metas e indicadores)", () => {
  const fetchMock = vi.fn()

  function setup({
    objetivos = [OBJ1, OBJ2],
    actividades = [ACT1],
    entregables = [],
    indicadores = [],
    rollups = [],
    status = 200,
  }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/catalogs/users")) return Promise.resolve(jsonResponse({ users: [] }))
      if (url.endsWith("/projects/p1/technical-status")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse({
                base: "vigente",
                corte: "2026-10-25",
                estado: "EN_EJECUCION",
                avance_real: 60,
                avance_programado: 80,
                desviacion_pp: 20,
                color: "amarillo",
                actividades: [],
                objetivos: rollups,
                umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
              })
            : jsonResponse(
                { error: "No pudimos calcular el semáforo técnico. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
                status,
              ),
        )
      }
      const lists: Record<string, [string, unknown[]]> = {
        objectives: ["objetivos", objetivos],
        activities: ["actividades", actividades],
        deliverables: ["entregables", entregables],
        indicators: ["indicadores", indicadores],
      }
      const match = /\/projects\/p1\/(objectives|activities|deliverables|indicators)$/.exec(url)
      if (match && method === "GET") {
        const [field, rows] = lists[match[1]]
        return Promise.resolve(jsonResponse({ [field]: rows }))
      }
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    return render(<EstructuraObjetivos proyecto={PROYECTO} canEdit={false} />, {
      wrapper: createWrapper(),
    })
  }

  function statusCalls() {
    return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/projects/p1/technical-status")).length
  }

  async function objetivo(codigo: string) {
    const cards = await screen.findAllByTestId("estructura-objetivo")
    const card = cards.find((c) => within(c).queryByText(codigo))
    if (!card) throw new Error(`objetivo ${codigo} not found`)
    return card
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows each objective's planned vs executed roll-up with the server semáforo", async () => {
    setup({ rollups: [ROLLUP1, ROLLUP2] })

    const o1 = await objetivo("OBJ-1")
    const rollup = await within(o1).findByTestId("estructura-objetivo-rollup")
    expect(rollup).toHaveTextContent("Programado")
    expect(rollup).toHaveTextContent("80 %")
    expect(rollup).toHaveTextContent("Ejecutado")
    expect(rollup).toHaveTextContent("60 %")
    // El semáforo llega del servidor: aquí solo se pinta (D11).
    expect(within(rollup).getByText("Semáforo: Amarillo")).toHaveAttribute("data-color", "amarillo")

    const o2 = await objetivo("OBJ-2")
    const rollup2 = await within(o2).findByTestId("estructura-objetivo-rollup")
    expect(rollup2).toHaveTextContent("100 %")
    expect(within(rollup2).getByText("Semáforo: Verde")).toHaveAttribute("data-color", "verde")
  })

  it("matches the roll-up to the objective by codigo, never by position", async () => {
    // El servidor responde en el orden inverso al de las tarjetas.
    setup({ rollups: [ROLLUP2, ROLLUP1] })

    const o1 = await objetivo("OBJ-1")
    expect(await within(o1).findByTestId("estructura-objetivo-rollup")).toHaveTextContent("80 %")
    const o2 = await objetivo("OBJ-2")
    expect(within(o2).getByTestId("estructura-objetivo-rollup")).toHaveTextContent("100 %")
  })

  it("reads the technical status once for the whole list, whatever the objective count", async () => {
    setup({ objetivos: [OBJ1, OBJ2, OBJ3], rollups: [ROLLUP1, ROLLUP2] })

    await objetivo("OBJ-1")
    await objetivo("OBJ-3")
    await waitFor(() => expect(statusCalls()).toBe(1))
    expect(statusCalls()).toBe(1)
  })

  it("degrades silently when an objective has no roll-up", async () => {
    setup({ rollups: [ROLLUP1] })

    const o2 = await objetivo("OBJ-2")
    expect(within(o2).queryByTestId("estructura-objetivo-rollup")).not.toBeInTheDocument()
    expect(within(o2).queryByText(/Semáforo/)).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    // El resto de la tarjeta sigue intacto.
    await waitFor(() => expect(o2).toHaveTextContent("0 actividades"))
    expect(within(await objetivo("OBJ-1")).getByTestId("estructura-objetivo-rollup")).toBeInTheDocument()
  })

  it("shows no roll-up and no error when the technical status fails", async () => {
    setup({ rollups: [ROLLUP1], status: 500 })

    const o1 = await objetivo("OBJ-1")
    await waitFor(() => expect(statusCalls()).toBe(1))
    expect(screen.queryByTestId("estructura-objetivo-rollup")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    // La lista de objetivos y sus conteos no dependen del estado técnico.
    expect(o1).toHaveTextContent("Fortalecer capacidades")
  })
})
