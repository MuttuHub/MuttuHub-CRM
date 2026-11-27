// «Aliados» tile of a posición propia project (S9, S14). The queries and mutations are real; only `fetch` is
// stubbed, routed by URL and method, as in project-team.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectAlly } from "@/hooks/projects"
import { ProjectAllies } from "./project-allies"

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const GOBERNACION: ProjectAlly = {
  id: "a1",
  cliente: { id: "c1", nombre: "Gobernación" },
  rol: "FINANCIADOR",
  estado: "COMPROMETIDO",
  aporte_cop: 1500000,
  created_at: "2026-11-27T10:00:00.000Z",
  updated_at: "2026-11-27T10:00:00.000Z",
}
const CAMARA: ProjectAlly = {
  ...GOBERNACION,
  id: "a2",
  cliente: { id: "c2", nombre: "Cámara de Comercio" },
  rol: "PROSPECTO",
  estado: "EN_GESTION",
  aporte_cop: null,
}

const CLIENTES = [
  { id: "c1", nombre: "Gobernación" },
  { id: "c2", nombre: "Cámara de Comercio" },
  { id: "c3", nombre: "Fundación Norte" },
]

type Setup = {
  rol?: "ADMINISTRADOR" | "GERENCIA" | "COORDINADOR" | "COLABORADOR"
  aliados?: ProjectAlly[]
  post?: Response
  patch?: Response
  del?: Response
  congelado?: boolean
}

