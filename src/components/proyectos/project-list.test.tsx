import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ProjectFilters, ProjectListResponse, ProjectListRow } from "@/hooks/projects"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import { ProjectList, formatFechaCalendario } from "./project-list"

type ProjectsQueryState = {
  isLoading: boolean
  isError: boolean
  error: unknown
  data: ProjectListResponse | undefined
  refetch: ReturnType<typeof vi.fn>
}

type UsuarioActual = { id: string; nombre: string; rol: string }
type CurrentUserState = { data: UsuarioActual | null }

const {
  toast,
  useProjectsMock,
  useCurrentUserMock,
  projectsQuery,
  userQuery,
  dialogHooks,
} = vi.hoisted(() => {
  const projectsQuery: ProjectsQueryState = {
    isLoading: false,
    isError: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
  }
  const userQuery: CurrentUserState = { data: null }
  const queryState = { data: [], isLoading: false, isError: false }
  return {
    toast: { error: vi.fn(), success: vi.fn() },
    useProjectsMock: vi.fn<(filters: ProjectFilters) => ProjectsQueryState>(() => projectsQuery),
    useCurrentUserMock: vi.fn<() => CurrentUserState>(() => userQuery),
    projectsQuery,
    userQuery,
    // El diálogo importa estos hooks; con ellos burlados el listado se prueba
    // sin QueryClientProvider ni fetch real.
    dialogHooks: {
      useEligibleOpportunities: vi.fn(() => queryState),
      useStrategicLines: vi.fn(() => queryState),
      useMunicipalities: vi.fn(() => queryState),
      useCreateProject: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
      useCreateProjectFromOpportunity: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
      useUsers: vi.fn(() => queryState),
      useClients: vi.fn(() => ({ data: { items: [] }, isLoading: false, isError: false })),
    },
  }
})

vi.mock("sonner", () => ({ toast }))

vi.mock("@/hooks/projects", () => ({
  useProjects: (...args: Parameters<typeof useProjectsMock>) => useProjectsMock(...args),
  useEligibleOpportunities: dialogHooks.useEligibleOpportunities,
  useStrategicLines: dialogHooks.useStrategicLines,
  useMunicipalities: dialogHooks.useMunicipalities,
  useCreateProject: dialogHooks.useCreateProject,
  useCreateProjectFromOpportunity: dialogHooks.useCreateProjectFromOpportunity,
}))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useUsers: dialogHooks.useUsers,
    useClients: dialogHooks.useClients,
  }
})

vi.mock("@/hooks/kanban", () => ({
  useCurrentUser: (...args: Parameters<typeof useCurrentUserMock>) => useCurrentUserMock(...args),
}))

const EMPTY: ProjectListResponse = { proyectos: [] }

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento de capacidades locales",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: "-5000000.00",
  beneficiarios_meta: 1200,
  lineas: [{ id: "l1", codigo: "LE-01", nombre: "Educación", principal: true }],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}

/** El filtro de estado solo se cambia desde el Select: mismo gesto en varios casos. */
async function selectEstado(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
  await user.click(await screen.findByRole("option", { name: label }))
}

