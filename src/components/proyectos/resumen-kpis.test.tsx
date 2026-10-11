// Seis tarjetas KPI del Resumen (v6). Se pintan solo los valores del servidor; el color de técnico y
// financiero llega del API, las otras cuatro llevan punto neutro (D6). Fuera de ejecución: "Sin medir".

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectKpisResponse } from "@/hooks/projects"
import { ResumenKpis } from "./resumen-kpis"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const KPIS: ProjectKpisResponse = {
  base: "vigente",
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: false,
  tecnico: { corte: "2026-03-15", avance_real: 30, avance_programado: 40, desviacion_pp: 10, color: "amarillo" },
  cronograma: { corte: "2026-03-15", vencidas: 14, a_tiempo: 12, atrasadas: 2, valor: 85.7 },
  entregables: { corte: "2026-03-15", programados: 14, logrados: 12, valor: 85.7 },
  indicadores: { corte: "2026-03-15", valor: 64, medidos: 5, en_meta: 4, sin_medir: 1, sin_medir_ids: ["i6"] },
  beneficiarios: { corte: "2026-03-15", total: 48, meta: 120, valor: 40 },
  financiero: {
    corte: "2026-03-15",
    asignado: "2491500000.00",
    programado: "2000000000.00",
    ejecutado: "1567700000.00",
    ea: 62.9,
    ep: 78.4,
    color: "rojo",
    alerta_retraso: false,
  },
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const card = (id: string) => screen.findByTestId(`resumen-kpi-${id}`)

describe("ResumenKpis", () => {
  it("renders the six cards with the server values and hints", async () => {
    fetchMock.mockResolvedValue(json(KPIS))
    render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })

    const tecnico = await card("tecnico")
    expect(tecnico).toHaveTextContent("Avance técnico")
    expect(tecnico).toHaveTextContent("30 %")
    expect(tecnico).toHaveTextContent("Plan 40 % · corte 15 de mar de 2026")

    const financiero = await card("financiero")
    expect(financiero).toHaveTextContent("Avance financiero")
    expect(financiero).toHaveTextContent("62,9 %")
    expect(financiero).toHaveTextContent("$ 1.567,7 M de $ 2.491,5 M")

    const cronograma = await card("cronograma")
    expect(cronograma).toHaveTextContent("Cumplimiento del cronograma")
    expect(cronograma).toHaveTextContent("85,7 %")
    expect(cronograma).toHaveTextContent("12 de 14 actividades a tiempo")

    const indicadores = await card("indicadores")
    expect(indicadores).toHaveTextContent("Cumplimiento de indicadores")
    expect(indicadores).toHaveTextContent("64 %")
    expect(indicadores).toHaveTextContent("4 de 6 indicadores en meta")

    const entregables = await card("entregables")
    expect(entregables).toHaveTextContent("Entregables con soporte")
    expect(entregables).toHaveTextContent("12/14")
    expect(entregables).toHaveTextContent("Productos entregados / programados")

    const beneficiarios = await card("beneficiarios")
    expect(beneficiarios).toHaveTextContent("Beneficiarios")
    expect(beneficiarios).toHaveTextContent("48/120")
    expect(beneficiarios).toHaveTextContent("Personas atendidas / meta")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/projects/p1/kpis")
  })

  it("colours the técnico and financiero dots from the server and keeps the other four neutral", async () => {
    fetchMock.mockResolvedValue(json(KPIS))
    render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })

    expect(within(await card("tecnico")).getByRole("img", { name: "Semáforo técnico: Amarillo" })).toHaveAttribute("data-color", "amarillo")
    expect(within(await card("financiero")).getByRole("img", { name: "Semáforo financiero: Rojo" })).toHaveAttribute("data-color", "rojo")
    for (const id of ["cronograma", "indicadores", "entregables", "beneficiarios"]) {
      const dot = within(await card(id)).getByTestId("resumen-kpi-dot")
      expect(dot).toHaveAttribute("data-tone", "neutro")
      expect(dot).not.toHaveAttribute("data-color")
    }
  })

  it("shows the unconfirmed badge only while the parameters are not confirmed", async () => {
    fetchMock.mockResolvedValue(json(KPIS))
    const first = render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })
    await card("tecnico")
    expect(screen.getByText("No confirmado")).toBeInTheDocument()
    first.unmount()

    fetchMock.mockResolvedValue(json({ ...KPIS, confirmado: true }))
    render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })
    await card("tecnico")
    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("handles empty denominators and a missing goal without inventing numbers", async () => {
    fetchMock.mockResolvedValue(
      json({
        ...KPIS,
        cronograma: { corte: "2026-03-15", vencidas: 0, a_tiempo: 0, atrasadas: 0, valor: null },
        indicadores: { corte: "2026-03-15", valor: null, medidos: 0, en_meta: 0, sin_medir: 0, sin_medir_ids: [] },
        beneficiarios: { corte: "2026-03-15", total: 7, meta: null, valor: null },
      }),
    )
    render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })

    expect(await card("cronograma")).toHaveTextContent("Sin actividades vencidas al corte")
    expect(await card("indicadores")).toHaveTextContent("Sin indicadores definidos")
    const beneficiarios = await card("beneficiarios")
    expect(beneficiarios).toHaveTextContent("7")
    expect(beneficiarios).toHaveTextContent("Sin meta definida")
  })

  it("renders six neutral Sin medir cards, without reading the KPIs, for a draft", () => {
    render(<ResumenKpis proyecto={{ id: "p1", estado: "BORRADOR" }} />, { wrapper })

    for (const id of ["tecnico", "financiero", "cronograma", "indicadores", "entregables", "beneficiarios"]) {
      const c = screen.getByTestId(`resumen-kpi-${id}`)
      expect(c).toHaveTextContent("Sin medir")
      expect(within(c).getByTestId("resumen-kpi-dot")).toHaveAttribute("data-tone", "neutro")
    }
    expect(screen.getByText(/se calculan cuando el proyecto está en ejecución/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("renders the Sin medir state when the server says the project is not medible", async () => {
    fetchMock.mockResolvedValue(
      json({ ...KPIS, estado: "PLANIFICACION", medible: false, tecnico: null, financiero: null, cronograma: null, entregables: null, indicadores: null, beneficiarios: null }),
    )
    render(<ResumenKpis proyecto={{ id: "p1", estado: "PLANIFICACION" }} />, { wrapper })

    expect(await card("tecnico")).toHaveTextContent("Sin medir")
    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("shows skeletons while loading and a readable error when the request fails", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const loading = render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })
    expect(screen.getByTestId("resumen-kpis-cargando")).toBeInTheDocument()
    loading.unmount()

    fetchMock.mockResolvedValue(json({ error: { message: "boom" } }, 500))
    render(<ResumenKpis proyecto={{ id: "p1", estado: "EN_EJECUCION" }} />, { wrapper })
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
