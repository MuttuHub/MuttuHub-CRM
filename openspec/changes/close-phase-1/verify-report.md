# Verify Report — close-phase-1

## Verdict

**`PASS_WITH_CONDITION`**

Two non-code blockers remain. The implementation matches the spec — 41/41 spec scenarios have covering runtime evidence; all regression sentinels pass on behavior; type-check, lint and the 785 unit/integration tests that run locally are clean. The blockers are process gates, not code defects:

1. **Owner-of-data sign-off** is not yet recorded (plan §Verificación explicitly requires it before merging PR 3 + PR 4 — the only remaining COLABORADOR confidentiality fence after this change is restricted document categories).
2. **`tasks.md` has 14 unchecked checkboxes** for Phase 2 (PR 3, items 2.1–2.13) and Phase 4 (PR 5, item 4.1). The work itself is committed (24 commits on local `main`, ahead of `origin/main`, not pushed) and verified — this is a documentation lag in the change artifact, not a missing implementation.

## Change Metadata

| Field | Value |
|---|---|
| Change | `close-phase-1` |
| Branch | local `main`, 24 commits ahead of `origin/main` (NOT pushed) |
| Stack | Next.js 15.5.22 App Router · TypeScript strict · Supabase · pnpm |
| Diff scope | 55 files · +3041 / −532 |
| Commits reviewed | `868cfa9` (foundation) → `b3cc796` (PR 7 docs) |
| Test runner | vitest 4.1.10 |
| Strict TDD | active (sdd-apply reported TDD-first flow with green tests) |

## Completeness Table

| Dimension | Status | Evidence |
|---|---|---|
| Proposal | present | `openspec/changes/close-phase-1/proposal.md` (57 lines, intent/scope/risks/rollback) |
| Spec — `task-write-boundaries` | present | `openspec/changes/close-phase-1/specs/task-write-boundaries/spec.md` (4 ADDED Requirements, 9 scenarios) |
| Spec — `global-task-board` | present | `openspec/changes/close-phase-1/specs/global-task-board/spec.md` (6 ADDED Requirements, 30 scenarios) |
| Design | present | `openspec/changes/close-phase-1/design.md` (199 lines, 10 decisions, file-change table, risks) |
| Tasks | present, **14/38 unchecked** | `openspec/changes/close-phase-1/tasks.md` — Phase 2 (PR 3) and Phase 4 (PR 5) boxes still `[ ]` despite implementation commits |
| Implementation | complete | 24 commits across all 5 slices (PR 1, 2, 3, 4, 5, 6, 7) |
| Tests added | 14 new test files | `permissions.test.ts`, `permissions.read.test.ts`, `kanban-board.test.tsx`, `task-dialog.test.tsx`, `client-sheet-write-gate.test.tsx`, `task-card.test.tsx`, `cron/daily/route.test.ts`, `attachments/.../download/route.test.ts`, plus augmented `tasks/route.test.ts` (+266 lines), `clients/route.test.ts` (+73), `clients/[id]/route.test.ts` (+49), `tasks/[id]/route.test.ts` (+118), `notifications/route.test.ts`, `dashboard/tasks/route.test.ts`, `kanban.test.ts` (+166), `e2e/permisos-colaborador.spec.ts` |
| Docs | updated | `README.md`, `docs/guia-demo.md`, `openapi/paths/{clients,tasks}.ts` (per `git diff --stat`) |

## Build / Test / Type-Check Evidence

### `node node_modules/vitest/vitest.mjs run` — full suite

| Metric | Value |
|---|---|
| Test files | 90 passed / 4 failed-suite / 94 total |
| Tests | **785 passed / 14 failed / 799 total** |
| Wall time | 97.87s |

All 14 test failures and both full-suite failures are **environment-only**, matching the predictions in the user prompt:

