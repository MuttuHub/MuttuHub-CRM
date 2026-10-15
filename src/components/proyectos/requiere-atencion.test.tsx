// Tarjeta "Requiere atención" del Resumen (S14 P5): pinta la lista que deriva el servidor, con un
// estado vacío propio y un estado de error legible. La query es real; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RequiereAtencion } from "./requiere-atencion"

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

const ITEMS = [
  { tipo: "alerta_retraso", titulo: "Posible retraso", detalle: "El gasto va por debajo de lo programado." },
  { tipo: "gasto_observado", titulo: "Gasto pendiente por revisión", detalle: "Compra: supera lo asignado al rubro.", gasto_id: "g1" },
]

function renderCard(estado = "EN_EJECUCION") {
  return render(<RequiereAtencion proyecto={{ id: "p1", estado: estado as never }} />, {
    wrapper: createWrapper(),
  })
}

describe("RequiereAtencion", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it("lists the server-derived items with their title and detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ corte: "2026-03-15", medible: true, items: ITEMS }))

    renderCard()

    expect(await screen.findByTestId("atencion-alerta_retraso")).toHaveTextContent("Posible retraso")
    expect(screen.getByTestId("atencion-gasto_observado")).toHaveTextContent("supera lo asignado al rubro")
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/attention", expect.any(Object))
  })

  it("shows the empty state when there is nothing to flag", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ corte: "2026-03-15", medible: true, items: [] }))

    renderCard()

    expect(await screen.findByText("Sin novedades por ahora.")).toBeInTheDocument()
    expect(screen.queryByTestId("requiere-atencion-lista")).not.toBeInTheDocument()
  })

  it("shows a readable error state", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom", code: "INTERNAL_ERROR" }, 500))

    renderCard()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No pudimos cargar lo que requiere atención. Inténtalo de nuevo.")
  })

  it("does not read the server for a draft and shows the empty state", async () => {
    renderCard("BORRADOR")

    expect(screen.getByText("Sin novedades por ahora.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
