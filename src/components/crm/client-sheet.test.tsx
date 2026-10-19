import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BitacoraEntrada, ClientDetail, Oportunidad } from "@/hooks/crm"
import { ClientSheet } from "./client-sheet"

// QA audit finding #3: editing a client required opening a separate "Editar
// cliente" modal. The General tab fields are now inline-editable (click,
// change, save on blur/select — no modal).

const { useCurrentUserMock } = vi.hoisted(() => ({ useCurrentUserMock: vi.fn() }))

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return { ...actual, useCurrentUser: useCurrentUserMock }
})

const { updateMutation, clienteQuery, oportunidadesQuery, bitacoraQuery, addLogMutation } =
  vi.hoisted(() => ({
    updateMutation: { isPending: false, mutateAsync: vi.fn() },
    clienteQuery: { data: null as ClientDetail | null, error: null as unknown },
    oportunidadesQuery: {
      data: [] as Oportunidad[],
      isLoading: false,
      isError: false,
    },
    bitacoraQuery: {
      data: [] as BitacoraEntrada[],
      isLoading: false,
      isError: false,
    },
    addLogMutation: { isPending: false, mutateAsync: vi.fn() },
  }))

const CLIENTE: ClientDetail = {
  id: "c1",
  nombre: "Alcaldía de Barranquilla",
  empresa: "Alcaldía Distrital",
  tamano_org: "50–200 personas",
  ubicacion: "Barranquilla, Atlántico",
  canal_contacto_inicial: "Feria",
  fecha_primer_contacto: "2026-08-01T12:00:00.000Z",
  tipo_cliente: "GOBIERNO_LOCAL",
  estado: "PROSPECTO",
  prioridad: "ALTA",
  responsable_id: "u1",
  responsable_nombre: "Ana Pérez",
  prioridades_identificadas: "Transición energética",
  riesgos_barreras: "Presupuesto 2027",
  resumen_relacion: "Relación desde 2024",
  valor_potencial: 1284500000,
  compromisos_abiertos: 2,
  next_compromiso: null,
  updated_at: "2026-08-01T12:00:00.000Z",
  created_at: "2025-01-01T00:00:00.000Z",
  contactos_count: 0,
  oportunidades_count: 0,
  bitacora_count: 0,
  tareas_abiertas_count: 0,
  puede_editar: true,
  puede_gestionar_oportunidades: true,
}

const USERS = [
  { id: "u1", nombre: "Ana Pérez" },
  { id: "u2", nombre: "Bruno Díaz" },
]

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useClientDetail: () => clienteQuery,
    useUsers: () => ({ data: USERS }),
    useUpdateClient: () => updateMutation,
    useOpportunities: () => oportunidadesQuery,
    useBitacora: () => bitacoraQuery,
    useAddLogEntry: () => addLogMutation,
  }
})

