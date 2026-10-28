# Import the project structure from the PO workbook (B3)

Objective: load a draft project's objetivos, indicadores, actividades and entregables from the PO's `proyecto.xlsx`,
with system-generated codes and a preview that lists the errors, keeping the existing budget. Branch
`feat/po-structure-import` from `main` (`51c957a`). Delivery: one PR with work-unit commits (module exception, as B7/B8;
forecast ~900 authored lines). Test runner: `npx vitest run`. Mirror: Engram `odd/importar-estructura-po/tasks`.

## Specs

- **S1 — Plan row B3, verbatim.** «Adaptador de **estructura** de la PO (objetivos, actividades, entregables con
  cantidad/unidad/medio)» — done when «Importar `proyecto.xlsx` crea O/A/E con códigos generados y la vista previa lista
  los errores».
- **S2 — PO format (real `proyecto.xlsx`, read 2026-10-28).** Two sheet kinds, recognized by their header row:
  - indicators: «Objetivo especifico | Resultados (indicador) | Resultados (meta)» (sheets `Modelo0`, `Ejemplo0`);
  - activities: «Objetivo especifico | Actividad | Entregables | Inicio (semana) | Fin (semana)» (sheets `Modelo1`,
    `Ejemplo1`).
  The objetivo and actividad text repeats on every row. **Assumption:** headers are matched by normalized text (case,
  accents, spacing), the extra T1 columns «Cantidad» and «Unidad» may sit anywhere in the row, and for each kind exactly
  one sheet may carry data rows (the real file has empty `Modelo*` and filled `Ejemplo*`); two filled sheets of one
  kind is an error. The activities sheet is required (without it there is no O/A/E); the indicators sheet is optional.
- **S3 — Rows and grouping (T2, verbatim).** «**Una fila por entregable**. Las filas con la misma actividad, dentro del
  mismo objetivo, se agrupan en una actividad con N entregables». **Assumption:** objetivos and actividades are
  identified by normalized text; objetivos are the union of both sheets in order of first appearance (indicators sheet
  first); an actividad's weeks are the minimum «Inicio» and maximum «Fin» of its rows, blank cells allowed as long as
  the actividad ends up with both.
- **S4 — Codes (T6, verbatim).** «Los códigos (O1, A1.1, E1.1.1, IND-01) los **genera el sistema**». Objetivos O{n},
  actividades A{o}.{n}, entregables E{o}.{a}.{n}, indicadores IND-{nn}, numbered in order of appearance.
