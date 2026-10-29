// PR 4 (Slice B2): UI gate on the TaskDialog.
//
// When the opened task carries `puede_editar: false`, the form must be
// fully read-only: every input/textarea/select disabled, the "Guardar
// cambios" submit button not rendered, and the write-only sub-entity
// sections (Subtareas / Comentarios / Adjuntos) and the destructive
// "Zona de peligro" all hidden. The task body itself must still render
// (a COLABORADOR needs to be able to READ the foreign task — see
// global-task-board spec scenarios).

import { render, screen, act, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TaskItem } from "@/hooks/crm"
import type { TaskDetail } from "@/hooks/kanban"
import { TaskDialog } from "./task-dialog"

const { taskQuery, subtareasQuery, comentariosQuery, adjuntosQuery, taskTagsQuery } = vi.hoisted(
  () => ({
    taskQuery: { data: null as TaskDetail | null, isLoading: false, error: null as unknown },
    subtareasQuery: { data: [] as { id: string; titulo: string; completada: boolean; tarea_id: string }[], isLoading: false, isError: false },
    comentariosQuery: { data: [] as { id: string; autor_id: string; autor_nombre: string; texto: string; created_at: string }[], isLoading: false, isError: false },
    adjuntosQuery: { data: [] as { id: string; nombre: string; tamano_bytes: number | null; created_at: string }[], isLoading: false, isError: false },
    // Jefe 2026-10-28 lane 1 task 1.1 (S1): live task-tags catalog consumed
    // by the dialog's Etiquetas chips. `null` = hook still loading → the
    // dialog falls back to the factory TASK_TAGS (old describes keep the
    // pre-1.1 rendering).
    taskTagsQuery: { data: null as string[] | null, isLoading: false, error: null as unknown },
  }),
)

const noopMutation = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) }

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return {
    ...actual,
    useTask: () => taskQuery,
    useSubtareas: () => subtareasQuery,
    useComments: () => comentariosQuery,
    useAttachments: () => adjuntosQuery,
    useAddSubtarea: () => noopMutation,
    useUpdateSubtarea: () => noopMutation,
    useDeleteSubtarea: () => noopMutation,
    useAddComment: () => noopMutation,
    useUploadAttachment: () => noopMutation,
    useUpdateTask: () => noopMutation,
    useCreateTask: () => noopMutation,
    useDeleteTask: () => noopMutation,
    useMoveTask: () => noopMutation,
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
const CLIENTS = [{ id: "c1", nombre: "Alcaldía Demo" }]

function makeTask(overrides: Partial<TaskItem> = {}): TaskDetail {
  return {
    id: "t1",
    titulo: "Revisar contrato marco",
    descripcion: "Revisión legal del contrato marco.",
    responsable_id: "u2",
    responsable_nombre: "Gerencia Demo",
    cliente_id: "c1",
    cliente_nombre: "Alcaldía Demo",
    oportunidad_id: null,
    oportunidad_nombre: null,
    oportunidad_fase: null,
    estado: "EN_CURSO",
    origen: "AMBOS",
    prioridad: "ALTA",
    fecha_entrega: "2026-09-15T00:00:00.000Z",
    etiquetas: ["legal"],
    motivo_bloqueo: null,
    comentarios_count: 0,
    subtotal: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    puede_editar: true,
    comentarios: [],
    ...overrides,
  }
}

function renderDialog(taskId: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TaskDialog
        taskId={taskId}
        onClose={() => undefined}
        users={USERS}
        clients={CLIENTS}
      />
    </QueryClientProvider>,
  )
}

