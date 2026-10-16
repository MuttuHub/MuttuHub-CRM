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
  control_por_rubro: [
    { rubro_id: "r1", codigo: "R01", nombre: "Personal", asignado: "59500000.00", programado: "0.00", control: "-59500000.00" },
  ],
  programacion_pendiente: true,
}

describe("PresupuestoProgramacion", () => {
  const fetchMock = vi.fn()

  function setup({ canEdit = true }: { canEdit?: boolean } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/programming")) return Promise.resolve(jsonResponse(PROGRAMMING))
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
      "Rubro",
      "oct 2026",
      "nov 2026",
      "dic 2026",
      "Control",
    ])
    expect(within(grid).getByLabelText("Programado R01 oct 2026")).toBeInTheDocument()
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
    expect(fila).toHaveTextContent("-$ 58.265.433")
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

  it("shows formatted amounts read-only when the user cannot edit", async () => {
    setup({ canEdit: false })

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(grid).getAllByText("$ 0")).toHaveLength(3)
  })
})
