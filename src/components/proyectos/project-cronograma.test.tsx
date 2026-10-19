// Cronograma de solo lectura de la ficha (S14 P4/P6). Tabla v6 agrupada por
// objetivo: actividad, días, % plan, % real, semáforo (calculado por el
// servidor) y soporte. La query es real (`useProjectTechnicalStatus`) y solo se
// burla `fetch`, igual que en project-estructura.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow, ProjectTechnicalActivityV6 } from "@/hooks/projects"
import { agruparPorObjetivo, ProjectCronograma } from "./project-cronograma"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

const ACT1: ProjectTechnicalActivityV6 = {
  id: "a1",
  codigo: "ACT-1",
  nombre: "Taller de formación",
  objetivo_codigo: "OE1",
  peso: 2.5,
  progreso: 60,
  programado: 100,
  dias: 21,
  al_corte: 21,
  estado: "EN_CURSO",
  fecha_cumplimiento: null,
  color: "amarillo",
  sin_soporte: false,
}
const ACT2: ProjectTechnicalActivityV6 = {
  ...ACT1,
  id: "a2",
  codigo: "ACT-2",
  nombre: "Informe final",
  progreso: 0,
  programado: 25,
  dias: 35,
  al_corte: 7,
  color: "rojo",
  sin_soporte: true,
}
const ACT3: ProjectTechnicalActivityV6 = {
  ...ACT1,
  id: "a3",
  codigo: "ACT-3",
  nombre: "Seguimiento",
  objetivo_codigo: "OE2",
  progreso: 100,
  programado: 100,
  dias: 7,
  al_corte: 7,
  estado: "FINALIZADA",
  color: "verde",
}

const TECNICO = (actividades?: ProjectTechnicalActivityV6[]) => ({
  base: "vigente",
  corte: "2026-10-25",
  estado: "EN_EJECUCION",
  avance_real: 60,
  avance_programado: 80,
  desviacion_pp: 20,
  color: "amarillo",
  actividades,
  objetivos: [],
  umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
})

describe("agruparPorObjetivo", () => {
  it("groups the activities of each objective, in order of first appearance", () => {
    expect(agruparPorObjetivo([ACT1, ACT2, ACT3]).map((g) => [g.codigo, g.actividades.length])).toEqual([
      ["OE1", 2],
      ["OE2", 1],
    ])
    expect(agruparPorObjetivo([])).toEqual([])
  })

  it("keeps one group per objective even when the weeks interleave them", () => {
    // ACT3 (OE2) sits between two OE1 activities, as the week ordering can do.
    const grupos = agruparPorObjetivo([ACT1, ACT3, ACT2])
    expect(grupos.map((g) => [g.codigo, g.actividades.map((a) => a.codigo)])).toEqual([
      ["OE1", ["ACT-1", "ACT-2"]],
      ["OE2", ["ACT-3"]],
    ])
  })
})

describe("ProjectCronograma", () => {
  const fetchMock = vi.fn()

  function setup({
    actividades = [ACT1, ACT2, ACT3],
    status = 200,
  }: { actividades?: ProjectTechnicalActivityV6[]; status?: number } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/projects/p1/technical-status")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse(TECNICO(actividades))
            : jsonResponse(
                { error: "No pudimos calcular el semáforo técnico. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
                status,
              ),
        )
      }
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    return render(<ProjectCronograma proyecto={PROYECTO} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists the activities grouped by objective, in order", async () => {
    setup()

    const oe1 = await screen.findByTestId("cronograma-objetivo-OE1")
    expect(oe1).toHaveTextContent("Objetivo OE1")
    const oe2 = screen.getByTestId("cronograma-objetivo-OE2")
    expect(oe2).toHaveTextContent("Objetivo OE2")

    expect(within(oe1).getAllByTestId("cronograma-actividad")).toHaveLength(2)
    expect(within(oe2).getAllByTestId("cronograma-actividad")).toHaveLength(1)
    expect(oe1.compareDocumentPosition(oe2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows the v6 columns per activity: días, % plan, % real, semáforo and soporte", async () => {
    setup()

    const [act1, act2] = await screen.findAllByTestId("cronograma-actividad")
    expect(act1).toHaveTextContent("ACT-1")
    expect(act1).toHaveTextContent("Taller de formación")
    expect(act1).toHaveTextContent("21")
    expect(act1).toHaveTextContent("100 %")
    expect(act1).toHaveTextContent("60 %")
    // El semáforo llega del servidor: aquí solo se pinta.
    expect(within(act1).getByText("Amarillo")).toBeInTheDocument()
    expect(act1).toHaveTextContent("Con soporte")

    expect(act2).toHaveTextContent("ACT-2")
    expect(act2).toHaveTextContent("35")
    expect(act2).toHaveTextContent("25 %")
    expect(within(act2).getByText("Rojo")).toBeInTheDocument()
    expect(act2).toHaveTextContent("Sin soporte")
  })

  it("renders a stacked card per activity below md and keeps the table from md up", async () => {
    setup()

    const tabla = await screen.findByTestId("cronograma-tabla")
    expect(tabla.closest("[data-testid='cronograma-tabla-md']")).toHaveClass("hidden", "md:block")

    const lista = screen.getByTestId("cronograma-tarjetas")
    expect(lista).toHaveClass("md:hidden")
    const tarjetas = within(lista).getAllByTestId("cronograma-tarjeta")
    expect(tarjetas).toHaveLength(3)
    expect(tarjetas[0]).toHaveTextContent("ACT-1")
    expect(tarjetas[0]).toHaveTextContent("% plan")
    expect(tarjetas[0]).toHaveTextContent("60 %")
    expect(within(tarjetas[0]).getByText("Amarillo")).toBeInTheDocument()
    expect(tarjetas[0]).toHaveTextContent("Con soporte")
    expect(tarjetas[1]).toHaveTextContent("Sin soporte")
  })

  it("is read-only: it offers no edit controls or forms", async () => {
    setup()

    await screen.findAllByTestId("cronograma-actividad")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
  })

  it("shows an empty state when the project has no activities", async () => {
    setup({ actividades: [] })

    expect(await screen.findByText("Este proyecto todavía no tiene actividades.")).toBeInTheDocument()
    expect(screen.queryByTestId("cronograma-actividad")).not.toBeInTheDocument()
  })

  it("shows a loading skeleton while the technical status loads", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<ProjectCronograma proyecto={PROYECTO} />, { wrapper: createWrapper() })

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows a readable error when the technical status cannot be loaded", async () => {
    setup({ status: 500 })

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos calcular el semáforo técnico.")
  })
})
