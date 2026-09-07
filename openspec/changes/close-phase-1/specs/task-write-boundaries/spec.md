# Delta for task-write-boundaries

> New capability. Server emits `puede_editar`; UI gates drag, destructive controls, edit fields. Server is the authority — a `puede_editar` value in a request body is never trusted.

**Release coupling.** Ships with `global-task-board` (PR 3 + PR 4 same release). Without the UI gate, PR 3 alone surfaces write controls that 403 on click.

**Path note.** Plan cites `src/app/api/v1/attachments/[attachmentId]/download/route.ts:29`. Actual: `src/app/api/v1/tasks/[id]/attachments/[attachmentId]/download/route.ts:29`. Scenarios below use the actual path.

## ADDED Requirements

### Requirement: Server emits `puede_editar` per task

Every task returned by list and detail endpoints MUST carry `puede_editar`, computed by `canEditTask(tarea, actor)` (`src/lib/permissions.ts`). `TASK_SELECT` MUST include `cliente: { select: { responsable_id: true } }` so the flag needs no extra query.

| Scenario | Test file |
|---|---|
| ADMINISTRADOR → `puede_editar: true` for any task, no extra query | `tasks/route.test.ts` |
| COLABORADOR `responsable_id === actor.id` → `true` | `tasks/route.test.ts` |
| COLABORADOR `cliente_responsable_id === actor.id` (not responsable) → `true` | `tasks/route.test.ts` |
| COLABORADOR no relation to task or client → `false` | `tasks/route.test.ts` |

### Requirement: Server emits `puede_editar` per client

Every client returned by list and detail endpoints MUST carry `puede_editar`, computed by `canEditClient(cliente, actor)`.

| Scenario | Test file |
|---|---|
| COLABORADOR `responsable_id === actor.id` → `true` | `clients/[id]/route.test.ts` |
| COLABORADOR `responsable_id !== actor.id` → `false` | `clients/route.test.ts` |

### Requirement: Server is the authority

Write endpoints MUST recompute authorization via `getTaskForWrite` / `getClientForWrite` and ignore any `puede_editar` value in the request body.

#### Scenario: COLABORADOR spoofs flag on a foreign task — `tasks/[id]/route.test.ts`

- GIVEN a COLABORADOR whose `id` matches neither `responsable_id` nor `cliente_responsable_id`
- WHEN PATCH `/api/v1/tasks/[id]` with body `{ puede_editar: true, ... }`
- THEN the response is 403
- AND no field of the task is persisted

#### Scenario: COLABORADOR's own task is unaffected by client-supplied flag — `tasks/[id]/route.test.ts`

- GIVEN a COLABORADOR who IS the `responsable_id`
- WHEN PATCH `/api/v1/tasks/[id]` with body `{ puede_editar: false, ... }`
- THEN the response is 200 and the change is applied (flag is output-only)

### Requirement: Kanban UI gates write controls on `puede_editar`

Every Kanban write control MUST be disabled or hidden when `puede_editar === false`. Drag MUST use `useSortable({ disabled: !puede_editar })` so pointer and keyboard reordering are both blocked. Destructive buttons MUST not render. Edit fields MUST render `disabled` with a tooltip.

| Scenario | Test file |
|---|---|
| Foreign card: pointer drag starts but `useSortable` reports `disabled` and no reorder fires | `kanban-board.test.tsx` |
| Foreign card: Space then Arrow keys → position unchanged, `aria-disabled` present | `kanban-board.test.tsx` |
| Foreign card: no destructive action (delete, archive) element in DOM | `kanban-board.test.tsx` |
| Foreign card edit dialog: every editable field `disabled` with explanatory `title`/`aria-describedby` | `kanban-board.test.tsx` |
| ADMINISTRADOR same task: drag enabled, destructive buttons present, fields enabled without tooltip | `kanban-board.test.tsx` |
