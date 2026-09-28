# Tasks: proyecto-legalizacion-tab — Pestaña Legalización + registro de gasto

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-800 (migration ~30, API route changes ~120, hooks ~80, legalizacion-tab ~180, expense-dialog ~150, tests ~350-400) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (migration + API: tercero/comprobante/observado + estado_legalizacion derivation, deployable no-op without UI) → PR 2 (legalizacion-tab + expense-dialog + workspace wiring) |
| Delivery strategy | ask-on-risk (user-confirmed) |
| Chain strategy | pending — orchestrator must ask the user (stacked-to-main vs feature-branch-chain vs size-exception) before apply |

Decision needed before apply: Yes.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary |
|------|------|-----------|----------------------|--------------------|
| 1 | Migration + `Gasto` schema fields | PR 1 | `npx prisma migrate dev` (local) | Additive columns only; drop is safe, no data loss |
| 2 | API: `EXPENSE_SCHEMA`/`EXPENSE_SELECT`/`EXPENSE_PATCH_SCHEMA` + `estadoLegalizacion()` derivation | PR 1 | `npx vitest run src/app/api/v1/projects/[id]/expenses/route.test.ts src/app/api/v1/projects/[id]/expenses/[expenseId]/route.test.ts` | Revert route files; migration stays (additive, harmless if unused) |
| 3 | `useExpenses`/`useCreateExpense` hooks | PR 2 | `npx vitest run src/hooks/projects.test.ts` | Delete hooks, no other file touched |
| 4 | `legalizacion-tab.tsx` + `expense-dialog.tsx` + workspace wiring | PR 2 | `npx vitest run src/components/proyectos/tabs/legalizacion-tab.test.tsx src/components/proyectos/expense-dialog.test.tsx src/components/proyectos/project-workspace.test.tsx` | Revert new components + tab registration |

## Phase 1: Migration + schema

