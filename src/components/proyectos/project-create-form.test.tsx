// Create-project form body (shared by the dialog and the /proyectos/nuevo stepper). These tests pin what
// the page relies on and the dialog suite does not: the `onCreated` / `onCreatedWithoutId` callbacks, the
// optional cancel button, the submit label and the absence of dialog chrome in the page variant.

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

function renderForm(props: Partial<React.ComponentProps<typeof ProjectCreateForm>> = {}) {
  const onCreated = vi.fn()
  const view = render(<ProjectCreateForm onCreated={onCreated} {...props} />)
  return { onCreated, ...view }
}

async function crearDesdeOportunidad(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Consultoría línea base/ }))
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

    await user.click(screen.getByRole("button", { name: "Proyecto independiente" }))
    await user.click(screen.getByRole("combobox", { name: "Cliente" }))
    await user.click(await screen.findByRole("option", { name: "Cliente Uno" }))
    await user.type(screen.getByLabelText("Nombre"), "Libre")
    await user.type(screen.getByLabelText("Valor total"), "1000000")
    await user.click(screen.getByRole("checkbox", { name: "Municipio Barranquilla" }))
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "p-ind", codigo: "PRY-2026-010", nombre: "Libre" }))
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

    await user.click(screen.getByRole("button", { name: /Consultoría línea base/ }))
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona al menos un municipio.")
    expect(createFromOpportunity.mutateAsync).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("preselects initialOportunidadId", () => {
    renderForm({ initialOportunidadId: "op-1" })
    expect(screen.getByLabelText("Nombre")).toHaveValue("Consultoría línea base")
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
