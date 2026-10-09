import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ProjectFilters, ProjectListResponse, ProjectListRow } from "@/hooks/projects"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import { ProjectList } from "./project-list"
import { formatFechaCalendario } from "./project-display"

type ProjectsQueryState = {
  isLoading: boolean
  isError: boolean
  error: unknown
  data: ProjectListResponse | undefined
  refetch: ReturnType<typeof vi.fn>
}

type FichaQueryState = {
  isLoading: boolean
  isError: boolean
  error: unknown
  data: ProjectListRow | undefined
}

type UsuarioActual = { id: string; nombre: string; rol: string }
type CurrentUserState = { data: UsuarioActual | null }

const {
  toast,
  useProjectsMock,
  useProjectMock,
  useCurrentUserMock,
  projectsQuery,
  fichaQuery,
  userQuery,
  expenseQueue,
  dialogHooks,
} = vi.hoisted(() => {
  const projectsQuery: ProjectsQueryState = {
    isLoading: false,
    isError: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
  }
  const fichaQuery: FichaQueryState = {
    isLoading: false,
    isError: false,
    error: null,
    data: undefined,
  }
  const userQuery: CurrentUserState = { data: null }
  const expenseQueue: { data: { gastos: unknown[] } | undefined; isError: boolean } = { data: { gastos: [] }, isError: false }
  const queryState = { data: [], isLoading: false, isError: false }
  return {
    toast: { error: vi.fn(), success: vi.fn() },
    useProjectsMock: vi.fn<(filters: ProjectFilters) => ProjectsQueryState>(() => projectsQuery),
    useProjectMock: vi.fn<(id: string) => FichaQueryState>(() => fichaQuery),
    useCurrentUserMock: vi.fn<() => CurrentUserState>(() => userQuery),
    projectsQuery,
    fichaQuery,
    userQuery,
    expenseQueue,
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
  useProject: (...args: Parameters<typeof useProjectMock>) => useProjectMock(...args),
  // Self-contained on purpose: the factory is hoisted, so this entry avoids the
  // question of which outer bindings are safe to reference (the vi.hoisted
  // dialogHooks below are the ones that are). The mounted ficha calls this hook,
  // and here it only has to resolve to an empty history.
  useProjectAudit: () => ({ data: [], isLoading: false, isError: false, error: null }),
  // The ficha also mounts the Equipo section: an empty team, no mutations pending.
  useProjectMembers: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useAddProjectMember: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useRemoveProjectMember: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  }),
  // The Estructura header mounts the template import dialog (S7 U6) on a BORRADOR project for a
  // manager: an idle mutation and the two browser-download helpers.
  useImportTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  downloadProjectTemplate: vi.fn(),
  saveBlobAs: vi.fn(),
  ImportReportError: class ImportReportError extends Error {},
  // The ficha also mounts the Estructura técnica section: empty lists, no mutations pending.
  ...Object.fromEntries(
    [
      "useProjectObjectives",
      "useProjectActivities",
      "useProjectDeliverables",
      "useProjectIndicators",
    ].map((name) => [name, () => ({ data: [], isLoading: false, isError: false, error: null })]),
  ),
  ...Object.fromEntries(
    [
      "useCreateObjective", "useUpdateObjective", "useDeleteObjective",
      "useCreateActivity", "useUpdateActivity", "useDeleteActivity",
      "useCreateDeliverable", "useUpdateDeliverable", "useDeleteDeliverable",
      "useCreateIndicator", "useUpdateIndicator", "useDeleteIndicator",
    ].map((name) => [
      name,
      () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null, variables: undefined }),
    ]),
  ),
  // The ficha also mounts the Ejecución técnica section (S4 U6/U7): a loaded
  // semáforo with no activities, plus the read queries and write mutations.
  useProjectTechnicalStatus: () => ({
    data: {
      base: "vigente",
      corte: "2026-10-25",
      estado: "EN_EJECUCION",
      avance_real: 0,
      avance_programado: 0,
      desviacion_pp: 0,
      color: "verde",
      actividades: [],
      umbrales: { umbral1: 10, umbral2: 20, confirmado: true },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useDeliverableProgress: () => [],
  useIndicatorMeasurements: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useProjectBeneficiaries: () => ({
    data: { estado: "EN_EJECUCION", registros: [], total: 0 },
    isLoading: false,
    isError: false,
    error: null,
  }),
  ...Object.fromEntries(
    [
      "useCreateAvance", "useVoidAvance", "useAddAvanceMedio",
      "useCreateMedicion", "useVoidMedicion",
      "useCreateBeneficiario", "useVoidBeneficiario",
    ].map((name) => [
      name,
      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined }),
    ]),
  ),
  // The ficha also mounts the Indicadores panel (S9 U6): a loaded, measurable project, plus the export download.
  useProjectKpis: () => ({
    data: { base: "vigente", corte: "2026-10-25", estado: "EN_EJECUCION", medible: true, confirmado: true, tecnico: null, cronograma: null, entregables: null, indicadores: null, beneficiarios: null, financiero: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
  downloadProjectExport: vi.fn(),
  // The ficha also mounts the Presupuesto section (S5 U5): an empty budget, no programming, no mutations pending.
  useProjectBudget: () => ({
    data: { estado: "EN_EJECUCION", rubros: [], suma: "0.00", valor_total: null, diferencia: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useProjectProgramming: () => ({
    data: { estado: "EN_EJECUCION", periodos: [], filas: [], control_por_rubro: [], programacion_pendiente: true },
    isLoading: false,
    isError: false,
    error: null,
  }),
  // ... and the Ficha financiera section (S5 U6): a sheet with no budget lines.
  useProjectFinancialSheet: () => ({
    data: {
      base: "vigente",
      corte: "2026-01",
      estado: "EN_EJECUCION",
      ejecucion_disponible: false,
      rubros: [],
      total: {
        rubro_id: null, codigo: null, nombre: "Total", asignado: "0.00", programado: "0.00", ejecutado: "0.00",
        diferencia: "0.00", ep_decimas: null, ea_decimas: null, umbral_rojo: "0.00", color: null,
      },
      alerta_retraso: false,
      parametros: { tolerancia: 10, retraso: 70, confirmado: false },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  ...Object.fromEntries(
    ["useUpdateBudget", "useUpdateProgramming", "useSetValorTotal"].map((name) => [
      name,
      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined }),
    ]),
  ),
  // ... and the Gastos section (S6 U6) plus the validation queue: no expenses, nothing pending.
  useProjectExpenses: () => ({
    data: { gastos: [], totales: {} },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useExpenseValidationQueue: () => expenseQueue,
  ...Object.fromEntries(
    ["useCreateExpense", "useValidateExpense", "useRejectExpense", "useVoidExpense"].map((name) => [
      name,
      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined }),
    ]),
  ),
  downloadExpenseSoporte: vi.fn(),
  // ... and the Modificaciones queue and the Versiones section (S8 U6): nothing requested, one baseline version.
  useProjectModifications: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useProjectVersions: () => ({
    data: [
      { numero: 0, tipo: "LINEA_BASE", aprobado_at: "2026-10-08T15:00:00.000Z", aprobado_por: { id: "g1", nombre: "Gina" }, motivo: null, solicitud_id: null },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useProjectVersionCompare: () => ({
    data: { desde: "0", hasta: "vigente", diferencias: [] },
    isLoading: false,
    isError: false,
    error: null,
  }),
  ...Object.fromEntries(
    ["useRequestModification", "useApproveModification", "useRejectModification"].map((name) => [
      name,
      () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, variables: undefined }),
    ]),
  ),
  ModificacionReglasError: class ModificacionReglasError extends Error {},
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
  alertas: [],
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
    useProjectMock.mockClear()
    useCurrentUserMock.mockClear()
    expenseQueue.data = { gastos: [] }
    expenseQueue.isError = false
    projectsQuery.isLoading = false
    projectsQuery.isError = false
    projectsQuery.error = null
    projectsQuery.data = EMPTY
    projectsQuery.refetch.mockClear()
    useProjectsMock.mockReturnValue(projectsQuery)
    fichaQuery.isLoading = false
    fichaQuery.isError = false
    fichaQuery.error = null
    fichaQuery.data = PROYECTO
    useProjectMock.mockReturnValue(fichaQuery)
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

  describe("validation queue (S6)", () => {
    const pendiente = {
      id: "g1",
      proyecto_id: "p9",
      proyecto_codigo: "PRY-009",
      proyecto_nombre: "Otro",
      rubro: { id: "r1", codigo: "R12", nombre: "Transporte" },
      fecha_documento: "2026-10-15",
      periodo: "2026-10",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      numero_documento: "FE-1",
      descripcion: "Tiquetes",
      valor: "1500000.00",
      estado: "REGISTRADO",
      alerta_sobregasto: false,
      datos_incompletos: false,
      registrado_por_id: "otro",
      registrado_por_nombre: "Ana",
      propio: false,
      created_at: "2026-10-16T12:00:00.000Z",
    }

    it("mounts the queue above the table for managers", () => {
      expenseQueue.data = { gastos: [pendiente] }
      userQuery.data = { id: "u2", nombre: "Greta Gómez", rol: "GERENCIA" }
      render(<ProjectList />)
      expect(screen.getByTestId("cola-validacion")).toHaveTextContent("PRY-009")
    })

    it("does not mount the queue for other roles", () => {
      expenseQueue.data = { gastos: [pendiente] }
      userQuery.data = { id: "u9", nombre: "Carlos Ruiz", rol: "COORDINADOR" }
      render(<ProjectList />)
      expect(screen.queryByTestId("cola-validacion")).not.toBeInTheDocument()
    })
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

  it("opens the ficha for the row's project from 'Ver detalle'", async () => {
    const user = userEvent.setup()
    projectsQuery.data = { proyectos: [PROYECTO] }

    render(<ProjectList />)
    await user.click(screen.getByRole("button", { name: /Ver detalle/ }))

    // La petición es por el id de la fila, no por un id fijo.
    expect(useProjectMock).toHaveBeenCalledWith("p1")
    const ficha = await screen.findByRole("dialog")
    expect(within(ficha).getByText("PRY-2026-001")).toBeInTheDocument()
    expect(within(ficha).getByText(PROYECTO.nombre)).toBeInTheDocument()
  })

  it("mounts the modifications queue and the versions section in the opened ficha (S8 U6)", async () => {
    const user = userEvent.setup()
    projectsQuery.data = { proyectos: [PROYECTO] }

    render(<ProjectList />)
    await user.click(screen.getByRole("button", { name: /Ver detalle/ }))

    const ficha = await screen.findByRole("dialog")
    await user.click(within(ficha).getByRole("tab", { name: "Cambios" }))
    expect(within(ficha).getByTestId("modificaciones")).toHaveTextContent("Aún no hay solicitudes de modificación.")
    expect(within(ficha).getByTestId("versiones")).toHaveTextContent("v0")
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
