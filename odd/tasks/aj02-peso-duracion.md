# Activity weight = its duration in weeks, not editable (AJ-02)

Objective: every activity's weight is exactly its duration in weeks, derived and non-editable; already-saved
manual weights are recalculated by duration; approved baselines keep their historical snapshot; the project's
advance is the weighted mean of its activities' advances. Branch `feat/aj02-peso-duracion` from `main` (after
AJ-01 lands; rebase if branched earlier). Delivery: one PR with work-unit commits. Test runner: `npx vitest
run`. Mirror: Engram `odd/aj02-peso-duracion/tasks`. Source: PO document «Ajustes al módulo Proyectos» v1.1 (2026-10-28), `docs/Hub-proyectos261028.docx` (versioned in this repo; text extracted
2026-10-29), section AJ-02, plus `docs/plan-trabajo-restante.md:53` and the user's recorded decision 3
(`docs/plan-trabajo-restante.md:64`).

## Specs

- **S1 — AJ-02 row, verbatim (`docs/plan-trabajo-restante.md:53`).** «Peso de cada actividad = su duración en
  semanas, no editable». Prioridad Alta. Estado: Pendiente; depende de AJ-01.
- **S2 — User decision 3, verbatim (`docs/plan-trabajo-restante.md:64`).** «Los pesos manuales ya guardados se
  recalculan por duración. Las líneas base aprobadas conservan su foto histórica.»
- **S3 — AJ-02, «Hoy», verbatim.** «No hay avance parcial, así que hoy no se pondera. Por confirmar: cómo calcula
  hoy el sistema el avance del proyecto.» Stale by design: this describes the pre-AJ-01 world — AJ-01 (done,
  `feat/aj01-estado-en-curso`) already added avance parcial, so the «por confirmar» is answered by that feature.
- **S4 — AJ-02, «Debe quedar», verbatim.** «Peso de cada actividad = su duración en semanas (semana fin − semana
  inicio + 1). No es editable.» / «Avance de la actividad = último avance reportado, o 100 % si está Terminada.» /
  «Avance del proyecto = Σ (peso × avance) / Σ pesos.» / «Si la plantilla tiene columna Peso, se retira.»
- **S5 — AJ-02, «Se acepta si», verbatim.** «Actividad de 4 semanas al 20 % y actividad de 2 semanas al 100 %:
  (4 × 0,20 + 2 × 1,00) / 6 = 46,7 %.»
- **S6 — Weighting input, RESOLVED (2026-10-29, user approved the recommendation).** The value that enters
  Σ (peso × avance) is the activity's avance per the user's recorded decision 1
  (`docs/plan-trabajo-restante.md:61`) — «el mayor entre el último reporte y el promedio de los entregables» —
  not the PO line's simpler «último avance reportado». Rationale, recorded for traceability: (a) decision 1 is
  the user's own later clarification as PO spokesperson, answering what the PO document left open; (b) the PO's
  «o 100 % si está Terminada» is contained in decision 1 (Terminada ⇒ entregables completos ⇒ promedio 100 % ⇒
  el mayor = 100 %); (c) decision 1 is already implemented and regression-pinned in AJ-01 (`avance.ts`), so the
  PO's literal formula would reopen a closed feature for no user-visible gain; (d) «el mayor» reflects executed
  work, consistent with AJ-03's «medir por la ejecución». The only behavioral difference vs the PO line: when
  the entregable average exceeds the last report, the project advance reflects the higher executed value.
  Report-less activities keep decision 2's old entregable-average avance.
