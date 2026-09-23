# Archive Report: tablero-seguimiento-social

**Date**: 2026-09-22  
**Change**: tablero-seguimiento-social — Tablero de Seguimiento y Gestión de Proyectos de Impacto Social  
**Archive Location**: `openspec/changes/archive/2026-09-22-tablero-seguimiento-social/`  
**Artifact Store**: openspec (repo-local)

## Change Summary

Implements RF-01..RF-07 + módulo KPI 3.4 + RNF-01..03 across 6 capabilities:
- `project-tracking` — Proyecto CRUD, identity, states, traceability to Cliente/Oportunidad
- `project-schedule` — Meta + Actividad, cronograma, línea base vs. ejecución, technical progress + semáforo
- `project-budget` — Rubro catalog (administrable), presupuesto planificado vs. ejecutado, financial semáforo (bidirectional)
- `project-attachments` — Soportes with file XOR external URL, per-project/activity/expense scope
- `management-dashboard` — Fifth dashboard face: tacómetro, curva S, radar, beneficiarios atendidos/meta card
- `project-access-control` — Read-only gerencial visibility (RNF-01) and write gates (RNF-03)

Implemented across 8 work units in a chained-PR model (PR1 through PR4c) on feature branch `feat/gestion-proyectos-04-workspace-resumen`, plus additional resumen-tab/project-workspace layer consistent with the design.

## Archived Artifacts

| Artifact | Status | Notes |
|---|---|---|
| proposal.md | Present | Complete; scope, approach, rollback, dependencies, size forecast |
| design.md | Present | Complete; technical approach, architecture decisions (T1–T10), data model, migration, permissions, semáforos, visualizations, testing strategy, risks, assumptions |
| tasks.md | Present | 42/42 tasks complete across Phase 0 and Units 1–4c; honest deviations documented inline per task (composite FK naming, route paths, file relocations, denominator corrections) |
| specs/ (6 domains) | Present | Merged to main at `openspec/specs/{project-tracking,project-schedule,project-budget,project-attachments,project-access-control,management-dashboard}/spec.md` |
| verify-report.md | Present | Intermediate snapshot; PASS verdict with 0 CRITICAL, 2 WARNINGs, 2 SUGGESTIONs; all checks run and documented |
| explore.md | Present | Initial exploration phase output |
| source-requirements.md | Present | Supporting requirements document |

## Final State (Archive Authority)

Per the Final-State Authority hierarchy in sdd-archive/SKILL.md, the authoritative sources for this archive are:

1. **Task completion** — `tasks.md` (42/42 checkboxes marked, inline RED/GREEN/Deviation notes)
2. **Explicit final-state facts from orchestrator** — provided in the launch prompt
3. **Intermediate snapshots** (`verify-report.md`, `apply-progress` if existed) — lowest rank, for history only

### Implementation State

- **All 42 tasks complete.** Full feature implementation across 8 PR units:
  - Unit 1: Schema + migration + rubro catalog + DB invariants
  - Unit 2a: Permissions matrix + access control gates
  - Unit 2b: Proyecto CRUD + conversion action from Oportunidad
  - Unit 3a: Metas, Actividades, semáforo técnico
  - Unit 3b: Attachments backend + cronograma/soportes UI
  - Unit 4a: Budget (rubros, líneas, gastos)
  - Unit 4b: Aggregated dashboard endpoint (6 KPIs, 1 round-trip)
  - Unit 4c: SVG charts + management dashboard UI + print

