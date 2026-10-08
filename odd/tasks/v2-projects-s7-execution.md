# Muttu Hub v2 — S7 Excel template: generate and import (RF-03, RF-04, XLS §3.10, SDD §4.10/§5.8)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§4.10, §5.8), ledger `odd/tasks/v2-projects-execution.md`, verified
mapping `odd/tasks/v2-projects-s7-map.md` (read it: it holds the 9-sheet layout, the V-rule table, the route table
and the per-unit RED detail). Branch: `feat/projects-v2`.

## Objective

An ADM/GER user downloads the official Excel template for a project that already has start/end dates, fills its nine
sheets, and imports the workbook to replace the project's structure (objetivos, actividades, entregables,
indicadores), budget, monthly programming, dates, líneas and municipios in one atomic operation — reporting per-rule
validation errors instead of writing anything partially.

## Decisions (defaults from the map §8; revisit with PO feedback)

- D-1 Template download requires project dates (409 otherwise).
- D-2 Import only while `BORRADOR`, ADM/GER only; a re-import replaces structure + budget + programming + dates +
  líneas + municipios entirely (S7.6 is the same code path, not a separate feature).
- D-3 An unknown `Responsable (correo)` is warning W-01, not blocking.
- D-4 The download writes an `EXPORTAR` audit row (best-effort).
- D-5 The error report is downloaded as CSV built client-side; `exceljs` never enters the browser bundle.
- D-6 Import cap 4 MB (Vercel multipart limit, not the SDD's stale 25 MB); the file is not stored.
- D-7 Lines are matched by `codigo`; municipios by `Nombre (Departamento)` / DANE code.
- D-8 `Cliente` and `Rubro` name columns are informative and ignored on import.
- D-9 Empty `Peso` means the default duration; non-empty sets `peso_manual = true` (DP-08).
- D-10 The pilot uses the synthetic F-X1 (CedeTextil structural example, illustrative figures, N-22).
- D-11 **Takeover boundary (recorded)**: the branch arrived at S7 with 118 commits and no native review ever
  acknowledged. That history is explicit inherited debt; the review boundary for slices produced from here is
  `1432907` (the S6 tip). Anything before it stays unreviewed by decision, not by accident.

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Per-unit gates: focused vitest, `npx tsc --noEmit`, eslint on touched files; one commit per unit.
- `exceljs@^4.4.0` and `jszip@^3.10.1` are already dependencies — do not add or bump anything.
- `exceljs` is Node-only: never import it from a `"use client"` file.
- **Native review is unavailable in this runtime (recorded)**: RDD is on (global), but
  `gentle-ai review assess --committed-only --base-ref <boundary>` returns
  `risk: "high"` / `reason: unassessable` — "the active runtime is not eligible for immutable receipt review", and
  only `claude-code` and `codex` are supported. This is a typed capability boundary, not a defect. Per the parent
  contract, a high/unassessable tier is verified by writer self-verification **plus an independent verifier**; that
  substitute ran for round 1 (see Progress). Do not disable RDD from here: the switch is the user's.

## Tasks

Route: delegated writer per round (round 1: U1-U2, round 2: U3-U4, round 3: U5, round 4: U6, round 5: U7).

- [x] **U1** Columns + generator (~380): `src/lib/proyectos/plantilla/columns.ts`, `generate.ts`, fixture
  `__fixtures__/plantilla-cedetextil.ts` (F-X1 builder, valid and V-12-failing variants). RED: nine sheets with the
  exact names/order, B2 version, prefilled code/client, 15 rubros, `Mes k (AAAA-MM)` columns, named ranges + data
  validation surviving a reload, `9. Catálogos` protected, every formula carrying `result`. (ae2881d)
- [x] **U2** Parser (`src/lib/proyectos/plantilla/parse.ts`): reads every sheet into cells with hoja/fila/columna,
  formula values via `.result`, Colombian numbers, dates (Date / `DD/MM/AAAA` / ISO), `;` lists keeping order,
  round-trip `parsePlantilla(await generarPlantilla(x))` equals input, garbage buffer throws `PlantillaIlegible`,
  row cap. (bf7bcd6; round-trip assertions strengthened and the empty-catalog range guarded in 6f8b6a3)
- [x] **U3** Validators V-01..V-07 + V-H1 (`src/lib/proyectos/plantilla/validate.ts`): one `describe` per rule with a
  passing and a failing fixture. (90d7776)
- [x] **U4** Validators V-08..V-14 + W-01 + `validarPlantilla` + `construirPlan` (`src/lib/proyectos/plantilla/mapear.ts`):
  V-12 to the cent, ordering, 500-error truncation, multi-error reporting; `construirPlan` of the valid F-X1 yields
  1/4/7 with weights 1/1/1/4. (5b9b9bb; the V-H2 guards and the non-finite-cell crash were closed in 4b6c565)
- [ ] **U5** Template route + import route + atomic write (~400): 404/403/409/413/400 ordering, dry run writes
  nothing, apply calls the writer once; live-DB `prisma/plantilla-import.invariant.test.ts` proving the import counts,
  the V-12 failure writing nothing, and the **atomic rollback** after an injected mid-write failure.
- [ ] **U6** UI + hooks + OpenAPI (~350): `import-dialog.tsx` mounted in the Estructura header, validate → summary,
  error table grouped by sheet, confirm, client-side CSV report, hooks, stubs in the list/ficha tests,
  `paths/project-template.ts`.
- [ ] **U7** (S7.7) local pilot (~150): `scripts/import-plantilla-demo.ts` (anti-production guard, generates both
  variants, imports the valid one into a local BORRADOR project).

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; eslint clean on touched files; full vitest
  green under `TZ=America/Bogota` (known load-flakes recorded honestly).
- The import is atomic: a failing workbook leaves the previous draft byte-identical, with no audit rows for the lote.

## Progress

- 2026-10-08 (14:55): document created at takeover, from the map the previous session left uncommitted (it stopped
  right after the mapping: no S7 execution document and no S7 code existed). The map and this document are committed
  together. `exceljs`/`jszip` verified present; no S7 file existed yet.
- 2026-10-08 (14:51) inherited state: S4, S5 and S6 are closed locally with 78 commits unpushed, no PR, and no native
  review acknowledged anywhere in the branch (see D-11).

- 2026-10-08 (15:30): round 1 (U1-U2) by one bounded writer, plus one scoped correction.
  - U1 (ae2881d): `plantilla/columns.ts` (9 sheets, headers, caps), `plantilla/generate.ts` (`generarPlantilla`),
    `__fixtures__/plantilla-cedetextil.ts` (F-X1 valid 177.360.000 and V-12 177.410.000). RED: missing modules, then
    GREEN. 19 tests.
  - U2 (bf7bcd6): `plantilla/parse.ts` (`parsePlantilla`, `parseNumeroColombiano`, `parseFechaCelda`,
    `PlantillaIlegible`) + the round-trip. RED: missing module; one genuine inner RED (`"1.440.000,50"` parsed as
    `"1.440.000.50"` until the dot-grouping branch stripped the thousands dots). 17 tests.
  - Gates: focused vitest 4 files / 36 tests green; `tsc --noEmit` clean; eslint clean on touched files. Parent spot
    check re-ran the focused command: 36 green.
  - **Native review (RDD) could not run**: `gentle-ai review assess --base-ref 1432907 --committed-only --json`
    returned `risk: "high"`, `review_due: true`, `review_due_reason: "high_risk"` with
    `unassessable — the active runtime is not eligible for immutable receipt review` (only `claude-code` and `codex`
    qualify). Recorded as a typed unavailability; RDD was NOT disabled and no PASS was invented.
  - **Independent verification** (the contract's substitute for a high/unassessable tier) found: (a) minor — the
    round-trip test asserted only counts/budget/programming, so a silently dropped actividad/entregable/indicador
    field would have stayed green; (b) advisory — `ref()` wrote a reversed defined name (`$C$2:$C$1`, normalized by
    ExcelJS to `$C$1:$C$2`, wrongly including the header) when a catalog list was empty; plus three notes
    (`1e5` -> `"15"`, the generator trusts the caller for the 15 rubros, and the map's "7 entregables of F-T1"
    cross-reference is loose — the golden F-T1 fixture has 8 entregables and no `unidad` column).
  - Scoped correction (6f8b6a3): the round-trip test now asserts every parsed field of F-X1 (with observed sabotage
    RED evidence), and `ref()` clamps to `$C$2` so an empty catalog never emits an invalid range (+2 tests, 38 total).
    Parent spot check: 4 files / 38 tests green, no trace of the sabotage left in the source.
- Inherited debt carried into this feature (D-11): the branch reached S7 with 118 commits vs `main` (78 unpushed) and
  no native review acknowledged anywhere. With S7 rounds 1-2 the branch is at 127 commits vs `main` / 87 unpushed, all
  of it local. Nothing is lost: every unit is committed and the worktree is clean.

- 2026-10-08 (16:35): round 2 (U3-U4) by one bounded writer, plus one scoped correction.
  - U3 (90d7776): `plantilla/validate.ts` with `ContextoValidacion`, `ErrorPlantilla` and `v01`..`v07`, `vH1`; the
    F-X1 validation context added to the existing fixture. RED: missing module, then GREEN. 22 tests.
  - U4 (5b9b9bb): `v08`..`v14`, `w01`, `validarPlantilla` (ordering by sheet/row/column, `MAX_ERRORES` cap and
    `truncado`, `resumen` counted before the cap) and `plantilla/mapear.ts` with `PlanImportacion` +
    `construirPlan`. RED: missing functions/module. GREEN: 48 tests (42 + 6).
  - Gates: `src/lib/proyectos/plantilla/` 5 files / 81 tests green; `tsc --noEmit` clean; eslint clean on touched
    files. Parent spot check: reproduces.
  - **Independent verification** (the substitute for the unavailable native review) found a real crash and a spec gap:
    (a) **major** — `validarPlantilla` THREW on numeric cells in scientific notation (`1e21`/`1e-7`) instead of
    reporting them, so a crafted workbook would have crashed the import route with a 500; (b) **major** — the V-H2
    guards required by map §3 line 57 were absent, and the row/month caps in `parse.ts` truncated silently, so an
    oversized workbook could validate "clean" while rows and columns were discarded; (c) **minor** — V-01's
    project-sheet check only inspected headers, letting a missing label row cascade into V-03; (d) **advisory** —
    column ordering used `localeCompare` (misorders `AA` after `Z`); (e) five test-coverage gaps that would have
    stayed green under sabotage.
  - Scoped correction (4b6c565): a plain-decimal guard closes every `toCents`/`BigInt` path, `vH2` reports the
    truncation and the Excel error cells (surfaced through `excesoFilas`/`excesoMeses` on `ParsedTemplate`), V-01 now
    gates the project sheet on its required labels, ordering uses the Excel column index, and the uncovered paths got
    assertions with sabotage RED evidence for each fix. Plantilla suite: **100 tests green**; `tsc`/eslint clean.
    Parent spot check: 5 files / 100 tests green, tree clean, no sabotage left.

## Next step

Round 3: U5 (template route + import route + the atomic writer, with the live-DB invariant proving the rollback).
