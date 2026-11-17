// T7 (S2, AJ-08 «Propuesto»): «en la ficha financiera, un resumen de cambios del periodo (gastos editados y anulados)
// con acceso al detalle y los motivos, para que el Gerente pueda revisarlos sin entrar a la operación diaria».
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { CambiosDelPeriodo } from "./cambios-del-periodo"

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

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "83500000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const CAMBIOS = [
  {
    id: "lote-1",
    accion: "EDITAR",
    fecha: "2026-11-10T15:00:00.000Z",
    usuario_nombre: "Laura Jiménez",
    motivo: "El proveedor facturó de más",
    gasto: { id: "gas-1", numero_documento: "FE-10", tercero_nombre: "Proveedor SAS", estado: "REGISTRADO" },
    detalle: [{ campo: "valor", antes: "1500000.00", despues: "1000000.00" }],
  },
  {
    id: "aud-4",
    accion: "ANULAR",
    fecha: "2026-11-12T20:00:00.000Z",
    usuario_nombre: null,
    motivo: "Factura duplicada",
    gasto: { id: "gas-2", numero_documento: "FE-11", tercero_nombre: "Otro SAS", estado: "ANULADO" },
    detalle: [{ campo: "estado", antes: "REGISTRADO", despues: "ANULADO" }],
  },
]

const fetchMock = vi.fn()

function setup({ rol = "GERENCIA", cambios = CAMBIOS as unknown[], miembro = false } = {}) {
  fetchMock.mockImplementation((input: unknown) => {
    const url = String(input)
    if (url.endsWith("/api/v1/auth/me")) return Promise.resolve(jsonResponse({ usuario: { id: "yo", nombre: "Yo", rol } }))
    if (url.includes("/members"))
      return Promise.resolve(jsonResponse({ miembros: miembro ? [{ id: "m1", usuario: { id: "yo", nombre: "Yo" } }] : [] }))
    if (url.includes("/expense-changes")) {
      const periodo = new URL(url, "http://x").searchParams.get("periodo")
      return Promise.resolve(jsonResponse({ periodo, cambios: periodo === "2026-11" ? cambios : [] }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  return render(<CambiosDelPeriodo proyecto={PROYECTO} />, { wrapper: createWrapper() })
}

const pedidos = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/expense-changes"))

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.useFakeTimers({ now: new Date("2026-11-15T15:00:00.000Z"), shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe("CambiosDelPeriodo (T7)", () => {
  it("shows the Gerente the current month's edited and annulled expenses, each with its motive", async () => {
    setup()
    const seccion = await screen.findByRole("region", { name: "Cambios del periodo" })
    expect(within(seccion).getByLabelText("Periodo")).toHaveValue("2026-11")

    const lista = await within(seccion).findByRole("list", { name: "Gastos editados y anulados" })
    const items = within(lista).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Corregido")
    expect(items[0]).toHaveTextContent("FE-10 · Proveedor SAS")
    expect(items[0]).toHaveTextContent("Motivo: El proveedor facturó de más")
    expect(items[1]).toHaveTextContent("Anulado")
    expect(items[1]).toHaveTextContent("FE-11 · Otro SAS")
    expect(items[1]).toHaveTextContent("Motivo: Factura duplicada")
    expect(within(seccion).getByText("1 gasto editado y 1 anulado en nov 2026.")).toBeInTheDocument()
  })

  it("opens the detail of a correction: each field with its value before and after", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    const lista = await screen.findByRole("list", { name: "Gastos editados y anulados" })
    await user.click(within(lista).getAllByRole("button", { name: /Ver detalle/ })[0])
    const detalle = within(lista).getByRole("list", { name: "Detalle del cambio FE-10" })
    expect(detalle).toHaveTextContent("Valor: $ 1.500.000 → $ 1.000.000")
  })

  it("reads another period when the Gerente picks it, and says when nothing changed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await screen.findByRole("list", { name: "Gastos editados y anulados" })
    await user.selectOptions(screen.getByLabelText("Periodo"), "2026-10")

    expect(await screen.findByText("Ningún gasto se editó ni se anuló en oct 2026.")).toBeInTheDocument()
    expect(pedidos().at(-1)).toContain("periodo=2026-10")
  })

  it("is not shown, and asks nothing, to the project's Gestor either: the review is Gerencia's (AJ-08)", async () => {
    setup({ rol: "COORDINADOR", miembro: true })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("region", { name: "Cambios del periodo" })).not.toBeInTheDocument())
    expect(pedidos()).toEqual([])
  })

  it("is not shown, and asks nothing, to a role without project authority", async () => {
    setup({ rol: "COORDINADOR" })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("region", { name: "Cambios del periodo" })).not.toBeInTheDocument())
    expect(pedidos()).toEqual([])
  })
})