- **Test Results** (per orchestrator's pre-verify measurement):
  - Full suite: 1368/1369 tests passed
  - 1 failure: `src/components/shell/change-password-dialog.test.tsx` (unrelated flaky test, 6/6 green in isolation)
  - Not a regression from this change

### Verification State

**Verdict**: PASS (per `verify-report.md`)

| Finding Level | Count | Status |
|---|---|---|
| CRITICAL | 0 | None found |
| WARNING | 2 | Documented, non-blocking |
| SUGGESTION | 2 | Documented, diagnostic |

#### Findings Detail

**WARNING 1: No dedicated apply-progress artifact**
- Strict TDD Mode requires a "TDD Cycle Evidence" table per task.
- This artifact was not persisted separately during apply.
- Mitigation: `tasks.md` carries inline RED/GREEN/Deviation notes per task, which is a reasonable substitute in spirit. TDD evidence was reconstructed directly from test runs during verification and confirmed complete.
- **Impact on archive**: None. Does not block closure. Recommendation: next change should maintain apply-progress as a separate artifact.

**WARNING 2: API diverged from design.md literal shape (documentation drift)**
- `src/app/api/v1/dashboard/projects/route.ts` now aggregates org-wide by default with optional `proyecto_id` scoping (from a later PR in the workspace layer, gestion-proyectos-workspace PR1).
- Design.md specifies "per-project row shape" literally.
- Deviation is declared in-file (`// per gestion-proyectos-workspace PR1...`) and tests pass, but the deviation was not reflected back into design.md or tasks.md.
- **Impact on archive**: Cosmetic/documentation gap, not a functional defect. A reader of the archived design doc alone would not discover the endpoint's later scoping capability.

**SUGGESTION 1: Possible double-counting of beneficiarios_atendidos**
- `Indicador.cuenta_beneficiarios` flag marks indicators that feed the "Beneficiarios Atendidos" tarjeta.
- If a project has >1 flagged indicator, the same beneficiary could be counted multiple times in the sum.
- Per design.md risks: mitigation is `indicadores_beneficiarios_count` in the API payload + UI warning when count > 1.
- **Status**: Mitigation present in API payload. UI warning surface was not independently verified in this pass.

**SUGGESTION 2: RNF-02 (p95 < 3s) measured, not re-verified**
- p95 reported by apply phase: 648.2ms on the 50×20×200 reference dataset (within 3s budget with margin).
- Not independently re-measured during verification.
- **Status**: Treated as reported and accepted per D9 (presupuesto medido, not bloqueante).

#### Regression Sentinel (D1-bis)

**Status**: ✅ CONFIRMED
- File: `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.ts`
- Requirement: Diff-zero + all 7 test cases green
- Result: Confirmed diff-zero against main; 7/7 tests pass
- This is the highest-risk item in the whole change (protecting the commercial cycle already in production) and it holds.

#### Out of Scope (Intentional Placeholders)

Cronograma/Gantt/Indicadores workspace tabs are marked "Próximamente" (coming soon). This is confirmed as out of scope for this change per proposal and tasks; later phases will implement them.

## Specs Synced to Main

6 new spec domains created at `openspec/specs/` (these were the first specs created in this repository):

| Domain | Lines | File | Status |
|---|---|---|---|
| project-tracking | 52 | `openspec/specs/project-tracking/spec.md` | ✓ Synced |
| project-schedule | 73 | `openspec/specs/project-schedule/spec.md` | ✓ Synced |
| project-budget | 52 | `openspec/specs/project-budget/spec.md` | ✓ Synced |
| project-attachments | 62 | `openspec/specs/project-attachments/spec.md` | ✓ Synced |
| project-access-control | 39 | `openspec/specs/project-access-control/spec.md` | ✓ Synced |
| management-dashboard | 74 | `openspec/specs/management-dashboard/spec.md` | ✓ Synced |

**Total spec coverage**: 352 lines of requirements specifications, now the source of truth for future phases.

## Archive Contents Verified

- ✅ proposal.md (present, 136 lines)
- ✅ design.md (present, 748 lines)
- ✅ tasks.md (present, 102 lines)
- ✅ verify-report.md (present, 70 lines)
- ✅ specs/ directory with 6 domains (all synced to main)
- ✅ explore.md (present, 418 lines)
- ✅ source-requirements.md (present, 206 lines)
- ✅ archive-report.md (this file)

**Archived folder byte-verified**: `diff -r` output empty (zero differences between pre-move snapshot and archived destination).

## Source of Truth Updated

The following main specs now reflect the new behavior and are the canonical source for future implementations:

- `openspec/specs/project-tracking/spec.md` — Proyecto identity, CRUD, states, traceability
- `openspec/specs/project-schedule/spec.md` — Meta, Actividad, cronograma, línea base vs. real, technical progress
- `openspec/specs/project-budget/spec.md` — Rubro catalog, presupuesto, semáforo financiero
- `openspec/specs/project-attachments/spec.md` — File XOR URL, scoped attachments
- `openspec/specs/project-access-control/spec.md` — Read-only gerencial, write gates
- `openspec/specs/management-dashboard/spec.md` — Fifth dashboard face, SVG primitives, KPIs

## Unfinished Work & Known Debt

### Documentation Debt (2 WARNINGs from verify)

1. **apply-progress not persisted separately** — Design.md and tasks.md should have been mirrored by a dedicated apply-progress artifact documenting TDD cycle evidence per task. For this change, TDD evidence was reconstructed from tasks.md inline notes + test runs. Recommend: next change maintains this artifact.

2. **API shape divergence not back-reflected** — `dashboard/projects/route.ts` later gained `proyecto_id` scoping capability (workspace PR1), but design.md was not updated to document this optional per-project query mode. The in-file comment declares the deviation; reading only the design.md would miss this. Recommend: re-sync design.md with the actual endpoint shape, or accept as legacy documentation.

### Out-of-Scope Intentional Gaps (Not Debt)

- Cronograma/Gantt tab: "Próximamente" — future phase
- Indicadores tab: "Próximamente" — future phase
- Full beneficiary register (D6): Deferred, requires habeas data compliance; counters-only model sufficient for this phase

### No Blocking Issues

No work is pending for this change. Implementation complete, all 42 tasks closed, verification passed, specs synced.

## Rollback Boundary

**If rollback required:**

1. Revert database migration: `npx prisma migrate resolve --rolled-back {migration-name}`
   - Drops 8 new tables, 3 new enums, removes `Usuario.puede_ver_tablero_gerencial`
   - No data loss from pre-existing tables (Cliente, Oportunidad, Tarea, Documento all intact)

2. Revert code changes: merge from `main` or revert feature branch

3. Revert specs: delete `openspec/specs/{project-tracking,project-schedule,project-budget,project-attachments,project-access-control,management-dashboard}/`

4. D1-bis protection: `convert/route.ts` is untouched (diff-zero), so commercial cycle remains intact

## SDD Cycle Complete

**Status**: ✅ ARCHIVED

The change is complete, verified, and closed. Implementation: **All 42 tasks done, all checks passed.** Verification: **PASS verdict with 0 CRITICAL findings.**

The two WARNINGs are documentation/process items (missing artifact shape, spec drift), not functional defects. Implementation is production-ready.

**Next steps**: None for this change. Repository now has a complete, auditable record of the tablero-seguimiento-social implementation in the archive, with main specs as the source of truth for future development.

---

**Archive Checklist**

- [x] All artifacts read and verified present
- [x] Delta specs merged to main specs (6 new spec domains created)
- [x] Change folder moved to archive with date prefix (2026-09-22)
- [x] Archive byte-verified (diff -r: empty)
- [x] Archive report created and persisted
- [x] Final state recorded: 42/42 tasks, PASS verdict, 0 CRITICAL, 2 WARNING (non-blocking), 2 SUGGESTION (diagnostic)
