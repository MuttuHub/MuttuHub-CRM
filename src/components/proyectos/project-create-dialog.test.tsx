// Diálogo de creación de proyectos (S2.4, unidad 2). Se elige primero el cliente
// (M1); la conversión de una oportunidad GANADA y el proyecto independiente son
// la misma pantalla y el origen se deduce. Estas pruebas fijan el contrato observable: qué se
// muestra, qué se prefija, qué se valida antes de disparar la petición y qué
// campos viajan (o no viajan) en el cuerpo.

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import type { ClientListRow } from "@/hooks/crm"
import type { EligibleOpportunity, Municipality, StrategicLine } from "@/hooks/projects"
import { ProjectCreateDialog } from "./project-create-dialog"

type QueryState<T> = { data: T | undefined; isLoading: boolean; isError: boolean }
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
  nombre: "Segunda oportunidad ganada",
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

function renderDialog(
  onOpenChange: (open: boolean) => void = vi.fn(),
  initialOportunidadId?: string,
) {
  return render(
    <ProjectCreateDialog
      open
      onOpenChange={onOpenChange}
      initialOportunidadId={initialOportunidadId}
    />,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function elegirCliente(user: User, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Cliente" }))
  await user.click(await screen.findByRole("option", { name: nombre }))
}

/** Cliente primero y luego la oportunidad de ese cliente (por defecto la primera, de «Alcaldía de Barranquilla»). */
async function elegirOportunidad(
  user: User,
  cliente = "Alcaldía de Barranquilla",
  oportunidad: RegExp = /Consultoría línea base/,
) {
  await elegirCliente(user, cliente)
  await user.click(screen.getByRole("combobox", { name: "Oportunidad" }))
  await user.click(await screen.findByRole("option", { name: oportunidad }))
}

async function elegirMunicipio(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
}

describe("ProjectCreateDialog", () => {
  beforeEach(() => {
    createProject = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ proyecto: {} }) }
    createFromOpportunity = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ proyecto: {} }) }

    useEligibleOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false } satisfies QueryState<EligibleOpportunity[]>)
    useStrategicLinesMock.mockReturnValue({ data: LINEAS, isLoading: false, isError: false } satisfies QueryState<StrategicLine[]>)
    useMunicipalitiesMock.mockReturnValue({ data: MUNICIPIOS, isLoading: false, isError: false } satisfies QueryState<Municipality[]>)
    useUsersMock.mockReturnValue({ data: [{ id: "u1", nombre: "Ana Pérez" }, { id: "u2", nombre: "Beto Ruiz" }], isLoading: false, isError: false })
    useClientsMock.mockReturnValue(CLIENTES)
    useClientDetailMock.mockReturnValue({
      data: { id: "cli-1", nombre: "Alcaldía de Barranquilla", empresa: null, tipo_cliente: "GOBIERNO_LOCAL", ubicacion: null, oportunidades_count: 1 },
      isLoading: false,
      isError: false,
    })
    useContactsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    useCurrentUserMock.mockReturnValue({ data: USER })
    useCreateProjectMock.mockReturnValue(createProject)
    useCreateProjectFromOpportunityMock.mockReturnValue(createFromOpportunity)
  })

  it("preselects the opportunity given by initialOportunidadId (name, value and client prefilled)", () => {
    useEligibleOpportunitiesMock.mockReturnValue({
      data: [OPORTUNIDAD, OPORTUNIDAD_2],
      isLoading: false,
      isError: false,
    } satisfies QueryState<EligibleOpportunity[]>)

    renderDialog(vi.fn(), "op-1")

    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Alcaldía de Barranquilla")
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toHaveTextContent("Consultoría línea base")
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
    expect(screen.getByLabelText("Valor total")).toHaveValue("180.000.000")
  })

  it("preselects once the eligible list arrives after the first render", () => {
    useEligibleOpportunitiesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const view = renderDialog(vi.fn(), "op-1")
    expect(screen.queryByLabelText("Nombre")).toHaveValue("")

    useEligibleOpportunitiesMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false })
    view.rerender(<ProjectCreateDialog open onOpenChange={vi.fn()} initialOportunidadId="op-1" />)

    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
  })

  it("still requires municipios when the opportunity is preselected", async () => {
    const user = userEvent.setup()
    renderDialog(vi.fn(), "op-1")

    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByText("Selecciona al menos un municipio.")).toBeInTheDocument()
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("opens asking for the client, with no origin toggle and the opportunity select disabled", () => {
    renderDialog()

    expect(screen.getByRole("combobox", { name: "Cliente" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Oportunidad" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Proyecto independiente" })).not.toBeInTheDocument()
  })

  it("lists only the chosen client's opportunities returned by the endpoint, with their value", async () => {
    useEligibleOpportunitiesMock.mockReturnValue({
      data: [OPORTUNIDAD, OPORTUNIDAD_2],
      isLoading: false,
      isError: false,
    } satisfies QueryState<EligibleOpportunity[]>)
    const user = userEvent.setup()
    renderDialog()

    await elegirCliente(user, "Alcaldía de Barranquilla")
    await user.click(screen.getByRole("combobox", { name: "Oportunidad" }))

    expect(await screen.findByRole("option", { name: /Consultoría línea base.*\$ 180\.000\.000/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Segunda oportunidad ganada/ })).not.toBeInTheDocument()
  })

  it("prefills nombre and valor from the chosen opportunity and keeps the client chosen", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)

    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
    expect(screen.getByLabelText("Valor total")).toHaveValue("180.000.000")
    expect(screen.getByRole("combobox", { name: "Cliente" })).toHaveTextContent("Alcaldía de Barranquilla")
  })

  it("prefills responsable with the current user, today/today+3m and the first line as principal", () => {
    // Pinned clock (10:00 in Bogota) and literal dates: the expectation no longer uses the component's own helpers.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-16T15:00:00.000Z"))
    try {
      renderDialog()
    } finally {
      vi.useRealTimers()
    }

    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveTextContent("Ana Pérez")
    expect(screen.getByLabelText("Fecha de inicio")).toHaveValue("2026-10-16")
    expect(screen.getByLabelText("Fecha de fin")).toHaveValue("2027-01-16")
    expect(screen.getByRole("checkbox", { name: "Incluir Educación" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Principal Educación" })).toBeChecked()
    // Sin territorio inventado: hay que elegir el municipio.
    expect(screen.getByRole("checkbox", { name: "Municipio Barranquilla" })).not.toBeChecked()
  })

  it("lets an explicit edit override the opportunity prefill", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    const nombre = screen.getByLabelText("Nombre")
    await user.clear(nombre)
    await user.type(nombre, "Nombre propio")
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createFromOpportunity.mutateAsync).toHaveBeenCalled())
    const body = createFromOpportunity.mutateAsync.mock.calls[0][0]
    expect(body.nombre).toBe("Nombre propio")
  })

  it("refuses two principal lines and fires no request", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await user.click(screen.getByRole("checkbox", { name: "Incluir Salud" }))
    await user.click(screen.getByRole("checkbox", { name: "Principal Salud" }))
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo una línea estratégica puede ser la principal.",
    )
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("refuses a missing municipio and fires no request", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona al menos un municipio.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("shows the validation error next to the submit button and scrolls it into view", async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    const submit = screen.getByRole("button", { name: "Crear proyecto" })
    await user.click(submit)

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("Selecciona al menos un municipio.")
    // It lives in the form, after the municipios fieldset and before the submit button: where the user is looking.
    const form = submit.closest("form") as HTMLFormElement
    expect(form).toContainElement(alerta)
    const municipios = screen.getByRole("checkbox", { name: "Municipio Barranquilla" })
    expect(municipios.compareDocumentPosition(alerta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alerta.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it("refuses fecha_fin before fecha_inicio and fires no request", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2000-01-01" } })
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fecha de fin debe ser posterior a la fecha de inicio.",
    )
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("refuses fecha_fin equal to fecha_inicio and fires no request (V-03 strict)", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2026-10-05" } })
    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2026-10-05" } })
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("La fecha de fin debe ser posterior a la fecha de inicio.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it.each([
    ["empty", ""],
    ["zero", "0"],
  ])("refuses a %s valor total and fires no request (PO-5)", async (_caso, valor) => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: valor } })
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("El valor total debe ser mayor que cero.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  it("makes the user enter the value when the converted opportunity has none", async () => {
    useEligibleOpportunitiesMock.mockReturnValue({
      data: [OPORTUNIDAD_2],
      isLoading: false,
      isError: false,
    } satisfies QueryState<EligibleOpportunity[]>)
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user, "Gobernación del Atlántico", /Segunda oportunidad ganada/)
    await elegirMunicipio(user)
    expect(screen.getByLabelText("Valor total")).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("El valor total debe ser mayor que cero.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "50000000" } })
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))
    await waitFor(() => expect(createFromOpportunity.mutateAsync).toHaveBeenCalled())
    expect(createFromOpportunity.mutateAsync.mock.calls[0][0].valor_total).toBe(50000000)
  })

  it("sends no forbidden field on the opportunity path", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createFromOpportunity.mutateAsync).toHaveBeenCalled())
    const body = createFromOpportunity.mutateAsync.mock.calls[0][0]
    for (const field of [
      "codigo",
      "estado",
      "oportunidad_id",
      "cliente_id",
      "deleted_at",
      "umbrales_override",
      "programacion_pendiente",
      "diferencia_valor_oportunidad",
      "alertas",
      "miembro_ids",
    ]) {
      expect(body).not.toHaveProperty(field)
    }
    expect(useCreateProjectFromOpportunityMock).toHaveBeenCalledWith("cli-1", "op-1")
  })

  it("keeps the dialog open and shows the server message on 409", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    createFromOpportunity.mutateAsync.mockRejectedValueOnce(
      new ApiError("Esta oportunidad ya tiene un proyecto.", 409, "CONFLICT"),
    )
    renderDialog(onOpenChange)

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta oportunidad ya tiene un proyecto.")
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("confirms a successful creation with a link to the new project and closes only on request", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    createFromOpportunity.mutateAsync.mockResolvedValueOnce({
      proyecto: { id: "p-new", codigo: "PRY-2026-009", nombre: "Consultoría línea base" },
    })
    renderDialog(onOpenChange)

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    const confirmacion = await screen.findByRole("status")
    expect(confirmacion).toHaveTextContent("Proyecto creado")
    expect(confirmacion).toHaveTextContent("PRY-2026-009")
    expect(screen.getByRole("link", { name: "Abrir proyecto" })).toHaveAttribute("href", "/proyectos/p-new")
    // The form is gone (no second submit) and the dialog stays open until the user closes it.
    expect(screen.queryByRole("button", { name: "Crear proyecto" })).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    await user.click(screen.getByRole("button", { name: "Listo" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("closes the dialog after a successful creation that returns no id", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it("independent path picks a client, sends cliente_id and a free nombre", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Proyecto propio")
    await user.type(screen.getByLabelText("Valor total"), "1000000")
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    const body = createProject.mutateAsync.mock.calls[0][0]
    expect(body.cliente_id).toBe("c1")
    expect(body.nombre).toBe("Proyecto propio")
    expect(body.valor_total).toBe(1000000)
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
  })

  // Z3-6: "250.000" used to be read as 250 (JS decimal point), silently saving a value 1000x smaller.
  it("reads the valor total with es-CO separators and rejects an ambiguous amount", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Proyecto propio")
    await elegirMunicipio(user)
    await user.type(screen.getByLabelText("Valor total"), "250.000,50")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    expect(createProject.mutateAsync.mock.calls[0][0].valor_total).toBe(250000.5)
  })

  it("refuses a valor total that is not a valid es-CO amount and fires no request", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirCliente(user, "Cliente Uno")
    await user.type(screen.getByLabelText("Nombre"), "Proyecto propio")
    await elegirMunicipio(user)
    await user.type(screen.getByLabelText("Valor total"), "250.00")
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa un monto válido")
    expect(createProject.mutateAsync).not.toHaveBeenCalled()
  })

  describe("value difference against the opportunity (S2.4)", () => {
    it("shows the difference as $ 50.000 once valor total departs from the estimate", async () => {
      const user = userEvent.setup()
      renderDialog()

      await elegirOportunidad(user)
      expect(screen.queryByText(/Diferencia con la oportunidad/)).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "180050000" } })

      expect(screen.getByRole("status")).toHaveTextContent(/Diferencia con la oportunidad.*\$ 50\.000/)
    })

    it("shows a negative difference when the project is worth less", async () => {
      const user = userEvent.setup()
      renderDialog()

      await elegirOportunidad(user)
      fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "179950000" } })

      expect(screen.getByRole("status")).toHaveTextContent(/-\$ 50\.000/)
    })

    it("does not block the submit", async () => {
      const user = userEvent.setup()
      renderDialog()

      await elegirOportunidad(user)
      fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "180050000" } })
      await elegirMunicipio(user)
      await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

      await waitFor(() => expect(createFromOpportunity.mutateAsync).toHaveBeenCalled())
    })

    it("shows nothing on the independent path", async () => {
      const user = userEvent.setup()
      renderDialog()

      await elegirCliente(user, "Cliente Uno")
      fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "180050000" } })

      expect(screen.queryByText(/Diferencia con la oportunidad/)).not.toBeInTheDocument()
    })
  })
})
