# Lane 1 — data, tags, documents by client (boss requirements 2026-10-28)

Objective: fix tags, add the allies category, and make Documents work per client (folders, drag & drop, task
attachments). Shared rules, verbatim requests (R1–R3), assumptions (A1–A5), root causes and file ownership:
`odd/tasks/jefe-requerimientos-2026-10-28.md` — read it first. One branch + one PR per task from `main`. Test runner:
`npx vitest run` + `npx tsc --noEmit` + Playwright for the flow; DB only with `.env.local`. Mirror: Engram
`odd/jefe-carril-1/tasks` (in the account that works this lane).

## Specs

- **S1 — tags (R1).** «tiene problemas al crear etiquetas, que en el panel de administración le muestra que se crean y
  están en el listado de etiquetas, pero no aparecen al momento de crear un cliente o asignar una tarea». A tag created
  in admin must appear in the task create/edit form, the board tag filter and the client commitment form, without a
  reload. A task keeps any tag it already has even if it is no longer in the catalog. (Client side of tags: Lane 2, 2.6,
  same catalog per A1.)
- **S2 — allies (R1).** «crear una categoría de aliados». Per A2: new `TipoCliente` value with label «Aliado
  estratégico», selectable in the client form and filterable in the client list.
- **S3 — folder upload (R1).** «si el crea una carpeta por ejemplo para un cliente, no se guarda dentro de esa carpeta y
  para ese cliente sino que queda en la carpeta "Todas"». A document uploaded while a folder is selected is stored in
  that folder; if the folder belongs to a client, the document is also linked to that client.
- **S4 — client folders (R1).** «debe existir una opción fácil para crear carpetas por cliente». One action creates (or
  opens, if it exists) the folder of a chosen client (A5).
- **S5 — drag & drop (R1).** «poder arrastrar los archivos a las carpetas de esos cliente y automáticamente se le
  asigne a ese cliente dicho documento». Dropping one or more files on a client folder (tree node or the list while that
  folder is open) uploads them into that folder and links them to that client. Existing documents can be moved by
  dragging them onto a folder.
- **S6 — task attachments (R1).** «si se crea una tarea para ese cliente y se adjunta un documento debe aparecer en su
  carpeta de la sección de documentos». A file attached to a task with a client appears in that client's folder.
- **S7 — modal UX review, Documents (R2).** «en cuanto a los modales, revisalo y mira si la ux está bien para todos».
  Review document detail, new version, upload and folder dialogs; fix clear defects, log the rest for 2.8.

## Tasks

| ID | Specs | Task | Depends | Route | Status | Commit / evidence |
|---|---|---|---|---|---|---|
| 1.0 | S2, S4–S6 (schema) | **Schema PR, merge first.** One migration: `Carpeta.cliente_id String? @unique` + relation to `Cliente`; `Cliente.etiquetas String[] @default([])`; `TipoCliente` + `ALIADO_ESTRATEGICO` (`ALTER TYPE … ADD VALUE`). Label in `TIPO_CLIENTE_LABELS`; enum in `src/lib/openapi/paths/clients.ts`. Regenerate Prisma client. Validate with `.env.local` + CI (ephemeral Postgres). | — | inline | done | d8013e9, PR #102 (validation: 72 files / 946 tests, tsc clean; migration to prod BEFORE merge, runbook of #99) |
| 1.1 | S1 | `useTaskTags()` copying `useDocCategories` over `/api/v1/catalogs/settings`, invalidated in `useSaveSettings`. Use it in `task-dialog.tsx:384`, `kanban-board.tsx:908` filter, and a new tags field in `crm/task-dialogs.tsx` (check the client-task endpoint accepts `etiquetas`). Merge stored tags not in the catalog when editing. RED first: "tag created in admin does not show in the task form". **After merge, kanban/*, hooks/kanban.ts, hooks/admin.ts and crm/task-dialogs.tsx pass to Lane 2.** | — | inline | done | c5613f3, PR #103 (20 tests, tsc/eslint clean) |
| 1.2 | S3, S4 | Backend: folder create accepts `cliente_id`; find-or-create client folder endpoint; `POST /api/v1/documents` (both branches) and `uploads/sign` accept `carpeta_id`; client derived from the folder and the same `cliente_id` used at sign and confirm (`documents/route.ts:152-160`); PATCH move keeps the client link in sync. Update OpenAPI documents paths. | 1.0 | inline | todo | |
| 1.3 | S3–S5 | UI: upload uses the active folder; «Carpeta de cliente» action with client search; multi-file drop on list and tree nodes; drag existing documents to folders (`@dnd-kit`); new `useMoveDocument` hook. | 1.2 | inline | todo | |
| 1.4 | S6 | `mirrorAttachmentAsDocument` finds/creates the task client's folder and sets `carpeta_id`. Optional backfill script for existing mirrors with the anti-production guard of `prisma/seed.ts`. | 1.2 | inline | todo | |
| 1.5 | S7 | Modal UX review of `src/components/documents/*`; fixes + findings logged here for 2.8. | 1.3 | inline | todo | |

## Log

- **L1 (2026-10-28) — original request.** See R1–R3 in `odd/tasks/jefe-requerimientos-2026-10-28.md` (verbatim).
- **L2 (2026-10-28).** Plan approved by the user with assumptions A1–A5. Lane created; next step: 1.0.
- **L4 (2026-10-29).** 1.0 done on `feat/esquema-jefe-carril-1` (worktree `carril-1`): commit d8013e9 — migration `20261029120000_jefe_clientes_aliados_carpetas` (additive only), schema, «Aliado estratégico» label, OpenAPI enums, clients route tests. Prisma client regenerated. Validation: `vitest` clients+lib 72 files / 946 tests green (3 vitest worker timeouts = known WSL contention noise), `tsc --noEmit` clean. PR #102 open; **do not merge before applying the migration to production** (after the merge the client form offers «Aliado estratégico», which prod rejects until the enum value exists). 1.1 started on `feat/tags-catalogo-tareas` (RED tests written: `useTaskTags` live catalog in task-dialog, kanban filter and CRM task-dialogs, stored tags kept when out of catalog).
- **L5 (2026-10-29).** 1.1 done on `feat/tags-catalogo-tareas`: single commit c5613f3 (9 files, 495 lines incl. tests — one task, one PR). `useTaskTags()` in `hooks/admin.ts` (live `task_tags` via `/api/v1/catalogs/settings`, factory fallback, invalidated by `useSaveSettings`); chips in `task-dialog.tsx`, board filter via `tags` prop, new Etiquetas field in `crm/task-dialogs.tsx` + `TareaInput.etiquetas`; stale stored tags stay as toggleable chips (S1). RED→GREEN: 20 tests across 4 files, tsc + eslint clean. PR #103 open. **Test-mocking lesson (recorded for the lane): the dialog formKey sync never fires when mocked query data is set before mount or mutated without a re-render — mount in create/new mode and `rerender` into edit mode instead.** Next: 1.2 (depends on 1.0 merging — PR #102, migration to prod first).
