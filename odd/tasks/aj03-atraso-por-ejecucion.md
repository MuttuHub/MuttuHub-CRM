# Delay measured by execution against the tope at the end date (AJ-03)

Objective: an activity counts as executed on time when its reported advance reached the configurable tope
(90 % default) on or before its scheduled end date — soportes arriving later never make it «atrasada»; schedule
compliance becomes executed-on-time / past-due; the planned advance of each activity caps at the tope on its end
date, which is what the project color, the activity color and the curva S measure against. Branch
`feat/aj03-atraso-por-ejecucion` from `main` (after AJ-01 lands — this feature consumes AJ-01's `tope_en_curso`
setting and per-activity progress). Delivery: one PR with work-unit commits. Test runner: `npx vitest run`.
Mirror: Engram `odd/aj03-atraso-por-ejecucion/tasks`. Source: PO document «Ajustes al módulo Proyectos» v1.1 (2026-10-28), `docs/Hub-proyectos261028.docx` (versioned in this repo; text extracted
2026-10-29), section AJ-03, plus `docs/plan-trabajo-restante.md:54` and the user's recorded decision 5
(`docs/plan-trabajo-restante.md:66`).

## Specs

- **S1 — AJ-03 row, verbatim (`docs/plan-trabajo-restante.md:54`).** «El atraso se mide por la ejecución (llegar
  al tope en la fecha fin), no por los soportes». Prioridad Alta. Estado: Pendiente; depende de AJ-01.
- **S2 — User decision 5, verbatim (`docs/plan-trabajo-restante.md:66`).** «El tope del 90 % sobre lo programado
  aplica al color del proyecto, al color de cada actividad y a la curva S.»
- **S3 — AJ-03, «Hoy», verbatim.** «Sin avance parcial, una actividad ya ejecutada sigue Sin iniciar hasta que
  llegan los soportes y puede aparecer como atrasada.» Stale by design: pre-AJ-01 world — AJ-01 (done) already
  added avance parcial.
- **S4 — AJ-03, «Debe quedar», verbatim.** «La actividad cuenta como ejecutada a tiempo si su avance reportado
  llegó al tope (90 %) en su fecha fin programada o antes. Si los soportes llegan después, no cuenta como
  atraso.» / «Cumplimiento del cronograma = actividades ejecutadas a tiempo / actividades cuya fecha fin ya
  pasó.» / «Propuesto, para el semáforo técnico: el avance programado de cada actividad llega como máximo al tope
  en su fecha fin. Así, una actividad al 90 % esperando soportes no aparece en amarillo ni rojo por esa sola
  razón.»
- **S5 — AJ-03, «Se acepta si», verbatim.** «Programada hasta la semana 6, con 90 % en la semana 6 y Terminada en
  la semana 8: a tiempo.» / «Programada hasta la semana 6, con 50 % en la semana 6: no está a tiempo.»
