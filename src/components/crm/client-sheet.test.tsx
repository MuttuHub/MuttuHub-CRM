import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail, Oportunidad } from "@/hooks/crm"
import { ClientSheet } from "./client-sheet"

// QA audit finding #3: editing a client required opening a separate "Editar
// cliente" modal. The General tab fields are now inline-editable (click,
// change, save on blur/select — no modal).

const { updateMutation, clienteQuery, oportunidadesQuery } = vi.hoisted(() => ({
  updateMutation: { isPending: false, mutateAsync: vi.fn() },
  clienteQuery: { data: null as ClientDetail | null, error: null as unknown },
  oportunidadesQuery: {
    data: [] as Oportunidad[],
    isLoading: false,
    isError: false,
  },
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
    updateMutation.mutateAsync.mockReset()
    updateMutation.mutateAsync.mockResolvedValue({ cliente: CLIENTE })
    clienteQuery.data = CLIENTE
    clienteQuery.error = null
    oportunidadesQuery.data = []
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
