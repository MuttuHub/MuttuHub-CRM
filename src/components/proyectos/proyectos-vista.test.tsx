// S9 U6: las dos vistas de /proyectos (Portafolio, Tablero). La pestaña "Tablero" solo existe para quien
// puede leer el portafolio completo o es COORDINADOR; la API sigue siendo la autoridad del alcance.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProyectosVista } from "./proyectos-vista"

const { replace, search, userState } = vi.hoisted(() => ({
  replace: vi.fn(),
  search: { value: "" },
  userState: { data: null as unknown },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/proyectos",
  useSearchParams: () => new URLSearchParams(search.value),
}))
vi.mock("@/hooks/kanban", () => ({ useCurrentUser: () => userState }))
vi.mock("@/components/proyectos/project-list", () => ({ ProjectList: () => <div data-testid="lista-stub" /> }))
vi.mock("@/components/proyectos/project-dashboard", () => ({ ProjectDashboard: () => <div data-testid="tablero-stub" /> }))

const como = (rol: string, extra: object = {}) => {
  userState.data = { id: "u1", nombre: "Ana", rol, ...extra }
}

beforeEach(() => {
  vi.clearAllMocks()
  search.value = ""
  userState.data = null
})

describe("ProyectosVista", () => {
  it("hides the Tablero tab for an unflagged COLABORADOR and keeps the list", () => {
    como("COLABORADOR")
    render(<ProyectosVista />)
    expect(screen.queryByRole("tab", { name: "Tablero" })).not.toBeInTheDocument()
    expect(screen.getByTestId("lista-stub")).toBeInTheDocument()
  })

  it("an unflagged COLABORADOR who opens ?vista=tablero still gets the list", () => {
    como("COLABORADOR")
    search.value = "vista=tablero"
    render(<ProyectosVista />)
    expect(screen.queryByTestId("tablero-stub")).not.toBeInTheDocument()
    expect(screen.getByTestId("lista-stub")).toBeInTheDocument()
  })

  it("hides the tab while the user is still loading or unknown", () => {
    render(<ProyectosVista />)
    expect(screen.queryByRole("tab", { name: "Tablero" })).not.toBeInTheDocument()
    expect(screen.getByTestId("lista-stub")).toBeInTheDocument()
  })

  it.each([
    ["ADMINISTRADOR", {}],
    ["GERENCIA", {}],
    ["COORDINADOR", {}],
    ["COLABORADOR", { puede_ver_tablero_gerencial: true }],
    ["VISUALIZADOR", { puede_ver_tablero_gerencial: true }],
  ])("shows the Tablero tab for %s %j", (rol, extra) => {
    como(rol, extra)
    render(<ProyectosVista />)
    expect(screen.getByRole("tab", { name: "Tablero" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Portafolio" })).toBeInTheDocument()
  })

  it("opens on the dashboard with ?vista=tablero and writes the choice to the URL", async () => {
    como("GERENCIA")
    search.value = "vista=tablero"
    render(<ProyectosVista />)
    expect(screen.getByTestId("tablero-stub")).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("tab", { name: "Portafolio" }))
    expect(replace).toHaveBeenCalledWith("/proyectos")
  })

  it("switching to Tablero sets ?vista=tablero", async () => {
    como("GERENCIA")
    render(<ProyectosVista />)
    await userEvent.setup().click(screen.getByRole("tab", { name: "Tablero" }))
    expect(replace).toHaveBeenCalledWith("/proyectos?vista=tablero")
  })
})