describe("ProjectAllies", () => {
  const fetchMock = vi.fn()

  function setup({ rol = "ADMINISTRADOR", aliados = [GOBERNACION], post, patch, del, congelado = false }: Setup = {}) {
    let current = aliados
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      if (url.startsWith("/api/v1/clients?")) {
        return Promise.resolve(jsonResponse({ page: 1, limit: 200, total: CLIENTES.length, items: CLIENTES }))
      }
      if (/\/allies\/[^/]+$/.test(url) && method === "DELETE") {
        if (del) return Promise.resolve(del)
        current = current.filter((a) => a.id !== url.split("/").pop())
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (/\/allies\/[^/]+$/.test(url) && method === "PATCH") {
        if (patch) return Promise.resolve(patch)
        const id = url.split("/").pop()
        const cambios = JSON.parse(String(init?.body)) as Partial<ProjectAlly>
        current = current.map((a) => (a.id === id ? { ...a, ...cambios } : a))
        return Promise.resolve(jsonResponse({ aliado: current.find((a) => a.id === id) }))
      }
      if (url.endsWith("/allies") && method === "POST") {
        if (post) return Promise.resolve(post)
        const body = JSON.parse(String(init?.body)) as Pick<ProjectAlly, "rol" | "estado" | "aporte_cop"> & { cliente_id: string }
        const nuevo: ProjectAlly = {
          ...GOBERNACION,
          id: "a3",
          cliente: CLIENTES.find((c) => c.id === body.cliente_id)!,
          rol: body.rol,
          estado: body.estado,
          aporte_cop: body.aporte_cop,
        }
        current = [...current, nuevo]
        return Promise.resolve(jsonResponse({ aliado: nuevo }, 201))
      }
      if (url.endsWith("/allies")) return Promise.resolve(jsonResponse({ aliados: current }))
      return Promise.resolve(jsonResponse({}, 404))
    })
    return render(<ProjectAllies proyectoId="p1" congelado={congelado} />, { wrapper: createWrapper() })
  }

  function callsWith(method: string) {
    return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method)
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists each ally with its client, rol, estado and aporte in COP", async () => {
    setup({ aliados: [GOBERNACION, CAMARA] })

    const filas = await screen.findAllByTestId("aliado")
    expect(screen.getByRole("heading", { name: "Aliados · 2" })).toBeInTheDocument()
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent("Gobernación")
    expect(filas[0]).toHaveTextContent("Financiador · Comprometido")
    expect(filas[0]).toHaveTextContent("$ 1.500.000")
    expect(filas[1]).toHaveTextContent("Cámara de Comercio")
    expect(filas[1]).toHaveTextContent("Prospecto · En gestión")
    expect(filas[1]).toHaveTextContent("Sin aporte")
  })

  it("shows an empty state when the project has no allies", async () => {
    setup({ aliados: [] })

    expect(await screen.findByText("Este proyecto todavía no tiene aliados.")).toBeInTheDocument()
  })

  it("refuses an aporte it cannot read and accepts the Colombian format", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Gobernación")
    await user.click(await screen.findByRole("combobox", { name: "Cliente aliado" }))
    await user.click(await screen.findByRole("option", { name: "Fundación Norte" }))
    const aporte = screen.getByRole("textbox", { name: "Aporte del nuevo aliado (COP)" })
    await user.type(aporte, "dos millones")
    await user.click(screen.getByRole("button", { name: "Agregar aliado" }))
    expect(await screen.findByText("Escribe el aporte en pesos, sin signos (por ejemplo 2500000).")).toBeInTheDocument()
    expect(callsWith("POST")).toHaveLength(0)

    await user.clear(aporte)
    await user.type(aporte, "$ 1.500.000,50")
    await user.click(screen.getByRole("button", { name: "Agregar aliado" }))
    await waitFor(() => expect(callsWith("POST")).toHaveLength(1))
    expect(JSON.parse(String((callsWith("POST")[0][1] as RequestInit).body))).toMatchObject({ aporte_cop: 1500000.5 })
  })

  it("adds an ally with the chosen client, rol, estado and aporte, and refreshes the list", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Gobernación")
    await user.click(await screen.findByRole("combobox", { name: "Cliente aliado" }))
    // Gobernación is already an ally: it is not offered again.
    await screen.findByRole("option", { name: "Fundación Norte" })
    expect(screen.queryByRole("option", { name: "Gobernación" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: "Fundación Norte" }))
    await user.click(screen.getByRole("combobox", { name: "Rol del nuevo aliado" }))
    await user.click(await screen.findByRole("option", { name: "Financiador" }))
    await user.click(screen.getByRole("combobox", { name: "Estado del nuevo aliado" }))
    await user.click(await screen.findByRole("option", { name: "Comprometido" }))
    await user.type(screen.getByRole("textbox", { name: "Aporte del nuevo aliado (COP)" }), "2500000")
    await user.click(screen.getByRole("button", { name: "Agregar aliado" }))

    await waitFor(() => expect(screen.getAllByTestId("aliado")).toHaveLength(2))
    const [post] = callsWith("POST")
    expect(post[0]).toBe("/api/v1/projects/p1/allies")
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      cliente_id: "c3",
      rol: "FINANCIADOR",
      estado: "COMPROMETIDO",
      aporte_cop: 2500000,
    })
    expect(screen.getAllByTestId("aliado")[1]).toHaveTextContent("$ 2.500.000")
  })

  it("adds an ally without aporte as an Aliado en gestión by default", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Gobernación")
    await user.click(await screen.findByRole("combobox", { name: "Cliente aliado" }))
    await user.click(await screen.findByRole("option", { name: "Fundación Norte" }))
    await user.click(screen.getByRole("button", { name: "Agregar aliado" }))

    await waitFor(() => expect(callsWith("POST")).toHaveLength(1))
    expect(JSON.parse(String((callsWith("POST")[0][1] as RequestInit).body))).toEqual({
      cliente_id: "c3",
      rol: "ALIADO",
      estado: "EN_GESTION",
      aporte_cop: null,
    })
  })

  it("shows the server message inline when adding answers 409", async () => {
    const user = userEvent.setup()
    setup({ post: jsonResponse({ error: "El cliente ya es aliado del proyecto.", code: "CONFLICT" }, 409) })

    await screen.findByText("Gobernación")
    await user.click(await screen.findByRole("combobox", { name: "Cliente aliado" }))
    await user.click(await screen.findByRole("option", { name: "Fundación Norte" }))
    await user.click(screen.getByRole("button", { name: "Agregar aliado" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("El cliente ya es aliado del proyecto.")
  })

  it("edits an ally sending only the fields that changed", async () => {
    const user = userEvent.setup()
    setup()

    const fila = (await screen.findAllByTestId("aliado"))[0]
    await user.click(within(fila).getByRole("button", { name: "Editar a Gobernación" }))
    await user.click(screen.getByRole("combobox", { name: "Estado de Gobernación" }))
    await user.click(await screen.findByRole("option", { name: "Descartado" }))
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(screen.getAllByTestId("aliado")[0]).toHaveTextContent("Financiador · Descartado"))
    const [patch] = callsWith("PATCH")
    expect(patch[0]).toBe("/api/v1/projects/p1/allies/a1")
    expect(JSON.parse(String((patch[1] as RequestInit).body))).toEqual({ estado: "DESCARTADO" })
  })

  it("edits the aporte, and clearing it sends null", async () => {
    const user = userEvent.setup()
    setup()

    const fila = (await screen.findAllByTestId("aliado"))[0]
    await user.click(within(fila).getByRole("button", { name: "Editar a Gobernación" }))
    const aporte = screen.getByRole("textbox", { name: "Aporte de Gobernación (COP)" })
    expect(aporte).toHaveValue("1500000")
    await user.clear(aporte)
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(callsWith("PATCH")).toHaveLength(1))
    expect(JSON.parse(String((callsWith("PATCH")[0][1] as RequestInit).body))).toEqual({ aporte_cop: null })
  })

  it("shows the server message inline when an edit is rejected", async () => {
    const user = userEvent.setup()
    setup({ patch: jsonResponse({ error: "El proyecto está congelado.", code: "CONFLICT" }, 409) })

    const fila = (await screen.findAllByTestId("aliado"))[0]
    await user.click(within(fila).getByRole("button", { name: "Editar a Gobernación" }))
    await user.click(screen.getByRole("combobox", { name: "Rol de Gobernación" }))
    await user.click(await screen.findByRole("option", { name: "Aliado" }))
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("El proyecto está congelado.")
  })

  it("asks for confirmation before removing an ally, then sends DELETE", async () => {
    const user = userEvent.setup()
    setup({ aliados: [GOBERNACION, CAMARA] })

    const fila = (await screen.findAllByTestId("aliado"))[0]
    await user.click(within(fila).getByRole("button", { name: "Quitar a Gobernación" }))
    const dialogo = await screen.findByRole("dialog")
    expect(dialogo).toHaveTextContent("¿Quitar a Gobernación como aliado?")
    expect(callsWith("DELETE")).toHaveLength(0)
    await user.click(within(dialogo).getByRole("button", { name: "Quitar" }))

    await waitFor(() => expect(screen.getAllByTestId("aliado")).toHaveLength(1))
    const [del] = callsWith("DELETE")
    expect(del[0]).toBe("/api/v1/projects/p1/allies/a1")
  })

  it("does not remove the ally when the confirmation is cancelled", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Quitar a Gobernación" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(callsWith("DELETE")).toHaveLength(0)
    expect(screen.getAllByTestId("aliado")).toHaveLength(1)
  })

  it("shows the server message inline when removal fails", async () => {
    const user = userEvent.setup()
    setup({ del: jsonResponse({ error: "El aliado no existe.", code: "NOT_FOUND" }, 404) })

    await user.click(await screen.findByRole("button", { name: "Quitar a Gobernación" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Quitar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("El aliado no existe.")
  })

  it("is read-only for a user who cannot write on the project", async () => {
    setup({ rol: "COORDINADOR" })

    expect(await screen.findByText("Gobernación")).toBeInTheDocument()
    // Wait for the permission to resolve so the absence is not a loading artifact.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/members", expect.any(Object)))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByRole("combobox", { name: "Cliente aliado" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Editar|Quitar|Agregar/ })).not.toBeInTheDocument()
  })

  it("is read-only on a frozen project, even for a manager", async () => {
    setup({ congelado: true })

    expect(await screen.findByText("Gobernación")).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)))
    expect(screen.queryByRole("combobox", { name: "Cliente aliado" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Editar|Quitar|Agregar/ })).not.toBeInTheDocument()
  })
})
