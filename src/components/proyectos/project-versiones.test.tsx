// S8 U6: sección "Versiones" (lista + comparación v0 vs vigente). Las queries son reales; solo se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectVersiones } from "./project-versiones"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

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
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "177360000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 500,
  lineas: [],
  municipios: [],
}

const VERSIONES = [
  { numero: 1, tipo: "MODIFICACION", aprobado_at: "2026-10-20T15:00:00.000Z", aprobado_por: { id: "g1", nombre: "Gina Gerente" }, motivo: "Mover transporte a dotación", solicitud_id: "s1" },
  { numero: 0, tipo: "LINEA_BASE", aprobado_at: "2026-10-08T15:00:00.000Z", aprobado_por: { id: "g1", nombre: "Gina Gerente" }, motivo: null, solicitud_id: null },
]

const DIFERENCIAS = [
  { elemento: "presupuesto", clave: "R12", campo: "asignado", desde: "24000000.00", hasta: "23000000.00" },
  { elemento: "presupuesto", clave: "R13", campo: "asignado", desde: "12800000.00", hasta: "13800000.00" },
  { elemento: "programacion", clave: "R12|2027-01", campo: "valor", desde: "6000000.00", hasta: "5000000.00" },
  { elemento: "actividad", clave: "1.4", campo: "semana_fin", desde: "6", hasta: "8" },
  { elemento: "indicador", clave: "IND-03", campo: "existencia", desde: null, hasta: "presente" },
]

describe("ProjectVersiones", () => {
  const fetchMock = vi.fn()

  function setup({ proyecto = {}, versiones = VERSIONES as unknown, compare = { desde: "0", hasta: "vigente", diferencias: DIFERENCIAS } as unknown, versionesStatus = 200 } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.includes("/versions/compare")) return Promise.resolve(jsonResponse(compare))
      if (url.endsWith("/versions")) {
        return Promise.resolve(
          versionesStatus === 200
            ? jsonResponse({ versiones })
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, versionesStatus),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectVersiones proyecto={{ ...PROYECTO, ...proyecto }} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("says the baseline is not approved yet for a BORRADOR project, and reads nothing", () => {
    setup({ proyecto: { estado: "BORRADOR" } })

    expect(screen.getByTestId("versiones")).toHaveTextContent("Versiones")
    expect(screen.getByText("La línea base aún no está aprobada.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lists each version with its number, type, date, approver and motivo", async () => {
    setup()

    const tabla = await screen.findByTestId("versiones-tabla")
    const filas = within(tabla).getAllByTestId("version-fila")
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent("v1")
    expect(filas[0]).toHaveTextContent("Modificación")
    expect(filas[0]).toHaveTextContent("Gina Gerente")
    expect(filas[0]).toHaveTextContent("Mover transporte a dotación")
    expect(filas[1]).toHaveTextContent("v0")
    expect(filas[1]).toHaveTextContent("Línea base")
    expect(filas[1]).toHaveTextContent("—")
  })

  it("compares v0 against the vigente by default, grouped by element, with money formatted", async () => {
    setup()

    const comparacion = await screen.findByTestId("versiones-diferencias")
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/compare?from=0&to=vigente", expect.any(Object))
    expect(screen.getByRole("combobox", { name: "Desde" })).toHaveValue("0")
    expect(screen.getByRole("combobox", { name: "Hasta" })).toHaveValue("vigente")

    const grupos = within(comparacion).getAllByTestId("diferencias-grupo")
    expect(grupos.map((g) => g.getAttribute("data-elemento"))).toEqual(["presupuesto", "programacion", "actividad", "indicador"])
    expect(grupos[0]).toHaveTextContent("Presupuesto")
    expect(grupos[0]).toHaveTextContent("R12")
    expect(grupos[0]).toHaveTextContent("$ 24.000.000")
    expect(grupos[0]).toHaveTextContent("$ 23.000.000")
    expect(grupos[1]).toHaveTextContent("R12 · 2027-01")
    expect(grupos[1]).toHaveTextContent("$ 5.000.000")
    expect(grupos[2]).toHaveTextContent("Semana final")
    expect(grupos[2]).toHaveTextContent("6")
    expect(grupos[2]).toHaveTextContent("8")
    expect(grupos[3]).toHaveTextContent("Aparece")
  })

  it("refetches when another version is chosen and shows the empty comparison", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByTestId("versiones-diferencias")

    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(String(input).includes("/versions/compare") ? jsonResponse({ desde: "0", hasta: "0", diferencias: [] }) : jsonResponse({ versiones: VERSIONES })),
    )
    await user.selectOptions(screen.getByRole("combobox", { name: "Hasta" }), "0")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/compare?from=0&to=0", expect.any(Object)),
    )
    expect(await screen.findByText("Las dos versiones son iguales.")).toBeInTheDocument()
  })

  it("shows the API error inline when the versions cannot be read", async () => {
    setup({ versionesStatus: 403 })

    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos sobre este proyecto.")
    expect(screen.queryByTestId("versiones-tabla")).not.toBeInTheDocument()
  })
})
