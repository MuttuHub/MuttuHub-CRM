# Muttu Hub v2 — S14 Projects sections brought to the v6 design (incl. the S-curve)

Parent plans: `odd/tasks/v2-projects-sdd.md`, `odd/tasks/v2-ui-v6-base.md` (S13, done: tokens, primitives, surfaces, guards). Delivery chain: `odd/tasks/v2-projects-delivery-chain.md`.
Branch: `feat/projects-v2`. Feature id: `v2-projects-v6-sections`. Engram mirror topic: `odd/v2-projects-v6-sections/tasks`.
Design sources (the user's Claude Design exports, dark-only): `Muttu Hub v6.dc.html`, `Pantallas - Documento Proyectos.dc.html`, `Requerimientos vs pantallas.dc.html` in
`/mnt/c/Users/Adrian/Downloads/Web app views creation/`. Rendered design shots (session scratchpad): `.../scratchpad/uicmp/design-07..19-*.png`; current app shots: `.../scratchpad/uiafter-u6c/`.

## Objective

After the S13 base, the Projects screens still differ structurally from v6 (user: "no va acorde a ... Muttu Hub v6"). The user chose the FULL scope (2026-10-11): Portafolio with KPIs and progress bars,
ficha Resumen with KPI cards and "Requiere atención", Estructura split into tabs, Avance as a read view with an S-curve and a monthly table, Presupuesto with a gauge and planned vs executed per rubro,
Gastos as a ledger with KPIs and filters, and the Tablero gerencial with gauge, S-curve and radar.

## Scope change (user-approved)

`odd/tasks/v2-projects-sdd.md:213` lists "S-curve and financial close projection" as OUT of scope. The user now requests the S-curve: it is IN for this feature. The v6 audit also warns that the old v1 curve mixed
technical schedule with spend: build TWO separate curves (technical and financial).

## Verified facts (read-only exploration 2026-10-11; evidence paths in the exploration report, summarized)

- Per-project KPIs: `GET projects/:id/kpis` (`kpisProyecto`, `src/lib/proyectos/kpis.ts:210`; type `ProjectKpis`, `src/hooks/projects.ts:~1907`): `corte`, `estado`, `medible`, `confirmado` ("No confirmado" flag),
  `base`, and blocks `tecnico` (avance_real, avance_programado, desviacion_pp, color), `financiero` (asignado, programado, ejecutado, ea, ep, color, alerta_retraso), `cronograma` (vencidas, a_tiempo, valor),
  `entregables` (programados, logrados, valor), `indicadores` (valor, medidos, sin_medir, sin_medir_ids), `beneficiarios` (total, meta, valor). All null when not `medible` (BORRADOR, PLANIFICACION, CANCELADO).
- Portfolio: `GET dashboard/portfolio` (`src/lib/api/portafolio.ts:62-116`, shared loader `loadKpisPortafolio` in `src/lib/api/kpis-portafolio.ts:57`): rows with `semaforo_tecnico`, `semaforo_financiero`,
  `alerta_retraso`, `linea_principal`, `kpis`; `agregado` with technical mean, financial sums and colour counts. Gaps: no `atrasadas` count, no beneficiaries aggregate, no `en_meta` count of indicators, only
  tecnico and financiero carry a colour, the portfolio rows lack `valor_total`/`municipios` (merge with the list by id).
- Monthly data exists: `ProgramacionPeriodo` (`periodo` "AAAA-MM", planned money per budget line) and `Gasto` (`estado` REGISTRADO/VALIDADO/RECHAZADO/ANULADO, `periodo`). There is no "observado" state.
- Pure helpers to reuse for the technical curve: `calcularTecnico`, `avanceProgramado`, `pesoEfectivo`, `activityDates`, `projectPeriods`, `periodOf` (`src/lib/proyectos/*`). The KPI loader filters avances by `fecha <= corte`.
- The demo seed is thin for curves: PRY-2026-001 has avances and gastos only in 2026-10 (programming covers 2026-10..2027-01): tests need a richer multi-month fixture.
- Charts: the app has no chart library; components are hand-rolled SVG with tokens. `Tacometro`, `Radar` and `CurveSChart` (SVG, no DOM measurement) exist ONLY on branch `feat/dashboard-management-csv-export`
  (`src/components/dashboard/{tacometro,radar,curve-s-chart}.tsx` + tests): PORT them, do not merge that branch. They are not on this branch.
- Today the management view is `/proyectos?vista=tablero`; `/tablero` is the task Kanban. The ficha has 6 tabs (Resumen, Estructura, Avance, Presupuesto, Gastos, Cambios); v6 has 10 and no "Cambios".

## Decisions (defaults confirmed by the user 2026-10-11; the product owner has not confirmed the business thresholds)

- D1 planned technical curve = linear by days at month end (existing REQ-TEC-03 formula), no manual PlanMensual table. D2 replanning = two lines: planned original (v0) vs vigente.
- D3 "atrasada" = activity with `fin <= corte` and progreso < 100 %. D4 semáforo bands stay 10/20 pp read from the parameters (the design legend says 5/20: render the legend from the parameters, never hardcode);
  no under-execution bands until the PO confirms; everything business-threshold related keeps the "No confirmado" badge.
- D5 "gasto observado" (not a state) = REGISTRADO with `alerta_sobregasto` or incomplete data. D6 dots on KPI cards without a semáforo are neutral. D7 territory: a project counts in every department it touches.
- D8 "Presupuesto activo" = sum of `valor_total` of EN_EJECUCION projects. D9 default activity weight stays weeks-based (still unconfirmed).
- D10 tab structure (8): Resumen, Metas e indicadores, Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios. `Estructura` is removed as a tab: its BORRADOR edit tree moves into Metas e indicadores (read-only
  outside BORRADOR), import stays there; Cronograma and Gantt are read-only; Cambios (Modificaciones, Versiones, Historial) stays last and unchanged; lazy mounting is kept.
- D11 the client never recomputes semáforos: the server returns the band/colour. D12 new charts are inline SVG using the theme tokens, respect `prefers-reduced-motion`, no DOM measurement.

## Units (each ~400 changed lines or less; strict test-first; delegated writer; verification by the parent; native review per small candidate)

- [x] **P1** Portafolio: `portafolio-kpis.tsx` (4 KPIs with `KpiTile`), project list with technical and financial `ProgressBar`s (server band), merge portfolio rows with the list by id; `agregado` gets `atrasadas` and
  beneficiaries. Needs D3, D8.
- [x] **P2** Resumen: 6 KPI cards (técnico, financiero, cronograma, indicadores, entregables con soporte, beneficiarios) from the existing KPI data, `indicadores.en_meta` count, neutral dots (D6); move the KPI tiles
  out of the Avance tab.
- [x] **P3** Gastos ledger: KPIs (total, validados, por validar, observados per D5), chip filters, `con_soporte` counts in the `expenses` response.
- [x] **P4** Ficha with 8 tabs per D10 (move the structure sections, lazy-mount tests, keep Cambios).
- [x] **P5** `GET projects/:id/attention` (server-derived list: rubro sobreejecución, late activities, avances sin soporte, indicators below target, alerta de retraso, gastos observados) + `requiere-atencion.tsx`.
- [x] **P6** Technical-status activities enriched (`programado`, `dias`, `al_corte`, `color`, `sin_soporte`, objective roll-ups); Metas e indicadores and Cronograma views.
- [x] **P7** S-curve: pure `src/lib/proyectos/curva.ts` + tests, `GET projects/:id/curve?base=` returning `{ base, corte, periodos: [{ periodo, tecnico: { planeado, ejecutado|null }, financiero: { planeado, ejecutado|null } }] }`,
  loader change (all non-voided avances filtered in memory per month), SVG curve (ported/adapted `CurveSChart`), Avance monthly table, multi-month fixture. Needs D1, D2.
- [x] **P8** Presupuesto: gauge (ported `Tacometro`) + planned vs executed bars per rubro from the existing `financial-sheet`. Needs D4.
- [x] **P9** Tablero gerencial: portfolio curve, `por_linea` radar (ported `Radar`), gauge, per-project cronograma/entregables bars, territory table (D7), `agregado.por_linea`.

## Constraints

- Local DB only (`.env.local`; `.env` is a REMOTE Supabase with real data). The Next dev server runs on Windows (`http://172.30.48.1:3000` from WSL; Playwright via Windows npx ignores `PLAYWRIGHT_BASE_URL` set in WSL:
  hardcode it in temp specs, override `video: "off"` and `slowMo: 0`; its `/tmp` writes land in `C:\tmp` = `/mnt/c/tmp`). Read-only browsing for screenshots, no data writes.
- Next 16.3.0 has breaking changes (`AGENTS.md`): read `node_modules/next/dist/docs/` before route-handler work. New endpoints follow the existing route conventions (auth, scoping by membership, error shapes, OpenAPI
  docs under `src/lib/openapi/paths`, route tests).
- The S13 guards must stay green (`surface-guards`, `control-guards`, `table-guards`, `design-guards`, `src/test/guard-utils.ts` helpers): new components use `surface`/`surface-inner`/`rounded-card`/`rounded-inner`,
  the primitives (`KpiTile`, `ProgressBar`, `StatusChip`, `EmptyState`, `Table`), no shadows, `text-base md:text-[N]` on small controls, tokens only (light AND dark).
- Authorization: coordinators see only projects where they are members; new endpoints reuse the scoping of the existing KPI endpoints; financial supports visibility rules are unchanged.
- Artifacts in English; UI copy Spanish matching the surrounding strings. Conventional commits, no AI attribution lines. No push, no PR. ~400 authored changed lines per task is a planning heuristic only.

## Acceptance (per unit, plus overall)

Each unit: the new/changed screen matches the v6 structure in both themes (verified with after-shots vs the design shots and the current ones), the numbers shown equal the API values (no client-side semáforo recompute),
tests first (RED then GREEN), full suite + `tsc` + eslint green, guards green, native review of the unit candidate approved. Overall: the Projects module reads like v6 end to end, with the business thresholds still
labelled "No confirmado".

## Delivery strategy

`ask-on-risk`, `chain_strategy = feature-branch-chain` (see the delivery chain doc). New slices after US13: US14 = P1-P4, US15 = P5-P6, US16 = P7, US17 = P8-P9 (forecast well above 400 lines in total; each unit near
400 where possible). Local work-unit commits only; no push, no PR. Native review per small candidate (the lens context budget fails above ~60 files / ~1,500 lines: keep candidates under ~40 files and use detached
worktrees for non-suffix candidates, as in S13).

## Progress

- 2026-10-11: document created after the read-only exploration (data availability, formulas, plan) and the user's decisions: scope FULL incl. the S-curve; the 9 defaults adopted; start with P1-P4.
- 2026-10-11 (Claude Code session, recorded here by the OpenCode continuation): P1 done — `e63ce6a` (portfolio aggregate `atrasadas` + beneficiaries),
  `84c469e` (`portafolio-kpis.tsx`, 4 KPI tiles) and `e117910` (technical and financial `ProgressBar`s in `project-list.tsx`, server band). P2 done — `dd5ad0f` (`indicadores.en_meta` count in
  `GET projects/:id/kpis` and its OpenAPI) and `8e3b34b` (`resumen-kpis.tsx`, the six cards in the Resumen tab, plus `src/lib/format/millones.ts`). P3 done — `bec2c55` (`soportes_count` + `resumen` in the
  `expenses` response with route/OpenAPI/lib tests), `72c5d4b` (`gastos-kpis.tsx` KPI row) and `d5a80f5` (the ledger table, chip filters, mobile cards, per-filter empty state).
- 2026-10-11 (OpenCode continuation): P3 verified by the parent — focused suite 4 files / 83 tests, **full suite 307 files / 3225 tests green** under `TZ=America/Bogota`, `tsc --noEmit` 0 errors,
  eslint clean on the three touched files — then committed as `d5a80f5`. **Native review of P1-P3 not run**: the OpenCode runtime is not eligible for immutable receipt review
  (`gentle-ai review assess` -> `high`/`unassessable`; only Claude Code and Codex are eligible), same constraint recorded in S9/S10. Independent read-only verification is the substitute; deferred to the
  parent when a slice is closed.
- 2026-10-11 (OpenCode continuation): **P4 done** — `9a899e2` `feat(proyectos): split the ficha into eight tabs with a weekly schedule`. `FICHA_TABS` is now the 8 of D10 (Resumen, Metas e indicadores,
  Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios); `ProjectEstructura` lost its Gantt (now its own tab) and feeds the Metas e indicadores tab; new read-only `project-cronograma.tsx` groups
  activities by start week (reusing the shared `ActivitySummary`, whose `responsable`/`actions` props became optional); lazy mounting untouched. Parent verification: proyectos suite 37 files / 391 tests,
  **full suite 308 files / 3234 tests green** under `TZ=America/Bogota`, `tsc --noEmit` 0, guards green. Deviation recorded: the Metas tab still shows the old "Estructura técnica" section header (P6 relabel),
  and Cronograma groups by start week (P6 may reshape to the v6 días/% column set).

- 2026-10-11 (OpenCode continuation): **P5 done** — `199609a` `feat(proyectos): add the server-derived attention list and its Resumen card`. New pure `src/lib/proyectos/atencion.ts` (6 stable tipos, reuses
  `calcularTecnico` for D3 and `esObservado` for D5), loader `src/lib/api/atencion.ts` (reuses `calcularKpisProyecto` so `medible`/`corte`/`alerta_retraso` cannot drift), `GET projects/:id/attention` with the KPI
  route's auth/membership scoping (404→403→409→400), OpenAPI path registered by side-effect import, `useProjectAttention`, and `requiere-atencion.tsx` mounted in Resumen. Parent verification: **full suite 312 files /
  3267 tests green** under `TZ=America/Bogota`, `tsc --noEmit` 0, guards green. Deviations: only `?corte` supported (no `base`); `avance_sin_soporte` lists any non-voided avance up to the corte without a live support
  regardless of `avance_requiere_medio`; the loader runs the KPI loader plus its own batch.

- 2026-10-11 (OpenCode continuation): **P6 done** — `948ab9f` `feat(proyectos): enrich the technical-status activities and objective roll-ups` (per-activity `programado`/`dias`/`al_corte`/`color`/`sin_soporte` + the
  `objetivos[]` roll-up block in the payload, route/hooks/OpenAPI/`actividad.ts`), `ac2f5ad` `feat(proyectos): reshape the Cronograma to the v6 activity table` (v6 columns días/% plan/% real/soporte, server
  colour), `fa0b882` `fix(proyectos): group the cronograma by objective regardless of week order` (a real defect the writer left uncommitted when the power cut: the grouping only merged consecutive objectives),
  and `31bd560` `feat(proyectos): show the objective roll-ups in the Metas e indicadores view` (relabel from "Estructura técnica" + the per-objective roll-up block, one technical-status call passed down as a Map,
  silent when absent). Parent verification: **full suite 313 files / 3287 tests green** under `TZ=America/Bogota` (one load flake on the first run, clean on re-run), `tsc --noEmit` 0, guards green. Notes: the
  technical-status endpoint is readable in any estado, so a draft with dates still paints roll-ups; `formatPct` is duplicated from the Cronograma because shared helpers were outside the surfaces.

- 2026-10-12 (OpenCode continuation): **P7 done** — `96b8a1f` `feat(proyectos): add the pure S-curve math and its multi-month fixture` (pure `curva.ts`: `tecnicoPlaneado` linear by days at month end D1,
  `construirCurva` with the two separate series, `ejecutado: null` after the corte; fixture F-C1), `ea9934d` `feat(proyectos): expose the project S-curve endpoint` (`GET projects/:id/curve?base=vigente|original`,
  loader `src/lib/api/curva.ts` reading all non-voided avances once and bucketing per month, `tecnico.ts` helpers exported for reuse, OpenAPI path), `09ff0b0` `feat(proyectos): paint the S-curve and its monthly table
  in the Avance tab` (ported `curve-s-chart.tsx` inline SVG, two labelled panels, monthly table, reduced-motion-gated). Parent verification: **full suite 317 files / 3325 tests green** under `TZ=America/Bogota`, `tsc
  --noEmit` 0, guards green. Deviations: the writer knowingly exceeded the ~600-line heuristic (~1478) to finish item 4 instead of leaving a dead component; no `?corte` (derived, clamped like `financial-sheet`);
  curves are percentages; the corte month counts the whole month's validated spend while the technical curve measures at the corte date.

- 2026-10-12 (OpenCode continuation): **P8 done** — `733eafb` `feat(proyectos): paint the budget gauge and the per-rubro bars in Presupuesto`. Ported `Tacometro` as `src/components/proyectos/tacometro.tsx`
  (inline SVG, fixed viewBox, no measurement, reduced-motion gated, token strokes) and rendered the executed-vs-assigned gauge plus one planned-vs-executed bar per rubro inside `project-financiero.tsx` (the
  Presupuesto tab's financial sheet, so no duplicate fetch). Parent verification: **full suite 318 files / 3343 tests green** under `TZ=America/Bogota`, `tsc --noEmit` 0, guards green. Deviations: the gauge takes
  explicit server-derived `bandas` instead of the design's unconfirmed 60/80 subexecution bands (D4), the needle colour is the server's `total.color` and the value `total.ea_decimas/10` (no client recompute, D11);
  residual risk noted: in a rare `E > A` case the clamped needle can sit in a green band while the server colour is rojo. Screenshot verification in light/dark is pending (no browser access from the writer).

- 2026-10-12 (OpenCode continuation): **P9 done** — `c800e40` `feat(proyectos): aggregate the portfolio by strategic line` (`agregado.por_linea`, computed in `portafolio.ts` because `kpis.ts`/`kpis-http.ts` were
  outside the surfaces; route/OpenAPI/DTO), `8777db0` `feat(proyectos): port the radar primitive for the gerencial tablero`, `e2f661d` `feat(proyectos): build the gerencial Tablero` (reuses `CurveSChart` and `Tacometro`,
  adds the radar, the per-project cronograma/entregables bars and the territory table built by merging the list by id, D7; filters and export preserved). Parent verification: **full suite 320 files / 3364 tests green**
  under `TZ=America/Bogota`, `tsc --noEmit` 0, guards green. A regression in the export route test (its `kpis-portafolio` mock) was caught and avoided by not adding an export there. Remaining deviation: the Tablero
  S-curve reuses the curve of a selected visible project, not a portfolio-aggregated monthly series — a true portfolio curve needs a new server aggregate (not in scope of the allowed surfaces).
- 2026-10-12 (OpenCode continuation): **independent read-only verification of the S14 slice** (`e63ce6a..HEAD`, the in-runtime substitute for the native review). Verdict `READY: yes`, no BLOCKER/MAJOR.
  Sound: the curve math (`finDeMes` incl. leap, `tecnicoPlaneado`, trailing-null semantics, half-up rounding), D1/D2, D3 agreement with `cumplimientoCronograma`, the single D5 `esObservado` shared by four
  consumers, `resumenObjetivos`, D7 territory counting, and D11/D12 (no client semáforo recompute in colours, no chart library, no DOM measurement). Findings fixed in `1c3f9ca`: (1) the gerencial Tablero
  recomputed the entregables percentage in the client (`Math.round`) instead of using the server value — its test was hollow (the 3/4 fixture coincided); now it paints `kpis.entregables.valor` and the test uses
  1/3 (server 33.3 vs client 33); (2) `diasAlCorte` could return a negative "Al corte" on an inverted range — guarded. Open (not fixed, minor): the S-curve geometry (path coordinates) is not asserted, and
  `actividad_atrasada` is a permanent flag for a deliverable-less activity (matches the letter of D3).

## S14 status

All nine units (P1-P9) are implemented, committed locally and green (**full suite 320 files / 3364 tests**). Nothing was pushed and no PR exists.

UPDATE 2026-10-13 (Claude Code session): the independent read-only verification is DONE (see Progress, `1c3f9ca`) and the SCREENSHOT verification is DONE (66 PNGs, both themes, 1440 and 390, PRY-2026-001 and
PRY-2026-002, the Portafolio, the 8 tabs, the coordinador Gastos view and the gerencial Tablero; the worker viewed all but one; the parent re-verified the two worst findings by reading the code and viewing the
shots). The numbers agree with the API (Resumen cards, curve end point, gauge value, financial totals) and there are no console errors or HTTP >= 400 responses. Defects found (evidence PNGs in the session
scratchpad `uiafter-s14/`):
- MAJOR: `tacometro.tsx:52` `large = hasta - desde > 50 ? 1 : 0` draws any band longer than 50 the long way round (the red 27.5-100 band): the Presupuesto gauge arc overflows its panel and covers the Corte/Base selects.
- MAJOR: the gerencial Tablero overflows horizontally at 390 px (scrollWidth 717 vs 390; wide filter selects, territory table); the Radar with ONE strategic line renders as a vertical line and a dot.
- MAJOR at 390: the Cronograma table crops its columns (% real, semáforo, soporte) inside its card; the page h1 ("Proyectos") is clipped by the header buttons (also seen in S13 baselines for Reportes/Documentos).
- MINOR: "1 de 1 actividades a tiempo" / "1 a tiempo de 1 vencidas" (`resumen-kpis.tsx:~142`, `project-kpis-panel.tsx:~147`); the attention list shows an ISO date and ".:" punctuation; the Avance tab still ends
  with the old KPI block (duplicates the Resumen cards); a BORRADOR project shows "Semáforo: Amarillo/Rojo" in Metas and Cronograma; Gastos money KPIs wrap at 390; the Tablero gauge needle overlaps its value;
  curve semantics: the planned technical value of the corte month is evaluated at month end (69.4 %) while the executed dot and the KPI plan are at the corte (32.1 % vs 18.4 %), so the curve looks like a large gap
  while the semáforo is Verde; the Gantt has no fill/colour/corte line; Metas indicator rows are plain text; the Cambios tab is very tall. With ONE month of demo data the curve reads as intended (a dot plus a dashed plan).
Fix plan (all inside the S14 surfaces; strict test-first; a NEW geometry assertion for the gauge so the test is not hollow): F1 charts (gauge arc and needle, radar fallback to bars below 3 axes, D13: the planned
value of the corte month is evaluated at the corte); F2 responsive 390 (Tablero overflow, Cronograma mobile cards, shell header title, Gastos KPI wrap); F3 copy and polish (singular/plural, attention text,
duplicate Avance block, draft semáforos). Deferred (needs design or product input): Gantt fill/colour/corte line, Metas indicator bars, Cambios length, portfolio-aggregated curve.
D13 (decision taken by the parent, to be confirmed by the user): for the month that contains the corte, the planned technical value is evaluated at the corte date (consistent with the KPI and the semáforo);
past months and future months keep the month-end rule of D1.

Pending, in order:
1. **Fixes F1-F3** from the screenshot verification, then a re-run of the screenshots.
2. **Native review** of the whole S14 slice (see below), after the fixes.
3. **Native review** of P1-P9 as small candidates — must run in Claude Code (OpenCode is ineligible for immutable receipt review).
4. Optional: the portfolio-level aggregated S-curve; per-rubro financial curve; the PO's unconfirmed business thresholds (umbral amarillo, "En curso" colour).
