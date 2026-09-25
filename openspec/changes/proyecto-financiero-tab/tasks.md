# Tasks: proyecto-financiero-tab — Pestaña Financiero en el workspace del proyecto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380-480 (hook+types ~60, component ~180 incl. gauge/table/alert, tests ~180, workspace wiring ~30, catalogs+semaforo test update ~30) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk (user-confirmed) |
| Chain strategy | not needed — estimate is within/near budget for a single PR; re-assess if the actual diff exceeds ~400 lines during apply |

Decision needed before apply: No.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary |
|------|------|-----------|----------------------|--------------------|
| 1 | `useBudget` hook + DTO types | PR 1 | `npx vitest run src/hooks/projects.test.ts` | Delete hook/types, no other file touched |
| 2 | `financiero-tab.tsx` component (gauge, chip, table, alert) | PR 1 | `npx vitest run src/components/proyectos/tabs/financiero-tab.test.tsx` | Delete component + test |
| 3 | Wire tab into `project-workspace.tsx` | PR 1 | `npx vitest run src/components/proyectos/project-workspace.test.tsx` | Revert `TAB_VALUES`/trigger/content additions |
| 4 | D-FIN1: update `UMBRALES_SEMAFORO_DEFAULT` | PR 1 | `npx vitest run src/lib/semaforo.test.ts` | Revert constant values in `catalogs.ts` |

## Phase 1: Data layer (`useBudget`)

- [x] 1.1 RED: write `src/hooks/projects.test.ts` cases for `useBudget` — query key shape (`["projects", id, "budget"]`), `enabled: false` when `projectId` is null, envelope unwrapping on success, error passthrough on failure. Run `npx vitest run src/hooks/projects.test.ts`, confirm failing.
- [x] 1.2 GREEN: implement `useBudget` + `Budget`/`RubroBudget` types in `src/hooks/projects.ts`, mirroring `useGoals`. Run the same test file, confirm passing.

  **Deviation:** `useBudget` mirrors `useProjectDashboard`, not `useGoals` — `GET /budget`'s response has no envelope key (`{ rubros, proyectado_total, ... }` is the raw body, confirmed by reading `budget/route.ts`), so the `queryFn` returns `apiGet<Budget>(...)` directly with no `res.x` unwrap. Also, `monto_proyectado_cop`/`monto_ejecutado_cop`/`proyectado_total`/`ejecutado_total` are typed as `number`, not `string` as design.md assumed — `round2()` in the route returns a plain JS number and `NextResponse.json` serializes it as a JSON number, never a Decimal-as-string.

## Phase 2: Threshold default (D-FIN1)

- [x] 2.1 RED: update the existing default-threshold test covering `UMBRALES_SEMAFORO_DEFAULT` to expect verde `[0.80, 1.05]`, amarillo `[0.60, 0.79] ∪ [1.06, 1.20]`. Confirm failing against current defaults (85/115/60/140).
- [x] 2.2 GREEN: update `UMBRALES_SEMAFORO_DEFAULT` in `src/lib/catalogs.ts` to the v6 values. Confirm passing. Run the full semáforo test suite to confirm no regression in the bidirectional logic itself (only the constants changed).

  **Deviation:** `src/lib/semaforo.test.ts` needed no change — it exercises `colorFinanciero`/`colorTecnico` against a local `UMBRALES` test fixture, never `UMBRALES_SEMAFORO_DEFAULT` directly, so the D-FIN1 constant change doesn't touch it. Confirmed the `dashboard/projects/route.test.ts` "razón 0.6 -> amarillo" default-org test exercises `color_tecnico` (unchanged by D-FIN1, which only touches `financiero`), so it also needed no change.

## Phase 3: Component (`financiero-tab.tsx`)

- [x] 3.1 RED: `financiero-tab.test.tsx` — loading state renders "Cargando…"; empty state (`rubros: []`) renders the empty message; populated state renders one row per rubro with assertions tying each row's color to its `color_financiero` value (not recomputed client-side); total gauge/chip reflects `color_financiero_total`. Mock `useBudget` via `vi.mock`+`vi.hoisted`, same pattern as `cronograma-tab.test.tsx`. Confirm failing (component doesn't exist yet).
- [x] 3.2 GREEN: implement `tabs/financiero-tab.tsx` — gauge, chip+legend, rubro table (`overflow-x-auto` wrapper), alert card with static per-color copy. Confirm all tests passing.
- [x] 3.3 Manual check: interactive surface in this tab is display-only (no inputs/buttons — read-only per proposal.md's Scope); the rubro table wrapper is `overflow-x-auto` with `min-w-[560px]` on the `<table>`, same horizontal-scroll convention as `cronograma-tab`'s activity list, verified via the `financiero-tabla-scroll` test asserting `overflow-x-auto`. No dev-server visual check was run against a live 390px viewport in this session — flagged below as a follow-up, not blocking (no touch controls exist to violate the 44px target).

## Phase 4: Wire into the workspace

- [x] 4.1 RED: extend `project-workspace.test.tsx` — assert `"financiero"` appears in the tab list, `FinancieroTab` mounts only when `?tab=financiero`, does not mount when another tab is active (mirror the existing per-tab mount assertions for cronograma/gantt/indicadores). Confirm failing.
- [x] 4.2 GREEN: add `"financiero"` to `TAB_VALUES`, add `TabsTrigger`/`TabsContent` in `project-workspace.tsx`. Confirm passing.

## Phase 5: Full verification

- [x] 5.1 `npx tsc --noEmit` — 0 errors.
- [x] 5.2 `npx eslint .` (or scoped to touched paths) — 0 problems in the diff.
- [x] 5.3 `npm run test` (full suite) — all green, no regressions outside this change (160 files / 1473 tests passed).
- [x] 5.4 Commit as one or more Conventional Commits on `local/todo-integrado` (no push — gh auth still broken). No AI attribution per CLAUDE.md.
- [x] 5.5 Update this file's checkboxes and `odd/tasks/muttu-hub-v6-f0-f1.md`'s F1.1 line with evidence.
