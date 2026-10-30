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
- **S8 — Design. RESOLVED at T1 start (2026-10-30): drop the `peso` and `peso_manual` columns.** Weight becomes
  always derived: the write paths stop accepting a manual `peso` (create/update routes and the modification
  replay), `pesoEfectivo`/`resolvePeso` collapse to the `defaultWeight` branch, and the UI loses the peso input
  and the «Peso manual» badge (the summary keeps showing the derived peso). **Storage decision:** rather than
  keeping a recalculated `peso` column, both columns are dropped. Why: (a) a stored copy of a pure function of
  (`semana_inicio`, `semana_fin`) can only drift from the function, and the reviewers would have to reason
  about which one wins; (b) `DROP COLUMN` makes «no es editable» structurally impossible instead of merely
  unvalidated at the API edge; (c) S2's «los pesos manuales ya guardados se recalculan por duración» is
  satisfied identically — every weight the system reports after the migration equals
  `semana_fin − semana_inicio + 1`, and no server answer changes except the ones that were manual;
  (d) the historical evidence S2 protects lives in the approved-baseline JSON snapshots (`versiones`), which
  keep their recorded `peso` untouched, so «las líneas base aprobadas conservan su foto histórica» holds.
  The migration therefore carries no data backfill: it drops two columns and nothing reads them afterwards.
- **S9 — Out of scope.** AJ-01 (done) and AJ-03 (own document, `odd/tasks/aj03-atraso-por-ejecucion.md` — its
  tope comparison consumes the same per-activity avance this document's S6 asks about).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S4 (storage + domain: drop `peso`/`peso_manual`, derive the weight everywhere; approved baseline snapshots keep their own `peso`) | inline + `gentle-ai-worker` (one delegation) | done | `d19ced8` |
| T2 | S4, S5, S6 (API contract: the activities routes reject a `peso` field; OpenAPI says the weight is derived; S5's 46,7 % example pinned against `calcularTecnico`) | inline | done | `bde801c` |
| T3 | S4 (UI: no peso input, no «Peso manual» badge; **the Excel structure template loses its «Peso (opcional)» column and V-09's weight branch**) | inline | done | `a96a5d1` (UI) + `9f8d6f5` (plantilla) |
| T4 | Docs (OpenAPI, user guide, test guide, flip AJ-02 to Hecho in `docs/plan-trabajo-restante.md`) | inline | done | this commit |

Order actually executed: **T3 (UI + plantilla) → T1 (storage/domain) → T2 (contract + S5) → T4 (docs)**, so that every
commit compiles: stopping offering the weight first, then removing the machinery behind it.

**Delivery slice:** this feature ships as **one PR with five work-unit commits**, 709 authored lines total — past
the ~400-line slice guide on purpose, declared here as the slice boundary. The reason is that the rule cannot
land in smaller shippable pieces: the UI half alone leaves an editor that silently does nothing, and the storage
half alone cannot compile without the read/write paths. If the reviewer wants smaller slices, the natural split
is `a96a5d1` + `9f8d6f5` (product surface) then `d19ced8` + `bde801c` (storage and contract) on top.

## T1 implementation notes (2026-10-30, for the worker reading this)

Already in the tree and **not** to be redone: the migration
`prisma/migrations/20261030120000_v2_actividades_peso_por_duracion/migration.sql` (drops the CHECK and both
columns, idempotent), `prisma/schema.prisma` (Actividad without `peso`/`peso_manual`), the live-DB test
`prisma/actividades-peso.invariant.test.ts` (green after `migrate deploy` + `prisma generate`), and T3's UI +
template work (committed separately; `estructura-actividades.tsx` already sends no weight).

Field-level decisions, so the worker does not have to re-decide them:

1. `src/lib/proyectos/actividad.ts`: delete `pesoEfectivo` and `resolvePeso`; add one exported
   `pesoActividad({ semana_inicio, semana_fin })` returning `defaultWeight(...)` from `weeks.ts`, with an AJ-02
   doc comment. `ActividadRow` loses `peso`/`peso_manual`; `ActividadV2View` keeps `peso: number` (derived) and
   **loses** `peso_manual`.
2. Read paths (`src/lib/api/{atencion,curva,kpis-portafolio,tecnico,plantilla-import}.ts`): drop `peso` and
   `peso_manual` from the Prisma `select`s, compute `pesoActividad(row)` where the weight is needed. This is what
   makes the weighted mean (`avanceReal`) keep working unchanged.
3. `src/lib/proyectos/modificaciones.ts` + `src/lib/api/modificaciones.ts`: the modification replay stops writing
   the weight entirely (only the two week columns change); `despues.actividades[].peso`/`peso_manual` go away.
4. `src/lib/api/versiones.ts` (live snapshot) writes `peso: String(pesoActividad(a))` and no `peso_manual` key.
   The snapshot **type** (`src/lib/proyectos/versiones.ts`) keeps `peso` and makes `peso_manual` optional, because
   already-approved baselines stored that field and must keep parsing; remove `peso_manual` from the diff field
   list (`versiones.ts:186`) and its label in `project-versiones.tsx`, or old baselines would show a phantom
   change.
5. Activities create/update routes: drop `pesoField` and the `peso` request field, stop calling `resolvePeso`, and
   answer with the derived `peso` only. `technical-status/route.ts` likewise answers the derived weight.
6. `src/hooks/projects.ts`: the activity read model keeps `peso` and loses `peso_manual`; the write payloads lose
   `peso`.
7. Tests to update: the seven `prisma/*.invariant.test.ts` that create activities with `peso`
   (`avances`, `estructura`, `linea-base`, `mediciones`, `modificaciones`, `plantilla-import`,
   `reportes-actividad`), plus route/UI tests asserting `peso`/`peso_manual` in bodies or fixtures. Fixtures keep
   a `peso` value only where the type still has it; delete `peso_manual` everywhere.

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
- **L5 (2026-10-30, user, verbatim):** «listo dale vamos con aj02» — authorizes AJ-02 implementation. Entry state:
  AJ-01 delivered to `main` (`0692169`, CI unit+e2e green) and #112 closed; the six PO rules were re-verified
  against code, which confirmed AJ-02 as one of the two still pending (weight is still editable:
  `peso_manual` + `pesoField` in `activities/route.ts:48`, input and «Peso manual» badge in
  `estructura-actividades.tsx:161,243`). S8's storage question was decided as recorded above (drop both
  columns) and T1 started with its RED test. No requirement changed: S1–S7 stand as written.
