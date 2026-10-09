// S5 U6: sección "Ficha financiera". Las queries son reales; solo se burla
// `fetch`. El color llega del servidor y se pinta verbatim.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectFinanciero } from "./project-financiero"

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

// F-F1 at corte 2026-11 (map section 4).
const FICHA = {
  base: "vigente",
  corte: "2026-11",
  estado: "EN_EJECUCION",
  ejecucion_disponible: true,
  rubros: [
    {
      rubro_id: "r1", codigo: "R01", nombre: "Personal",
      asignado: "59500000.00", programado: "29750000.00", ejecutado: "27000000.00", diferencia: "-2750000.00",
      ep_decimas: 908, ea_decimas: 454, umbral_rojo: "32725000.00", color: "verde",
    },
    {
      rubro_id: "r12", codigo: "R12", nombre: "Transporte",
      asignado: "24000000.00", programado: "12000000.00", ejecutado: "13500000.00", diferencia: "1500000.00",
      ep_decimas: 1125, ea_decimas: 563, umbral_rojo: "13200000.00", color: "rojo",
    },
  ],
  total: {
    rubro_id: null, codigo: null, nombre: "Total",
    asignado: "83500000.00", programado: "41750000.00", ejecutado: "40500000.00", diferencia: "-1250000.00",
    ep_decimas: 970, ea_decimas: 485, umbral_rojo: "45925000.00", color: "verde",
  },
  alerta_retraso: false,
  parametros: { tolerancia: 10, retraso: 70, confirmado: true },
}

const SIN_GASTOS = {
  ...FICHA,
  ejecucion_disponible: false,
  rubros: FICHA.rubros.map((r) => ({ ...r, ejecutado: "0.00", ep_decimas: null, ea_decimas: null, color: null })),
  total: { ...FICHA.total, ejecutado: "0.00", ep_decimas: null, ea_decimas: null, color: null },
}

