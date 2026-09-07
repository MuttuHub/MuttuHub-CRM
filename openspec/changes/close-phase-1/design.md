# Design: close-phase-1 — Finish the global read-scope + write-boundary refactor

## Technical Approach

Surgical phase-1 closure. PRs 1 + 2 are already landed (`src/lib/permissions.ts` exists and its tests cover the write matrix; `isFullAccess` and `getTaskForWrite`/`getClientForWrite` already delegate to `canManageAny` / `canEditTask` / `canEditClient`). The remaining work is two coupled releases:

- **Release A — PR 3 + PR 4**: drop the read gates on clients and dashboard, delete `resolveScope`, and wire `puede_editar` into the UI. Ships together (PR 3 without PR 4 = 403-on-click).
- **Release B — PR 6 + PR 7**: server-side filters, banner, audited exports, infinite pagination.

No schema change, no migration, no new dependency. Every change is a surgical edit (1-3 lines per site). `useInfiniteQuery` is already in TanStack Query per the proposal.

## Architecture Decisions

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Keep `isFullAccess` in `src/lib/api/crm.ts` (read-scope predicate, untouched) | Rename to `canReadAll`; move to `permissions.ts` | Plan §3A: "nunca se toca la semántica de ese helper". 11 call sites use it (dashboard faces, nav/counts, notifications, cron, attachment download). Rename = churn for zero behavior change. Two predicates, one role list, clearly named for what each gates. |
| D2 | Two predicates, one role list (`MANAGE_ANY_ROLES === FULL_ACCESS_ROLES` as a tuple of literal strings) | Single `canManageEverything` predicate | Plan §3A: "una sola regla, dos consumidores (API y UI)". Distinct predicates make the **read vs. write** boundary explicit at every call site; identical values is the shared ground truth, documented in the header comment of `permissions.ts`. |
| D3 | `puede_editar` computed in the same Prisma `findMany` that already loads the row — no second query | Second query per row; client-side recompute | Plan §3A: "`TASK_SELECT` agrega `cliente: { select: { responsable_id: true } }` — sin query extra". `getTaskForWrite` already pays for that join, so reusing it for the flag is free. |
| D4 | Sub-entities (`subtarea`, `adjunto`, `comentario`) inherit `puede_editar` from the parent task | Recompute per sub-row | The plan states this. Sub-entities belong to a single task; recomputing per row would require N extra reads of the parent. |
| D5 | Read gate for attachment download (`getTaskForWrite` → read-only gate), keep restricted-category 403 | Keep `getTaskForWrite`; new helper `canReadAttachment(taskId, attachmentId, usuario)` | The brief's path-discrepancy note (plan cited a shorter path; actual is `tasks/[id]/attachments/[attachmentId]/download`). Read gate must still call the restricted-category gate on the underlying `Documento` — otherwise a COLABORADOR could attach a `Legal` document to their own task and bypass the upload restriction. |
| D6 | Server-side filters via three independent Prisma clauses (no `AND` composition) | Compose with `AND` for the range; rewrite `buildTaskWhere` | The existing `vencidas` branch already writes `where.fecha_entrega`. Extending that branch (the brief's "extend" path) keeps a single owner of the field. Composing with `AND` would require either duplicating the field or using `AND: [{ fecha_entrega: <lt> }, { fecha_entrega: <gte/lte> }]` — Prisma rejects duplicate keys at the same level. Decision: **extend the `vencidas` branch**; introduce `rango: Prisma.DateTimeNullableFilter` shared between `vencidas` (`{ lt: new Date() }`) and the new `desde/hasta` clause, merged with the `AND` array only when both apply. |
| D7 | `total` requires a SECOND `count` query without `prioridad/etiqueta/fecha_entrega` | Reuse the existing count; accept misleading total | Plan §3A: "el `total` deja de mentir". Cost: one extra `count(*)` per list request — negligible at ≤1000 rows. The "Mostrando N de M" banner is honest about the truncation only when `total` is unfiltered-by-priority. |
| D8 | "Cargar más" button (not infinite scroll) | `IntersectionObserver` + `useInfiniteQuery` `fetchNextPageOnMount` | Plan §3A: "el kanban columns are not virtualized; adding scroll events breaks DnD". `dnd-kit` listeners on the cards and a window scroll listener are known to fight over `touchmove` preventDefault. Explicit button keeps DnD stable. |
| D9 | Hide destructive buttons when `!puede_editar` (return `null`, not `disabled`) | Render disabled with tooltip | Plan §3A: "nunca mostrar un control que va a devolver 403". A disabled button still looks tappable and burns a click. |
| D10 | Widen `AuditAccion` in `src/lib/api/audit.ts` to add `"exportar"` | New `entidad: "export"`; raw SQL via `executeRaw` | The brief claims the existing schema supports unknown `accion` strings. **It does not** — `AuditAccion = "crear" | "editar" | "eliminar"` (line 19). Spec scenarios use `accion="exportar"`. Widening the type is the surgical fix; adding `"exportar"` keeps the same string family and lets the auditor filter on it. |

## Architecture Summary

**Two predicates, two scopes, one role list.**

    READ-SCOPE:   isFullAccess(rol)              (in src/lib/api/crm.ts, untouched)
    WRITE-AUTHORITY: canManageAny(rol)            (in src/lib/permissions.ts)
                  = canReadRestrictedDocs(rol)   (alias, same value, different concept)
                  = canEditTask(tarea, actor)   (delegated by getTaskForWrite)
                  = canEditClient(cliente, actor) (delegated by getClientForWrite)

**`puede_editar` flow.** Server emits it on every `Tarea` and `Cliente` in list + detail responses. `TASK_SELECT` gains `cliente: { select: { responsable_id: true } }` so the flag is computed from the same join the row already loads. List handler maps each row through `canEditTask({ responsable_id, cliente_responsable_id: row.cliente?.responsable_id ?? null }, { id: usuario.id, rol: usuario.rol })`. Sub-entities (`subtarea`, `adjunto`, `comentario`) inherit the parent's flag — the parent's row is already in scope at the call site.

**Attachment download gate change.** Current: `getTaskForWrite` (write gate) at `tasks/[id]/attachments/[attachmentId]/download/route.ts:29`. New: same gate body, but predicate becomes read-only — any authenticated user passes, EXCEPT if the underlying `Documento.categoria` is restricted (existing 403 path, untouched). The restricted-category gate is what stops a COLABORADOR from attaching a `Legal` document to their own task and downloading it.

**`resolveScope` deletion.** Delete `dashboard.ts:23-25`. The four faces (`pipeline`, `tasks`, `clients-activity`, `my-summary`) and `nav/counts` pass the literal `"all"` (4 faces) or `"own"` (`my-summary` stays `"own"`). No new helper — the literal is the explicit answer to "what scope does this face serve".

## Data Model

**No new tables, columns or migrations.** The `puede_editar` flag is a server-computed boolean on the response payload, not a schema field. Schema unchanged.

## Server Contracts

### `puede_editar` on `Tarea`
- Computed in the same Prisma `findMany`/`findFirst` that loads the row. Reuses `canEditTask(tarea, actor)`.
- `TASK_SELECT` (in `src/lib/api/crm.ts:273-290`) gains `cliente: { select: { responsable_id: true } }` next to the existing `cliente: { select: { nombre: true } }` — joined under a single key by spreading the second select into the first.
- Sub-entities (`subtarea`, `adjunto`, `comentario`) inherit the parent's `puede_editar`. Implemented at the call site (the parent is already in scope).
- For list endpoints: computed per row using `canEditTask({ responsable_id, cliente_responsable_id: row.cliente?.responsable_id ?? null }, actor)`.

### `puede_editar` on `Cliente`
- Same pattern, uses `canEditClient(cliente, actor)`. The existing `CLIENT_BASE_SELECT` / `CLIENT_FULL_SELECT` already include `responsable_id` (line 117 / 129), so no select change.

### Filters on `GET /api/v1/tasks`
- Three new query params: `prioridad`, `etiqueta`, `fecha_entrega_desde` + `fecha_entrega_hasta`.
- Three new Prisma clauses in `buildTaskWhere`:
  - `if (filters.prioridad) where.prioridad = filters.prioridad as PrioridadTarea;`
  - `if (filters.etiqueta) where.etiquetas = { has: filters.etiqueta };`
  - **Range** — see D6. Reuse the existing `fecha_entrega` branch, extended: when `vencidas` is true, the range is `{ lt: new Date() }`; when `desde`/`hasta` are present, the range is `{ gte: ..., lte: ... }` (via `endOfDay`). When both apply, compose with `AND`.
- `total` on the response: SECOND `db.tarea.count` without `prioridad`, `etiqueta`, `fecha_entrega_*`. Either compute the second `where` by deleting those keys, or build `whereForCount` alongside `where`. The second query is unconditional — cheaper than branching on which filters are active.

### Audit on exports
- New `accion: "exportar"` in `AuditAccion` (D10).
- `tasks/export/route.ts` end of handler: `logAudit({ entidad: "tarea", entidad_id: null, accion: "exportar", usuario_id, cambios: { rows: <count>, filters: <url.searchParams record> } })`.
- `clients/export/route.ts` end of handler: same shape, `entidad: "cliente"`.
- `entidad_id` is `null` because export is a query, not a row mutation — `logAudit` already supports `cambios` as the carry.

## Read-Scope Unlock — PR 3 (Exact Diffs)

| Site | Before | After |
|---|---|---|
| `src/app/api/v1/clients/route.ts:110` | `if (!isFullAccess(usuario.rol)) where.responsable_id = usuario.id;` | *(delete line)* |
| `src/app/api/v1/clients/[id]/route.ts:80` | `...(isFullAccess(auth.usuario.rol) ? {} : { responsable_id: auth.usuario.id }),` | *(delete the spread)* |
| `src/lib/dashboard.ts:23-25` | `export function resolveScope(usuario: Pick<Usuario, "rol">): DashboardScope { return isFullAccess(usuario.rol) ? "all" : "own"; }` | *(delete function + remove from named exports)* |
| `src/app/api/v1/dashboard/pipeline/route.ts:53` | `const scope = resolveScope(auth.usuario);` | `const scope = "all" as const;` |
| `src/app/api/v1/dashboard/tasks/route.ts:64` | `const scope = resolveScope(auth.usuario);` | `const scope = "all" as const;` |
| `src/app/api/v1/dashboard/clients-activity/route.ts:65` | `const scope = resolveScope(auth.usuario);` | `const scope = "all" as const;` |
| `src/app/api/v1/nav/counts/route.ts:23` | `const scope = resolveScope(auth.usuario);` | `const scope = "all" as const;` |
| `src/app/api/v1/dashboard/my-summary/route.ts:52` | `tareaScopeWhere("own", auth.usuario, filters, {...})` | *(unchanged — already literal `"own"`)* |
| `src/app/api/v1/tasks/[id]/attachments/[attachmentId]/download/route.ts:29` | `const access = await getTaskForWrite(id, auth.usuario);` | new `canReadAttachment(taskId, attachmentId, usuario)` — loads the task (exists?), the adjunto (exists?), AND the underlying `Documento.categoria`. 403 if the `Documento.categoria` is restricted; 200/302 otherwise. |

## UI Affordances — PR 4 (Exact Pattern, Per Site)

| Surface | Pattern | Notes |
|---|---|---|
| Kanban drag (`task-card.tsx:199`) | `useSortable({ id, disabled: !puede_editar })` | The existing `BUG FIX` comment notes `disabled` blocks both pointer and keyboard — exactly what we want for foreign cards. |
| Destructive buttons (delete task, delete client, delete comment, delete attachment) | `if (!puede_editar) return null;` | Hide, not disable — see D9. |
| Edit fields (TaskDialog, ClientSheet) | `disabled={!puede_editar}` + shadcn `Tooltip` if the project has it | Check `src/components/ui/tooltip.tsx` — if absent, omit tooltip and keep the disabled state (server is the authority). |
| Sub-entity controls (subtareas, comentarios, adjuntos) | Inherit parent `puede_editar` at the call site | No re-implementation per row. |

## Server-Side Filters — PR 6 (Merge Tradeoff)

The `buildTaskWhere` function at `src/app/api/v1/tasks/route.ts:79-100` currently writes `where.fecha_entrega` only inside the `vencidas` branch. PR 6 must handle three range shapes:

| Case | Shape | Composition |
|---|---|---|
| `vencidas=true` only | `{ lt: new Date() }` | Direct assignment. |
| `desde` / `hasta` only | `{ gte, lte }` (with `endOfDay`) | Direct assignment. |
| `vencidas=true` AND range | `{ lt: new Date(), gte, lte }` | Merge — assign the same object. |
| Neither | `undefined` | Delete the key. |

The merged object is built in one place, then assigned to `where.fecha_entrega` once. No `AND` composition required (the brief flagged the tradeoff; the merged-object approach avoids it).

## Banner — PR 6

- New client component `src/components/kanban/truncation-banner.tsx` (10 lines).
- Renders only when `items.length < total`. Props: `shown: number; total: number;`.
- Mounted at the top of the kanban board, above the columns.
- No new state, no new provider — `total` comes from `useInfiniteQuery` pages.

## Infinite Pagination — PR 7

- Replace `useTasks` (`src/hooks/kanban.ts:156`) with `useInfiniteQuery({ queryKey, queryFn, initialPageParam: 0, getNextPageParam: (last) => last.nextCursor ?? null })`.
- Page size stays 100.
- Aggregate `data.pages.flatMap(p => p.items)` for the kanban render.
- Cancel query on unmount (default TanStack behavior with `signal` — confirmed). Avoids the "stale fetch on tab switch" trap.
- New "Cargar más" button at the bottom of the board — calls `fetchNextPage`. Disappears when `hasNextPage === false`.

## What Does NOT Change (Diff-Stays-Surgical List)

- `src/lib/api/crm.ts:46-56` — `getClientForWrite` keeps signature, still delegates to `canEditClient`.
- `src/lib/api/crm.ts:77-97` — `getTaskForWrite` keeps signature, still delegates to `canEditTask`.
- `src/lib/api/crm.ts:31-39` — `loadClientScoped` and `crm.ts:63-71` — `loadTaskScoped`: **the brief lists them in §3A but they aren't called by any route in the search results**. Dead code in the current tree; leave them in place but unreferenced, or delete in a separate commit. Verify by grep before touching.
- `src/app/api/v1/tasks/route.ts:207-209` — POST validation, untouched.
- `src/app/api/v1/clients/route.ts:254-256` and `src/app/api/v1/clients/[id]/route.ts:143,148-158,221` — POST/PATCH/DELETE write gates, untouched (they use `canManageAny`, already correct).
- All 13 call sites of `getTaskForWrite` / `getClientForWrite` — signatures unchanged.
- `src/lib/api/documents.ts:114-128` — `loadDocumentForDelete` untouched.
- `src/app/api/v1/documents/route.ts:224` — restricted-category upload gate untouched.
- `src/lib/supabase/server.ts:154` — `requireApiRole` untouched.
- `src/app/api/v1/notifications/route.ts:90` — `scope = "own"` for COLABORADOR, **explicitly unchanged**.
- `src/app/api/v1/cron/daily/route.ts:102` — file **does not exist** today. Per the brief's risk callout: implementer must create it. The design assumes the personal-scope test from `notifications/route.test.ts:90` applies (line 102 of the new file). Pattern: identical to `notifications/route.ts` — `scope = "own" | "all"` for COLABORADOR → `"own"`, then `buildSnapshot(auth.usuario, scope)`.
- `isFullAccess` stays in `src/lib/api/crm.ts` — 11 call sites (dashboard resolveScope deletion, notifications, cron, attachment download, plus a couple of helpers).

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/api/crm.ts` | Modify | Add `cliente: { select: { responsable_id: true } }` to `TASK_SELECT`; merge into existing `cliente: { select: { nombre: true } }`. |
| `src/app/api/v1/tasks/route.ts` | Modify | Extend `TaskFilters` with `prioridad`/`etiqueta`/`fecha_entrega_desde`/`fecha_entrega_hasta`; add to `parseTaskFilters`; extend `buildTaskWhere` per D6; add a second `count` query without the three new filters for `total`. Map each row through `canEditTask(...)` to attach `puede_editar`. |
| `src/app/api/v1/tasks/export/route.ts` | Modify | Inherits filters via shared `buildTaskFilters` — no filter changes. Add `logAudit({ accion: "exportar" })` at the end. |
| `src/app/api/v1/tasks/[id]/route.ts` | Modify | Map `puede_editar` onto the detail response (already uses `getTaskForWrite`; the row shape needs the flag attached). |
| `src/app/api/v1/tasks/[id]/attachments/[attachmentId]/download/route.ts` | Modify | Replace `getTaskForWrite` with the new read gate. Same return contract. |
| `src/app/api/v1/clients/route.ts` | Modify | Delete the `responsable_id = self` conditional (line 110); attach `puede_editar` per row via `canEditClient`; add second `count` query if filter-aware total is required (clients export already does this — copy the pattern). |
| `src/app/api/v1/clients/[id]/route.ts` | Modify | Delete the read-scope conditional on the GET (line 80); attach `puede_editar` on the GET response. PATCH/DELETE unchanged. |
| `src/app/api/v1/clients/export/route.ts` | Modify | Add `logAudit({ accion: "exportar" })` at the end. Filters already inherited. |
| `src/lib/dashboard.ts` | Modify | Delete `resolveScope` (lines 23-25). |
| `src/app/api/v1/dashboard/pipeline/route.ts` | Modify | `scope = "all"` literal. |
| `src/app/api/v1/dashboard/tasks/route.ts` | Modify | `scope = "all"` literal. |
| `src/app/api/v1/dashboard/clients-activity/route.ts` | Modify | `scope = "all"` literal. |
| `src/app/api/v1/nav/counts/route.ts` | Modify | `scope = "all"` literal. |
| `src/app/api/v1/cron/daily/route.ts` | **Create** | Personal scope (`scope = "own"` for COLABORADOR), mirrors `notifications/route.ts`. |
| `src/lib/api/audit.ts` | Modify | Widen `AuditAccion` to include `"exportar"`. |
| `src/hooks/kanban.ts` | Modify | Delete `applyLocalFilters`/`localFiltersActive`/`LocalTaskFilters`/`EMPTY_LOCAL_TASK_FILTERS` (lines 93-127). Switch `useTasks` to `useInfiniteQuery`. Extend `TaskFilters` with the four server params. `buildTaskQueryString` already passes them through. |
| `src/components/kanban/kanban-board.tsx` | Modify | Render `<TruncationBanner shown={items.length} total={total} />` at top. Render "Cargar más" at the bottom when `hasNextPage`. |
| `src/components/kanban/truncation-banner.tsx` | Create | 10-line component. |
| `src/components/kanban/task-card.tsx` | Modify | Pass `puede_editar` from the `TaskItem` DTO into `SortableTaskCard`; `useSortable({ disabled: !puede_editar })`. |
| `src/components/kanban/task-dialog.tsx` | Modify | Disable edit fields when `!puede_editar`. |
| `src/components/clients/client-sheet.tsx` | Modify | Same pattern as TaskDialog. |
| `src/lib/permissions.read.test.ts` | Create | Read-scope matrix — `buildTaskWhere({}, COLABORADOR)` has no `responsable_id`; `buildClientWhere` idem; `parseTaskFilters({responsable:"x"}, COLABORADOR)` keeps the clause. |
| `e2e/permisos-colaborador.spec.ts` | Create | Login as COLABORADOR → see "Revisar contrato marco" (responsable `gerencia`, seed `prisma/seed.ts:71-73`) → no save/delete buttons → `page.request.patch(...)` → 403. |
| `src/app/api/v1/audit/export.test.ts` | Create | Asserts `auditoria` rows on task + client exports, including `accion: "exportar"`, `cantidad_filas`, and applied filters; asserts `logAudit` failure does not fail the export. |
| `README.md`, `docs/guia-demo.md`, `openapi/paths/{clients,tasks}.ts` | Modify | Update text claiming COLABORADOR sees only their own clients/tasks. |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (TDD first) | 41 spec scenarios, 1:1 to test files named in `task-write-boundaries/spec.md` and `global-task-board/spec.md` | Add `permissions.read.test.ts` (PR 3). All other test files are pre-existing; the design adds no new unit-test files. |
| Unit (audit sentinel) | `documents/route.test.ts` must pass UNMODIFIED on every PR in phase 1 | CI check: `git diff --stat origin/main -- src/app/api/v1/documents/route.test.ts src/app/api/v1/documents/zip/route.test.ts src/app/api/v1/documents/[id]/route.test.ts src/app/api/v1/documents/[id]/download/route.test.ts src/app/api/v1/documents/[id]/versions/route.test.ts src/app/api/v1/documents/[id]/versions/[versionId]/download/route.test.ts` — asserted empty in a PR template checkbox. Plus: a sanity assertion in `permissions.read.test.ts` that `canReadRestrictedDocs` is `=== canManageAny` (D2 invariant). |
| E2E | COLABORADOR sees foreign task + direct PATCH = 403 | `e2e/permisos-colaborador.spec.ts` — new file (the brief explicitly says "design should NOT create a new spec file unless required"; the brief's other section also says "the existing `e2e/permisos-colaborador.spec.ts` plan slot covers PR 3 + PR 4"; **these conflict** — the file does NOT exist, so the design MUST create it). |

## Migration / Rollout

No data migration. Rollout per the proposal:
- Release A (PR 3 + PR 4) — same release. If order changes, hide write controls on `useCurrentUser().rol === "COLABORADOR"` as the fallback.
- Release B (PR 6 + PR 7) — separate release. If PR 7 reverts, restore `limit: 100` cap.
- Owner-of-data sign-off recorded before merge (per plan §Verificación).

## Risks

- **`cron/daily/route.ts` does not exist.** The implementer MUST create it as part of PR 3. The spec scenario "COLABORADOR `/cron/daily` summary lists only their own tasks" depends on this file. Pattern from `notifications/route.ts:90` (line 102 of the new file is the equivalent).
- **`e2e/permisos-colaborador.spec.ts` does not exist.** Conflicting instructions in the brief — "already exists in plan" vs. "design should NOT create a new spec file unless required". Reality: it does not exist. The design MUST create it.
- **`AuditAccion` is a strict union** — `"crear" | "editar" | "eliminar"` (line 19 of `audit.ts`). The brief's claim that it "already supports unknown `accion` strings" is wrong. Design widens the type (D10).
- **Two `count` queries per list request** — negligible at ≤1000 rows; called out per plan §Verificación. Worth measuring in the perf follow-up after PR 3.
- **`loadClientScoped`/`loadTaskScoped`** — listed in the brief's "what does NOT change" but not called by any route in the current tree. Dead code. Either leave or delete in a separate commit; do not conflate with phase 1.
- **`total` field honesty** — the banner reads "Mostrando N de M" where M is the count without `prioridad`/`etiqueta`/`fecha_entrega_*`. The brief explicitly accepts this asymmetry (D7). If a future filter set grows, this contract must be revisited.
- **PR 3 + PR 4 release coupling** — same release or PR 3 behind a flag. Documented in the proposal; reiterated here.

## Open Questions

None blocking. All decisions trace to either the proposal, the spec, or the plan.

---

**Next step**: `sdd-tasks`.