// Steps 2-5 embed the editors the ficha already has for a BORRADOR project, as they are: which component
// each step renders and that they receive the created project. The embedded editors are stubbed (they have
// their own suites).

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { PasoSiguientes } from "./paso-siguientes"

vi.mock("@/components/proyectos/project-estructura", () => ({
  ProjectEstructura: ({ proyecto }: { proyecto: ProjectListRow }) => <div data-testid="estructura">{proyecto.id}</div>,
}))
vi.mock("@/components/proyectos/project-cronograma", () => ({
  ProjectCronograma: ({ proyecto }: { proyecto: ProjectListRow }) => <div data-testid="cronograma">{proyecto.id}</div>,
}))
vi.mock("@/components/proyectos/estructura-gantt", () => ({
  EstructuraGantt: ({ proyecto }: { proyecto: ProjectListRow }) => <div data-testid="gantt">{proyecto.id}</div>,
}))
vi.mock("@/components/proyectos/project-presupuesto", () => ({
  ProjectPresupuesto: ({ proyecto }: { proyecto: ProjectListRow }) => <div data-testid="presupuesto">{proyecto.id}</div>,
}))

vi.mock("@/components/proyectos/nuevo-proyecto/paso-revision", () => ({
  PasoRevision: ({ proyecto }: { proyecto: ProjectListRow }) => <div data-testid="revision">{proyecto.id}</div>,
}))

const PROYECTO = { id: "p1", codigo: "PRY-1", nombre: "X", estado: "BORRADOR" } as ProjectListRow

describe("PasoSiguientes", () => {
  it("step 2 (Metas) renders the structure editor with its template buttons for the project", () => {
    render(<PasoSiguientes paso={2} proyecto={PROYECTO} />)
    expect(screen.getByTestId("estructura")).toHaveTextContent("p1")
    expect(screen.queryByTestId("cronograma")).not.toBeInTheDocument()
  })

  it("step 3 (Cronograma) renders the cronograma and the Gantt, and points to Metas for editing activities", () => {
    render(<PasoSiguientes paso={3} proyecto={PROYECTO} />)
    expect(screen.getByTestId("cronograma")).toHaveTextContent("p1")
    expect(screen.getByTestId("gantt")).toHaveTextContent("p1")
    expect(screen.getByText(/actividades se registran en el paso Metas/i)).toBeInTheDocument()
  })

  it("step 4 (Presupuesto) renders the budget and monthly programming editor", () => {
    render(<PasoSiguientes paso={4} proyecto={PROYECTO} />)
    expect(screen.getByTestId("presupuesto")).toHaveTextContent("p1")
  })

  it("step 5 (Revisión) renders the review", () => {
    render(<PasoSiguientes paso={5} proyecto={PROYECTO} />)
    expect(screen.getByTestId("revision")).toHaveTextContent("p1")
  })

  it("renders nothing for step 1, which is the General step and has no body here", () => {
    const { container } = render(<PasoSiguientes paso={1} proyecto={PROYECTO} />)
    expect(container).toBeEmptyDOMElement()
  })
})
