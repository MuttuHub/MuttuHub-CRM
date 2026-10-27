// B7 (S6): changing the project estado from the ficha. The queries and the mutation are real; only
// `fetch` and `sonner` are mocked. The visibility is a convenience: the API is the authority.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EstadoProyecto } from "@prisma/client"
import type { ProjectListRow } from "@/hooks/projects"
import { AvisoCongelado, EstadoProyectoAcciones } from "./estado-proyecto-acciones"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

function proyectoEn(estado: EstadoProyecto): ProjectListRow {
  return {
    id: "p1",
    codigo: "PRY-2026-001",
    nombre: "Fortalecimiento",
    estado,
    origen: "INDEPENDIENTE",
    cliente: { id: "c1", nombre: "Alcaldía" },
    responsable: null,
    fecha_inicio: "2026-10-05",
    fecha_fin: "2027-01-29",
    duracion_semanas: 17,
    valor_total: "100.00",
    diferencia_valor_oportunidad: null,
    alertas: [],
    beneficiarios_meta: 50,
    lineas: [],
    municipios: [],
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("EstadoProyectoAcciones", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function setup(rol: string, cambiar: () => Response = () => jsonResponse({ proyecto: { id: "p1", estado: "SUSPENDIDO" } })) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/api/v1/projects/p1/estado") && init?.method === "POST") return Promise.resolve(cambiar())
      return Promise.resolve(jsonResponse({}))
    })
  }

  const cambios = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/estado")) as [string, RequestInit][]

  async function abrir() {
    await userEvent.click(await screen.findByRole("button", { name: "Cambiar estado" }))
    return screen.findByRole("dialog")
  }

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(["COORDINADOR", "COLABORADOR"])("shows nothing to a %s", async (rol) => {
    setup(rol)
    render(<EstadoProyectoAcciones proyecto={proyectoEn("EN_EJECUCION")} />, { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull()
  })

  it("shows nothing on a cancelled project: no action leaves CANCELADO", async () => {
    setup("GERENCIA")
    render(<EstadoProyectoAcciones proyecto={proyectoEn("CANCELADO")} />, { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull()
  })

  it("offers only the actions valid for the current estado", async () => {
    setup("ADMINISTRADOR")
    render(<EstadoProyectoAcciones proyecto={proyectoEn("EN_EJECUCION")} />, { wrapper })
    const dialogo = await abrir()
    const opciones = within(dialogo).getAllByRole("radio").map((radio) => radio.getAttribute("value"))
    expect(opciones).toEqual(["SUSPENDER", "CERRAR", "CANCELAR"])
  })

  it("requires an action and a motivo before confirming", async () => {
    setup("GERENCIA")
    render(<EstadoProyectoAcciones proyecto={proyectoEn("CERRADO")} />, { wrapper })
    const dialogo = await abrir()
    const confirmar = within(dialogo).getByRole("button", { name: "Confirmar" })
    expect(confirmar).toBeDisabled()
    await userEvent.click(within(dialogo).getByRole("radio", { name: /Reabrir/ }))
    expect(confirmar).toBeDisabled()
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "   ")
    expect(confirmar).toBeDisabled()
  })

  it("posts the accion and the motivo, closes and confirms", async () => {
    setup("GERENCIA")
    render(<EstadoProyectoAcciones proyecto={proyectoEn("EN_EJECUCION")} />, { wrapper })
    const dialogo = await abrir()
    await userEvent.click(within(dialogo).getByRole("radio", { name: /Suspender/ }))
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Sin desembolso del cliente")
    await userEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(cambios()).toHaveLength(1))
    expect(JSON.parse(String(cambios()[0][1].body))).toEqual({
      accion: "SUSPENDER",
      motivo: "Sin desembolso del cliente",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(toast.success).toHaveBeenCalledWith("Proyecto suspendido.")
  })

  it("shows the server's error inline and keeps the dialog open", async () => {
    setup("GERENCIA", () =>
      jsonResponse({ error: "Solo se puede suspender un proyecto en ejecución.", code: "INVALID_STATE" }, 409),
    )
    render(<EstadoProyectoAcciones proyecto={proyectoEn("EN_EJECUCION")} />, { wrapper })
    const dialogo = await abrir()
    await userEvent.click(within(dialogo).getByRole("radio", { name: /Suspender/ }))
    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "x")
    await userEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }))

    expect(await within(dialogo).findByText("Solo se puede suspender un proyecto en ejecución.")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe("AvisoCongelado", () => {
  it.each([
    ["SUSPENDIDO", "Proyecto suspendido: está congelado hasta que Gerencia o Administración lo reactive."],
    ["CERRADO", "Proyecto cerrado: es de solo lectura hasta que Gerencia o Administración lo reabra."],
    ["CANCELADO", "Proyecto cancelado: es de solo lectura."],
  ] as const)("explains a %s project", (estado, texto) => {
    render(<AvisoCongelado estado={estado} />)
    expect(screen.getByRole("status")).toHaveTextContent(texto)
  })

  it("renders nothing for a project that accepts work", () => {
    const { container } = render(<AvisoCongelado estado="EN_EJECUCION" />)
    expect(container).toBeEmptyDOMElement()
  })
})
