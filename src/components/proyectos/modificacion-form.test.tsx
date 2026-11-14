// S8 U6: formulario "Solicitar modificación". Las queries y la mutación son reales; solo se burlan
// `fetch` y `sonner`. El formulario ofrece solo los campos del tipo y envía lo que cambió; las reglas
// (RF-28, REQ-GAS-06) las decide la API y se muestran en línea.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { SolicitarModificacion } from "./modificacion-form"

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
  fecha_fin: "2026-11-27",
  duracion_semanas: 8,
  valor_total: "37200000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 50,
  lineas: [],
  municipios: [],
}

const STAMP = { created_at: "x", updated_at: "x" }
const BUDGET = {
  estado: "EN_EJECUCION",
  rubros: [
    { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l12", asignado: "24000000.00", heredado_pendiente: false },
    { rubro_id: "r13", codigo: "R13", nombre: "Dotación", activo: true, linea_id: "l13", asignado: "12800000.00", heredado_pendiente: false },
    { rubro_id: "r99", codigo: null, nombre: "Material POP", activo: false, linea_id: null, asignado: "0.00", heredado_pendiente: false },
  ],
  // Legacy lines (no activity): their key is the bare rubro code.
  lineas: [
    { linea_id: "l12", actividad_id: null, actividad_codigo: null, actividad_nombre: null, rubro_id: "r12", rubro_codigo: "R12", rubro_nombre: "Transporte", valor: "24000000.00" },
    { linea_id: "l13", actividad_id: null, actividad_codigo: null, actividad_nombre: null, rubro_id: "r13", rubro_codigo: "R13", rubro_nombre: "Dotación", valor: "12800000.00" },
  ],
  suma: "36800000.00",
  valor_total: "36800000.00",
  diferencia: "0.00",
}
const PROGRAMMING = {
  estado: "EN_EJECUCION",
  periodos: ["2026-10", "2026-11"],
  filas: [
    { linea_id: "l12", rubro_id: "r12", periodo: "2026-10", valor: "12000000.00" },
    { linea_id: "l12", rubro_id: "r12", periodo: "2026-11", valor: "12000000.00" },
    { linea_id: "l13", rubro_id: "r13", periodo: "2026-10", valor: "6400000.00" },
    { linea_id: "l13", rubro_id: "r13", periodo: "2026-11", valor: "6400000.00" },
  ],
  control_por_rubro: [
    { rubro_id: "r12", codigo: "R12", nombre: "Transporte", asignado: "24000000.00", programado: "24000000.00", control: "0.00" },
    { rubro_id: "r13", codigo: "R13", nombre: "Dotación", asignado: "12800000.00", programado: "12800000.00", control: "0.00" },
  ],
  programacion_pendiente: false,
}
const ACTIVIDADES = [
  { ...STAMP, id: "a1", proyecto_id: "p1", objetivo_id: "o1", codigo: "1.4", nombre: "Entrega de dotación", semana_inicio: 3, semana_fin: 6, fecha_inicio: null, fecha_fin: null, peso: 4, peso_manual: false, responsable_id: null, fuera_de_duracion: false },
]
const ENTREGABLES = [
  { ...STAMP, id: "e1", proyecto_id: "p1", actividad_id: "a1", codigo: "1.4-E1", descripcion: "Certificado", cantidad_meta: "4.00", unidad: "Certificado", tipo_medio_exigido: "Documento" },
]
const INDICADORES = [
  { ...STAMP, id: "i1", proyecto_id: "p1", objetivo_id: "o1", codigo: "IND-01", nombre: "Unidades fortalecidas", meta: "30.00", unidad: "Unidades", linea_base: "0.00" },
]

describe("SolicitarModificacion", () => {
  const fetchMock = vi.fn()
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
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables: ENTREGABLES }))
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: INDICADORES }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<SolicitarModificacion proyecto={PROYECTO} />, { wrapper })
  }

  const posts = () =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/modifications") && (init as RequestInit | undefined)?.method === "POST") as [string, RequestInit][]

  async function abrir(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Solicitar modificación" }))
    return screen.findByRole("dialog")
  }

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("offers the six tipos and, for a traslado, the budget and programming of every rubro with a code", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)

    const tipo = within(dialogo).getByRole("combobox", { name: "Tipo de modificación" })
    expect(within(tipo).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "TRASLADO", "ADICION", "REDUCCION", "REPROGRAMACION", "CRONOGRAMA", "ENTREGABLES",
    ])
    expect(await within(dialogo).findByLabelText("Asignado R12")).toHaveValue("24000000.00")
    expect(within(dialogo).getByLabelText("Asignado R13")).toHaveValue("12800000.00")
    expect(within(dialogo).getByLabelText("Programado R12 2026-11")).toHaveValue("12000000.00")
    expect(within(dialogo).queryByLabelText(/R99|Material POP/)).not.toBeInTheDocument() // legacy rubro without a code
  })

  it("shows one row per activity line of a rubro and sends each line's change by activity and rubro (T13 S5)", async () => {
    const user = userEvent.setup()
    const linea = (id: string, act: string, valor: string) => ({
      linea_id: id, actividad_id: `a${act}`, actividad_codigo: act, actividad_nombre: `Actividad ${act}`, rubro_id: "r12", rubro_codigo: "R12", rubro_nombre: "Transporte", valor,
    })
    const presupuesto = {
      ...BUDGET,
      rubros: [
        { rubro_id: "r12", codigo: "R12", nombre: "Transporte", activo: true, linea_id: "l1", asignado: "24000000.00", heredado_pendiente: false },
        { rubro_id: "r20", codigo: "R20", nombre: "Imprevistos", activo: true, linea_id: null, asignado: "0.00", heredado_pendiente: false },
      ],
      lineas: [linea("l1", "1.1", "6000000.00"), linea("l2", "1.2", "18000000.00")],
    }
    const programacion = {
      ...PROGRAMMING,
      filas: [
        { linea_id: "l1", rubro_id: "r12", periodo: "2026-11", valor: "6000000.00" },
        { linea_id: "l2", rubro_id: "r12", periodo: "2026-10", valor: "9000000.00" },
        { linea_id: "l2", rubro_id: "r12", periodo: "2026-11", valor: "9000000.00" },
      ],
    }
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/modifications") && init?.method === "POST") return Promise.resolve(jsonResponse({ solicitud: {} }, 201))
      if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(presupuesto))
      if (url.endsWith("/programming")) return Promise.resolve(jsonResponse(programacion))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
      if (url.endsWith("/deliverables")) return Promise.resolve(jsonResponse({ entregables: ENTREGABLES }))
      if (url.endsWith("/indicators")) return Promise.resolve(jsonResponse({ indicadores: INDICADORES }))
      return Promise.resolve(jsonResponse({}))
    })
    render(<SolicitarModificacion proyecto={PROYECTO} />, { wrapper })
    const dialogo = await abrir(user)

    expect(await within(dialogo).findByLabelText("Asignado 1.1 R12")).toHaveValue("6000000.00")
    expect(within(dialogo).getByLabelText("Asignado 1.2 R12")).toHaveValue("18000000.00")
    expect(within(dialogo).getByLabelText("Programado 1.1 R12 2026-10")).toHaveValue("0.00")
    expect(within(dialogo).getByLabelText("Programado 1.2 R12 2026-10")).toHaveValue("9000000.00")
    // A catalog rubro without a line can still be brought in (ADICION), by its bare code.
    expect(within(dialogo).getByLabelText("Asignado R20")).toHaveValue("0.00")
    expect(within(dialogo).queryByLabelText("Asignado R12")).not.toBeInTheDocument()

    const a11 = within(dialogo).getByLabelText("Asignado 1.1 R12")
    await user.clear(a11)
    await user.type(a11, "4000000")
    const a12 = within(dialogo).getByLabelText("Asignado 1.2 R12")
    await user.clear(a12)
    await user.type(a12, "20000000")
    const p11 = within(dialogo).getByLabelText("Programado 1.1 R12 2026-11")
    await user.clear(p11)
    await user.type(p11, "4000000")
    const p12 = within(dialogo).getByLabelText("Programado 1.2 R12 2026-11")
    await user.clear(p12)
    await user.type(p12, "11000000")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Entre actividades")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(String(posts()[0]![1].body)).detalle).toEqual([
      { elemento: "presupuesto", clave: "1.1|R12", campo: "asignado", antes: "6000000.00", despues: "4000000" },
      { elemento: "programacion", clave: "1.1|R12|2026-11", campo: "valor", antes: "6000000.00", despues: "4000000" },
      { elemento: "presupuesto", clave: "1.2|R12", campo: "asignado", antes: "18000000.00", despues: "20000000" },
      { elemento: "programacion", clave: "1.2|R12|2026-11", campo: "valor", antes: "9000000.00", despues: "11000000" },
    ])
  })

  it("closes on Cancelar without sending anything, like the other project dialogs", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)

    await user.type(within(dialogo).getByLabelText("Motivo"), "Borrador")
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(posts()).toHaveLength(0)
  })

  it("sends only what changed, with the value shown as `antes`, and closes on success", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)

    const asignadoR12 = await within(dialogo).findByLabelText("Asignado R12")
    await user.clear(asignadoR12)
    await user.type(asignadoR12, "23000000")
    const asignadoR13 = within(dialogo).getByLabelText("Asignado R13")
    await user.clear(asignadoR13)
    await user.type(asignadoR13, "13800000")
    const p12 = within(dialogo).getByLabelText("Programado R12 2026-11")
    await user.clear(p12)
    await user.type(p12, "11000000")
    const p13 = within(dialogo).getByLabelText("Programado R13 2026-11")
    await user.clear(p13)
    await user.type(p13, "7400000")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Mover transporte a dotación")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(String(posts()[0]![1].body))).toEqual({
      tipo: "TRASLADO",
      motivo: "Mover transporte a dotación",
      detalle: [
        { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000.00", despues: "23000000" },
        { elemento: "programacion", clave: "R12|2026-11", campo: "valor", antes: "12000000.00", despues: "11000000" },
        { elemento: "presupuesto", clave: "R13", campo: "asignado", antes: "12800000.00", despues: "13800000" },
        { elemento: "programacion", clave: "R13|2026-11", campo: "valor", antes: "6400000.00", despues: "7400000" },
      ],
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith("Solicitud de modificación enviada.")
  })

  it("needs a motivo and at least one change before it can be sent", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)
    const enviar = within(dialogo).getByRole("button", { name: "Enviar solicitud" })
    expect(enviar).toBeDisabled()

    await user.type(within(dialogo).getByLabelText("Motivo"), "Ajuste")
    expect(enviar).toBeDisabled()
    const asignado = await within(dialogo).findByLabelText("Asignado R12")
    await user.clear(asignado)
    await user.type(asignado, "23000000")
    expect(enviar).toBeEnabled()
  })

  it("shows every broken rule the API returns, inline, and keeps the dialog open", async () => {
    const user = userEvent.setup()
    setup(() =>
      jsonResponse(
        {
          error: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).",
          code: "VALIDATION_ERROR",
          reglas: [
            { codigo: "A_MENOR_QUE_EJECUTADO", mensaje: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000)." },
            { codigo: "PERIODO_PASADO", mensaje: "El periodo 2026-10 ya transcurrió: no se puede reprogramar." },
          ],
        },
        400,
      ),
    )
    const dialogo = await abrir(user)
    const asignado = await within(dialogo).findByLabelText("Asignado R12")
    await user.clear(asignado)
    await user.type(asignado, "23000000")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Ajuste")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    const reglas = await within(dialogo).findByTestId("modificacion-reglas")
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).",
      "El periodo 2026-10 ya transcurrió: no se puede reprogramar.",
    ])
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("shows a 409 (no baseline, estado) inline", async () => {
    const user = userEvent.setup()
    setup(() => jsonResponse({ error: "El proyecto no tiene línea base aprobada.", code: "INVALID_STATE" }, 409))
    const dialogo = await abrir(user)
    const asignado = await within(dialogo).findByLabelText("Asignado R12")
    await user.clear(asignado)
    await user.type(asignado, "1")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Ajuste")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    expect(await within(dialogo).findByText("El proyecto no tiene línea base aprobada.")).toBeInTheDocument()
  })

  it("a reprogramación shows A as plain text and only offers the programming inputs", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)
    await user.selectOptions(within(dialogo).getByRole("combobox", { name: "Tipo de modificación" }), "REPROGRAMACION")

    await within(dialogo).findByLabelText("Programado R12 2026-10")
    expect(within(dialogo).queryByLabelText("Asignado R12")).not.toBeInTheDocument()
    expect(within(dialogo).getByTestId("modificacion-grilla")).toHaveTextContent("$ 24.000.000")
  })

  it("a cronograma edits the project dates and the weeks of the activities", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)
    await user.selectOptions(within(dialogo).getByRole("combobox", { name: "Tipo de modificación" }), "CRONOGRAMA")

    expect(await within(dialogo).findByLabelText("Fecha de fin")).toHaveValue("2026-11-27")
    expect(within(dialogo).getByLabelText("Fecha de inicio")).toHaveValue("2026-10-05")
    const semanaFin = within(dialogo).getByLabelText("Semana final 1.4")
    expect(semanaFin).toHaveValue("6")
    await user.clear(semanaFin)
    await user.type(semanaFin, "8")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Alargar la entrega")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(String(posts()[0]![1].body))).toEqual({
      tipo: "CRONOGRAMA",
      motivo: "Alargar la entrega",
      detalle: [{ elemento: "actividad", clave: "1.4", campo: "semana_fin", antes: "6", despues: "8" }],
    })
  })

  it("entregables edits quantities of deliverables and the target of indicators", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)
    await user.selectOptions(within(dialogo).getByRole("combobox", { name: "Tipo de modificación" }), "ENTREGABLES")

    const cantidad = await within(dialogo).findByLabelText("Cantidad 1.4-E1")
    expect(cantidad).toHaveValue("4.00")
    await user.clear(cantidad)
    await user.type(cantidad, "6")
    const meta = within(dialogo).getByLabelText("Meta IND-01")
    await user.clear(meta)
    await user.type(meta, "40")
    await user.type(within(dialogo).getByLabelText("Motivo"), "Más cobertura")
    await user.click(within(dialogo).getByRole("button", { name: "Enviar solicitud" }))

    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(String(posts()[0]![1].body)).detalle).toEqual([
      { elemento: "entregable", clave: "1.4-E1", campo: "cantidad_meta", antes: "4.00", despues: "6" },
      { elemento: "indicador", clave: "IND-01", campo: "meta", antes: "30.00", despues: "40" },
    ])
  })

  it("forgets what was typed when the tipo changes", async () => {
    const user = userEvent.setup()
    setup()
    const dialogo = await abrir(user)
    const asignado = await within(dialogo).findByLabelText("Asignado R12")
    await user.clear(asignado)
    await user.type(asignado, "1")
    await user.selectOptions(within(dialogo).getByRole("combobox", { name: "Tipo de modificación" }), "ADICION")
    expect(await within(dialogo).findByLabelText("Asignado R12")).toHaveValue("24000000.00")
  })
})