- **S7 — Map (2026-10-29, codegraph, path:line).** Weight today: `pesoEfectivo`
  (`src/lib/proyectos/actividad.ts:34`) returns the typed `peso` while `peso_manual`, else
  `defaultWeight(semana_inicio, semana_fin)` — S4 line 1 now confirms that default is exactly
  `semana_fin − semana_inicio + 1`. `resolvePeso` (`actividad.ts:53`, REQ-STR-04) decides the stored
  `(peso, peso_manual)` pair on create/update; callers: `src/app/api/v1/projects/[id]/activities/route.ts`,
  `src/app/api/v1/projects/[id]/activities/[activityId]/route.ts` (5 callers total) and `applyModificacion`
  (`src/lib/proyectos/modificaciones.ts:185`). UI: manual peso input in `ActivityForm`
  (`src/components/proyectos/estructura-actividades.tsx:195-226`), «Peso» + «Peso manual» badge
  (`estructura-actividades.tsx:160-161`), contract documented in `src/hooks/projects.ts:205`. Project advance:
  `calcularTecnico` (`src/lib/proyectos/avance.ts`) already computes the peso-weighted mean — T2 pins S5's
  example against it rather than adding a new formula. Baselines: snapshots in `src/lib/api/versiones.ts`
  (consumed via `desdeSnapshot`, `src/lib/api/curva.ts`) are S2's «foto histórica» and must not be rewritten.
  Plantilla: the structure-import parser's activity fields are objetivo/actividad/entregable/inicio/fin/cantidad/
  unidad (`src/lib/proyectos/estructura-po/parse.ts:103-106`) — no Peso column there today, so S4's last line is
  already satisfied by that template or refers to another one; T3 verifies which plantilla (if any) still shows
  Peso.
- **S8 — Design (assumption, revisit against S6's answer).** Weight becomes always derived: the write paths stop
  accepting a manual `peso` (create/update routes and the modification replay), `pesoEfectivo`/`resolvePeso`
  collapse to the `defaultWeight` branch, and the UI loses the peso input and the «Peso manual» badge (the
  summary keeps showing the derived peso). Storage choice for T1: keep the columns with `peso_manual` forced
  false after a recalculation migration, or drop them — decide at T1; the user-visible rule is the same.
- **S9 — Out of scope.** AJ-01 (done) and AJ-03 (own document, `odd/tasks/aj03-atraso-por-ejecucion.md` — its
  tope comparison consumes the same per-activity avance this document's S6 asks about).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S4 (migration: recalculate every stored peso by duration, `peso_manual` false; approved baseline snapshots untouched) | TBD | pending | |
| T2 | S4, S5, S6 (domain + API: `resolvePeso`/`pesoEfectivo` and the activities routes stop accepting a manual peso; pin S5's weighted example against `calcularTecnico`) | TBD | pending | |
| T3 | S4 (UI: remove the peso input and the «Peso manual» badge in `estructura-actividades.tsx`; verify no plantilla shows Peso) | TBD | pending | |
| T4 | Docs (OpenAPI, user guide, test guide, flip AJ-02 to Hecho in `docs/plan-trabajo-restante.md`) | TBD | pending | |

## Log

- **L1 (2026-10-29, user, verbatim):** «listo dale» — approving the prep window for AJ-02/AJ-03 documents (earlier,
  per the AJ-01 document's L1: «listo dale con las 3»). This document was authored as prep; no source write yet.
- **L2 (2026-10-29):** Initial map captured via codegraph (now S7); the PO document was not yet available, so the
  first draft carried an explicit gap where S3–S5 now stand.
- **L3 (2026-10-29, user, verbatim):** «C:\Users\Adrian\Downloads\Hub-proyectos261028.docx», revisalo porfa» — the
  user provided the PO document. Text extracted (python zipfile over `word/document.xml`; pandoc unavailable in
  this environment). S3–S5 filled verbatim; S4 line 1 confirms the `defaultWeight` formula; the AJ-01 section was
  checked against `feat/aj01-estado-en-curso` and is verbatim-identical to what that feature implemented (no
  contradiction). S6 conflict surfaced: PO's weighting input vs the user's recorded decision 1 — one focused
  question back to the user, T2 blocked until answered.
- **L4 (2026-10-29, user, verbatim):** «comienza, si crees necesario guarda el doc» — approving the
  recommendation that decision 1's «el mayor» feeds the ponderado (S6 resolved above) and authorizing the
  sequence: merge #108, rebase AJ-01, verify, push/PR, then AJ-02 and AJ-03. The PO document was versioned at
  `docs/Hub-proyectos261028.docx`.