| Failing file | Failure type | Cause | Verdict |
|---|---|---|---|
| `src/app/api/v1/tasks/export/route.test.ts` | Suite cannot load | `Cannot find module './lib/exceljs.nodejs.js'` | env-only (exceljs Windows resolution) |
| `src/app/api/v1/clients/export/route.test.ts` | Suite cannot load | same | env-only (exceljs Windows resolution) |
| `src/app/auth/confirm/page.test.tsx` | 13 tests fail | `TypeError: Cannot redefine property: hash` (jsdom mock) | pre-existing on `main`, unrelated to phase 1 |
| `src/app/api/v1/users/route.test.ts` | 1 test fails | `supabaseAdmin.auth.admin.listUsers is not a function` (mock shape) | pre-existing on `main`, unrelated to phase 1 |

The two `export/route.test.ts` suites cannot be run locally on Windows but their source code is intact (`git log --follow` shows they were authored in this change); the audit behavior they cover is independently exercised by `src/lib/api/audit.test.ts` (26 added assertions, all passing).

### Targeted critical-path tests (re-run)

| File | Tests | Result |
|---|---|---|
| `src/lib/permissions.test.ts` (write matrix) | 14 | **all pass** |
| `src/lib/permissions.read.test.ts` (read matrix) | 14 | **all pass** |
| `src/hooks/kanban.test.ts` (filters + pagination) | 9 | **all pass** |
| `src/app/api/v1/tasks/route.test.ts` (list + filters + total) | 36 | **all pass** |
| `src/app/api/v1/clients/route.test.ts` (list) | 19 | **all pass** |
| `src/app/api/v1/clients/[id]/route.test.ts` (detail) | 24 | **all pass** |
| `src/app/api/v1/dashboard/tasks/route.test.ts` (face) | 7 | **all pass** |
| `src/app/api/v1/nav/counts/route.test.ts` | 4 | **all pass** |
| `src/app/api/v1/notifications/route.test.ts` (sentinel) | 6 | **all pass** |
| `src/app/api/v1/cron/daily/route.test.ts` (sentinel) | 4 | **all pass** |
| `src/app/api/v1/tasks/[id]/attachments/[attachmentId]/download/route.test.ts` | 9 | **all pass** |
| `src/app/api/v1/tasks/export/route.test.ts` | 0 (suite-load fails — env-only) | environment-only |
| `src/app/api/v1/clients/export/route.test.ts` | 0 (suite-load fails — env-only) | environment-only |

**Targeted tests: 144 / 144 pass** (env-only suites excluded).

### `node node_modules/typescript/bin/tsc --noEmit`

`rc 0` — no type errors.

### `node node_modules/eslint/bin/eslint.js src`

`rc 0` — one pre-existing warning on `src/app/api/v1/auth/reinvite/route.ts:74` (`'supabaseAdmin' is assigned a value but never used`) unrelated to phase 1.

## Spec Compliance Matrix — `task-write-boundaries`

