// Tarjeta "Requiere atención" del Resumen (S14 P5): pinta la lista que deriva el servidor, con un
// estado vacío propio y un estado de error legible. La query es real; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

function renderCard(estado = "EN_EJECUCION", onIrA?: (destino: "actividades" | "finanzas") => void) {
  return render(<RequiereAtencion proyecto={{ id: "p1", estado: estado as never }} onIrA={onIrA} />, {
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

    expect(await screen.findByText("Nada pendiente por ahora.")).toBeInTheDocument()
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

    expect(screen.getByText("Nada pendiente por ahora.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("offers no navigation unless the caller passes onIrA", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ corte: "2026-03-15", medible: true, items: ITEMS }))

    renderCard()

    await screen.findByTestId("atencion-alerta_retraso")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("sends each item to the tab where it is resolved", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        corte: "2026-03-15",
        medible: true,
        items: [
          ...ITEMS,
          { tipo: "actividad_atrasada", titulo: "Actividad atrasada", detalle: "A1 va retrasada.", actividad_id: "a1" },
          { tipo: "indicador_bajo_meta", titulo: "Indicador bajo la meta", detalle: "I1 está bajo.", indicador_id: "i1" },
          { tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R1 supera lo asignado.", rubro_id: "r1" },
        ],
      }),
    )
    const onIrA = vi.fn()
    const user = userEvent.setup()

    renderCard("EN_EJECUCION", onIrA)

    await user.click(within(await screen.findByTestId("atencion-actividad_atrasada")).getByRole("button", { name: "Ver actividades" }))
    await user.click(within(screen.getByTestId("atencion-indicador_bajo_meta")).getByRole("button", { name: "Ver actividades" }))
    await user.click(within(screen.getByTestId("atencion-rubro_sobreejecucion")).getByRole("button", { name: "Ver finanzas" }))
    await user.click(within(screen.getByTestId("atencion-gasto_observado")).getByRole("button", { name: "Ver finanzas" }))
    await user.click(within(screen.getByTestId("atencion-alerta_retraso")).getByRole("button", { name: "Ver finanzas" }))

    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual([
      "actividades",
      "actividades",
      "finanzas",
      "finanzas",
      "finanzas",
    ])
  })
})