function estadoTrigger() {
  return screen.getAllByRole("combobox").find((cb) => cb.textContent?.includes("Prospecto"))!
}

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ClientSheet clientId="c1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe("ClientSheet — General tab inline editing (QA audit finding #3)", () => {
  beforeEach(() => {
    useCurrentUserMock.mockReturnValue({ data: { id: "u1", nombre: "Ana", rol: "ADMINISTRADOR" } })
    updateMutation.mutateAsync.mockReset()
    updateMutation.mutateAsync.mockResolvedValue({ cliente: CLIENTE })
    clienteQuery.data = CLIENTE
    clienteQuery.error = null
    oportunidadesQuery.data = []
    bitacoraQuery.data = []
    bitacoraQuery.isLoading = false
    bitacoraQuery.isError = false
    addLogMutation.mutateAsync.mockReset()
    addLogMutation.mutateAsync.mockResolvedValue({})
  })

  it("links 'Crear proyecto' to the creation page with the client preselected", () => {
    renderSheet()
    expect(screen.getByRole("link", { name: "Crear proyecto" })).toHaveAttribute(
      "href",
      "/proyectos/nuevo?cliente=c1",
    )
  })

  it.each(["COORDINADOR", "COLABORADOR"])("hides 'Crear proyecto' for a %s", (rol) => {
    useCurrentUserMock.mockReturnValue({ data: { id: "u1", nombre: "Ana", rol } })
    renderSheet()
    expect(screen.queryByRole("link", { name: "Crear proyecto" })).not.toBeInTheDocument()
  })

  it("hides 'Crear proyecto' while the current user is unknown", () => {
    useCurrentUserMock.mockReturnValue({ data: undefined })
    renderSheet()
    expect(screen.queryByRole("link", { name: "Crear proyecto" })).not.toBeInTheDocument()
  })

  it("saves a text field on blur without opening a modal", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("button", { name: CLIENTE.nombre }))
    const input = screen.getByDisplayValue(CLIENTE.nombre)
    await user.clear(input)
    await user.type(input, "Alcaldía de Soledad")
    await user.tab()

    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({ nombre: "Alcaldía de Soledad" })
    // Only the sheet itself is a dialog — no separate "Editar cliente" modal opened.
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.queryByRole("heading", { name: "Editar cliente" })).not.toBeInTheDocument()
  })

  it("cancels an in-progress edit on Escape without saving", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("button", { name: CLIENTE.nombre }))
    const input = screen.getByDisplayValue(CLIENTE.nombre)
    await user.type(input, " (borrador)")
    await user.keyboard("{Escape}")

    expect(updateMutation.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: CLIENTE.nombre })).toBeInTheDocument()
  })

  it("saves a catalog field immediately on select, no separate edit step", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(estadoTrigger())
    await user.click(await screen.findByRole("option", { name: "Cliente activo" }))

    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({ estado: "CLIENTE_ACTIVO" })
  })

  // Code review finding on PR #24: `users` only lists active users
  // (GET /api/v1/catalogs/users filters activo:true). If the client's
  // responsable was deactivated afterwards, the Select had no matching
  // option and fell back to the raw UUID instead of the name.
  it("shows the responsable's name even when they're not in the active users list", () => {
    clienteQuery.data = {
      ...CLIENTE,
      responsable_id: "deactivated-1",
      responsable_nombre: "Carlos Gómez",
    }
    renderSheet()

    const trigger = screen.getAllByRole("combobox").find((cb) => cb.textContent?.includes("Carlos Gómez"))
    expect(trigger).toBeDefined()
    expect(trigger).not.toHaveTextContent("deactivated-1")
  })

  // Carril Y · Y2 (D2): la ficha mostraba la fecha de primer contacto en ISO crudo. Es un día de
  // calendario capturado por `<input type="date">` (UTC), así que se muestra con `formatFechaDia`,
  // igual que la ficha imprimible.
  it("renders the first contact date as its UTC calendar day, not the raw ISO", () => {
    renderSheet()

    expect(screen.getByText("01 de ago de 2026")).toBeInTheDocument()
    expect(screen.queryByText("2026-08-01T12:00:00.000Z")).not.toBeInTheDocument()
  })

  it("also formats the first contact date in the read-only rendering", () => {
    clienteQuery.data = { ...CLIENTE, puede_editar: false }
    renderSheet()

    expect(screen.getByText("01 de ago de 2026")).toBeInTheDocument()
    expect(screen.queryByText("2026-08-01T12:00:00.000Z")).not.toBeInTheDocument()
  })

  // Z3-1: read-only text fields were routed through the date formatter and rendered as "—".
  it("shows the text fields of the General tab to a user who cannot edit", () => {
    clienteQuery.data = { ...CLIENTE, puede_editar: false }
    renderSheet()

    expect(screen.getByText("Alcaldía Distrital")).toBeInTheDocument()
    expect(screen.getByText("50–200 personas")).toBeInTheDocument()
    expect(screen.getByText("Barranquilla, Atlántico")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Alcaldía Distrital" })).not.toBeInTheDocument()
  })

  // Z2-2: the inline edit controls need an accessible name that is the field, not the value.
  it("names the inline edit input after the field and describes the entry button with it", async () => {
    const user = userEvent.setup()
    renderSheet()

    const entry = screen.getByRole("button", { name: "Alcaldía Distrital" })
    expect(entry).toHaveAccessibleDescription("Empresa u organización")
    await user.click(entry)
    expect(screen.getByRole("textbox", { name: "Empresa u organización" })).toHaveValue("Alcaldía Distrital")
  })

  it("opens the date editor with the calendar day as YYYY-MM-DD, ready to save", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("button", { name: "01 de ago de 2026" }))
    expect(screen.getByDisplayValue("2026-08-01")).toBeInTheDocument()
  })

  // Production data gotcha: every open compromiso arrived with
  // fecha_entrega = null (empty Excel column). The header must surface the
  // undated compromiso ("… · sin fecha") instead of the lying
  // "Sin compromisos abiertos", and it must not be flagged as vencido.
  it("renders an undated próximo compromiso as 'titulo · sin fecha', never as vencido", () => {
    clienteQuery.data = {
      ...CLIENTE,
      next_compromiso: { id: "t-1", titulo: "Propuesta técnica", fecha_entrega: null },
    }
    renderSheet()

    const label = screen.getByText(/Próximo compromiso:/)
    expect(label).toHaveTextContent("Propuesta técnica · sin fecha")
    expect(label).not.toHaveTextContent("Vencido")
    expect(screen.queryByText("Sin compromisos abiertos")).not.toBeInTheDocument()
  })

  // dada629 fixed the one-day UTC-5 shift for date-input calendar days
  // (`fecha_entrega`, `fecha_primer_contacto`). `fecha_ultima_gestion` is
  // also captured by an `<input type="date">`: the form sends YYYY-MM-DD and
  // `parseDate` stores UTC midnight, so the ficha must render that UTC day.
  // Under TZ=America/Bogota a viewer-zone formatter shows the previous day.
  it("renders fecha_ultima_gestion as its UTC calendar day in the Oportunidades tab", async () => {
    const user = userEvent.setup()
    oportunidadesQuery.data = [
      {
        id: "o1",
        nombre: "Diagnóstico de participación ciudadana",
        problema_detectado: null,
        solucion_propuesta: null,
        servicios_interes: null,
        valor_estimado_cop: 45_000_000,
        estado: "PRESENTADA",
        fecha_ultima_gestion: "2026-08-01T00:00:00.000Z",
        fase: "PROSPECCION",
        fecha_adjudicacion: null,
        fecha_envio_propuesta: null,
        proyectos_relacionados: null,
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ]
    renderSheet()

    await user.click(screen.getByRole("tab", { name: "Oportunidades" }))

    expect(await screen.findByText(/Última gestión:/)).toHaveTextContent("01 de ago de 2026")
  })
})

