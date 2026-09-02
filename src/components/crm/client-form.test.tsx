import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail } from "@/hooks/crm"
import { ClientFormDialog, NewClientButton } from "./client-form"

const { createMutation, updateMutation, documentsQuery, useDocumentsMock } = vi.hoisted(() => ({
  createMutation: { isPending: false, mutateAsync: vi.fn() },
  updateMutation: { isPending: false, mutateAsync: vi.fn() },
  documentsQuery: { data: undefined as { items: unknown[] } | undefined, isLoading: false },
  useDocumentsMock: vi.fn(),
}))

vi.mock("@/hooks/crm", () => ({
  useCreateClient: () => createMutation,
  useUpdateClient: () => updateMutation,
}))

vi.mock("@/hooks/documents", () => ({
  useDocuments: useDocumentsMock,
}))

const USERS = [{ id: "u1", nombre: "Ana Pérez" }]

const CLIENTE: ClientDetail = {
  id: "c1",
  nombre: "Alcaldía de Barranquilla",
  empresa: "Alcaldía Distrital",
  tamano_org: "50–200 personas",
  ubicacion: "Barranquilla, Atlántico",
  canal_contacto_inicial: "Feria",
  fecha_primer_contacto: "2026-08-01T12:00:00.000Z",
  tipo_cliente: "GOBIERNO_LOCAL",
  estado: "CLIENTE_ACTIVO",
  prioridad: "ALTA",
  responsable_id: "u1",
  responsable_nombre: "Ana Pérez",
  prioridades_identificadas: "Transición energética",
  riesgos_barreras: "Presupuesto 2027",
  resumen_relacion: "Relación desde 2024",
  valor_potencial: 1284500000,
  compromisos_abiertos: 2,
  next_compromiso: { id: "t1", titulo: "Seguimiento", fecha_entrega: "2026-12-31" },
  updated_at: "2026-08-01T12:00:00.000Z",
  created_at: "2025-01-01T00:00:00.000Z",
  contactos_count: 4,
  oportunidades_count: 2,
  bitacora_count: 10,
  tareas_abiertas_count: 3,
  puede_editar: true,
}

function responsableTrigger() {
  return screen
    .getAllByRole("combobox")
    .find((cb) => cb.textContent?.includes("Selecciona el responsable"))!
}

async function pickResponsable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(responsableTrigger())
  await user.click(await screen.findByRole("option", { name: "Ana Pérez" }))
}

