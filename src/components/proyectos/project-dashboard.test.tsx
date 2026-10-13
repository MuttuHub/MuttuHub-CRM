// S9 U6: tablero del portafolio. Se burla `@/hooks/projects` entero (más los catálogos de filtros): lo que
// se fija es lo observable. Los colores y porcentajes llegan del servidor y se pintan verbatim.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PortfolioFilters, ProjectCurve, ProjectKpis, ProjectListRow, ProjectsPortfolio } from "@/hooks/projects"
import { mockViewport } from "@/test/viewport"
import { ProjectDashboard } from "./project-dashboard"

const { toast, usePortfolio, useCurve, downloadPortfolioExport, state } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  usePortfolio: vi.fn(),
  useCurve: vi.fn(),
  downloadPortfolioExport: vi.fn(),
  state: {
    query: { data: undefined, isLoading: false, isError: false, error: null } as {
      data: unknown
      isLoading: boolean
      isError: boolean
      error: unknown
    },
    list: [] as unknown[],
    curva: undefined as ProjectCurve | undefined,
  },
}))

vi.mock("sonner", () => ({ toast }))
vi.mock("@/hooks/projects", () => ({
  useProjectsPortfolio: (filters: PortfolioFilters) => {
    usePortfolio(filters)
    return state.query
  },
  useProjectCurve: (id: string) => {
    useCurve(id)
    return { data: state.curva, isLoading: false, isError: false }
  },
  useProjects: () => ({ data: { proyectos: state.list }, isLoading: false, isError: false }),
  downloadPortfolioExport: (...args: unknown[]) => downloadPortfolioExport(...args),
  useStrategicLines: () => ({ data: [{ id: "l1", codigo: "LE01", nombre: "Educación", activo: true }] }),
  useMunicipalities: () => ({ data: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico", activo: true }] }),
}))
vi.mock("@/hooks/crm", () => ({ useUsers: () => ({ data: [{ id: "u1", nombre: "Ana Pérez" }] }) }))
vi.mock("@/hooks/kanban", () => ({ useClientOptions: () => ({ data: [{ id: "c1", nombre: "Alcaldía" }] }) }))

const kpis = (over: object = {}): ProjectKpis => ({
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: false,
  tecnico: null,
  cronograma: null,
  entregables: null,
  indicadores: null,
  beneficiarios: null,
  financiero: null,
  ...over,
}) as ProjectKpis

const PORTAFOLIO: ProjectsPortfolio = {
  base: "vigente",
  corte: "2026-03-15",
  confirmado: false,
  proyectos: [
    {
      id: "p1",
      codigo: "PRY-2026-001",
      nombre: "Fortalecimiento",
      estado: "EN_EJECUCION",
      cliente: { id: "c1", nombre: "Alcaldía" },
      responsable: { id: "u1", nombre: "Ana Pérez" },
      linea_principal: { id: "l1", codigo: "LE01", nombre: "Educación" },
      fecha_inicio: "2026-01-05",
      fecha_fin: "2026-06-30",
      // Incoherente a propósito con los umbrales por defecto: la UI pinta lo que dice el servidor.
      semaforo_tecnico: "rojo",
      semaforo_financiero: "verde",
      alerta_retraso: true,
      atrasadas: 1,
      kpis: kpis({
        tecnico: { corte: "2026-03-15", avance_real: 21.4, avance_programado: 21.4, desviacion_pp: 0, color: "rojo" },
        cronograma: { corte: "2026-03-15", vencidas: 1, a_tiempo: 3, atrasadas: 1, valor: 75 },
        // 1/3 se redondearía a 33 en el cliente; el servidor manda 33.3 (D11).
        entregables: { corte: "2026-03-15", programados: 3, logrados: 1, valor: 33.3 },
        financiero: { corte: "2026-03-15", asignado: "1000", programado: "500", ejecutado: "100", ea: 10, ep: 20, color: "verde", alerta_retraso: true },
      }),
    },
    {
      id: "p2",
      codigo: "PRY-2026-002",
      nombre: "Borrador",
      estado: "BORRADOR",
      cliente: { id: "c1", nombre: "Alcaldía" },
      responsable: null,
      linea_principal: null,
      fecha_inicio: null,
      fecha_fin: null,
      semaforo_tecnico: null,
      semaforo_financiero: null,
      alerta_retraso: null,
      atrasadas: null,
      kpis: kpis({ estado: "BORRADOR", medible: false }),
    },
  ],
  agregado: {
    corte: "2026-03-15",
    tecnico: { proyectos: 1, avance_real: 21.4, avance_programado: 25 },
    financiero: { proyectos: 1, asignado: "1000", programado: "500", ejecutado: "100", ea: 10, ep: 20 },
    atrasadas: 1,
    beneficiarios: { total: 30, meta: 100 },
    por_linea: [
      {
        linea: { id: "l1", codigo: "LE01", nombre: "Educación" },
        proyectos: 1,
        tecnico: { avance_real: 21.4, avance_programado: 25 },
        indicadores: { valor: 80, medidos: 2, en_meta: 1 },
      },
      {
        linea: null,
        proyectos: 1,
        tecnico: { avance_real: null, avance_programado: null },
        indicadores: { valor: null, medidos: 0, en_meta: 0 },
      },
    ],
    por_color_tecnico: { verde: 0, amarillo: 0, rojo: 1 },
    por_color_financiero: { verde: 1, amarillo: 0, rojo: 0 },
  },
  por_estado: { EN_EJECUCION: 1, BORRADOR: 1 },
}

/** `useProjects` (the list) feeds the territory table (D7) by id. */
const LISTA: ProjectListRow[] = [
  {
    id: "p1",
    codigo: "PRY-2026-001",
    nombre: "Fortalecimiento",
    estado: "EN_EJECUCION",
    origen: null,
    cliente: { id: "c1", nombre: "Alcaldía" },
    responsable: { id: "u1", nombre: "Ana Pérez" },
    fecha_inicio: "2026-01-05",
    fecha_fin: "2026-06-30",
    duracion_semanas: 25,
    valor_total: "1000",
    diferencia_valor_oportunidad: null,
    alertas: [],
    beneficiarios_meta: 100,
    lineas: [],
    // The same project touches two departments: D7 counts it in both.
    municipios: [
      { id: "m1", nombre: "Barranquilla", departamento: "Atlántico" },
      { id: "m2", nombre: "Cartagena", departamento: "Bolívar" },
    ],
  },
  {
    id: "p2",
    codigo: "PRY-2026-002",
    nombre: "Borrador",
    estado: "BORRADOR",
    origen: null,
    cliente: { id: "c1", nombre: "Alcaldía" },
    responsable: null,
    fecha_inicio: null,
    fecha_fin: null,
    duracion_semanas: null,
    valor_total: null,
    diferencia_valor_oportunidad: null,
    alertas: [],
    beneficiarios_meta: null,
    lineas: [],
    municipios: [],
  },
]

const CURVA: ProjectCurve = {
  base: "vigente",
  corte: "2026-03",
  periodos: [
    { periodo: "2026-01", tecnico: { planeado: 10, ejecutado: 8 }, financiero: { planeado: 5, ejecutado: 4 } },
    { periodo: "2026-02", tecnico: { planeado: 40, ejecutado: 30 }, financiero: { planeado: 35, ejecutado: 20 } },
    { periodo: "2026-03", tecnico: { planeado: 70, ejecutado: 55 }, financiero: { planeado: 60, ejecutado: 45 } },
    { periodo: "2026-04", tecnico: { planeado: 100, ejecutado: null }, financiero: { planeado: 100, ejecutado: null } },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  state.query = { data: PORTAFOLIO, isLoading: false, isError: false, error: null }
  state.list = LISTA
  state.curva = CURVA
})

describe("ProjectDashboard", () => {
  it("paints both semáforos from the payload, one row per project", () => {
    render(<ProjectDashboard />)
    const fila = screen.getByTestId("tablero-fila-p1")
    expect(within(fila).getByText("PRY-2026-001")).toBeInTheDocument()
    expect(within(fila).getByTestId("chip-tecnico")).toHaveAttribute("data-color", "rojo")
    expect(within(fila).getByText("Rojo")).toBeInTheDocument()
    expect(within(fila).getByTestId("chip-financiero")).toHaveAttribute("data-color", "verde")
    expect(within(fila).getByText("Verde")).toBeInTheDocument()
    expect(within(fila).getByText("21,4 %")).toBeInTheDocument()
    expect(within(fila).getByText("Posible retraso")).toBeInTheDocument()
  })

  it("below md the portfolio rows become cards that keep the server semáforos and a 44 px action", async () => {
    mockViewport(true)
    try {
      const user = userEvent.setup()
      render(<ProjectDashboard />)
      // El listado de proyectos pasa a tarjetas; las tablas del tablero gerencial (curva, territorio) siguen.
      expect(screen.queryByRole("columnheader", { name: "Acciones" })).toBeNull()
      const fila = screen.getByTestId("tablero-fila-p1")
      expect(fila.tagName).toBe("LI")
      expect(within(fila).getByTestId("chip-tecnico")).toHaveAttribute("data-color", "rojo")
      expect(within(fila).getByTestId("chip-financiero")).toHaveAttribute("data-color", "verde")
      expect(within(fila).getByText("21,4 %")).toBeInTheDocument()
      const enlace = within(fila).getByRole("link", { name: /Ver detalle/ })
      expect(enlace.className).toMatch(/(^|\s)h-11(\s|$)/)
      expect(enlace).toHaveAttribute("href", "/proyectos/p1")
      expect(enlace).toHaveAttribute("target", "_blank")
      expect(enlace.getAttribute("rel")).toMatch(/noopener/)
      expect(enlace.getAttribute("rel")).toMatch(/noreferrer/)
      await user.click(enlace)
      expect(screen.queryByRole("dialog")).toBeNull()
    } finally {
      mockViewport(false)
    }
  })

  it("lists a project that is not measurable with 'Sin medir' and no color", () => {
    render(<ProjectDashboard />)
    const fila = screen.getByTestId("tablero-fila-p2")
    expect(within(fila).getAllByText("Sin medir")).toHaveLength(2)
    expect(within(fila).queryByTestId("chip-tecnico")).not.toBeInTheDocument()
  })

  it("shows the weighted aggregate, the states and the 'No confirmado' badge", () => {
    render(<ProjectDashboard />)
    expect(screen.getByTestId("tablero-ea")).toHaveTextContent("10 %")
    expect(screen.getByTestId("tablero-ejecutado")).toHaveTextContent("$ 100")
    expect(screen.getByTestId("tablero-estados")).toHaveTextContent("En ejecución")
    expect(screen.getByTestId("tablero-estados")).toHaveTextContent("Borrador")
    expect(screen.getByText("No confirmado")).toBeInTheDocument()
  })

  it("hides the badge once the parameters are confirmed", () => {
    state.query = { ...state.query, data: { ...PORTAFOLIO, confirmado: true } }
    render(<ProjectDashboard />)
    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("groups the territory by department, counting a project in every department it touches (D7)", () => {
    render(<ProjectDashboard />)
    const territorio = screen.getByTestId("tablero-territorio")
    expect(territorio).toHaveTextContent("Atlántico")
    expect(territorio).toHaveTextContent("Bolívar")
    const atlantico = within(territorio).getByTestId("territorio-Atlántico")
    const bolivar = within(territorio).getByTestId("territorio-Bolívar")
    // The same project p1 is counted in both departments it touches.
    expect(atlantico).toHaveTextContent("1")
    expect(bolivar).toHaveTextContent("1")
    // The dots/words come from the server semáforos, verbatim.
    expect(atlantico).toHaveTextContent("Rojo")
    expect(atlantico).toHaveTextContent("Verde")
  })

  it("keeps the territory table out of the payload: no por_territorio aggregate is requested", () => {
    render(<ProjectDashboard />)
    expect(screen.getByTestId("tablero-territorio")).toBeInTheDocument()
    // The dashboard derives the territory by merging the list by id, not from the aggregate.
    expect(state.query.data).not.toHaveProperty("por_territorio")
  })

  it("changing a filter changes the query filters (the query key)", async () => {
    render(<ProjectDashboard />)
    expect(usePortfolio).toHaveBeenLastCalledWith({})
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText("Estado"), "EN_EJECUCION")
    expect(usePortfolio).toHaveBeenLastCalledWith({ estado: "EN_EJECUCION" })
    await user.selectOptions(screen.getByLabelText("Línea estratégica"), "l1")
    await user.selectOptions(screen.getByLabelText("Municipio"), "m1")
    await user.selectOptions(screen.getByLabelText("Cliente"), "c1")
    await user.selectOptions(screen.getByLabelText("Responsable"), "u1")
    await user.type(screen.getByLabelText("Corte"), "2026-03-01")
    expect(usePortfolio).toHaveBeenLastCalledWith({
      estado: "EN_EJECUCION",
      linea_id: "l1",
      municipio_id: "m1",
      cliente_id: "c1",
      responsable_id: "u1",
      corte: "2026-03-01",
    })
  })

  it("shows the empty state when no project is visible", () => {
    state.query = { ...state.query, data: { ...PORTAFOLIO, proyectos: [], por_estado: {} } }
    render(<ProjectDashboard />)
    expect(screen.getByText("No hay proyectos para mostrar")).toBeInTheDocument()
    expect(screen.getByText("No hay proyectos para mostrar").closest("[data-slot='empty-state']")).not.toBeNull()
    expect(screen.queryByTestId("tablero-fila-p1")).not.toBeInTheDocument()
  })

  it("shows a skeleton while loading and a readable error on failure", () => {
    state.query = { data: undefined, isLoading: true, isError: false, error: null }
    const { unmount } = render(<ProjectDashboard />)
    expect(screen.getByTestId("tablero-skeleton")).toBeInTheDocument()
    unmount()
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("No tienes permisos para ver el tablero de proyectos.") }
    render(<ProjectDashboard />)
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permisos para ver el tablero de proyectos.")
  })

  it("the export button downloads the portfolio with the active filters; a failure is a toast", async () => {
    downloadPortfolioExport.mockResolvedValueOnce(undefined)
    render(<ProjectDashboard />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText("Estado"), "EN_EJECUCION")
    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(downloadPortfolioExport).toHaveBeenCalledWith({ estado: "EN_EJECUCION" })
    downloadPortfolioExport.mockRejectedValueOnce(new Error("Formato no disponible."))
    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(toast.error).toHaveBeenCalledWith("Formato no disponible.")
  })

  it("links the 'Ver detalle' of a table row to the ficha page in a new tab, without a dialog", async () => {
    render(<ProjectDashboard />)
    const enlace = within(screen.getByTestId("tablero-fila-p1")).getByRole("link", { name: "Ver detalle" })
    expect(enlace).toHaveAttribute("href", "/proyectos/p1")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(enlace.getAttribute("rel")).toMatch(/noopener/)
    expect(enlace.getAttribute("rel")).toMatch(/noreferrer/)
    await userEvent.setup().click(enlace)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("pins the action column to the right edge with an opaque background so it stays reachable when the table scrolls", () => {
    render(<ProjectDashboard />)
    const cabecera = screen.getByRole("columnheader", { name: "Acciones" })
    expect(cabecera.className).toMatch(/\bsticky\b/)
    expect(cabecera.className).toMatch(/\bright-0\b/)
    expect(cabecera.className).toMatch(/\bbg-panel\b/)

    const fila = screen.getByTestId("tablero-fila-p1")
    const celda = within(fila).getByRole("link", { name: "Ver detalle" }).closest("td")!
    expect(celda.className).toMatch(/\bsticky\b/)
    expect(celda.className).toMatch(/\bright-0\b/)
    expect(celda.className).toMatch(/\bbg-panel\b/)
    expect(celda.className).toMatch(/group-hover\/fila:bg-/)
    expect(fila.className).toMatch(/\bgroup\/fila\b/)
    expect(within(fila).getAllByRole("cell")).toHaveLength(8)
  })
})

describe("ProjectDashboard: Tablero gerencial (S14 P9)", () => {
  it("paints the portfolio technical gauge with the server mean", () => {
    render(<ProjectDashboard />)
    const gauge = screen.getByTestId("tablero-tacometro")
    expect(within(gauge).getByTestId("tacometro")).toBeInTheDocument()
    expect(within(gauge).getByTestId("tacometro-valor")).toHaveTextContent("21,4 %")
    // The needle paints the modal SERVER colour of the portfolio; no band is recomputed.
    expect(within(gauge).getByTestId("tacometro-aguja")).toHaveAttribute("data-color", "rojo")
  })

  it("falls back to bars below three measured lines and lists only the unmeasured ones in the legend", () => {
    const { container } = render(<ProjectDashboard />)
    const radar = screen.getByTestId("tablero-radar")
    // One measured strategic line: no degenerate polygon, a labelled bar instead.
    expect(within(radar).queryByTestId("radar-eje")).not.toBeInTheDocument()
    expect(within(radar).getByTestId("radar-barras")).toBeInTheDocument()
    expect(within(radar).getByRole("progressbar", { name: /Educación/ })).toHaveAttribute("aria-valuenow", "80")
    expect(within(radar).getByText("80 %")).toBeInTheDocument()
    // The legend no longer repeats the measured line; it still lists the unmeasured one.
    const leyenda = screen.getByTestId("tablero-radar-leyenda")
    expect(within(leyenda).queryByText("Educación")).not.toBeInTheDocument()
    expect(within(leyenda).getByText("Sin línea")).toBeInTheDocument()
    expect(container.textContent).toContain("Sin medir")
  })

  it("plots the radar and lists every line in the legend with three or more measured lines", () => {
    const base = PORTAFOLIO.agregado.por_linea[0]
    const lineas = ["l1", "l2", "l3"].map((id, i) => ({
      ...base,
      linea: { id, codigo: `LE0${i}`, nombre: `Línea ${i}` },
      indicadores: { valor: 40 + i * 10, medidos: 1, en_meta: 1 },
    }))
    state.query = {
      ...state.query,
      data: { ...PORTAFOLIO, agregado: { ...PORTAFOLIO.agregado, por_linea: lineas } },
    }
    render(<ProjectDashboard />)
    const radar = screen.getByTestId("tablero-radar")
    expect(within(radar).getAllByTestId("radar-eje")).toHaveLength(3)
    expect(within(radar).queryByTestId("radar-barras")).not.toBeInTheDocument()
    const leyenda = screen.getByTestId("tablero-radar-leyenda")
    expect(within(leyenda).getByText("Línea 2")).toBeInTheDocument()
    expect(within(leyenda).getByText("60 %")).toBeInTheDocument()
  })

  it("bars the cronograma and the entregables per project with the server values", () => {
    render(<ProjectDashboard />)
    const cronograma = screen.getByTestId("tablero-cronograma")
    expect(within(cronograma).getByText("Fortalecimiento")).toBeInTheDocument()
    expect(within(cronograma).getByText("75 %")).toBeInTheDocument()
    expect(within(cronograma).getByRole("progressbar", { name: /cronograma de Fortalecimiento/i })).toBeInTheDocument()

    const entregables = screen.getByTestId("tablero-entregables")
    expect(within(entregables).getByText("1/3")).toBeInTheDocument()
    // El valor pintado es el del servidor (33.3), no el recálculo del cliente (33).
    expect(
      within(entregables).getByRole("progressbar", { name: /entregables de Fortalecimiento/i }),
    ).toHaveAttribute("aria-valuenow", "33.3")
  })

  it("reuses the S-curve of the selected project, defaulting to the first visible one", async () => {
    render(<ProjectDashboard />)
    expect(useCurve).toHaveBeenLastCalledWith("p1")
    expect(screen.getByTestId("curve-s-chart")).toBeInTheDocument()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText("Proyecto de la curva"), "p2")
    expect(useCurve).toHaveBeenLastCalledWith("p2")
  })

  it("renders nothing chart-related when the portfolio is empty", () => {
    state.query = { ...state.query, data: { ...PORTAFOLIO, proyectos: [], por_estado: {} } }
    render(<ProjectDashboard />)
    expect(screen.getByText("No hay proyectos para mostrar")).toBeInTheDocument()
    expect(screen.queryByTestId("tablero-radar")).not.toBeInTheDocument()
  })
})