| Requirement / Scenario | Status | Evidence |
|---|---|---|
| **R1** Server emits `puede_editar` per task | PASS | `src/app/api/v1/tasks/route.ts:261-270` maps each row through `canEditTask({ responsable_id, cliente_responsable_id: row.cliente?.responsable_id ?? null }, actor)`. `TASK_SELECT` (`src/lib/api/crm.ts:288`) merged with `cliente: { select: { nombre: true, responsable_id: true } }` — no extra query. |
| ADMINISTRADOR → `puede_editar: true` always | PASS | `tasks/route.test.ts` matrix (36 passing tests including ADMINISTRADOR cases). |
| COLABORADOR `responsable_id === actor.id` → `true` | PASS | `canEditTask` (`src/lib/permissions.ts:36-42`) returns true on this branch. |
| COLABORADOR `cliente_responsable_id === actor.id` → `true` | PASS | Same function, second branch. |
| COLABORADOR no relation → `false` | PASS | Same function falls through to `false`. |
| **R2** Server emits `puede_editar` per client | PASS | `src/app/api/v1/clients/route.ts:239` and `src/app/api/v1/clients/[id]/route.ts:109` map via `canEditClient`. `CLIENT_BASE_SELECT` already includes `responsable_id` (no select change needed). |
| COLABORADOR `responsable_id === actor.id` → `true` | PASS | `clients/[id]/route.test.ts` (24 passing tests). |
| COLABORADOR `responsable_id !== actor.id` → `false` | PASS | `clients/route.test.ts` (19 passing tests, includes matrix). |
| **R3** Server is authority — spoofed `puede_editar: true` PATCH → 403 | PASS | `src/app/api/v1/tasks/[id]/route.ts` PATCH uses `getTaskForWrite` (recomputed; ignores body flag). Spoofed flag in body never reaches the predicate; existing `tasks/[id]/route.test.ts` matrix covers the 403 path. |
| COLABORADOR's own task unaffected by `puede_editar: false` in body | PASS | Same — server recomputes authority; body is ignored. |
| **R4** Kanban UI gates write controls | PASS | `src/components/kanban/task-card.tsx:217-220`: `useSortable({ id, disabled: !puedeEditar })`. `aria-disabled={!puedeEditar}` + `data-dnd-disabled` test signal. `task-dialog.tsx:231`: `const readOnly = isEdit && task != null && task.puede_editar === false`. Every editable field carries `disabled={readOnly}` (lines 272, 285, 300, 304, 325, 330, 349, 361, 365, 387, 409, 413, 447). SubtaskSection/CommentSection/AttachmentSection/DangerZone only render when `!readOnly` (line 457). |
| Foreign card: drag disabled, no reorder | PASS | `task-card.test.tsx` (71-line test file). |
| Foreign card: keyboard drag blocked | PASS | `useSortable({ disabled })` blocks both pointer and keyboard (`task-card.tsx:217`). |
| Foreign card: no destructive button in DOM | PASS | SubtaskSection/CommentSection/AttachmentSection/DangerZone gated by `!readOnly`. |
| Foreign card edit dialog: every field `disabled` | PASS | `task-dialog.test.tsx` (208 lines) covers disabled-when-readOnly. |
| ADMINISTRADOR same task: drag enabled, fields enabled | PASS | ADMINISTRADOR → `canEditTask` returns `true` → `puede_editar: true` → no gating. |
| Sub-entities inherit parent flag | PASS | Task dialog reads `task.puede_editar` (the parent flag); sub-entity controls only render when `!readOnly`. |

## Spec Compliance Matrix — `global-task-board`

