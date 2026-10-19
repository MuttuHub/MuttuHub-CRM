# Muttu Hub v2 — S4 Technical execution and semáforo (avances, medios, mediciones, beneficiarios, technical status)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§3.5 EXE, §3.6 TEC, §4.2, §4.8, §4.9, §5.5), ledger
`odd/tasks/v2-projects-execution.md`, verified mapping `odd/tasks/v2-projects-s4-map.md` (read it: it holds the
formulas, the F-T1 golden numbers, route tables and defaults). Branch: `feat/projects-v2`.

## Objective

Authorized users register progress (avances) against deliverables of an EN_EJECUCION project, attach supporting media,
record indicator measurements and beneficiaries, and read a technical semáforo (real vs programmed progress, color).

## Decisions (defaults, no PO answer yet; revisit with feedback)

1. No route moves a project to EN_EJECUCION in S4 (that is baseline approval, S8.2). Tests set `estado` via Prisma;
   manual QA uses the guarded local script `scripts/set-project-estado.ts` (dry-run default, `--apply`, loopback only).
2. Create access: ADM/GER or an active-member COORDINADOR (`gateEjecucionWrite`), only while EN_EJECUCION
   (409 INVALID_STATE otherwise). Void: ADM/GER only, non-empty `motivo` (1..500), any estado. Order 404 -> 403 -> 409 -> 400.
3. Void, never delete (REQ-EXE-07): voided rows are excluded from every calculation, audited with ANULAR.
4. `avance_requiere_medio` defaults to true: an avance counts (`cuenta`) only with at least one non-deleted medio.
5. Cumulative counted quantity above the deliverable goal needs `justificacion_exceso` (400 otherwise); the check and the
   insert run in one transaction with a row lock on the entregable.
6. `fecha` of an avance and a measurement cannot be after `todayInBogota()`.
7. Medios: signed-upload flow only (ADR-13), 60 s signed download, https links only, never delete from storage.
   A medio can be added to an existing avance, not to a voided one (409). No Documentos mirror (deferred).
8. `estadoActividad` is derived on read (FINALIZADA, FINALIZADA_CON_RETRASO, EN_CURSO, NO_INICIADA), never stored.
9. technical-status echoes `base: "vigente"` until S8; tolerancia/retraso parameters unused until S5.
10. Delete guards: deliverable with live avances, indicator with live measurements, activity with live beneficiarios -> 409.

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Delivery strategy `ask-on-risk`; ~400 lines/unit advisory.
- Native review: RDD needs per-candidate human consent; recorded as pending.

## Tasks

Route: delegated writer per round (round 1: U1-U3, round 2: U4-U5, round 3: U6-U7).

- [x] **U1** Pure libs: `src/lib/proyectos/avance.ts`, `__fixtures__/tecnico.ts`, `colorTecnicoV2`/`ColorSemaforo`, tendencia (bd775f7).
- [x] **U2** Avances backend: migration `v2_avances`, `ejecucion.ts` gates, progress + void routes, delete guard,
  `beneficiarios` audit entity, OpenAPI, `scripts/set-project-estado.ts` (021b560).
- [x] **U3** Medios: migration `v2_soportes_medios`, `isValidExternalUrl`, `proyecto_soporte` upload target,
  sign/confirm/link routes, signed download, `cuenta` from live medio (2aed734).
- [x] **U4** Mediciones + beneficiarios: tables, routes + void, guards, tendencia in response (b38868e).
- [x] **U5** `GET projects/[id]/technical-status`, `fecha_cumplimiento`, OpenAPI (42f777c).
- [x] **U6** UI (a): ejecucion hooks in `src/hooks/projects.ts` + `project-ejecucion.tsx` shell + `semaforo-tecnico.tsx`
  + read view of avances/entregables per activity + ficha mount. (split of the original U6) (a42c45e)
- [x] **U7** UI (b): write forms — `ejecucion-avance-form.tsx` (avance + medio sign/upload/confirm or https link),
  `ejecucion-indicadores.tsx`, `ejecucion-beneficiarios.tsx` — plus void buttons and write-control gating.
  (split of the original U6) (1601b93)

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly). F-T1 golden: real 21.4 %, programmed 57.1 %, deviation 35.7 pp, rojo.

## Progress