describe("ProjectFinanciero", () => {
  const fetchMock = vi.fn()

  function setup({ ficha = FICHA as unknown, status = 200, proyecto = {} }: { ficha?: unknown; status?: number; proyecto?: Partial<ProjectListRow> } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/financial-sheet")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse(ficha)
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, status),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectFinanciero proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders A, P, E, D, percentages and the API color of each rubro plus the total row", async () => {
    setup()

    const tabla = await screen.findByTestId("financiero-tabla")
    const filas = within(tabla).getAllByTestId("financiero-fila")
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent("R01")
    expect(filas[0]).toHaveTextContent("$ 59.500.000")
    expect(filas[0]).toHaveTextContent("$ 29.750.000")
    expect(filas[0]).toHaveTextContent("$ 27.000.000")
    expect(filas[0]).toHaveTextContent("-$ 2.750.000")
    expect(filas[0]).toHaveTextContent("90,8 %")
    expect(filas[0]).toHaveTextContent("45,4 %")
    expect(filas[0]).toHaveTextContent("$ 32.725.000")
    expect(filas[0].querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
    expect(filas[1].querySelector("[data-color]")).toHaveAttribute("data-color", "rojo")
    expect(filas[1]).toHaveTextContent("112,5 %")

    const total = within(tabla).getByTestId("financiero-total")
    expect(total).toHaveTextContent("Total")
    expect(total).toHaveTextContent("$ 83.500.000")
    expect(total).toHaveTextContent("97,0 %")
    expect(total.querySelector("[data-color]")).toHaveAttribute("data-color", "verde")
  })

  it("paints the color the API sent, even if it contradicts the numbers", async () => {
    setup({ ficha: { ...FICHA, total: { ...FICHA.total, color: "amarillo" } } })

    const total = await screen.findByTestId("financiero-total")
    expect(total.querySelector("[data-color]")).toHaveAttribute("data-color", "amarillo")
  })

  it("explains that expenses are not available yet and renders no colors, percentages or alert", async () => {
    setup({ ficha: SIN_GASTOS })

    expect(await screen.findByText("Ejecución disponible cuando se registren gastos")).toBeInTheDocument()
    const tabla = screen.getByTestId("financiero-tabla")
    expect(tabla.querySelector("[data-color]")).toBeNull()
    expect(within(tabla).getAllByTestId("financiero-fila")[0]).toHaveTextContent("$ 29.750.000")
    expect(screen.queryByTestId("financiero-alerta")).not.toBeInTheDocument()
  })

  it("shows the 'No confirmado' badge while the thresholds are unconfirmed", async () => {
    setup({ ficha: { ...FICHA, parametros: { tolerancia: 10, retraso: 70, confirmado: false } } })

    expect(await screen.findByText("No confirmado")).toBeInTheDocument()
  })

  it("does not show it once confirmed", async () => {
    setup()

    await screen.findByTestId("financiero-tabla")
    expect(screen.queryByText("No confirmado")).not.toBeInTheDocument()
  })

  it("shows the possible-delay alert only when the API raises it", async () => {
    const { unmount } = setup({ ficha: { ...FICHA, alerta_retraso: true } })

    expect(await screen.findByTestId("financiero-alerta")).toHaveTextContent(
      "Posible retraso: el gasto va por debajo de lo programado y el avance técnico está atrasado.",
    )
    unmount()
    setup()
    await screen.findByTestId("financiero-tabla")
    expect(screen.queryByTestId("financiero-alerta")).not.toBeInTheDocument()
  })

  it("offers one corte per project month and refetches when it changes", async () => {
    const user = userEvent.setup()
    setup()

    const corte = await screen.findByRole("combobox", { name: "Corte" })
    expect(within(corte).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "2026-10", "2026-11", "2026-12", "2027-01",
    ])

    await user.selectOptions(corte, "2026-12")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/financial-sheet?corte=2026-12", expect.any(Object)),
    )
  })

  it("keeps the base selector disabled while the baseline is not approved (BORRADOR)", async () => {
    setup({ proyecto: { estado: "BORRADOR" } })

    const base = await screen.findByRole("combobox", { name: "Base" })
    expect(base).toBeDisabled()
    expect(within(base).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["vigente"])
  })

  it("lets an approved project read the original (v0): it refetches with base=original and keeps the corte", async () => {
    const user = userEvent.setup()
    setup()

    const base = await screen.findByRole("combobox", { name: "Base" })
    expect(base).toBeEnabled()
    expect(within(base).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["vigente", "original"])
    await screen.findByTestId("financiero-tabla")

    await user.selectOptions(screen.getByRole("combobox", { name: "Corte" }), "2026-12")
    await user.selectOptions(base, "original")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/projects/p1/financial-sheet?corte=2026-12&base=original",
        expect.any(Object),
      ),
    )
    expect(base).toHaveValue("original")
  })

  it("shows the 409 of an original that does not exist yet, inline", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(
        String(input).includes("base=original")
          ? jsonResponse({ error: "La versión original aún no existe.", code: "INVALID_STATE" }, 409)
          : jsonResponse(FICHA),
      ),
    )
    render(<ProjectFinanciero proyecto={PROYECTO} />, { wrapper: createWrapper() })

    await user.selectOptions(await screen.findByRole("combobox", { name: "Base" }), "original")
    expect(await screen.findByRole("alert")).toHaveTextContent("La versión original aún no existe.")
  })

  it("renders no expense, support or third-party rows", async () => {
    setup()

    const seccion = await screen.findByTestId("financiero")
    await screen.findByTestId("financiero-tabla")
    for (const termino of [/soporte/i, /tercero/i, /proveedor/i, /factura/i]) {
      expect(seccion).not.toHaveTextContent(termino)
    }
  })

  it("shows the API error for a role that cannot read it", async () => {
    setup({ status: 403 })

    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos sobre este proyecto.")
    expect(screen.queryByTestId("financiero-tabla")).not.toBeInTheDocument()
  })

  it("asks for the project dates when they are missing, without reading the sheet", () => {
    setup({ proyecto: { fecha_inicio: null, fecha_fin: null } })

    expect(screen.getByText(/fechas de inicio y fin/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/financial-sheet"))).toBe(false)
  })
})