// v7 alignment, unit C3b: the per-client bitácora gained the interaction `tipo`
// and the optional `proximo_paso`. The tab must show them per entry and let the
// composer set them, without changing the rest of the sheet's behaviour.
describe("ClientSheet — Bitácora tipo and próximo paso (C3b)", () => {
  it("shows the tipo chip and the próximo paso of an entry", async () => {
    const user = userEvent.setup()
    bitacoraQuery.data = [
      {
        id: "b1",
        autor_id: "u1",
        autor_nombre: "Ana Pérez",
        texto: "Nota de la llamada con el equipo técnico",
        oportunidad_id: null,
        tipo: "LLAMADA",
        proximo_paso: "Enviar la propuesta el viernes",
        created_at: "2026-01-06T12:00:00.000Z",
      },
    ]
    renderSheet()

    await user.click(screen.getByRole("tab", { name: "Bitácora" }))

    const entry = within(await screen.findByRole("list"))
    expect(entry.getByText("Llamada")).toBeInTheDocument()
    expect(entry.getByText("Próximo paso")).toBeInTheDocument()
    expect(entry.getByText("Enviar la propuesta el viernes")).toBeInTheDocument()
  })

  it("does not render a Próximo paso block for an entry without one", async () => {
    const user = userEvent.setup()
    bitacoraQuery.data = [
      {
        id: "b1",
        autor_id: "u1",
        autor_nombre: "Ana Pérez",
        texto: "Nota rápida",
        oportunidad_id: null,
        tipo: "OTRO",
        proximo_paso: null,
        created_at: "2026-01-06T12:00:00.000Z",
      },
    ]
    renderSheet()

    await user.click(screen.getByRole("tab", { name: "Bitácora" }))

    const entry = within(await screen.findByRole("list"))
    expect(entry.getByText("Otro")).toBeInTheDocument()
    expect(entry.queryByText("Próximo paso")).not.toBeInTheDocument()
  })

  it("posts tipo and próximo paso from the composer", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("tab", { name: "Bitácora" }))

    const tipoTrigger = screen
      .getAllByRole("combobox")
      .find((cb) => cb.textContent?.includes("Otro"))!
    await user.click(tipoTrigger)
    await user.click(await screen.findByRole("option", { name: "Correo" }))

    await user.type(
      screen.getByPlaceholderText(/Agrega una nota de seguimiento/),
      "Correo con la propuesta ajustada",
    )
    await user.type(
      screen.getByPlaceholderText(/Próximo paso/),
      "Confirmar la reunión del lunes",
    )
    await user.click(screen.getByRole("button", { name: /Agregar nota/ }))

    expect(addLogMutation.mutateAsync).toHaveBeenCalledWith({
      texto: "Correo con la propuesta ajustada",
      tipo: "CORREO",
      proximo_paso: "Confirmar la reunión del lunes",
    })
  })
})
