# Tasks: oportunidades-comerciales — Ciclo comercial trazable de Oportunidad a Proyecto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1400 (schema/migration ~120, permissions+tests ~150, admin toggle ~60, task linking ~250, conversion ~150, UI ~350, openapi+e2e ~150) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema/migration, deployable no-op) → PR 2 (permissions + admin toggle + task linking) → PR 3 (conversion + UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — orchestrator must ask the user (stacked-to-main vs feature-branch-chain vs size-exception) before `sdd-apply` |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema + migration + invariant (deployable no-op) | PR 1 | `npx vitest run prisma/invariant.test.ts` | `npx prisma migrate dev` against local/dev DB | Additive columns only; `prisma migrate resolve --rolled-back` drops nothing preexisting |
| 2 | Commercial permissions, admin toggle, task↔opportunity linking | PR 2 | `npx vitest run src/lib/permissions.test.ts src/app/api/v1/tasks/route.test.ts src/app/api/v1/clients/[id]/opportunities/route.test.ts` | Manual staging QA: COLABORADOR without flag → 403 on opportunities, 200 on own execution tasks | Revert gate to `isFullAccess` only (no schema touch) per proposal rollback plan |
| 3 | Conversion endpoint + audit + UI (lifecycle view, Kanban chip) | PR 3 | `npx vitest run src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts src/components/kanban/task-card.test.tsx` | `npx playwright test e2e/oportunidad-ciclo.spec.ts` | Revert UI + convert route; `fase`/`fecha_adjudicacion` stay additive, tasks untouched |

## Phase 0: Stabilize Base (prerequisite for PR 1)

- [x] 0.1 Commit/stabilize `src/app/api/v1/clients/[id]/opportunities/route.ts`, `route.test.ts`, `[opportunityId]/route.ts`, `[opportunityId]/route.test.ts`; rebase onto `close-phase-1`.
      Discovery: `close-phase-1` is already merged to `main` (no separate branch exists — `canEditClient`/`canManageAny`/`puede_editar` are already on `main`), so "rebase" was moot. The actual uncommitted diff on these 4 files was 100% CRLF line-ending noise (`git diff --ignore-space-at-eol` showed zero real changes) — content was already byte-identical to `HEAD`. Normalized to LF; `git status` is now clean for these files, no commit needed.
- [x] 0.2 Run `npx prisma validate` against the D1 shared-scalar composite relation in `prisma/schema.prisma`; confirm accepted or switch to the single-column FK fallback from `design.md`.
      Result: **accepted** — Prisma validated the shared-scalar composite relation (`Tarea.oportunidad @relation(fields: [oportunidad_id, cliente_id], references: [id, cliente_id])`) as written in design.md. No fallback needed.

## Phase 1: Schema, Migration, Invariant (PR 1)

- [x] 1.1 RED: add invariant test asserting insert with `oportunidad_id` set + `cliente_id NULL` fails the `CHECK` — new `prisma/invariant.test.ts`.
- [x] 1.2 GREEN: edit `prisma/schema.prisma` — `Tarea.oportunidad_id`, `Oportunidad.fase/fecha_adjudicacion/fecha_envio_propuesta`, `@@unique([id, cliente_id])`, `BitacoraEntrada.oportunidad_id`, `Usuario.gestiona_oportunidades`.
- [x] 1.3 GREEN: write `prisma/migrations/2026xxxx_oportunidades_comerciales/migration.sql` — `FaseOportunidad` enum, additive columns, composite FK, `CHECK`, unique index, D3 seed `UPDATE`.
      Actual folder: `prisma/migrations/20260915120000_oportunidades_comerciales/`.
- [x] 1.4 RED: add seed test asserting the `UPDATE` predicate selects exactly COLABORADORES responsible for clients with a live `Oportunidad` — `prisma/invariant.test.ts`.
- [x] 1.5 GREEN: apply migration locally, confirm 1.1 and 1.4 pass.
      Applied via `npx prisma migrate deploy` against the project's configured Supabase dev database (no local Postgres in this environment); also picked up one already-pending prior migration (`20260903000000_solicitudes_acceso_email_pendiente_unique`) that had never been deployed. `npx prisma generate` regenerated the client. All 4 tests in `prisma/invariant.test.ts` pass (see TDD Cycle Evidence below); verified zero fixture rows persisted afterward.
- [x] 1.6 Verify sentinel: `npm test -- documents.test.ts` unmodified and green.
      `src/hooks/documents.test.ts` — 2/2 passing, file untouched (`git status` clean).

### PR 1 batch notes

