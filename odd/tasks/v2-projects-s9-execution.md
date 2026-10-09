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

- [ ] **U1** KPI pure libs (`src/lib/proyectos/kpis.ts` + test, ~300). RED: `cumplimientoCronograma` ignores
  activities ending after the corte and counts `FINALIZADA_CON_RETRASO` as late, denominator 0 -> null;
  `entregablesLogrados` requires the meta met AND a support; `cumplimientoIndicadores` caps at 1, excludes unmeasured
  and reports them in `sin_medir`; `beneficiariosVsMeta` with meta null/0 -> null; BORRADOR yields null financials;
  every KPI carries `corte`; `kpisPortafolio` = ΣE/ΣA weighted, not the simple technical mean.
- [ ] **U2** Gerencial flag (migration, schema, `projects.ts`, users PATCH/GET, `users-table`, ~200). RED: invariant
  (default false, column exists); `canReadProjectList` true for a flagged COLABORADOR through the real actor; the
  flagged user still gets 403 on every write gate; `PATCH users/:id` is ADM-only; the flag does not widen
  `canViewFinancialSupports`.
- [ ] **U3** Batched loader (`src/lib/api/kpis-portafolio.ts` + test, ~350): one query per table for ALL ids
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

## Next step

First, close the inherited verification debt the previous session recorded as pending: independent verification of
S7 U5-U7 (the atomic import writer and its route gates) and of S8 (the version writer, baseline approval and the
modification flow). Then U1 (the KPI pure libs), which has no dependency.
