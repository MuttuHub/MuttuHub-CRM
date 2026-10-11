// Cronograma de solo lectura de la ficha (S14 P4). Lista las actividades del
// proyecto agrupadas por su semana de inicio, con las fechas derivadas y las
// semanas de cada una. Reutiliza el resumen de solo lectura de la estructura y
// las queries reales; solo se burla `fetch`, igual que en project-estructura.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectCronograma } from "./project-cronograma"

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

const STAMP = { proyecto_id: "p1", created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

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
  responsable_id: "u2",
  fuera_de_duracion: false,
}
const ACT2 = {
  ...ACT1,
  id: "a2",
  codigo: "ACT-2",
  nombre: "Informe final",
  semana_inicio: 10,
  semana_fin: 14,
  fecha_inicio: "2026-03-09",
  fecha_fin: "2026-04-12",
  peso: 5,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: true,
}

describe("ProjectCronograma", () => {
  const fetchMock = vi.fn()

  function setup({ actividades = [ACT1, ACT2], status = 200 }: { actividades?: unknown[]; status?: number } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/projects/p1/activities")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse({ actividades })
            : jsonResponse(
                { error: "No pudimos cargar las actividades. Inténtalo de nuevo.", code: "INTERNAL_ERROR" },
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

  it("lists the activities grouped by start week, in week order", async () => {
    setup()

    const semana1 = await screen.findByTestId("cronograma-semana-1")
    expect(semana1).toHaveTextContent("Semana 1")
    expect(within(semana1).getByTestId("cronograma-actividad")).toHaveTextContent("ACT-1")

    const semana10 = screen.getByTestId("cronograma-semana-10")
    expect(semana10).toHaveTextContent("Semana 10")
    expect(within(semana10).getByTestId("cronograma-actividad")).toHaveTextContent("ACT-2")

    expect(semana1.compareDocumentPosition(semana10) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("groups activities that start in the same week under one heading", async () => {
    setup({
      actividades: [
        ACT1,
        { ...ACT1, id: "a3", codigo: "ACT-3", nombre: "Seguimiento", semana_inicio: 1, semana_fin: 4 },
      ],
    })

    const semana1 = await screen.findByTestId("cronograma-semana-1")
    expect(within(semana1).getAllByTestId("cronograma-actividad")).toHaveLength(2)
    expect(screen.queryByTestId("cronograma-semana-4")).not.toBeInTheDocument()
  })

  it("shows each activity with its weeks and derived dates, reusing the read-only summary", async () => {
    setup()

    const [act1, act2] = await screen.findAllByTestId("cronograma-actividad")
    expect(act1).toHaveTextContent("ACT-1")
    expect(act1).toHaveTextContent("Taller de formación")
    expect(act1).toHaveTextContent("Semanas 1–3")
    expect(act1).toHaveTextContent("05 de ene de 2026")
    expect(act1).toHaveTextContent("25 de ene de 2026")
    expect(act1).not.toHaveTextContent("Fuera de la duración del proyecto")
    expect(act2).toHaveTextContent("Fuera de la duración del proyecto")
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

  it("shows a loading skeleton while the activities load", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<ProjectCronograma proyecto={PROYECTO} />, { wrapper: createWrapper() })

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows a readable error when the activities cannot be loaded", async () => {
    setup({ status: 500 })

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos cargar las actividades.")
  })
})
