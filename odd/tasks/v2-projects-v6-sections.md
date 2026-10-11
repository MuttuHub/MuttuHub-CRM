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
- [ ] **P4** Ficha with 8 tabs per D10 (move the structure sections, lazy-mount tests, keep Cambios).
- [ ] **P5** `GET projects/:id/attention` (server-derived list: rubro sobreejecución, late activities, avances sin soporte, indicators below target, alerta de retraso, gastos observados) + `requiere-atencion.tsx`.
- [ ] **P6** Technical-status activities enriched (`programado`, `dias`, `al_corte`, `color`, `sin_soporte`, objective roll-ups); Metas e indicadores and Cronograma views.
- [ ] **P7** S-curve: pure `src/lib/proyectos/curva.ts` + tests, `GET projects/:id/curve?base=` returning `{ base, corte, periodos: [{ periodo, tecnico: { planeado, ejecutado|null }, financiero: { planeado, ejecutado|null } }] }`,
  loader change (all non-voided avances filtered in memory per month), SVG curve (ported/adapted `CurveSChart`), Avance monthly table, multi-month fixture. Needs D1, D2.
- [ ] **P8** Presupuesto: gauge (ported `Tacometro`) + planned vs executed bars per rubro from the existing `financial-sheet`. Needs D4.
- [ ] **P9** Tablero gerencial: portfolio curve, `por_linea` radar (ported `Radar`), gauge, per-project cronograma/entregables bars, territory table (D7), `agregado.por_linea`.

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

## Next step

P4: restructure the ficha dialog from the current 6 tabs to the 8 of D10 (Resumen, Metas e indicadores, Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios), relocating the existing `ProjectEstructura`
content into Metas e indicadores / Cronograma / Gantt, keeping Cambios last and the lazy mounting; then P5 (attention endpoint + `requiere-atencion.tsx`), P6 (enriched activity status + the two views), P7
(S-curve), P8 (Presupuesto gauge), P9 (Tablero gerencial). Native review of P1-P4 as small candidates has to run in Claude Code (OpenCode is ineligible).
