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

- [ ] **U1** Pure libs: `ficha-financiera.ts`, `__fixtures__/financiero.ts` (F-F1), `colorFinancieroV2`, `alertaRetraso`,
  `toleranciaBp`, `precondicionesPresupuesto`.
- [ ] **U2** Schema + migration `v2_presupuesto` + invariants test, rubro rename 409 guard, `s1-rubros-report.ts` amounts.
- [ ] **U3** Budget + programming routes (`presupuesto.ts` gates, GET/PUT budget, GET/PUT programming, audit, OpenAPI).
- [ ] **U4** Financial sheet route: `loadTecnicoStatus` extraction, `financiera.ts` seam, GET financial-sheet, OpenAPI.
- [ ] **U5** UI editors: hooks, `project-presupuesto.tsx`, programming grid.
- [ ] **U6** UI financial ficha: `project-financiero.tsx`, selectors, mount, stubs in list/ficha tests.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly). F-F1 golden: R01 verde, R12 rojo, total verde (map section 4).

## Progress

- 2026-10-08: document created from the S5 map.

## Next step

Round 1: U1, U2, U3 in order, one commit each.
