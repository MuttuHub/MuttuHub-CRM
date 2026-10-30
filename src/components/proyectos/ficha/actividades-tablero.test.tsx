// U5: Tablero de solo lectura. Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ActividadesTablero } from "./actividades-tablero"

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
const act = (id: string, codigo: string, nombre: string, fin: string, responsable_id: string | null = null) => ({
  ...STAMP,
  id,
  objetivo_id: "o1",
  codigo,
  nombre,
  semana_inicio: 1,
  semana_fin: 2,
  fecha_inicio: "2026-01-05",
  fecha_fin: fin,
  peso: 1,
  peso_manual: false,
  responsable_id,
  fuera_de_duracion: false,
})

const tec = (id: string, codigo: string, nombre: string, progreso: number, color: string, programado = 50) => ({
  id,
  codigo,
  nombre,
  peso: 1,
  progreso,
  estado: progreso >= 100 ? "FINALIZADA" : progreso > 0 ? "EN_CURSO" : "NO_INICIADA",
  fecha_cumplimiento: null,
  objetivo_codigo: "OBJ-1",
  programado,
  dias: 14,
  al_corte: 14,
  color,
  sin_soporte: false,
})

const ACTIVIDADES = [
  act("a1", "1.1", "Convocatoria", "2026-06-30", "u2"),
  act("a2", "1.2", "Taller", "2026-06-30"),
  act("a3", "1.3", "Visita", "2026-02-01"),
  act("a4", "1.4", "Informe", "2026-06-30"),
  act("a5", "1.5", "Cierre", "2026-06-30"),
]

const TECNICO = {
  base: "vigente",
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  avance_real: 30,
  avance_programado: 40,
  desviacion_pp: 10,
  color: "amarillo",
  umbrales: { umbral1: 10, umbral2: 20, confirmado: true },
  tope_en_curso: 90,
  objetivos: [],
  actividades: [
    tec("a1", "1.1", "Convocatoria", 0, "verde", 0),
    tec("a2", "1.2", "Taller", 45.5, "amarillo", 60),
    tec("a3", "1.3", "Visita", 20, "amarillo"),
    tec("a4", "1.4", "Informe", 10, "rojo"),
    tec("a5", "1.5", "Cierre", 100, "verde", 100),
  ],
}

describe("ActividadesTablero", () => {
  const fetchMock = vi.fn()

  function setup(onAbrirActividad = vi.fn(), proyecto: Partial<ProjectListRow> = {}, tecnico: typeof TECNICO = TECNICO) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input).split("?")[0]
      if (url.endsWith("/technical-status")) return Promise.resolve(jsonResponse(tecnico))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: [OBJ1] }))
      if (url.endsWith("/members")) {
        return Promise.resolve(
          jsonResponse({
            miembros: [
              {
                id: "m1",
                usuario: { id: "u2", nombre: "Carla Ruiz", rol: "COORDINADOR" },
                agregado_por_id: "u1",
                created_at: "2026-10-07T13:00:00.000Z",
                removed_at: null,
              },
            ],
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    render(<ActividadesTablero proyecto={{ ...PROYECTO, ...proyecto }} onAbrirActividad={onAbrirActividad} />, {
      wrapper,
    })
    return onAbrirActividad
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("derives the four columns from the technical status and the dates", async () => {
    setup()

    await screen.findByTestId("tablero-col-por_iniciar")
    const tablero = screen.getByTestId("tablero")
    const col = (id: string) => within(within(tablero).getByTestId(`tablero-col-${id}`))
    await col("por_iniciar").findByText("Convocatoria")
    expect(col("en_curso").getByText("Taller")).toBeInTheDocument()
    // Visita ended 2026-02-01, before the corte, and is unfinished; Informe is red.
    expect(col("atrasada").getByText("Visita")).toBeInTheDocument()
    expect(col("atrasada").getByText("Informe")).toBeInTheDocument()
    expect(col("terminada").getByText("Cierre")).toBeInTheDocument()
    expect(within(tablero).getAllByTestId("tablero-tarjeta")).toHaveLength(5)
  })

  it("keeps a due activity at the tope out of Atrasada: it only waits for soportes (AJ-03)", async () => {
    const actividades = TECNICO.actividades.map((a) => (a.id === "a3" ? tec("a3", "1.3", "Visita", 90, "verde", 90) : a))
    setup(undefined, {}, { ...TECNICO, actividades })

    await screen.findByTestId("tablero-col-en_curso")
    const tablero = screen.getByTestId("tablero")
    const col = (id: string) => within(within(tablero).getByTestId(`tablero-col-${id}`))
    expect(await col("en_curso").findByText("Visita")).toBeInTheDocument()
    expect(col("atrasada").queryByText("Visita")).toBeNull()
  })

  it("titles the columns in the agreed order with their counts", async () => {
    setup()

    const tablero = await screen.findByTestId("tablero")
    await within(tablero).findByText("Convocatoria")
    const titulos = within(tablero)
      .getAllByRole("heading", { level: 4 })
      .map((h) => h.textContent)
    expect(titulos).toEqual(["Por iniciar 1", "En curso 1", "Atrasada 2", "Terminada 1"])
  })

  it("shows code, name, objective, responsable, real vs plan and the semáforo on each card", async () => {
    setup()

    const tarjeta = (await screen.findByText("Taller")).closest("[data-testid=tablero-tarjeta]") as HTMLElement
    expect(tarjeta).toHaveTextContent("1.2")
    expect(tarjeta).toHaveTextContent("OBJ-1")
    expect(tarjeta).toHaveTextContent("45,5 % real")
    expect(tarjeta).toHaveTextContent("60 % plan")
    expect(tarjeta).toHaveTextContent("Amarillo")

    const conResponsable = (await screen.findByText("Convocatoria")).closest("[data-testid=tablero-tarjeta]")
    expect(conResponsable).toHaveTextContent("Carla Ruiz")
  })

  it("asks to open the activity on click and on Enter", async () => {
    const user = userEvent.setup()
    const abrir = setup()

    await user.click(await screen.findByRole("button", { name: /Taller/ }))
    expect(abrir).toHaveBeenCalledWith("a2")

    abrir.mockClear()
    const informe = screen.getByRole("button", { name: /Informe/ })
    informe.focus()
    await user.keyboard("{Enter}")
    expect(abrir).toHaveBeenCalledWith("a4")
  })

  it("is read-only: no drag handles and no write requests", async () => {
    setup()

    await screen.findByText("Taller")
    expect(document.querySelector("[draggable=true]")).toBeNull()
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true)
  })

  it("says so when the project has no activities", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input).split("?")[0]
      if (url.endsWith("/technical-status")) return Promise.resolve(jsonResponse({ ...TECNICO, actividades: [] }))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: [] }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: [] }))
      return Promise.resolve(jsonResponse({ miembros: [] }))
    })
    render(<ActividadesTablero proyecto={PROYECTO} onAbrirActividad={vi.fn()} />, { wrapper })

    expect(await screen.findByText("Este proyecto todavía no tiene actividades.")).toBeInTheDocument()
  })
})
