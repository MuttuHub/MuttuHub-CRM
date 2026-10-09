// S4 U7: beneficiarios en la ejecución: total contra meta como números planos,
// historial y el formulario de registro. El botón de anular es solo para gestores.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { expectTouchTargets, mockViewport } from "@/test/viewport"
import { todayInBogota } from "@/lib/proyectos/weeks"
import { EjecucionBeneficiarios } from "./ejecucion-beneficiarios"

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

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-29",
  duracion_semanas: 12,
  valor_total: null,
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 100,
  lineas: [],
  municipios: [],
}

const REGISTRO = {
  id: "b1",
  proyecto_id: "p1",
  actividad_id: null,
  fecha: "2026-10-20",
  cantidad: 40,
  observacion: null,
  registrado_por_id: "u1",
  created_at: "2026-10-20T00:00:00.000Z",
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
}

describe("EjecucionBeneficiarios", () => {
  const fetchMock = vi.fn()

  function setup({ canWrite = true, canVoid = true } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/beneficiaries") && method === "GET") {
        return Promise.resolve(jsonResponse({ estado: "EN_EJECUCION", registros: [REGISTRO], total: 40 }))
      }
      if (url.endsWith("/beneficiaries") && method === "POST") {
        return Promise.resolve(jsonResponse({ registro: REGISTRO }, 201))
      }
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: [] }))
      if (url.endsWith("/void") && method === "POST") {
        return Promise.resolve(jsonResponse({ registro: REGISTRO }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(
      <EjecucionBeneficiarios proyecto={PROYECTO} canWrite={canWrite} canVoid={canVoid} />,
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
    mockViewport(false)
  })

  it("shows the total against the goal as plain numbers", async () => {
    setup()

    const total = await screen.findByTestId("ejecucion-beneficiarios-total")
    expect(total).toHaveTextContent("40 de 100")
  })

  it("registers a beneficiary count with today as the date cap", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Registrar beneficiarios" }))
    expect((screen.getByLabelText("Fecha") as HTMLInputElement).max).toBe(todayInBogota())
    await user.type(screen.getByLabelText("Cantidad"), "15")
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(call("POST", "/beneficiaries")).toBeDefined())
    expect(call("POST", "/beneficiaries")?.body).toMatchObject({ cantidad: 15 })
  })

  it("opens the beneficiaries form in a bottom sheet on phones, with 44 px controls", async () => {
    mockViewport(true)
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Registrar beneficiarios" }))
    const dialog = await screen.findByRole("dialog", { name: "Registrar beneficiarios" })
    expectTouchTargets(dialog.querySelector("form") as HTMLElement)
  })

  it("offers no write controls to a read-only viewer", async () => {
    setup({ canWrite: false, canVoid: false })

    await screen.findByTestId("ejecucion-beneficiarios-total")
    expect(screen.queryByRole("button", { name: "Registrar beneficiarios" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument()
  })

  it("shows a void control only to a manager", async () => {
    setup({ canVoid: true })

    await screen.findByTestId("ejecucion-beneficiarios-total")
    expect(screen.getAllByRole("button", { name: "Anular" })).toHaveLength(1)
  })
})
