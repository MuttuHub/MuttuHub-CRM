// Carril X · X6: segmentado de la pestaña "Historial" de la ficha (UX-1): Modificaciones, Versiones y
// Auditoría. Los tres hijos se burlan: aquí solo se fija el segmento por defecto, el cambio de segmento y
// que solo se monte el activo.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaHistorial } from "./ficha-historial"

vi.mock("@/components/proyectos/project-modificaciones", () => ({
  ProjectModificaciones: () => <div data-testid="segmento-modificaciones" />,
}))
vi.mock("@/components/proyectos/project-versiones", () => ({
  ProjectVersiones: () => <div data-testid="segmento-versiones" />,
}))
vi.mock("@/components/proyectos/project-historial", () => ({
  ProjectHistorial: () => <div data-testid="segmento-auditoria" />,
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

describe("FichaHistorial", () => {
  const tab = (nombre: RegExp) => screen.getByRole("tab", { name: nombre })

  it("lists Modificaciones, Versiones and Auditoría in order", () => {
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Modificaciones", "Versiones", "Auditoría"])
  })

  it("opens on Modificaciones and mounts only that segment", () => {
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(tab(/^Modificaciones$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-modificaciones")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-versiones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-auditoria")).not.toBeInTheDocument()
  })

  it("switches segments and mounts only the active one", async () => {
    const user = userEvent.setup()
    render(<FichaHistorial proyecto={PROYECTO} />)

    await user.click(tab(/^Versiones$/))
    expect(screen.getByTestId("segmento-versiones")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-modificaciones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-auditoria")).not.toBeInTheDocument()

    await user.click(tab(/^Auditoría$/))
    expect(screen.getByTestId("segmento-auditoria")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-modificaciones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-versiones")).not.toBeInTheDocument()
  })

  it("moves between segments with the keyboard", async () => {
    const user = userEvent.setup()
    render(<FichaHistorial proyecto={PROYECTO} />)

    tab(/^Modificaciones$/).focus()
    await user.keyboard("{ArrowRight}")
    expect(tab(/^Versiones$/)).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(tab(/^Versiones$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-versiones")).toBeInTheDocument()
  })
})
