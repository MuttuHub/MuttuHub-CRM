// Pestaña "Equipo" de la ficha (E-07). La query y las mutaciones son reales; solo
// se burla `fetch`, igual que en project-ficha.test.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectTeam } from "./project-team"

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

const CARLA = {
  id: "m1",
  usuario: { id: "u9", nombre: "Carla Ruiz", rol: "COORDINADOR" },
  agregado_por_id: "u1",
  created_at: "2026-10-07T13:00:00.000Z",
  removed_at: null,
}
const DIEGO = { ...CARLA, id: "m2", usuario: { id: "u10", nombre: "Diego Mora", rol: "COORDINADOR" } }

const USERS = [
  { id: "u9", nombre: "Carla Ruiz" },
  { id: "u10", nombre: "Diego Mora" },
  { id: "u11", nombre: "Elena Soto" },
]

type Setup = {
  rol?: "ADMINISTRADOR" | "GERENCIA" | "COORDINADOR"
  miembros?: unknown[]
  membersStatus?: number
  post?: Response
  del?: Response
}

describe("ProjectTeam", () => {
  const fetchMock = vi.fn()

  function setup({ rol = "ADMINISTRADOR", miembros = [CARLA], membersStatus = 200, post, del }: Setup = {}) {
    let current = miembros
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (url.endsWith("/api/v1/auth/me")) {
        return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Ana", rol } }))
      }
      if (url.endsWith("/api/v1/catalogs/users")) {
        return Promise.resolve(jsonResponse({ users: USERS }))
      }
      if (/\/members\/[^/]+$/.test(url) && method === "DELETE") {
        current = current.filter((m) => (m as typeof CARLA).usuario.id !== url.split("/").pop())
        return Promise.resolve(del ?? jsonResponse({ miembro: CARLA }))
      }
      if (url.endsWith("/members") && method === "POST") {
        if (post) return Promise.resolve(post)
        current = [...current, DIEGO]
        return Promise.resolve(jsonResponse({ miembro: DIEGO }, 201))
      }
      if (url.endsWith("/members")) {
        return Promise.resolve(
          membersStatus === 200
            ? jsonResponse({ miembros: current })
            : jsonResponse({ error: "No pudimos cargar el equipo del proyecto.", code: "INTERNAL_ERROR" }, membersStatus),
        )
      }
      return Promise.resolve(jsonResponse({}, 404))
    })
    return render(<ProjectTeam proyectoId="p1" />, { wrapper: createWrapper() })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists the active members with name and role label", async () => {
    setup({ miembros: [CARLA, DIEGO] })

    const items = await screen.findAllByTestId("equipo-integrante")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Carla Ruiz")
    expect(items[0]).toHaveTextContent("Coordinador")
    expect(items[1]).toHaveTextContent("Diego Mora")
  })

  it("shows a loading skeleton while the team loads", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<ProjectTeam proyectoId="p1" />, { wrapper: createWrapper() })

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("shows an empty state when the project has no members", async () => {
    setup({ miembros: [] })

    expect(await screen.findByText("Este proyecto todavía no tiene equipo.")).toBeInTheDocument()
  })

  it("shows a readable error state when the team cannot be loaded", async () => {
    setup({ membersStatus: 500 })

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("No pudimos cargar el equipo del proyecto.")
  })

  it("gives non-managers a read-only list with no controls", async () => {
    setup({ rol: "COORDINADOR" })

    expect(await screen.findByText("Carla Ruiz")).toBeInTheDocument()
    // Wait for the current user to settle so the absence is not a loading artifact.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", expect.any(Object)),
    )
    expect(screen.queryByRole("combobox", { name: "Agregar integrante" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Agregar" })).not.toBeInTheDocument()
  })

  it("lets a manager add a coordinator who is not already a member", async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText("Carla Ruiz")
    await user.click(await screen.findByRole("combobox", { name: "Agregar integrante" }))
    // Carla is already a member: she is not offered again.
    expect(screen.queryByRole("option", { name: "Carla Ruiz" })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("option", { name: "Diego Mora" }))
    await user.click(screen.getByRole("button", { name: "Agregar" }))

    await waitFor(() => expect(screen.getAllByTestId("equipo-integrante")).toHaveLength(2))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(post?.[0]).toBe("/api/v1/projects/p1/members")
    expect(JSON.parse(post?.[1].body)).toEqual({ usuario_id: "u10" })
  })

  it("explains a 409 when the user is already an active member", async () => {
    const user = userEvent.setup()
    setup({
      post: jsonResponse({ error: "El usuario ya es integrante del proyecto.", code: "CONFLICT" }, 409),
    })

    await screen.findByText("Carla Ruiz")
    await user.click(await screen.findByRole("combobox", { name: "Agregar integrante" }))
    await user.click(await screen.findByRole("option", { name: "Diego Mora" }))
    await user.click(screen.getByRole("button", { name: "Agregar" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("El usuario ya es integrante del proyecto.")
  })

  it("explains a 400 when the chosen user is not an active coordinator", async () => {
    const user = userEvent.setup()
    setup({
      post: jsonResponse(
        { error: "Solo un Coordinador puede ser integrante del equipo del proyecto.", code: "VALIDATION_ERROR" },
        400,
      ),
    })

    await screen.findByText("Carla Ruiz")
    await user.click(await screen.findByRole("combobox", { name: "Agregar integrante" }))
    await user.click(await screen.findByRole("option", { name: "Elena Soto" }))
    await user.click(screen.getByRole("button", { name: "Agregar" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("Solo un Coordinador puede ser integrante del equipo del proyecto.")
  })

  it("lets a manager remove a member", async () => {
    const user = userEvent.setup()
    setup({ miembros: [CARLA, DIEGO] })

    const carla = (await screen.findAllByTestId("equipo-integrante"))[0]
    await user.click(within(carla).getByRole("button", { name: "Quitar a Carla Ruiz" }))

    await waitFor(() => expect(screen.getAllByTestId("equipo-integrante")).toHaveLength(1))
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE")
    expect(del?.[0]).toBe("/api/v1/projects/p1/members/u9")
  })

  it("shows the server message when removal fails", async () => {
    const user = userEvent.setup()
    setup({
      del: jsonResponse(
        { error: "El usuario no es integrante activo del equipo del proyecto.", code: "NOT_FOUND" },
        404,
      ),
    })

    await user.click(await screen.findByRole("button", { name: "Quitar a Carla Ruiz" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("El usuario no es integrante activo del equipo del proyecto.")
  })
})
