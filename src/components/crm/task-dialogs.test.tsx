// Jefe 2026-10-28, lane 1 task 1.1 (S1): the CRM commitment dialog («Nuevo
// compromiso» / «Editar compromiso» in the client ficha) must offer the LIVE
// task-tags catalog (`task_tags` setting) — the same one the admin panel
// edits — instead of not offering tags at all. Stored tags that are no longer
// in the catalog stay visible so saving does not silently drop them.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TaskItem } from "@/hooks/crm"
import { TareaFormDialog } from "./task-dialogs"

const { createMutation, updateMutation, taskTagsQuery } = vi.hoisted(() => ({
  createMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
  updateMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
  taskTagsQuery: { data: null as string[] | null, isLoading: false, error: null as unknown },
}))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useCreateTarea: () => createMutation,
    useUpdateTarea: () => updateMutation,
  }
})

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>()
  return {
    ...actual,
    useTaskTags: () => taskTagsQuery,
  }
})

const USERS = [{ id: "u1", nombre: "Ana Pérez" }]

function makeTarea(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "t1",
    titulo: "Entregar informe trimestral",
    descripcion: null,
    responsable_id: "u1",
    responsable_nombre: "Ana Pérez",
    cliente_id: "c1",
    cliente_nombre: "Alcaldía Demo",
    oportunidad_id: null,
    oportunidad_nombre: null,
    oportunidad_fase: null,
    proyecto: null,
    estado: "POR_HACER",
    origen: "CRM",
    prioridad: null,
    fecha_entrega: null,
    etiquetas: [],
    motivo_bloqueo: null,
    comentarios_count: 0,
    subtotal: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    puede_editar: true,
    ...overrides,
  }
}

function renderDialog(props: { tarea?: TaskItem | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TareaFormDialog
        clientId="c1"
        open
        onOpenChange={() => undefined}
        users={USERS}
        tarea={props.tarea ?? null}
      />
    </QueryClientProvider>,
  )
}

/**
 * The dialog syncs tarea → form only when its formKey CHANGES
 * ("open:nuevo" → "open:t1"), so mounting directly in edit mode would
 * leave the form empty. Mount in create mode first, then rerender with
 * the tarea — the production path when the ficha opens the edit dialog.
 */
function openEditDialog(tarea: TaskItem) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const dialog = (t: TaskItem | null) => (
    <QueryClientProvider client={qc}>
      <TareaFormDialog
        clientId="c1"
        open
        onOpenChange={() => undefined}
        users={USERS}
        tarea={t}
      />
    </QueryClientProvider>
  )
  const view = render(dialog(null))
  view.rerender(dialog(tarea))
  return view
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Título/), "Compromiso de prueba")
  // Responsable is a base-ui Select (combobox), not a native <select>.
  await user.click(screen.getByRole("combobox", { name: "Responsable" }))
  await user.click(await screen.findByRole("option", { name: "Ana Pérez" }))
}

describe("TareaFormDialog — tags field (jefe 1.1 / S1)", () => {
  beforeEach(() => {
    createMutation.mutateAsync.mockClear()
    updateMutation.mutateAsync.mockClear()
    taskTagsQuery.data = ["Comercial", "Alianza regional"]
  })

  it("offers the live task-tags catalog, including a tag created in admin", () => {
    renderDialog()

    expect(screen.getByRole("button", { name: "Alianza regional" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
  })

  it("saves the selected tags with the new commitment", async () => {
    const user = userEvent.setup()
    renderDialog()

    await fillRequired(user)
    await user.click(screen.getByRole("button", { name: "Alianza regional" }))
    await user.click(screen.getByRole("button", { name: "Crear compromiso" }))

    expect(createMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ etiquetas: ["Alianza regional"] }),
    )
  })

  it("keeps a stored tag that is no longer in the catalog when editing, and sends it on save", async () => {
    // S1: a task keeps any tag it already has even if it is no longer in the
    // catalog — the stale chip stays pressed and survives the PATCH.
    const user = userEvent.setup()
    openEditDialog(makeTarea({ etiquetas: ["Etiqueta retirada"] }))

    const staleChip = screen.getByRole("button", { name: "Etiqueta retirada" })
    expect(staleChip).toHaveAttribute("aria-pressed", "true")

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(updateMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "t1",
        input: expect.objectContaining({ etiquetas: ["Etiqueta retirada"] }),
      }),
    )
  })

  it("can drop a stored tag before saving", async () => {
    const user = userEvent.setup()
    openEditDialog(makeTarea({ etiquetas: ["Etiqueta retirada"] }))

    await user.click(screen.getByRole("button", { name: "Etiqueta retirada" }))
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(updateMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ etiquetas: [] }) }),
    )
  })

  it("falls back to the factory TASK_TAGS while the catalog loads", () => {
    taskTagsQuery.data = null
    renderDialog()

    // TASK_TAGS constants (src/lib/catalogs.ts) — the pre-1.1 kanban set.
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Alianza regional" })).not.toBeInTheDocument()
  })
})
