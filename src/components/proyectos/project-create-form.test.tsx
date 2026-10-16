// Create-project form body (shared by the dialog and the /proyectos/nuevo stepper). These tests pin the
// client-first flow (M1/M2: client required, its card, its opportunities, derived origin and endpoint) and
// what the page relies on: the `onCreated` / `onCreatedWithoutId` callbacks, the optional cancel button,
// the submit label, the help hints and the absence of dialog chrome in the page variant.

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import type { ClientListRow } from "@/hooks/crm"
import type { EligibleOpportunity, Municipality, StrategicLine } from "@/hooks/projects"
import { ProjectCreateForm } from "./project-create-form"

type MutationState = { isPending: boolean; mutateAsync: ReturnType<typeof vi.fn> }

const {
  useEligibleOpportunitiesMock,
  useStrategicLinesMock,
  useMunicipalitiesMock,
  useCreateProjectMock,
  useCreateProjectFromOpportunityMock,
  useUsersMock,
  useClientsMock,
  useCurrentUserMock,
  useClientDetailMock,
  useContactsMock,
} = vi.hoisted(() => ({
  useEligibleOpportunitiesMock: vi.fn(),
  useStrategicLinesMock: vi.fn(),
  useMunicipalitiesMock: vi.fn(),
  useCreateProjectMock: vi.fn(),
  useCreateProjectFromOpportunityMock: vi.fn(),
  useUsersMock: vi.fn(),
  useClientsMock: vi.fn(),
  useCurrentUserMock: vi.fn(),
  useClientDetailMock: vi.fn(),
  useContactsMock: vi.fn(),
}))

vi.mock("@/hooks/projects", () => ({
  useEligibleOpportunities: useEligibleOpportunitiesMock,
  useStrategicLines: useStrategicLinesMock,
  useMunicipalities: useMunicipalitiesMock,
  useCreateProject: useCreateProjectMock,
  useCreateProjectFromOpportunity: useCreateProjectFromOpportunityMock,
}))

vi.mock("@/hooks/crm", () => ({
  useUsers: useUsersMock,
  useClients: useClientsMock,
  useClientDetail: useClientDetailMock,
  useContacts: useContactsMock,
}))

vi.mock("@/hooks/kanban", () => ({
  useCurrentUser: useCurrentUserMock,
}))

const USER = { id: "u1", nombre: "Ana Pérez", rol: "ADMINISTRADOR" }

const OPORTUNIDAD: EligibleOpportunity = {
  id: "op-1",
  nombre: "Consultoría línea base",
  cliente_id: "cli-1",
  cliente_nombre: "Alcaldía de Barranquilla",
  valor_estimado_cop: "180000000.00",
}

const OPORTUNIDAD_2: EligibleOpportunity = {
  id: "op-2",
  nombre: "Oportunidad de otro cliente",
  cliente_id: "cli-2",
  cliente_nombre: "Gobernación del Atlántico",
  valor_estimado_cop: null,
}

