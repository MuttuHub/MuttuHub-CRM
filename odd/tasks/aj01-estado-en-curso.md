# Activity state "En curso" via progress reports (AJ-01)

Objective: let an activity's responsable register a percentage + mandatory observation ("Registrar avance"); the
first report moves the activity to "En curso" automatically; a configurable cap (90% default) limits reports while
deliverables aren't complete; "Terminada" still requires every deliverable to reach its goal with a live medio,
unchanged from today. Branch `feat/aj01-estado-en-curso` from `main` (up to date, includes PR #99/#95/#97/#98, not
yet PR #108/AJ-06). Delivery: one PR with work-unit commits. Test runner: `npx vitest run`. Mirror: Engram
`odd/aj01-estado-en-curso/tasks`. Source: PO document «Ajustes al módulo Proyectos» v1.1 (2026-10-28), AJ-01, plus the
user's own recorded decisions in `docs/plan-trabajo-restante.md:61-65`. This is the first of the team's own
recommended order (`docs/plan-trabajo-restante.md:69`: AJ-06, then AJ-01 → AJ-02 → AJ-03); AJ-02/AJ-03 depend on this
feature's new table and get their own documents/branches/PRs afterward, per that same line.

## Specs

- **S1 — AJ-01, «Hoy», verbatim.** «El estado En curso aparece en el sistema, pero no hay forma de asignárselo a una
  actividad: ninguna acción lleva a ese estado. En la práctica, la actividad pasa de Sin iniciar a Terminada cuando se
  cargan los entregables, y no se puede reportar un avance parcial. Como el equipo ejecuta la actividad y entrega
  actas e informes después, una actividad ya realizada aparece Sin iniciar.»
- **S2 — AJ-01, «Debe quedar», verbatim.** «Estados: Sin iniciar, En curso y Terminada. Se habilita la acción
  Registrar avance en la actividad. Pide el porcentaje de avance y una observación obligatoria que explique el
  porqué de ese avance: qué se ejecutó y qué falta... El primer avance registrado pasa la actividad a En curso
  automáticamente. Esa es la forma de llegar al estado En curso; no hay un cambio de estado manual aparte. Mientras
  los entregables no estén completos, el avance tiene un tope configurable por el Administrador (valor inicial:
  90 %) y la actividad sigue En curso. La actividad pasa a 100 % y Terminada solo cuando todos sus entregables
  alcanzan su meta y cada uno tiene al menos un medio de verificación. Esto se conserva como funciona hoy, pero
  exige que los entregables estén completos y no solo cargados. Una actividad admite varios reportes de avance
  durante su ejecución, y cada nuevo reporte debe ser mayor que el anterior... Todos los reportes quedan en un
  historial visible en la actividad (fecha, porcentaje, observación, usuario). Propuesto: para corregir un error de
  digitación se edita o anula el último reporte, y el cambio queda en auditoría. No se registra un avance menor.»
- **S3 — AJ-01, «Se acepta si», verbatim.** «Actividad Sin iniciar con un avance de 30 %: queda En curso con 30 %.
  Después de 30 % se aceptan 70 % y luego 90 %; el historial muestra los tres reportes con sus observaciones. Con un
  avance actual de 70 %, un nuevo reporte de 70 % o de 50 % se rechaza con el mensaje "El avance debe ser mayor que
  el último reportado (70 %)". Con entregables incompletos se acepta 90 % y se rechaza 95 % con el mensaje "El
  avance máximo sin entregables completos es 90 %". Con 1 de 2 entregables completos, la actividad no pasa a
  Terminada. No se puede guardar un avance sin porcentaje o sin observación. El estado En curso solo se alcanza
  registrando un avance; una actividad En curso siempre tiene al menos un avance con su observación.»
- **S4 — Nota, verbatim.** «Si un entregable no se puede cumplir (por ejemplo, 48 de 50 personas), la actividad no
  se terminará nunca. La salida es una modificación de la meta aprobada por el Gerente (RF-26).» No action: this is
  an existing escape hatch (goal modification), out of this feature's scope.
- **S5 — Recorded decisions (user, as PO spokesperson, `docs/plan-trabajo-restante.md:61-65`), verbatim.**
  1. «Si una actividad tiene reportes y entregables, su avance es el mayor entre el último reporte y el promedio de
     los entregables.»
  2. «Las actividades con avances de entregables pero sin reportes conservan el cálculo anterior.»
  3. «Los pesos manuales ya guardados se recalculan por duración. Las líneas base aprobadas conservan su foto
     histórica.» (AJ-02's concern — recorded here since it's in the same decision list, acted on in the AJ-02
     document, not this one.)
  4. «El reporte de avance lo registra el responsable de la actividad.»
  5. «El tope del 90 % sobre lo programado aplica al color del proyecto, al color de cada actividad y a la curva S.»
     (Partly AJ-03's concern — the setting is added here since AJ-01 needs it for the submission cap; its use on
     color/curva S is AJ-03's document.)
- **S6 — Design: no existing "tope" setting (assumption/map).** Repo-wide search found zero existing cap/threshold
  field. A new `ParametrosV2` key `tope_en_curso` (0-100, default 90, with its own `confirmado` flag, following the
  exact `umbral1`/`umbral2` shape in `semaforo-v2.ts`/`umbrales-section.tsx`) is added. AJ-01 only consumes it for
  the submission-cap rule (S2/S3); AJ-03 reuses the same setting for color/curva S.
- **S7 — Design: new table, not a stored state column (assumption).** `EstadoActividad` has never been a DB column —
  it is derived on every read in `src/lib/proyectos/avance.ts`'s `estadoActividad`. AJ-01 keeps that: no state
  column is added. A new table `ReporteActividad` (one row per report, void-only like `AvanceEntregable`, never
  hard-deleted) feeds the derivation. Fields: `id, proyecto_id, actividad_id, fecha (date), porcentaje (decimal
  0-100), observacion (required, non-null), registrado_por_id, created_at, anulado_at/anulado_por_id/
  motivo_anulacion`; relation `soportes SoporteProyecto[]` via a new nullable `reporte_actividad_id` FK on
  `SoporteProyecto`, extending its existing one-of-four-parents CHECK (mirrors the AJ-06 precedent of adding
  `medicion_id` as a third parent with zero other code changes to the gates/validators).
- **S8 — Design: derivation logic (assumption, satisfies S5.1/S5.2 exactly).** Per activity, `hasReports` = at least
  one non-voided `ReporteActividad` exists.
  - `hasReports = false`: everything computes exactly as today (old entregable-average `avanceActividad`, old
    `estadoActividad` time/progress-based EN_CURSO trigger) — decision S5.2, zero behavior change for activities
    that never get a report.
  - `hasReports = true`: `progreso = max(último reporte %, promedio de entregables)` (decision S5.1).
    `entregablesCompletos` = every entregable's counted quantity reached its meta AND has ≥1 live medio (the same
    criterion `kpis.ts`'s `entregablesLogrados` already applies, computed once per activity and threaded through so
    AJ-03 can reuse it without recomputing). Estado: `entregablesCompletos` ⇒ FINALIZADA (or
    FINALIZADA_CON_RETRASO, unchanged late-check) regardless of the reported %; else (since it has a report) ⇒
    EN_CURSO. This means a report of "100%" submitted while deliverables are still incomplete never finalizes the
    activity (S2's explicit requirement) — and is impossible anyway, since S9's cap rejects any submission above
    the tope while incomplete.
- **S9 — Design: submission validation (assumption, satisfies S3's examples exactly).**
  1. `porcentaje` required, `0 < porcentaje <= 100` (two decimals, like other money/percent fields in this codebase).
  2. `observacion` required (non-empty after trim).
  3. If a previous non-voided report exists: new `porcentaje` must be strictly greater, else 409 — message «El
     avance debe ser mayor que el último reportado ({anterior} %)."» (exact wording, formatted).
  4. If `entregablesCompletos` is false at submission time: `porcentaje <= tope_en_curso.valor`, else 409 — message
     «El avance máximo sin entregables completos es {tope} %.» (exact wording, formatted). This also means 100%
     is only ever accepted once deliverables are already complete.
  5. Write gate: only the activity's `responsable_id` may register/edit/void a report (S5.4), with the same
     ADMINISTRADOR/GERENCIA override every other write gate in this codebase already has (assumption — no
     responsable-only precedent exists yet; the house pattern elsewhere is role-based with an admin/gerencia
     override, never a hard single-user lock, so this is extended rather than invented from nothing). A
     COORDINADOR who is not the responsable gets 403.
- **S10 — Design: the "Propuesto" correction flow (assumption).** Edit and void apply only to the single most
  recent non-voided report for that activity (older reports are immutable once superseded, preserving the
  "siempre mayor" invariant for the sequence); both are audited the same way `AvanceEntregable`'s void already is.
  Editing the last report still enforces S9.1/S9.2/S9.4 (not S9.3, since there is no "more recent" report to be
  less than); voiding it reverts `hasReports`/`progreso` to whatever the next-most-recent report implies (or to
  `hasReports=false` if none remain).
- **S11 — Design: routes (assumption, mirrors the AJ-06 T3 medición precedent, not the older avance one).**
  `GET/POST /api/v1/projects/{id}/activities/{activityId}/progress` (list + register, mirroring
  `deliverables/{deliverableId}/progress`'s naming) and its own attachment family
  `.../activities/{activityId}/progress/{reportId}/attachments` (+ `/sign`, + `/{attachmentId}/download`), a
  self-contained mirror of the mediciones attachment routes from AJ-06 rather than reusing the older generalized
  `progress/{progressId}/attachments` resource (which AJ-06 did NOT extend to mediciones either, for the same
  reason: a dedicated, obviously-scoped route is clearer than overloading one `progressId` segment across parent
  types). One attach-after-creation medio via the existing generic `AdjuntarArchivoControl` (AJ-06), same pattern as
  avances/mediciones.
- **S12 — Out of scope for this document.** AJ-02 (peso/weight) and AJ-03 (cumplimientoCronograma/color/curva S) are
  separate documents/branches/PRs, per the team's own recommended order. This feature only adds the new
  `entregables_completos` flag to the per-activity technical result (for AJ-03 to consume later) and the
  `tope_en_curso` setting (for AJ-01's own cap and, later, AJ-03's color/curva-S use) — it does not change
  `kpis.ts`'s `cumplimientoCronograma`, `colorTecnicoV2` call sites, or `src/lib/proyectos/curva.ts`.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S7 (migration: `ReporteActividad` table, `reporte_actividad_id` on `SoporteProyecto`, CHECK update, Prisma schema, fixtures/seed callers outside this surface) | delegated (context backstop) | done | `bd5c3c3` |
| T2 | S6 (new `tope_en_curso` setting: `semaforo-v2.ts`, `settings.ts`, `umbrales-section.tsx`) | delegated (parallel, disjoint surface) | done | `b7fb3aa` |
| T3 | S8, S9.1-S9.4 (domain logic: `avance.ts`'s `estadoActividad`/`avanceActividad`/`calcularTecnico` — new per-activity inputs/outputs, `entregables_completos` flag, submission validation helpers) | delegated (context backstop) | pending | |
| T4 | S9.5, S10, S11 (API routes: list/create/edit/void a report, the 3 attachment routes, responsable-only gate, wired to T1/T3) | delegated (context backstop) | pending | |
| T5 | S2, S3 (UI: `ejecucion-avance.tsx` activity-level "Registrar avance" action, history, badge/progress wired to T3/T4; new hooks in `hooks/projects.ts`) | delegated (context backstop) | pending | |
| T6 | Docs (OpenAPI, user guide, test guide, flip AJ-01 to Hecho in `docs/plan-trabajo-restante.md`) | delegated (context backstop) | pending | |

Route evidence: T1 (migration) is the foundation every other task's types depend on; T3/T4/T5 share
`src/lib/proyectos/avance.ts`/`src/hooks/projects.ts`, so no parallel-writer reason beyond T2 (fully disjoint
surface — a standalone settings addition with no dependency on T1's table — runs alongside T1). Risk: item 1 for T1
(new migration); item 2 for T4 (new responsable-only write gate, an authorization rule with no precedent in this
codebase) → independent verifier for both at the feature's end. T3's behavior change for `hasReports=false`
activities must be a byte-for-byte no-op (S5.2) — pin with a regression test, not just a new-path test.

## Log

- **L1 (2026-10-29, user, verbatim):** after the AJ-06 PR was opened, user asked what AJ-01/AJ-02/AJ-03 need to
  start; given a summary of the new-table/settings/logic gaps — user: «listo dale con las 3».
- **L2 (2026-10-29):** Map (full detail in this session's research; key facts folded into S6-S11 above).
  `EstadoActividad` has no DB column — 100% derived in `avance.ts:estadoActividad`. No "tope" setting exists
  anywhere (grepped). `SoporteProyecto` already has the 3-nullable-FK-one-CHECK pattern from AJ-06, extending it to
  a 4th parent is the established, zero-other-change way to add "medio de verificación" support to a new entity.
  The existing deliverable "Registrar avance" flow (`ejecucion-avance-form.tsx`) and the generic
  `AdjuntarArchivoControl` (AJ-06) are the UI templates to adapt, not reuse directly (this is activity-scoped, not
  deliverable-scoped, and `observación` must be mandatory here vs. optional there). `pesoEfectivo`/`resolvePeso`
  (AJ-02) and `cumplimientoCronograma`/color/curva (AJ-03) are confirmed out of this document's scope per S12.
- **L3 (T2):** "tope_en_curso" added end to end (PARAMETRO_KEYS, ParametrosV2, PARAMETROS_V2_DEFAULT = 90,
  NUMERIC_KEYS, umbrales-section.tsx's META, OpenAPI). No new cross-field check needed - the existing generic
  0-100 range validation already covers it. One file outside T2's declared surface needed a one-line fix:
  src/app/api/v1/settings/semaforo-v2/route.ts's hardcoded .strict() PATCH schema would have 400'd any save of
  this field and failed tsc otherwise - added "tope_en_curso: patchItem(porcentaje)", identical to its 4 siblings.
  RED-then-GREEN observed (6 failing before, all green after). Parent spot check: 4 files / 67 tests green. Risk:
  none (additive setting, no migration, no existing-key behavior change).
- **L4 (T1):** `ReporteActividad` added (void-only, mirrors `AvanceEntregable`'s shape: fecha/porcentaje/observacion
  required/registrado_por_id/anulado_* + a DB CHECK `porcentaje > 0 AND porcentaje <= 100`). Correction to the task
  brief: the `soportes_proyecto` parent CHECK was already `<= 1` (allows zero parents, changed 2026-10-17 for
  project-origin documents), not `= 1` as assumed — the writer verified this against the actual migration/invariant
  tests before extending it to four parents with `<= 1`, avoiding a regression. Local Docker Postgres (`.env.local`,
  `127.0.0.1:54322`) turned out reachable this session; `migrate status` showed **unrelated drift** — two migrations
  applied locally that don't exist in this repo (`20260918153200_tablero_seguimiento_social`,
  `20261029120000_jefe_clientes_aliados_carpetas`, presumably from another branch/session) — flagged to the user,
  who asked for a recommendation; applied only the new migration with `migrate deploy` (never `dev`, so the
  pre-existing drift was left untouched, no reset). The new invariant test (`reportes-actividad.invariant.test.ts`)
  ran for real against this DB: 8/9 green first run, 1 failing on a test-authoring bug (`Decimal.toString()` doesn't
  pad to the column's declared scale — "100" not "100.00" — not a product bug), fixed inline by the parent
  (compare `Number(row.porcentaje)` instead of a padded string); 9/9 green after. `npx tsc --noEmit`: clean.
