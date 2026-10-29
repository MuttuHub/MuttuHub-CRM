// Ficha imprimible del proyecto (F13, RF-32 por impresión del navegador). Las queries son reales; solo se
// burla `fetch`. Se comprueba el contenido de cada bloque, el botón de imprimir y el mensaje de acceso.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectPrintSheet } from "./project-print-sheet"

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
  descripcion: "Acompañamiento a la alcaldía.",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 1200,
  lineas: [],
  municipios: [],
}

const KPIS = {
  base: "vigente", corte: "2026-03-15", estado: "EN_EJECUCION", medible: true, confirmado: true,
  tecnico: { corte: "2026-03-15", avance_real: 42, avance_programado: 55, desviacion_pp: 13, color: "amarillo" },
  cronograma: null, entregables: null, indicadores: null, beneficiarios: null,
  financiero: { corte: "2026-03-15", asignado: "100.00", programado: "50.00", ejecutado: "41.50", ea: 41.5, ep: 83, color: "verde", alerta_retraso: false },
}

const TECNICO = {
  base: "vigente", corte: "2026-03-15", estado: "EN_EJECUCION", avance_real: 42, avance_programado: 55, desviacion_pp: 13, color: "amarillo",
  umbrales: { umbral1: 5, umbral2: 15, confirmado: true },
  actividades: [
    { id: "a1", codigo: "A1", nombre: "Diagnóstico", peso: 1, progreso: 80, estado: "EN_EJECUCION", fecha_cumplimiento: null, objetivo_codigo: "O1", programado: 90, dias: 30, al_corte: 30, color: "verde", sin_soporte: false },
    { id: "a2", codigo: "A2", nombre: "Talleres", peso: 1, progreso: 10, estado: "EN_EJECUCION", fecha_cumplimiento: null, objetivo_codigo: "O2", programado: 40, dias: 30, al_corte: 12, color: "rojo", sin_soporte: true },
  ],
  objetivos: [
    { codigo: "O1", programado: 90, ejecutado: 80, desviacion_pp: 10, color: "verde" },
    { codigo: "O2", programado: 40, ejecutado: 10, desviacion_pp: 30, color: "rojo" },
  ],
}

const OBJETIVOS = [
  { id: "o1", proyecto_id: "p1", codigo: "O1", descripcion: "Conocer el territorio", orden: 1, created_at: "", updated_at: "" },
  { id: "o2", proyecto_id: "p1", codigo: "O2", descripcion: "Formar a la comunidad", orden: 2, created_at: "", updated_at: "" },
]

const HOJA = {
  base: "vigente", corte: "2026-03", estado: "EN_EJECUCION", ejecucion_disponible: true, alerta_retraso: false,
  parametros: { tolerancia: 5, retraso: 10, confirmado: true },
  rubros: [
    { rubro_id: "r1", codigo: "R01", nombre: "Talento humano", asignado: "100000.00", programado: "60000.00", ejecutado: "45000.50", diferencia: "0.00", ep_decimas: 750, ea_decimas: 450, umbral_rojo: "0", color: "verde" },
  ],
  total: { rubro_id: null, codigo: null, nombre: "Total", asignado: "100000.00", programado: "60000.00", ejecutado: "45000.50", diferencia: "0.00", ep_decimas: 750, ea_decimas: 450, umbral_rojo: "0", color: "verde" },
}

