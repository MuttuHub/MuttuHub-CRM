// oportunidades-comerciales task 5.1: lifecycle view — estado, fase,
// fecha_envio_propuesta, linked tasks, bitácora, and the Convert action
// (RF-C04, D2/D5/D7). The Convert button is the highest-risk affordance: it
// must only appear for a GANADA opportunity still in PROSPECCION, and never
// when the caller is read-only.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BitacoraEntrada, Contacto, Oportunidad, TaskItem } from "@/hooks/crm"
import { ContactoFormDialog, OportunidadFormDialog, OportunidadLifecycleDialog } from "./entity-dialogs"

const noopMutation = {
  isPending: false,
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
}

// Hoisted so the vi.mock factory below (itself hoisted above imports by
// vitest) can reference these mocks, and individual tests can override their
// return value per-case with mockReturnValueOnce without touching the
// baseline empty-list behavior every other test relies on.
const { useTasksByOportunidadMock, useBitacoraMock, useEligibleOpportunitiesMock, useCurrentUserMock, contactoMocks } =
  vi.hoisted(() => ({
  // Default: nobody logged in and nothing eligible, so the project-conversion
  // button stays hidden for every pre-existing test.
  useEligibleOpportunitiesMock: vi.fn<
    (options?: { enabled?: boolean }) => { data: { id: string }[] | undefined }
  >(() => ({ data: [] })),
  useCurrentUserMock: vi.fn<() => { data: { id: string; rol: string } | null }>(() => ({ data: null })),
  useTasksByOportunidadMock: vi.fn<() => { data: TaskItem[]; isLoading: boolean; isError: boolean }>(
    () => ({ data: [], isLoading: false, isError: false }),
  ),
  useBitacoraMock: vi.fn<() => { data: BitacoraEntrada[]; isLoading: boolean; isError: boolean }>(
    () => ({ data: [], isLoading: false, isError: false }),
  ),
  // v7 C4b: ContactoFormDialog now reads the user catalog and writes contacts;
  // both mutations are stubbed so the test can assert the payload mapping.
  contactoMocks: {
    create: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    update: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    createOportunidad: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    updateOportunidad: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    users: [
      { id: "u1", nombre: "Ana Pérez" },
      { id: "u2", nombre: "Bruno Díaz" },
    ],
  },
}))

vi.mock("@/hooks/projects", () => ({
  useEligibleOpportunities: useEligibleOpportunitiesMock,
}))

vi.mock("@/hooks/kanban", () => ({
  useCurrentUser: useCurrentUserMock,
}))

vi.mock("@/components/proyectos/project-create-dialog", () => ({
  ProjectCreateDialog: ({
    open,
    initialOportunidadId,
  }: {
    open: boolean
    initialOportunidadId?: string
  }) =>
    open ? <div data-testid="project-create-dialog">preselected:{initialOportunidadId}</div> : null,
}))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useTasksByOportunidad: useTasksByOportunidadMock,
    useTasksByClient: () => ({ data: [], isLoading: false, isError: false }),
    useBitacora: useBitacoraMock,
    useConvertOportunidad: () => noopMutation,
    useUpdateTarea: () => noopMutation,
    useAddLogEntry: () => noopMutation,
    useUsers: () => ({ data: contactoMocks.users }),
    useCreateContacto: () => contactoMocks.create,
    useUpdateContacto: () => contactoMocks.update,
    useCreateOportunidad: () => contactoMocks.createOportunidad,
    useUpdateOportunidad: () => contactoMocks.updateOportunidad,
  }
})

const BASE_OPORTUNIDAD: Oportunidad = {
  id: "op-1",
  nombre: "Consultoría línea base 2026",
  problema_detectado: null,
  solucion_propuesta: null,
  servicios_interes: null,
  valor_estimado_cop: null,
  estado: "GANADA",
  fecha_ultima_gestion: null,
  fase: "PROSPECCION",
  fecha_adjudicacion: null,
  fecha_envio_propuesta: "2026-01-05T15:00:00.000Z",
  proyectos_relacionados: null,
  created_at: "2025-01-01T00:00:00.000Z",
}

function renderDialog(oportunidad: Oportunidad | null, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OportunidadLifecycleDialog
        clientId="cli-1"
        open={oportunidad !== null}
        onOpenChange={vi.fn()}
        oportunidad={oportunidad}
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  )
}

