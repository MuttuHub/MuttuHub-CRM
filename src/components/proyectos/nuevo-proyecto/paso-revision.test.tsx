// Step 5 "Revisión": a read-only summary of what exists for the project (general data, counts of objetivos,
// actividades, entregables and indicadores, Σ presupuesto vs valor total) plus the existing "Aprobar línea
// base" action (stubbed here: it has its own suite and decides permissions and preconditions by itself) and
// "Guardar borrador", which just opens the ficha because every step already persisted.

import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectBudget, ProjectListRow } from "@/hooks/projects"
import { PasoRevision } from "./paso-revision"

const { objetivosMock, actividadesMock, entregablesMock, indicadoresMock, budgetMock } = vi.hoisted(() => ({
  objetivosMock: vi.fn(),
  actividadesMock: vi.fn(),
  entregablesMock: vi.fn(),
  indicadoresMock: vi.fn(),
  budgetMock: vi.fn(),
}))

vi.mock("@/hooks/projects", () => ({
  useProjectObjectives: objetivosMock,
  useProjectActivities: actividadesMock,
  useProjectDeliverables: entregablesMock,
  useProjectIndicators: indicadoresMock,
  useProjectBudget: budgetMock,
}))
vi.mock("@/components/proyectos/baseline-approval", () => ({
  BaselineApproval: ({ proyecto }: { proyecto: ProjectListRow }) =>
    proyecto.estado === "BORRADOR" ? <button type="button">Aprobar línea base</button> : null,
}))

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento de capacidades locales",
  estado: "BORRADOR",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
}

const ok = (data: unknown[]) => ({ data, isError: false, isLoading: false })

function presupuesto(partial: Partial<ProjectBudget> = {}): { data: ProjectBudget; isError: boolean; isLoading: boolean } {
  return {
    data: {
      estado: "BORRADOR",
      rubros: [
        { rubro_id: "r1", codigo: "R1", nombre: "Personal", activo: true, linea_id: "l1", asignado: "100000000.00", heredado_pendiente: false },
        { rubro_id: "r2", codigo: "R2", nombre: "Formación", activo: true, linea_id: "l2", asignado: "80000000.00", heredado_pendiente: false },
        { rubro_id: "r3", codigo: "R3", nombre: "Oficina", activo: true, linea_id: null, asignado: "0.00", heredado_pendiente: false },
      ],
      suma: "180000000.00",
      valor_total: "180000000.00",
      diferencia: "0.00",
      ...partial,
    },
    isError: false,
    isLoading: false,
  }
}

function fila(nombre: string) {
  return screen.getByText(nombre).closest("div") as HTMLElement
}

beforeEach(() => {
  objetivosMock.mockReturnValue(ok([{ id: "o1" }, { id: "o2" }]))
  actividadesMock.mockReturnValue(ok([{ id: "a1" }, { id: "a2" }, { id: "a3" }]))
  entregablesMock.mockReturnValue(ok([{ id: "e1" }]))
  indicadoresMock.mockReturnValue(ok([{ id: "i1" }, { id: "i2" }]))
  budgetMock.mockReturnValue(presupuesto())
})

describe("PasoRevision", () => {
  it("summarises the general data and the counts of what was captured", () => {
    render(<PasoRevision proyecto={PROYECTO} />)

    expect(within(fila("Proyecto")).getByText(/Fortalecimiento de capacidades locales/)).toBeInTheDocument()
    expect(within(fila("Cliente")).getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(within(fila("Objetivos")).getByText("2")).toBeInTheDocument()
    expect(within(fila("Actividades")).getByText("3")).toBeInTheDocument()
    expect(within(fila("Entregables")).getByText("1")).toBeInTheDocument()
    expect(within(fila("Indicadores")).getByText("2")).toBeInTheDocument()
  })

  it("shows Σ presupuesto against the valor total and counts only the rubros with an amount", () => {
    render(<PasoRevision proyecto={PROYECTO} />)

    const presup = fila("Presupuesto")
    expect(within(presup).getByText(/180\.000\.000/)).toBeInTheDocument()
    expect(within(presup).getByText(/2 rubros/)).toBeInTheDocument()
    expect(screen.queryByText(/difiere del valor total/i)).not.toBeInTheDocument()
  })

  it("flags, without blocking, a budget that differs from the valor total", () => {
    budgetMock.mockReturnValue(presupuesto({ suma: "150000000.00", diferencia: "-30000000.00" }))
    render(<PasoRevision proyecto={PROYECTO} />)

    expect(screen.getByText(/difiere del valor total/i)).toHaveTextContent(/30\.000\.000/)
    expect(screen.getByRole("button", { name: "Aprobar línea base" })).toBeEnabled()
  })

  it("handles a project without valor total", () => {
    budgetMock.mockReturnValue(presupuesto({ valor_total: null, diferencia: null }))
    render(<PasoRevision proyecto={{ ...PROYECTO, valor_total: null }} />)
    expect(screen.getByText(/sin valor total/i)).toBeInTheDocument()
  })

  it("shows empty counts as zero", () => {
    objetivosMock.mockReturnValue(ok([]))
    actividadesMock.mockReturnValue(ok([]))
    entregablesMock.mockReturnValue(ok([]))
    indicadoresMock.mockReturnValue(ok([]))
    render(<PasoRevision proyecto={PROYECTO} />)
    expect(within(fila("Objetivos")).getByText("0")).toBeInTheDocument()
    expect(within(fila("Actividades")).getByText("0")).toBeInTheDocument()
  })

  it("shows a placeholder while a count loads and a message when it fails", () => {
    objetivosMock.mockReturnValue({ data: undefined, isError: false, isLoading: true })
    indicadoresMock.mockReturnValue({ data: undefined, isError: true, isLoading: false })
    render(<PasoRevision proyecto={PROYECTO} />)
    expect(within(fila("Objetivos")).getByText("…")).toBeInTheDocument()
    expect(within(fila("Indicadores")).getByText("No se pudo cargar")).toBeInTheDocument()
  })

  it("offers the existing approval action and a 'Guardar borrador' link to the ficha while in BORRADOR", () => {
    render(<PasoRevision proyecto={PROYECTO} />)

    expect(screen.getByRole("button", { name: "Aprobar línea base" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Guardar borrador" })).toHaveAttribute("href", "/proyectos/p1")
  })

  it("once the baseline is approved, drops both actions and offers to open the project", () => {
    render(<PasoRevision proyecto={{ ...PROYECTO, estado: "EN_EJECUCION" }} />)

    expect(screen.queryByRole("button", { name: "Aprobar línea base" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Guardar borrador" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/línea base aprobada/i)
    expect(screen.getByRole("link", { name: "Abrir proyecto" })).toHaveAttribute("href", "/proyectos/p1")
  })
})
