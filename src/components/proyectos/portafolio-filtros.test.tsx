// Carril Y · Y1: barra de filtros del portafolio (RF-31). Los catálogos se burlan; aquí se fijan los
// cinco selects, las etiquetas de cada catálogo, lo que emite cada cambio (sin claves vacías), el botón
// «Limpiar filtros» y el plegable de móvil con el conteo de filtros activos.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ProjectFilters } from "@/hooks/projects"
import { PortafolioFiltros } from "./portafolio-filtros"

const { catalogo } = vi.hoisted(() => ({
  catalogo: {
    clientes: { data: [{ id: "c1", nombre: "Alcaldía de Barranquilla" }], isLoading: false, isError: false },
    lineas: { data: [{ id: "l1", codigo: "LE-01", nombre: "Educación" }], isLoading: false, isError: false },
    municipios: {
      data: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
      isLoading: false,
      isError: false,
    },
    usuarios: { data: [{ id: "u1", nombre: "Ana Pérez" }], isLoading: false, isError: false },
  },
}))

vi.mock("@/hooks/kanban", () => ({ useClientOptions: () => catalogo.clientes }))
vi.mock("@/hooks/projects", () => ({
  useStrategicLines: () => catalogo.lineas,
  useMunicipalities: () => catalogo.municipios,
}))
vi.mock("@/hooks/crm", () => ({ useUsers: () => catalogo.usuarios }))

/** Componente con estado real: reproduce lo que hará el listado y deja espiar lo emitido. */
function Harness({ inicial, onChange }: { inicial?: ProjectFilters; onChange?: (filtros: ProjectFilters) => void }) {
  const [filtros, setFiltros] = useState<ProjectFilters>(inicial ?? {})
  return (
    <PortafolioFiltros
      filtros={filtros}
      onChange={(siguiente) => {
        onChange?.(siguiente)
        setFiltros(siguiente)
      }}
    />
  )
}

async function elegir(user: ReturnType<typeof userEvent.setup>, etiqueta: string, opcion: string) {
  if (etiqueta === "Filtrar por municipio") {
    // El municipio se elige en dos pasos dentro de un popover: departamento y municipio.
    await user.click(screen.getByRole("button", { name: etiqueta }))
    await user.click(screen.getByRole("combobox", { name: "Departamento" }))
    await user.click(await screen.findByRole("option", { name: "Atlántico" }))
    await user.click(screen.getByRole("combobox", { name: "Municipio" }))
    await user.click(await screen.findByRole("option", { name: opcion }))
    return
  }
  await user.click(screen.getByRole("combobox", { name: etiqueta }))
  await user.click(await screen.findByRole("option", { name: opcion }))
}

describe("PortafolioFiltros", () => {
  it("renders the five filters and the catalog labels each one offers", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    for (const nombre of [
      "Filtrar por estado",
      "Filtrar por cliente",
      "Filtrar por línea estratégica",
      "Filtrar por responsable",
    ]) {
      expect(screen.getByRole("combobox", { name: nombre })).toBeInTheDocument()
    }
    // El municipio es un botón que abre el buscador (catálogo de 1122 filas).
    expect(screen.getByRole("button", { name: "Filtrar por municipio" })).toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    expect(await screen.findByRole("option", { name: "En ejecución" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Todos los estados" })).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("combobox", { name: "Filtrar por cliente" }))
    expect(await screen.findByRole("option", { name: "Alcaldía de Barranquilla" })).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("combobox", { name: "Filtrar por línea estratégica" }))
    expect(await screen.findByRole("option", { name: "Educación" })).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("button", { name: "Filtrar por municipio" }))
    await user.click(screen.getByRole("combobox", { name: "Departamento" }))
    expect(await screen.findByRole("option", { name: "Atlántico" })).toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: "Atlántico" }))
    await user.click(screen.getByRole("combobox", { name: "Municipio" }))
    expect(await screen.findByRole("option", { name: "Barranquilla" })).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("combobox", { name: "Filtrar por responsable" }))
    expect(await screen.findByRole("option", { name: "Ana Pérez" })).toBeInTheDocument()
  })

  it("emits the whole filter set, without keys for the cleared filters", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await elegir(user, "Filtrar por cliente", "Alcaldía de Barranquilla")
    expect(onChange).toHaveBeenLastCalledWith({ cliente_id: "c1" })

    await elegir(user, "Filtrar por línea estratégica", "Educación")
    expect(onChange).toHaveBeenLastCalledWith({ cliente_id: "c1", linea_id: "l1" })

    await elegir(user, "Filtrar por municipio", "Barranquilla")
    expect(onChange).toHaveBeenLastCalledWith({ cliente_id: "c1", linea_id: "l1", municipio_id: "m1" })

    await elegir(user, "Filtrar por responsable", "Ana Pérez")
    expect(onChange).toHaveBeenLastCalledWith({
      cliente_id: "c1",
      linea_id: "l1",
      municipio_id: "m1",
      responsable_id: "u1",
    })

    await elegir(user, "Filtrar por cliente", "Todos los clientes")
    expect(onChange).toHaveBeenLastCalledWith({ linea_id: "l1", municipio_id: "m1", responsable_id: "u1" })
  })

  it("shows the selected labels on the triggers", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await elegir(user, "Filtrar por estado", "En ejecución")
    expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toHaveTextContent("En ejecución")

    await elegir(user, "Filtrar por cliente", "Alcaldía de Barranquilla")
    expect(screen.getByRole("combobox", { name: "Filtrar por cliente" })).toHaveTextContent("Alcaldía de Barranquilla")
  })

  it("shows 'Limpiar filtros' only while some filter is active, and clears every one", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<PortafolioFiltros filtros={{}} onChange={onChange} />)
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument()

    rerender(<PortafolioFiltros filtros={{ estado: "BORRADOR", cliente_id: "c1" }} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }))
    expect(onChange).toHaveBeenCalledWith({})
  })

  it("keeps the filters behind a mobile toggle that counts the active ones", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PortafolioFiltros filtros={{}} onChange={vi.fn()} />)

    const toggle = screen.getByRole("button", { name: "Filtros" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    rerender(<PortafolioFiltros filtros={{ estado: "BORRADOR", cliente_id: "c1" }} onChange={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Filtros (2)" })).toBeInTheDocument()
  })
})