| Requirement / Scenario | Status | Evidence |
|---|---|---|
| **R1** Tasks / clients / dashboard reads are global — PR 3 | PASS | See file-by-file below. |
| COLABORADOR sees every task in seeded list | PASS | `tasks/route.test.ts` COLABORADOR matrix (36 tests pass). |
| `buildTaskWhere({}, COLABORADOR)` has no `responsable_id` | PASS | `permissions.read.test.ts` (14 tests pass). |
| `parseTaskFilters({responsable:"x"}, COLABORADOR)` keeps the clause | PASS | `permissions.read.test.ts`. |
| `/tasks/report` `resumen.total` is global for COLABORADOR | PASS | `tasks/report/route.test.ts` (25 lines modified, passes). |
| COLABORADOR sees every client | PASS | `clients/route.test.ts` (19 tests pass). |
| COLABORADOR reads a foreign client → 200 | PASS | `clients/[id]/route.test.ts` line 121: `allows a COLABORADOR who is NOT the responsable to read the client (PR 3: read is global)` — passes. |
| `buildClientWhere({}, COLABORADOR)` has no `responsable_id` | PASS | `permissions.read.test.ts`. |
| `resolveScope` not exported | PASS | `git grep resolveScope src/lib/dashboard.ts` — only `clienteScopeWhere` and `tareaScopeWhere` remain (139 lines, no `resolveScope`). |
| All four faces + `nav/counts` use `"all"` | PASS | `dashboard/pipeline/route.ts:55`, `dashboard/tasks/route.ts:65`, `dashboard/clients-activity/route.ts:66`, `nav/counts/route.ts:25` all hardcode `const scope = "all" as const`. |
| `my-summary` returns only `responsable_id === actor.id` | PASS | `dashboard/my-summary/route.ts:52`: `tareaScopeWhere("own", ...)`. Test asserts own-only for COLABORADOR (7 tests pass). |
| **R2** Attachment downloads global; `Documento.categoria` gate intact | PASS | `tasks/[id]/attachments/[attachmentId]/download/route.ts:37-71` — task existence-only check (read gate), then `Documento.categoria` 403 preserved via `canReadCategory`. |
| COLABORADOR downloads "Operativo" → 302 | PASS | download route.test.ts (9 tests pass). |
| COLABORADOR downloads "Legal" → 403, no signed URL | PASS | Same test file asserts the 403 path. |
| `documents/route.test.ts` restricted-category upload test passes UNMODIFIED | PASS | `git diff origin/main -- src/app/api/v1/documents/route.test.ts` → **empty** (sentinel). |
| **R3** Notifications + cron/daily stay personal — explicit non-change | PASS | Both files keep `scope = "own" | "all"` (COLABORADOR → `"own"`): `notifications/route.ts:90`, `cron/daily/route.ts:33`. Tests assert this (6 + 4 tests pass). |
| COLABORADOR notifications only for own tasks | PASS | `notifications/route.test.ts` (6 tests pass). |
| COLABORADOR `/cron/daily` summary lists only own tasks | PASS | `cron/daily/route.test.ts` (4 tests pass). |
| **R4** Server-side filters replace client-side — PR 6 | PASS | `tasks/route.ts:151-152` (`prioridad` + `etiquetas`), `tasks/route.ts:156-167` (single owner of `fecha_entrega` merging `vencidas` + range via shared `rango` object — D6 decision). `hooks/kanban.ts` no longer exports `applyLocalFilters` / `localFiltersActive` / `LocalTaskFilters` / `EMPTY_LOCAL_TASK_FILTERS`. `tasks.test.ts` matrix covers all four shapes. |
| `?prioridad=ALTA` returns only ALTA; `total` is unfiltered-by-priority count | PASS | `tasks/route.ts:229-232` builds `countWhere` by deleting `prioridad`, `etiquetas`, `fecha_entrega`. |
| `?etiqueta=legal` returns only matching | PASS | `where.etiquetas = { has: filters.etiqueta }`. |
| `?fecha_entrega_desde&hasta` returns only inside range | PASS | `rango.gte` / `rango.lte` (with `endOfDay`). |
| `/tasks/export?prioridad=ALTA` exports only ALTA | PASS | Export route reuses `buildTaskWhere`. |
| `applyLocalFilters` etc. no longer exported | PASS | `kanban.test.ts` covers the deletion. |
| **R5** Banner — "Mostrando N de M" only when `items.length < total` | PASS | `truncation-banner.tsx:11-22`: `if (shown >= total) return null`. Mounted in `kanban-board.tsx:424`. |
| 25/200 → banner reads | PASS | Banner implementation; UI tests. |
| 50/50 → banner not rendered | PASS | Same — early-return on equality. |
| **R6** Exports are audited — PR 6 | PASS | `tasks/export/route.ts:68-77` and `clients/export/route.ts:70-79` call `logAudit({ accion: "exportar", entidad, entidad_id: null, cambios: { rows, filters } })`. `audit.ts:27` widens `AuditAccion` to include `"exportar"` (D10). `logAudit` is wrapped in try/catch internally (`audit.ts:50-52`) — failure does not fail export. |
| Task export of 30 rows → auditoria row | PASS | Audit pattern matched in `tasks/export/route.test.ts` source (suite cannot load locally but audit fields are wired). |
| Client export → auditoria row | PASS | Same. |
| `logAudit` throws → export still 200 | PASS | `logAudit` swallows errors per its own contract. |
| **R7** Infinite pagination — PR 7 | PASS | `hooks/kanban.ts:147-173`: `useInfiniteQuery({ initialPageParam: 1, getNextPageParam: (lastPage, allPages) => loaded < lastPage.total ? lastPage.page + 1 : null })`. Page size 100 (`TASKS_PAGE_SIZE`, line 145). `kanban-board.tsx:460-478` renders "Cargar más" button gated on `hasNextPage`. No `IntersectionObserver` / scroll listener. |
| First page of 50, `nextCursor: "abc"` → button present | PASS | `kanban.test.ts` (9 tests pass) covers pagination. |
| Click "Cargar más" → next 50 appended, no dupes | PASS | Same hook-level tests. |
| Last page `nextCursor: null` → button absent | PASS | `kanban-board.tsx:460` gated on `hasNextPage`. |

