// S9 U6: panel de indicadores (KPIs) de la ficha. Las queries son reales; solo se burla `fetch`.
// Los colores y porcentajes llegan del servidor y se pintan verbatim: ninguna prueba los deriva.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectKpisResponse, ProjectListRow } from "@/hooks/projects"
import { ProjectKpisPanel } from "./project-kpis-panel"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const PROYECTO = { id: "p1", codigo: "PRY-2026-001", nombre: "Fortalecimiento", estado: "EN_EJECUCION" } as ProjectListRow

const KPIS: ProjectKpisResponse = {
  base: "vigente",
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  medible: true,
  confirmado: false,
  // Intencionalmente incoherente con los umbrales por defecto (10/20): la desviación es 0 pero el
  // servidor dice "rojo". La UI debe pintar "rojo", no derivarlo.
  tecnico: { corte: "2026-03-15", avance_real: 21.4, avance_programado: 25, desviacion_pp: 0, color: "rojo" },
  cronograma: { corte: "2026-03-15", vencidas: 5, a_tiempo: 4, valor: 80 },
  entregables: { corte: "2026-03-15", programados: 10, logrados: 3, valor: 30 },
  indicadores: { corte: "2026-03-15", valor: 40, medidos: 1, sin_medir: 2, sin_medir_ids: ["i2", "i3"] },
  beneficiarios: { corte: "2026-03-15", total: 10, meta: 100, valor: 10 },
  financiero: {
    corte: "2026-03-15",
    asignado: "1000000.00",
    programado: "500000.00",
    ejecutado: "100000.00",
    ea: 10,
    ep: 20,
    color: "verde",
    alerta_retraso: true,
  },
}

describe("ProjectKpisPanel", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const renderPanel = () => render(<ProjectKpisPanel proyecto={PROYECTO} />, { wrapper: createWrapper() })

  it("paints the colors of the payload verbatim, never recomputed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(KPIS))
    renderPanel()
    const tecnico = await screen.findByTestId("kpi-tecnico")
    expect(tecnico).toHaveAttribute("data-color", "rojo")
    expect(within(tecnico).getByText("Semáforo técnico: Rojo")).toBeInTheDocument()
    expect(within(tecnico).getByText("21,4 %")).toBeInTheDocument()
    const financiero = screen.getByTestId("kpi-financiero")
    expect(financiero).toHaveAttribute("data-color", "verde")
    expect(within(financiero).getByText("Semáforo financiero: Verde")).toBeInTheDocument()
    expect(within(financiero).getByText("$ 100.000")).toBeInTheDocument()
    expect(within(financiero).getByText(/Posible retraso/)).toBeInTheDocument()
  })

  it("shows the compliance indicators with their detail, and em dash for a null value", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...KPIS, beneficiarios: { ...KPIS.beneficiarios, valor: null, meta: null } }))
    renderPanel()
    expect(await screen.findByTestId("kpi-cronograma")).toHaveTextContent("80 %")
    expect(screen.getByTestId("kpi-cronograma")).toHaveTextContent("4 a tiempo de 5 vencidas")
    expect(screen.getByTestId("kpi-entregables")).toHaveTextContent("3 de 10 programados")
    expect(screen.getByTestId("kpi-indicadores")).toHaveTextContent("2 sin medir")
    expect(screen.getByTestId("kpi-beneficiarios")).toHaveTextContent("—")
    expect(screen.getByTestId("kpi-beneficiarios")).toHaveTextContent("10 registrados, sin meta")
  })

  it("shows the 'No confirmado' badge only while the parameters are not confirmed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(KPIS))
    const { unmount } = renderPanel()
    expect(await screen.findByText("No confirmado")).toBeInTheDocument()
    unmount()
    fetchMock.mockResolvedValue(jsonResponse({ ...KPIS, confirmado: true }))
    renderPanel()
    await screen.findByTestId("kpi-tecnico")
    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("explains a project that is not measurable yet, with no tiles", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...KPIS, estado: "BORRADOR", medible: false, tecnico: null, cronograma: null, entregables: null, indicadores: null, beneficiarios: null, financiero: null }),
    )
    renderPanel()
    expect(await screen.findByText(/Los indicadores se calculan cuando el proyecto está en ejecución, suspendido o cerrado/)).toBeInTheDocument()
    expect(screen.queryByTestId("kpi-tecnico")).not.toBeInTheDocument()
  })

  it("shows a readable error from the server", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "El proyecto aún no tiene fechas de inicio y fin.", code: "INVALID_STATE" }, 409))
    renderPanel()
    expect(await screen.findByRole("alert")).toHaveTextContent("El proyecto aún no tiene fechas de inicio y fin.")
  })

  it("asks again with the new corte and base", async () => {
    fetchMock.mockResolvedValue(jsonResponse(KPIS))
    renderPanel()
    await screen.findByTestId("kpi-tecnico")
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Corte"), "2026-03-01")
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("corte=2026-03-01"))).toBe(true))
    await user.selectOptions(screen.getByLabelText("Base"), "original")
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("base=original"))).toBe(true))
  })

  it("the export buttons hit the export route for each ficha", async () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => "blob:x")
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    fetchMock.mockImplementation((input: unknown) =>
      String(input).includes("/export")
        ? Promise.resolve(new Response(new Blob(["x"]), { headers: { "Content-Disposition": 'attachment; filename="a.xlsx"' } }))
        : Promise.resolve(jsonResponse(KPIS)),
    )
    renderPanel()
    await screen.findByTestId("kpi-tecnico")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Exportar ficha (Excel)" }))
    await waitFor(() => expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain("/api/v1/projects/p1/export?ficha=proyecto"))
    await user.click(screen.getByRole("button", { name: "Exportar ficha financiera (Excel)" }))
    await waitFor(() => expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain("/api/v1/projects/p1/export?ficha=financiera"))
    expect(click).toHaveBeenCalledTimes(2)
    click.mockRestore()
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
  })
})