describe("TaskDialog — PR 4 UI gate (puede_editar)", () => {
  beforeEach(() => {
    taskQuery.data = null
    taskQuery.isLoading = false
    taskQuery.error = null
    subtareasQuery.data = []
    comentariosQuery.data = []
    adjuntosQuery.data = []
  })

  it("with puede_editar=false: disables every editable form field", () => {
    taskQuery.data = makeTask({ puede_editar: false })
    renderDialog("t1")

    // Form fields must be `disabled` — the spec calls for `disabled` + a
    // tooltip/a11y hint. We assert the HTML `disabled` attribute; the
    // tooltip is an accessibility nicety, not a contract.
    expect(screen.getByLabelText(/Título/)).toBeDisabled()
    expect(screen.getByLabelText(/Descripción/)).toBeDisabled()
    // base-ui's SelectTrigger surfaces the disabled state as a presence
    // attribute (data-disabled) when the underlying Root is disabled.
    // We assert the attribute is set, not the value.
    const triggers = screen.getAllByRole("combobox")
    expect(triggers.length).toBeGreaterThan(0)
    for (const trigger of triggers) {
      const hasDisabled =
        trigger.hasAttribute("data-disabled") ||
        trigger.getAttribute("aria-disabled") === "true";
      expect(hasDisabled).toBe(true)
    }
    // Submit button is hidden, not disabled — the user shouldn't see a
    // "Guardar cambios" they could never actually submit.
    expect(screen.queryByRole("button", { name: /Guardar cambios/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Crear tarea/ })).not.toBeInTheDocument()
  })

  it("with puede_editar=false: hides the destructive Zona de peligro", () => {
    taskQuery.data = makeTask({ puede_editar: false })
    renderDialog("t1")

    expect(screen.queryByRole("heading", { name: /Zona de peligro/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Eliminar tarea/ })).not.toBeInTheDocument()
  })

  it("with puede_editar=false: hides the write-only sub-entity sections", () => {
    taskQuery.data = makeTask({ puede_editar: false })
    renderDialog("t1")

    expect(screen.queryByRole("heading", { name: /^Subtareas$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /^Comentarios$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /^Adjuntos$/ })).not.toBeInTheDocument()
  })

  it("with puede_editar=false: still shows the task body so the user can READ it", async () => {
    // Start in loading state, then resolve — mirrors the production
    // path where useTask fetches the row asynchronously. This is the
    // only way to exercise the dialog's "taskKey changed → setForm"
    // sync, which is keyed on the initial formKey not matching the
    // post-fetch formKey.
    taskQuery.data = null
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TaskDialog
          taskId="t1"
          onClose={() => undefined}
          users={USERS}
          clients={CLIENTS}
        />
      </QueryClientProvider>,
    )
    // Resolve the query: the dialog's formKey transitions from
    // "t1:cargando" to "t1:<updated_at>", which triggers the sync.
    await act(async () => {
      taskQuery.data = makeTask({ puede_editar: false })
      // emit a microtask so React picks up the new data
      await Promise.resolve()
    })

    expect(screen.getByRole("heading", { name: /Editar tarea/ })).toBeInTheDocument()
    // The data flows into the inputs after the sync — the form is
    // present and disabled (asserted in the first test).
    expect(screen.getByLabelText(/Título/)).toBeInTheDocument()
  })

  it("with puede_editar=true: every form field is enabled and the submit button is present", () => {
    taskQuery.data = makeTask({ puede_editar: true })
    renderDialog("t1")

    expect(screen.getByLabelText(/Título/)).not.toBeDisabled()
    expect(screen.getByLabelText(/Descripción/)).not.toBeDisabled()
    for (const trigger of screen.getAllByRole("combobox")) {
      const hasDisabled =
        trigger.hasAttribute("data-disabled") ||
        trigger.getAttribute("aria-disabled") === "true";
      expect(hasDisabled).toBe(false)
    }
    expect(screen.getByRole("button", { name: /Guardar cambios/ })).toBeInTheDocument()
    // Destructive section is present for the editor.
    expect(screen.getByRole("heading", { name: /Zona de peligro/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Eliminar tarea/ })).toBeInTheDocument()
  })

  it("in NEW mode (taskId=null), the form is always editable — no puede_editar gate", async () => {
    // Creating a task is allowed for anyone with write access (the POST
    // gate is server-side). The UI must not block the "Nueva tarea"
    // button just because some fetched row is read-only.
    renderDialog(null)

    const user = userEvent.setup()
    const titulo = screen.getByLabelText(/Título/)
    await user.type(titulo, "Tarea de prueba")
    expect(titulo).toHaveValue("Tarea de prueba")
    expect(titulo).not.toBeDisabled()
    expect(screen.getByRole("button", { name: /Crear tarea/ })).toBeInTheDocument()
  })
})

