// S4 U7: formulario de avance. Cubre la fecha tope, el campo de justificación
// por exceso y las dos vías de medio (archivo sign/upload/confirm o enlace).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectAvance, ProjectDeliverable } from "@/hooks/projects"
import { expectTouchTargets } from "@/test/viewport"
import { EjecucionAvanceForm } from "./ejecucion-avance-form"

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

const ENTREGABLE: ProjectDeliverable = {
  ...STAMP,
  id: "e1",
  proyecto_id: "p1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta de asistencia",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

function avance(overrides: Partial<ProjectAvance> = {}): ProjectAvance {
  return {
    id: "av1",
    proyecto_id: "p1",
    entregable_id: "e1",
    fecha: "2026-10-20",
    cantidad: "1.50",
    observacion: null,
    justificacion_exceso: null,
    registrado_por_id: "u1",
    created_at: "2026-10-20T00:00:00.000Z",
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
    medios: 0,
    cuenta: false,
    ...overrides,
  }
}

describe("EjecucionAvanceForm", () => {
  const fetchMock = vi.fn()

  function setup(avances: ProjectAvance[] = []) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/deliverables/e1/progress") && method === "POST") {
        return Promise.resolve(jsonResponse({ avance: avance(), cuenta: false }, 201))
      }
      if (url.endsWith("/attachments/sign")) {
        return Promise.resolve(
          jsonResponse({
            storage_path: "proyectos/p1/soportes/abc_acta.pdf",
            token: "tok",
            signed_url: "https://storage.example/upload",
            max_bytes: 26214400,
            allowed_extensions: ["pdf"],
          }),
        )
      }
      if (url.endsWith("/attachments") && method === "POST") {
        return Promise.resolve(jsonResponse({ medio: { id: "m1" }, cuenta: true }, 201))
      }
      if (url === "https://storage.example/upload") {
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(
      <EjecucionAvanceForm
        projectId="p1"
        entregable={ENTREGABLE}
        meta="2.00"
        avances={avances}
        onDone={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )
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
    vi.useRealTimers()
  })

  it("uses 44 px touch targets on phones and no fixed width over 360 px", () => {
    setup()
    const form = screen.getByRole("form", { name: "Registrar avance ENT-1" })
    expectTouchTargets(form)
    expect(form.innerHTML).not.toMatch(/(?:min-)?w-\[(?:3[6-9]\d|[4-9]\d\d|\d{4,})px\]/)
  })

  it("caps the date at today in Bogota and blocks a future date locally", async () => {
    // 2026-10-16 23:30 in Bogota is already 2026-10-17 in UTC: the cap must follow the Bogota day.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-17T04:30:00.000Z"))
    const user = userEvent.setup()
    setup()

    const fecha = screen.getByLabelText("Fecha") as HTMLInputElement
    expect(fecha.max).toBe("2026-10-16")

    // El input date no impide escribir por teclado; el guard local sí lo bloquea.
    const futuro = "2099-01-01"
    fireEvent.change(fecha, { target: { value: futuro } })
    await user.type(screen.getByLabelText("Cantidad"), "1")
    await user.click(screen.getByRole("button", { name: "Registrar avance" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/posterior a hoy/i)
    expect(call("POST", "/deliverables/e1/progress")).toBeUndefined()
  })

  it("reveals the excess justification only when the quantity would pass the goal", async () => {
    const user = userEvent.setup()
    setup([avance({ cantidad: "1.50" })])

    expect(screen.queryByLabelText("Justificación del exceso")).not.toBeInTheDocument()

    await user.type(screen.getByLabelText("Cantidad"), "0,6")

    expect(await screen.findByLabelText("Justificación del exceso")).toBeInTheDocument()
  })

  it("registers an avance with no medio", async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText("Cantidad"), "1")
    await user.click(screen.getByRole("button", { name: "Registrar avance" }))

    await waitFor(() => expect(call("POST", "/deliverables/e1/progress")).toBeDefined())
    expect(call("POST", "/deliverables/e1/progress")?.body).toEqual({
      fecha: expect.any(String),
      cantidad: 1,
    })
  })

  it("runs sign, upload and confirm for a file medio", async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText("Cantidad"), "1")
    await user.click(screen.getByRole("radio", { name: "Archivo" }))
    const archivo = new File([new Uint8Array([1, 2, 3])], "acta.pdf", { type: "application/pdf" })
    await user.upload(screen.getByLabelText("Archivo del medio"), archivo)
    await user.click(screen.getByRole("button", { name: "Registrar avance" }))

    await waitFor(() => expect(call("POST", "/attachments/sign")).toBeDefined())
    expect(call("POST", "/attachments/sign")?.body).toMatchObject({ nombre: "acta.pdf", tamano_bytes: 3 })
    const upload = fetchMock.mock.calls.find(([url]) => String(url) === "https://storage.example/upload")
    expect(upload?.[1]?.method).toBe("PUT")
    expect(call("POST", "/attachments")?.body).toMatchObject({
      storage_path: "proyectos/p1/soportes/abc_acta.pdf",
      nombre: "acta.pdf",
      tamano_bytes: 3,
    })
  })

  it("confirms an https link medio", async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText("Cantidad"), "1")
    await user.click(screen.getByRole("radio", { name: "Enlace" }))
    await user.type(screen.getByLabelText("URL"), "https://example.com/soporte")
    await user.type(screen.getByLabelText("Nombre del enlace"), "Soporte externo")
    await user.click(screen.getByRole("button", { name: "Registrar avance" }))

    await waitFor(() => expect(call("POST", "/attachments")).toBeDefined())
    expect(call("POST", "/deliverables/e1/progress")).toBeDefined()
    expect(call("POST", "/attachments")?.body).toEqual({
      url_externa: "https://example.com/soporte",
      nombre: "Soporte externo",
    })
  })

  it("surfaces the server 400 inline and does not close", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      if (String(input).endsWith("/deliverables/e1/progress") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            { error: "La cantidad acumulada supera la meta del entregable.", code: "VALIDATION_ERROR" },
            400,
          ),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    render(
      <EjecucionAvanceForm
        projectId="p1"
        entregable={ENTREGABLE}
        meta="2.00"
        avances={[]}
        onDone={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await user.type(screen.getByLabelText("Cantidad"), "1")
    await user.click(screen.getByRole("button", { name: "Registrar avance" }))

    const form = screen.getByRole("form", { name: "Registrar avance ENT-1" })
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "La cantidad acumulada supera la meta del entregable.",
    )
  })
})
