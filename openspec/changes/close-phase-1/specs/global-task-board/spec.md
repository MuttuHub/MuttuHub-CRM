# Delta for global-task-board

> Read-scope becomes global for tasks, clients, dashboard, attachment downloads. Server-side filters, audited exports, infinite pagination. Notifications and daily cron stay personal.

**Releases.** Read-scope unlock = PR 3 + PR 4 same release. Filters, banner, export audit, pagination = PR 6 + PR 7 separate release. Scenarios name their release.

## ADDED Requirements

### Requirement: Tasks, clients, dashboard reads are global — PR 3

List/detail/report endpoints for tasks and clients MUST return every row to any authenticated user. `src/lib/dashboard.ts` MUST drop per-face role branching; `resolveScope` MUST be removed. The four dashboard faces and `nav/counts` MUST read scope `"all"`; `my-summary` MUST keep `"own"`.

- **COLABORADOR sees every task in a seeded list of N** — `tasks/route.test.ts`
- **`buildTaskWhere({}, COLABORADOR)` has no `responsable_id` predicate** — `permissions.read.test.ts`
- **`parseTaskFilters({responsable:"x"}, COLABORADOR)` keeps the `responsable_id` clause** — `permissions.read.test.ts`
- **`/tasks/report` `resumen.total` equals the global count for COLABORADOR** — `tasks/report/route.test.ts`
- **COLABORADOR sees every client in a seeded list of N** — `clients/route.test.ts`
- **COLABORADOR reads a client where `responsable_id !== actor.id` → 200** — `clients/[id]/route.test.ts`
- **`buildClientWhere({}, COLABORADOR)` has no `responsable_id` predicate** — `permissions.read.test.ts`
- **`resolveScope` is not exported; faces pass `"all"` literal** — `dashboard.test.ts`
- **All four faces and `nav/counts` return org-wide data for COLABORADOR** — `dashboard.test.ts`
- **`my-summary` returns only `responsable_id === actor.id` tasks** — `dashboard.test.ts`

### Requirement: Attachment downloads global; document-category gate unchanged — PR 3

`GET /api/v1/tasks/[id]/attachments/[attachmentId]/download` MUST allow any authenticated user to download any attachment whose `Documento.categoria` is not restricted. A COLABORADOR downloading an attachment of a `Legal` document MUST still get 403. The existing restricted-category upload test in `documents/route.test.ts` MUST pass UNMODIFIED (confidentiality sentinel).

- **COLABORADOR downloads "Operativo" attachment on non-owned task → 302** — `tasks/[id]/attachments/[attachmentId]/download/route.test.ts`
- **COLABORADOR downloads "Legal" attachment → 403, no signed URL** — `tasks/[id]/attachments/[attachmentId]/download/route.test.ts`
- **`documents/route.test.ts` restricted-category upload test passes UNMODIFIED** — `documents/route.test.ts`

### Requirement: Notifications and daily cron stay personal — explicitly unchanged

Both `GET /api/v1/notifications` and `GET /api/v1/cron/daily` MUST keep personal scope.

- **COLABORADOR receives alerts only for tasks they own or are responsible for** — `notifications/route.test.ts`
- **COLABORADOR `/cron/daily` summary lists only their own tasks** — `cron/daily/route.test.ts`

### Requirement: Server-side filters replace client-side filters — PR 6

`GET /api/v1/tasks` MUST accept `prioridad`, `etiqueta`, `fecha_entrega_desde`, `fecha_entrega_hasta` as Prisma `where` clauses. `applyLocalFilters`, `localFiltersActive`, `LocalTaskFilters` in `src/hooks/kanban.ts` MUST be deleted. Exports MUST inherit the filters.

- **`?prioridad=ALTA` returns only ALTA; `total` is unfiltered-by-priority count** — `tasks/route.test.ts`
- **`?etiqueta=legal` returns only tasks whose `etiquetas` contains `"legal"`** — `tasks/route.test.ts`
- **`?fecha_entrega_desde&fecha_entrega_hasta` returns only tasks inside the range** — `tasks/route.test.ts`
- **`/tasks/export?prioridad=ALTA` exports only ALTA tasks** — `tasks/export/route.test.ts`
- **`applyLocalFilters`, `localFiltersActive`, `LocalTaskFilters` no longer exported** — `kanban.test.ts`

### Requirement: Truncation banner reflects unfiltered count — PR 6

When returned count < unfiltered-by-priority total, Kanban MUST display `Mostrando N de M tareas`. When N === M, the banner MUST NOT render. `total` MUST be the unfiltered-by-priority count.

- **25 on page, `total: 200` → banner reads `Mostrando 25 de 200 tareas`** — `kanban-board.test.tsx`
- **50 on page, `total: 50` → banner does not render** — `kanban-board.test.tsx`

### Requirement: Exports are audited — PR 6

`logAudit` MUST record task and client exports with `usuario_id`, timestamp, `cantidad_filas`, and applied filters. Audit failure MUST NOT fail the export (best-effort).

- **Task export of 30 rows → `auditoria` row with `accion="exportar"`, `usuario_id`, `cantidad_filas: 30`, filters in `cambios`** — `audit/export.test.ts`
- **Client export → `auditoria` row with `cantidad_filas` matching the file** — `audit/export.test.ts`
- **`logAudit` throws → export still returns 200** — `audit/export.test.ts`

### Requirement: Infinite pagination replaces the 100-row cap — PR 7

Kanban MUST use `useInfiniteQuery` with a "Cargar más" affordance. The `limit: 100` cap MUST go. When `nextCursor` is `null`, the affordance MUST disappear.

- **First page of 50, `nextCursor: "abc"` → 50 cards render, "Cargar más" present** — `kanban-board.test.tsx`
- **Click "Cargar más" → next 50 cards appended, no duplicates** — `kanban-board.test.tsx`
- **Last page `nextCursor: null` → "Cargar más" not present** — `kanban-board.test.tsx`
