// S4 U6: sección "Ejecución técnica" de la ficha. Las queries son reales; solo
// se burla `fetch`, igual que en project-estructura.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

const CURVA = {
  base: "vigente",
  corte: "2026-10",
  periodos: [
    { periodo: "2026-09", tecnico: { planeado: 40, ejecutado: 30 }, financiero: { planeado: 45, ejecutado: 35 } },
    { periodo: "2026-10", tecnico: { planeado: 70, ejecutado: 55 }, financiero: { planeado: 80, ejecutado: 60 } },
    { periodo: "2026-11", tecnico: { planeado: 100, ejecutado: null }, financiero: { planeado: 100, ejecutado: null } },
  ],
}

type Setup = {
  proyecto?: Partial<ProjectListRow>
  tecnico?: unknown
  tecnicoStatus?: number
  curva?: unknown
  actividades?: unknown[]
  actividadesStatus?: number
  entregables?: unknown[]
  rol?: string
  miembros?: unknown[]
  seguimiento?: boolean
}

describe("ProjectEjecucion", () => {
  const fetchMock = vi.fn()

  function setup({
    proyecto = {},
    tecnico = TECNICO,
    tecnicoStatus = 200,
    curva = CURVA,
    actividades = [ACTIVIDAD],
    actividadesStatus = 200,
    entregables = [ENTREGABLE],
    rol = "ADMINISTRADOR",
    miembros = [],
    seguimiento = false,
  }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros }))
      if (url.split("?")[0].endsWith("/technical-status")) {
        const base = url.includes("base=original") ? "original" : "vigente"
        return Promise.resolve(jsonResponse(tecnicoStatus === 200 ? { ...(tecnico as object), base } : tecnico, tecnicoStatus))
      }
      if (url.split("?")[0].endsWith("/curve")) {
        const base = url.includes("base=original") ? "original" : "vigente"
        return Promise.resolve(jsonResponse({ ...(curva as object), base }))
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
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: [] }))
      if (url.endsWith("/beneficiaries")) {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [], total: 0 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectEjecucion proyecto={{ ...PROYECTO, ...proyecto }} seguimiento={seguimiento} />, {
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

  it("reads the original (v0) from the semáforo base selector and keeps showing the section", async () => {
    const user = userEvent.setup()
    setup()

    const base = await screen.findByRole("combobox", { name: "Base" })
    await user.selectOptions(base, "original")

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/technical-status?base=original"))).toBe(true),
    )
    expect(screen.getByRole("combobox", { name: "Base" })).toHaveValue("original")
    expect(screen.getByTestId("semaforo-tecnico")).toBeInTheDocument()
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

  it("shows the same real - plan deviation on the top card and on the 'Diferencia' side card", async () => {
    // Curve 2026-10: planeado 70 / ejecutado 55 -> side card -15; the top card must agree (behind = negative).
    setup({ seguimiento: true, tecnico: { ...TECNICO, avance_real: 55, avance_programado: 70, desviacion_pp: 15 } })

    const semaforo = await screen.findByTestId("semaforo-tecnico")
    expect(semaforo).toHaveTextContent("-15 pp")
    const lateral = await screen.findByTestId("seguimiento-lateral")
    await waitFor(() => expect(lateral).toHaveTextContent("-15 pp"))
  })

  it("mounts the S-curve with its monthly table in the Avance tab", async () => {
    setup()

    const curva = await screen.findByTestId("curve-s-chart")
    expect(curva).toHaveTextContent("Curva S")
    expect(curva).toHaveTextContent("Avance técnico")
    expect(curva).toHaveTextContent("Avance financiero")
    const tabla = within(curva).getByTestId("curve-s-tabla")
    expect(within(tabla).getByText("sep 2026")).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/curve", expect.any(Object)),
    )
  })

  it("refetches the curve when the base selector changes", async () => {
    const user = userEvent.setup()
    setup()

    const base = await screen.findByRole("combobox", { name: "Base" })
    await user.selectOptions(base, "original")

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/curve?base=original"))).toBe(true),
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

  describe("write controls (decisión 3)", () => {
    const MIEMBRO_COORDINADOR = {
      id: "m1",
      usuario: { id: "u1", nombre: "Ana", rol: "COORDINADOR" },
      agregado_por_id: "u9",
      created_at: "2026-10-08T00:00:00.000Z",
      removed_at: null,
    }

    it("offers the avance control to a manager", async () => {
      setup({ rol: "ADMINISTRADOR" })

      expect(await screen.findByRole("button", { name: "Registrar avance ENT-1" })).toBeInTheDocument()
    })

    it("offers it to a COORDINADOR who is an active member", async () => {
      setup({ rol: "COORDINADOR", miembros: [MIEMBRO_COORDINADOR] })

      expect(await screen.findByRole("button", { name: "Registrar avance ENT-1" })).toBeInTheDocument()
    })

    it("hides it from a COORDINADOR who is not a member", async () => {
      setup({ rol: "COORDINADOR", miembros: [] })

      await screen.findByTestId("ejecucion-actividad")
      expect(screen.queryByRole("button", { name: "Registrar avance ENT-1" })).not.toBeInTheDocument()
    })

    it("hides it from a COLABORADOR", async () => {
      setup({ rol: "COLABORADOR", miembros: [] })

      await screen.findByTestId("ejecucion-actividad")
      expect(screen.queryByRole("button", { name: "Registrar avance ENT-1" })).not.toBeInTheDocument()
    })

    it("shows the void control only to a manager", async () => {
      setup({ rol: "ADMINISTRADOR" })

      await screen.findByTestId("ejecucion-entregable")
      // El entregable tiene un avance sin anular: el gestor puede anularlo.
      expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument()
    })

    it("hides the void control from an active-member COORDINADOR", async () => {
      setup({ rol: "COORDINADOR", miembros: [MIEMBRO_COORDINADOR] })

      await screen.findByTestId("ejecucion-entregable")
      expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
    })
  })
})
