// Carril X · X4: campos de monto de la programación mensual con separador de miles mientras se escribe
// (el valor sigue siendo numérico) y meses legibles («ene 2026», no 2026-01). Las queries son reales;
// solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { PresupuestoProgramacion } from "./presupuesto-programacion"

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

const PROGRAMMING = {
  estado: "BORRADOR",
  periodos: ["2026-10", "2026-11", "2026-12"],
  filas: [],
  control_por_linea: [
    { linea_id: "l1", actividad: null, rubro_id: "r1", codigo: "R01", nombre: "Personal", asignado: "59500000.00", programado: "0.00", control: "-59500000.00" },
  ],
  control_por_rubro: [
    { rubro_id: "r1", codigo: "R01", nombre: "Personal", asignado: "59500000.00", programado: "0.00", control: "-59500000.00" },
  ],
  programacion_pendiente: true,
  programacion_confirmada: null,
}

// T13 (S7): every line fully programmed and saved, so the Gestor can confirm.
const COMPLETA = {
  ...PROGRAMMING,
  filas: [{ linea_id: "l1", rubro_id: "r1", periodo: "2026-10", valor: "59500000.00" }],
  control_por_linea: [{ ...PROGRAMMING.control_por_linea[0], programado: "59500000.00", control: "0.00" }],
  control_por_rubro: [{ ...PROGRAMMING.control_por_rubro[0], programado: "59500000.00", control: "0.00" }],
  programacion_pendiente: false,
}

// T11 S8: Formación on two activities is programmed as two rows.
const formacion = { rubro_id: "r5", codigo: "R05", nombre: "Formación", programado: "0.00" }
const POR_ACTIVIDAD = {
  ...PROGRAMMING,
  control_por_linea: [
    { linea_id: "lt", actividad: { id: "a11", codigo: "1.1", nombre: "Taller" }, ...formacion, asignado: "15000000.00", control: "-15000000.00" },
    { linea_id: "lf", actividad: { id: "a12", codigo: "1.2", nombre: "Feria" }, ...formacion, asignado: "8000000.00", control: "-8000000.00" },
  ],
  control_por_rubro: [{ ...formacion, asignado: "23000000.00", control: "-23000000.00" }],
}

