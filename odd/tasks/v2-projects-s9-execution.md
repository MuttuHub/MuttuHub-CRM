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
- [x] **U4** (6df4b13, 8cab543) Routes + bench (`dashboard/portfolio/route.ts`, `projects/[id]/kpis/route.ts`, OpenAPI,
  `scripts/migrate-v2/bench-dashboard.ts`, ~400). RED: 403 for an unflagged COLABORADOR and 200 for a flagged one;
  a COORDINADOR sees member projects only; filters (línea principal, cliente, responsable, estado, municipio); both
  semáforos and the state per project; no `por_territorio` key; corte echoed; bad corte 400; the per-project
  404 -> 403 -> 409 -> 400 order; `base=original`.
- [x] **U5** (23cb5a9, e6b0616; refactors f02c717, 81f0fcd) Exports (`src/lib/proyectos/export-xlsx.ts`, export routes, ~380). RED: the workbook opens with `exceljs`
  and has the expected sheets; the financiera total row equals the `computeFicha` total; no tercero/soporte header for
  ADM, COORD-M and a flagged VIS; an `EXPORTAR` audit row is written and an audit failure does not fail the download;
  `formato=pdf` -> 400.
- [x] **U6** (8d1c544, 6ff6bab) UI (`project-dashboard.tsx`, `project-kpis-panel.tsx`, hooks, tabs in `/proyectos`, ~400). RED: the tab is
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
- 2026-10-09 (round 2, U4-U6, one bounded writer; local DB only, bench via Windows `node.exe --env-file=.env.local`
  because `node_modules` holds the win32 esbuild). Baseline full suite before starting: 269 files / 2745 tests green.
  - U4. Loader got the optional frozen input (`original: {proyectoId, snapshot}`: structure, start date, A, P and
    beneficiarios_meta from v0; avances, mediciones and E stay live), because the per-project `base=original` is in D3 and
    the sheets already support it. RED: 2 tests failed (input ignored), then 11/11 with parity against `loadTecnicoStatus`
    given the same `estructura`. Routes `dashboard/portfolio` (gate `canReadProjectList || COORDINADOR`, rows through
    `projectListWhere`) and `projects/:id/kpis` (404 -> 403 -> 409 -> 400, `base`); RED: modules missing, then 20/20.
    Helpers `src/lib/api/kpis-http.ts` (corte parser, bigint -> decimal string). OpenAPI `paths/project-kpis.ts` (RED: 1 test
    failing, then 19/19). Bench `scripts/migrate-v2/bench-dashboard.ts` (+ pure `bench-stats.ts`, written together with its
    4 tests, no separate RED): 50 BENCH- projects x 20 activities x 3 deliverables x 30 VALIDADO expenses (3000 avances,
    1500 gastos, 1800 programacion cells) on 127.0.0.1:54322; 1 warm-up + 10 runs of project query + loader + aggregate:
    **min 40.4 / p50 45.8 / p95 68.0 / max 68.0 ms**; PASS (< 3 s) and the cache table is NOT warranted (< 1.5 s). The seeded rows were
    deleted in `finally` (checked: 0 BENCH- projects/users/gastos left). Output JSON in the gitignored `scripts/migrate-v2/out/`.
  - U5. `src/lib/proyectos/export-xlsx.ts` (`xlsxFichaFinanciera`, `xlsxFichaProyecto`, `xlsxPortafolio`, `celdaTexto`
    formula guard, `assertSinEncabezadosProhibidos`): RED = module missing, then 17/17 (workbook reopened with exceljs; the
    total row equals `computeFicha`'s). Routes `projects/:id/export?ficha&formato&corte&base` and
    `dashboard/portfolio/export` (cap 500 rows, 403 before the `formato` 400, `EXPORTAR` audit best-effort, `formato=pdf` -> 400):
    RED = routes missing, then 19/19. To avoid forking the numbers, the financial-sheet computation moved to
    `src/lib/api/financial-sheet.ts`, the portfolio read to `src/lib/api/portafolio.ts` and the single-project KPIs to
    `src/lib/api/kpis-proyecto.ts` (behavior-preserving; the existing route tests stayed green: 16 + 12).
  - U6. Hooks `useProjectKpis`, `useProjectsPortfolio`, `downloadProjectExport`, `downloadPortfolioExport` (RED 6/6 then green);
    `CurrentUser.puede_ver_tablero_gerencial` (`/auth/me` already returns the full row); `ProjectKpisPanel` in the ficha
    between Ejecución and Financiero (7 tests; a payload whose color contradicts its numbers is painted verbatim);
    `ProjectDashboard` (10 tests: filters change the query filters, empty/loading/error, export button, no "territorio");
    `ProyectosVista` tabs on `/proyectos?vista=tablero` (hidden for an unflagged COLABORADOR, even by URL; 11 tests);
    `project-list.tsx` now reads the real flag instead of the hardcoded `false`. `project-list.test.tsx` (mocks the hooks
    wholesale) got `useProjectKpis`/`downloadProjectExport` stubs; `project-ficha-dialog.test.tsx` got a `/kpis` fetch branch.
  - Territory removal: nothing to remove here (map section 4). Guards: portfolio payload has no `por_territorio`, OpenAPI does
    not mention it, the dashboard renders no "territorio" text; `rg -in "por_territorio|territorio" src` = only comments.
  - Gates: focused vitest per unit green; `npx tsc --noEmit` clean before every commit; eslint clean on touched files
    (the 2 `invite` warnings are pre-existing and elsewhere); full suite **279 files / 2843 tests green** under `TZ=America/Bogota`,
    no load-flakes seen.
  - Deviations: (1) role-aware redaction is structural, as decided in the map: every readable role gets only aggregates and no
    workbook has a gasto, tercero or soporte column (pinned per role ADM, COORD-M, flagged VIS + a guard that refuses such a header);
    there is no per-role column branching. (2) The `formato=pdf` copy is "Formato no disponible. Por ahora solo se exporta en Excel (xlsx).".
    (3) The `linea_id` filter matches any linked line (as the list does); the row carries `linea_principal`. (4) Bench stats
    written together with their tests. (5) Native review unavailable in this runtime (see Constraints): high tier -> needs the
    independent verifier.

## Next step

Independent read-only verification of S9 (U1-U6; high tier, no native review here) and, with the user's authorization, the
remote migration of the gerencial flag (D7). Open questions for the PO: confirm the semáforo parameters (the UI shows
"No confirmado" until then), PDF format (N-23), and the `dashboard/portfolio` path replacing the SDD's `dashboard/projects`.
Merge note for when `feat/v6-visual-alignment` / `local/todo-integrado` land: delete their `dashboard/projects/route.ts(.test)`,
`cara-management(.test)` and the territory block of `print-dashboard.tsx`.
