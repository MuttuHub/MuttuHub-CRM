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

## Tasks

Route: delegated writer per round (round 1: U1-U2, round 2: U3-U4, round 3: U5, round 4: U6, round 5: U7).

- [ ] **U1** Columns + generator (~380): `src/lib/proyectos/plantilla/columns.ts`, `generate.ts`, fixture
  `__fixtures__/plantilla-cedetextil.ts` (F-X1 builder, valid and V-12-failing variants). RED: nine sheets with the
  exact names/order, B2 version, prefilled code/client, 15 rubros, `Mes k (AAAA-MM)` columns, named ranges + data
  validation surviving a reload, `9. Catálogos` protected, every formula carrying `result`.
- [ ] **U2** Parser (~320): reads every sheet into cells with hoja/fila/columna, formula values via `.result`,
  Colombian numbers, dates (Date / `DD/MM/AAAA` / ISO), `;` lists keeping order, round-trip
  `parsePlantilla(await generarPlantilla(x))` equals input, garbage buffer throws `PlantillaIlegible`, row cap.
- [ ] **U3** Validators V-01..V-07 + V-H1 (~380): one `describe` per rule with a passing and a failing fixture.
- [ ] **U4** Validators V-08..V-14 + W-01 + `validarPlantilla` + `construirPlan` (~400): V-12 to the cent, ordering,
  500-error truncation, multi-error reporting; `construirPlan` of the valid F-X1 yields 1/4/7 with weights 1/1/1/4.
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

## Next step

Round 1: U1 (columns + generator + F-X1 fixture), then U2 (parser + round-trip).
