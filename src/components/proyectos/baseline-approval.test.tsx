// Aprobación de la línea base (S8 U3). Las queries y la mutación son reales; solo se burlan `fetch` y
// `sonner`. La visibilidad del botón es comodidad: la autoridad es la API.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { BaselineApproval } from "./baseline-approval"

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("sonner", () => ({ toast }))

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "BORRADOR",
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

const PRECONDICIONES = [
  { codigo: "SIN_OBJETIVOS", mensaje: "El proyecto no tiene objetivos." },
  { codigo: "SUMA_DISTINTA_VALOR_TOTAL", mensaje: "La suma del presupuesto no es igual al valor total del proyecto." },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("BaselineApproval", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function setup(rol: string, approve: () => Response = () => jsonResponse({}, 201)) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/baseline/approve") && init?.method === "POST") return Promise.resolve(approve())
      return Promise.resolve(jsonResponse({}))
    })
  }

  const approvals = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/baseline/approve")) as [string, RequestInit][]

  beforeEach(() => {
    fetchMock.mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("shows the button to ADM/GER on a Borrador project", async () => {
    setup("GERENCIA")
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    expect(await screen.findByRole("button", { name: "Aprobar línea base" })).toBeInTheDocument()
  })

  it("hides it from a COORDINADOR", async () => {
    setup("COORDINADOR")
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByRole("button", { name: "Aprobar línea base" })).not.toBeInTheDocument()
  })

  it("renders nothing, and asks for nothing, once the project is no longer Borrador", () => {
    setup("GERENCIA")
    render(<BaselineApproval proyecto={{ ...PROYECTO, estado: "EN_EJECUCION" }} />, { wrapper })
    expect(screen.queryByRole("button", { name: "Aprobar línea base" })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks for confirmation explaining what freezes, and POSTs on confirm", async () => {
    setup("ADMINISTRADOR")
    const user = userEvent.setup()
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    await user.click(await screen.findByRole("button", { name: "Aprobar línea base" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/quedan congelados \(versión 0\)/)).toBeInTheDocument()
    expect(approvals()).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(approvals()).toHaveLength(1))
    expect(approvals()[0][0]).toBe("/api/v1/projects/p1/baseline/approve")
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Línea base aprobada."))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("lists every failed precondition inline on a 409, without a toast, and keeps the dialog open", async () => {
    setup("GERENCIA", () =>
      jsonResponse(
        { error: "La línea base no se puede aprobar: hay precondiciones sin cumplir.", code: "INVALID_STATE", precondiciones: PRECONDICIONES },
        409,
      ),
    )
    const user = userEvent.setup()
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    await user.click(await screen.findByRole("button", { name: "Aprobar línea base" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Aprobar" }))

    const lista = await within(dialog).findByTestId("baseline-precondiciones")
    expect(within(lista).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      PRECONDICIONES.map((p) => p.mensaje),
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("shows the server message inline for any other failure", async () => {
    setup("GERENCIA", () => jsonResponse({ error: "El proyecto ya tiene línea base aprobada.", code: "INVALID_STATE" }, 409))
    const user = userEvent.setup()
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    await user.click(await screen.findByRole("button", { name: "Aprobar línea base" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Aprobar" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("El proyecto ya tiene línea base aprobada.")
  })

  it("invalidates the project, budget, structure and execution queries after approving", async () => {
    setup("GERENCIA")
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const user = userEvent.setup()
    render(<BaselineApproval proyecto={PROYECTO} />, { wrapper })
    await user.click(await screen.findByRole("button", { name: "Aprobar línea base" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const keys = spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
    for (const expected of [
      ["projects", "detail", "p1"],
      ["projects", "budget", "p1"],
      ["projects", "objectives", "p1"],
      ["projects", "technical-status", "p1"],
      ["projects", "versions", "p1"],
      ["projects", "list"],
    ]) {
      expect(keys).toContain(JSON.stringify(expected))
    }
  })
})
