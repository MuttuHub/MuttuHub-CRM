// Printable dashboard faces (PRD §7.3) inside the shared print sheet (PR-R2): the content of each face stays
// the same; the sheet adds the repeated header/footer and prints once the data and the fonts are ready.

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiGet } from "@/lib/api/http"
import type { DashboardMySummary, DashboardPipeline } from "@/hooks/dashboard"
import { PrintDashboardCara } from "./print-dashboard"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("desde=2026-10-01"),
}))

vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  apiGet: vi.fn(),
}))

const PIPELINE: DashboardPipeline = {
  scope: "all",
  total_activas: 7,
  valor_activo: 0,
  embudo: [],
  top_clientes: [{ cliente_id: "c1", nombre: "Fundación Acme", valor_potencial: 0 }],
  comparativo: { potencial_activo: 0, ganado_historico: 0, ratio: 0 },
}

const MI_RESUMEN: DashboardMySummary = {
  scope: "own",
  activas: { count: 0, items: [] },
  vencidas: { count: 0, items: [] },
  hoy: { count: 0 },
  compromisos_pendientes: { count: 4, vencidos: 0 },
  clientes_asignados: { count: 0, items: [] },
  proyectos_en_ejecucion: { count: 0, items: [] },
  oportunidades_en_prospeccion: { count: 0, items: [] },
}

function serve(data: unknown) {
  vi.mocked(apiGet).mockImplementation((url: string) =>
    Promise.resolve(
      url.startsWith("/api/v1/auth/me") ? { usuario: { id: "u1", nombre: "Camila Pérez", rol: "admin" } } : data,
    ),
  )
}

describe("PrintDashboardCara", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("renders the pipeline face as before, inside the shared sheet, and prints it", async () => {
    const print = vi.fn()
    vi.stubGlobal("print", print)
    serve(PIPELINE)
    render(<PrintDashboardCara cara="pipeline" />)

    expect(await screen.findByRole("heading", { name: "Reporte — Pipeline comercial" })).toBeInTheDocument()
    expect(screen.getByText("Oportunidades activas")).toBeInTheDocument()
    expect(screen.getByText("Fundación Acme")).toBeInTheDocument()
    expect(screen.getByText("Dashboard · exportado desde Muttu Hub")).toBeInTheDocument()
    expect(vi.mocked(apiGet)).toHaveBeenCalledWith("/api/v1/dashboard/pipeline?desde=2026-10-01")

    expect(screen.getByTestId("print-sheet-header")).toHaveTextContent("Interno · Gerencia")
    const footer = screen.getByTestId("print-sheet-footer")
    expect(footer).toHaveTextContent("Muttu Hub · Pipeline comercial")
    expect(footer).toHaveTextContent("Contiene valores de propuestas · uso interno")
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  })

  it("marks «Mi resumen» as personal to whoever generated it", async () => {
    vi.stubGlobal("print", vi.fn())
    serve(MI_RESUMEN)
    render(<PrintDashboardCara cara="my-summary" />)

    expect(await screen.findByText("Compromisos pendientes")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId("print-sheet-header")).toHaveTextContent("Personal · Camila Pérez"),
    )
    expect(screen.getByTestId("print-sheet-footer")).toHaveTextContent("Muttu Hub · Mi resumen")
  })
})
