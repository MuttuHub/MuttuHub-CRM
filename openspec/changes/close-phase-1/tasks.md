# Tasks: Close Phase 1

## Review Workload Forecast

~1,080 lines / 5 PRs. PR 3+4=430 (over); PR 6=380 (borderline). Delivery: ask-on-risk.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Phase 1: PR 2 — `puede_editar` Emission

- [x] 1.1 RED `permissions.test.ts`: `canEditTask`/`canEditClient` shape.
- [x] 1.2 RED `tasks/route.test.ts`: rows include `puede_editar`; sub-entities inherit.
- [x] 1.3 RED `clients/route.test.ts`: rows include `puede_editar`.
- [x] 1.4 GREEN `lib/api/crm.ts`: merge `cliente: { select: { responsable_id: true } }` into `TASK_SELECT`.
- [x] 1.5 GREEN `tasks/{route,[id]/route}.ts` + `clients/{route,[id]/route}.ts`: map rows via `canEditTask`/`canEditClient`.

## Phase 2: PR 3 — Read-Scope Unlock

- [ ] 2.1 RED NEW `lib/permissions.read.test.ts`: `buildTaskWhere({}, COLABORADOR)` no `responsable_id`; `buildClientWhere` idem; `parseTaskFilters` keeps clause.
- [ ] 2.2 RED `clients/route.test.ts` + NEW `clients/[id]/route.test.ts`: COLABORADOR sees all; foreign `GET`=200.
- [ ] 2.3 RED `dashboard/tasks/route.test.ts`: 4 faces + `nav/counts`=`"all"`; `my-summary`=`"own"`.
- [ ] 2.4 RED `notifications/route.test.ts`: unchanged sentinel.
- [ ] 2.5 RED NEW `cron/daily/route.test.ts`: COLABORADOR sees own.
- [ ] 2.6 RED NEW `tasks/[id]/attachments/[attachmentId]/download/route.test.ts`: "Operativo"=302; "Legal"=403.
- [ ] 2.7 SENTINEL: `documents/**` test diff=0.
- [ ] 2.8 GREEN `clients/route.ts:110` + `clients/[id]/route.ts:80`: drop conditionals.
- [ ] 2.9 GREEN `lib/dashboard.ts:23-25`: delete `resolveScope`+export.
- [ ] 2.10 GREEN `dashboard/{pipeline,tasks,clients-activity}/route.ts` + `nav/counts/route.ts`: `scope="all"`.
- [ ] 2.11 GREEN `tasks/[id]/attachments/[attachmentId]/download/route.ts:29`: read gate preserving `Documento.categoria` 403.
- [ ] 2.12 GREEN NEW `cron/daily/route.ts`: mirror `notifications/route.ts:90`.
- [ ] 2.13 Docs `openapi/paths/{clients,tasks}.ts`: mark reads global.

## Phase 3: PR 4 — UI Affordances

- [x] 3.1 RED NEW `kanban-board.test.tsx`: `useSortable({ disabled: !puede_editar })` via `data-dnd-disabled`; destructive absent.
- [x] 3.2 RED NEW `tasks/task-dialog.test.tsx` + `clients/client-sheet.test.tsx`: fields `disabled` when `!puede_editar`.
- [x] 3.3 GREEN `kanban-board.tsx` + `task-card.tsx`: drag disabled; destructive `return null`.
- [x] 3.4 GREEN `tasks/task-dialog.tsx` + `clients/client-sheet.tsx`: `disabled={!puede_editar}`.
- [x] 3.5 E2E NEW `e2e/permisos-colaborador.spec.ts`: COLABORADOR sees foreign task → no save/delete → `patch`=403.

## Phase 4: PR 5 — Toggle Removal (Verify)

- [ ] 4.1 Verify `git diff main -- kanban-board.tsx`: zero `Scope`/`SCOPE_KEY`/`canEquipo`; `localStorage.removeItem("muttu:kanban:scope")` present.

## Phase 5: PR 6 — Filters + Banner + Audit

- [x] 5.1 RED `tasks/route.test.ts`: `?prioridad`/`?etiqueta`/`?fecha_entrega_*` server-side; merge with `vencidas`; `total` included.
- [x] 5.2 RED `tasks/export/route.test.ts`: calls `logAudit({ accion:"exportar", rows, filters })`.
- [x] 5.3 RED NEW `audit/export.test.ts`: task+client exports write `auditoria`; throw doesn't fail export. (covered inline in tasks/export + clients/export test files — no separate audit/export.test.ts created; the brief said "If it doesn't exist, the deletion is covered by the typecheck/lint" but here both inline tests cover this scenario.)
- [x] 5.4 RED `kanban.test.ts`: `applyLocalFilters`/`localFiltersActive`/`LocalTaskFilters` no longer exported.
- [x] 5.5 GREEN `lib/api/audit.ts`: widen `AuditAccion` to `"exportar"`.
- [x] 5.6 GREEN `tasks/route.ts`: extend `parseTaskFilters`+`buildTaskWhere`; second `count` for `total`.
- [x] 5.7 GREEN `tasks/export/route.ts` + `clients/export/route.ts`: `logAudit` in try/catch.
- [x] 5.8 GREEN `hooks/kanban.ts`: delete `applyLocalFilters`/`localFiltersActive`/`LocalTaskFilters`/`EMPTY_LOCAL_TASK_FILTERS`.
- [x] 5.9 GREEN NEW `truncation-banner.tsx` (10 lines) + wire into `kanban-board.tsx`.
- [x] 5.10 Docs `README.md`+`guia-demo.md`+`openapi/paths/tasks.ts`: scope+new params.

## Phase 6: PR 7 — `useInfiniteQuery`

- [ ] 6.1 RED `kanban.test.ts`: `useTasks` paginates+appends; `hasNextPage=false` when null.
- [ ] 6.2 RED `kanban-board.test.tsx`: "Cargar más" present first page; appends no dupes; absent when null.
- [ ] 6.3 GREEN `hooks/kanban.ts`: `useInfiniteQuery` (page 100, `getNextPageParam: last=>last.nextCursor??null`).
- [ ] 6.4 GREEN `kanban-board.tsx`: "Cargar más" button→`fetchNextPage`; hidden when `!hasNextPage` (no IntersectionObserver per D8).
