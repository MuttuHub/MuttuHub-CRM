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
  subido_por_id: "u-ana",
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

  // Z3-2: `created_at` is a full ISO timestamp; the row used a calendar-day parser and always showed "—".
  it("shows the upload date of each document", async () => {
    setup()

    const lista = await screen.findByTestId("documentos-lista")
    const fila = within(lista).getAllByTestId("documento-fila")[0]
    expect(fila).toHaveTextContent(/Actividad 1\.1 · Ana · 16 de oct de 2026/)
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

  it("downloads an expense support through its signed URL in the same tab and opens an external link apart", async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    vi.stubGlobal("open", open)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    setup()

    await screen.findByTestId("documentos-lista")

    const factura = within(screen.getByTestId("documentos-grupo-gasto")).getByText("factura-100.pdf").closest("li")!
    await user.click(within(factura).getByRole("button", { name: "Abrir" }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/expenses/gasto-1/attachments/s2/download", expect.any(Object)),
    )
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe("https://s.example/dl?download=")
    expect(open).not.toHaveBeenCalled()

    const convenio = within(screen.getByTestId("documentos-grupo-proyecto")).getByText("convenio-2026.pdf").closest("li")!
    await user.click(within(convenio).getByRole("button", { name: "Abrir" }))
    expect(open).toHaveBeenCalledWith("https://docs.example/convenio", "_blank", "noopener,noreferrer")
    click.mockRestore()
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

describe("FichaDocumentos: project documents (upload, open, delete)", () => {
  const fetchMock = vi.fn()

  type Usuario = { id: string; rol: string }
  const GERENTE: Usuario = { id: "u-ger", rol: "GERENCIA" }
  const COORDINADORA: Usuario = { id: "u-coord", rol: "COORDINADOR" }
  const COLABORADOR: Usuario = { id: "u-col", rol: "COLABORADOR" }

  const PROPIOS: ProjectSupport[] = [
    soporte("a1", "avance", "acta-visita.pdf", { subido_por_id: "u-coord" }),
    soporte("d1", "proyecto", "contrato.pdf", { origen_id: null, subido_por_id: "u-coord" }),
    soporte("d2", "proyecto", "convenio.pdf", { origen_id: null, subido_por_id: "u-ger" }),
  ]

  function setup({
    usuario = GERENTE,
    miembro = false,
    estado = "EN_EJECUCION",
    soportes = PROPIOS,
  }: { usuario?: Usuario; miembro?: boolean; estado?: string; soportes?: ProjectSupport[] } = {}) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url === "/api/v1/auth/me") return Promise.resolve(jsonResponse({ usuario: { ...usuario, nombre: "Yo" } }))
      if (url.endsWith("/members")) {
        const miembros = miembro
          ? [{ id: "m1", usuario: { id: usuario.id, nombre: "Yo", rol: usuario.rol }, agregado_por_id: "x", created_at: "", removed_at: null }]
          : []
        return Promise.resolve(jsonResponse({ miembros }))
      }
      if (url.endsWith("/supports")) return Promise.resolve(jsonResponse({ soportes }))
      if (url.endsWith("/download")) {
        return Promise.resolve(jsonResponse({ tipo: "archivo", url: "https://s.example/doc", expires_in: 60 }))
      }
      if (init?.method === "DELETE") return Promise.resolve(jsonResponse({ soporte: { id: "d1" } }))
      return Promise.resolve(jsonResponse({}))
    })
    return render(<FichaDocumentos proyecto={{ ...PROYECTO, estado } as ProjectListRow} />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("offers «Subir documento» to a manager in an editable estado, also when the list is empty", async () => {
    setup({ soportes: [] })
    expect(await screen.findByRole("button", { name: "Subir documento" })).toBeInTheDocument()
    expect(screen.getByText("Este proyecto todavía no tiene documentos.")).toBeInTheDocument()
  })

  it("opens the upload dialog", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole("button", { name: "Subir documento" }))
    expect(await screen.findByRole("dialog")).toHaveTextContent("Subir documento")
  })

  it.each([
    ["a COLABORADOR", { usuario: COLABORADOR }],
    ["a COORDINADOR who is not a member", { usuario: COORDINADORA }],
    ["a manager on a SUSPENDIDO project (frozen, B7)", { estado: "SUSPENDIDO" }],
    ["a manager on a CERRADO project", { estado: "CERRADO" }],
    ["a manager on a CANCELADO project", { estado: "CANCELADO" }],
  ] as const)("hides «Subir documento» and Eliminar from %s", async (_caso, opciones) => {
    setup(opciones)
    await screen.findByTestId("documentos-lista")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByRole("button", { name: "Subir documento" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Eliminar/ })).not.toBeInTheDocument()
  })

  it("downloads a project file through its own download route, in the same tab (S4)", async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    vi.stubGlobal("open", open)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    setup()

    const fila = (await screen.findByText("contrato.pdf")).closest("li")!
    await user.click(within(fila).getByRole("button", { name: "Abrir" }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/supports/d1/download", expect.any(Object)),
    )
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe("https://s.example/doc?download=")
    expect(open).not.toHaveBeenCalled()
    click.mockRestore()
  })

  it("lets a manager delete any project document, after confirming, and never other origins", async () => {
    const user = userEvent.setup()
    setup()

    const grupo = await screen.findByTestId("documentos-grupo-proyecto")
    await waitFor(() => expect(within(grupo).getAllByRole("button", { name: /^Eliminar/ })).toHaveLength(2))
    expect(within(screen.getByTestId("documentos-grupo-avance")).queryByRole("button", { name: /^Eliminar/ })).not.toBeInTheDocument()

    await user.click(within(grupo).getByRole("button", { name: "Eliminar contrato.pdf" }))
    const dialogo = await screen.findByRole("dialog")
    expect(dialogo).toHaveTextContent("Eliminar documento")
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/projects/p1/supports/d1", expect.anything())
    await user.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/projects/p1/supports/d1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    )
  })

  it("lets a member COORDINADOR delete only their own uploads", async () => {
    setup({ usuario: COORDINADORA, miembro: true })

    const grupo = await screen.findByTestId("documentos-grupo-proyecto")
    expect(await within(grupo).findByRole("button", { name: "Eliminar contrato.pdf" })).toBeInTheDocument()
    expect(within(grupo).queryByRole("button", { name: "Eliminar convenio.pdf" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir documento" })).toBeInTheDocument()
  })
})
