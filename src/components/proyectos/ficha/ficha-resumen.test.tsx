// Resumen de la ficha (U3): la salud técnica y financiera con una frase de causa, los enlaces a la
// pestaña que resuelve cada cosa y la lista de próximos pasos de un borrador. Las queries son reales;
// solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaResumen } from "./ficha-resumen"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 1200,
  lineas: [],
  municipios: [],
}

const tecnico = (color: string) => ({ corte: "2026-03-15", avance_real: 42, avance_programado: 55, desviacion_pp: 13, color })
const financiero = (color: string, extra: Record<string, unknown> = {}) => ({
  corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "41.50", ea: 41.5, ep: 83, color, alerta_retraso: false, ...extra,
})

function kpis(overrides: Record<string, unknown> = {}) {
  return {
    base: "vigente", corte: "2026-03-15", estado: "EN_EJECUCION", medible: true, confirmado: true,
    tecnico: tecnico("amarillo"), cronograma: null, entregables: null, indicadores: null, beneficiarios: null,
    financiero: financiero("verde"), ...overrides,
  }
}

const ITEMS = [
  { tipo: "actividad_atrasada", titulo: "Actividad atrasada", detalle: "A1", actividad_id: "a1" },
  { tipo: "actividad_atrasada", titulo: "Actividad atrasada", detalle: "A2", actividad_id: "a2" },
  { tipo: "actividad_atrasada", titulo: "Actividad atrasada", detalle: "A3", actividad_id: "a3" },
  { tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R1", rubro_id: "r1" },
]

describe("FichaResumen", () => {
  const fetchMock = vi.fn()

  function mockApi({
    kpisBody = kpis(),
    items = [] as unknown[],
    objetivos = [] as unknown[],
    actividades = [] as unknown[],
    suma = "0.00",
  } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/kpis")) return Promise.resolve(jsonResponse(kpisBody))
      if (url.includes("/attention")) return Promise.resolve(jsonResponse({ corte: "2026-03-15", medible: true, items }))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos }))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades }))
      if (url.endsWith("/budget")) {
        return Promise.resolve(jsonResponse({ estado: "BORRADOR", rubros: [], suma, valor_total: null, diferencia: null }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      return Promise.resolve(jsonResponse({}))
    })
  }

  function renderResumen(proyecto: ProjectListRow = PROYECTO, onIrA = vi.fn()) {
    render(<FichaResumen proyecto={proyecto} onIrA={onIrA} />, { wrapper: createWrapper() })
    return onIrA
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ["verde", "Al día"],
    ["amarillo", "Atención"],
    ["rojo", "En riesgo"],
  ])("names a %s technical semáforo as %s and explains it with the real vs planned progress", async (color, label) => {
    mockApi({ kpisBody: kpis({ tecnico: tecnico(color) }) })

    renderResumen()

    const fila = await screen.findByTestId("salud-tecnico")
    expect(fila).toHaveAttribute("data-color", color)
    expect(fila).toHaveTextContent(label)
    expect(fila).toHaveTextContent("Avance real 42 % frente a 55 % programado")
  })

  it.each([
    ["verde", "Al día"],
    ["amarillo", "Atención"],
    ["rojo", "En riesgo"],
  ])("names a %s financial semáforo as %s", async (color, label) => {
    mockApi({ kpisBody: kpis({ financiero: financiero(color) }) })

    renderResumen()

    const fila = await screen.findByTestId("salud-financiero")
    expect(fila).toHaveAttribute("data-color", color)
    expect(fila).toHaveTextContent(label)
    expect(fila).toHaveTextContent("Ejecutado 83 % de lo programado")
  })

  it("adds the attention causes to each sentence", async () => {
    mockApi({
      items: [
        ...ITEMS,
        { tipo: "avance_sin_soporte", titulo: "x", detalle: "x", avance_id: "v1" },
        { tipo: "indicador_bajo_meta", titulo: "x", detalle: "x", indicador_id: "i1" },
        { tipo: "gasto_observado", titulo: "x", detalle: "x", gasto_id: "g1" },
        { tipo: "alerta_retraso", titulo: "x", detalle: "x" },
      ],
    })

    renderResumen()

    const tecnicoFila = await screen.findByTestId("salud-tecnico")
    await within(tecnicoFila).findByText(/3 actividades atrasadas/)
    expect(tecnicoFila).toHaveTextContent("1 avance sin soporte")
    expect(tecnicoFila).toHaveTextContent("1 indicador bajo la meta")
    const financieraFila = screen.getByTestId("salud-financiero")
    expect(financieraFila).toHaveTextContent("1 rubro sobreejecutado")
    expect(financieraFila).toHaveTextContent("1 gasto pendiente por revisión")
    expect(financieraFila).toHaveTextContent("posible retraso en la ejecución")
  })

  it("shows the beneficiaries figure, and omits it when there is no goal", async () => {
    mockApi()
    const primero = render(<FichaResumen proyecto={PROYECTO} onIrA={vi.fn()} />, { wrapper: createWrapper() })
    expect(await screen.findByTestId("resumen-beneficiarios")).toHaveTextContent("Beneficiarios 1.200")
    primero.unmount()

    renderResumen({ ...PROYECTO, beneficiarios_meta: null })
    await screen.findByTestId("salud-tecnico")
    expect(screen.queryByTestId("resumen-beneficiarios")).not.toBeInTheDocument()
  })

  it("shows the description as a paragraph in Datos generales, and hides it when there is none", async () => {
    mockApi()
    const primero = render(
      <FichaResumen proyecto={{ ...PROYECTO, descripcion: "Alcance del convenio" }} onIrA={vi.fn()} />,
      { wrapper: createWrapper() },
    )
    const datos = await screen.findByTestId("datos-generales")
    expect(within(datos).getByTestId("resumen-descripcion")).toHaveTextContent("Alcance del convenio")
    primero.unmount()

    renderResumen({ ...PROYECTO, descripcion: null })
    await screen.findByTestId("salud-tecnico")
    expect(screen.queryByTestId("resumen-descripcion")).not.toBeInTheDocument()
  })

  it("explains that a project that is not measurable has no health yet", async () => {
    mockApi({ kpisBody: kpis({ medible: false, tecnico: null, financiero: null }) })

    renderResumen({ ...PROYECTO, estado: "PLANIFICACION" })

    expect(await screen.findByText(/Los indicadores se calculan cuando el proyecto está en ejecución/)).toBeInTheDocument()
    expect(screen.queryByTestId("salud-tecnico")).not.toBeInTheDocument()
  })

  it("switches the tab from the health rows and from the attention items", async () => {
    mockApi({ items: ITEMS })
    const user = userEvent.setup()

    const onIrA = renderResumen()
    const [filaActividades] = await screen.findAllByRole("button", { name: "Ver actividades" })
    await user.click(filaActividades!)
    await user.click(screen.getAllByRole("button", { name: "Ver finanzas" })[0]!)

    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(["actividades", "finanzas"])
    const item = await screen.findByTestId("atencion-rubro_sobreejecucion")
    await user.click(within(item).getByRole("button", { name: "Ver finanzas" }))
    expect(onIrA).toHaveBeenLastCalledWith("finanzas")
  })

  it("replaces the health rows with the setup checklist in a draft and marks what is done", async () => {
    mockApi({ objetivos: [{ id: "o1" }], actividades: [{ id: "a1" }], suma: "1000.00" })

    renderResumen({ ...PROYECTO, estado: "BORRADOR" })

    await screen.findByTestId("proximos-pasos")
    expect(screen.queryByTestId("resumen-estado")).not.toBeInTheDocument()
    expect(screen.queryByTestId("requiere-atencion")).not.toBeInTheDocument()
    expect(screen.getByTestId("paso-datos")).toHaveAttribute("data-hecho", "true")
    await vi.waitFor(() => expect(screen.getByTestId("paso-estructura")).toHaveAttribute("data-hecho", "true"))
    await vi.waitFor(() => expect(screen.getByTestId("paso-presupuesto")).toHaveAttribute("data-hecho", "true"))
    expect(screen.getByTestId("paso-linea-base")).toHaveAttribute("data-hecho", "false")
    expect(screen.getByTestId("paso-linea-base")).toHaveTextContent(/Aprobar línea base/)
    expect(screen.queryByRole("button", { name: /Aprobar línea base/ })).not.toBeInTheDocument()
  })

  it("flags pending steps, hints the Excel load and links them to their tab", async () => {
    mockApi()
    const user = userEvent.setup()

    const onIrA = renderResumen({ ...PROYECTO, estado: "BORRADOR", valor_total: null })

    const estructura = await screen.findByTestId("paso-estructura")
    await vi.waitFor(() => expect(estructura).toHaveAttribute("data-hecho", "false"))
    expect(screen.getByTestId("paso-datos")).toHaveAttribute("data-hecho", "false")
    expect(estructura).toHaveTextContent("Puedes cargarlos desde Excel en Actividades.")
    await user.click(within(estructura).getByRole("button", { name: "Ir a Actividades" }))
    await user.click(within(screen.getByTestId("paso-presupuesto")).getByRole("button", { name: "Ir a Finanzas" }))
    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(["actividades", "finanzas"])
  })

  it("keeps the general data and the team at the end, with no beneficiaries registry (M5)", async () => {
    mockApi()

    renderResumen()

    const datos = await screen.findByTestId("datos-generales")
    expect(datos).toHaveTextContent("Alcaldía")
    expect(datos).toHaveTextContent("$ 180.000.000")
    const equipo = await screen.findByTestId("equipo")
    expect(datos.compareDocumentPosition(equipo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId("registro-beneficiarios")).not.toBeInTheDocument()
    expect(screen.queryByText("Registro de beneficiarios")).not.toBeInTheDocument()
    expect(datos).toHaveTextContent("Beneficiarios")
    expect(datos).toHaveTextContent("1.200")
  })
})