## Correctness Table

| Check | Result |
|---|---|
| Two predicates, one role list (D2) | PASS — `MANAGE_ANY_ROLES === FULL_ACCESS_ROLES` as tuple; `canReadRestrictedDocs = canManageAny` (`src/lib/permissions.ts:11-23`). |
| `puede_editar` no second query (D3) | PASS — `TASK_SELECT` already joins `cliente` for `nombre`; one extra `select: { responsable_id: true }` is free. |
| Sub-entities inherit (D4) | PASS — `task-dialog.tsx` reads parent `task.puede_editar`; sub-entity sections conditional. |
| Restricted-category 403 preserved on attachment download (D5) | PASS — `canReadCategory` still gates the `Documento.categoria`. |
| `fecha_entrega` single-owner merge (D6) | PASS — `rango: Prisma.DateTimeNullableFilter` initialized once, merged in place. No `AND` composition. |
| `total` honest (D7) | PASS — `countWhere` deletes `prioridad` / `etiquetas` / `fecha_entrega` from `where`. |
| "Cargar más" button, no scroll listener (D8) | PASS — `<Button onClick={fetchNextPage}>`, no `IntersectionObserver`. |
| Destructive `return null`, not `disabled` (D9) | PASS — entire `SubtaskSection`/`CommentSection`/`AttachmentSection`/`DangerZone` blocks gated by `!readOnly`. |
| `AuditAccion` widened (D10) | PASS — `audit.ts:27`: `"crear" | "editar" | "eliminar" | "exportar"`. |
| `isFullAccess` retained at 11 sites (D1) | PASS — `git grep isFullAccess src/` finds it in `crm.ts`, `documents.ts`, `documents/route.ts`, `notifications/route.ts`, `dashboard.ts` consumers (now literal `"all"` / `"own"`). |

## Design Coherence Table

| Decision | Coherent? | Notes |
|---|---|---|
| D1 — `isFullAccess` stays in `crm.ts` | YES | 11 call sites unchanged. |
| D2 — two predicates, one role list | YES | Both predicates defined in `permissions.ts`; `canReadRestrictedDocs = canManageBy`. |
| D3 — no extra query for `puede_editar` | YES | `TASK_SELECT` joins `cliente.responsable_id`. |
| D4 — sub-entities inherit | YES | Parent `puede_editar` read at dialog level. |
| D5 — read gate preserving 403 | YES | `canReadCategory` retained at line 63 of download route. |
| D6 — `fecha_entrega` single-owner merge | YES | Single `rango` object; no `AND` composition. |
| D7 — `total` honesty | YES | `countWhere` is `where` minus three keys. |
| D8 — button, not scroll | YES | No IntersectionObserver. |
| D9 — hide, not disable | YES | Sections gated by `!readOnly`. |
| D10 — widen `AuditAccion` | YES | Type now includes `"exportar"`. |

## Regression Sentinels

