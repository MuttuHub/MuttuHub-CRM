// S4 U7: indicadores en la ejecución: última lectura, tendencia, historial y el
// formulario de medición. El botón de anular es solo para gestores.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { todayInBogota } from "@/lib/proyectos/weeks"
import { EjecucionIndicadores } from "./ejecucion-indicadores"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const STAMP = { created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const INDICADOR = {
  ...STAMP,
  id: "i1",
  proyecto_id: "p1",
  objetivo_id: "o1",
  codigo: "IND-1",
  nombre: "Personas formadas",
  meta: "100.00",
  unidad: "personas",
  linea_base: "20.00",
}

const MEDICION = {
  id: "m1",
  proyecto_id: "p1",
  indicador_id: "i1",
  fecha: "2026-10-20",
  valor: "30.00",
  observacion: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
}

const MEDICION_ANTERIOR = { ...MEDICION, id: "m0", fecha: "2026-10-10", valor: "10.00" }

describe("EjecucionIndicadores", () => {
  const fetchMock = vi.fn()

  function setup({ canWrite = true, canVoid = true } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: [INDICADOR] }))
      if (url.endsWith("/indicators/i1/measurements") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            estado: "EN_EJECUCION",
            indicador: { id: "i1", codigo: "IND-1", nombre: "Personas formadas", meta: "100.00", unidad: "personas" },
            mediciones: [MEDICION_ANTERIOR, MEDICION],
            ultima: MEDICION,
            tendencia: "sube",
          }),
        )
      }
      if (url.endsWith("/indicators/i1/measurements") && method === "POST") {
        return Promise.resolve(jsonResponse({ medicion: MEDICION, ultima: MEDICION, tendencia: "sube" }, 201))
      }
      if (url.endsWith("/void") && method === "POST") {
        return Promise.resolve(jsonResponse({ medicion: MEDICION }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<EjecucionIndicadores proyectoId="p1" canWrite={canWrite} canVoid={canVoid} />, {
      wrapper: createWrapper(),
    })
  }

  function call(method: string, suffix: string) {
    const found = fetchMock.mock.calls.find(
      ([url, init]) => (init?.method ?? "GET") === method && String(url).endsWith(suffix),
    )
    return found ? { url: String(found[0]), body: found[1].body ? JSON.parse(found[1].body) : undefined } : undefined
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows the last value, its trend and the history", async () => {
    setup()

    const indicador = await screen.findByTestId("ejecucion-indicador")
    await waitFor(() => expect(within(indicador).getByTestId("ejecucion-ultima")).toHaveTextContent("30"))
    expect(within(indicador).getByTestId("ejecucion-tendencia")).toHaveTextContent(/sube/i)
    expect(within(indicador).getAllByTestId("ejecucion-medicion")).toHaveLength(2)
  })

  it("registers a measurement with today as the date cap", async () => {
    const user = userEvent.setup()
    setup()

    const indicador = await screen.findByTestId("ejecucion-indicador")
    await user.click(within(indicador).getByRole("button", { name: "Registrar medición" }))
    const form = within(indicador).getByRole("form", { name: "Registrar medición IND-1" })
    expect((within(form).getByLabelText("Fecha") as HTMLInputElement).max).toBe(todayInBogota())
    await user.type(within(form).getByLabelText("Valor"), "45")
    await user.click(within(form).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(call("POST", "/indicators/i1/measurements")).toBeDefined())
    expect(call("POST", "/indicators/i1/measurements")?.body).toMatchObject({ valor: 45 })
  })

  it("offers no write controls to a read-only viewer", async () => {
    setup({ canWrite: false, canVoid: false })

    await screen.findByTestId("ejecucion-indicador")
    expect(screen.queryByRole("button", { name: "Registrar medición" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
  })

  it("shows void controls only to a manager", async () => {
    setup({ canVoid: true })

    const botones = await screen.findAllByRole("button", { name: "Anular" })
    expect(botones).toHaveLength(2)
  })
})
