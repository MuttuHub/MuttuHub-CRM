// Diálogo de creación de proyectos (S2.4, unidad 2). El caso central del demo
// es la conversión de una oportunidad GANADA; el camino "independiente" queda
// como la excepción. Estas pruebas fijan el contrato observable: qué se
// muestra, qué se prefija, qué se valida antes de disparar la petición y qué
// campos viajan (o no viajan) en el cuerpo.

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/http"
import type { ClientListRow } from "@/hooks/crm"
import type { EligibleOpportunity, Municipality, StrategicLine } from "@/hooks/projects"
import { ProjectCreateDialog, fechaDeHoy, fechaMasMeses } from "./project-create-dialog"

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
} = vi.hoisted(() => ({
  useEligibleOpportunitiesMock: vi.fn(),
  useStrategicLinesMock: vi.fn(),
  useMunicipalitiesMock: vi.fn(),
  useCreateProjectMock: vi.fn(),
  useCreateProjectFromOpportunityMock: vi.fn(),
  useUsersMock: vi.fn(),
  useClientsMock: vi.fn(),
  useCurrentUserMock: vi.fn(),
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
  data: { items: [{ id: "c1", nombre: "Cliente Uno" }] },
}

let createProject: MutationState
let createFromOpportunity: MutationState

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()) {
  return render(<ProjectCreateDialog open onOpenChange={onOpenChange} />)
}

async function elegirOportunidad(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Consultoría línea base/ }))
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
    useCurrentUserMock.mockReturnValue({ data: USER })
    useCreateProjectMock.mockReturnValue(createProject)
    useCreateProjectFromOpportunityMock.mockReturnValue(createFromOpportunity)
  })

  it("opens on the GANADA-opportunity origin by default", () => {
    renderDialog()

    expect(screen.getByRole("button", { name: /Consultoría línea base/ })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Cliente" })).not.toBeInTheDocument()
  })

  it("lists only the opportunities the endpoint returned, with client and value", () => {
    useEligibleOpportunitiesMock.mockReturnValue({
      data: [OPORTUNIDAD, OPORTUNIDAD_2],
      isLoading: false,
      isError: false,
    } satisfies QueryState<EligibleOpportunity[]>)

    renderDialog()

    expect(screen.getByRole("button", { name: /Consultoría línea base/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Segunda oportunidad ganada/ })).toBeInTheDocument()
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.queryByText(/Oportunidad fantasma/)).not.toBeInTheDocument()
  })

  it("prefills nombre and valor from the chosen opportunity and shows the client read-only", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)

    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
    expect(screen.getByLabelText("Valor total")).toHaveValue(180000000)
    // El cliente aparece en el selector y, además, en la vista de solo lectura.
    expect(screen.getAllByText("Alcaldía de Barranquilla")).toHaveLength(2)
    expect(screen.queryByRole("combobox", { name: "Cliente" })).not.toBeInTheDocument()
  })

  it("prefills responsable with the current user, today/today+3m and the first line as principal", () => {
    renderDialog()

    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveTextContent("Ana Pérez")
    expect(screen.getByLabelText("Fecha de inicio")).toHaveValue(fechaDeHoy())
    expect(screen.getByLabelText("Fecha de fin")).toHaveValue(fechaMasMeses(fechaDeHoy(), 3))
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

  it("refuses fecha_fin before fecha_inicio and fires no request", async () => {
    const user = userEvent.setup()
    renderDialog()

    await elegirOportunidad(user)
    await elegirMunicipio(user)
    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2000-01-01" } })
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fecha de fin no puede ser anterior a la de inicio.",
    )
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
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

  it("closes the dialog after a successful creation", async () => {
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

    await user.click(screen.getByRole("button", { name: "Proyecto independiente" }))
    await user.click(screen.getByRole("combobox", { name: "Cliente" }))
    await user.click(await screen.findByRole("option", { name: "Cliente Uno" }))
    await user.type(screen.getByLabelText("Nombre"), "Proyecto propio")
    await elegirMunicipio(user)
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalled())
    const body = createProject.mutateAsync.mock.calls[0][0]
    expect(body.cliente_id).toBe("c1")
    expect(body.nombre).toBe("Proyecto propio")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
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

      await user.click(screen.getByRole("button", { name: "Proyecto independiente" }))
      fireEvent.change(screen.getByLabelText("Valor total"), { target: { value: "180050000" } })

      expect(screen.queryByText(/Diferencia con la oportunidad/)).not.toBeInTheDocument()
    })
  })
})
