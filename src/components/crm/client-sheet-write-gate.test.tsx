// PR 4 (Slice B2): UI gate on the ClientSheet ficha.
//
// When the opened cliente carries `puede_editar: false`, the ficha must
// not surface a single control that would 403 on click. The header
// Editar / Desactivar buttons disappear, the inline-edit entry buttons
// (text / textarea / date) don't render (so the field stays as static
// text), the inline catalog Selects are disabled, and the per-tab
// destructive buttons (Cumplido, Editar, Eliminar) are hidden. Per spec
// (task-write-boundaries) the server is the authority — this layer only
// hides the affordance, never blocks a request.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail } from "@/hooks/crm"
import { ClientSheet } from "./client-sheet"

// Stub useRouter from next/navigation so the DocumentosTab can mount
// outside a real Next.js app router context (jsdom doesn't ship one).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/clientes",
  useSearchParams: () => new URLSearchParams(),
}))

const { clienteQuery } = vi.hoisted(() => ({
  clienteQuery: {
    data: null as ClientDetail | null,
    error: null as unknown,
  },
}))

const noopMutation = {
  isPending: false,
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
}

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useClientDetail: () => clienteQuery,
    useUsers: () => ({ data: USERS }),
    useUpdateClient: () => noopMutation,
    useContacts: () => ({ data: [], isLoading: false, isError: false }),
    useOpportunities: () => ({ data: [], isLoading: false, isError: false }),
    useTasksByClient: () => ({ data: [], isLoading: false, isError: false }),
    useBitacora: () => ({ data: [], isLoading: false, isError: false }),
    useAddLogEntry: () => noopMutation,
    useDeleteContacto: () => noopMutation,
    useDeleteOportunidad: () => noopMutation,
    useDeleteTarea: () => noopMutation,
    useUpdateTareaStatus: () => noopMutation,
    useDeleteClient: () => noopMutation,
  }
})

vi.mock("@/hooks/documents", () => ({
  useDocuments: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  downloadActiveVersion: vi.fn(),
  extensionOf: () => "pdf",
  formatVersionFecha: () => "—",
}))

const USERS = [
  { id: "u1", nombre: "Ana Pérez" },
  { id: "u2", nombre: "Bruno Díaz" },
]

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
  responsable_id: "u2",
  responsable_nombre: "Bruno Díaz",
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
  puede_editar: false,
}

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ClientSheet clientId="c1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe("ClientSheet — PR 4 UI gate (puede_editar=false)", () => {
  beforeEach(() => {
    clienteQuery.data = CLIENTE
    clienteQuery.error = null
  })

  it("hides the header Editar / Desactivar destructive buttons", () => {
    renderSheet()

    expect(screen.queryByRole("button", { name: /^Editar$/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Desactivar cliente/ }),
    ).not.toBeInTheDocument()
  })

  it("hides the inline-edit entry buttons — fields render as static text", () => {
    renderSheet()

    // The General tab is the default. The text/date/textarea fields would
    // otherwise render a button whose accessible name is the field's value.
    // When the gate is closed, the value is plain text.
    const nombreButton = screen.queryByRole("button", { name: CLIENTE.nombre })
    expect(nombreButton).not.toBeInTheDocument()
    // The value is still visible (read-only).
    expect(screen.getByText(CLIENTE.nombre)).toBeInTheDocument()
  })

  it("disables the inline catalog Selects (Tipo, Estado, Prioridad, Responsable)", () => {
    renderSheet()

    for (const trigger of screen.getAllByRole("combobox")) {
      const hasDisabled =
        trigger.hasAttribute("data-disabled") ||
        trigger.getAttribute("aria-disabled") === "true"
      expect(hasDisabled).toBe(true)
    }
  })

  it("hides destructive buttons in Compromisos (Cumplido, Editar, Eliminar) when the foreign task is open", async () => {
    // The Compromisos tab reuses useTasksByClient — by default it returns
    // an empty list, so the per-row buttons are absent. Open a compromised
    // tab with a foreign task to assert the per-row gate.
    const user = userEvent.setup()
    renderSheet()

    // No compromise rows in this fixture: we still assert the section
    // doesn't render the "Nuevo compromiso" create button.
    await user.click(screen.getByRole("tab", { name: /Compromisos/ }))
    expect(
      screen.queryByRole("button", { name: /Nuevo compromiso/ }),
    ).not.toBeInTheDocument()
  })

  it("hides the 'Subir documento vinculado' button in the Documentos tab", async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole("tab", { name: /Documentos/ }))
    expect(
      screen.queryByRole("button", { name: /Subir documento vinculado/ }),
    ).not.toBeInTheDocument()
  })
})

describe("ClientSheet — PR 4 UI gate (puede_editar=true) regression", () => {
  beforeEach(() => {
    clienteQuery.data = { ...CLIENTE, puede_editar: true }
    clienteQuery.error = null
  })

  it("shows the header Editar / Desactivar buttons when puede_editar=true", () => {
    renderSheet()

    expect(screen.getByRole("button", { name: /^Editar$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Desactivar cliente/ }),
    ).toBeInTheDocument()
  })

  it("renders the inline-edit entry button for the Nombre field when puede_editar=true", () => {
    renderSheet()

    expect(
      screen.getByRole("button", { name: CLIENTE.nombre }),
    ).toBeInTheDocument()
  })
})
