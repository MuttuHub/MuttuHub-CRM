// Carril X · X5: pestaña "Documentos" de la ficha. Una sola lista de todos los soportes del proyecto,
// agrupada por origen, con filtro por origen y buscador por nombre. Las queries son reales; solo se
// burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow, ProjectSupport } from "@/hooks/projects"
import { FichaDocumentos } from "./ficha-documentos"

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

const soporte = (id: string, origen: ProjectSupport["origen"], nombre: string, over: Partial<ProjectSupport> = {}): ProjectSupport => ({
  id,
  nombre,
  tipo: "archivo",
  tipo_mime: "application/pdf",
  tamano_bytes: 100,
  origen,
  origen_id: `${origen}-1`,
  vinculo: null,
  url_externa: null,
  subido_por: "Ana",
  created_at: "2026-10-16T12:00:00.000Z",
  ...over,
})

const SOPORTES: ProjectSupport[] = [
  soporte("s1", "avance", "acta-visita.pdf", { vinculo: "Actividad 1.1" }),
  soporte("s2", "gasto", "factura-100.pdf"),
  soporte("s3", "indicador", "medicion-octubre.xlsx", { tipo_mime: "application/vnd.ms-excel" }),
  soporte("s4", "proyecto", "convenio-2026.pdf", {
    tipo: "enlace",
    origen_id: null,
    url_externa: "https://docs.example/convenio",
  }),
]

describe("FichaDocumentos", () => {
  const fetchMock = vi.fn()

  function setup({ soportes = SOPORTES, status = 200, pendiente = false }: { soportes?: ProjectSupport[] | null; status?: number; pendiente?: boolean } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/supports")) {
        if (pendiente) return new Promise(() => {})
        return Promise.resolve(
          status === 200 ? jsonResponse({ soportes }) : jsonResponse({ error: "Falló el servidor." }, status),
        )
      }
      if (url.includes("/attachments/")) {
        return Promise.resolve(jsonResponse({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 }))
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<FichaDocumentos proyecto={PROYECTO} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("groups every support by origin, in a single list", async () => {
    setup()

    await screen.findByTestId("documentos-lista")
    const grupos = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)
    expect(grupos).toEqual(["Actividades", "Indicadores", "Gastos", "Proyecto"])

    const actividades = screen.getByTestId("documentos-grupo-avance")
    expect(within(actividades).getByText("acta-visita.pdf")).toBeInTheDocument()
    expect(within(screen.getByTestId("documentos-grupo-gasto")).getByText("factura-100.pdf")).toBeInTheDocument()
    expect(within(screen.getByTestId("documentos-grupo-indicador")).getByText("medicion-octubre.xlsx")).toBeInTheDocument()
    expect(within(screen.getByTestId("documentos-grupo-proyecto")).getByText("convenio-2026.pdf")).toBeInTheDocument()

    expect(screen.getAllByTestId("documento-fila")).toHaveLength(4)
  })

  it("filters by origin and hides the groups left empty", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByTestId("documentos-lista")
    await user.click(screen.getByRole("button", { name: "Gastos" }))

    expect(screen.getByText("factura-100.pdf")).toBeInTheDocument()
    expect(screen.queryByText("acta-visita.pdf")).not.toBeInTheDocument()
    expect(screen.queryByTestId("documentos-grupo-avance")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Gastos" })).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Todos" }))
    expect(screen.getAllByTestId("documento-fila")).toHaveLength(4)
  })

  it("searches by name, ignoring case", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByTestId("documentos-lista")
    await user.type(screen.getByLabelText("Buscar por nombre"), "FACTURA")

    expect(screen.getAllByTestId("documento-fila")).toHaveLength(1)
    expect(screen.getByText("factura-100.pdf")).toBeInTheDocument()
    expect(screen.queryByTestId("documentos-grupo-avance")).not.toBeInTheDocument()
  })

  it("says so when the search or the filter leaves nothing", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByTestId("documentos-lista")
    await user.type(screen.getByLabelText("Buscar por nombre"), "no-existe")

    expect(screen.getByText("No hay documentos con este filtro.")).toBeInTheDocument()
    expect(screen.queryByTestId("documento-fila")).not.toBeInTheDocument()
  })

  it("shows the empty state when the project has no supports", async () => {
    setup({ soportes: [] })

    expect(await screen.findByText("Este proyecto todavía no tiene documentos.")).toBeInTheDocument()
    expect(screen.queryByTestId("documentos-lista")).not.toBeInTheDocument()
  })

  it("shows the API error inline and a skeleton while loading", async () => {
    const { unmount } = setup({ status: 500 })
    expect(await screen.findByRole("alert")).toHaveTextContent("Falló el servidor.")
    unmount()

    setup({ pendiente: true })
    expect(screen.getByTestId("documentos-cargando")).toBeInTheDocument()
  })

  it("opens an expense support through its signed URL and an external link directly", async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    vi.stubGlobal("open", open)
    setup()

    await screen.findByTestId("documentos-lista")

    const factura = within(screen.getByTestId("documentos-grupo-gasto")).getByText("factura-100.pdf").closest("li")!
    await user.click(within(factura).getByRole("button", { name: "Abrir" }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/gasto-1/attachments/s2/download", expect.any(Object)),
    )
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://s.example/dl", "_blank", "noopener,noreferrer"))

    const convenio = within(screen.getByTestId("documentos-grupo-proyecto")).getByText("convenio-2026.pdf").closest("li")!
    await user.click(within(convenio).getByRole("button", { name: "Abrir" }))
    expect(open).toHaveBeenCalledWith("https://docs.example/convenio", "_blank", "noopener,noreferrer")
  })

  it("disables Abrir for an indicator without a link (enough to read its metadata)", async () => {
    setup()

    const grupo = await screen.findByTestId("documentos-grupo-indicador")
    expect(within(grupo).getByRole("button", { name: "Abrir" })).toBeDisabled()
  })

  it.each([
    ["proyecto", { tipo: "enlace", origen_id: null, url_externa: null }],
    ["avance", { origen_id: null, url_externa: null }],
    ["gasto", { origen_id: null, url_externa: null }],
  ] as const)("disables Abrir for a %s support with nothing to open", async (origen, over) => {
    setup({ soportes: [soporte("x1", origen, "sin-nada.pdf", over)] })

    const fila = (await screen.findByText("sin-nada.pdf")).closest("li")!
    expect(within(fila).getByRole("button", { name: "Abrir" })).toBeDisabled()
  })
})
