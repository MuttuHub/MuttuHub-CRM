import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectListRow, ProjectsPortfolio } from "@/hooks/projects"
import { PortafolioKpis } from "./portafolio-kpis"

const fila = (id: string, estado: ProjectListRow["estado"], valor: string | null): ProjectListRow =>
  ({ id, codigo: `PRY-${id}`, nombre: `Proyecto ${id}`, estado, valor_total: valor }) as ProjectListRow

const LISTA: ProjectListRow[] = [
  fila("1", "EN_EJECUCION", "100000000.00"),
  fila("2", "EN_EJECUCION", "77400000.50"),
  fila("3", "BORRADOR", "900000000.00"),
  fila("4", "CERRADO", "50000000.00"),
  fila("5", "EN_EJECUCION", null),
]

const PORTAFOLIO = {
  base: "vigente",
  corte: "2026-10-11",
  confirmado: false,
  proyectos: [],
  agregado: { atrasadas: 2, beneficiarios: { total: 1850 } },
  por_estado: {},
} as unknown as ProjectsPortfolio

const tile = (id: string) => screen.getByTestId(id)

describe("PortafolioKpis", () => {
  it("shows the four KPIs with their values and hints", () => {
    render(<PortafolioKpis lista={LISTA} portafolio={PORTAFOLIO} isLoading={false} isError={false} />)

    expect(within(tile("kpi-proyectos")).getByText("Proyectos")).toBeInTheDocument()
    expect(within(tile("kpi-proyectos")).getByText("5")).toBeInTheDocument()
    expect(within(tile("kpi-proyectos")).getByText("3 en ejecución")).toBeInTheDocument()

    expect(within(tile("kpi-presupuesto")).getByText("Presupuesto activo")).toBeInTheDocument()
    // D8: only EN_EJECUCION projects, exact money (never through a float)
    const monto = within(tile("kpi-presupuesto")).getByText("$ 177,4 M")
    expect(monto).toHaveAttribute("title", "$ 177.400.000,50")
    // Z4-2: a long amount is clipped inside its tile instead of overflowing it on a 390 px screen.
    expect(monto).toHaveClass("truncate")
    expect(monto).not.toHaveClass("whitespace-nowrap")

    expect(within(tile("kpi-beneficiarios")).getByText("Beneficiarios")).toBeInTheDocument()
    expect(within(tile("kpi-beneficiarios")).getByText("1.850")).toBeInTheDocument()
    expect(within(tile("kpi-beneficiarios")).getByText("Suma de los proyectos")).toBeInTheDocument()
    expect(within(tile("kpi-beneficiarios")).queryByText(/^de /)).toBeNull()

    expect(within(tile("kpi-atrasadas")).getByText("Actividades atrasadas")).toBeInTheDocument()
    expect(within(tile("kpi-atrasadas")).getByText("2")).toBeInTheDocument()
    expect(within(tile("kpi-atrasadas")).getByText(/al corte del 11 de oct de 2026/)).toBeInTheDocument()
  })

  it("keeps the standard money format below one million", () => {
    render(<PortafolioKpis lista={[fila("1", "EN_EJECUCION", "250000.00")]} portafolio={PORTAFOLIO} isLoading={false} isError={false} />)
    expect(within(tile("kpi-presupuesto")).getByText("$ 250.000")).toBeInTheDocument()
  })

  it("renders the four tiles as surfaces in a 2-column grid that becomes 4 from lg", () => {
    render(<PortafolioKpis lista={LISTA} portafolio={PORTAFOLIO} isLoading={false} isError={false} />)
    const grid = tile("portafolio-kpis")
    expect(grid.className).toMatch(/(^|\s)grid-cols-2(\s|$)/)
    expect(grid.className).toMatch(/lg:grid-cols-4/)
    for (const id of ["kpi-proyectos", "kpi-presupuesto", "kpi-beneficiarios", "kpi-atrasadas"]) {
      expect(tile(id).className).toMatch(/(^|\s)surface(\s|$)/)
    }
  })

  it("shows skeletons while loading, never zeros", () => {
    const { container } = render(<PortafolioKpis lista={undefined} portafolio={undefined} isLoading isError={false} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(4)
    expect(screen.queryByText("Presupuesto activo")).not.toBeInTheDocument()
  })

  it("shows an alert when the summary fails", () => {
    render(<PortafolioKpis lista={undefined} portafolio={undefined} isLoading={false} isError />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el resumen del portafolio")
    expect(screen.queryByTestId("kpi-proyectos")).not.toBeInTheDocument()
  })

  it("shows an empty state when there are no projects to summarize", () => {
    const { container } = render(<PortafolioKpis lista={[]} portafolio={PORTAFOLIO} isLoading={false} isError={false} />)
    expect(container.querySelector('[data-slot="empty-state"]')).not.toBeNull()
    expect(screen.queryByTestId("kpi-proyectos")).not.toBeInTheDocument()
  })
})