describe("OportunidadLifecycleDialog", () => {
  it("renders estado, fase and the fixed fecha_envio_propuesta", () => {
    renderDialog(BASE_OPORTUNIDAD)

    expect(screen.getByText("Prospección")).toBeInTheDocument()
    expect(screen.getAllByText(/Ganada/i).length).toBeGreaterThan(0)
    expect(screen.getByText("05 de ene de 2026")).toBeInTheDocument()
  })

  it("shows the Convertir action when estado is GANADA, fase is PROSPECCION, and not read-only", () => {
    renderDialog(BASE_OPORTUNIDAD)

    expect(screen.getByRole("button", { name: /Convertir/i })).toBeInTheDocument()
  })

  it("hides the Convertir action once fase is already EJECUCION (D7 — idempotent, no repeat conversion)", () => {
    renderDialog({ ...BASE_OPORTUNIDAD, fase: "EJECUCION" })

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
    expect(screen.getByText("Ejecución")).toBeInTheDocument()
  })

  it("hides the Convertir action when the caller is read-only", () => {
    renderDialog(BASE_OPORTUNIDAD, true)

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
  })

  it("hides the Convertir action when estado is not GANADA", () => {
    renderDialog({ ...BASE_OPORTUNIDAD, estado: "EN_NEGOCIACION" })

    expect(screen.queryByRole("button", { name: /Convertir/i })).not.toBeInTheDocument()
  })

  it("renders linked task titles and bitácora entries when the lists are populated", () => {
    const LINKED_TASK: TaskItem = {
      id: "t-1",
      titulo: "Enviar cotización actualizada",
      descripcion: null,
      responsable_id: "u-1",
      responsable_nombre: "Ana Ríos",
      cliente_id: "cli-1",
      cliente_nombre: "Cliente Demo",
      oportunidad_id: BASE_OPORTUNIDAD.id,
      oportunidad_nombre: BASE_OPORTUNIDAD.nombre,
      oportunidad_fase: "PROSPECCION",
      estado: "EN_CURSO",
      origen: "CRM",
      prioridad: "ALTA",
      fecha_entrega: null,
      etiquetas: [],
      motivo_bloqueo: null,
      comentarios_count: 0,
      subtotal: 0,
      created_at: "2026-01-05T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z",
      puede_editar: true,
    }
    const LOG_ENTRY: BitacoraEntrada = {
      id: "log-1",
      autor_id: "u-1",
      autor_nombre: "Ana Ríos",
      texto: "Llamada de seguimiento con el cliente",
      oportunidad_id: BASE_OPORTUNIDAD.id,
      tipo: "LLAMADA",
      proximo_paso: null,
      created_at: "2026-01-06T00:00:00.000Z",
    }
    useTasksByOportunidadMock.mockReturnValueOnce({
      data: [LINKED_TASK],
      isLoading: false,
      isError: false,
    })
    useBitacoraMock.mockReturnValueOnce({
      data: [LOG_ENTRY],
      isLoading: false,
      isError: false,
    })

    renderDialog(BASE_OPORTUNIDAD)

    expect(screen.getByText("Enviar cotización actualizada")).toBeInTheDocument()
    expect(screen.queryByText("Sin tareas vinculadas todavía.")).not.toBeInTheDocument()
    expect(screen.getByText(/Llamada de seguimiento con el cliente/)).toBeInTheDocument()
    expect(screen.getByText("Ana Ríos:")).toBeInTheDocument()
    expect(
      screen.queryByText("Sin entradas de bitácora para esta oportunidad."),
    ).not.toBeInTheDocument()
  })

  describe("Convertir en proyecto (S11 U1)", () => {
    function asManager(eligibleIds: string[] = [BASE_OPORTUNIDAD.id]) {
      useCurrentUserMock.mockReturnValue({ data: { id: "u-1", rol: "GERENCIA" } })
      useEligibleOpportunitiesMock.mockReturnValue({ data: eligibleIds.map((id) => ({ id })) })
    }

    it("shows the action for a GANADA opportunity without a project and a permitted user", () => {
      asManager()
      renderDialog(BASE_OPORTUNIDAD)

      expect(screen.getByRole("link", { name: "Convertir en proyecto" })).toBeInTheDocument()
    })

    it("keeps the existing 'Convertir a ejecución' button next to it", () => {
      asManager()
      renderDialog(BASE_OPORTUNIDAD)

      expect(screen.getByRole("button", { name: "Convertir a ejecución" })).toBeInTheDocument()
    })

    it("hides it when the opportunity already has a project (not in the eligible list)", () => {
      asManager([])
      renderDialog({ ...BASE_OPORTUNIDAD, fase: "EJECUCION" })

      expect(screen.queryByRole("link", { name: "Convertir en proyecto" })).not.toBeInTheDocument()
    })

    it("hides it when the opportunity is not GANADA", () => {
      asManager()
      renderDialog({ ...BASE_OPORTUNIDAD, estado: "EN_NEGOCIACION" })

      expect(screen.queryByRole("link", { name: "Convertir en proyecto" })).not.toBeInTheDocument()
    })

    it("shows it to a COORDINADOR (S1: any role creates)", () => {
      useCurrentUserMock.mockReturnValue({ data: { id: "u-2", rol: "COORDINADOR" } })
      useEligibleOpportunitiesMock.mockReturnValue({ data: [{ id: BASE_OPORTUNIDAD.id }] })
      renderDialog(BASE_OPORTUNIDAD)

      expect(screen.getByRole("link", { name: "Convertir en proyecto" })).toBeInTheDocument()
    })

    it("fetches the eligible list for a COORDINADOR", () => {
      useCurrentUserMock.mockReturnValue({ data: { id: "u-2", rol: "COORDINADOR" } })
      renderDialog(BASE_OPORTUNIDAD)

      expect(useEligibleOpportunitiesMock).toHaveBeenLastCalledWith({ enabled: true })
    })

    it("links to the stepper page with this opportunity preselected", () => {
      asManager()
      renderDialog(BASE_OPORTUNIDAD)

      expect(screen.getByRole("link", { name: "Convertir en proyecto" })).toHaveAttribute(
        "href",
        `/proyectos/nuevo?oportunidad=${BASE_OPORTUNIDAD.id}`,
      )
      expect(screen.queryByTestId("project-create-dialog")).not.toBeInTheDocument()
    })
  })
})

