// Carril X · X2: segmentado de la pestaña "Finanzas" de la ficha (UX-1). Los tres hijos se burlan: aquí
// solo se fija el segmento por defecto según el estado, el cambio de segmento y que solo se monte el activo.
// AJ-09: «Solicitar traslado» abre el formulario simple (burlado) en un diálogo, solo para quien puede solicitar.

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { FichaFinanzas } from "./ficha-finanzas"

vi.mock("@/components/proyectos/project-financiero", () => ({
  ProjectFinanciero: ({ onVerGastos, onVerActividades }: { onVerGastos?: () => void; onVerActividades?: () => void }) => (
    <div data-testid="segmento-resumen">
      {onVerGastos && <button onClick={onVerGastos}>Ver todos los gastos</button>}
      {onVerActividades && <button onClick={onVerActividades}>Ver actividades</button>}
    </div>
  ),
}))
vi.mock("@/components/proyectos/project-gastos", () => ({
  ProjectGastos: () => (
    <div data-testid="segmento-gastos" />
  ),
}))
vi.mock("@/components/proyectos/project-presupuesto", () => ({
  ProjectPresupuesto: () => <div data-testid="segmento-presupuesto" />,
}))

// The Gastos counter reads the same expenses query the Gastos segment uses; here only its state matters.
type Consulta = { data?: { gastos: unknown[] }; isSuccess: boolean; isError: boolean }
const CARGANDO: Consulta = { data: undefined, isSuccess: false, isError: false }
const gastos = vi.hoisted(() => ({ consulta: undefined as unknown, ids: [] as string[] }))
vi.mock("@/hooks/projects", () => ({
  useProjectExpenses: (id: string) => {
    gastos.ids.push(id)
    return gastos.consulta
  },
}))

// Who may request a modification is decided by the shared hook (covered in project-modificaciones.test.tsx).
const permiso = vi.hoisted(() => ({ puede: false, proyectos: [] as string[] }))
vi.mock("@/components/proyectos/project-modificaciones", () => ({
  usePuedeSolicitarModificacion: (proyecto: { id: string }) => {
    permiso.proyectos.push(proyecto.id)
    return permiso.puede
  },
}))
vi.mock("@/components/proyectos/traslado-form", () => ({
  TrasladoForm: ({ proyecto, onDone }: { proyecto: { id: string }; onDone: () => void }) => (
    <div data-testid="traslado-form" data-proyecto={proyecto.id}>
      <button onClick={onDone}>Terminar traslado</button>
    </div>
  ),
}))

beforeEach(() => {
  gastos.consulta = CARGANDO
  gastos.ids = []
  permiso.puede = false
  permiso.proyectos = []
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

describe("FichaFinanzas", () => {
  const tab = (nombre: RegExp) => screen.getByRole("tab", { name: nombre })

  it("lists Resumen, Gastos and Presupuesto in order", () => {
    render(<FichaFinanzas proyecto={PROYECTO} />)

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumen", "Gastos", "Presupuesto"])
  })

  it("counts the project's expenses on the Gastos segment once they are loaded", () => {
    gastos.consulta = { data: { gastos: [{}, {}, {}] }, isSuccess: true, isError: false }
    render(<FichaFinanzas proyecto={PROYECTO} />)

    expect(screen.getByRole("tab", { name: "Gastos · 3" })).toBeInTheDocument()
    expect(gastos.ids).toContain("p1")
    // The count does not open the segment: Resumen stays the active one.
    expect(screen.getByTestId("segmento-resumen")).toBeInTheDocument()
  })

  it("counts zero expenses as «Gastos · 0»", () => {
    gastos.consulta = { data: { gastos: [] }, isSuccess: true, isError: false }
    render(<FichaFinanzas proyecto={PROYECTO} />)

    expect(screen.getByRole("tab", { name: "Gastos · 0" })).toBeInTheDocument()
  })

  it("shows no number while the expenses load or when they fail", () => {
    const { unmount } = render(<FichaFinanzas proyecto={PROYECTO} />)
    expect(screen.getByRole("tab", { name: "Gastos" })).toBeInTheDocument()
    unmount()

    gastos.consulta = { data: undefined, isSuccess: false, isError: true }
    render(<FichaFinanzas proyecto={PROYECTO} />)
    expect(screen.getByRole("tab", { name: "Gastos" })).toBeInTheDocument()
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

  it("«Ver todos los gastos» in Resumen switches to the Gastos segment", async () => {
    const user = userEvent.setup()
    render(<FichaFinanzas proyecto={PROYECTO} />)

    await user.click(screen.getByRole("button", { name: "Ver todos los gastos" }))
    expect(tab(/^Gastos$/)).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("segmento-gastos")).toBeInTheDocument()
  })

  it("offers «Solicitar traslado» only to who may request a modification of this project", () => {
    const { unmount } = render(<FichaFinanzas proyecto={PROYECTO} />)
    expect(screen.queryByRole("button", { name: "Solicitar traslado" })).not.toBeInTheDocument()
    expect(permiso.proyectos).toContain("p1")
    unmount()

    permiso.puede = true
    render(<FichaFinanzas proyecto={PROYECTO} />)
    expect(screen.getByRole("button", { name: "Solicitar traslado" })).toBeInTheDocument()
    // The form is not mounted until the dialog opens, and the segments stay as they were.
    expect(screen.queryByTestId("traslado-form")).not.toBeInTheDocument()
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumen", "Gastos", "Presupuesto"])
  })

  it("opens the simple traslado form in a dialog and closes it when the form is done", async () => {
    const user = userEvent.setup()
    permiso.puede = true
    render(<FichaFinanzas proyecto={PROYECTO} />)

    await user.click(screen.getByRole("button", { name: "Solicitar traslado" }))
    const dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByRole("heading", { name: "Solicitar traslado" })).toBeInTheDocument()
    expect(within(dialogo).getByTestId("traslado-form")).toHaveAttribute("data-proyecto", "p1")

    await user.click(within(dialogo).getByRole("button", { name: "Terminar traslado" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.queryByTestId("traslado-form")).not.toBeInTheDocument()
  })

  it("passes «Ver actividades» through to Resumen only when the ficha offers it", async () => {
    const user = userEvent.setup()
    const onVerActividades = vi.fn()
    const { unmount } = render(<FichaFinanzas proyecto={PROYECTO} />)
    expect(screen.queryByRole("button", { name: "Ver actividades" })).not.toBeInTheDocument()
    unmount()

    render(<FichaFinanzas proyecto={PROYECTO} onVerActividades={onVerActividades} />)
    await user.click(screen.getByRole("button", { name: "Ver actividades" }))
    expect(onVerActividades).toHaveBeenCalledTimes(1)
  })
})
