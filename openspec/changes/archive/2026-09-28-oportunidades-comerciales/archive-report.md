# Archive Report: oportunidades-comerciales

**Date**: 2026-09-28
**Change**: oportunidades-comerciales — Ciclo comercial trazable de Oportunidad a Proyecto
**Archive Location**: `openspec/changes/archive/2026-09-28-oportunidades-comerciales/`
**Artifact Store**: openspec (repo-local)

## Change Summary

Implements the commercial lifecycle of `Oportunidad` across 3 capabilities:
- `commercial-opportunities` — fixed `fecha_envio_propuesta`, communication log (`BitacoraEntrada.oportunidad_id`), lifecycle view, and phase-based conversion to `EJECUCION` (D2) with audit trail
- `opportunity-access-control` — `gestiona_oportunidades` flag orthogonal to `RolUsuario` (D3), migration-seeded to avoid lockout at deploy
- `opportunity-task-linking` — `Tarea.oportunidad_id` nullable FK with a database-level client-consistency invariant (D1, composite FK, non-negotiable), task filtering/creation from the opportunity, and Kanban visual distinction (RNF-C01)

Implemented across 3 stacked PR work units (PR1: schema/migration, PR2: permissions + admin toggle + task linking, PR3: conversion + UI) on feature branches per `tasks.md`'s Suggested Work Units table. PRs #44, #45, #46 were merged to `main` on 2026-09-17.

## Archived Artifacts

| Artifact | Status | Notes |
|---|---|---|
| proposal.md | Present | Complete; scope, approach, decisions D1–D9 |
| design.md | Present | Complete; technical approach, composite FK, permissions composition, conversion flow |
| tasks.md | Present | 36/36 tasks complete across Phase 0 and Phases 1–5; inline RED/GREEN/Discovery notes per task |
| specs/ (3 domains) | Present | Merged to main at `openspec/specs/{commercial-opportunities,opportunity-access-control,opportunity-task-linking}/spec.md` |
| verify-report.md | Present | `pass_with_warnings` verdict, 0 blockers, 0 critical findings, 11/11 requirements, 11/11 scenarios |
| archive-report.md | Present | This file |

## Final State (Archive Authority)

### Implementation State

- **All 36 tasks complete.** Full feature implementation across 3 PR units:
  - PR1 (Phase 0–1): Schema + migration + invariant (composite FK, CHECK constraint, D3 seed UPDATE) — deployable no-op
  - PR2 (Phase 2–3): Commercial permissions (`hasCommercialAccess`/`canManageOpportunity`), admin toggle, task↔opportunity linking
  - PR3 (Phase 4–5): Conversion endpoint + audit widening + lifecycle view UI + Kanban chip + OpenAPI contracts + E2E spec

- **Test Results** (per `verify-report.md`):
  - Scoped run (19 files touched/created by this change): 293/293 passed
  - Full-suite safety net: 1024/1026 passed, 2 pre-existing failures in `src/app/api/v1/documents/zip/route.test.ts` (filename-sanitization mismatch from commit `29a8f26`, confirmed via `git blame` to predate this change and untouched by any of the 3 commits)
  - Build: `npx tsc --noEmit` — exit 0, zero diagnostics
  - Linter: `npx eslint` on all 12 core changed source files — no errors

### Verification State

**Verdict**: PASS WITH WARNINGS (per `verify-report.md`)

| Finding Level | Count | Status |
|---|---|---|
| CRITICAL | 0 | None found |
| WARNING | 5 | Documented, non-blocking |
| SUGGESTION | 4 | Documented, diagnostic |

#### Requirements/Scenarios Coverage

11/11 spec requirements and 11/11 scenarios have passing covering tests, cross-referenced against real test files (`prisma/invariant.test.ts`, `permissions.test.ts`, `opportunities/*.test.ts`, `tasks/*.test.ts`, `convert/route.test.ts`, `task-card.test.tsx`, `entity-dialogs.test.tsx`, `log/route.test.ts`, `pipeline/route.test.ts`, `users/[id]/route.test.ts`). D1/D3/D4/D6/D7/RF-C03 independently verified correct by direct source inspection plus real test execution, including a live-DB CHECK-constraint test.

## Specs Synced to Main

3 new spec domains created at `openspec/specs/` (first specs created for the commercial-opportunities area of this repository):

| Domain | File | Status |
|---|---|---|
| commercial-opportunities | `openspec/specs/commercial-opportunities/spec.md` | Synced (new domain) |
| opportunity-access-control | `openspec/specs/opportunity-access-control/spec.md` | Synced (new domain) |
| opportunity-task-linking | `openspec/specs/opportunity-task-linking/spec.md` | Synced (new domain) |

