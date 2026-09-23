# Verify Report: tablero-seguimiento-social

**Date**: 2026-09-22
**Verifier**: sdd-verify (first pass — no prior apply-progress or verify-report artifact existed)
**Store**: openspec, repo-local at `openspec/changes/tablero-seguimiento-social/`

## Scope

Change implements RF-01..RF-07 + módulo KPI 3.4 + RNF-01..03 across 6 capabilities: `project-tracking`, `project-schedule`, `project-budget`, `project-attachments`, `management-dashboard`, `project-access-control`. Implemented across the feature branch `feat/gestion-proyectos-04-workspace-resumen` (PR1–PR4 of the 8-unit chained plan in tasks.md), plus a later `resumen-tab`/`project-workspace` layer visible in the current tree that is not described in tasks.md but is additive and consistent with the design (per-project dashboard scoping via `proyecto_id`, `canViewProject`).

Strict TDD Mode active. Test runner: `npm test` (vitest run).

**Out of scope, confirmed not a gap**: Cronograma/Gantt/Indicadores workspace tabs are "Próximamente" placeholders. This matches the proposal/tasks scope — only the `resumen` tab was committed to in this change's task list; the other tabs belong to later phases.

## Observed Task State

`tasks.md`: 42/42 checkboxes marked complete across Phase 0 and Units 1, 2a, 2b, 3a, 3b, 4a, 4b, 4c. Task file itself records honest deviations at nearly every phase (composite-FK naming fixes, route path renames, file relocations, denominator correction for `cumplimiento_cronograma`) — this is a positive signal: the apply phase documented reality instead of silently matching the plan. Checkbox state is preserved as-is; not rewritten by this verify pass.

No `apply-progress` artifact exists in either backend (confirmed via file listing and the orchestrator's own status). TDD evidence had to be reconstructed from tasks.md's inline RED/GREEN annotations and by re-running the tests directly, not from a dedicated TDD Cycle Evidence table.

## Checks Run

| Command | Result |
|---|---|
| `npx vitest run src/lib/permissions.test.ts src/lib/semaforo.test.ts src/app/api/v1/dashboard/projects/route.test.ts` | ✅ 3 files, 113 tests passed |
| `npx vitest run` over projects/rubros/proyectos-UI/dashboard-UI/invariants (34 files) | ✅ 34 files, 256 tests passed, incl. `prisma/invariant.test.ts` (16 tests, real DB) |
| `npx vitest run ".../convert/route.test.ts"` (D1-bis sentinel) | ✅ 7/7 tests passed |
| `git diff main -- ".../convert/route.ts"` | 0 lines — confirmed diff-zero, D1-bis honored |
| `npx tsc --noEmit` | 1 pre-existing error, in untracked `scripts/check-auth-users.ts` (git status: `??`, not part of this change) — zero errors in changed files |
| Assertion-quality scan (tautologies, empty-only checks) on semaforo/permissions/invariant/dashboard/projects test files | ✅ none found |
| Mock-heavy ratio check (`projects/route.test.ts`, `dashboard/projects/route.test.ts`, `semaforo.test.ts`) | ✅ all under 2× mocks-to-assertions |
| Manual read of `Tacometro` test file | ✅ behavioral assertions (viewBox, band boundaries, needle rotation, clamping), not smoke-only |
| Not re-run: full 1369-test suite | Already run by requester just prior to this verify pass: 1368/1369 green, 1 unrelated timeout flake in `change-password-dialog.test.tsx` (confirmed 6/6 green in isolation) — accepted as reported, not re-verified independently in this pass |

## Findings

### CRITICAL
None found.

### WARNING
1. **No dedicated `apply-progress` artifact was persisted for this change.** Strict TDD Mode requires a "TDD Cycle Evidence" table per task; it does not exist as a separate document. `tasks.md` itself carries inline RED/GREEN/Deviation notes per task, which is a reasonable substitute in spirit but not the expected artifact shape — cross-referencing test existence and passing status had to be done directly against the repo rather than against a report. This does not block archive per the verify contract, but the next change should keep apply-progress current so TDD evidence doesn't need to be reconstructed.
2. **`dashboard/projects/route.ts` has diverged from `design.md`'s literal per-project row shape** (it now aggregates org-wide by default and only applies `resolverUmbrales`/per-project override when `proyecto_id` is passed — a documented deviation from a later PR, per the file's own header comment referencing "gestion-proyectos-workspace PR1"). The deviation is declared in-file and tests pass, but it was not reflected back into `design.md` or `tasks.md`, so a reader of the design doc alone would not know the endpoint now supports project-scoped queries. Cosmetic/documentation gap, not a functional one.

### SUGGESTION
1. `beneficiarios_atendidos` uses `SUM(valor_actual WHERE cuenta_beneficiarios)` — if a project has more than one `Indicador` flagged `cuenta_beneficiarios`, the same beneficiaries could be double-counted, exactly as design.md's own Risks table calls out. The mitigation (expose `indicadores_beneficiarios_count`, warn in UI when >1) is present in the API payload; confirm the UI actually surfaces that warning (not verified in this pass — out of the files read).
2. RNF-02 (p95 < 3s) result recorded in tasks.md (p95 648.2ms on the 50×20×200 reference dataset) is a static report from the apply phase, not independently re-measured in this verify pass — treat as reported, not re-proven.

## TDD Compliance (Strict TDD Mode)

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ⚠️ Partial | No dedicated evidence table; RED/GREEN inline per task in tasks.md instead |
| All tasks have tests | ✅ | Every GREEN task in tasks.md has a matching, existing, passing test file (spot-checked + full targeted run) |
| RED confirmed (tests exist) | ✅ | All referenced test files exist on disk |
| GREEN confirmed (tests pass) | ✅ | 256/256 targeted + 113/113 core-logic tests pass now; sentinel 7/7 passes; invariant suite (real DB) 16/16 passes |
| Triangulation adequate | ✅ | `semaforo.test.ts` (17 cases, boundary + bidirectional), `permissions.test.ts` (63 cases, full role×flag×responsable matrix) |
| Safety Net for modified files | ✅ | `convert/route.ts` sentinel re-run confirms zero regression on the one pre-existing file this change could have touched |

**TDD Compliance**: 5/6 checks fully passed, 1 partial (missing dedicated evidence artifact, substituted successfully by direct verification).

**Assertion quality**: ✅ All assertions verify real behavior (spot-checked across semaforo, permissions, dashboard, invariant, and one component test file — no tautologies, no mock-heavy files, no ghost loops observed).

## Summary

What was verified: full permission matrix, semáforo parametrization (technical + bidirectional financial), the aggregated dashboard endpoint, all DB-level invariants (composite FKs, XOR support constraint, https-only constraint) against a real database, and the single most important regression risk of this change (`convert/route.ts` diff-zero + green). All pass. TypeScript strict check is clean on every file this change touches.

What remains unknown or unverified: whether the resumen-tab/project-workspace layer visible in the current tree (not itself described in tasks.md) has its own complete test coverage was not individually re-audited beyond confirming its test files exist and pass in the targeted run above. The full 1369-test suite was not independently re-run in this pass (trusted the requester's very-recent report of 1368/1369, 1 confirmed-unrelated flake).

**Recommended next step**: proceed to `sdd-archive`. Findings are diagnostic (2 WARNING, 2 SUGGESTION, 0 CRITICAL) and do not block archival; the two WARNINGs are documentation/process hygiene items, not functional defects.
