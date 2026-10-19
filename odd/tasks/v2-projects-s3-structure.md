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

- [x] **U1** `Objetivo` schema + migration + invariant test + objectives routes (fb8bad3; the indicator delete guard moved to U3, where `Indicador` exists).
- [x] **U2a** `src/lib/proyectos/actividad.ts` (pesoEfectivo, resolvePeso, validarSemanas, view) + `Actividad` table (ffb3a84).
- [x] **U2b** Activities routes (week bounds, same-project refs, derived dates, 403/409 matrix); add the
  objective-delete guard for live activities (fbaa1a0).
- [x] **U3** `Entregable` + `Indicador` schema and routes (812868e), plus the objective-delete guard for live indicators and the activity-delete guard for live deliverables.
- [x] **U4** Hooks + `ProjectEstructura` section in the ficha (4f568e1).

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly if they recur). No behavior change for other roles.

## Progress

- 2026-10-08: mapping done; document created.
- 2026-10-08: backend U1-U3 done by one writer, local DB only (4 migrations applied via `.env.local`). RED observed per unit;
  full suite `TZ=America/Bogota npx vitest run`: 176 files / 1703 tests green; `tsc --noEmit` and eslint clean.
  Deviations: `Entregable` carries a denormalised `proyecto_id` (code unique per project, REQ-STR-05, composite FK to
  `actividades(id, proyecto_id)`); `Decimal(15,2)` fields serialise as strings, `peso` as a number; codes are client-supplied
  free text (no `IND-nn` auto-generation); OpenAPI lives in `src/lib/openapi/paths/project-structure.ts`.
- 2026-10-08: U4 done (4f568e1) by one writer. RED observed: hooks test 28/28 failing (missing exports), component test file
  failing on missing module, ficha mount test failing before the section was mounted. GREEN: hooks 28, `ProjectEstructura` 26,
  ficha mount 1; full suite `TZ=America/Bogota npx vitest run`: 178 files / 1758 tests green; `tsc --noEmit` and eslint clean.
  Hooks are in `src/hooks/projects.ts` (list/create/update/delete per entity, own-list invalidation, no toast; update variables
  are `{ id, data }`). Components: `project-estructura.tsx` + `estructura-{objetivos,actividades,entregables,indicadores,ui}.tsx`.
  Controls only for `canManageProjects` on BORRADOR; no-dates hint replaces the activity form. Existing `project-list` /
  `project-ficha-dialog` tests got stubs for the new hooks/endpoints. Native review (RDD) not run: needs per-candidate consent.

## Next step

S3 complete pending PO feedback on the decisions above; S4 (avances/estado of activities) is next in the ledger.