All 3 domains were new — no existing `openspec/specs/<domain>/spec.md` predated this change, so each delta's `## ADDED Requirements` section was merged verbatim (title changed to `# <Domain> Specification`, section header changed to `## Requirements`) with no conflicting or unrelated requirements to preserve.

## Source of Truth Updated

- `openspec/specs/commercial-opportunities/spec.md` — Oportunidad lifecycle, fecha_envio_propuesta write-once, bitácora, conversion to EJECUCION (D2)
- `openspec/specs/opportunity-access-control/spec.md` — `gestiona_oportunidades` flag, migration seed, access denial without flag
- `openspec/specs/opportunity-task-linking/spec.md` — Tarea↔Oportunidad composite FK invariant, task filtering/creation, Kanban visual distinction (RNF-C01)

## Unfinished Work & Known Debt (carried from verify-report.md)

### Documentation/Process Debt

1. **Apply-progress lacks the standardized "TDD Cycle Evidence" table.** The Engram `apply-progress` observation carries prose batch notes and `tasks.md`'s own per-task RED/GREEN annotations instead of the literal per-task table. Verify reconstructed equivalent evidence by cross-referencing `tasks.md` against real test files and execution — a reporting-format gap, not a functional TDD-process failure. Recommend future changes use the literal table format.

2. **Lifecycle-view UI test only covers the empty-list case.** `entity-dialogs.test.tsx`'s `OportunidadLifecycleDialog` suite mocks `useTasksByOportunidad`/`useBitacora` to always return `data: []`; no test asserts a populated list actually renders. Underlying data plumbing is tested elsewhere (route tests), so this is a UI-rendering coverage gap, not a missing feature. Follow-up: add a non-empty-mock test case.

3. **`GET/POST /api/v1/clients/{id}/opportunities/{opportunityId}/tasks` has no OpenAPI contract registered.** Created in PR2 (task 3.7); task 5.5 scoped the OpenAPI work to the new fields and the convert endpoint only. Follow-up: register this route's contract in `src/lib/openapi/paths/clients.ts` or `tasks.ts`.

4. **`e2e/oportunidad-ciclo.spec.ts` (task 5.6) was never executed.** Written and type-checks clean, but no dev server/DB was available in the implementation sandbox — matches the project's existing "CI only" pattern already established for `permisos-colaborador.spec.ts`. Follow-up: confirm green in CI.

5. **`client-sheet.tsx` tab-visibility deviates from design.md's prose.** `tasks.md` 5.2 ties both tab visibility and `readOnly` to the single write-gate flag (`puede_gestionar_oportunidades`), narrower than design.md's description (visibility from the read gate, `readOnly` from the write gate). Documented as a "safe-direction" deviation (hides more, never leaks more) — a flagged-but-non-responsible COLABORADOR loses tab visibility they would have under the design's literal wording. Follow-up: maintainer sign-off if broader read visibility is desired for that role.

### Diagnostic Suggestions (non-blocking)

- Add a non-empty `entity-dialogs.test.tsx` case to close item 2 above and directly prove list-rendering behavior.
- Register the OpenAPI contract noted in item 3 above.
- Native `gentle-ai sdd-attempt` runtime reported `decision_required: true` (blocked on `changed_line_budget_exceeded`) for all 3 PRs — an orchestrator/maintainer tooling decision, not a code defect.
- None of the 3 stacked branches/commits were pushed to origin as PRs at verify time; PRs #44, #45, #46 were subsequently opened and merged to `main` on 2026-09-17, closing this item.

### No Blocking Issues

No CRITICAL findings. All 36 tasks closed, verification passed with warnings only, specs synced, code already merged to `main` via PRs #44/#45/#46.

## SDD Cycle Complete

**Status**: ARCHIVED

The change is complete, verified, and closed. Implementation: **All 36 tasks done.** Verification: **PASS WITH WARNINGS, 0 CRITICAL findings, 11/11 requirements and scenarios covered.** Code already live on `main` since 2026-09-17.

**Next steps**: Address the 5 documented WARNINGs as follow-up work when convenient (none are blocking); no further action required to close this change.

---

**Archive Checklist**

- [x] All artifacts read and verified present
- [x] Delta specs merged to main specs (3 new spec domains created)
- [x] Change folder moved to archive with date prefix (2026-09-28)
- [x] Archive report created and persisted
- [x] Final state recorded: 36/36 tasks, PASS WITH WARNINGS verdict, 0 CRITICAL, 5 WARNING (non-blocking), 4 SUGGESTION (diagnostic)