- **S6 — Semantics resolved by S4 (previously open).**
  1. **Compliance basis replaces D3's state count:** `atrasadas`/`a_tiempo` stop being estado-derived; «a tiempo»
     = the activity's reported advance reached the tope on or before its scheduled fin. The denominator stays
     «actividades cuya fecha fin ya pasó» (`fin <= corte`), the same population D2/D3 already use. Being
     `Terminada` after the fin date still counts as a tiempo (S5's first example: 90 % in week 6, Terminada in
     week 8).
  2. **Color keeps its thresholds, the plan changes:** `colorTecnicoV2`'s `umbral1`/`umbral2` deviation coloring
     stays; what changes is the planned series it is measured against — each activity's «avance programado» caps
     at the tope on its fin (S4's «Propuesto», endorsed by decision 5/S2). An activity at 90 % waiting for
     soportes then has ~zero deviation instead of appearing amarillo/rojo.
  3. **Curva S:** the same capped programado feeds `tecnicoPlaneado`/`avanceProgramado`
     (`src/lib/proyectos/curva.ts`), so the planned technical curve tops out at the tope per activity at its fin
     instead of reaching 100 %.
  S4's third line is marked «Propuesto» in the PO (commentable before implementing); decision 5 already says the
  tope applies to color and curva, which this reading satisfies — confirm with the user at T2 start, one line.
- **S7 — Map (2026-10-29, codegraph, path:line).** Today's atraso: `cumplimientoCronograma`
  (`src/lib/proyectos/kpis.ts:60`) counts `atrasadas` = activities with `fin <= corte` whose estado is
  `NO_INICIADA` or `EN_CURSO` (rule D3, `kpis.ts:49-68`) — the state-based count S4.1 replaces; its consumers
  include the portfolio KPI «Actividades atrasadas» (`src/components/proyectos/portafolio-kpis.tsx`) and the
  attention list. Colors: `colorTecnicoV2` (`src/lib/proyectos/semaforo-v2.ts:101`), 7 call sites
  (`actividad.ts`, `kpis.ts`, `src/lib/api/tecnico.ts`). Planned series: `avanceProgramado` (used by
  `tecnicoPlaneado`, `src/lib/proyectos/curva.ts:53`) currently reaches 100 % at each activity's fin — S6.3 caps
  it at the tope. Curva S: `calcularCurva` (`src/lib/api/curva.ts:58`) + `construirCurva`
  (`src/lib/proyectos/curva.ts:96`). AJ-01 (done) already added `tope_en_curso` (`ParametrosV2`, default 90,
  admin-editable) and the per-activity progress/`entregables_completos` in `avance.ts` for this feature to
  consume.
- **S8 — Design edges to pin with tests (assumption).** (a) RESOLVED (2026-10-29, with AJ-02's S6): the value
  compared to the tope is the activity's avance per decision 1 — «el mayor entre el último reporte y el promedio
  de los entregables» (report-less activities keep decision 2's entregable average). (b) Report-less activities (user decision 2, AJ-01): a past-due
  activity with entregables loaded but no report never «llegó al tope» by report ⇒ not a tiempo; pin with a test
  so the S5.2 byte-for-byte rule for report-less activities stays intact elsewhere. (c) The comparison is
  `avance >= tope` at `fin` («llegó al tope»), inclusive.
- **S10 — Readings fixed at implementation (assumptions, 2026-10-30).** (a) «Avance at the fin» = decision 1's
  value computed only from avances and reports dated on or before the fin. (b) `atrasadas` = past-due activities
  whose current avance is still below the tope — an activity that reached the tope after its fin is neither
  a tiempo nor atrasada, the same exclusion D3 made for finished-late activities. (c) «llega como máximo al tope»
  reads as a cap: an activity's planned fraction is `min(tope, elapsed fraction)`, so the plan is unchanged until
  the elapsed fraction passes the tope. (d) The attention list's «Actividad atrasada» uses (b) instead of
  «progreso < 100 %», so an activity at the tope waiting for soportes is not listed as late.
- **S9 — Out of scope.** AJ-01 (done) and AJ-02 (own document, `odd/tasks/aj02-peso-duracion.md`).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S4.1, S5, S8, S10 (domain: the execution-based a tiempo/atrasada rule in `kpis.ts`'s `cumplimientoCronograma`, consuming `tope_en_curso` + the per-activity progress from `avance.ts`; the attention list's «Actividad atrasada» and the activity board follow the same rule) | inline | done | `53d77ae` |
| T2 | S4.3, S6.2, S6.3, S10 (planned series: cap each activity's `avanceProgramado` at the tope at its fin — flows into `colorTecnicoV2` inputs and `tecnicoPlaneado`) | inline | done | `687242f` |
| T3 | S2 (curva S + colors: pin the capped plan through `src/lib/api/curva.ts` / `curva.ts` and the 7 `colorTecnicoV2` call sites) | inline | done | `687242f` |
| T4 | Docs (OpenAPI, user guide, test guide, flip AJ-03 to Hecho in `docs/plan-trabajo-restante.md`) | inline | done | this commit |

Route evidence: no writer trigger holds — one behavior over shared domain files (`avance.ts`, `kpis.ts`), so no
disjoint parallel units; the parent writes inline. Branch actually used: `feat/aj03-atraso-por-ejecucion` stacked on
`feat/aj02-peso-duracion` (AJ-02 is not in `main` yet and touches the same weighting code); retarget to `main`
once AJ-02 merges.

## Log

- **L1 (2026-10-29, user, verbatim):** «listo dale» — approving the prep window for AJ-02/AJ-03 documents (earlier,
  per the AJ-01 document's L1: «listo dale con las 3»). This document was authored as prep; no source write yet.
- **L2 (2026-10-29):** Initial map captured via codegraph (now S7); the PO document was not yet available, so the
  first draft listed three open semantic questions instead of specs.
- **L3 (2026-10-29, user, verbatim):** «C:\Users\Adrian\Downloads\Hub-proyectos261028.docx», revisalo porfa» — the
  user provided the PO document. Text extracted (python zipfile over `word/document.xml`; pandoc unavailable).
  S3–S5 filled verbatim; the three open questions resolved into S6 (compliance basis replaces D3; color keeps
  thresholds with the capped planned series; curva S tops out at the tope). S8 flags the shared dependency on
  AJ-02's S6 answer (which avance value is compared to the tope).
- **L4 (2026-10-29, user, verbatim):** «comienza, si crees necesario guarda el doc» — approving the sequence and
  the S6 resolution (the tope comparison uses decision 1's «el mayor», same as the ponderado); T1 unblocked. The
  PO document was versioned at `docs/Hub-proyectos261028.docx`.
- **L5 (2026-10-30, user, verbatim):** «dale con aj03» — authorizes AJ-03 implementation. Entry state: AJ-02 finished
  locally (`feat/aj02-peso-duracion`, not pushed: GitHub unreachable from this machine, TLS interception), so this
  branch stacks on it. Readings fixed in S10.
- **L6 (2026-10-30):** T1 — RED 8 (kpis) + 3 (attention, board), GREEN; `cumplimientoCronograma` now takes
  `{ fin, avance_al_fin, avance }` and the tope; `calcularTecnico` adds `avance_al_fin` per activity; the shared
  `alcanzaTope` (inclusive, float slack) drives compliance, `atrasadas`, the attention list and the board column;
  `technical-status` answers `tope_en_curso`. T2/T3 — RED 8, GREEN; `programadoActividad` = `min(tope, elapsed)`
  feeds `avanceProgramado`, the per-activity `programado` (and so the objective roll-ups and every activity color)
  and `tecnicoPlaneado`; `tope` is a required argument so no caller can silently keep the uncapped plan. The route
  and curve goldens pin `tope_en_curso = 100` to keep their uncapped values; dedicated tests pin 90. Advisory, not
  changed (pre-existing, out of scope): the curve's executed technical line ignores AJ-01 reports.
- **L7 (2026-10-30):** T4 — OpenAPI (kpis `a_tiempo`/`atrasadas`, technical-status `programado`/`tope_en_curso`, curve),
  user guide (when an activity is late, weekly-report table, glossary), test guide §D step 12 (S5's examples) and the
  remaining-work table. Closing checks on the branch: `tsc` 0 errors, `eslint` clean, `npx vitest run` against the
  local DB 4877/4878 — the only failure is the pre-existing `prisma/municipios.invariant.test.ts`. Next: push and PR
  once GitHub is reachable, after AJ-02's PR (this branch stacks on it).