// v7 alignment, unit C4b: ContactoFormDialog gains the four Relaciones fields
// (poder, interés, fuerza_relacion, owner). They must prefill from the contact,
// be editable, and map back to the nullable API payload (sentinel "none" → null)
// without disturbing the pre-existing fields.
const BASE_CONTACTO: Contacto = {
  id: "ct-1",
  nombre: "Laura Gómez",
  cargo: "Secretaria de Gobierno",
  correo: null,
  telefono: null,
  rol_decision: "DECISOR",
  notas: null,
  poder: 5,
  interes: 2,
  fuerza_relacion: 3,
  owner_id: "u2",
  created_at: "2026-01-05T00:00:00.000Z",
}

function renderContactoDialog(contacto: Contacto | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (open: boolean) => (
    <QueryClientProvider client={qc}>
      <ContactoFormDialog
        clientId="cli-1"
        open={open}
        onOpenChange={vi.fn()}
        contacto={contacto}
      />
    </QueryClientProvider>
  )
  // The dialog prefills its form on the closed → open transition (the real
  // mount path: the sheet renders it closed, then opens it on edit), so the
  // helper walks that transition instead of mounting it already open.
  const view = render(tree(false))
  view.rerender(tree(true))
  return view
}

describe("ContactoFormDialog (v7 C4b)", () => {
  beforeEach(() => {
    contactoMocks.create.mutateAsync.mockClear()
    contactoMocks.update.mutateAsync.mockClear()
  })

  it("exposes the four Relaciones fields", () => {
    renderContactoDialog(null)

    expect(screen.getByLabelText("Poder")).toBeInTheDocument()
    expect(screen.getByLabelText("Interés")).toBeInTheDocument()
    expect(screen.getByLabelText("Fuerza de la relación")).toBeInTheDocument()
    expect(screen.getByLabelText("Relación")).toBeInTheDocument()
  })

  it("sends the v7 fields when editing an existing contact", async () => {
    const user = userEvent.setup()
    renderContactoDialog(BASE_CONTACTO)

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(contactoMocks.update.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Laura Gómez",
        rol_decision: "DECISOR",
        poder: 5,
        interes: 2,
        fuerza_relacion: 3,
        owner_id: "u2",
      }),
    )
  })

  it("sends nulls for a new contact with nothing set", async () => {
    const user = userEvent.setup()
    renderContactoDialog(null)

    await user.type(screen.getByLabelText(/Nombre/), "Nuevo Contacto")
    await user.click(screen.getByRole("button", { name: "Agregar contacto" }))

    expect(contactoMocks.create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Nuevo Contacto",
        poder: null,
        interes: null,
        fuerza_relacion: null,
        owner_id: null,
      }),
    )
  })

  it("lets the user set the power level and the relationship owner", async () => {
    const user = userEvent.setup()
    renderContactoDialog(null)

    await user.type(screen.getByLabelText(/Nombre/), "Nuevo Contacto")
    await user.click(screen.getByLabelText("Poder"))
    await user.click(await screen.findByRole("option", { name: "5" }))
    await user.click(screen.getByLabelText("Relación"))
    await user.click(await screen.findByRole("option", { name: "Bruno Díaz" }))
    await user.click(screen.getByRole("button", { name: "Agregar contacto" }))

    expect(contactoMocks.create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ poder: 5, owner_id: "u2" }),
    )
  })
})

describe("CRM form dialogs lock Cancelar while saving (modal review 2.7)", () => {
  it("disables Cancelar on the contact dialog while the save is in flight", () => {
    contactoMocks.create.isPending = true
    try {
      renderContactoDialog(null)
      expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    } finally {
      contactoMocks.create.isPending = false
    }
  })

  it("disables Cancelar on the opportunity dialog while the save is in flight", () => {
    contactoMocks.createOportunidad.isPending = true
    try {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={qc}>
          <OportunidadFormDialog clientId="cli-1" open onOpenChange={vi.fn()} oportunidad={null} />
        </QueryClientProvider>,
      )
      expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    } finally {
      contactoMocks.createOportunidad.isPending = false
    }
  })

  it("keeps Cancelar enabled on the contact dialog when nothing is saving", () => {
    renderContactoDialog(null)
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled()
  })
})