describe("ProjectList", () => {
  beforeEach(() => {
    toast.error.mockClear()
    toast.success.mockClear()
    useProjectsMock.mockClear()
    useCurrentUserMock.mockClear()
    projectsQuery.isLoading = false
    projectsQuery.isError = false
    projectsQuery.error = null
    projectsQuery.data = EMPTY
    projectsQuery.refetch.mockClear()
    useProjectsMock.mockReturnValue(projectsQuery)
    userQuery.data = { id: "u1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" }
    useCurrentUserMock.mockReturnValue(userQuery)
  })

  it("renders skeletons while the projects query is loading", () => {
    projectsQuery.isLoading = true
    projectsQuery.data = undefined

    const { container } = render(<ProjectList />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
    expect(screen.queryByText(PROYECTO.nombre)).not.toBeInTheDocument()
    expect(screen.queryByText("Todavía no hay proyectos")).not.toBeInTheDocument()
  })

  it("uses the card header as a toolbar, with no second copy of the page title", () => {
    projectsQuery.data = { proyectos: [PROYECTO] }

    render(<ProjectList />)

    // El título lo pone el shell (PAGE_HEADERS["/proyectos"] → h1).
    expect(screen.queryByRole("heading", { name: "Proyectos" })).not.toBeInTheDocument()
    expect(screen.getByText("1 proyecto")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toBeInTheDocument()
  })

  it("renders the projects table with dates, weeks and value", () => {
    projectsQuery.data = { proyectos: [PROYECTO] }

    render(<ProjectList />)

    expect(screen.getByText("PRY-2026-001")).toBeInTheDocument()
    expect(screen.getByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.getByText("En ejecución")).toBeInTheDocument()
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument()
    expect(screen.getByText("05 de ene de 2026 – 30 de mar de 2026")).toBeInTheDocument()
    expect(screen.getByText("12 sem.")).toBeInTheDocument()
    expect(screen.getByText("$ 180.000.000")).toBeInTheDocument()
    expect(screen.getByText("1 proyecto")).toBeInTheDocument()
  })

  it("renders a project with null responsable, fecha_fin and valor_total without crashing", () => {
    projectsQuery.data = {
      proyectos: [
        {
          ...PROYECTO,
          id: "p2",
          origen: null,
          responsable: null,
          fecha_fin: null,
          duracion_semanas: null,
          valor_total: null,
          diferencia_valor_oportunidad: null,
          beneficiarios_meta: null,
        },
      ],
    }

    render(<ProjectList />)

    expect(screen.getByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.getByText("Sin asignar")).toBeInTheDocument()
    expect(screen.getByText("05 de ene de 2026 – —")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText(/sem\./)).not.toBeInTheDocument()
  })

  it("shows the empty state for a portfolio reader with no projects", () => {
    render(<ProjectList />)

    expect(screen.getByText("Todavía no hay proyectos")).toBeInTheDocument()
    expect(screen.queryByText("Aún no tienes proyectos visibles")).not.toBeInTheDocument()
  })

  it("does not claim there are no projects when the role may simply not see them", () => {
    userQuery.data = { id: "u9", nombre: "Carlos Ruiz", rol: "COLABORADOR" }
    useCurrentUserMock.mockReturnValue(userQuery)

    render(<ProjectList />)

    expect(screen.getByText("Aún no tienes proyectos visibles")).toBeInTheDocument()
    expect(screen.queryByText("Todavía no hay proyectos")).not.toBeInTheDocument()
  })

  it("stays neutral while the current user is still unknown", () => {
    userQuery.data = null
    useCurrentUserMock.mockReturnValue(userQuery)

    render(<ProjectList />)

    expect(screen.getByText("No hay proyectos para mostrar")).toBeInTheDocument()
    expect(screen.queryByText("Todavía no hay proyectos")).not.toBeInTheDocument()
  })

  it("gives the visibility copy priority over the active filter for a caller without portfolio access", async () => {
    userQuery.data = { id: "u9", nombre: "Carlos Ruiz", rol: "COLABORADOR" }
    useCurrentUserMock.mockReturnValue(userQuery)

    render(<ProjectList />)
    await selectEstado("En ejecución")

    expect(screen.getByText("Aún no tienes proyectos visibles")).toBeInTheDocument()
    expect(screen.queryByText("No encontramos proyectos con este estado")).not.toBeInTheDocument()
    // Menciona el filtro activo, pero nunca que existan proyectos.
    expect(screen.getByText(/El filtro por estado sigue activo/)).toBeInTheDocument()
  })

  it("stays neutral instead of the filter copy while the role is unknown and a filter is active", async () => {
    userQuery.data = null
    useCurrentUserMock.mockReturnValue(userQuery)

    render(<ProjectList />)
    await selectEstado("En ejecución")

    expect(screen.getByText("No hay proyectos para mostrar")).toBeInTheDocument()
    expect(screen.queryByText("No encontramos proyectos con este estado")).not.toBeInTheDocument()
  })

  it("renders a project whose date arrives as a Date object without crashing", () => {
    // Caso defensivo: hoy el DTO garantiza string|null (JSON nunca produce
    // Date), pero el verificador comprobó que `value.split` reventaba acá.
    projectsQuery.data = {
      proyectos: [
        {
          ...PROYECTO,
          fecha_inicio: new Date(Date.UTC(2026, 0, 5)) as unknown as string,
          fecha_fin: null,
          duracion_semanas: null,
        },
      ],
    }

    render(<ProjectList />)

    expect(screen.getByText("05 de ene de 2026 – —")).toBeInTheDocument()
  })

  it("surfaces an API error as a toast, not as a screen", () => {
    projectsQuery.isError = true
    projectsQuery.error = new ApiError("No tienes permisos para ver proyectos.", 403, "FORBIDDEN")
    projectsQuery.data = undefined

    render(<ProjectList />)

    expect(toast.error).toHaveBeenCalledWith("No tienes permisos para ver proyectos.")
    expect(screen.queryByText("Todavía no hay proyectos")).not.toBeInTheDocument()
    expect(screen.queryByText("PRY-2026-001")).not.toBeInTheDocument()
  })

  it("passes the selected estado to the query and names the active filter when empty", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ProjectList />)
    // Sin filtro el hook no recibe parámetros vacíos: la clave de cache no
    // cambia cuando el "todos" vuelve a estar seleccionado.
    expect(useProjectsMock).toHaveBeenLastCalledWith({})

    await user.click(screen.getByRole("combobox", { name: "Filtrar por estado" }))
    await user.click(await screen.findByRole("option", { name: "En ejecución" }))

    expect(useProjectsMock).toHaveBeenLastCalledWith({ estado: "EN_EJECUCION" })
    rerender(<ProjectList />)
    expect(screen.getByText("No encontramos proyectos con este estado")).toBeInTheDocument()
    // Con visibilidad de portafolio el filtro es la causa real: nunca el texto
    // de permisos.
    expect(screen.queryByText("Aún no tienes proyectos visibles")).not.toBeInTheDocument()
    expect(screen.queryByText("No hay proyectos para mostrar")).not.toBeInTheDocument()
  })

  it("shows the creation CTA to ADMINISTRADOR and GERENCIA", () => {
    userQuery.data = { id: "u1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" }
    const primera = render(<ProjectList />)
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toBeInTheDocument()
    primera.unmount()

    userQuery.data = { id: "u2", nombre: "Greta Gómez", rol: "GERENCIA" }
    render(<ProjectList />)
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toBeInTheDocument()
  })

  it("hides the creation CTA for a role without canCreateProject", () => {
    userQuery.data = { id: "u9", nombre: "Carlos Ruiz", rol: "COLABORADOR" }
    render(<ProjectList />)

    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).not.toBeInTheDocument()
  })

  it("hides the creation CTA while the current user is unknown", () => {
    userQuery.data = null
    render(<ProjectList />)

    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).not.toBeInTheDocument()
  })

  it("opens the creation dialog from the CTA", async () => {
    const user = userEvent.setup()
    render(<ProjectList />)

    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }))

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})

describe("formatFechaCalendario", () => {
  it("renders a Date with its UTC components", () => {
    // Columna @db.Date: el día UTC es el día calendario; nada de conversión local.
    expect(formatFechaCalendario(new Date(Date.UTC(2026, 0, 5)))).toBe("05 de ene de 2026")
    expect(formatFechaCalendario(new Date("2026-03-30T00:00:00.000Z"))).toBe("30 de mar de 2026")
  })

  it("renders the same calendar day for the string form", () => {
    expect(formatFechaCalendario("2026-01-05")).toBe("05 de ene de 2026")
  })

  it("renders — for null and undefined", () => {
    expect(formatFechaCalendario(null)).toBe("—")
    expect(formatFechaCalendario(undefined)).toBe("—")
  })

  it("renders — for unparsable or impossible dates", () => {
    expect(formatFechaCalendario("no-es-fecha")).toBe("—")
    expect(formatFechaCalendario("2026-02-30")).toBe("—")
  })
})
