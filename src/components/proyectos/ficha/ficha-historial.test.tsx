// Segmentado de la pestaña "Historial" de la ficha (rediseño «Interacciones-Historial»): Registro de cambios,
// Solicitudes de modificación y Versiones del plan. Los tres hijos se burlan: aquí solo se fija el segmento por
// defecto, el cambio de segmento, que solo se monte el activo y los enlaces entre segmentos.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaHistorial } from "./ficha-historial"

vi.mock("@/components/proyectos/project-modificaciones", () => ({
  ProjectModificaciones: () => <div data-testid="segmento-modificaciones" />,
}))
vi.mock("@/components/proyectos/project-versiones", () => ({
  ProjectVersiones: ({ onVerSolicitudes }: { onVerSolicitudes?: () => void }) => (
    <div data-testid="segmento-versiones">
      <button type="button" onClick={onVerSolicitudes}>
        Ir a solicitudes
      </button>
    </div>
  ),
}))
vi.mock("@/components/proyectos/project-historial", () => ({
  ProjectHistorial: ({ onIrA }: { onIrA?: (tab: string) => void }) => (
    <div data-testid="segmento-auditoria">
      <button type="button" onClick={() => onIrA?.("actividades")}>
        Ir a actividades
      </button>
    </div>
  ),
}))

// The counters read the same queries the Modificaciones and Versiones segments use; here only their state matters.
type Consulta = { data?: unknown[]; isSuccess: boolean; isError: boolean }
const CARGANDO: Consulta = { data: undefined, isSuccess: false, isError: false }
const consultas = vi.hoisted(() => ({
  modificaciones: undefined as unknown,
  versiones: undefined as unknown,
  llamadas: [] as string[],
}))
vi.mock("@/hooks/projects", () => ({
  useProjectModifications: (id: string) => {
    consultas.llamadas.push(`modificaciones:${id}`)
    return consultas.modificaciones
  },
  useProjectVersions: (id: string) => {
    consultas.llamadas.push(`versiones:${id}`)
    return consultas.versiones
  },
}))

beforeEach(() => {
  consultas.modificaciones = CARGANDO
  consultas.versiones = CARGANDO
  consultas.llamadas = []
})

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

const NOMBRES = ["Registro de cambios", "Solicitudes de modificación", "Versiones del plan"]

describe("FichaHistorial", () => {
  const tab = (nombre: RegExp) => screen.getByRole("tab", { name: nombre })

  it("lists Registro de cambios, Solicitudes de modificación and Versiones del plan in order", () => {
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(NOMBRES)
  })

  it("keeps the short names apart for phones («Solicitudes», «Versiones»)", () => {
    render(<FichaHistorial proyecto={PROYECTO} />)

    // The tail of each long name is a span hidden below `sm`.
    for (const cola of ["de modificación", "del plan"]) {
      expect(screen.getByText(cola)).toHaveClass("hidden", "sm:inline")
    }
  })

  it("counts the modifications and the versions once they are loaded, and never the change log", () => {
    consultas.modificaciones = { data: [{}, {}], isSuccess: true, isError: false }
    consultas.versiones = { data: [{}, {}, {}], isSuccess: true, isError: false }
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Registro de cambios",
      "Solicitudes de modificación · 2",
      "Versiones del plan · 3",
    ])
    expect(screen.getByRole("tab", { name: "Registro de cambios" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Solicitudes de modificación · 2" })).toBeInTheDocument()
    expect(consultas.llamadas).toEqual(expect.arrayContaining(["modificaciones:p1", "versiones:p1"]))
  })

  it("shows no number while loading or on error", () => {
    consultas.modificaciones = { data: undefined, isSuccess: false, isError: true }
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(NOMBRES)
  })

  it("reads nothing and shows no number for a BORRADOR project, whose segments only explain themselves", () => {
    consultas.modificaciones = { data: [{}], isSuccess: true, isError: false }
    consultas.versiones = { data: [{}], isSuccess: true, isError: false }
    render(<FichaHistorial proyecto={{ ...PROYECTO, estado: "BORRADOR" }} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(NOMBRES)
    expect(consultas.llamadas).toEqual([])
  })

  it("opens on Registro de cambios and mounts only that segment", () => {
    render(<FichaHistorial proyecto={PROYECTO} />)

    expect(tab(/^Registro de cambios$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-auditoria")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-versiones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-modificaciones")).not.toBeInTheDocument()
  })

  it("switches segments and mounts only the active one", async () => {
    const user = userEvent.setup()
    render(<FichaHistorial proyecto={PROYECTO} />)

    await user.click(tab(/^Versiones del plan$/))
    expect(screen.getByTestId("segmento-versiones")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-modificaciones")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-auditoria")).not.toBeInTheDocument()

    await user.click(tab(/^Solicitudes de modificación$/))
    expect(screen.getByTestId("segmento-modificaciones")).toBeInTheDocument()
    expect(screen.queryByTestId("segmento-auditoria")).not.toBeInTheDocument()
    expect(screen.queryByTestId("segmento-versiones")).not.toBeInTheDocument()
  })

  it("moves between segments with the keyboard", async () => {
    const user = userEvent.setup()
    render(<FichaHistorial proyecto={PROYECTO} />)

    tab(/^Registro de cambios$/).focus()
    await user.keyboard("{ArrowRight}")
    expect(tab(/^Solicitudes de modificación$/)).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(tab(/^Solicitudes de modificación$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-modificaciones")).toBeInTheDocument()
  })

  it("opens on the segment the ficha asks for (the modification request sent from the Resumen)", () => {
    render(<FichaHistorial proyecto={PROYECTO} segmentoInicial="solicitudes" />)

    expect(tab(/^Solicitudes de modificación$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-modificaciones")).toBeInTheDocument()
  })

  it("opens Solicitudes de modificación from the link inside Versiones del plan", async () => {
    const user = userEvent.setup()
    render(<FichaHistorial proyecto={PROYECTO} />)

    await user.click(tab(/^Versiones del plan$/))
    await user.click(screen.getByRole("button", { name: "Ir a solicitudes" }))

    expect(tab(/^Solicitudes de modificación$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-modificaciones")).toBeInTheDocument()
  })

  it("passes the ficha's tab switch down to the change log («Ver actividad», «Ver gasto»)", async () => {
    const user = userEvent.setup()
    const onIrA = vi.fn()
    render(<FichaHistorial proyecto={PROYECTO} onIrA={onIrA} />)

    await user.click(screen.getByRole("button", { name: "Ir a actividades" }))
    expect(onIrA).toHaveBeenCalledWith("actividades")
  })
})
