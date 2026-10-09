# Muttu Hub v2 — S9 Dashboards, exports and territory removal (DSH §3.12; RF-30..RF-32)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§3.12 DSH, §4.11, §5.9), ledger `odd/tasks/v2-projects-execution.md`,
verified mapping `odd/tasks/v2-projects-s9-map.md` (read it: it holds the KPI formulas, the roles table, the batched
loader design, the bench plan and the defaults). Branch: `feat/projects-v2`.

## Objective

A user flagged `puede_ver_tablero_gerencial` reads a portfolio dashboard of KPIs across the projects they may see, and
every reader gets a per-project KPI panel inside the ficha. Excel exports of the dashboard and the financial sheet are
generated server-side; PDF is rejected with 400 (browser print later). The territory view is removed behind a guard.

## Decisions (defaults from the map §8; revisit with PO feedback)

- **R-collision (default)**: the aggregate route is `dashboard/portfolio`, NOT the SDD's `dashboard/projects`, which
  already exists on v6 branches and would give an add/add conflict. The user is told the E-28 path changed.
- D1 (N-23): Excel only; `formato=pdf` -> 400. A later default would be the existing `/print/dashboard` page.
- D2: "programados" entregables = those of activities due by the corte.
- D3: the portfolio is always `base=vigente`; the per-project endpoints accept `base=original`.
- D4: a COORDINADOR sees only the projects they are an active member of (A-02).
- D5: KPI rows exist only for `EN_EJECUCION` / `SUSPENDIDO` / `CERRADO`.
- D6: the UI lives at `/proyectos?vista=tablero`.
- D7: the migration for the flag runs locally only; a remote migration is a separate user-authorized step.
- `umbral1/2`, `tolerancia` and `retraso` remain **unconfirmed placeholders**: every payload surfaces `confirmado`.
- The cache table (S9.4 / ADR-12) is **not** warranted: write it only if the bench p95 > ~1.5 s. The batched loader
  (U3) is the fix for the real risk (a per-project loop).

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Per-unit gates: focused vitest, `npx tsc --noEmit`, eslint on touched files; one commit per unit.
- `exceljs` is already a dependency (S7). No new dependency and no version bump.
- Do not assert wall-clock time in vitest (CP-4 contention flakes); the bench script is the perf evidence.
- **Native review is unavailable in this runtime** (RDD is on globally, but `review assess` returns
  `high`/`unassessable`: only `claude-code` and `codex` are eligible). A high tier is therefore verified by writer
  self-verification **plus an independent read-only verifier**, with sabotage RED evidence for any correction. Do not
  disable RDD: the switch is the user's.
- Inherited debt (D-11 of S7): the branch arrived with no native review acknowledged anywhere and every slice unpushed.

## Tasks

Route: delegated writer per round, one commit per unit, then independent verification.

- [x] **U1** (03c45be, f853583) KPI pure libs (`src/lib/proyectos/kpis.ts` + test, ~300). RED: `cumplimientoCronograma` ignores
  activities ending after the corte and counts `FINALIZADA_CON_RETRASO` as late, denominator 0 -> null;
  `entregablesLogrados` requires the meta met AND a support; `cumplimientoIndicadores` caps at 1, excludes unmeasured
  and reports them in `sin_medir`; `beneficiariosVsMeta` with meta null/0 -> null; BORRADOR yields null financials;
  every KPI carries `corte`; `kpisPortafolio` = ΣE/ΣA weighted, not the simple technical mean.
- [x] **U2** (671b8e5, 8046fca) Gerencial flag (migration, schema, `projects.ts`, users PATCH/GET, `users-table`, ~200). RED: invariant
  (default false, column exists); `canReadProjectList` true for a flagged COLABORADOR through the real actor; the
  flagged user still gets 403 on every write gate; `PATCH users/:id` is ADM-only; the flag does not widen
  `canViewFinancialSupports`.
- [x] **U3** (60a1c06) Batched loader (`src/lib/api/kpis-portafolio.ts` + test, ~350): one query per table for ALL ids
  (`proyecto_id IN`), sums via `groupBy`/`$queryRaw`, never row loading. RED: constant call count for 1 vs 50
  projects (each `findMany`/`groupBy` called once); **parity** against `loadTecnicoStatus` + the financial-sheet total
  for the same fixture (corte before/inside/after the project; BORRADOR).
- [ ] **U4** Routes + bench (`dashboard/portfolio/route.ts`, `projects/[id]/kpis/route.ts`, OpenAPI,
  `scripts/migrate-v2/bench-dashboard.ts`, ~400). RED: 403 for an unflagged COLABORADOR and 200 for a flagged one;
  a COORDINADOR sees member projects only; filters (línea principal, cliente, responsable, estado, municipio); both
  semáforos and the state per project; no `por_territorio` key; corte echoed; bad corte 400; the per-project
  404 -> 403 -> 409 -> 400 order; `base=original`.
- [ ] **U5** Exports (`src/lib/proyectos/export-xlsx.ts`, export routes, ~380). RED: the workbook opens with `exceljs`
  and has the expected sheets; the financiera total row equals the `computeFicha` total; no tercero/soporte header for
  ADM, COORD-M and a flagged VIS; an `EXPORTAR` audit row is written and an audit failure does not fail the download;
  `formato=pdf` -> 400.
