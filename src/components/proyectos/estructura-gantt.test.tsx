// Cronograma por semanas (S3.6b): una barra por actividad, agrupadas por
// objetivo, solo lectura. Queries reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { EstructuraGantt } from "./estructura-gantt"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "BORRADOR",
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
  fuera_de_duracion: true,
}
const ACT3 = { ...ACT1, id: "a3", objetivo_id: "o2", codigo: "ACT-3", nombre: "Medición", semana_inicio: 4, semana_fin: 4, peso_manual: false, fuera_de_duracion: false }

describe("EstructuraGantt", () => {
  const fetchMock = vi.fn()

  function setup(proyecto: Partial<ProjectListRow> = {}, actividades: unknown[] = [ACT1, ACT2, ACT3]) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/projects/p1/objectives")) return Promise.resolve(jsonResponse({ objetivos: [OBJ1, OBJ2] }))
      if (url.endsWith("/projects/p1/activities")) return Promise.resolve(jsonResponse({ actividades }))
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    return render(<EstructuraGantt proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("explains what the bar colours mean (C9: never colour alone)", async () => {
    setup()

    await screen.findByText("OBJ-1")
    const leyenda = screen.getByTestId("gantt-leyenda")
    expect(leyenda).toHaveTextContent("Dentro de la duración del proyecto")
    expect(leyenda).toHaveTextContent("Fuera de la duración del proyecto")
  })

  it("renders one bar per activity from semana_inicio to semana_fin", async () => {
    setup()

    const bar1 = await screen.findByTestId("gantt-bar-a1")
    expect(bar1).toHaveStyle({ gridColumn: "1 / 4" })
    expect(screen.getByTestId("gantt-bar-a3")).toHaveStyle({ gridColumn: "4 / 5" })
    expect(screen.getAllByTestId(/^gantt-bar-/)).toHaveLength(3)
  })

  it("styles an in-range bar with the themed rose tokens plus a dark text pair, so it stays visible on dark surfaces", async () => {
    setup()

    const bar = await screen.findByTestId("gantt-bar-a1")
    expect(bar).toHaveClass("bg-rose-100", "border-rose-200", "text-rose-700", "dark:text-rose-400")
    expect(bar.className).not.toMatch(/dark:bg-rose-500\/10/)
  })

  it("labels each week column with its start date", async () => {
    setup()

    await screen.findByTestId("gantt-bar-a1")
    const header = screen.getByTestId("gantt-header")
    expect(within(header).getByText(/^0?5\s+ene/i)).toBeInTheDocument()
    expect(within(header).getByText(/^0?12\s+ene/i)).toBeInTheDocument()
  })

  it("groups the bars by objective", async () => {
    setup()

    const grupo1 = await screen.findByTestId("gantt-grupo-o1")
    const grupo2 = screen.getByTestId("gantt-grupo-o2")
    expect(within(grupo1).getByText("OBJ-1")).toBeInTheDocument()
    expect(within(grupo1).getByTestId("gantt-bar-a1")).toBeInTheDocument()
    expect(within(grupo1).getByTestId("gantt-bar-a2")).toBeInTheDocument()
    expect(within(grupo1).queryByTestId("gantt-bar-a3")).not.toBeInTheDocument()
    expect(within(grupo2).getByTestId("gantt-bar-a3")).toBeInTheDocument()
  })

  it("shows the computed dates on each bar", async () => {
    setup()

    const bar = await screen.findByTestId("gantt-bar-a1")
    expect(bar).toHaveAttribute("title", expect.stringMatching(/Taller de formación.*2026.*2026/))
  })

  it("marks manual weights", async () => {
    setup()

    const manual = await screen.findByTestId("gantt-bar-a1")
    expect(within(manual).getByLabelText("Peso manual")).toBeInTheDocument()
    expect(within(screen.getByTestId("gantt-bar-a3")).queryByLabelText("Peso manual")).not.toBeInTheDocument()
  })

  it("flags activities beyond the project duration and keeps them whole", async () => {
    setup()

    const fuera = await screen.findByTestId("gantt-bar-a2")
    expect(fuera).toHaveAttribute("data-fuera", "true")
    expect(fuera).toHaveStyle({ gridColumn: "10 / 15" })
    expect(within(fuera).getByLabelText("Fuera de la duración del proyecto")).toBeInTheDocument()
    expect(screen.getByTestId("gantt-bar-a1")).not.toHaveAttribute("data-fuera", "true")
  })

  it("shows an empty state when the project has no dates", async () => {
    setup({ fecha_inicio: null, fecha_fin: null, duracion_semanas: null })

    expect(await screen.findByText("Define las fechas del proyecto para ver el cronograma.")).toBeInTheDocument()
    expect(screen.queryByTestId("gantt-header")).not.toBeInTheDocument()
  })

  it("shows an empty state when there are no activities", async () => {
    setup({}, [])

    expect(await screen.findByText("Aún no hay actividades para mostrar en el cronograma.")).toBeInTheDocument()
  })

  it("is read-only: no controls", async () => {
    setup()

    const gantt = await screen.findByTestId("gantt")
    await screen.findByTestId("gantt-bar-a1")
    expect(within(gantt).queryAllByRole("button")).toHaveLength(0)
    expect(within(gantt).queryAllByRole("textbox")).toHaveLength(0)
  })
})