describe("ClientFormDialog (create)", () => {
  beforeEach(() => {
    createMutation.mutateAsync.mockReset()
    createMutation.mutateAsync.mockResolvedValue({ cliente: {} })
  })

  it("renders the dialog with title, description and required fields", () => {
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Nuevo cliente" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeInTheDocument()
    expect(screen.getByText(/Responsable/, { selector: "label" })).toBeInTheDocument()
  })

  it("blocks the native submit while nombre is empty (HTML required) and never calls create", async () => {
    const user = userEvent.setup()
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Crear cliente" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(createMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("shows the zod-style error when nombre is empty on a programmatic submit", () => {
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    fireEvent.submit(document.querySelector("form")!)
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre es obligatorio.")
    expect(createMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("shows a validation error when responsable is missing", async () => {
    const user = userEvent.setup()
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    await user.type(screen.getByLabelText(/Nombre \*/), "Alcaldía de Prueba")
    await user.click(screen.getByRole("button", { name: "Crear cliente" }))
    expect(screen.getByRole("alert")).toHaveTextContent("El responsable es obligatorio.")
    expect(createMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("submits the trimmed payload and notifies the parent on success", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    render(<ClientFormDialog open onOpenChange={onOpenChange} users={USERS} onSaved={onSaved} />)
    await user.type(screen.getByLabelText(/Nombre \*/), "  Alcaldía de Prueba  ")
    await user.type(screen.getByLabelText("Empresa u organización"), "Alcaldía")
    await pickResponsable(user)
    await user.click(screen.getByRole("button", { name: "Crear cliente" }))

    expect(createMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(createMutation.mutateAsync).toHaveBeenCalledWith({
      nombre: "Alcaldía de Prueba",
      tipo_cliente: "GOBIERNO_LOCAL",
      responsable_id: "u1",
      empresa: "Alcaldía",
      tamano_org: undefined,
      ubicacion: undefined,
      canal_contacto_inicial: undefined,
      fecha_primer_contacto: undefined,
      prioridad: null,
      estado: "PROSPECTO",
      prioridades_identificadas: undefined,
      riesgos_barreras: undefined,
      resumen_relacion: undefined,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it("does not close the dialog when the mutation rejects", async () => {
    const user = userEvent.setup()
    createMutation.mutateAsync.mockRejectedValue(new Error("boom"))
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    render(<ClientFormDialog open onOpenChange={onOpenChange} users={USERS} onSaved={onSaved} />)
    await user.type(screen.getByLabelText(/Nombre \*/), "X")
    await pickResponsable(user)
    await user.click(screen.getByRole("button", { name: "Crear cliente" }))
    expect(createMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("closes the dialog when cancel is pressed", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ClientFormDialog open onOpenChange={onOpenChange} users={USERS} onSaved={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// QA audit finding #5 (§4.8): "Cargar desde Brief existente" was completely
// absent. Lightweight scope: pick a document from the Repository and copy
// its título as the suggested client name — no content parsing.
describe("ClientFormDialog — Cargar desde Brief existente (QA audit finding #5)", () => {
  beforeEach(() => {
    documentsQuery.data = { items: [{ id: "doc-1", titulo: "Brief Alcaldía de Soledad", categoria: "Comercial", clientes: [] }] }
    useDocumentsMock.mockReset()
    useDocumentsMock.mockImplementation(() => documentsQuery)
  })

  it("does not fetch documents until the picker is opened", () => {
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    expect(screen.queryByRole("heading", { name: "Cargar desde Brief existente" })).not.toBeInTheDocument()
  })

  it("fills nombre with the picked document's título and closes the picker", async () => {
    const user = userEvent.setup()
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Cargar desde Brief existente" }))
    await user.click(await screen.findByRole("button", { name: /Brief Alcaldía de Soledad/ }))

    expect(screen.getByLabelText(/Nombre \*/)).toHaveValue("Brief Alcaldía de Soledad")
    expect(screen.queryByRole("heading", { name: "Cargar desde Brief existente" })).not.toBeInTheDocument()
  })

  // Code review finding on PR #25: every keystroke fetched /documents,
  // unlike the ~350ms debounce pattern already used for the same kind of
  // search in client-list.tsx and repository-list.tsx.
  it("debounces the search query instead of fetching on every keystroke", async () => {
    const user = userEvent.setup()
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Cargar desde Brief existente" }))

    useDocumentsMock.mockClear()
    vi.useFakeTimers()
    try {
      const input = screen.getByLabelText("Buscar brief")
      fireEvent.change(input, { target: { value: "s" } })
      fireEvent.change(input, { target: { value: "so" } })
      fireEvent.change(input, { target: { value: "sol" } })
      expect(useDocumentsMock).not.toHaveBeenCalledWith(expect.objectContaining({ q: "sol" }))

      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(useDocumentsMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "sol" }))
    } finally {
      vi.useRealTimers()
    }
  })

  // Code review finding on PR #25: a título could exceed the 200-char limit
  // the server enforces on client nombre (a document mirrored from a task
  // attachment uses the raw file name, uncapped — see the attachments
  // route). Without truncating here, picking it would only fail at submit
  // with a generic validation error.
  it("truncates a título longer than 200 characters when picked", async () => {
    const longTitle = "A".repeat(250)
    documentsQuery.data = {
      items: [{ id: "doc-2", titulo: longTitle, categoria: "Comercial", clientes: [] }],
    }
    const user = userEvent.setup()
    render(<ClientFormDialog open onOpenChange={vi.fn()} users={USERS} onSaved={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Cargar desde Brief existente" }))
    await user.click(await screen.findByRole("button", { name: new RegExp(longTitle.slice(0, 30)) }))

    const nombreInput = screen.getByLabelText(/Nombre \*/) as HTMLInputElement
    expect(nombreInput.value).toHaveLength(200)
  })

  it("does not offer the Brief picker when editing an existing client", () => {
    render(
      <ClientFormDialog open cliente={CLIENTE} users={USERS} onOpenChange={vi.fn()} onSaved={vi.fn()} />,
    )
    expect(screen.queryByRole("button", { name: "Cargar desde Brief existente" })).not.toBeInTheDocument()
  })
})

describe("ClientFormDialog (edit)", () => {
  it("prefills the form when the dialog opens over a client and calls updateMutation", async () => {
    const user = userEvent.setup()
    updateMutation.mutateAsync.mockReset()
    updateMutation.mutateAsync.mockResolvedValue({ cliente: {} })
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    const { rerender } = render(
      <ClientFormDialog
        open={false}
        cliente={CLIENTE}
        users={USERS}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    )
    rerender(
      <ClientFormDialog
        open
        cliente={CLIENTE}
        users={USERS}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByRole("heading", { name: "Editar cliente" })).toBeInTheDocument()
    expect(screen.getByLabelText(/Nombre \*/)).toHaveValue(CLIENTE.nombre)
    expect(screen.getByLabelText("Empresa u organización")).toHaveValue("Alcaldía Distrital")
    expect(screen.getByLabelText("Fecha de primer contacto")).toHaveValue("2026-08-01")

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      nombre: CLIENTE.nombre,
      tipo_cliente: "GOBIERNO_LOCAL",
      responsable_id: "u1",
      empresa: "Alcaldía Distrital",
      tamano_org: "50–200 personas",
      ubicacion: "Barranquilla, Atlántico",
      canal_contacto_inicial: "Feria",
      fecha_primer_contacto: "2026-08-01",
      prioridad: "ALTA",
      estado: "CLIENTE_ACTIVO",
      prioridades_identificadas: "Transición energética",
      riesgos_barreras: "Presupuesto 2027",
      resumen_relacion: "Relación desde 2024",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})

describe("NewClientButton", () => {
  it("opens the create dialog on click", async () => {
    const user = userEvent.setup()
    render(<NewClientButton users={USERS} onSaved={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Nuevo cliente" })).toBeInTheDocument()
})
})
