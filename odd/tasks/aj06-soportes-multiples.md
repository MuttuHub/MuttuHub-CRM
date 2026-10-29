# Several files and links per support, visible attach button (AJ-06)

Objective: let an avance (deliverable progress), a medición (indicator measurement) and a gasto (expense) each take
several files and links as soportes, with one consistent visible "Adjuntar archivo" control; add the "Enlace del
soporte" column (multi-link) to the expense import template. Branch `feat/aj06-soportes-multiples` from `main`
(`7712eca`). Delivery: one PR with work-unit commits. Test runner: `npx vitest run`. Mirror: Engram
`odd/aj06-soportes-multiples/tasks`. Source: PO document «Ajustes al módulo Proyectos» v1.1 (2026-10-28), orden
recomendado en `docs/plan-trabajo-restante.md:69` (AJ-06 antes que AJ-01).

## Specs

- **S1 — AJ-06, «Hoy», verbatim.** «Cada entregable admite un solo medio de verificación. En los gastos (pantalla e
  importación) no se pueden relacionar enlaces como soporte. El control para adjuntar se ve como texto plano y no como
  un botón.» **Correction from code reading:** this is only true of the *initial* registration form for avances and
  gastos. A gasto can already receive up to 5 soportes *after* creation via `AdjuntarSoporte`
  (`gasto-soportes.tsx`, PR #95) — multi-soporte on gastos is partially solved. Avances have no equivalent
  post-creation attach UI even though the API route already exists
  (`/api/v1/projects/[id]/progress/[progressId]/attachments`). Mediciones have neither the UI nor the API route.
- **S2 — AJ-06, «Debe quedar», verbatim.** «Cada registro de avance de un entregable y cada gasto admiten varios
  archivos y varios enlaces. Plantilla de gastos: columna "Enlace del soporte". Propuesto: varios enlaces en la misma
  celda, separados por punto y coma, y validación de que empiecen por http:// o https://. Propuesto: un gasto
  importado sin soporte queda Registrado y no se puede validar hasta que se le agregue un archivo o enlace. Botón
  visible "Adjuntar archivo" en soportes de gasto, medios de verificación, mediciones e importación. Al seleccionar se
  muestra el nombre del archivo y la opción de quitarlo.»
- **S3 — AJ-06, «Se acepta si», verbatim.** «Un entregable con 3 archivos y 1 enlace muestra los 4. Un gasto se puede
  guardar solo con un enlace de Drive. Una fila de la plantilla con dos enlaces crea un gasto con dos soportes.»
- **S4 — Nota, verbatim.** «Si una carpeta de Drive no está compartida con quien valida el gasto, el soporte existe en
  el Hub pero no se puede abrir.» No action needed — this is an operational caveat, not a requirement.
- **S5 — Already done (B8, pre-existing).** «un gasto importado sin soporte queda Registrado y no se puede validar
  hasta que se le agregue un archivo o enlace» is already enforced (`project-gastos.tsx`, `gastos-import-dialog.tsx`).
  No work needed for this bullet of S2.
- **S6 — Consistent wording (assumption).** The client's wording is "Adjuntar archivo" everywhere; the current gasto
  button says "Adjuntar soporte" (`gasto-soportes.tsx:58`). Unify on "Adjuntar archivo" across gasto, avance and
  medición, since AJ-06 names it as one visible control repeated in four places.
- **S7 — Filename + remove affordance (assumption from S2's last sentence).** Today, selecting a file in `gasto-form.tsx`
  (`type="file"`, line 344) and `gasto-soportes.tsx` relies on the browser's native file-input label; there is no
  custom "selected: <nombre> · Quitar" row. Add one wherever a file is chosen (creation forms and the generic attach
  control), consistent with "se muestra el nombre del archivo y la opción de quitarlo".

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S6, S7 (extract a generic `AdjuntarSoporte` attach-after-creation control, reusable by gasto/avance/medición; filename+remove affordance) | delegated (context backstop) | done | `fe08e8b` |
| T2 | S2, S3 (wire the generic control into the avance/entregable card; show every medio in the history, not just a count) | delegated (context backstop) | done | `71fa225` |
| T3 | S2, S3 (new attachments API routes — GET/POST/sign/download, mirroring `progress/[progressId]/attachments`; wire the generic control into `ejecucion-indicadores.tsx`) | delegated (context backstop) | done | `cd3a47e` |
| T4 | S6, S7 (rename gasto's button to "Adjuntar archivo", add the filename+remove row to `gasto-form.tsx`'s own file input) | delegated (parallel, disjoint surface) | done | `69afba1` |
| T5 | S2, S3 (import template: "Enlace del soporte" column, parse `;`-separated links validating `http(s)://`, create one `SoporteProyecto` per link on the created gasto) | delegated (parallel, disjoint surface) | done | `45fb30c` |
| T6 | Docs (OpenAPI for the new medición-attachments paths and the import column; user guide; test guide; flip AJ-06 to Hecho in `docs/plan-trabajo-restante.md`) | delegated (context backstop) | pending | |

Route evidence: T1 is used by T2, T3 and T4 (shared component), and T2/T3 both touch `src/hooks/projects.ts` to add
their mutation hooks — no parallel-writer reason, so every task goes to one bounded writer in sequence (context
backstop, same reasoning as the AJ-04/AJ-05 feature). Risk: none of T1–T5 touch a migration (the `medicion_id` FK on
`SoporteProyecto` already exists), auth, or a breaking contract change (the import column is optional, additive) →
no named high-risk item; writer self-verification plus the parent's final full-suite run is enough, no independent
verifier.

## Log

- **L1 (2026-10-29, user, verbatim):** after reviewing the six AJ items against the code and recommending the team's
  own documented order (AJ-06, then AJ-01 → AJ-02 → AJ-03, `docs/plan-trabajo-restante.md:69`) — user: «listo dale
  vamos con el plan».
- **L2 (2026-10-29):** Map. `SoporteProyecto` (`prisma/schema.prisma:951`) already has nullable `avance_id` /
  `medicion_id` / `gasto_id` — multi-support is already possible at the data layer for all three parents, no migration
  needed. `useAttachExpenseSupport` + `AdjuntarSoporte` (`gasto-soportes.tsx`) is the existing attach-after-creation
  pattern for gastos (max 5, `useAttachExpenseSupport`, hooks/projects.ts:1556). The equivalent API route for avances
  already exists (`progress/[progressId]/attachments/route.ts`) but no UI calls it after creation — `useCreateAvance`
  only attaches the one `medio` passed at creation time (hooks/projects.ts:1071-1107). No such route exists at all for
  mediciones (`MedicionForm` in `ejecucion-indicadores.tsx` has no medio field, no attach UI). No "Enlace del soporte"
  column exists in `src/lib/proyectos/plantilla/columns.ts`; the import parser (`src/lib/proyectos/gastos-import/`)
  does not read support links.
- **L3 (T1):** `src/components/proyectos/adjuntar-soporte.tsx` exports `AdjuntarArchivoControl`, parameterized by an
  `adjuntar` mutation of shape `{ mutate: (vars: { soporte: AvanceMedioInput }, opts) => void; isPending; isError;
  error }` — each caller (gasto today, avance/medición next) wraps its own mutation hook to fold in its own parent id
  before handing it to the control. Visible button text is fixed at "Adjuntar archivo"; only the accessible
  `ariaLabel` is caller-configurable. `gasto-soportes.tsx`'s `AdjuntarSoporte` now wraps it, keeping
  `MAX_SOPORTES_POR_GASTO`/`ADJUNTAR_ERROR`/`{projectId, gastoId}` unchanged for `project-gastos.tsx`. File clearing
  uses a ref (`<input type="file">` can't be reset via state alone) — the pattern T4 reuses for `gasto-form.tsx`'s own
  file input. `project-gastos.test.tsx` needed a text-only rename (6 assertions + 1 description) as a direct
  consequence of the S6 button rename; no production code outside the declared surface changed. RED→GREEN observed on
  the filename+Quitar row; parent spot check: `npx vitest run adjuntar-soporte.test.tsx gasto-soportes.test.tsx
  project-gastos.test.tsx` → 3 files / 56 tests green; `tsc --noEmit` clean. Risk: none (pure UI refactor, no
  data/auth/contract/concurrency change).
- **L4 (T4):** `gasto-form.tsx`'s own file input (the one-support-at-creation radio field, out of scope for T1) now
  shows the selected filename and a "Quitar" control (ref-reset, same pattern as T1) instead of the bare native input
  once a file is chosen. No button to rename here — this form has no literal "Adjuntar soporte"/"archivo" button
  (it's an inline radio field, not a popover control), so S6 needed no change in this file. One-support-at-creation
  behavior (`SIN_SOPORTE_TEXT`, `submit()`) is untouched. Parent spot check: `npx vitest run gasto-form.test.tsx` → 33
  tests green. Risk: none (client-side-only affordance, no API/data/contract change).
- **L5 (T5):** `src/lib/proyectos/plantilla/columns.ts` turned out to be the wrong file — it's the project-structure
  template, not the gastos one; the gastos import headers live in `gastos-import/parse.ts`'s `ENCABEZADOS_GASTOS`.
  Added "Enlace del soporte" as a 13th, OPTIONAL header; `leerEnlaces()` splits on `;`, trims, drops blank pieces,
  validates each non-empty piece against an http(s):// regex (not the stricter `isValidExternalUrl` from
  `@/lib/api/files`, which only allows `https:`), rejecting with the row+column-named error convention already used
  for Subtotal/IVA/Total. `server.ts`'s `aplicarGastosImport` creates one `SoporteProyecto` per valid link inside the
  same transaction as `gasto.create` (S3's literal "two links, two soportes" example, atomic). `project-gastos.tsx`'s
  `sinSoporte` gate needed no change — it already reads the live `soportes` relation. A regression test pins that an
  old-format file (12 headers, no new column) still imports with `enlaces: []`. OpenAPI for this column is left for
  T6 (`project-expenses.ts` still says the import carries no soportes). Parent spot check: `npx vitest run
  parse.test.ts template.test.ts` → 2 files / 44 tests green. Risk: none (no migration — `gasto_id`/`url_externa`
  already existed; URLs validated against http(s):// before any DB write, additive optional column, same
  transaction boundary as before).
- **L6 (T2):** `AvanceView`/`ProjectAvance` gained an additive `soportes: MedioView[]` field (the GET deliverable-progress
  route now also calls a new `listarSoportesVivos` alongside the existing count-only `contarMediosVivos`, left
  untouched for its other callers in `tecnico.ts`/`curva.ts`). New `useAttachAvanceMedio(projectId, deliverableId)`
  reuses `uploadAvanceMedioFile` and mirrors `useAttachExpenseSupport`'s invalidation. `ejecucion-avance.tsx` wires
  T1's `AdjuntarArchivoControl` per avance (gated on `canWrite && !anulado`) and now lists every soporte individually
  instead of a "· N medios" count. No cap exists for avance soportes server-side (confirmed in `soportes.ts`), so none
  was added client-side. Full repo suite: 4560/4562 green; the 2 failures are pre-existing live-DB invariant tests
  unrelated to this change. Risk: none (additive API field, no migration/auth/concurrency change).
- **L7 (T3):** the task brief guessed the URL segment "mediciones/[medicionId]"; the real, already-established
  convention is "measurements/[measurementId]" under "indicators/[indicatorId]", confirmed by grepping the existing
  void route before creating new ones. Three new routes (attachments GET/POST, sign, download), mirroring the avance
  ones with no migration ("medicion_id" already on SoporteProyecto); gateEjecucionRead/Write, validarSoporte,
  toMedioView, signarSubidaSoporte were already parent-agnostic and needed zero changes. A medición has no
  semáforo/"cuenta" concept, so its POST response omits that field. The mediciones-list route gained an additive
  "soportes" field via a spread in the route handler, without touching the shared toMedicionView.
  ejecucion-indicadores.tsx wires T1's control per medición (gated canWrite && !anulada). Full repo suite: 4590/4592
  green (same 2 pre-existing, unrelated live-DB invariant failures as T2). Risk: none (additive endpoints/field, no
  migration, reused gating).