- **S5 — Entregable fields (T1, verbatim, as narrowed by the PO on 2026-10-23).** T1: «La plantilla del proyecto agrega
  columnas separadas para **cantidad**, **unidad** y **medio de verificación** de cada entregable; no se interpreta
  texto libre». PO 2026-10-23 (PR #88): «No solicitar en las plantillas: Entregables: Tipo de medio exigido /
  Indicadores: Unidad». So «Cantidad» (positive number) and «Unidad» are required per entregable; the medio and the
  indicator unit are stored empty, as the template importer does. The quantity is never parsed out of the text.
- **S6 — Structure only (D-A, verbatim).** «modo "solo estructura" que conserva el presupuesto existente». T5: «Los datos
  del proyecto (cliente, fechas, valor total) se cargan en el stepper; el Excel solo trae la estructura y el
  presupuesto». The import replaces the live structure (objetivos, actividades, entregables, indicadores) and never
  touches the budget, the programming or the project fields. Same gates as the template import: BORRADOR only, roles of
  `gateEstructuraWrite`, refused when the project already has avances, mediciones or beneficiarios.
- **S7 — Validation and preview.** Validate-only mode returns the plan (counts and the O/A/E/IND rows with their
  generated codes) or every row error with sheet, row, column and message; confirm writes only a file with no errors,
  in one transaction with one audit `lote_id`. Rules: indicator «meta» positive number; entregable «Cantidad» positive
  number and «Unidad» present; actividad weeks whole numbers, inicio ≤ fin, inside the project duration when it has
  dates; every text within the existing column limits; same size and row limits as the template import.
- **S8 — UI and docs.** The Estructura tab of a draft offers «Importar estructura (formato PO)» with validate → preview →
  confirm, like the B2 budget dialog. OpenAPI for the new endpoint, the user guide and plan row B3.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S3, S4, S5, S7 (pure parse, grouping, codes, row errors) | inline | done (RED: module missing → GREEN 14 tests) | see git log (unit 1) |
| T2 | S6, S7 (writer + `POST /projects/{id}/structure/import`) | inline | done (RED: route missing → GREEN 12 tests; differential trace identical) | see git log (unit 2) |
| T3 | S8 (dialog + hook) | inline | done (RED → GREEN: 5 dialog + 4 mount tests) | see git log (unit 3) |
| T4 | S8 (OpenAPI, guide, plan row) | inline | done (RED → GREEN OpenAPI test; guides §A.4 and Paso 2; plan row B3) | see git log (unit 4) |

Route evidence: units depend on each other (T2 on T1, T3 on T2), so no Writer trigger; the parent writes inline.
Risk: item 1 for T2 (the import soft-deletes the live structure of a draft) → independent verifier at the feature's end.

## Log

- **L1 (2026-10-28, user, verbatim):** «arranca el b3 y luego b6, que crees?» → file: «"C:\Users\Adrian\Downloads\proyecto.xlsx"».
- **L2 (2026-10-28):** Map. No code generator exists; codes are always typed. `Entregable.cantidad_meta`, `unidad`,
  `tipo_medio_exigido`, `Actividad.semana_*` and `Indicador.unidad` are NOT NULL (`""` allowed for strings, PR #88).
  `importarPlantilla` (`plantilla-import.ts:351`) always rewrites project fields, budget and programming, so B3 needs
  a structure-only writer. B2 (`presupuesto-po/`) is the pattern: own pure parser, preview and writer. The real file
  lacks «Cantidad» and «Unidad» columns, so it will not import as is; B4 delivers the template with them.
- **L3 (2026-10-28):** T1 `src/lib/proyectos/estructura-po/parse.ts` (reuses `normalizarTexto`/`leerCelda`/`vacio` from
  B2, `validarSemanas`, and `decimalDeCelda`/`enteroDeCelda`/`redondear2`, now exported from `plantilla/validate.ts`
  with no behavior change). Probe with the real file: as is → only the two missing-column errors («Cantidad»,
  «Unidad»); with both columns added → 3 objetivos, 4 indicadores, 12 actividades, 15 entregables, 0 errors.
  `src/lib/proyectos` + template import suites 554/554, `tsc` and `eslint` clean.
- **L4 (2026-10-28):** T2. `importarPlantilla`'s history guard, soft-delete and structure creation became
  `exigirSinHistorial`, `borrarEstructura` and `crearEstructura` (`plantilla-import.ts`), reused by the new
  `importarEstructuraPO` (`src/lib/api/estructura-po-import.ts`). Differential check: a recording fake transaction
  run against `importarPlantilla` at `HEAD` and after the refactor gave identical traces (24 DB calls, the same audit
  lote and result); the template route test mocks the writer, so this was the only non-DB proof. Route
  `POST /projects/{id}/structure/import`: 12 tests (gates 404/403/409, member COORDINADOR allowed, 413/400 guards, 400
  report, weeks bounded by the project dates, preview with codes and `reemplaza`, structure-only apply with one lote,
  budget/programming/project never touched, history 409, BORRADOR re-checked under the lock). `src/lib/api`,
  `src/app/api/v1/projects`, `src/lib/proyectos`: 1453/1453; `tsc`, `eslint` clean. Not run: `prisma/*.invariant`.
- **L5 (2026-10-28):** Native review of T1+T2 (`51c957a..6f4bbc3`, escalated item 1, lenses risk + reliability, user
  granted) approved and acknowledged. Its two advisories were fixed in `80fa303`: a committed test pins
  `importarPlantilla`'s write order and audit lote (it passes against the writer before and after the refactor), and
  the parser's 500-error cut and «demasiado alta» bound are tested.
- **L6 (2026-10-28):** T3. `useImportStructurePO` (`src/hooks/projects.ts`) and `EstructuraPOImportDialog`: validate →
  preview as the O/IND/A/E tree with generated codes, weeks, quantity and unit, plus «Reemplaza la estructura actual
  (…). El presupuesto no cambia.» → confirm; 400 errors listed by sheet and cell. Mounted in the Estructura header
  under the same `canEdit` as the template import, also on an empty draft. `src/components/proyectos` + `src/hooks`
  934/934; `tsc`, `eslint` clean.
- **L7 (2026-10-28):** T4. OpenAPI `POST /projects/{id}/structure/import` (`paths/project-structure-import.ts`: multipart
  body, 200 preview/applied, 400 with `reporte`, 401/403/404/409/413/500); test guide §A.4 with the real PO file's
  expected results; user guide Paso 2 and §10; plan row B3 marked done. OpenAPI suite 28/28.
- **L8 (2026-10-28):** Feature-end independent verifier (Risk item 1): S1–S8 PASS, no blockers. Confirmed by reading:
  structure-only writes, one transaction, row lock + history guard, `importarPlantilla` call order unchanged after the
  refactor, and no budget/programming foreign key to the structure tables (a structure replace orphans nothing). Probes
  (scratch copy, removed): normalized objetivo merge, an actividad re-appearing after another, conflicting weeks → min/max
  with V-07 on the aggregate, indicator-only objetivo numbered first, header on row 11 → `SIN_ACTIVIDADES`, formula
  cells, Date/decimal weeks rejected. Parent spot check: route test 12/12. Advisories (not fixed): dates read before the
  lock (same shape as the template import); a duplicated required header silently takes the first column; merged-cell
  slaves read as empty (shared `leerCelda`).
- **L9 (2026-10-28):** Native review of the whole branch (`51c957a..43437d5`, lenses risk + reliability, user granted)
  approved and acknowledged. One non-blocking suggestion: a row skipped for another error (e.g. missing Cantidad) does
  not feed its weeks into the grouped actividad, so the actividad can also get a secondary «no tiene semana de inicio»
  error; it disappears once the row is fixed. Next: user decides push and PR.
