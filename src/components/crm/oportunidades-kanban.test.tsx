// V1 (S1/S2): the seven-column opportunity kanban. These tests pin the four
// behaviours the board owes: (1) the seven columns render in the S1 mapping
// order with their exact S1 labels, (2) every column carries its COP total,
// (3) cards show client + opportunity + value, and (4) the move affordance is
// offered only on rows the server marks manageable, wiring the existing PATCH
// through useMoveOpportunity. Loading, empty and error states are honest.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import type { OportunidadFeedItem, OportunidadesGlobales } from "@/hooks/opportunities"
import { OportunidadesKanban } from "./oportunidades-kanban"

const { useGlobalOpportunitiesMock, mutateMock } = vi.hoisted(() => ({
  useGlobalOpportunitiesMock: vi.fn<
    (options?: { enabled?: boolean }) => {
      data: OportunidadesGlobales | undefined
      isLoading: boolean
      isError: boolean
      error: unknown
    }
  >(() => ({ data: undefined, isLoading: false, isError: false, error: null })),
  mutateMock: vi.fn(),
}))

vi.mock("@/hooks/opportunities", () => ({
  useGlobalOpportunities: useGlobalOpportunitiesMock,
  useMoveOpportunity: () => ({ mutate: mutateMock, isPending: false }),
}))

/** The seven S1 columns, in the exact S1 mapping order and wording. */
const S1_COLUMNS = [
  "Revisión TDR",
  "En formulación",
  "Enviada · seguimiento",
  "En negociación",
  "Aceptada",
  "Rechazada",
  "En espera",
] as const

/** One total per S1 column, in the S1 order, with a distinctive COP value. */
const TOTALES: OportunidadesGlobales["totales"] = [
  { estado: "EN_REVISION", count: 2, total_cop: 1250000 },
  { estado: "DISENANDO_PROPUESTA", count: 1, total_cop: 900000 },
  { estado: "PRESENTADA", count: 0, total_cop: 0 },
  { estado: "EN_NEGOCIACION", count: 1, total_cop: 2400000 },
  { estado: "GANADA", count: 1, total_cop: 3100000 },
  { estado: "PERDIDA", count: 0, total_cop: 0 },
  { estado: "STANDBY", count: 1, total_cop: 750000 },
]

function item(overrides: Partial<OportunidadFeedItem> = {}): OportunidadFeedItem {
  return {
    id: "op-1",
    cliente_id: "cli-a",
    cliente_nombre: "Alcaldía de Barranquilla",
    nombre: "Consultoría línea base 2026",
    estado: "EN_REVISION",
    valor_estimado_cop: 1250000,
    puede_gestionar: true,
    ...overrides,
  }
}

function data(oportunidades: OportunidadFeedItem[]): OportunidadesGlobales {
  return { oportunidades, totales: TOTALES }
}

function renderKanban() {
  return render(<OportunidadesKanban />)
}

describe("OportunidadesKanban", () => {
  it("renders the seven S1 columns in the S1 mapping order with their exact labels", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([item()]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([...S1_COLUMNS])
  })

  it("renders each column's COP total", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([item()]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    // Distinctive amounts (not 1.000 multiples) prove the served total is
    // rendered with the shared COP formatter, and 0 totals still show up.
    expect(screen.getByRole("region", { name: "Revisión TDR" })).toHaveTextContent(
      /\$\s?1\.250\.000/,
    )
    expect(screen.getByRole("region", { name: "Enviada · seguimiento" })).toHaveTextContent(
      /\$\s?0/,
    )
    expect(screen.getByRole("region", { name: "Aceptada" })).toHaveTextContent(/\$\s?3\.100\.000/)
  })

  it("shows client, opportunity and value on each card", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([item()]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    const card = within(screen.getByRole("listitem"))
    expect(card.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(card.getByText("Consultoría línea base 2026")).toBeInTheDocument()
    expect(card.getByText(/\$\s?1\.250\.000/)).toBeInTheDocument()
  })

  it("offers the move only on rows the server marks manageable", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([
        item({ id: "op-1", nombre: "Gestionable", puede_gestionar: true }),
        item({ id: "op-2", nombre: "Solo lectura", puede_gestionar: false }),
      ]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    const gestionable = screen.getByText("Gestionable").closest("li")!
    const soloLectura = screen.getByText("Solo lectura").closest("li")!
    expect(
      within(gestionable).getByRole("button", { name: "Mover a En formulación" }),
    ).toBeInTheDocument()
    expect(within(soloLectura).queryByRole("button")).not.toBeInTheDocument()
  })

  it("moves the card to the next S1 stage through the existing PATCH hook", async () => {
    const user = userEvent.setup()
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([item()]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    const card = within(screen.getByRole("listitem"))
    await user.click(card.getByRole("button", { name: "Mover a En formulación" }))

    expect(mutateMock).toHaveBeenCalledWith({
      clienteId: "cli-a",
      oportunidadId: "op-1",
      estado: "DISENANDO_PROPUESTA",
    })
  })

  it("announces loading instead of rendering empty columns", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderKanban()

    expect(screen.getByRole("status", { name: "Cargando oportunidades" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument()
  })

  it("keeps the seven columns and says so when there are no opportunities", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: data([]),
      isLoading: false,
      isError: false,
      error: null,
    })

    renderKanban()

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(7)
    expect(screen.getAllByText("Sin oportunidades")).toHaveLength(7)
  })

  it("shows an alert on a failed load", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    })

    renderKanban()

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar las oportunidades. Inténtalo de nuevo.",
    )
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument()
  })

  it("surfaces the server's permission message when commercial access is missing", () => {
    useGlobalOpportunitiesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("No tienes permisos para ver las oportunidades.", 403, "FORBIDDEN"),
    })

    renderKanban()

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tienes permisos para ver las oportunidades.",
    )
  })
})
