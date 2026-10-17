# Importar presupuesto con la plantilla de la PO

Feature for after the v2 launch. Branch `feat/po-presupuesto-import`, worktree
`MuttuHub-CRM-worktrees/po-presupuesto`. It is not merged until v2 is in production.

## Objective

Let a manager load a project's budget from the PO's simple Excel (`rubro | valor (COP)`) instead of typing each
rubro by hand.

## Problem and why

The PO sent `presupuesto.xlsx` with the 15 rubros and a value column, and she wants to use it as is. The current
importer only accepts the full 2026.1 template (9 sheets, structure + budget + programming at once, V-12/V-13).
Decisions T4 and T6 from `lanzamiento-v2-fin-de-semana.md` (2026-10-17) apply:
- T4: the file carries only rubro and value; the monthly programming is done in the UI.
- T6: no codes typed by the PO; rubros are matched by normalized name.

## Scope

- **In:**
  - parse the PO format;
  - match rubros by normalized name (case, accents, stray symbols such as the `}` in `valor (COP)}`);
  - preview, which is validate-only;
  - apply: set each rubro's assigned amount on the project;
  - a downloadable blank template in the PO format with the active rubros;
  - a UI entry point in Finanzas → Presupuesto.
- **Out:**
  - the project structure adapter (objectives and activities), which is the next feature;
  - per-project custom or disabled rubros, pending answers from the PO;
  - monthly programming in Excel.

## Constraints

- BORRADOR only, through the existing budget write gate (`gatePresupuestoWrite`) and `lockProyectoBorrador`. Same
  roles as editing the budget by hand.
- Reuse the budget domain code (`src/lib/api/presupuesto.ts`, `parseMonto`, money in bigint cents) and the import
  hardening (`.xlsx` only, size cap, zip guard `inspeccionarZip`).
- Amounts accept es-CO text (`1.500.000,50`) or numeric cells. Empty means 0. Negative or invalid values are an error
  on that row.
- An unknown rubro name is an error on that row. A catalog rubro missing from the file keeps 0.
- The sum does NOT have to equal `valor_total` at import time. The UI shows a warning with the difference, and the
  baseline approval keeps enforcing it.
- Existing monthly programming is untouched. If a rubro's new amount no longer matches its programming, the UI shows
  it as pending, as it does today for manual edits.
- One transaction, with an audit entry for each changed line, the same as manual budget edits.
- No migration. No schema change.

## Tasks

- [x] **P1** Parser and matcher (pure, test-first): read the workbook and return rows `{ fila, rubroTexto,
  rubroId | null, cents | null, error | null }` plus the file-level errors (missing sheet or headers).
  Commit `2e436ac`. Route: delegated writer. RED: `vitest run src/lib/proyectos/presupuesto-po/parse.test.ts` failed
  to resolve `./parse` (no tests ran). GREEN: 17/17 passed. `tsc`: no error in the P1 files; `eslint`: clean.
- [x] **P2** API: validate and apply endpoint for the project budget import, plus a GET for the blank template. Route
  tests cover roles, state, file guards, preview and apply, and the audit entries.
  Commit `19fa1b6`. Route: delegated writer. `POST /api/v1/projects/:id/budget/import` and
  `GET /api/v1/projects/:id/budget/template`, registered in `src/lib/openapi/paths/project-budget.ts`. RED: the 4 new test
  files failed to resolve `./preview`, `./template` and `./route` (no tests ran). GREEN: `presupuesto-po` + `budget`
  routes 5 files / 42 tests passed, plus the existing budget route 23/23 rerun alone (a worker-start timeout in the
  combined run, not a test failure) and `src/lib/openapi` 27/27. `tsc`: no error outside the P3 drafts; `eslint`: clean.
- [ ] **P3** UI: «Importar presupuesto» in Finanzas → Presupuesto (BORRADOR, managers only), with the dialog flow
  choose → validate → preview table with the differences and the warning → confirm, and «Descargar plantilla».
- [ ] **P4** Verification: the full suites of the touched areas, `tsc` and `eslint`, plus a manual check with the
  PO's real `presupuesto.xlsx`, once filled with values, on a local BORRADOR project.

Each task: RED, then GREEN, then a work-unit commit, then evidence recorded here.

## Acceptance

- The PO's `presupuesto.xlsx`, filled with values, imports without edits, `Viaticos` without an accent included.
- The preview shows each rubro with its current and new amount and the sum against `valor_total`.
- Apply changes only the assigned amounts and writes audit entries.
- Non-BORRADOR projects and non-manager roles are refused.

## Progress

- 2026-10-17: document created; worktree from `feat/projects-v2` at `c6bd644`.
- Route: delegated direct, one writer, because of the 2+ non-trivial files trigger.

## Decisions taken while implementing

- The import covers every ACTIVE rubro, like the manual `PUT /budget`: an active rubro missing from the file goes to
  $0 (the preview shows it). Suspended rubros never match, so their lines stay as they are.
- A null `valor_total` takes the sum on apply (N-17), exactly as the manual edit does.
- Matching also accepts the rubro code (`R10`), and a `Total` row is skipped. Up to 100 data rows.
- The PUT route and `src/lib/api/presupuesto.ts` are outside this feature's edit surface, so the writer
  `src/lib/proyectos/presupuesto-po/server.ts` mirrors the PUT write instead of sharing it. Follow-up: extract a shared
  writer once the surface allows it.

## Next step

P3.