describe("ProjectPrintSheet", () => {
  const fetchMock = vi.fn()
  const printMock = vi.fn()

  function mockApi({ proyecto = PROYECTO as unknown, status = 200, kpis = KPIS as unknown } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/api/v1/projects/p1")) {
        return Promise.resolve(
          status === 200
            ? jsonResponse({ proyecto })
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, status),
        )
      }
      if (url.includes("/kpis")) return Promise.resolve(jsonResponse(kpis))
      if (url.includes("/attention")) {
        return Promise.resolve(jsonResponse({ corte: "2026-03-15", medible: true, items: [{ tipo: "actividad_atrasada", titulo: "x", detalle: "A2", actividad_id: "a2" }] }))
      }
      if (url.includes("/technical-status")) return Promise.resolve(jsonResponse(TECNICO))
      if (url.endsWith("/objectives")) return Promise.resolve(jsonResponse({ objetivos: OBJETIVOS }))
      if (url.includes("/financial-sheet")) return Promise.resolve(jsonResponse(HOJA))
      return Promise.resolve(jsonResponse({}))
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    printMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("print", printMock)
    vi.useRealTimers()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("prints the header with code, name, client, estado, dates, value, description and beneficiaries", async () => {
    mockApi()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const encabezado = await screen.findByTestId("imprimir-encabezado")
    expect(encabezado).toHaveTextContent("PRY-2026-001")
    expect(encabezado).toHaveTextContent("Fortalecimiento")
    expect(encabezado).toHaveTextContent("Alcaldía de Barranquilla")
    expect(encabezado).toHaveTextContent("En ejecución")
    expect(encabezado).toHaveTextContent("05 de ene de 2026")
    expect(encabezado).toHaveTextContent("30 de mar de 2026")
    expect(encabezado).toHaveTextContent("$ 180.000.000")
    expect(encabezado).toHaveTextContent("Acompañamiento a la alcaldía.")
    expect(encabezado).toHaveTextContent("Beneficiarios")
    expect(encabezado).toHaveTextContent("1.200")
    expect(screen.getByTestId("imprimir-generado")).toHaveTextContent(/Generado el/)
  })

  it("prints the technical status with real vs planned progress and the cause sentence", async () => {
    mockApi()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const tecnico = await screen.findByTestId("imprimir-tecnico")
    await within(tecnico).findByText(/Avance real 42 % frente a 55 % programado/)
    expect(tecnico).toHaveTextContent("1 actividad atrasada")
    expect(tecnico).toHaveTextContent("Atención")
  })

  it("prints the activities grouped by objective with plan and real percentages", async () => {
    mockApi()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const actividades = await screen.findByTestId("imprimir-actividades")
    const o1 = await within(actividades).findByTestId("imprimir-objetivo-O1")
    expect(o1).toHaveTextContent("Conocer el territorio")
    expect(o1).toHaveTextContent("Diagnóstico")
    expect(o1).toHaveTextContent("90 %")
    expect(o1).toHaveTextContent("80 %")
    const o2 = within(actividades).getByTestId("imprimir-objetivo-O2")
    expect(o2).toHaveTextContent("Talleres")
    expect(o2).toHaveTextContent("40 %")
    expect(o2).toHaveTextContent("10 %")
  })

  it("prints the financial summary per rubro with assigned, programmed and executed", async () => {
    mockApi()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const finanzas = await screen.findByTestId("imprimir-finanzas")
    const fila = await within(finanzas).findByText("Talento humano")
    const row = fila.closest("tr") as HTMLElement
    expect(row).toHaveTextContent("$ 100.000")
    expect(row).toHaveTextContent("$ 60.000")
    expect(row).toHaveTextContent("$ 45.000,50")
    expect(within(finanzas).getByTestId("imprimir-finanzas-total")).toHaveTextContent("$ 45.000,50")
    expect(finanzas).toHaveTextContent("Ejecutado 83 % de lo programado")
  })

  it("has a print button that calls window.print and is hidden when printing", async () => {
    mockApi()
    const user = userEvent.setup()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const boton = await screen.findByRole("button", { name: "Imprimir / Guardar PDF" })
    expect(boton.closest("[data-testid='imprimir-barra']")).toHaveClass("print-hide")
    await user.click(boton)
    expect(printMock).toHaveBeenCalledTimes(1)
  })

  it("has Volver next to the print button, falling back to the project's ficha (S4)", async () => {
    mockApi()

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const volver = await screen.findByRole("link", { name: "Volver" })
    expect(volver).toHaveAttribute("href", "/proyectos/p1")
    expect(volver).not.toHaveAttribute("target")
    expect(volver.closest("[data-testid='imprimir-barra']")).toHaveClass("print-hide")
  })

  it("skips the technical and financial blocks for a draft and says why", async () => {
    mockApi({ proyecto: { ...PROYECTO, estado: "BORRADOR" } })

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    await screen.findByTestId("imprimir-encabezado")
    expect(screen.getByTestId("imprimir-sin-medicion")).toHaveTextContent(/borrador/i)
    expect(screen.queryByTestId("imprimir-tecnico")).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/technical-status"))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/financial-sheet"))).toBe(false)
  })

  it.each([
    [403, "No tienes acceso a este proyecto"],
    [404, "Proyecto no encontrado"],
  ])("shows a readable message when the API answers %s and no sheet", async (status, titulo) => {
    mockApi({ status })

    render(<ProjectPrintSheet projectId="p1" />, { wrapper: createWrapper() })

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent(titulo)
    expect(screen.queryByTestId("imprimir-encabezado")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Imprimir / Guardar PDF" })).not.toBeInTheDocument()
  })
})
