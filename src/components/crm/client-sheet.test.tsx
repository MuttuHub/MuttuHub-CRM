import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail } from "@/hooks/crm"
import { ClientSheet } from "./client-sheet"

// QA audit finding #3: editing a client required opening a separate "Editar
// cliente" modal. The General tab fields are now inline-editable (click,
// change, save on blur/select — no modal).

const { updateMutation } = vi.hoisted(() => ({
  updateMutation: { isPending: false, mutateAsync: vi.fn() },
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
}

const USERS = [
  { id: "u1", nombre: "Ana Pérez" },
  { id: "u2", nombre: "Bruno Díaz" },
]

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useClientDetail: () => ({ data: CLIENTE, error: null }),
    useUsers: () => ({ data: USERS }),
    useUpdateClient: () => updateMutation,
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
})