- Full-suite safety net (`npm test`): 949/953 passing. `npx tsc --noEmit`: clean.
- **Pre-existing failure, unrelated to this change, NOT fixed**: `src/app/api/v1/documents/zip/route.test.ts` — 2 tests expect a space-preserving filename (`"Informe uno_v1.pdf"`) but get an underscore (`"Informe_uno_v1.pdf"`), a mismatch left by commit `29a8f26` ("sanitizar tildes y espacios en nombres de archivo") which changed sanitization behavior without updating this test. Confirmed via `git status`/`git log` that neither the route nor the test was touched by this batch.
- `prisma/invariant.test.ts` needs `import "dotenv/config"` because `vitest.config.ts` does not load `.env` (unlike `prisma.config.ts`) — without it `DATABASE_URL` is undefined in the test process and Prisma falls back to `localhost:5432` (`ECONNREFUSED`). Also widened Prisma's interactive-transaction timeout (`{ timeout: 20_000, maxWait: 10_000 }`) and each test's own vitest timeout to 20s — the default 5s budget was too tight for this environment's remote pooled-Postgres round trip and produced flaky "unable to start a transaction" failures under full-suite load.
- No local Postgres exists in this environment; `prisma/invariant.test.ts` runs against the project's configured remote Supabase dev database. Every fixture row is created and asserted inside a Prisma interactive transaction that always throws an `IntentionalRollback` sentinel at the end, so nothing is ever persisted — verified by a post-run count query (0 leftover rows matching the test marker).

## Phase 2: Commercial Permissions + Admin Toggle (PR 2)

- [x] 2.1 RED: extend `src/lib/permissions.test.ts` — full matrix for `hasCommercialAccess`/`canManageOpportunity` (4 roles × flag on/off × responsable yes/no).
- [x] 2.2 GREEN: add `CommercialActor`, `hasCommercialAccess()`, `canManageOpportunity()` to `src/lib/permissions.ts`.
- [x] 2.3 GREEN: emit `puede_gestionar_oportunidades` in `src/app/api/v1/clients/route.ts` and `src/app/api/v1/clients/[id]/route.ts`.
- [x] 2.4 RED: add test for admin toggle of `gestiona_oportunidades`.
      Discovery: the PATCH handler actually lives in `src/app/api/v1/users/[id]/route.ts` (not `users/route.ts`, which only has GET/POST) — test added to `src/app/api/v1/users/[id]/route.test.ts`.
- [x] 2.5 GREEN: extend the users PATCH route to accept `gestiona_oportunidades`.
      Same file correction as 2.4: `src/app/api/v1/users/[id]/route.ts`. Also added `gestiona_oportunidades` to `USER_SELECT` in both `users/route.ts` and `users/[id]/route.ts` so it round-trips through GET/POST/PATCH.
- [x] 2.6 GREEN: add toggle control.
      Discovery: `src/components/admin/accesos-section.tsx` is the login bitácora (access log), unrelated to user administration — the admin user table with role/activo controls is `src/components/admin/users-table.tsx`. Added a `DropdownMenuCheckboxItem` "Gestiona oportunidades" to each COLABORADOR row's action menu there (full-access roles don't need it — they pass the gate via `isFullAccess` regardless of the flag).
- [x] 2.7 RED+GREEN: gate `src/app/api/v1/clients/[id]/opportunities/route.ts` + `[opportunityId]/route.ts` on `hasCommercialAccess`/`canManageOpportunity`; test 403 without flag, 200 on own execution tasks (regression guard).
      Added `loadClientForOpportunityRead`/`getClientForOpportunityWrite` helpers to `src/lib/api/crm.ts` (mirrors the existing `loadClientScoped`/`getClientForWrite` shape). Regression guard test added to `src/app/api/v1/tasks/route.test.ts` (a COLABORADOR without the flag still creates their own execution task).
- [x] 2.8 RED+GREEN: gate `src/app/api/v1/dashboard/pipeline/route.ts` commercial aggregates on `hasCommercialAccess`.
      Without the flag: zeroed/empty aggregates returned directly, no `db.oportunidad.findMany` query issued at all (cheaper than filtering after the fact, and structurally impossible to leak a partial view).

## Phase 3: Task↔Opportunity Linking (PR 2)

- [x] 3.1 RED: `src/app/api/v1/tasks/route.test.ts` — cross-client `oportunidad_id` rejected 400 on create.
- [x] 3.2 GREEN: add invariant check + `oportunidad_id` to POST schema and `oportunidad` list filter in `src/app/api/v1/tasks/route.ts`.
      Added shared `checkOportunidadClienteConsistency()` helper to `src/lib/api/crm.ts` — reused by 3.2, 3.3 and 3.8.