describe("PresupuestoProgramacion", () => {
  const fetchMock = vi.fn()

  function setup({ canEdit = true, data = PROGRAMMING }: { canEdit?: boolean; data?: unknown } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/programming/confirm")) {
        return Promise.resolve(jsonResponse({ ...(data as object), programacion_confirmada: { at: "2026-11-14T15:00:00.000Z", por_id: "u1" } }))
      }
      if (url.endsWith("/programming")) return Promise.resolve(jsonResponse(data))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<PresupuestoProgramacion proyecto={PROYECTO} canEdit={canEdit} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows legible months in the headers and in the accessible names", async () => {
    setup()

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Actividad",
      "Rubro",
      "oct 2026",
      "nov 2026",
      "dic 2026",
      "Falta por programar",
    ])
    expect(within(grid).getByLabelText("Programado R01 oct 2026")).toBeInTheDocument()
    // T13 (S7): a legacy line sits in its own «Sin actividad» group.
    expect(within(grid).getByRole("button", { name: "Sin actividad" })).toHaveAttribute("aria-expanded", "true")
  })

  it("S8: programs each activity line of a rubro apart and saves the cells on their own line", async () => {
    const user = userEvent.setup()
    setup({ data: POR_ACTIVIDAD })

    const grid = await screen.findByTestId("programacion-grid")
    const filas = within(grid).getAllByTestId("programacion-fila")
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent("1.1 Taller")
    expect(filas[1]).toHaveTextContent("1.2 Feria")

    await user.type(within(grid).getByLabelText("Programado 1.1 R05 oct 2026"), "15000000")
    await user.type(within(grid).getByLabelText("Programado 1.2 R05 nov 2026"), "8000000")
    await user.click(screen.getByRole("button", { name: "Guardar programación" }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(true))
    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT")!
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({
      filas: [
        { linea_id: "lt", periodo: "2026-10", valor: "15000000.00" },
        { linea_id: "lf", periodo: "2026-11", valor: "8000000.00" },
      ],
    })
  })

  it("keeps the typed text while focused and groups thousands on blur", async () => {
    const user = userEvent.setup()
    setup()

    const celda = await screen.findByLabelText("Programado R01 oct 2026")
    await user.type(celda, "1234567")
    expect(celda).toHaveValue("1234567")
    await user.tab()
    expect(celda).toHaveValue("1.234.567")

    const fila = within(await screen.findByTestId("programacion-grid")).getAllByTestId("programacion-fila")[0]
    // Falta por programar = asignado − programado: 59.500.000 − 1.234.567.
    expect(fila).toHaveTextContent("$ 58.265.433")
    expect(fila).not.toHaveTextContent("-$")
  })

  it("shows «Falta por programar» as assigned minus programmed, negative when over-programmed (U4)", async () => {
    const user = userEvent.setup()
    setup()

    const celda = await screen.findByLabelText("Programado R01 oct 2026")
    await user.type(celda, "60000000")
    await user.tab()
    const fila = within(await screen.findByTestId("programacion-grid")).getAllByTestId("programacion-fila")[0]
    expect(fila).toHaveTextContent("-$ 500.000")
    expect(screen.getByText(/Falta por programar/, { selector: "p" })).toHaveTextContent(/quede en \$ 0 en todas las líneas/)
    expect(screen.queryByText(/Σ/)).not.toBeInTheDocument()
  })

  // Lo que el usuario ve y lo que se calcula nunca difiere: un borrado no puede cambiar el valor.
  it.each([
    ["1234", "1.234", "1234"],
    ["1234{backspace}", "123", "123"],
    ["1.234{backspace}", "1.23", null],
    ["1.234.567{backspace}", "1.234.56", null],
    ["1234567,50", "1.234.567,50", "1234567.50"],
    ["1.234.567,50", "1.234.567,50", "1234567.50"],
    ["1.500,505", "1.500,505", null],
    ["1234.50", "1234.50", null],
    ["12abc", "12abc", null],
    ["-5", "-5", null],
  ])("typing %j shows %j after blur and submits %j", async (typed, shown, submitted) => {
    const user = userEvent.setup()
    setup()

    const celda = await screen.findByLabelText("Programado R01 nov 2026")
    await user.type(celda, typed)
    await user.tab()
    expect(celda).toHaveValue(shown)

    await user.click(screen.getByRole("button", { name: "Guardar programación" }))
    if (submitted === null) {
      expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa un monto válido")
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false)
      return
    }
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(true))
    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT")!
    expect(JSON.parse(String((put[1] as RequestInit).body)).filas).toContainEqual(
      expect.objectContaining({ periodo: "2026-11", valor: expect.stringMatching(/^\d+\.\d{2}$/) }),
    )
    const enviado = JSON.parse(String((put[1] as RequestInit).body)).filas.find((f: { periodo: string }) => f.periodo === "2026-11")
    expect(enviado.valor).toBe(Number(submitted).toFixed(2))
  })

  it("T13 (S7): shows the totals by rubro and by month on top, one row per rubro across its activities", async () => {
    // «… con arriba los totales por rubro y por mes.»
    setup({
      data: {
        ...POR_ACTIVIDAD,
        filas: [
          { linea_id: "lt", rubro_id: "r5", periodo: "2026-10", valor: "15000000.00" },
          { linea_id: "lf", rubro_id: "r5", periodo: "2026-10", valor: "5000000.00" },
          { linea_id: "lf", rubro_id: "r5", periodo: "2026-11", valor: "3000000.00" },
        ],
      },
    })
    const totales = await screen.findByTestId("programacion-totales")
    expect(within(totales).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Rubro",
      "oct 2026",
      "nov 2026",
      "dic 2026",
      "Total",
    ])
    const filas = within(totales).getAllByRole("row").slice(1)
    expect(filas.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["R05 Formación", "$ 20.000.000", "$ 3.000.000", "$ 0", "$ 23.000.000"],
      ["Total", "$ 20.000.000", "$ 3.000.000", "$ 0", "$ 23.000.000"],
    ])
  })

  it("T13 (S7): editing a month updates the totals on top before saving", async () => {
    // «Al editar un mes, el total por rubro y por mes de arriba se actualiza.»
    const user = userEvent.setup()
    setup({ data: POR_ACTIVIDAD })
    const grid = await screen.findByTestId("programacion-grid")
    await user.type(within(grid).getByLabelText("Programado 1.2 R05 dic 2026"), "4000000")
    const total = within(screen.getByTestId("programacion-totales")).getAllByRole("row").at(-1)!
    expect(within(total).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Total",
      "$ 0",
      "$ 0",
      "$ 4.000.000",
      "$ 4.000.000",
    ])
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "PUT")).toBe(false)
  })

  it("T13 (S7): groups the lines by activity in groups that collapse and expand", async () => {
    // «… en una pantalla agrupada por actividad (grupos que se pliegan y despliegan) …»
    const user = userEvent.setup()
    setup({ data: POR_ACTIVIDAD })
    const grid = await screen.findByTestId("programacion-grid")
    const grupo = within(grid).getByRole("button", { name: /1\.1 Taller/ })
    expect(grupo).toHaveAttribute("aria-expanded", "true")
    expect(within(grid).getByLabelText("Programado 1.1 R05 oct 2026")).toBeInTheDocument()

    await user.click(grupo)
    expect(grupo).toHaveAttribute("aria-expanded", "false")
    expect(within(grid).queryByLabelText("Programado 1.1 R05 oct 2026")).not.toBeInTheDocument()
    // The other activity stays open, and a collapsed group keeps its typed values.
    expect(within(grid).getByLabelText("Programado 1.2 R05 oct 2026")).toBeInTheDocument()
    await user.click(grupo)
    expect(within(grid).getByLabelText("Programado 1.1 R05 oct 2026")).toBeInTheDocument()
  })

  it("T13 (S7): confirms only a fully programmed, saved programming, and then shows it confirmed", async () => {
    const user = userEvent.setup()
    setup({ data: COMPLETA })

    const confirmar = await screen.findByRole("button", { name: "Confirmar programación" })
    expect(confirmar).toBeEnabled()

    // An unsaved edit disables it: what is confirmed is what is saved.
    const celda = screen.getByLabelText("Programado R01 oct 2026")
    await user.clear(celda)
    await user.type(celda, "59000000")
    expect(confirmar).toBeDisabled()
    await user.clear(celda)
    await user.type(celda, "59500000")
    expect(confirmar).toBeEnabled()

    await user.click(confirmar)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/programming/confirm") && (init as RequestInit)?.method === "POST")).toBe(true),
    )
  })

  it("T13 (S7): cannot confirm while a line has a value pending to program", async () => {
    setup()
    expect(await screen.findByRole("button", { name: "Confirmar programación" })).toBeDisabled()
    expect(screen.getByText(/Confirma la programación cuando «Falta por programar» quede en \$ 0 en todas las líneas/)).toBeInTheDocument()
  })

  it("T13 (S7): shows a confirmed programming, without the confirm button", async () => {
    setup({ data: { ...COMPLETA, programacion_confirmada: { at: "2026-11-14T15:00:00.000Z", por_id: "u1" } } })
    expect(await screen.findByText("Programación confirmada")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Confirmar programación" })).not.toBeInTheDocument()
  })

  it("shows formatted amounts read-only when the user cannot edit", async () => {
    setup({ canEdit: false })

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(grid).getAllByText("$ 0")).toHaveLength(3)
  })
})
