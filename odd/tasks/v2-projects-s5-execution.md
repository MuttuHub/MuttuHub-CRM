# Muttu Hub v2 — S5 Budget, monthly programming and financial ficha (RF-18, RF-19, RF-23, RF-24)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§3.7 BUD, §3.8 FIN, §4.2, §4.8, §4.9, §5.6), ledger
`odd/tasks/v2-projects-execution.md`, verified mapping `odd/tasks/v2-projects-s5-map.md` (READ IT: formulas, F-F1 golden
numbers, route tables, defaults and risks). Branch: `feat/projects-v2`.

## Objective

Admins/managers define the per-rubro budget (A) and monthly programming (P) of a BORRADOR project; authorized readers see
a financial ficha (A/P/E/D, E/P, E/A, tolerance threshold, color). E (validated expenses) has no source until S6.

## Decisions (defaults from the map section 7; revisit with PO feedback)

1. `valor_total` stays user-entered; the budget PUT never overwrites it except when it is null (then = Σ A, with
   `diferencia_valor_oportunidad` recomputed). Σ A = valor_total is a baseline precondition (S8.2), not a PUT rule.
2. No `Gasto` table: E = 0 through the seam `loadGastosValidados` (`ejecucion_disponible: false`, `color: null`) until S6.
3. Programming Σ = A is informational in BORRADOR (`control = Σ cells − A`), enforced by `precondicionesPresupuesto`.
4. Lines and programming cells are never soft-deleted; $0 is "off". `programacion_pendiente` is derived on read.
5. `colorFinancieroV2` checks `E > A` first, then `E <= P` verde, tolerance amarillo, else rojo.
6. Migration `20261009120000_v2_presupuesto` is adoptive and idempotent (prod may hold v1 `lineas_presupuestales`).
7. Corte semantics: monthly corte -> technical date = last day of that month clipped to today (Bogota); alert on the total row.
8. No route changes project estado; no `s5-presupuesto.ts` seeding script (virtual $0 rows on GET).

## Constraints

- Local only; no push, PR or remote. Every DB command loads `.env.local` (never the default `.env`).
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- tsconfig target ES2017: no bigint literals, use `BigInt(...)` constants.
- Delivery strategy `ask-on-risk`; ~400 lines/unit advisory. Native review (RDD) needs per-candidate consent: pending.

## Tasks

Route: delegated writer per round (round 1: U1-U3, round 2: U4-U6).

- [x] **U1** Pure libs: `ficha-financiera.ts`, `__fixtures__/financiero.ts` (F-F1), `colorFinancieroV2`, `alertaRetraso`,
  `toleranciaBp`, `precondicionesPresupuesto` (6e39cde).
- [x] **U2** Schema + migration `v2_presupuesto` + invariants test, rubro rename 409 guard, `s1-rubros-report.ts` amounts (dbe8f91).
- [x] **U3** Budget + programming routes (`presupuesto.ts` gates, GET/PUT budget, GET/PUT programming, audit, OpenAPI) (7673e50).
- [ ] **U4** Financial sheet route: `loadTecnicoStatus` extraction, `financiera.ts` seam, GET financial-sheet, OpenAPI.
- [ ] **U5** UI editors: hooks, `project-presupuesto.tsx`, programming grid.
- [ ] **U6** UI financial ficha: `project-financiero.tsx`, selectors, mount, stubs in list/ficha tests.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly). F-F1 golden: R01 verde, R12 rojo, total verde (map section 4).

## Progress

- 2026-10-08: document created from the S5 map.

- 2026-10-08: round 1 (U1-U3) by one bounded writer, local DB only (migration `20261009120000_v2_presupuesto` applied with
  `node --env-file=.env.local ... migrate deploy`, then `db:generate:local`; re-running the SQL via `db execute` succeeded
  (idempotent) and `migrate diff --from-config-datasource --to-schema` reported no drift). RED observed per unit
  (U1: `alertaRetraso is not a function` + missing module; U2: `Cannot read properties of undefined (reading 'create')` on
  the missing Prisma delegate, rename 409 test failing, missing planner module; U3: unresolved `./route` for both routes and the
  OpenAPI test), then GREEN. Full suite `TZ=America/Bogota npx vitest run`: 212 files / 2103 tests green; `tsc --noEmit` and
  eslint clean on touched files.
  - U1: `ficha-financiera.ts` (`computeFicha`, `validadoAcumulado`, `excederiaAsignado`, `controlProgramacion`,
    `precondicionesPresupuesto`), `colorFinancieroV2`/`toleranciaBp`/`alertaRetraso` in `semaforo-v2.ts`, fixture
    `__fixtures__/financiero.ts`. F-F1 golden holds (R01 verde 90,8/45,4, R12 rojo 112,5/56,3, total verde 97,0/48,5,
    umbrales 32.725.000 / 13.200.000 / 45.925.000).
  - U2: models `LineaPresupuestal`, `ProgramacionPeriodo`; adoptive migration; `prisma/presupuesto.invariant.test.ts`
    (live DB, rollback; also pins the lock SQL); rubro rename 409 in `rubros/[id]/route.ts` (only when `nombre` changes and a
    line exists; suspending still allowed); `s1-rubros-report.ts` now reuses `s1-rubros-report-plan.ts` (extracted so a fake
    client can test it) and prints `sum(monto_proyectado_cop)` per project; it still imports `_guard` (`.env.local`, loopback).
  - U3: `src/lib/api/presupuesto.ts` (gates with budget copy, `lockProyectoBorrador`, `parseMonto`, `buildBudgetView`,
    `buildProgrammingView`, `loadBudgetView/loadProgrammingView`), routes `projects/[id]/budget` and `projects/[id]/programming`,
    OpenAPI `paths/project-budget.ts`.
  - Deviations: (1) A $0 amount creates NO line (and no audit row); lines exist only after a first amount above $0 and are never
    deleted, so a rubro stays a virtual row until funded; programming requires an existing line (400 otherwise).
    (2) Programming cell deletes and zeroing are audited as `EDITAR` with `valor_nuevo "0.00"` (no delete action exists in
    `AccionAuditoria`); creation is `CREAR`. (3) Budget `diferencia` = Σ A − valor_total (same sign as the V-12 precondition copy).
    (4) valor_total fill skips Σ A = 0 or above the Decimal(15,2) limit; the null check is re-read under the project row lock.
    (5) `heredado_pendiente` = suspended rubro AND A > 0. (6) `tsx` cannot run here, so `s1-rubros-report.ts` was not executed
    against the DB; its planner is covered with a fake client. (7) The control per rubro is also returned with `codigo`/`nombre`
    for the UI. (8) Native review (RDD) not run: needs per-candidate consent.

## Next step

Round 2: U4 (financial sheet route, `loadTecnicoStatus` extraction, `financiera.ts` seam), U5 and U6 (UI), per the map sections 5-6.
Round 2 reads `src/lib/api/presupuesto.ts` for the gate/view helpers (`gatePresupuestoRead`, `buildBudgetView`).