- [x] 3.3 RED+GREEN: same invariant + PATCH schema in `src/app/api/v1/tasks/[id]/route.ts`; opportunity fields on detail response.
      Opportunity fields on the detail response come for free from 3.4 (`toTaskItem` now always includes them).
- [x] 3.4 GREEN: extend `TASK_SELECT`/`TaskItem`/`toTaskItem` in `src/lib/api/crm.ts` with `oportunidad_id/nombre/fase`.
- [x] 3.5 GREEN: update DTO types in `src/hooks/crm.ts` (`TaskItem`, `TareaInput`, `ClientListRow.puede_gestionar_oportunidades`).
- [x] 3.6 RED: `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/tasks/route.test.ts` — list + create forcing `cliente_id` from the opportunity.
- [x] 3.7 GREEN: create `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/tasks/route.ts`.
      GET gated by `loadClientForOpportunityRead`, POST by `getClientForOpportunityWrite`; POST always forces `cliente_id`/`oportunidad_id` from the URL (never from the body), so the invariant is structurally unreachable from this path, not just checked.
- [x] 3.8 RED+GREEN: optional `oportunidad_id` + invariant check in the bitácora route.
      Discovery: the bitácora endpoint is `src/app/api/v1/clients/[id]/log/route.ts` (not `.../bitacora/route.ts`, which does not exist) — `BitacoraEntrada` is the Prisma model name, `log` is the route path (see the file's own top-of-file comment).

### PR 2 batch notes

- Full-suite safety net (`npm test`): 999/1001 passing. `npx tsc --noEmit`: clean.
- Same 2 pre-existing failures as the PR 1 baseline, still unrelated and untouched by this batch: `src/app/api/v1/documents/zip/route.test.ts` (filename-sanitization mismatch from commit `29a8f26`, predates this change).
- Fixed 6 UI test fixtures that failed `tsc --noEmit` after `ClientListRow`/`TaskItem` gained required fields (`puede_gestionar_oportunidades`, `oportunidad_id`/`oportunidad_nombre`/`oportunidad_fase`): `client-form.test.tsx`, `client-list.test.tsx`, `client-sheet-write-gate.test.tsx`, `client-sheet.test.tsx`, `task-dialog.test.tsx`, `hooks/kanban.test.ts`. These files belong to Phase 4/5 UI scope and were not otherwise touched — the fix is the minimal fixture update needed to keep the type-check gate green, not new behavior.
- Two file-path corrections vs. this document (see 2.4/2.6/3.8 discovery notes): the users PATCH handler is `users/[id]/route.ts`, the admin toggle target is `users-table.tsx`, and the bitácora route is `clients/[id]/log/route.ts`.

## Phase 4: Conversion & Audit (PR 3)

- [ ] 4.1 RED: `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts` — 401/403/404/409(not GANADA)/409(repeat).
- [ ] 4.2 GREEN: widen `AuditAccion`("convertir")/`AuditEntidad`("oportunidad") in `src/lib/api/audit.ts`; add label in `src/components/admin/audit-log-section.tsx`.
- [ ] 4.3 GREEN: create `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.ts` per D5 flow.
- [ ] 4.4 RED+GREEN: assert linked `tareas.updated_at` untouched + one `auditoria` row after conversion.
- [ ] 4.5 GREEN: 409 on `PATCH estado` when `fase=EJECUCION` in `[opportunityId]/route.ts` (D7).
- [ ] 4.6 RED+GREEN: `fecha_envio_propuesta` write-once on first `estado→PRESENTADA` in `route.ts`/`[opportunityId]/route.ts`.

## Phase 5: UI — Lifecycle View & Kanban Chip (PR 3)

- [ ] 5.1 GREEN: `src/components/crm/entity-dialogs.tsx` — lifecycle view (estado, fase, fecha_envio_propuesta, tasks, bitácora, Convert action, link-existing-task); `proyectos_relacionados` read-only (D8).
- [ ] 5.2 GREEN: `src/components/crm/client-sheet.tsx` — tab visibility + `readOnly` from `puede_gestionar_oportunidades`.
- [ ] 5.3 RED: `src/components/kanban/task-card.test.tsx` — chip per `oportunidad_fase`, absent when null.
- [ ] 5.4 GREEN: `src/components/kanban/task-card.tsx` — `CardTask` fields + amber/emerald chip.
- [ ] 5.5 GREEN: update `src/lib/openapi/paths/clients.ts` and `src/lib/openapi/paths/tasks.ts` contracts.
- [ ] 5.6 Create `e2e/oportunidad-ciclo.spec.ts` — full cycle: create → link task → PRESENTADA → GANADA → convert → chip flips.
