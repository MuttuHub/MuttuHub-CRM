// S5 U5: sección "Presupuesto" de la ficha (montos por rubro y programación
// mensual). Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectPresupuesto } from "./project-presupuesto"

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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "BORRADOR",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-12-18",
  duracion_semanas: 11,
  valor_total: "100000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const BUDGET = {
  estado: "BORRADOR",
  rubros: [
    { rubro_id: "r1", codigo: "R01", nombre: "Personal", activo: true, linea_id: "l1", asignado: "59500000.00", heredado_pendiente: false },
    { rubro_id: "r2", codigo: "R02", nombre: "Alimentación", activo: true, linea_id: null, asignado: "0.00", heredado_pendiente: false },
    { rubro_id: "pop", codigo: null, nombre: "Material POP", activo: false, linea_id: "l9", asignado: "300000.00", heredado_pendiente: true },
  ],
  // S1: one line per activity + rubro. l9 is a legacy line (D9) on a suspended rubro.
  lineas: [
    { linea_id: "l1", actividad_id: "a11", actividad_codigo: "1.1", actividad_nombre: "Taller", rubro_id: "r1", rubro_codigo: "R01", rubro_nombre: "Personal", valor: "59500000.00" },
    { linea_id: "l9", actividad_id: null, actividad_codigo: null, actividad_nombre: null, rubro_id: "pop", rubro_codigo: null, rubro_nombre: "Material POP", valor: "300000.00" },
  ],
  suma: "59800000.00",
  valor_total: "59800000.00",
  diferencia: "0.00",
}

const ACTIVIDADES = [
  { id: "a11", codigo: "1.1", nombre: "Taller" },
  { id: "a12", codigo: "1.2", nombre: "Feria" },
]

const PROGRAMMING = {
  estado: "BORRADOR",
  periodos: ["2026-10", "2026-11", "2026-12"],
  filas: [{ rubro_id: "r1", periodo: "2026-10", valor: "20000000.00" }],
  control_por_rubro: [
    { rubro_id: "r1", codigo: "R01", nombre: "Personal", asignado: "59500000.00", programado: "20000000.00", control: "-39500000.00" },
    { rubro_id: "pop", codigo: null, nombre: "Material POP", asignado: "300000.00", programado: "0.00", control: "-300000.00" },
  ],
  programacion_pendiente: false,
}

type Setup = {
  proyecto?: Partial<ProjectListRow>
  budget?: unknown
  programming?: unknown
  programmingStatus?: number
  rol?: string
  gastos?: unknown[]
}

