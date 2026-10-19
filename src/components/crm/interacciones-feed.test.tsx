// v7 alignment, unit C3b: the cross-client Interacciones feed. These tests pin
// the four behaviours the read-only feed owes: (1) a timeline card shows the
// interaction's tipo, aliado, oportunidad, autor, resumen and fecha, (2) the
// "Próximo paso" block appears ONLY when the entry set one, (3) the filter chips
// (Todas + each TipoInteraccion) drive the server filter, and (4) loading, error
// and empty states are honest instead of a blank screen.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import type { InteractionFeedItem } from "@/hooks/crm"
import { InteraccionesFeed } from "./interacciones-feed"

const { useInteractionsMock } = vi.hoisted(() => ({
  useInteractionsMock: vi.fn<
    (filters?: { cliente_id?: string; tipo?: string }) => {
      data: InteractionFeedItem[] | undefined
      isLoading: boolean
      isError: boolean
    }
  >(() => ({ data: [], isLoading: false, isError: false })),
}))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return { ...actual, useInteractions: useInteractionsMock }
})

const BASE_ITEM: InteractionFeedItem = {
  id: "i-1",
  cliente_id: "c-1",
  cliente_nombre: "Alcaldía de Barranquilla",
  oportunidad_id: "op-1",
  oportunidad_nombre: "Consultoría línea base 2026",
  autor_id: "u-1",
  autor_nombre: "Ana Ríos",
  texto: "Llamada de seguimiento con el equipo técnico",
  tipo: "LLAMADA",
  proximo_paso: "Enviar la propuesta económica el viernes",
  created_at: "2026-01-06T12:00:00.000Z",
}

function renderFeed() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <InteraccionesFeed />
    </QueryClientProvider>,
  )
}

describe("InteraccionesFeed", () => {
  it("renders a timeline card with tipo, aliado, oportunidad, autor, resumen and fecha", () => {
    useInteractionsMock.mockReturnValue({ data: [BASE_ITEM], isLoading: false, isError: false })

    renderFeed()

    // Scope to the timeline: the filter chips also carry the tipo labels.
    const card = within(screen.getByRole("listitem"))
    expect(card.getByText("Llamada")).toBeInTheDocument()
    expect(card.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(card.getByText("Consultoría línea base 2026")).toBeInTheDocument()
    expect(card.getByText("Ana Ríos")).toBeInTheDocument()
    expect(card.getByText(/Llamada de seguimiento con el equipo técnico/)).toBeInTheDocument()
    expect(card.getByText(/06 de ene de 2026/)).toBeInTheDocument()
  })

  it("shows the Próximo paso block only when the entry set one", () => {
    useInteractionsMock.mockReturnValue({ data: [BASE_ITEM], isLoading: false, isError: false })
    const { unmount } = renderFeed()

    expect(screen.getByText("Próximo paso")).toBeInTheDocument()
    expect(
      screen.getByText(/Enviar la propuesta económica el viernes/),
    ).toBeInTheDocument()
    unmount()

    useInteractionsMock.mockReturnValue({
      data: [{ ...BASE_ITEM, proximo_paso: null }],
      isLoading: false,
      isError: false,
    })
    renderFeed()

    expect(screen.queryByText("Próximo paso")).not.toBeInTheDocument()
  })

  it("hides the oportunidad when the interaction is not linked to one", () => {
    useInteractionsMock.mockReturnValue({
      data: [{ ...BASE_ITEM, oportunidad_id: null, oportunidad_nombre: null }],
      isLoading: false,
      isError: false,
    })

    renderFeed()

    expect(screen.queryByText("Consultoría línea base 2026")).not.toBeInTheDocument()
  })

  it("filters by tipo through the chips and resets with Todas", async () => {
    const user = userEvent.setup()
    useInteractionsMock.mockReturnValue({ data: [BASE_ITEM], isLoading: false, isError: false })

    renderFeed()

    // Todas is the default: no server filter.
    expect(useInteractionsMock).toHaveBeenLastCalledWith({})

    await user.click(screen.getByRole("button", { name: "Reunión" }))
    expect(useInteractionsMock).toHaveBeenLastCalledWith({ tipo: "REUNION" })
    expect(screen.getByRole("button", { name: "Reunión" })).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Todas" }))
    expect(useInteractionsMock).toHaveBeenLastCalledWith({})
  })

  it("renders an honest empty state when there are no interactions", () => {
    useInteractionsMock.mockReturnValue({ data: [], isLoading: false, isError: false })

    renderFeed()

    expect(screen.getByText(/No hay interacciones registradas/i)).toBeInTheDocument()
  })

  it("renders an alert instead of the list when the feed fails", () => {
    useInteractionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    renderFeed()

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar las interacciones/i)
  })
})