- [x] 1.1 Add `tercero String?`, `numero_comprobante String?`, `observado Boolean @default(false)`, `observacion String?` to `Gasto` in `prisma/schema.prisma`.
- [x] 1.2 Run `npx prisma migrate dev --name legalizacion_gasto` against the local DB (per this repo's `.env.local` rule — never against the shared/remote `.env`). Confirm the generated SQL is purely additive (`ADD COLUMN`, no `DROP`/`ALTER ... NOT NULL` on existing rows). **Deviation (2026-09-28):** local `supabase_db` container was down (Exited 127) and Windows-side `npx` does not inherit WSL env (prisma.config.ts fell back to the remote `.env`). SQL generated offline via `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script` into `prisma/migrations/20260928120000_legalizacion_gasto/` — purely additive. Not yet applied to any DB.
- [x] 1.3 `npx prisma generate` to refresh the client types.

## Phase 2: API — fields + derived state

- [x] 2.1 RED: extend `expenses/route.test.ts` — POST accepts/persists `tercero`/`numero_comprobante`; GET response includes `estado_legalizacion` computed as `falta_soporte` (no soportes), `con_soporte` (≥1 `SoporteProyecto` `tipo: LEGALIZACION`), `observado` (when `observado: true`, regardless of soportes). Confirm failing.
- [x] 2.2 GREEN: update `EXPENSE_SCHEMA`, `EXPENSE_SELECT` (+ soporte count), add the `estadoLegalizacion()` helper (design.md's Data Model section), wire it into the GET/POST response shape.
- [x] 2.3 RED: extend `expenses/[expenseId]/route.test.ts` — PATCH accepts `observado`/`observacion`/`tercero`/`numero_comprobante`; write-permission gating unchanged. Confirm failing.
- [x] 2.4 GREEN: update `EXPENSE_PATCH_SCHEMA` and the PATCH handler's `data` assembly. Confirm passing.

## Phase 3: Client hooks

- [x] 3.1 RED: `src/hooks/projects.ts`'s test file — `useExpenses(projectId)` query key shape, `enabled` guard, response shape matches the REAL route (read `expenses/route.ts`'s actual response before writing the hook — do not assume an envelope key, F1.1 already found one route without one). `useCreateExpense(projectId)` mutation shape. Confirm failing.
- [x] 3.2 GREEN: implement both hooks. Confirm passing.

## Phase 4: UI

- [x] 4.1 RED: `legalizacion-tab.test.tsx` — loading/empty/populated states; 3 KPI cards; filter chips (Todos/Sin soporte/Observados) filter the rendered rows by `estado_legalizacion`; observed rows get a distinct visual tint (assert via class/attribute, not just visual). Confirm failing. **Evidence:** failed with "Failed to resolve import './legalizacion-tab'" (component didn't exist yet) — 0/10 tests ran.
- [x] 4.2 GREEN: implement `tabs/legalizacion-tab.tsx` (`overflow-x-auto` ledger table, per repo convention). Confirm passing. **Evidence:** `npx vitest run src/components/proyectos/tabs/legalizacion-tab.test.tsx` → 10/10 passed.
- [x] 4.3 RED: `expense-dialog.test.tsx` — required field (Rubro) validation; "ahora"/"después" branch; on "ahora" with a valid https link, asserts the create-gasto mutation is called, then the attachments creation call, in that order; on the second call failing, asserts the dialog surfaces an error without claiming the whole operation failed (the gasto already exists). Confirm failing. **Evidence:** 5/5 failed against a placeholder `ExpenseDialog` stub (needed so `legalizacion-tab.tsx` had something importable for 4.1/4.2 — see file header comment) — `getByLabelText` found none of the form fields.
- [x] 4.4 GREEN: implement `expense-dialog.tsx`. Confirm passing. **Evidence:** `npx vitest run src/components/proyectos/expense-dialog.test.tsx` → 5/5 passed (one fix needed mid-GREEN: added `noValidate` to the `<form>` — native HTML5 `required`/`type="url"` constraint validation was silently blocking `onSubmit`, so custom validation errors never surfaced; documented inline).
- [x] 4.5 RED: extend `project-workspace.test.tsx` for the `"legalizacion"` tab (mount-only-when-selected, mirrors existing per-tab assertions). Confirm failing. **Evidence:** 2/12 failed (`getByTestId("legalizacion-tab")` / `getByRole("tab", { name: "Legalización" })` not found), 10/12 passed (unrelated existing tests).
- [x] 4.6 GREEN: add `"legalizacion"` to `TAB_VALUES`, `TabsTrigger`, `TabsContent` in `project-workspace.tsx`. Confirm passing. **Evidence:** `npx vitest run src/components/proyectos/project-workspace.test.tsx` → 12/12 passed.
- [x] 4.7 Manual check: inputs ≥16px, touch targets ≥44px, ledger table scrolls horizontally without breaking amounts at 390px. **Evidence:** `expense-dialog.tsx` inputs/selects use `text-base` (Input/select base class, 16px) and `min-h-11` (44px); filter chips and the "Registrar gasto" CTA use `min-h-11`; the ledger table is wrapped in `overflow-x-auto` with `min-w-[860px]` (same pattern as `financiero-tab.tsx`'s `financiero-tabla-scroll`), so amounts/chips never wrap at 390px — they scroll horizontally instead. No live-browser screenshot taken (out of scope per task instructions — no dev server driven).

## Phase 5: Full verification

- [ ] 5.1 `npx tsc --noEmit` — 0 errors.
- [ ] 5.2 `npx eslint .` (or scoped to touched paths) — 0 problems in the diff.
- [ ] 5.3 `npm run test` (full suite) — all green, no regressions.
- [ ] 5.4 Commit as Conventional Commits on `local/todo-integrado` (no push — gh auth still broken). No AI attribution.
- [ ] 5.5 Update this file's checkboxes and `odd/tasks/muttu-hub-v6-f0-f1.md`'s F1.2 line with evidence.