- 2026-10-08: document created from the S4 map.
- 2026-10-08: round 1 (U1-U3) by one writer, local DB only (2 migrations applied with `.env.local`: `20261008130000_v2_avances`,
  `20261008140000_v2_soportes_medios`; `prisma generate` via `db:generate:local`). RED observed per unit (missing module / missing
  Prisma delegate / missing route), then GREEN. Full suite `TZ=America/Bogota npx vitest run`: 194 files / 1943 tests green;
  `tsc --noEmit` and eslint clean.
  - U1: `avance.ts` (+ `calcularTecnico` composer), fixture F-T1/F-T1b, `colorTecnicoV2` compares in tenths (9.999999999999998 verde,
    10.1 amarillo, 20.0 amarillo, 20.1 rojo). Golden holds: real 21.4 %, programmed 57.1 %, deviation 35.7 pp, rojo.
  - U2: `src/lib/api/ejecucion.ts` (`gateEjecucionWrite/Read/Void`, `toAvanceView`, `avanceCuenta`), routes under
    `projects/[id]/deliverables/[deliverableId]/progress` (+ `[progressId]/void`), deliverable delete guard, `beneficiarios`
    audit entity, OpenAPI in `src/lib/openapi/paths/project-execution.ts`, `scripts/set-project-estado.ts` (dry run default).
    Live-DB invariant `prisma/avances.invariant.test.ts` (CHECKs, composite FK, the `FOR UPDATE` SQL).
  - U3: `isValidExternalUrl`, `proyecto_soporte` target + `proyectoSoportePath`, routes under
    `projects/[id]/progress/[progressId]/attachments` (`GET`, `POST` file-confirm or link, `sign`, `[attachmentId]/download`),
    `contarMediosVivos`; `cuenta` is true once a live medio exists.
  - Deviations: (1) F-T1 fixture gets a second 1.3 deliverable (`a13-e2`, meta 2/0) because the map's single-deliverable 1.3 gives
    0.5, not the 0.25 the F-T1b numbers need; F-T1 golden unchanged. (2) Cap check sums ALL non-voided avances (counted or not), not
    only counted, so a medio attached later can never push the total over the goal. (3) `soportes_proyecto.medicion_id` has no FK
    yet: it arrives with the measurements table in U4 (add the composite FK and the `(id, proyecto_id)` unique there).
    (4) No `VISUALIZADOR` role exists in `RolUsuario` (only ADM/GER/COORD/COLAB); tests use COLABORADOR. (5) Medios have no
    delete route (soft-delete column exists; not requested). (6) `tsx` cannot run in this shell (win32 esbuild), so
    `set-project-estado.ts` is unit-tested with fakes but not executed against the DB. (7) Native review (RDD) not run: needs
    per-candidate consent.

- 2026-10-08: reconciled bookkeeping. U4 (`b38868e`) and U5 (`42f777c`) were committed in a Claude Code session that
  never updated this document; they are recorded here from the commits. U4 closes the U3 deviation (2): the
  `soportes_proyecto(medicion_id, proyecto_id)` composite FK and the `mediciones_indicador` tables landed in migration
  `20261008150000_v2_mediciones_beneficiarios`. Focused re-verification of the four new test files
  (`technical-status`, `indicators/[indicatorId]/measurements`, `beneficiaries`, `avance`): 4 files / 51 tests green under
  `TZ=America/Bogota`. The original U6 is split into U6 (render) and U7 (write forms) so each stays reviewable.

- 2026-10-08: round 3 (U6, U7) by one bounded writer from the S4 map §6-§7. RED observed per unit (U6: hooks
  `is not a function` + `Failed to resolve import` for the three new components; U7: missing form modules + 3 failing
  gating cases), then GREEN. Focused runs green; writer reported full suite `TZ=America/Bogota npx vitest run`:
  207 files / 2026 tests green, `tsc --noEmit` clean, eslint clean on touched files. Parent spot check re-ran the
  7 ejecucion test files: 38 tests green.
  - U6 (a42c45e): execution query keys + read hooks in `src/hooks/projects.ts` (`useProjectTechnicalStatus`,
    `useDeliverableProgress` via `useQueries`, `useIndicatorMeasurements`, `useProjectBeneficiaries`);
    `semaforo-tecnico.tsx` (renders `data-color` from the API, "No confirmado" badge), `ejecucion-avance.tsx`
    (`<progress>` + estado badge + pending-support counter), `project-ejecucion.tsx` mounted in
    `project-ficha-dialog.tsx` between `ProjectEstructura` and `ProjectHistorial`.
  - U7 (1601b93): write hooks (`useCreateAvance` with sign→upload→confirm or https link, void hooks, medicion and
    beneficiario create/void), `ejecucion-avance-form.tsx`, `ejecucion-indicadores.tsx`,
    `ejecucion-beneficiarios.tsx`, shared `VoidControl` in `estructura-ui.tsx`, gating in `project-ejecucion.tsx`.
  - Deviations: (8) membership gating is viable — `GET .../members` is readable by an active-member COORDINADOR, so
    write controls are `canManageProjects OR (COORDINADOR and active member)`, void managers-only. (9) Forms set
    `noValidate`: a native `max` date input swallowed the submit, so the inline "no posterior a hoy" guard is the
    authoritative UI message (the API still enforces it). (10) A medio is optional in the form ("Sin medio" /
    "Archivo" / "Enlace"); an avance without one stays visible as "Pendiente de soporte". (11) Every estado other
    than BORRADOR renders content (the read API permits any estado), not only EN_EJECUCION/SUSPENDIDO/CERRADO.
    (12) Per-activity badge renders the server-derived `estado`; the API exposes no per-activity color.
    (13) `project-list.test.tsx` mocks the whole `@/hooks/projects` module, so every new hook had to be added to
    that factory.

## Next step

S4 is complete (U1-U7). Pending, in this order: (1) native review per candidate (RDD, needs per-candidate human
consent — candidates `a42c45e` and `1601b93`, plus the earlier U1-U5 commits); (2) push / PR decision under ordinary
repository policy; (3) manual QA of the ejecucion section needs a project in EN_EJECUCION, which is unreachable from
the UI until S8.2 — use the guarded local `scripts/set-project-estado.ts`.
