// V5 (S3, decision L8): the «Mapa» section. These tests pin what the page owes: the departamento
// tiles with their counts, the side panel of the selected departamento with its stats and clients,
// the separate «sin departamento» group, the filters passed to the server aggregation, and the
// loading / error / empty states. The aggregation itself is the endpoint's; the feed is mocked.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MapaAliadosData, MapaCliente, MapaFilters } from "@/hooks/crm"
import { MapaVista, intensidadCalor } from "./mapa-vista"

const { useMapaAliadosMock } = vi.hoisted(() => ({
  useMapaAliadosMock: vi.fn(
    (filters: MapaFilters): { data: MapaAliadosData | undefined; isLoading: boolean; isError: boolean } => {
      void filters
      return { data: undefined, isLoading: false, isError: false }
    },
  ),
}))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useMapaAliados: useMapaAliadosMock,
    useUsers: () => ({ data: [{ id: "u2", nombre: "Bruno Díaz" }] }),
  }
})

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function cliente(overrides: Partial<MapaCliente> = {}): MapaCliente {
  return {
    id: "c1",
    nombre: "Fundación Uno",
    estado: "CLIENTE_ACTIVO",
    departamento: "Antioquia",
    ubicacion: "Medellín, Antioquia",
    responsable_nombre: "Ana",
    proyectos: 1,
    ...overrides,
  }
}

const DATA: MapaAliadosData = {
  departamentos: [
    {
      departamento: "Antioquia",
      codigo: "05",
      aliados: 2,
      proyectos: 3,
      clientes: [cliente({ id: "a1", nombre: "Fundación Uno" }), cliente({ id: "a2", nombre: "Taller Dos", proyectos: 2 })],
    },
    { departamento: "Caldas", codigo: null, aliados: 0, proyectos: 0, clientes: [] },
  ],
  sin_departamento: {
    aliados: 1,
    proyectos: 0,
    clientes: [cliente({ id: "s1", nombre: "Agencia Sin Lugar", departamento: null, ubicacion: "Manizales" })],
  },
  total: 3,
  con_departamento: 2,
  max_aliados: 2,
}

function conDatos(data: MapaAliadosData) {
  useMapaAliadosMock.mockReturnValue({ data, isLoading: false, isError: false })
}

beforeEach(() => {
  useMapaAliadosMock.mockReset()
  useMapaAliadosMock.mockReturnValue({ data: undefined, isLoading: false, isError: false })
})

describe("intensidadCalor", () => {
  it("is zero for an empty tile and grows with the count up to the busiest one", () => {
    expect(intensidadCalor(0, 4)).toBe(0)
    expect(intensidadCalor(1, 4)).toBeGreaterThan(0)
    expect(intensidadCalor(2, 4)).toBeLessThan(intensidadCalor(4, 4))
    expect(intensidadCalor(4, 4)).toBe(100)
  })
})

describe("MapaVista", () => {
  it("renders one tile per departamento with its code and count", () => {
    conDatos(DATA)
    render(<MapaVista />)

    const grid = screen.getByRole("group", { name: "Departamentos" })
    const tiles = within(grid).getAllByRole("button")
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Antioquia: 2 aliados", "Caldas: 0 aliados"])
    expect(within(tiles[0]).getByText("05")).toBeInTheDocument()
  })

  it("opens the busiest departamento in the side panel and switches on click", async () => {
    const user = userEvent.setup()
    conDatos(DATA)
    render(<MapaVista />)

    const panel = screen.getByRole("region", { name: "Antioquia" })
    expect(within(panel).getByText("Aliados").nextElementSibling).toHaveTextContent("2")
    expect(within(panel).getByText("Proyectos").nextElementSibling).toHaveTextContent("3")
    expect(within(panel).getByRole("link", { name: /Taller Dos/ })).toHaveAttribute("href", "/clientes?cliente=a2")
    expect(screen.getByRole("button", { name: "Antioquia: 2 aliados" })).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Caldas: 0 aliados" }))
    const caldas = screen.getByRole("region", { name: "Caldas" })
    expect(within(caldas).getByText("Ningún aliado de este departamento con los filtros actuales.")).toBeInTheDocument()
  })

  it("lists the clients without departamento apart, never placed by their ubicacion", () => {
    conDatos(DATA)
    render(<MapaVista />)

    const grupo = screen.getByRole("region", { name: "Sin departamento" })
    expect(within(grupo).getByRole("link", { name: /Agencia Sin Lugar/ })).toHaveAttribute("href", "/clientes?cliente=s1")
    expect(within(grupo).getByText("1")).toBeInTheDocument()
  })

  it("passes the estado and responsable filters to the server aggregation", async () => {
    const user = userEvent.setup()
    conDatos(DATA)
    render(<MapaVista />)
    expect(useMapaAliadosMock).toHaveBeenLastCalledWith({})

    await user.click(screen.getByRole("combobox", { name: "Estado" }))
    await user.click(await screen.findByRole("option", { name: "Prospecto" }))
    expect(useMapaAliadosMock).toHaveBeenLastCalledWith({ estado: "PROSPECTO" })

    await user.click(screen.getByRole("combobox", { name: "Responsable" }))
    await user.click(await screen.findByRole("option", { name: "Bruno Díaz" }))
    expect(useMapaAliadosMock).toHaveBeenLastCalledWith({ estado: "PROSPECTO", responsable: "u2" })
  })

  it("shows the loading, error and empty states", () => {
    useMapaAliadosMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { unmount } = render(<MapaVista />)
    expect(screen.getByRole("status", { name: "Cargando mapa de aliados" })).toBeInTheDocument()
    unmount()

    useMapaAliadosMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const second = render(<MapaVista />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el mapa de aliados.")
    second.unmount()

    conDatos({ ...DATA, departamentos: [], sin_departamento: { aliados: 0, proyectos: 0, clientes: [] }, total: 0, con_departamento: 0, max_aliados: 0 })
    render(<MapaVista />)
    expect(screen.getByText("Aún no hay departamentos en el catálogo")).toBeInTheDocument()
  })
})