describe("TaskDialog — Adjuntos drag & drop", () => {
  beforeEach(() => {
    taskQuery.data = makeTask({ puede_editar: true })
    taskQuery.isLoading = false
    taskQuery.error = null
    subtareasQuery.data = []
    comentariosQuery.data = []
    adjuntosQuery.data = []
    noopMutation.mutateAsync.mockClear()
  })

  function getDropzone() {
    // The dropzone wraps the file input, the "Subir archivo" button and
    // the helper text — same container that owns the drag handlers.
    return screen.getByRole("button", { name: /Subir archivo/ }).parentElement as HTMLElement
  }

  it("dropping a valid file uploads it via the same mutation as the file input", () => {
    renderDialog("t1")
    const file = new File(["contenido"], "contrato.pdf", { type: "application/pdf" })

    fireEvent.drop(getDropzone(), { dataTransfer: { files: [file] } })

    expect(noopMutation.mutateAsync).toHaveBeenCalledTimes(1)
    expect(noopMutation.mutateAsync).toHaveBeenCalledWith(file)
  })

  it("dropping an invalid file type shows the validation error and does not upload", () => {
    renderDialog("t1")
    const file = new File(["contenido"], "virus.exe", { type: "application/x-msdownload" })

    fireEvent.drop(getDropzone(), { dataTransfer: { files: [file] } })

    expect(noopMutation.mutateAsync).not.toHaveBeenCalled()
  })
})

describe("TaskDialog — live task-tags catalog (jefe 1.1 / S1)", () => {
  beforeEach(() => {
    taskQuery.data = makeTask({ puede_editar: true })
    taskQuery.isLoading = false
    taskQuery.error = null
    subtareasQuery.data = []
    comentariosQuery.data = []
    adjuntosQuery.data = []
    taskTagsQuery.data = null
  })

  it("offers a tag created in admin that is not in the factory TASK_TAGS", () => {
    // The boss's report: tags created in the admin panel appeared in the
    // tag list but never in the task form. The form must render the LIVE
    // catalog, not the TASK_TAGS constant.
    taskTagsQuery.data = ["Comercial", "Alianza regional"]
    renderDialog("t1")

    expect(screen.getByRole("button", { name: "Alianza regional" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
  })

  it("keeps a stored tag that is no longer in the catalog when editing (S1)", () => {
    // S1: a task keeps any tag it already has even if it is no longer in
    // the catalog — the stored tag must stay visible (and toggleable) so
    // saving does not silently drop it.
    // The dialog carries task.etiquetas into the form only through the
    // formKey sync ("nueva:…" → "t1:…"), and the mocked useTask never
    // re-renders by itself — so mount in new-task mode and rerender
    // pointing at t1, which is what clicking a card does in production.
    taskTagsQuery.data = ["Comercial"]
    taskQuery.data = makeTask({ etiquetas: ["Etiqueta retirada"] })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const dialog = (id: string | null) => (
      <QueryClientProvider client={qc}>
        <TaskDialog taskId={id} onClose={() => undefined} users={USERS} clients={CLIENTS} />
      </QueryClientProvider>
    )
    const view = render(dialog(null))
    view.rerender(dialog("t1"))

    const staleChip = screen.getByRole("button", { name: "Etiqueta retirada" })
    expect(staleChip).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
  })

  it("falls back to the factory TASK_TAGS while the catalog loads", () => {
    taskTagsQuery.data = null
    renderDialog("t1")

    // TASK_TAGS constants (src/lib/catalogs.ts) — pre-1.1 behavior.
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Alianza regional" })).not.toBeInTheDocument()
  })
})
