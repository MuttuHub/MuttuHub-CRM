// The "Nuevo proyecto" page shell: permissions, the `?proyecto` / `?paso` / `?oportunidad` handling, the
// stepper enablement and the prev/next footer. The create form and the step bodies are stubbed: they have
// their own suites; what is pinned here is the navigation contract.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import type { ProjectListRow } from "@/hooks/projects"
import { NuevoProyecto } from "./nuevo-proyecto"

const { push, replace, nav, useCurrentUserMock, useProjectMock } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  nav: { search: "" },
  useCurrentUserMock: vi.fn(),
  useProjectMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock("@/hooks/kanban", () => ({ useCurrentUser: useCurrentUserMock }))
vi.mock("@/components/proyectos/nuevo-proyecto/use-proyecto-nuevo", () => ({ useProyectoNuevo: useProjectMock }))
vi.mock("@/components/proyectos/nuevo-proyecto/paso-general", () => ({
  PasoGeneralForm: ({ oportunidadId, clienteId, onCreated }: { oportunidadId?: string; clienteId?: string; onCreated: (p: { id: string; codigo: string | null; nombre: string | null }) => void }) => (
    <div data-testid="paso-general-form">
      oportunidad:{oportunidadId ?? "ninguna"} cliente:{clienteId ?? "ninguno"}
      <button type="button" onClick={() => onCreated({ id: "p-new", codigo: "PRY-1", nombre: "Nuevo" })}>
        simular creación
      </button>
    </div>
  ),
  PasoGeneralCreado: () => <div data-testid="paso-general-creado" />,
}))
vi.mock("@/components/proyectos/nuevo-proyecto/paso-siguientes", () => ({
  PasoSiguientes: ({ paso }: { paso: number }) => <div data-testid="paso-siguientes">paso {paso}</div>,
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

function paso(nombre: string) {
  return screen.getByRole("button", { name: new RegExp(`^${nombre}`) })
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  nav.search = ""
  useCurrentUserMock.mockReturnValue({ data: { id: "u1", nombre: "Ana", rol: "ADMINISTRADOR" } })
  useProjectMock.mockReturnValue({ data: undefined, isError: false, error: null })
})

describe("NuevoProyecto", () => {
  it("shows the create form on step 1 with a 'Volver a proyectos' link and an h1", () => {
    render(<NuevoProyecto />)

    expect(screen.getByRole("heading", { level: 1, name: "Nuevo proyecto" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a proyectos" })).toHaveAttribute("href", "/proyectos")
    expect(screen.getByTestId("paso-general-form")).toBeInTheDocument()
    expect(paso("General")).toHaveAttribute("aria-current", "step")
  })

  it("keeps steps 2-5 disabled until a project exists, and shows no prev/next footer", () => {
    render(<NuevoProyecto />)

    for (const nombre of ["Metas", "Cronograma", "Presupuesto", "Revisión"]) expect(paso(nombre)).toBeDisabled()
    expect(paso("General")).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument()
  })

  it("ignores ?paso when there is no project", () => {
    nav.search = "paso=4"
    render(<NuevoProyecto />)
    expect(screen.getByTestId("paso-general-form")).toBeInTheDocument()
  })

  it("preselects the won opportunity from ?oportunidad", () => {
    nav.search = "oportunidad=op-9"
    render(<NuevoProyecto />)
    expect(screen.getByTestId("paso-general-form")).toHaveTextContent("oportunidad:op-9")
  })

  it("preselects the client from ?cliente", () => {
    nav.search = "cliente=c-7"
    render(<NuevoProyecto />)
    expect(screen.getByTestId("paso-general-form")).toHaveTextContent("cliente:c-7")
  })

  it("shows a help button next to the title of steps that need extra explanation", async () => {
    const user = userEvent.setup()
    nav.search = "proyecto=p1&paso=3"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)
    await user.click(screen.getByRole("button", { name: "Ayuda: Cronograma de actividades" }))
    expect(await screen.findByText(/El peso de una actividad/)).toBeInTheDocument()
  })

  it("moves to step 2 of the created project with replace, so the blank form is not one back-press away", async () => {
    const user = userEvent.setup()
    render(<NuevoProyecto />)

    await user.click(screen.getByRole("button", { name: "simular creación" }))

    expect(replace).toHaveBeenCalledWith("/proyectos/nuevo?proyecto=p-new&paso=2")
    expect(push).not.toHaveBeenCalled()
  })

  it("keeps the created project on refresh: ?proyecto + ?paso open that step with every step enabled", () => {
    nav.search = "proyecto=p1&paso=3"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)

    expect(useProjectMock).toHaveBeenCalledWith("p1")
    expect(screen.getByRole("heading", { level: 1, name: PROYECTO.nombre })).toBeInTheDocument()
    expect(screen.getByText("PRY-2026-001")).toBeInTheDocument()
    expect(screen.getByTestId("paso-siguientes")).toHaveTextContent("paso 3")
    expect(paso("Cronograma")).toHaveAttribute("aria-current", "step")
    expect(paso("General")).toHaveAttribute("data-estado", "hecho")
    expect(paso("Metas")).toHaveAttribute("data-estado", "hecho")
    for (const nombre of ["General", "Metas", "Cronograma", "Presupuesto", "Revisión"]) expect(paso(nombre)).toBeEnabled()
  })

  it("lands on step 2 when a project exists but ?paso is missing", () => {
    nav.search = "proyecto=p1"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)
    expect(screen.getByTestId("paso-siguientes")).toHaveTextContent("paso 2")
  })

  it("shows the created project read-only on step 1 once it exists", () => {
    nav.search = "proyecto=p1&paso=1"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)
    expect(screen.getByTestId("paso-general-creado")).toBeInTheDocument()
    expect(screen.queryByTestId("paso-general-form")).not.toBeInTheDocument()
  })

  it("navigates with the footer and by clicking a step, always carrying ?proyecto", async () => {
    const user = userEvent.setup()
    nav.search = "proyecto=p1&paso=3"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)

    await user.click(screen.getByRole("button", { name: "Siguiente" }))
    expect(push).toHaveBeenLastCalledWith("/proyectos/nuevo?proyecto=p1&paso=4")
    await user.click(screen.getByRole("button", { name: "Atrás" }))
    expect(push).toHaveBeenLastCalledWith("/proyectos/nuevo?proyecto=p1&paso=2")
    await user.click(paso("Metas"))
    expect(push).toHaveBeenLastCalledWith("/proyectos/nuevo?proyecto=p1&paso=2")
  })

  it("has no Atrás on step 1 and no Siguiente on step 5", () => {
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    nav.search = "proyecto=p1&paso=1"
    const first = render(<NuevoProyecto />)
    expect(screen.queryByRole("button", { name: "Atrás" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument()
    first.unmount()

    nav.search = "proyecto=p1&paso=5"
    render(<NuevoProyecto />)
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument()
  })

  it("shows only a loading skeleton, not the stepper with done steps, while the project loads", () => {
    nav.search = "proyecto=p1&paso=2"
    render(<NuevoProyecto />)
    expect(screen.getByTestId("nuevo-proyecto-cargando")).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: /Pasos/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/completado/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("paso-siguientes")).not.toBeInTheDocument()
  })

  it("reflects the approval on step 5: Revisión done, approved copy instead of the review copy", () => {
    nav.search = "proyecto=p1&paso=5"
    useProjectMock.mockReturnValue({ data: { ...PROYECTO, estado: "EN_EJECUCION" }, isError: false, error: null })
    render(<NuevoProyecto />)

    expect(paso("Revisión")).toHaveAttribute("data-estado", "hecho")
    expect(screen.getByRole("heading", { level: 2, name: "Línea base aprobada" })).toBeInTheDocument()
    expect(screen.queryByText(/Confirma lo capturado/)).not.toBeInTheDocument()
  })

  it("keeps the review copy on step 5 while the project is a draft", () => {
    nav.search = "proyecto=p1&paso=5"
    useProjectMock.mockReturnValue({ data: PROYECTO, isError: false, error: null })
    render(<NuevoProyecto />)

    expect(paso("Revisión")).toHaveAttribute("data-estado", "activo")
    expect(screen.getByRole("heading", { level: 2, name: "Revisar y aprobar" })).toBeInTheDocument()
  })

  it("shows the no-access block, and no form, to users who cannot create projects", () => {
    useCurrentUserMock.mockReturnValue({ data: { id: "u2", nombre: "Beto", rol: "COLABORADOR" } })
    render(<NuevoProyecto />)

    expect(screen.getByRole("heading", { name: "No tienes acceso para crear proyectos" })).toBeInTheDocument()
    expect(screen.queryByTestId("paso-general-form")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a proyectos" })).toBeInTheDocument()
  })

  it("waits for the current user before deciding", () => {
    useCurrentUserMock.mockReturnValue({ data: undefined })
    render(<NuevoProyecto />)
    expect(screen.getByTestId("nuevo-proyecto-cargando")).toBeInTheDocument()
    expect(screen.queryByTestId("paso-general-form")).not.toBeInTheDocument()
  })

  it("explains a project that cannot be opened and offers to start over", () => {
    nav.search = "proyecto=zzz&paso=2"
    useProjectMock.mockReturnValue({ data: undefined, isError: true, error: new ApiError("Proyecto no encontrado", 404) })
    render(<NuevoProyecto />)

    expect(screen.getByRole("heading", { name: "No pudimos abrir el proyecto" })).toBeInTheDocument()
    expect(screen.getByText("Proyecto no encontrado")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Empezar de nuevo" })).toHaveAttribute("href", "/proyectos/nuevo")
  })
})
