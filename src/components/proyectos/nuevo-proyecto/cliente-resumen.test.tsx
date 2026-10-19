import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail, Contacto } from "@/hooks/crm"
import { ClienteResumen } from "./cliente-resumen"

const { useClientDetailMock, useContactsMock } = vi.hoisted(() => ({
  useClientDetailMock: vi.fn(),
  useContactsMock: vi.fn(),
}))

vi.mock("@/hooks/crm", () => ({
  useClientDetail: useClientDetailMock,
  useContacts: useContactsMock,
}))

const CLIENTE = {
  id: "c1",
  nombre: "Alcaldía de Barranquilla",
  empresa: "Alcaldía Distrital",
  tipo_cliente: "GOBIERNO_LOCAL",
  ubicacion: "Barranquilla, Atlántico",
  oportunidades_count: 3,
  contactos_count: 2,
} as ClientDetail

const CONTACTOS = [
  { id: "k1", nombre: "Luis Otro", cargo: null, correo: "luis@x.co", telefono: null, rol_decision: "OTRO" },
  { id: "k2", nombre: "Marta Decide", cargo: "Secretaria", correo: "marta@x.co", telefono: "3001234567", rol_decision: "DECISOR" },
] as Contacto[]

describe("ClienteResumen", () => {
  beforeEach(() => {
    useClientDetailMock.mockReturnValue({ data: CLIENTE, isLoading: false, isError: false })
    useContactsMock.mockReturnValue({ data: CONTACTOS, isLoading: false, isError: false })
  })

  it("shows the client data that exists, read-only", () => {
    render(<ClienteResumen clienteId="c1" />)
    const tarjeta = screen.getByRole("region", { name: "Datos del cliente" })
    expect(tarjeta).toHaveTextContent("Alcaldía de Barranquilla")
    expect(tarjeta).toHaveTextContent("Barranquilla, Atlántico")
    expect(tarjeta).toHaveTextContent("Gobierno local")
    expect(tarjeta).toHaveTextContent(/Oportunidades\s*3/)
    expect(tarjeta.querySelector("input")).toBeNull()
  })

  it("prefers the decision-maker as the main contact and shows name, email and phone", () => {
    render(<ClienteResumen clienteId="c1" />)
    const tarjeta = screen.getByRole("region", { name: "Datos del cliente" })
    expect(tarjeta).toHaveTextContent("Marta Decide")
    expect(tarjeta).toHaveTextContent("marta@x.co")
    expect(tarjeta).toHaveTextContent("3001234567")
    expect(tarjeta).not.toHaveTextContent("Luis Otro")
  })

  it("falls back to the first contact when nobody is a decision-maker", () => {
    useContactsMock.mockReturnValue({ data: [CONTACTOS[0]], isLoading: false, isError: false })
    render(<ClienteResumen clienteId="c1" />)
    expect(screen.getByRole("region", { name: "Datos del cliente" })).toHaveTextContent("Luis Otro")
  })

  it("says so when the client has no contacts and omits unavailable fields", () => {
    useContactsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useClientDetailMock.mockReturnValue({ data: { ...CLIENTE, ubicacion: null }, isLoading: false, isError: false })
    render(<ClienteResumen clienteId="c1" />)
    const tarjeta = screen.getByRole("region", { name: "Datos del cliente" })
    expect(tarjeta).toHaveTextContent("Sin contactos registrados")
    expect(tarjeta).not.toHaveTextContent("Ubicación")
  })

  it("shows a loading state and an error message", () => {
    useClientDetailMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const view = render(<ClienteResumen clienteId="c1" />)
    expect(screen.getByRole("status")).toHaveTextContent("Cargando datos del cliente")
    view.unmount()
    useClientDetailMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<ClienteResumen clienteId="c1" />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los datos del cliente.")
  })
})
