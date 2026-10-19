// U4: la pestaña Actividades junta metas, cronograma, Gantt y seguimiento en una sola estructura con
// tres vistas. Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaActividades } from "./ficha-actividades"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
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
const ACT1 = {
  ...STAMP,
  id: "a1",
  objetivo_id: "o1",
  codigo: "1.1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-01-25",
  peso: 1,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: false,
}
const TECNICO = {
  base: "vigente",
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  avance_real: 30,
  avance_programado: 40,
  desviacion_pp: 10,
  color: "rojo",
  umbrales: { umbral1: 10, umbral2: 20, confirmado: true },
  objetivos: [{ codigo: "OBJ-1", programado: 50, ejecutado: 40, color: "amarillo" }],
  actividades: [
    {
      id: "a1",
      codigo: "1.1",
      nombre: "Taller de formación",
      peso: 1,
      progreso: 40,
      estado: "EN_CURSO",
      fecha_cumplimiento: null,
      objetivo_codigo: "OBJ-1",
      programado: 50,
      dias: 21,
      al_corte: 21,
      color: "amarillo",
      sin_soporte: true,
    },
  ],
}
const CURVA = {
  base: "vigente",
  corte: "2026-03",
  periodos: [{ periodo: "2026-03", tecnico: { planeado: 70, ejecutado: 55 }, financiero: { planeado: 80, ejecutado: 60 } }],
}

describe("FichaActividades", () => {
  const fetchMock = vi.fn()

  function setup(proyecto: Partial<ProjectListRow> = {}, rol = "ADMINISTRADOR") {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input).split("?")[0]
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      if (url.endsWith("/technical-status")) return Promise.resolve(jsonResponse(TECNICO))
      if (url.endsWith("/curve")) return Promise.resolve(jsonResponse(CURVA))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: [ACT1] }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: [OBJ1] }))
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables: [] }))
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: [] }))
      if (url.endsWith("/beneficiaries")) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [], total: 0 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<FichaActividades proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper })
  }

  const vistas = () => screen.getAllByRole("tab").map((tab) => tab.textContent)

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("view switcher", () => {
    it("offers Lista, Gantt and Tablero in execution, with Lista selected", async () => {
      setup()

      await screen.findByTestId("ejecucion")
      expect(vistas()).toEqual(["Lista", "Gantt", "Tablero"])
      expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true")
    })

    it("hides the Tablero in BORRADOR: there is nothing to track yet", async () => {
      setup({ estado: "BORRADOR" })

      await screen.findByTestId("estructura")
      expect(vistas()).toEqual(["Lista", "Gantt"])
    })

    it("mounts only the active view", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("ejecucion")
      expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()
      expect(screen.queryByTestId("tablero")).not.toBeInTheDocument()

      await user.click(screen.getByRole("tab", { name: "Gantt" }))
      expect(await screen.findByTestId("gantt")).toBeInTheDocument()
      expect(screen.queryByTestId("ejecucion")).not.toBeInTheDocument()

      await user.click(screen.getByRole("tab", { name: "Tablero" }))
      expect(await screen.findByTestId("tablero")).toBeInTheDocument()
      expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()
    })

    it("shows the editable structure as the Lista in BORRADOR and the Gantt on request", async () => {
      const user = userEvent.setup()
      setup({ estado: "BORRADOR" })

      expect(await screen.findByTestId("estructura")).toBeInTheDocument()
      expect(screen.queryByTestId("ejecucion")).not.toBeInTheDocument()

      await user.click(screen.getByRole("tab", { name: "Gantt" }))
      expect(await screen.findByTestId("gantt")).toBeInTheDocument()
      expect(screen.queryByTestId("estructura")).not.toBeInTheDocument()
    })
  })

  describe("Lista in execution", () => {
    it("does not repeat the semáforo panel, the cronograma or the Gantt", async () => {
      setup()

      const ejecucion = await screen.findByTestId("ejecucion")
      expect(await within(ejecucion).findByTestId("ejecucion-actividad")).toBeInTheDocument()
      expect(screen.queryByTestId("semaforo-tecnico")).not.toBeInTheDocument()
      expect(screen.queryByTestId("cronograma")).not.toBeInTheDocument()
      expect(screen.queryByTestId("gantt")).not.toBeInTheDocument()
    })

    it("shows plan, real, days and support on the activity row", async () => {
      setup()

      const fila = await screen.findByTestId("ejecucion-actividad")
      expect(fila).toHaveTextContent("Taller de formación")
      expect(fila).toHaveTextContent("40 % real")
      expect(fila).toHaveTextContent("50 % plan")
      expect(fila).toHaveTextContent("Amarillo")
      expect(fila).toHaveTextContent("21 días")
      expect(fila).toHaveTextContent("Sin soporte")
    })

    it("keeps the S-curve and the Base selector in a collapsed 'Opciones avanzadas' disclosure", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("ejecucion-actividad")
      const boton = screen.getByRole("button", { name: "Opciones avanzadas" })
      expect(boton).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByRole("combobox", { name: "Base" })).not.toBeInTheDocument()
      expect(screen.queryByTestId("curve-s-chart")).not.toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/curve"))).toBe(false)

      await user.click(boton)
      expect(boton).toHaveAttribute("aria-expanded", "true")
      expect(await screen.findByTestId("curve-s-chart")).toBeInTheDocument()
      expect(screen.getByRole("combobox", { name: "Base" })).toHaveValue("vigente")
    })

    it("reads the original baseline when chosen in the advanced options", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("ejecucion-actividad")
      await user.click(screen.getByRole("button", { name: "Opciones avanzadas" }))
      await user.selectOptions(await screen.findByRole("combobox", { name: "Base" }), "original")

      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/technical-status?base=original"))).toBe(true),
      )
    })

    it("keeps the indicators in a collapsed section", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("ejecucion-actividad")
      const boton = screen.getByRole("button", { name: "Indicadores" })
      expect(boton).toHaveAttribute("aria-expanded", "false")
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/indicators"))).toBe(false)

      await user.click(boton)
      expect(boton).toHaveAttribute("aria-expanded", "true")
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/indicators"))).toBe(true),
      )
    })
  })

  describe("Tablero card", () => {
    it("opens the Lista and focuses the activity row", async () => {
      const user = userEvent.setup()
      setup()

      await screen.findByTestId("ejecucion-actividad")
      await user.click(screen.getByRole("tab", { name: "Tablero" }))
      await user.click(await screen.findByRole("button", { name: /Taller de formación/ }))

      expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true")
      expect(screen.queryByTestId("tablero")).not.toBeInTheDocument()
      const fila = await screen.findByTestId("ejecucion-actividad")
      await waitFor(() => expect(fila).toHaveFocus())
    })
  })
})
