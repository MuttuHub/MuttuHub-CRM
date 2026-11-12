// AJ-09: formulario simple de traslado entre rubros (origen, destino, valor, motivo). Las queries y la
// mutación son reales; solo se burlan `fetch`, `sonner` y la fecha. El reparto por meses lo cubre
// `traslado-simple.test.ts`; aquí se fija lo que el formulario pide, lo que envía y lo que muestra.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { TrasladoForm } from "./traslado-form"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-12-18",
  duracion_semanas: 11,
  valor_total: "36800000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 50,
  lineas: [],
  municipios: [],
}

const BUDGET = {
  estado: "EN_EJECUCION",
  rubros: [
    { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
    { rubro_id: "r13", codigo: "R13", nombre: "Dotación", activo: true, linea_id: "l13", asignado: "12800000.00", heredado_pendiente: false },
    { rubro_id: "r20", codigo: "R20", nombre: "Imprevistos", activo: true, linea_id: null, asignado: "0.00", heredado_pendiente: false },
    { rubro_id: "r99", codigo: null, nombre: "Material POP", activo: false, linea_id: null, asignado: "0.00", heredado_pendiente: false },
  ],
  suma: "36800000.00",
  valor_total: "36800000.00",
  diferencia: "0.00",
}
// Today is 2026-11-11 in Bogota: October is closed, November and December are open.
const PROGRAMMING = {
  estado: "EN_EJECUCION",
  periodos: ["2026-10", "2026-11", "2026-12"],
  filas: [
    { rubro_id: "r12", periodo: "2026-10", valor: "8000000.00" },
    { rubro_id: "r12", periodo: "2026-11", valor: "8000000.00" },
    { rubro_id: "r12", periodo: "2026-12", valor: "8000000.00" },
    { rubro_id: "r13", periodo: "2026-10", valor: "6400000.00" },
    { rubro_id: "r13", periodo: "2026-11", valor: "3200000.00" },
    { rubro_id: "r13", periodo: "2026-12", valor: "3200000.00" },
  ],
  control_por_rubro: [],
  programacion_pendiente: false,
}

describe("TrasladoForm", () => {
  const fetchMock = vi.fn()
  const onDone = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function setup(post: () => Response = () => jsonResponse({ solicitud: {} }, 201)) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/modifications") && init?.method === "POST") return Promise.resolve(post())
      if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(BUDGET))
      if (url.endsWith("/programming")) return Promise.resolve(jsonResponse(PROGRAMMING))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<TrasladoForm proyecto={PROYECTO} onDone={onDone} />, { wrapper })
  }

  const posts = () =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/modifications") && (init as RequestInit | undefined)?.method === "POST") as [string, RequestInit][]

  const opciones = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.getAttribute("value"))
  const enviar = () => screen.getByRole("button", { name: "Enviar solicitud" })

  async function llenar(user: ReturnType<typeof userEvent.setup>, valor: string, motivo = "Mover transporte a dotación") {
    await user.selectOptions(await screen.findByRole("combobox", { name: "Rubro de origen" }), "R12")
    await user.selectOptions(screen.getByRole("combobox", { name: "Rubro de destino" }), "R13")
    await user.type(screen.getByLabelText("Valor"), valor)
    if (motivo) await user.type(screen.getByLabelText("Motivo"), motivo)
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-11T15:00:00.000Z"))
    fetchMock.mockReset()
    onDone.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("asks for origin, destination, value and motivo, and sends a TRASLADO spread over the open months", async () => {
    const user = userEvent.setup()
    setup()

    // Only the project's budget lines: no rubro without a line (R20) and no legacy rubro without a code.
    const origen = await screen.findByRole("combobox", { name: "Rubro de origen" })
    expect(opciones(origen)).toEqual(["", "R12", "R13"])
    await user.selectOptions(origen, "R12")
    // The destination never offers the origin.
    const destino = screen.getByRole("combobox", { name: "Rubro de destino" })
    expect(opciones(destino)).toEqual(["", "R13"])
    await user.selectOptions(destino, "R13")
    await user.type(screen.getByLabelText("Valor"), "1.000.000")
    await user.type(screen.getByLabelText("Motivo"), "  Mover transporte a dotación ")
    await user.click(enviar())

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]![0]).toBe("/api/v1/projects/p1/modifications")
    expect(JSON.parse(String(posts()[0]![1].body))).toEqual({
      tipo: "TRASLADO",
      motivo: "Mover transporte a dotación",
      detalle: [
        { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000.00", despues: "23000000.00" },
        { elemento: "programacion", clave: "R12|2026-11", campo: "valor", antes: "8000000.00", despues: "7500000.00" },
        { elemento: "programacion", clave: "R12|2026-12", campo: "valor", antes: "8000000.00", despues: "7500000.00" },
        { elemento: "presupuesto", clave: "R13", campo: "asignado", antes: "12800000.00", despues: "13800000.00" },
        { elemento: "programacion", clave: "R13|2026-11", campo: "valor", antes: "3200000.00", despues: "3700000.00" },
        { elemento: "programacion", clave: "R13|2026-12", campo: "valor", antes: "3200000.00", despues: "3700000.00" },
      ],
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith("Solicitud de modificación enviada.")
  })

  it("cannot be sent without both rubros, a value above zero and a motivo", async () => {
    const user = userEvent.setup()
    setup()

    await llenar(user, "0", "")
    expect(enviar()).toBeDisabled()
    await user.type(screen.getByLabelText("Motivo"), "   ")
    expect(enviar()).toBeDisabled() // a blank motivo is no motivo
    await user.type(screen.getByLabelText("Motivo"), "Ajuste")
    expect(enviar()).toBeDisabled() // $0 is not a traslado
    await user.clear(screen.getByLabelText("Valor"))
    await user.type(screen.getByLabelText("Valor"), "1000")
    expect(enviar()).toBeEnabled()
    await user.selectOptions(screen.getByRole("combobox", { name: "Rubro de destino" }), "")
    expect(enviar()).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })

  it("explains, without sending, that the origin does not have that much programmed from the current month on", async () => {
    const user = userEvent.setup()
    setup()

    // R12 has 16.000.000 open (November + December); the other 8.000.000 are in closed October.
    await llenar(user, "16.000.000,01")

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El rubro «R12» solo tiene $ 16.000.000 programados desde el periodo actual: no se pueden trasladar $ 16.000.000,01.",
    )
    expect(enviar()).toBeDisabled()
    expect(posts()).toHaveLength(0)
  })

  it("shows every broken rule the API returns, inline, and stays open", async () => {
    const user = userEvent.setup()
    setup(() =>
      jsonResponse(
        {
          error: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).",
          code: "VALIDATION_ERROR",
          reglas: [
            { codigo: "A_MENOR_QUE_EJECUTADO", mensaje: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000)." },
            { codigo: "ANTES_DESACTUALIZADO", mensaje: "El valor actual de «R13» cambió; recarga e inténtalo de nuevo." },
          ],
        },
        400,
      ),
    )

    await llenar(user, "1000000")
    await user.click(enviar())

    const reglas = await screen.findByTestId("traslado-reglas")
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).",
      "El valor actual de «R13» cambió; recarga e inténtalo de nuevo.",
    ])
    expect(onDone).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
