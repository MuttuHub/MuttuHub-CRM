// Carril X · X2: segmentado de la pestaña "Finanzas" de la ficha (UX-1). Los tres hijos se burlan: aquí
// solo se fija el segmento por defecto según el estado, el cambio de segmento y que solo se monte el activo.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaFinanzas } from "./ficha-finanzas"

vi.mock("@/components/proyectos/project-financiero", () => ({
  ProjectFinanciero: () => <div data-testid="segmento-resumen" />,
}))
vi.mock("@/components/proyectos/project-gastos", () => ({
  ProjectGastos: () => <div data-testid="segmento-gastos" />,
}))
vi.mock("@/components/proyectos/project-presupuesto", () => ({
  ProjectPresupuesto: () => <div data-testid="segmento-presupuesto" />,
}))

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

describe("FichaFinanzas", () => {
  const tab = (nombre: RegExp) => screen.getByRole("tab", { name: nombre })

  it("lists Resumen, Gastos and Presupuesto in order", () => {
    render(<FichaFinanzas proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumen", "Gastos", "Presupuesto"])
  })

  it("opens on Resumen for a project that is not BORRADOR and mounts only that segment", () => {
    render(<FichaFinanzas proyecto={PROYECTO} />)

    expect(tab(/^Resumen$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-resumen")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-gastos")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-presupuesto")).not.toBeInTheDocument()
  })

  it("opens on Presupuesto while the project is BORRADOR and mounts only that segment", () => {
    render(<FichaFinanzas proyecto={{ ...PROYECTO, estado: "BORRADOR" }} />)

    expect(tab(/^Presupuesto$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-presupuesto")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-resumen")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-gastos")).not.toBeInTheDocument()
  })

  it("keeps on Resumen every other state, including SUSPENDIDO and CERRADO", () => {
    for (const estado of ["EN_EJECUCION", "SUSPENDIDO", "CERRADO"] as const) {
      const { unmount } = render(<FichaFinanzas proyecto={{ ...PROYECTO, estado }} />)
      expect(screen.getByTestId("segmento-resumen")).toBeInTheDocument()
      unmount()
    }
  })

  it("switches segments and mounts only the active one", async () => {
    const user = userEvent.setup()
    render(<FichaFinanzas proyecto={PROYECTO} />)

    await user.click(tab(/^Gastos$/))
    expect(screen.getByTestId("segmento-gastos")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-resumen")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-presupuesto")).not.toBeInTheDocument()

    await user.click(tab(/^Presupuesto$/))
    expect(screen.getByTestId("segmento-presupuesto")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-resumen")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-gastos")).not.toBeInTheDocument()

    await user.click(tab(/^Resumen$/))
    expect(screen.getByTestId("segmento-resumen")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-gastos")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-presupuesto")).not.toBeInTheDocument()
  })

  it("moves between segments with the keyboard", async () => {
    const user = userEvent.setup()
    render(<FichaFinanzas proyecto={PROYECTO} />)

    const resumen = tab(/^Resumen$/)
    resumen.focus()
    await user.keyboard("{ArrowRight}")
    expect(tab(/^Gastos$/)).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(tab(/^Gastos$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-gastos")).toBeInTheDocument()
  })
})
