// Carril X · X4: campos de monto de la programación mensual con separador de miles mientras se escribe
// (el valor sigue siendo numérico) y meses legibles («ene 2026», no 2026-01). Las queries son reales;
// solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
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

  it("groups thousands while typing and keeps the control numeric", async () => {
    const user = userEvent.setup()
    setup()

    const celda = await screen.findByLabelText("Programado R01 oct 2026")
    await user.type(celda, "1234567")
    expect(celda).toHaveValue("1.234.567")

    const fila = within(await screen.findByTestId("programacion-grid")).getAllByTestId("programacion-fila")[0]
    expect(fila).toHaveTextContent("-$ 58.265.433")
  })

  it("shows formatted amounts read-only when the user cannot edit", async () => {
    setup({ canEdit: false })

    const grid = await screen.findByTestId("programacion-grid")
    expect(within(grid).queryByRole("textbox")).not.toBeInTheDocument()
    expect(within(grid).getAllByText("$ 0")).toHaveLength(3)
  })
})