- [ ] **U6** UI (`project-dashboard.tsx`, `project-kpis-panel.tsx`, hooks, tabs in `/proyectos`, ~400). RED: the tab is
  hidden for an unflagged COLABORADOR; colors render from the payload without recomputation; filters change the query
  key; empty state; the export button hits the route; the ficha shows the KPI panel and the "no confirmado" badge.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; eslint clean on touched files; full vitest
  green under `TZ=America/Bogota` (known load-flakes recorded honestly).
- The batched loader's call count is constant in the number of projects, and its numbers match the per-project
  endpoints (parity), which is the correctness proof for the aggregate.

## Progress

- 2026-10-08 (22:20): document created at takeover, from the map the previous session left uncommitted (it stopped
  right after the mapping: no S9 execution document and no S9 code existed). The map and this document are committed
  together.
- Inherited state at takeover: S7 (U1-U7) and S8 (U1-U6) are closed locally, but **both leave independent
  verification as their recorded next step** and neither has it; the branch is 108 commits ahead of origin with
  nothing pushed and no native review acknowledged anywhere.

- 2026-10-09 (round 1, U1-U3, one bounded writer; local DB only via `node --env-file=.env.local`):
  - U1 (03c45be; f853583 fixes bigint literals the ES2017 `tsc` target rejects). RED: 0 tests ran (module missing); GREEN
    28/28. API: `kpisProyecto`, `kpisNoMedible`, `kpisPortafolio`, `cumplimientoCronograma`, `entregablesLogrados`,
    `cumplimientoIndicadores`, `beneficiariosVsMeta` in `src/lib/proyectos/kpis.ts`. Blocks: `tecnico`, `cronograma`,
    `entregables`, `indicadores` (+`sin_medir`, `sin_medir_ids`), `beneficiarios`, `financiero` (bigint cents A/P/E,
    `ea`/`ep` as 1-decimal percentages, `color`, `alerta_retraso`); each carries `corte`; `medible=false` -> all null.
    `confirmado` = umbral1/2, tolerancia and retraso all confirmed (the sheet's own flag covers only the last two).
  - U2 (671b8e5). RED: invariant 2/2, users route 2 and actor tests failing; then GREEN (101 tests in the touched
    areas). Migration `20261012120000_v2_gerencial_flag` (`ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT false`),
    applied with `migrate deploy` to 127.0.0.1:54322 only, `generate` ran, `migrate diff` = "No difference detected".
    `UNRESOLVED_GERENCIAL_FLAG` replaced by `usuario.puede_ver_tablero_gerencial`; users GET/PATCH select and accept it
    (ADM-only gate, 403 test); `users-table` has the "Ve el tablero gerencial" checkbox (COLABORADOR rows).
    Consequence found by the full suite: the `financial-sheet` access test had a VIS fixture already carrying the flag
    and expected 403 "until its flag exists"; it now expects 200 flagged / 403 unflagged (8046fca). The remote DB still
    lacks the column (D7): the remote migration is a separate user-authorized step.
  - U3 (60a1c06). `src/lib/api/kpis-portafolio.ts` `loadKpisPortafolio({proyectos, corte, parametros})` -> `Map<id,
    KpisProyecto>`: 8 queries total (actividad+entregables, avances, soporte `groupBy`, indicador+mediciones, and four
    `groupBy` sums), each called once for 1 and for 50 projects, zero queries when nothing is measurable. Deviation: the
    loader was written before its test (RED was then obtained by removing the loader: import failure; plus a sabotage
    run, dropping the gasto period filter and the soporte `deleted_at` filter, made 2 parity cases fail). Parity runs
    against an in-memory Prisma fake (same fixture feeds `loadTecnicoStatus` and `computeFicha`), cortes before/inside/
    after the project. No live-DB parity yet: the bench (U4) is the live check.
  - Gates: focused vitest green, `npx tsc --noEmit` clean, eslint clean on touched files, full suite 2744/2745 with the
    single failure being the financial-sheet fixture above (fixed): no load-flakes seen this run.

## Next step

Round 2 (U4-U6). U4: routes + bench. Build `GET dashboard/portfolio` (gate: `canReadProjectList(u)` or `rol ===
COORDINADOR`; rows through `projectListWhere`, then `loadKpisPortafolio` over `proyectos` rows of
`{id, estado, fecha_inicio, fecha_fin, beneficiarios_meta}` with `getSemaforoParametrosV2()`; response per project
uses `kpisProyecto` blocks, bigint cents serialized with `fromCents`; aggregate from `kpisPortafolio(list, corte)`).
`GET projects/:id/kpis` is not batched: call `loadKpisPortafolio` with that single project (same code path) except
`base=original`, which needs the `resolverBase` snapshot (feed the frozen structure/budget the way `loadTecnicoStatus`
`estructura` and `rubrosDelOriginal` do; the loader currently covers vigente only, so add an optional frozen-structure
input there if parity with the sheet is needed). Corte: calendar date `AAAA-MM-DD`, default `todayInBogota()`, 400 on a
bad one. Bench per the map section 7. Then U5, U6 as listed.
