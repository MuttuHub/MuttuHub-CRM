// S4 U7: indicadores en la ejecución: última lectura, tendencia, historial y el
// formulario de medición. El botón de anular es solo para gestores.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { expectTouchTargets, mockViewport } from "@/test/viewport"
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

const MEDICION_ANULADA = {
  ...MEDICION,
  id: "m2",
  fecha: "2026-10-21",
  anulado_at: "2026-10-22T00:00:00.000Z",
  anulado_por_id: "u2",
  motivo_anulacion: "Error de captura",
}

describe("EjecucionIndicadores", () => {
  const fetchMock = vi.fn()

  function setup({
    canWrite = true,
    canVoid = true,
    mediciones = [MEDICION_ANTERIOR, MEDICION],
  }: { canWrite?: boolean; canVoid?: boolean; mediciones?: unknown[] } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: [INDICADOR] }))
      if (url.endsWith("/indicators/i1/measurements") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            estado: "EN_EJECUCION",
            indicador: { id: "i1", codigo: "IND-1", nombre: "Personas formadas", meta: "100.00", unidad: "personas" },
            mediciones,
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
      if (url.includes("/measurements/") && url.endsWith("/attachments") && method === "POST") {
        return Promise.resolve(jsonResponse({ medio: { id: "sop-1" } }, 201))
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
    mockViewport(false)
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

  it("opens the measurement form in a bottom sheet on phones, with 44 px controls", async () => {
    mockViewport(true)
    const user = userEvent.setup()
    setup()

    const indicador = await screen.findByTestId("ejecucion-indicador")
    await user.click(within(indicador).getByRole("button", { name: "Registrar medición" }))
    const dialog = await screen.findByRole("dialog", { name: "Registrar medición" })
    expectTouchTargets(within(dialog).getByRole("form", { name: "Registrar medición IND-1" }))
  })

  it("keeps the measurement form inline on desktop", async () => {
    const user = userEvent.setup()
    setup()

    const indicador = await screen.findByTestId("ejecucion-indicador")
    await user.click(within(indicador).getByRole("button", { name: "Registrar medición" }))
    expect(screen.queryByRole("dialog")).toBeNull()
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

  describe("soportes (AJ-06 T3)", () => {
    it("shows an Adjuntar archivo control for each medición when canWrite", async () => {
      setup()

      const filas = await screen.findAllByTestId("ejecucion-medicion")
      expect(filas).toHaveLength(2)
      for (const fila of filas) {
        expect(within(fila).getByRole("button", { name: "Adjuntar archivo" })).toBeInTheDocument()
      }
    })

    it("does not show the attach control when the user cannot write, or on a voided medición", async () => {
      setup({ canWrite: false, mediciones: [MEDICION, MEDICION_ANULADA] })

      await screen.findAllByTestId("ejecucion-medicion")
      expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    })

    it("does not offer the attach control on an already-voided medición even when canWrite", async () => {
      setup({ mediciones: [MEDICION_ANULADA] })

      const fila = await screen.findByTestId("ejecucion-medicion")
      expect(within(fila).queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument()
    })

    it("attaches a medio (link) to an existing medición with one POST to its attachments", async () => {
      const user = userEvent.setup()
      setup({ mediciones: [MEDICION] })

      const fila = await screen.findByTestId("ejecucion-medicion")
      await user.click(within(fila).getByRole("button", { name: "Adjuntar archivo" }))
      await user.click(screen.getByRole("radio", { name: "Enlace" }))
      await user.type(screen.getByLabelText("URL"), "https://drive.example.com/f/1")
      await user.type(screen.getByLabelText("Nombre del enlace"), "Acta firmada")
      await user.click(screen.getByRole("button", { name: "Adjuntar" }))

      await waitFor(() => expect(screen.queryByRole("form", { name: "Adjuntar archivo" })).toBeNull())
      const found = fetchMock.mock.calls.find(
        (call) => (call[1]?.method ?? "GET") === "POST" && String(call[0]).endsWith("/attachments"),
      )
      expect(found).toBeDefined()
      const [url, init] = found as [string, RequestInit]
      expect(url).toBe("/api/v1/projects/p1/indicators/i1/measurements/m1/attachments")
      expect(JSON.parse(init.body as string)).toEqual({ url_externa: "https://drive.example.com/f/1", nombre: "Acta firmada" })
    })

    it("shows every soporte of a medición individually (AJ-06 S3: 3 archivos y 1 enlace muestra los 4)", async () => {
      const soportes = [
        { id: "s-1", proyecto_id: "p1", avance_id: null, nombre: "acta-1.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 10, subido_por_id: "u1", created_at: "2026-10-20T00:00:00.000Z" },
        { id: "s-2", proyecto_id: "p1", avance_id: null, nombre: "acta-2.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 12, subido_por_id: "u1", created_at: "2026-10-20T00:00:01.000Z" },
        { id: "s-3", proyecto_id: "p1", avance_id: null, nombre: "acta-3.pdf", tipo: "archivo" as const, url_externa: null, tipo_mime: "application/pdf", tamano_bytes: 14, subido_por_id: "u1", created_at: "2026-10-20T00:00:02.000Z" },
        { id: "s-4", proyecto_id: "p1", avance_id: null, nombre: "Carpeta Drive", tipo: "enlace" as const, url_externa: "https://drive.example/f", tipo_mime: null, tamano_bytes: null, subido_por_id: "u1", created_at: "2026-10-20T00:00:03.000Z" },
      ]
      setup({ mediciones: [{ ...MEDICION, soportes }] })

      const fila = await screen.findByTestId("ejecucion-medicion")
      expect(within(fila).getByText("acta-1.pdf")).toBeInTheDocument()
      expect(within(fila).getByText("acta-2.pdf")).toBeInTheDocument()
      expect(within(fila).getByText("acta-3.pdf")).toBeInTheDocument()
      expect(within(fila).getByText("Carpeta Drive")).toBeInTheDocument()
    })
  })
})
