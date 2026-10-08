# Muttu Hub v2 — S3 Technical structure (objectives, activities, deliverables, indicators)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§3.4 STR, §4.2, §4.8, §4.9, §5.4) and `odd/tasks/v2-projects-execution.md`
(ledger). Branch: `feat/projects-v2`. Mirror: Engram topic `odd/v2-projects-s3-structure/tasks`.

## Objective

An ADMINISTRADOR or GERENCIA user can describe a BORRADOR project's technical structure from its ficha: objectives,
activities placed in project weeks (dates derived, never stored), deliverables with a goal quantity, and indicators.

## Problem (verified 2026-10-08 by a read-only mapper)

- `Objetivo`, `Actividad`, `Entregable`, `Indicador` do not exist in `prisma/schema.prisma`; there is no
  `src/lib/proyectos/actividad.ts`. The SDD's "expand/backfill" wording is moot: all four tables are created whole.
- Present and reusable: `src/lib/proyectos/weeks.ts` (`activityDates`, `defaultWeight`, `durationWeeks`),
  `logChange(s)`/`diffFields`, `loadProjectScoped`/`canReadProject`, `canManageProjects`, `INVALID_STATE`, the PATCH
  `/projects/:id` route (BORRADOR/409 template) and the members route (P2002 → 409 and audit template).
- No `projects_v2` flag exists (decision ODD-01): the SDD tests about the flag and v1 coexistence are dropped.
- The ficha is a Dialog of stacked sections, not tabs: the new block mounts as one more section.

## Scope

In: schema + migration per entity, pure lib `actividad.ts`, CRUD routes (soft delete, audited), ficha section.
Out: avances/estado of activities (S4), Gantt tab (deferred), backfill (n/a), budget (S5), baseline/versions (S8).

## Decisions taken with defaults (no PO answer yet; revisit with feedback)

1. Write access: ADMINISTRADOR/GERENCIA only (`canManageProjects`), BORRADOR only (409 `INVALID_STATE` otherwise).
2. Activity weight defaults to its duration in weeks; a supplied weight sets `peso_manual` (kept when weeks change).
3. Activities require project dates (400 when `fecha_inicio`/`fecha_fin` are null); weeks bounded by project duration.
4. Deleting an objective with live activities/indicators, or an activity with live deliverables, answers 409.
5. Deliverable `tipo_medio_exigido` is free text, not an enum.
6. No `estado` on activities in S3 (arrives with S4).

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; UI copy follows the project's Spanish UI. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Delivery strategy `ask-on-risk`; units below stay near the ~400-line heuristic (advisory).
- Native review: RDD needs per-candidate human consent; not run unattended, recorded as pending.

## Tasks

Route: each unit delegated to one bounded writer (2+ non-trivial files; mapping already delegated).

- [ ] **U1** `Objetivo` schema + migration + invariant test + objectives routes (+ indicator guard on delete).
- [ ] **U2a** `src/lib/proyectos/actividad.ts` (pesoEfectivo, resolvePeso, validarSemanas, view) + `Actividad` table.
- [ ] **U2b** Activities routes (week bounds, same-project refs, derived dates, 403/409 matrix); add the
  objective-delete guard for live activities.
- [ ] **U3** `Entregable` + `Indicador` schema and routes.
- [ ] **U4** Hooks + `ProjectEstructura` section in the ficha.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly if they recur). No behavior change for other roles.

## Progress

- 2026-10-08: mapping done; document created. No S3 code written yet.

## Next step

Dispatch U1.