const LINEAS: StrategicLine[] = [
  { id: "l1", codigo: "LE-01", nombre: "Educación", activo: true, fecha_suspension: null, orden: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "l2", codigo: "LE-02", nombre: "Salud", activo: true, fecha_suspension: null, orden: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
]

const MUNICIPIOS: Municipality[] = [
  { id: "m1", nombre: "Barranquilla", departamento: "Atlántico", codigo_dane: "08001", activo: true, fecha_suspension: null, orden: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
]

const CLIENTES: { data: { items: Pick<ClientListRow, "id" | "nombre">[] } } = {
  data: {
    items: [
      { id: "c1", nombre: "Cliente Uno" },
      { id: "cli-1", nombre: "Alcaldía de Barranquilla" },
      { id: "cli-2", nombre: "Gobernación del Atlántico" },
    ],
  },
}

let createProject: MutationState
let createFromOpportunity: MutationState

function renderForm(props: Partial<React.ComponentProps<typeof ProjectCreateForm>> = {}) {
  const onCreated = vi.fn()
  const view = render(<ProjectCreateForm onCreated={onCreated} {...props} />)
  return { onCreated, ...view }
}

type User = ReturnType<typeof userEvent.setup>

async function elegirCliente(user: User, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Cliente" }))
  await user.click(await screen.findByRole("option", { name: nombre }))
}

async function elegirOportunidad(user: User, nombre: RegExp | string) {
  await user.click(screen.getByRole("combobox", { name: "Oportunidad" }))
  await user.click(await screen.findByRole("option", { name: nombre }))
}

async function crearDesdeOportunidad(user: User) {
  await elegirCliente(user, "Alcaldía de Barranquilla")
  await elegirOportunidad(user, /Consultoría línea base/)
  await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
}

describe("ProjectCreateForm", () => {
  beforeEach(() => {
    createProject = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ proyecto: {} }) }
    createFromOpportunity = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ proyecto: {} }) }

    useEligibleOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false })
    useStrategicLinesMock.mockReturnValue({ data: LINEAS, isLoading: false, isError: false })
    useMunicipalitiesMock.mockReturnValue({ data: MUNICIPIOS, isLoading: false, isError: false })
    useUsersMock.mockReturnValue({ data: [{ id: "u1", nombre: "Ana Pérez" }], isLoading: false, isError: false })
    useClientsMock.mockReturnValue(CLIENTES)
    useClientDetailMock.mockReturnValue({
      data: {
        id: "cli-1",
        nombre: "Alcaldía de Barranquilla",
        empresa: null,
        tipo_cliente: "GOBIERNO_LOCAL",
        ubicacion: "Barranquilla, Atlántico",
        oportunidades_count: 2,
      },
      isLoading: false,
      isError: false,
    })
    useContactsMock.mockReturnValue({
      data: [{ id: "k1", nombre: "Marta Decide", cargo: null, correo: "marta@x.co", telefono: "3001234567", rol_decision: "DECISOR" }],
      isLoading: false,
      isError: false,
    })
    useCurrentUserMock.mockReturnValue({ data: USER })
    useCreateProjectMock.mockReturnValue(createProject)
    useCreateProjectFromOpportunityMock.mockReturnValue(createFromOpportunity)
  })

  it("calls onCreated with the created project (id, codigo, nombre) on the opportunity path", async () => {
    const user = userEvent.setup()
    createFromOpportunity.mutateAsync.mockResolvedValueOnce({
      proyecto: { id: "p-new", codigo: "PRY-2026-009", nombre: "Consultoría línea base" },
    })
    const { onCreated } = renderForm()

    await crearDesdeOportunidad(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ id: "p-new", codigo: "PRY-2026-009", nombre: "Consultoría línea base" }),
    )
  })

  it("calls onCreated on the independent path too", async () => {
    const user = userEvent.setup()
    createProject.mutateAsync.mockResolvedValueOnce({ proyecto: { id: "p-ind", codigo: "PRY-2026-010", nombre: "Libre" } })
    const { onCreated } = renderForm()

    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Libre")
    await user.type(screen.getByLabelText("Valor total"), "1000000")
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "p-ind", codigo: "PRY-2026-010", nombre: "Libre" }))
  })

  it("sends the trimmed description with the project, and omits it when left blank", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Libre")
    await user.type(screen.getByLabelText("Valor total"), "1000000")
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.type(screen.getByLabelText("Descripción (opcional)"), "  Alcance del convenio  ")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    expect(createProject.mutateAsync.mock.calls[0][0]).toMatchObject({ descripcion: "Alcance del convenio" })
  })

  it("does not send a description when the field is blank", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Libre")
    await user.type(screen.getByLabelText("Valor total"), "1000000")
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.type(screen.getByLabelText("Descripción (opcional)"), "   ")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    expect(createProject.mutateAsync.mock.calls[0][0]).not.toHaveProperty("descripcion")
  })

  it("toggles the municipio and línea checkboxes from their visible names (clickable labels)", async () => {
    const user = userEvent.setup()
    renderForm()

    const municipio = screen.getByRole("checkbox", { name: "Municipio Barranquilla" })
    expect(municipio).not.toBeChecked()
    await user.click(screen.getByText("Barranquilla"))
    expect(municipio).toBeChecked()
    await user.click(screen.getByText("Barranquilla"))
    expect(municipio).not.toBeChecked()

    const linea = screen.getByRole("checkbox", { name: "Incluir Salud" })
    expect(linea).not.toBeChecked()
    await user.click(screen.getByText("Salud"))
    expect(linea).toBeChecked()
  })

  it("calls onCreatedWithoutId (not onCreated) when the server returns no project id", async () => {
    const user = userEvent.setup()
    const onCreatedWithoutId = vi.fn()
    const { onCreated } = renderForm({ onCreatedWithoutId })

    await crearDesdeOportunidad(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(onCreatedWithoutId).toHaveBeenCalledTimes(1))
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("keeps the form and shows the server message when the creation fails", async () => {
    const user = userEvent.setup()
    createFromOpportunity.mutateAsync.mockRejectedValueOnce(
      new ApiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT"),
    )
    const { onCreated } = renderForm()

    await crearDesdeOportunidad(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta oportunidad ya tiene un proyecto.")
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("fires nothing and reports the validation error when no municipio is chosen", async () => {
    const user = userEvent.setup()
    const { onCreated } = renderForm()

    await elegirCliente(user, "Alcaldía de Barranquilla")
    await elegirOportunidad(user, /Consultoría línea base/)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona al menos un municipio.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("preselects initialOportunidadId together with its client", () => {
    renderForm({ initialOportunidadId: "op-1" })
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
    expect(screen.getByLabelText("Valor total")).toHaveValue(180000000)
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Alcaldía de Barranquilla")
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toHaveTextContent("Consultoría línea base")
  })

  it("preselects initialClienteId and shows its card, without choosing an opportunity", () => {
    renderForm({ initialClienteId: "cli-1" })
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Alcaldía de Barranquilla")
    expect(screen.getByRole("region", { name: "Datos del cliente" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toHaveTextContent("Sin oportunidad")
    expect(screen.getByLabelText("Nombre")).toHaveValue("")
  })

  it("asks for the client first: no card and a disabled opportunity select until one is chosen", () => {
    renderForm()
    expect(screen.queryByRole("region", { name: "Datos del cliente" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toBeDisabled()
    const cliente = screen.getByRole("combobox", { name: "Cliente" })
    const oportunidad = screen.getByRole("combobox", { name: "Oportunidad" })
    expect(cliente.compareDocumentPosition(oportunidad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Proyecto independiente|oportunidad ganada/i })).not.toBeInTheDocument()
  })

  it("requires the client and fires nothing without one", async () => {
    const user = userEvent.setup()
    const { onCreated } = renderForm()
    await user.type(screen.getByLabelText("Valor total"), "1000")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona el cliente.")
    expect(createProject.mutateAsync).not.toHaveBeenCalled()
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("shows the client card with the data available once a client is chosen", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Alcaldía de Barranquilla")
    const tarjeta = screen.getByRole("region", { name: "Datos del cliente" })
    expect(tarjeta).toHaveTextContent("Barranquilla, Atlántico")
    expect(tarjeta).toHaveTextContent("Marta Decide")
    expect(tarjeta).toHaveTextContent("marta@x.co")
    expect(useClientDetailMock).toHaveBeenLastCalledWith("cli-1")
  })

  it("lists only that client's opportunities, after the 'Sin oportunidad' option", async () => {
    const user = userEvent.setup()
    useEligibleOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD, OPORTUNIDAD_2], isLoading: false, isError: false })
    renderForm()
    await elegirCliente(user, "Alcaldía de Barranquilla")
    await user.click(screen.getByRole("combobox", { name: "Oportunidad" }))
    const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent ?? "")
    expect(opciones[0]).toBe("Sin oportunidad (proyecto independiente)")
    expect(opciones).toHaveLength(2)
    expect(opciones[1]).toContain("Consultoría línea base")
    expect(opciones.join("|")).not.toContain("Oportunidad de otro cliente")
  })

  it("says so when the client has no eligible opportunity", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Cliente Uno")
    expect(screen.getByText("Este cliente no tiene oportunidades ganadas sin proyecto.")).toBeInTheDocument()
  })

  it("derives origin OPORTUNIDAD: posts to the conversion endpoint without cliente_id", async () => {
    const user = userEvent.setup()
    renderForm()
    await crearDesdeOportunidad(user)
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
    expect(screen.getByLabelText("Valor total")).toHaveValue(180000000)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createFromOpportunity.mutateAsync).toHaveBeenCalled())
    expect(useCreateProjectFromOpportunityMock).toHaveBeenLastCalledWith("cli-1", "op-1")
    const body = createFromOpportunity.mutateAsync.mock.calls[0][0]
    expect(body).not.toHaveProperty("cliente_id")
    expect(body).not.toHaveProperty("oportunidad_id")
    expect(body.valor_total).toBe(180000000)
    expect(createProject.mutateAsync).not.toHaveBeenCalled()
  })

  it("derives origin INDEPENDIENTE when 'Sin oportunidad' stays selected: posts cliente_id", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Alcaldía de Barranquilla")
    await user.type(screen.getByLabelText("Nombre"), "Proyecto propio")
    await user.type(screen.getByLabelText("Valor total"), "2500000")
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    const body = createProject.mutateAsync.mock.calls[0][0]
    expect(body).toMatchObject({ cliente_id: "cli-1", nombre: "Proyecto propio", valor_total: 2500000 })
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("keeps the typed name and value when the opportunity is dropped, and resets them when the client changes", async () => {
    const user = userEvent.setup()
    renderForm()
    await elegirCliente(user, "Alcaldía de Barranquilla")
    await elegirOportunidad(user, /Consultoría línea base/)
    await elegirOportunidad(user, "Sin oportunidad (proyecto independiente)")
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")

    await elegirOportunidad(user, /Consultoría línea base/)
    await elegirCliente(user, "Cliente Uno")
    expect(screen.getByLabelText("Nombre")).toHaveValue("")
    expect(screen.getByLabelText("Valor total")).toHaveValue(null)
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toHaveTextContent("Sin oportunidad")
  })

  it("keeps requiring a valor total greater than zero on an opportunity without value", async () => {
    const user = userEvent.setup()
    useEligibleOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD_2], isLoading: false, isError: false })
    renderForm()
    await elegirCliente(user, "Gobernación del Atlántico")
    await elegirOportunidad(user, /Oportunidad de otro cliente/)
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("El valor total debe ser mayor que cero.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("offers a name search once the client list is long, keeping the selected client", async () => {
    const user = userEvent.setup()
    const muchos = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, nombre: `Entidad ${i}` }))
    useClientsMock.mockReturnValue({ data: { items: [...muchos, { id: "z", nombre: "Zeta Final" }] } })
    renderForm()
    await user.type(screen.getByRole("searchbox", { name: "Buscar cliente" }), "zeta")
    await user.click(screen.getByRole("combobox", { name: "Cliente" }))
    expect(await screen.findAllByRole("option")).toHaveLength(1)
    expect(screen.getByRole("option", { name: "Zeta Final" })).toBeInTheDocument()
  })

  it("explains the non-obvious fields with accessible help buttons", async () => {
    const user = userEvent.setup()
    renderForm()
    for (const [nombre, texto] of [
      ["Valor total", "Valor total del contrato o convenio; debe ser mayor que cero."],
      ["Fechas", /anterior a la de fin/],
      ["Cliente", /oportunidades ganadas sin proyecto/],
      ["Oportunidad", /Sin oportunidad, el proyecto es independiente/],
      ["Línea estratégica principal", /Exactamente una debe ser la principal/],
      ["Municipios", /al menos uno/],
      ["Beneficiarios", /personas/],
      ["Descripción", /Alcance|objetivo/],
    ] as const) {
      await user.click(screen.getByRole("button", { name: `Ayuda: ${nombre}` }))
      expect(await screen.findByText(texto)).toBeInTheDocument()
      await user.keyboard("{Escape}")
    }
  })

  it("renders Cancelar only when onCancel is given and honours submitLabel", async () => {
    const user = userEvent.setup()
    const first = renderForm({ submitLabel: "Crear y continuar" })
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Crear y continuar" })).toBeInTheDocument()
    first.unmount()

    const onCancel = vi.fn()
    renderForm({ onCancel })
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("page variant has no dialog footer chrome", () => {
    const { container } = renderForm({ variant: "page" })
    expect(container.querySelector('[data-slot="dialog-footer"]')).toBeNull()
  })
})
