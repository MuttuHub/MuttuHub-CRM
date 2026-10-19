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
  suma: "59800000.00",
  valor_total: "100000000.00",
  diferencia: "-40200000.00",
}

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
}

describe("ProjectPresupuesto", () => {
  const fetchMock = vi.fn()

  function setup({ proyecto = {}, budget = BUDGET, programming = PROGRAMMING, programmingStatus = 200, rol = "ADMINISTRADOR" }: Setup = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/budget")) return Promise.resolve(jsonResponse(budget))
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

  it("lists every rubro, including the virtual $0 row, with money formatted", async () => {
    setup()

    const tabla = await screen.findByTestId("presupuesto-tabla")
    const filas = within(tabla).getAllByTestId("presupuesto-fila")
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent("R01")
    expect(filas[0]).toHaveTextContent("Personal")
    expect(within(tabla).getByLabelText("Asignado R01")).toHaveValue("59.500.000")
    expect(within(tabla).getByLabelText("Asignado R02")).toHaveValue("0")
  })

  it("marks a suspended rubro that still holds an amount as pending reassignment", async () => {
    setup()

    const tabla = await screen.findByTestId("presupuesto-tabla")
    expect(within(tabla).getByText("Rubro suspendido pendiente de reasignación")).toBeInTheDocument()
  })

  it("shows the live difference between Σ A and the project value as the amounts change", async () => {
    const user = userEvent.setup()
    setup()

    const resumen = await screen.findByTestId("presupuesto-resumen")
    expect(resumen).toHaveTextContent("$ 59.800.000")
    expect(resumen).toHaveTextContent("$ 100.000.000")
    expect(resumen).toHaveTextContent("-$ 40.200.000")

    const campo = screen.getByLabelText("Asignado R02")
    await user.clear(campo)
    await user.type(campo, "40200000")
    await user.tab()
    expect(campo).toHaveValue("40.200.000")
    expect(resumen).toHaveTextContent("Diferencia")
    expect(resumen).toHaveTextContent("$ 0")
    expect(resumen).not.toHaveTextContent("-$ 40.200.000")
  })

  it("submits every rubro amount as a decimal string (comma decimals included)", async () => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Asignado R02")
    await user.clear(campo)
    await user.type(campo, "1500000,5")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    const [url, init] = writes("PUT").find(([u]) => String(u).endsWith("/budget"))!
    expect(String(url)).toBe("/api/v1/projects/p1/budget")
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      rubros: [
        { rubro_id: "r1", asignado: "59500000.00" },
        { rubro_id: "r2", asignado: "1500000.50" },
        { rubro_id: "pop", asignado: "300000.00" },
      ],
    })
  })

  it.each([
    ["1.234{backspace}", "1.23"],
    ["1.234.567{backspace}", "1.234.56"],
    ["1.500,505", "1.500,505"],
    ["1234.50", "1234.50"],
  ])("never reinterprets the allocation %j: it is rejected and not sent", async (typed, shown) => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Asignado R02")
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

    const campo = await screen.findByLabelText("Asignado R02")
    await user.clear(campo)
    await user.click(campo)
    await user.paste("1.234.567,50")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    await waitFor(() => expect(writes("PUT").length).toBeGreaterThan(0))
    const [, init] = writes("PUT").find(([u]) => String(u).endsWith("/budget"))!
    expect(JSON.parse(String((init as RequestInit).body)).rubros).toContainEqual({ rubro_id: "r2", asignado: "1234567.50" })
  })

  it("rejects an invalid amount locally and does not call the API", async () => {
    const user = userEvent.setup()
    setup()

    const campo = await screen.findByLabelText("Asignado R02")
    await user.clear(campo)
    await user.type(campo, "12abc")
    await user.click(screen.getByRole("button", { name: "Guardar presupuesto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa un monto válido")
    expect(writes("PUT")).toHaveLength(0)
  })

  it("equalizes the project value to Σ A through the existing PATCH", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Igualar valor total a Σ A" }))

    await waitFor(() => expect(writes("PATCH")).toHaveLength(1))
    const [url, init] = writes("PATCH")[0]
    expect(String(url)).toBe("/api/v1/projects/p1")
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ valor_total: 59800000 })
  })

  it("does not offer the equalize button when Σ A already matches the value", async () => {
    setup({ budget: { ...BUDGET, valor_total: "59800000.00", diferencia: "0.00" } })

    await screen.findByTestId("presupuesto-resumen")
    expect(screen.queryByRole("button", { name: "Igualar valor total a Σ A" })).not.toBeInTheDocument()
  })

  it("renders one programming column per project month, with legible months, and the control per rubro", async () => {
    setup()

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["oct 2026", "nov 2026", "dic 2026"]),
    )
    expect(within(grid).getByLabelText("Programado R01 oct 2026")).toHaveValue("20.000.000")
    const fila = within(grid).getAllByTestId("programacion-fila")[0]
    expect(fila).toHaveTextContent("-$ 39.500.000")
  })

  it("flags pending programming and shows the Σ P vs A control as informational", async () => {
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
      expect(screen.queryByRole("button", { name: "Igualar valor total a Σ A" })).not.toBeInTheDocument()
    })

    it("are read-only once the project is out of BORRADOR, even for a manager", async () => {
      setup({ proyecto: { estado: "EN_EJECUCION" }, budget: { ...BUDGET, estado: "EN_EJECUCION" } })

      await screen.findByTestId("presupuesto-tabla")
      expect(screen.queryByLabelText("Asignado R01")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Guardar presupuesto" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Guardar programación" })).not.toBeInTheDocument()
    })
  })
})