describe("ProjectPresupuesto", () => {
  const fetchMock = vi.fn()

  function setup({ proyecto = {}, budget = BUDGET, programming = PROGRAMMING, programmingStatus = 200, rol = "ADMINISTRADOR", gastos = [] }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(budget))
      if (url.endsWith("/activities")) return Promise.resolve(jsonResponse({ actividades: ACTIVIDADES }))
      if (url.endsWith("/expenses")) return Promise.resolve(jsonResponse({ gastos }))
      if (url.endsWith("/programming")) {
        return Promise.resolve(
          programmingStatus === 200
            ? jsonResponse(programming)
            : jsonResponse({ error: "Define las fechas de inicio y fin del proyecto antes de programar.", code: "INVALID_STATE" }, programmingStatus),
        )
      }
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse({ proyecto: PROYECTO }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectPresupuesto proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper: createWrapper() })
  }

  const writes = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method)

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const bodyDelPut = () => {
    const [url, init] = writes("PUT").find(([u]) => String(u).endsWith("/budget"))!
    expect(String(url)).toBe("/api/v1/projects/p1/budget")
    return JSON.parse(String((init as RequestInit).body))
  }

  it("lists each line under its activity, the legacy line under «Sin actividad», with money formatted (S1)", async () => {
    setup()

    const lineas = await screen.findByTestId("presupuesto-lineas")
    const filas = within(lineas).getAllByTestId("presupuesto-linea")
    expect(filas).toHaveLength(2)
    expect(within(lineas).getByText("1.1 · Taller")).toBeInTheDocument()
    expect(within(lineas).getByText("Sin actividad")).toBeInTheDocument()
    expect(filas[0]).toHaveTextContent("Personal")
    expect(within(lineas).getByLabelText("Valor 1.1 R01")).toHaveValue("59.500.000")
  })

  it("shows each rubro as the sum of its lines, live, so two lines of a rubro add up (S2, S6)", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByTestId("presupuesto-lineas")

    // S6: one activity with Formación and Transporte; here 1.2 adds a second Personal line.
    // Activities arrive after the budget, as in the app.
    await screen.findByRole("option", { name: "1.2 Feria" })
    await user.selectOptions(screen.getByLabelText("Actividad de la nueva línea"), "a12")
    await user.selectOptions(screen.getByLabelText("Rubro de la nueva línea"), "r1")
    await user.type(screen.getByLabelText("Valor de la nueva línea"), "500000")
    await user.click(screen.getByRole("button", { name: "Agregar línea" }))

    const tabla = screen.getByTestId("presupuesto-tabla")
    const personal = within(tabla).getAllByTestId("presupuesto-fila")[0]!
    expect(personal).toHaveTextContent("Personal")
    expect(personal).toHaveTextContent("$ 60.000.000")
    expect(screen.getByTestId("presupuesto-resumen")).toHaveTextContent("$ 60.300.000")
  })

  it("shows the project value as the sum of the lines, never as a field to type (S2)", async () => {
    const user = userEvent.setup()
    setup()

    const resumen = await screen.findByTestId("presupuesto-resumen")
    expect(within(resumen).getByText("Valor total")).toBeInTheDocument()
    expect(resumen).toHaveTextContent("Se calcula sumando las líneas")
    expect(resumen).not.toHaveTextContent("Diferencia")
    expect(screen.queryByRole("button", { name: "Usar la suma como valor total" })).not.toBeInTheDocument()

    const campo = screen.getByLabelText("Valor 1.1 R01")
    await user.clear(campo)
    await user.type(campo, "40000000")
    await user.tab()
    expect(resumen).toHaveTextContent("$ 40.300.000")
  })

  it("submits every line as activity + rubro + a decimal string (comma decimals included)", async () => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Valor 1.1 R01")
    await user.clear(campo)
    await user.type(campo, "1500000,5")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    expect(bodyDelPut()).toEqual({
      lineas: [
        { actividad_id: "a11", rubro_id: "r1", valor: "1500000.50" },
        { actividad_id: null, rubro_id: "pop", valor: "300000.00" },
      ],
    })
  })

  it("adds a line for an activity that already has another rubro, and sends it (S1)", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByTestId("presupuesto-lineas")

    // Activities arrive after the budget, as in the app.
    await screen.findByRole("option", { name: "1.1 Taller" })
    await user.selectOptions(screen.getByLabelText("Actividad de la nueva línea"), "a11")
    await user.selectOptions(screen.getByLabelText("Rubro de la nueva línea"), "r2")
    await user.type(screen.getByLabelText("Valor de la nueva línea"), "8000000")
    await user.click(screen.getByRole("button", { name: "Agregar línea" }))
    expect(screen.getByLabelText("Valor 1.1 R02")).toHaveValue("8.000.000")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    expect(bodyDelPut().lineas).toContainEqual({ actividad_id: "a11", rubro_id: "r2", valor: "8000000.00" })
  })

  it("only offers active rubros for a new line", async () => {
    setup()
    const rubro = await screen.findByLabelText("Rubro de la nueva línea")
    const opciones = within(rubro).getAllByRole("option").map((o) => o.textContent)
    expect(opciones).toContain("R02 Alimentación")
    expect(opciones).not.toContain("Material POP")
  })

  it("refuses the same activity + rubro twice, locally (S5)", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByTestId("presupuesto-lineas")

    // Activities arrive after the budget, as in the app.
    await screen.findByRole("option", { name: "1.1 Taller" })
    await user.selectOptions(screen.getByLabelText("Actividad de la nueva línea"), "a11")
    await user.selectOptions(screen.getByLabelText("Rubro de la nueva línea"), "r1")
    await user.type(screen.getByLabelText("Valor de la nueva línea"), "1")
    await user.click(screen.getByRole("button", { name: "Agregar línea" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("ya está en el presupuesto")
    expect(screen.getAllByTestId("presupuesto-linea")).toHaveLength(2)
  })

  it("removes a line, which is then left out of the request", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Quitar línea 1.1 R01" }))
    expect(screen.getAllByTestId("presupuesto-linea")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    expect(bodyDelPut()).toEqual({ lineas: [{ actividad_id: null, rubro_id: "pop", valor: "300000.00" }] })
  })

  it.each([
    ["1.234{backspace}", "1.23"],
    ["1.234.567{backspace}", "1.234.56"],
    ["1.500,505", "1.500,505"],
    ["1234.50", "1234.50"],
  ])("never reinterprets the value %j: it is rejected and not sent", async (typed, shown) => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Valor 1.1 R01")
    await user.clear(campo)
    await user.type(campo, typed)
    await user.tab()
    expect(campo).toHaveValue(shown)
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("usa coma")
    expect(writes("PUT")).toHaveLength(0)
  })

  it("submits a pasted es-CO amount with thousands and decimals as the exact value", async () => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Valor 1.1 R01")
    await user.clear(campo)
    await user.click(campo)
    await user.paste("1.234.567,50")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    expect(bodyDelPut().lineas).toContainEqual({ actividad_id: "a11", rubro_id: "r1", valor: "1234567.50" })
  })

  it("rejects an invalid amount locally and does not call the API", async () => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Valor 1.1 R01")
    await user.clear(campo)
    await user.type(campo, "12abc")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa un monto válido")
    expect(writes("PUT")).toHaveLength(0)
  })

  it("marks a suspended rubro that still holds an amount as pending reassignment", async () => {
    setup()

    const tabla = await screen.findByTestId("presupuesto-tabla")
    expect(within(tabla).getByText("Rubro suspendido pendiente de reasignación")).toBeInTheDocument()
  })

  it("renders one programming column per project month, with legible months, and the control per rubro", async () => {
    setup()

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["oct 2026", "nov 2026", "dic 2026"]),
    )
    expect(within(grid).getByLabelText("Programado R01 oct 2026")).toHaveValue("20.000.000")
    const fila = within(grid).getAllByTestId("programacion-fila")[0]
    // Falta por programar = asignado − programado: 59.500.000 − 20.000.000.
    expect(fila).toHaveTextContent("$ 39.500.000")
    expect(fila).not.toHaveTextContent("-$")
  })

  it("outside BORRADOR, adds what each rubro executed and has available; REGISTRADO already counts (AJ-08)", async () => {
    const gasto = (id: string, rubro: string, estado: string, valor: string) => ({
      id, rubro: { id: rubro, codigo: null, nombre: "x" }, estado, valor,
    })
    setup({
      proyecto: { estado: "EN_EJECUCION" },
      budget: { ...BUDGET, estado: "EN_EJECUCION" },
      gastos: [
        gasto("g1", "r1", "VALIDADO", "9500000.00"),
        gasto("g2", "r1", "REGISTRADO", "1000000.00"),
        gasto("g3", "r1", "RECHAZADO", "7000000.00"),
        gasto("g4", "pop", "VALIDADO", "400000.00"),
      ],
    })

    const tabla = await screen.findByTestId("presupuesto-tabla")
    // AJ-08: without approval there is no «Por validar» column left.
    await waitFor(() =>
      expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Rubro", "Asignado", "Ejecutado", "Disponible",
      ]),
    )
    expect(within(tabla).queryByText(/Por validar/)).not.toBeInTheDocument()
    expect(within(tabla).getByRole("button", { name: "Ayuda: Disponible del rubro" })).toBeInTheDocument()
    const filas = within(tabla).getAllByTestId("presupuesto-fila")
    // Ejecutado = VALIDADO 9.500.000 + REGISTRADO 1.000.000; the RECHAZADO 7.000.000 never counts.
    expect(filas[0]).toHaveTextContent("$ 10.500.000")
    // Disponible = asignado − ejecutado: 59.500.000 − 10.500.000.
    expect(filas[0]).toHaveTextContent("$ 49.000.000")
    // A rubro without expenses shows zero executed and zero available.
    expect(filas[1]).toHaveTextContent("$ 0")
    // Over its assigned amount: 300.000 − 400.000.
    expect(filas[2]).toHaveTextContent("-$ 100.000")
  })

  it("keeps only Rubro and Asignado while the project is BORRADOR, without reading the expenses", async () => {
    setup()
    const tabla = await screen.findByTestId("presupuesto-tabla")
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Rubro", "Asignado"])
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/expenses"))).toBe(false)
  })

  it("names the budget totals in plain words, without Σ (U4)", async () => {
    setup()

    const resumen = await screen.findByTestId("presupuesto-resumen")
    expect(within(resumen).getByText("Total asignado")).toBeInTheDocument()
    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).getByRole("columnheader", { name: "Falta por programar" })).toBeInTheDocument()
    expect(screen.getByTestId("presupuesto")).not.toHaveTextContent(/Σ|Control/)
  })

  it("flags pending programming and shows what is left to program as informational", async () => {
    setup({ programming: { ...PROGRAMMING, filas: [], programacion_pendiente: true } })

    expect(await screen.findByText("Programación pendiente")).toBeInTheDocument()
    expect(screen.getByText(/informativo/i)).toBeInTheDocument()
  })

  it("submits programming cells above $0 as strings, with the typed thousands separators", async () => {
    const user = userEvent.setup()
    setup()

    const celda = await screen.findByLabelText("Programado R01 nov 2026")
    await user.type(celda, "7500,25")
    await user.tab()
    expect(celda).toHaveValue("7.500,25")
    await user.click(screen.getByRole("button", { name: "Guardar programación" }))

    await waitFor(() => expect(writes("PUT").some(([u]) => String(u).endsWith("/programming"))).toBe(true))
    const [, init] = writes("PUT").find(([u]) => String(u).endsWith("/programming"))!
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      filas: [
        { rubro_id: "r1", periodo: "2026-10", valor: "20000000.00" },
        { rubro_id: "r1", periodo: "2026-11", valor: "7500.25" },
      ],
    })
  })

  it("explains a project without dates instead of the grid", async () => {
    setup({ programmingStatus: 409 })

    expect(await screen.findByText("Define las fechas de inicio y fin del proyecto antes de programar.")).toBeInTheDocument()
    expect(screen.queryByTestId("programacion-grid")).not.toBeInTheDocument()
  })

  describe("edit controls", () => {
    it("are read-only for a COORDINADOR", async () => {
      setup({ rol: "COORDINADOR" })

      const tabla = await screen.findByTestId("presupuesto-tabla")
      expect(tabla).toHaveTextContent("$ 59.500.000")
      expect(screen.queryByLabelText("Asignado R01")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("Programado R01 nov 2026")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Guardar presupuesto" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Usar la suma como valor total" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Importar presupuesto" })).not.toBeInTheDocument()
    })

    it("are read-only once the project is out of BORRADOR, even for a manager", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" }, budget: { ...BUDGET, estado: "EN_EJECUCION" } })

      await screen.findByTestId("presupuesto-tabla")
      expect(screen.queryByLabelText("Asignado R01")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Guardar presupuesto" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Guardar programación" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Importar presupuesto" })).not.toBeInTheDocument()
    })

    it("offer «Importar presupuesto» to a manager while the project is in BORRADOR", async () => {
      setup()

      await screen.findByTestId("presupuesto-tabla")
      expect(screen.getByRole("button", { name: "Importar presupuesto" })).toBeInTheDocument()
    })
  })
})
