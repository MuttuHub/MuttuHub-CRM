// S9 U6: tablero del portafolio. Se burla `@/hooks/projects` entero (más los catálogos de filtros): lo que
// se fija es lo observable. Los colores y porcentajes llegan del servidor y se pintan verbatim.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PortfolioFilters, ProjectKpis, ProjectsPortfolio } from "@/hooks/projects"
import { mockViewport } from "@/test/viewport"
import { ProjectDashboard } from "./project-dashboard"

const { toast, usePortfolio, downloadPortfolioExport, state } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  usePortfolio: vi.fn(),
  downloadPortfolioExport: vi.fn(),
  state: {
    query: { data: undefined, isLoading: false, isError: false, error: null } as {
      data: unknown
      isLoading: boolean
      isError: boolean
      error: unknown
    },
  },
}))

vi.mock("sonner", () => ({ toast }))
vi.mock("@/hooks/projects", () => ({
  useProjectsPortfolio: (filters: PortfolioFilters) => {
    usePortfolio(filters)
    return state.query
  },
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
      kpis: kpis({
        tecnico: { corte: "2026-03-15", avance_real: 21.4, avance_programado: 21.4, desviacion_pp: 0, color: "rojo" },
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
      kpis: kpis({ estado: "BORRADOR", medible: false }),
    },
  ],
  agregado: {
    corte: "2026-03-15",
    tecnico: { proyectos: 1, avance_real: 21.4, avance_programado: 25 },
    financiero: { proyectos: 1, asignado: "1000", programado: "500", ejecutado: "100", ea: 10, ep: 20 },
    por_color_tecnico: { verde: 0, amarillo: 0, rojo: 1 },
    por_color_financiero: { verde: 1, amarillo: 0, rojo: 0 },
  },
  por_estado: { EN_EJECUCION: 1, BORRADOR: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  state.query = { data: PORTAFOLIO, isLoading: false, isError: false, error: null }
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
      expect(screen.queryByRole("table")).toBeNull()
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

  it("has no territory breakdown anywhere", () => {
    const { container } = render(<ProjectDashboard />)
    expect(container.textContent?.toLowerCase()).not.toContain("territorio")
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
