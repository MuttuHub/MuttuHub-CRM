# Muttu Hub v2 — Projects "pendientes" batch (S2.4, S2.7, S3.6b, admin catalogs/settings)

Parent plan: `odd/tasks/v2-projects-sdd.md` (S2.4, S2.7, S3.6b) and `odd/tasks/v2-projects-execution.md` (ledger).
Branch: `feat/projects-v2`. Mirror: Engram topic `odd/v2-projects-pendientes/tasks`.

## Objective

Close the open items left after S3: the opportunity-vs-project value-difference alert, the dashboard panel separation,
the week Gantt of the structure section, and the admin catalog/settings items handled in round 2.

## Verified problem (2026-10-08, against code, not the SDD)

- `Proyecto.diferencia_valor_oportunidad` exists in the schema and is exposed by `toProjectItemV2`, but nothing computes
  it: the create-from-opportunity route (`.../opportunities/[opportunityId]/project/route.ts`) never sets it and the
  PATCH route refuses `diferencia_valor_oportunidad` and `alertas` (400). No `diferenciaValor` helper exists.
- The ficha already renders the `diferencia_valor_oportunidad` column; nothing renders an alert or a difference in the
  create dialog.
- `GET /dashboard/my-summary` and `cara-my-summary.tsx` have no projects group.
- The structure section (`project-estructura.tsx`) has the activity editor but no Gantt (explicitly deferred in S3).
- No `lineas_presupuestales` model exists (blocks S1.1b).

## Scope

In round 1: units A (S2.4), B (S2.7), F (S3.6b). Round 2: E1, E2, D1, D2 (admin catalogs/settings; scope fixed in the
round-2 brief and recorded here when that round starts). C and G are resolved/deferred below.

## Decisions

1. (A) `valor_total` is user-entered; the opportunity's `valor_estimado_cop` is the reference. Difference =
   `valor_total - valor_estimado_cop`, null when either is null. INDEPENDIENTE projects: null, no alert. The alert never blocks.
2. (B) Projects group counts EN_EJECUCION only (BORRADOR excluded). Managers see all non-deleted; a COORDINADOR only
   active-member projects; other roles none. Prospecting group keeps the existing own-scope rules.
3. (C) **RESOLVED, nothing to wire**: write authority for COORDINADOR members. Per the SDD matrix only avances, gastos and
   modification-requests are COORD-M writes (P09, P10, P12) and those routes do not exist yet. Widening the
   POST/PATCH/structure/members gates would violate REQ-ACC-01. `gateEjecucionWrite` is added with its first caller in S4.1.
4. (G) **DEFERRED**: S1.1b is blocked until S5.1 creates the budget table (no `lineas_presupuestales` model exists).
5. (F) Gantt is read-only for everyone who can read the ficha; no new dependency, no new API; CSS grid, one column per week.

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; UI copy Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Native review (RDD) needs per-candidate human consent; not run unattended, recorded as pending.

## Execution settings

Delivery strategy `ask-on-risk`; one bounded writer per round; one commit per unit; ~400-line heuristic advisory.

## Tasks

- [x] **A** S2.4 value-difference alert (`diferenciaValor`, create route, PATCH recompute, hook types, dialog, OpenAPI) (482d233).
- [x] **B** S2.7 "Mi resumen" projects-in-execution vs prospecting-opportunities groups (6b4d2c4).
- [x] **F** S3.6b structure Gantt (`ganttLayout` + `estructura-gantt.tsx`) (53632e7).
- [x] **E1** catalog GETs accept `?incluir_inactivos=true` (ADMINISTRADOR only; other roles ignore it; default unchanged;
  shared helper `src/lib/api/incluir-inactivos.ts`; OpenAPI query param) (e535518).
- [x] **E2** catalogs-v2 admin section `catalogos-v2-section.tsx`: rubros / lineas / municipios sub-tables, rename and
  suspend/restore via PATCH, `codigo` read-only, add form for lineas and municipios (DANE 5 digits), no add for rubros,
  409 shown inline in Spanish; mounted in `administracion/page.tsx`; hooks in `src/hooks/admin.ts` (170fcb0).
- [x] **D1** semaforo v2 parameters: `src/lib/proyectos/semaforo-v2.ts` (defaults, all `confirmado:false`, safe
  `parseParametrosV2`), `SETTING_SEMAFORO_PARAMETROS_V2` + getter in `settings.ts`, route
  `/api/v1/settings/semaforo-v2` GET (any authenticated) / PATCH (ADMIN, partial, ranges, one `CAMBIAR_PARAMETRO` audit
  row per changed field, entidad `parametro`), OpenAPI path (8723ef1).
- [x] **D2** thresholds admin form `umbrales-section.tsx` (six parameters, "No confirmado" badge, confirm toggle, PATCH of
  changed fields only, inline errors), mounted in `administracion/page.tsx` (a7e640c).
- [x] **C** resolved, nothing to wire (decision 3).
- [x] **G** deferred until S5.1 (decision 4).

## Acceptance

- Every RED test observed failing, then passing. `tsc` clean; eslint clean on touched files; full vitest green under
  `TZ=America/Bogota` (load-flakes recorded honestly, re-run alone and against base).

## Progress

- 2026-10-08: document created; C resolved and G deferred.
- 2026-10-08: round 1 (A, B, F) done by one writer. RED observed per unit: A helper 5 failing, routes 7 failing, dialog 2
  failing; B route 4 failing, component 3 failing (missing groups); F helper and component files failing on missing
  modules, mount test failing before the section was mounted. GREEN: full suite `TZ=America/Bogota npx vitest run`:
  181 files / 1796 tests; `tsc --noEmit` and eslint clean on touched files.
  Deviations: the existing money formatter renders `$ 50.000` (with a space), used as is. `alertas` is always present on
  `ProjectItemV2` (empty array when none), so GET/list expose it too. Prospecting group = fase PROSPECCION and estado not
  GANADA/PERDIDA, of clients the caller is responsable of. `CardSection` now sets `aria-label` from its title. Print view
  of "Mi resumen" not extended. Native review (RDD) not run: needs per-candidate consent.

- 2026-10-08: round 2 (E1, E2, D1, D2) done by one writer. RED observed per unit: E1 3 failing (admin sees suspended rows,
  one per route); E2 and D2 component files failed on the missing module; D1 lib and route files failed on the missing
  module. GREEN per unit with focused runs; full suite `TZ=America/Bogota npx vitest run`: 185 files / 1840 tests green; `tsc --noEmit` and eslint clean on touched files.
  Deviations: parameters are stored as `{ valor, confirmado }` per key (a flat number could not carry the confirmation
  flag); PATCH body mirrors that shape. Audit `campo` is `<param>.valor` / `<param>.confirmado`, `entidad_id` is the
  setting key. `GET` handlers of the three catalogs take an optional `request` so existing `GET()` callers still work.
  Catalog mutations in the admin hooks do not toast: the section shows server errors inline. The OpenAPI path was added
  together with the route (its document test was not observed failing first). No new hook-level tests for the admin
  catalog hooks (covered through the section tests with mocked hooks). Native review (RDD) not run: needs consent.

## Next step

Round 2 closed. Remaining: native review per candidate (needs consent); S1.1b stays blocked until S5.1.
