// PR 4 (Slice B2): UI gate on the TaskDialog.
//
// When the opened task carries `puede_editar: false`, the form must be
// fully read-only: every input/textarea/select disabled, the "Guardar
// cambios" submit button not rendered, and the write-only sub-entity
// sections (Subtareas / Comentarios / Adjuntos) and the destructive
// "Zona de peligro" all hidden. The task body itself must still render
// (a COLABORADOR needs to be able to READ the foreign task — see
// global-task-board spec scenarios).

import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TaskItem } from "@/hooks/crm"
import type { TaskDetail } from "@/hooks/kanban"
import { TaskDialog } from "./task-dialog"

const { taskQuery, subtareasQuery, comentariosQuery, adjuntosQuery } = vi.hoisted(
  () => ({
    taskQuery: { data: null as TaskDetail | null, isLoading: false, error: null as unknown },
    subtareasQuery: { data: [] as { id: string; titulo: string; completada: boolean; tarea_id: string }[], isLoading: false, isError: false },
    comentariosQuery: { data: [] as { id: string; autor_id: string; autor_nombre: string; texto: string; created_at: string }[], isLoading: false, isError: false },
    adjuntosQuery: { data: [] as { id: string; nombre: string; tamano_bytes: number | null; created_at: string }[], isLoading: false, isError: false },
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
    // Estado Select is only rendered when isEdit && task; present here.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0)
    for (const trigger of screen.getAllByRole("combobox")) {
      // base-ui SelectTrigger renders as a combobox role; the disabled
      // signal surfaces as `data-disabled` or `aria-disabled`.
      const disabled =
        trigger.getAttribute("data-disabled") === "true" ||
        trigger.getAttribute("aria-disabled") === "true";
      expect(disabled).toBe(true)
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
      const disabled =
        trigger.getAttribute("data-disabled") === "true" ||
        trigger.getAttribute("aria-disabled") === "true";
      expect(disabled).toBe(false)
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