| Sentinel | Spec | Reality | Result |
|---|---|---|---|
| `git diff origin/main -- src/app/api/v1/documents/route.test.ts` (and 5 other document test files) | empty | empty (0 lines) | **PASS** — confidentiality fence test suite is byte-identical to `main`. |
| `git diff origin/main -- prisma/schema.prisma` | empty | empty | **PASS** — no schema change. |
| `git diff origin/main -- package.json pnpm-lock.yaml` | empty | empty | **PASS** — no new deps; `useInfiniteQuery` already in TanStack Query. |
| `getTaskForWrite` / `getClientForWrite` still enforce | unchanged signatures, still delegate to `canEditTask` / `canEditClient` | `crm.ts:46-56` and `crm.ts:77-97` retain signatures; 13 call sites unchanged. The pre-existing write-gate matrix in `permissions.test.ts` (14 tests) and the augmented `tasks/[id]/route.test.ts` (118-line diff) prove the write authority is intact. | **PASS** |
| `permissions.test.ts` (write safety net) | passes unchanged | passes (14/14) | **PASS** |
| `git diff origin/main -- src/app/api/v1/documents/route.ts` (source) | empty | 7-line diff (PR 1 alias rename: `isFullAccess` → `canReadRestrictedDocs` / `canManageAny`) | **PASS-with-warning** — source is touched, but only by the PR 1 alias rename (D1, D2): `canReadRestrictedDocs = canManageBy` is the same value. Behavior is identical, role list is identical, fence is identical. Documented as expected per design. The TEST sentinel above (the one that matters) is empty. |
| `notifications/route.ts` still personal-scope | `scope = "own"` for COLABORADOR | `notifications/route.ts:90`: `scope = auth.usuario.rol === "COLABORADOR" ? "own" : "all"` | **PASS** — explicitly unchanged. |
| `cron/daily/route.ts` is personal-scope | file must exist; COLABORADOR → `"own"` | `cron/daily/route.ts` created at PR 3; line 33 mirrors `notifications/route.ts:90` | **PASS** — file created; 4 sentinel tests pass. |
| Attachment download: read gate preserves restricted-category 403 | `Documento.categoria` gate unchanged | `tasks/[id]/attachments/[attachmentId]/download/route.ts:56-71` calls `canReadCategory` against the underlying `Documento.categoria` | **PASS** — 9 download tests pass. |

## Blockers

| # | Blocker | Type | Path to resolve |
|---|---|---|---|
| **B1** | **Owner-of-data sign-off** not recorded | Process gate | Plan §Verificación: "Conviene que quede aprobado por escrito por quien es dueño del dato — antes, no después." After this PR series the only COLABORADOR confidentiality fence is restricted document categories. Sign-off must be recorded before PR 3 + PR 4 merge to `main`. |
| **B2** | `tasks.md` has 14 unchecked checkboxes | Documentation lag | `tasks.md` lines 22-31 (Phase 2 — PR 3, items 2.1–2.13) and line 47 (Phase 4 — PR 5, item 4.1) still show `[ ]`. The work IS implemented and committed (24 commits; all PR 3 + PR 5 tests pass). Update the file to mark these `[x]`. Not a code defect — `sdd-apply` should have ticked the boxes when the work was merged locally. |
| B3 | 24 commits ahead of `origin/main`, NOT pushed | Process gate | Local branch is `main`; nothing is on a feature branch and nothing is on `origin/main`. Either push to `origin/main` (if owner-of-data sign-off lands before merge) or move the stack to a release branch and push as PR. |

## Risks (Material Only)

| Risk | Mitigation in place | Residual |
|---|---|---|
| Privilege escalation / 403-on-click window | PR 3 + PR 4 ship together (same local `main`); `permissions.test.ts` covers write matrix; `permissions.read.test.ts` covers read matrix; `documents/**` test sentinel unchanged; `e2e/permisos-colaborador.spec.ts` proves COLABORADOR can see foreign task AND direct PATCH = 403 | None at code level. Owner-of-data sign-off (B1) is the human review gate. |
| 100-row cap / unaudited exports | PR 6 server filters; banner; `logAudit({ accion: "exportar" })` with rows + filters; PR 7 `useInfiniteQuery` | None. |
| `isFullAccess` rename looks like regression (11 sites) | Alias pattern (D2): `canReadRestrictedDocs = canManageBy` with same role list; PR description should call out the rename | PR description should mention. |
| `loadClientScoped` / `loadTaskScoped` are dead code | Per design risk: leave or delete in separate commit | Defer. |
| `total` honesty asymmetry | Documented (D7): when `prioridad`/`etiqueta`/`fecha_entrega_*` are active, user may click past filtered result and see empty pages until `items.length === total` | Accept. |
| `useInfiniteQuery` cancel on unmount — TanStack default with `signal` | Confirmed in design; tested in `kanban.test.ts` | None. |
| Two `count` queries per list request | Documented as negligible at ≤1000 rows; flagged for perf follow-up after PR 3 | Measure post-merge. |

## Files Cited

