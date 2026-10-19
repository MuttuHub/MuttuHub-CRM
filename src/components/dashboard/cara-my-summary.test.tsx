// "Mi resumen" (S2.7, RNF-C01): active projects and prospecting opportunities
// are separate, labelled groups, never one mixed list.

import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DashboardMySummary } from "@/hooks/dashboard"

const { useDashboardMySummaryMock } = vi.hoisted(() => ({ useDashboardMySummaryMock: vi.fn() }))

vi.mock("@/hooks/dashboard", () => ({ useDashboardMySummary: useDashboardMySummaryMock }))

import { CaraMiResumen } from "./cara-my-summary"

const BASE: DashboardMySummary = {
  scope: "own",
  activas: { count: 0, items: [] },
  vencidas: { count: 0, items: [] },
  hoy: { count: 0 },
  compromisos_pendientes: { count: 0, vencidos: 0 },
  clientes_asignados: { count: 0, items: [] },
  proyectos_en_ejecucion: {
    count: 2,
    items: [
      { id: "p1", codigo: "PRY-2026-001", nombre: "CedeTextil", cliente_id: "c1", cliente_nombre: "CedeTextil S.A." },
      { id: "p2", codigo: "PRY-2026-002", nombre: "Ruta Rural", cliente_id: "c2", cliente_nombre: "Alcaldía" },
    ],
  },
  oportunidades_en_prospeccion: {
    count: 1,
    items: [
      { id: "o1", nombre: "Propuesta Norte", estado: "PRESENTADA", valor_estimado_cop: "1000000.00", cliente_id: "c3", cliente_nombre: "Cliente Norte" },
    ],
  },
}

function renderCara(data: DashboardMySummary) {
  useDashboardMySummaryMock.mockReturnValue({ data, isLoading: false, isError: false })
  return render(<CaraMiResumen filters={{}} />)
}

describe("CaraMiResumen panel separation", () => {
  beforeEach(() => useDashboardMySummaryMock.mockReset())

  it("shows active projects and prospecting opportunities in separate, labelled groups", () => {
    renderCara(BASE)

    const proyectos = screen.getByRole("region", { name: "Proyectos en ejecución" })
    expect(within(proyectos).getByText("CedeTextil")).toBeInTheDocument()
    expect(within(proyectos).getByText("PRY-2026-002")).toBeInTheDocument()
    expect(within(proyectos).queryByText("Propuesta Norte")).not.toBeInTheDocument()

    const oportunidades = screen.getByRole("region", { name: "Oportunidades en prospección" })
    expect(within(oportunidades).getByText("Propuesta Norte")).toBeInTheDocument()
    expect(within(oportunidades).queryByText("CedeTextil")).not.toBeInTheDocument()
  })

  it("shows each group's count", () => {
    renderCara(BASE)

    expect(screen.getByRole("region", { name: "Proyectos en ejecución" })).toHaveTextContent("2 proyectos")
    expect(screen.getByRole("region", { name: "Oportunidades en prospección" })).toHaveTextContent("1 oportunidad")
  })

  it("shows an empty state per group when there is nothing to list", () => {
    renderCara({
      ...BASE,
      proyectos_en_ejecucion: { count: 0, items: [] },
      oportunidades_en_prospeccion: { count: 0, items: [] },
    })

    expect(screen.getByText("No tienes proyectos en ejecución.")).toBeInTheDocument()
    expect(screen.getByText("No tienes oportunidades en prospección.")).toBeInTheDocument()
  })
})
