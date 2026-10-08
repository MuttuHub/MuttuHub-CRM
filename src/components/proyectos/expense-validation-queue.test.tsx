// S6 U6: cola de validación de gastos entre proyectos (solo gestores).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExpenseValidationQueue } from "./expense-validation-queue"

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

const fila = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  proyecto_id: `p-${id}`,
  proyecto_codigo: `PRY-${id}`,
  proyecto_nombre: "Proyecto",
  rubro: { id: "r12", codigo: "R12", nombre: "Transporte" },
  fecha_documento: "2026-10-15",
  periodo: "2026-10",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  numero_documento: "FE-1",
  descripcion: "Tiquetes",
  valor: "1500000.00",
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  datos_incompletos: false,
  registrado_por_id: "otro",
  registrado_por_nombre: "Ana",
  propio: false,
  created_at: "2026-10-16T12:00:00.000Z",
  ...over,
})

describe("ExpenseValidationQueue", () => {
  const fetchMock = vi.fn()

  function setup(gastos: unknown[]) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/api/v1/expense-validations")) return Promise.resolve(jsonResponse({ gastos }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ExpenseValidationQueue />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists pending expenses across projects with code, rubro, tercero, valor and flags", async () => {
    setup([fila("1"), fila("2", { alerta_sobregasto: true, datos_incompletos: true })])
    const cola = await screen.findByTestId("cola-validacion")
    const filas = within(cola).getAllByTestId("cola-fila")
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent("PRY-1")
    expect(filas[0]).toHaveTextContent("Transporte")
    expect(filas[0]).toHaveTextContent("Proveedor SAS")
    expect(filas[0]).toHaveTextContent("$ 1.500.000")
    expect(filas[1]).toHaveTextContent("Supera el asignado")
    expect(filas[1]).toHaveTextContent("Datos incompletos")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/expense-validations?estado=REGISTRADO&limit=50",
      expect.any(Object),
    )
  })

  it("renders nothing when there is nothing pending", async () => {
    const { container } = setup([])
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("disables validation on the actor's own rows and on incomplete ones", async () => {
    setup([fila("1", { propio: true }), fila("2", { datos_incompletos: true }), fila("3")])
    const filas = await screen.findAllByTestId("cola-fila")
    expect(within(filas[0]).queryByRole("button", { name: "Validar" })).not.toBeInTheDocument()
    expect(filas[0]).toHaveTextContent("Tú lo registraste")
    expect(within(filas[1]).getByRole("button", { name: "Validar" })).toBeDisabled()
    expect(within(filas[2]).getByRole("button", { name: "Validar" })).toBeEnabled()
  })

  it("validates a row with the project of that row", async () => {
    const user = userEvent.setup()
    setup([fila("3")])
    await user.click(await screen.findByRole("button", { name: "Validar" }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p-3/expenses/3/validate", expect.objectContaining({ method: "POST" })),
    )
  })

  it("rejects with a motivo", async () => {
    const user = userEvent.setup()
    setup([fila("3")])
    await user.click(await screen.findByRole("button", { name: "Rechazar" }))
    await user.type(screen.getByRole("textbox", { name: "Motivo del rechazo" }), "Duplicado")
    await user.click(screen.getByRole("button", { name: "Confirmar rechazo" }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/p-3/expenses/3/reject"))
      expect(call).toBeDefined()
    })
  })

  it("shows the overspend block inline on the row", async () => {
    const user = userEvent.setup()
    setup([fila("3")])
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) =>
      String(input).endsWith("/validate")
        ? Promise.resolve(jsonResponse({ error: "Validar este gasto superaría el valor asignado al rubro. Se notificó a Gerencia.", code: "OVERSPEND_BLOCKED" }, 409))
        : base(input, init),
    )
    await user.click(await screen.findByRole("button", { name: "Validar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("superaría el valor asignado")
  })
})