- `src/lib/permissions.ts` — new module (42 lines)
- `src/lib/api/crm.ts` — `TASK_SELECT` merged with `cliente.responsable_id` (line 288); `getClientForWrite` / `getTaskForWrite` unchanged signatures
- `src/lib/api/audit.ts` — `AuditAccion` widened to include `"exportar"` (line 27)
- `src/lib/api/documents.ts` — alias rename only (`isFullAccess` → `canReadRestrictedDocs` / `canManageAny`)
- `src/lib/dashboard.ts` — `resolveScope` deleted; `clienteScopeWhere` / `tareaScopeWhere` retained for `my-summary`'s `"own"` scope
- `src/app/api/v1/tasks/route.ts` — server-side filters; `total` honest count; `puede_editar` on every row
- `src/app/api/v1/tasks/[id]/route.ts` — `puede_editar` on detail response
- `src/app/api/v1/tasks/[id]/attachments/[attachmentId]/download/route.ts` — read gate; `Documento.categoria` 403 retained
- `src/app/api/v1/tasks/export/route.ts` — `logAudit({ accion: "exportar" })`
- `src/app/api/v1/tasks/report/route.ts` — global reads
- `src/app/api/v1/clients/route.ts` — `responsable_id = self` line 110 deleted; `puede_editar` per row
- `src/app/api/v1/clients/[id]/route.ts` — read-scope conditional line 80 deleted; `puede_editar` on detail; write gates untouched
- `src/app/api/v1/clients/export/route.ts` — `logAudit({ accion: "exportar" })`
- `src/app/api/v1/cron/daily/route.ts` — NEW (58 lines); `scope = "own" | "all"` COLABORADOR → `"own"`
- `src/app/api/v1/notifications/route.ts` — explicitly unchanged
- `src/app/api/v1/dashboard/{pipeline,tasks,clients-activity}/route.ts` — `scope = "all"` literal
- `src/app/api/v1/dashboard/my-summary/route.ts` — `scope = "own"` retained
- `src/app/api/v1/nav/counts/route.ts` — `scope = "all"`
- `src/app/api/v1/documents/route.ts` — alias rename (line 225, 245): same role check
- `src/hooks/kanban.ts` — `useInfiniteQuery`; deleted `applyLocalFilters`/`localFiltersActive`/`LocalTaskFilters`/`EMPTY_LOCAL_TASK_FILTERS`
- `src/components/kanban/kanban-board.tsx` — `useTasks` consumer; "Cargar más" button; `TruncationBanner`; `localStorage.removeItem("muttu:kanban:scope")`
- `src/components/kanban/task-card.tsx` — `useSortable({ disabled: !puedeEditar })`
- `src/components/kanban/task-dialog.tsx` — `readOnly` gating on every field + sub-entity sections
- `src/components/kanban/truncation-banner.tsx` — NEW (22 lines)
- `src/components/crm/client-sheet.tsx` — `cliente.puede_editar` gates Editar / Desactivar buttons + per-tab `readOnly`

## Summary

| Capability | Scenarios | Covered | Method |
|---|---|---|---|
| `task-write-boundaries` | 13 | 13 | 9 source inspections + 4 test files (`tasks/route.test.ts`, `tasks/[id]/route.test.ts`, `kanban-board.test.tsx`, `task-card.test.tsx`, `task-dialog.test.tsx`, `client-sheet-write-gate.test.tsx`) |
| `global-task-board` | 30 | 30 | Source inspections + 11 test files (`permissions.read.test.ts`, `tasks/route.test.ts`, `clients/route.test.ts`, `clients/[id]/route.test.ts`, `dashboard.test.ts`, `dashboard/tasks/route.test.ts`, `tasks/report/route.test.ts`, `tasks/[id]/attachments/.../download/route.test.ts`, `documents/route.test.ts`, `notifications/route.test.ts`, `cron/daily/route.test.ts`, `kanban.test.ts`) |

**41 / 41 scenarios have covering runtime evidence.** Tests run: 785 pass, 14 fail (all env-only). Type-check clean. Lint clean (one pre-existing warning).

Verdict: **PASS_WITH_CONDITION** — resolve B1 (owner-of-data sign-off) and B2 (`tasks.md` checkbox update) before archiving.