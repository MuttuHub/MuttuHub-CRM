# Muttu Hub v2 — S10 Visual plan for the Projects screens (SDD §4.14, §5.11, REQ-NFR-01)

Parent plan: `odd/tasks/v2-projects-sdd.md`, ledger `odd/tasks/v2-projects-execution.md`, verified mapping
`odd/tasks/v2-projects-s10-map.md` (read it: reality of "v6", design language, inconsistencies, ranked improvements,
tests to add). Previous slice: `odd/tasks/v2-projects-s9-execution.md`. Branch: `feat/projects-v2`.

## Objective

The Projects screens get one visual language and a phone-usable structure: shared primitives (chip, tile, progress bar,
empty state), one semáforo chip, shared section pieces, a tabbed ficha with a sticky header (lazy tab content), an
accessible progress bar, mobile capture (Sheet, 44 px controls) and card lists below `md`. CRM, Kanban and Dashboard
pixels must not change.

## Decisions applied (the defaults from the map §5)

- **D0 = (b)**: copy only the NEW primitive files from `feat/v6-primitives` (`status-chip`, `kpi-tile`, `progress-bar`,
  `empty-state`, `page-header`, `typography`, `src/lib/estado-tone.ts`) by `git show`; do NOT merge that branch, do NOT
  restyle button/card/dialog/sheet/table/tabs, do NOT touch `globals.css` tokens. The primitives only use tokens that
  already exist here (ink, rose, exito, alerta, destructivo, info).
  - Adaptation A1: `src/lib/semaforo.ts` (`colorIndicador`, `UmbralesSemaforo`) does not exist on this branch (it lives
    on other v6 branches). `ProgressBar` therefore takes the **band** (`ColorSemaforo`) computed by the server instead of
    thresholds: the client never recomputes a semáforo (S4/S9 discipline), and `ColorSemaforo` comes from
    `@/hooks/projects`.
- **D1**: ficha tabs are `Resumen · Estructura · Avance · Presupuesto · Gastos · Cambios`.
- **D2**: mobile capture is a bottom `Sheet` below `md`, inline on desktop (round 2).
- **D3**: keep native `<select>`; unify the class string into one constant (round 2/WU1 helper).
- **D4**: Hub patterns as documented; no "v6 prototype" exists in the tree.

## Constraints

- Local only; no push, PR or remote. Any DB command loads `.env.local` explicitly (this slice is UI only).
- UI copy in Spanish; artifacts in English. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`; eslint on touched files.
- Existing tests of CRM/Kanban/Dashboard and every proyectos test stay green.
- Native review unavailable in this runtime (see S9 doc): high tier needs an independent verifier.
- Planning heuristic ~400 authored lines per unit (advisory, not a gate).

## Tasks

Route: delegated writer, one commit per unit. Round 1 = WU0-WU2, round 2 = WU3-WU5.

- [x] **WU0** (951f0da) Primitives copied from `feat/v6-primitives` + tests (a11y: progressbar role/aria-valuenow, chip text carries
  the colour word). RED: 7 files failed on the missing modules; GREEN 44/44 (status-chip 11, kpi-tile 5, empty-state 5,
  page-header 7, typography 5, progress-bar 8, estado-tone 3). ProgressBar takes a server `band` (adaptation A1).
- [x] **WU1** (4f95cf4) `SemaforoChip` + shared section primitives (`proyectos/ui.tsx`), replacing `COLOR_META`/ToneBadge semáforo
  chips and the duplicated Tile/Row/Valor/InlineError/section header (behavior-preserving). RED: both new test files failed
  on missing modules; GREEN 11/11 (`semaforo-chip.test.tsx`, `ui.test.tsx`). `COLOR_META` deleted; `InlineError` moved out of
  `estructura-ui.tsx` into `proyectos/ui.tsx` (22 imports migrated); `SELECT_CLASS`/`SELECT_CLASS_LG` shared by 6 files;
  `SectionHeader` replaces the h3/h4 eyebrows in 14 files; `MetricTile/MetricRow/BigValue` replace Tile/Row/Valor. Only
  semáforo chips moved to `StatusChip` (other `ToneBadge` uses stay: they are not semáforo and CRM shares them).
  proyectos suite 284/284 stayed green.
- [x] **WU2** (f5d4767) Ficha as Tabs (D1 names), fixed-height dialog, sticky header (codigo, nombre, estado + semáforo chips),
  lazy tab content, keyboard-accessible tabs. RED: 18 of 25 ficha tests failed (tabs absent); GREEN 25/25. Mapping:
  Resumen = fields + líneas + municipios + Equipo; Estructura = ProjectEstructura (gantt + plantilla import); Avance =
  Ejecución + Indicadores (KPI panel, both semáforos); Presupuesto = Presupuesto + Ficha financiera; Gastos; Cambios =
  Modificaciones + Versiones + Historial. Header (`ficha-header`) lives outside the scroll panel (`ficha-scroll`), so it is
  always visible; it shows código, nombre, estado, baseline approval and, outside BORRADOR, the two semáforo chips from
  `useProjectKpis(id, null, "vigente")` (same query key as the KPI panel: one request). base-ui `Tabs.Panel` unmounts
  inactive panels, so each section fetches only when its tab is active (test: no budget/expenses/audit/... request while
  on Resumen). Arrow keys move focus, Enter activates (base-ui default `activateOnFocus=false`). `project-list.test` got a
  click on the Cambios tab.
- [ ] **WU3** `ProgressBar` (semáforo band) in avance rows and KPI tiles replacing native `<progress>`; `EmptyBlock` /
  `EmptyState` in every section. RED: `role=progressbar` with name and aria-valuenow; empty state per section.
- [ ] **WU4** Mobile capture (Sheet for avance/gasto forms below `md`, 44 px controls) and card lists below `md` in list and
  tablero (4a forms, 4b cards if over budget).
- [ ] **WU5** Polish (unify dialog dialect, admin chips) + a11y/dark/contrast guard tests from the map §7 + `docs(odd)`.

## Progress

- 2026-10-09: document created with the map (a64e8a5).
- 2026-10-09 (round 1, WU0-WU2): gates per unit: focused vitest, `npx tsc --noEmit` clean, eslint clean on touched dirs.
  Full suite at the end of round 1: **288 files / 2902 tests green** under `TZ=America/Bogota` (no load-flakes seen).
  Deviations: (1) ProgressBar API differs from the v6 branch (band instead of thresholds, A1). (2) Ficha financiera sits in
  Presupuesto, the KPI panel (with the financial semáforo) in Avance. (3) The header is "sticky" by structure (outside the
  scroll area), not by the CSS `sticky` class. (4) Dialog width 760 (same as client-sheet) instead of 720.

## Next step

Round 2: WU3 (use `ProgressBar` from `src/components/ui/progress-bar.tsx` with the server band in `ejecucion-avance.tsx`
replacing the native `<progress>`, and in the KPI tiles; `EmptyBlock`/`EmptyState` in every section), then WU4 (Sheet capture
below `md`, 44 px controls via `h-11`/`size="lg"`, card lists below `md` in `project-list.tsx` / `project-dashboard.tsx`), then
WU5 (dialog dialect, admin chips, a11y/dark/contrast guard tests from the map section 7). Shared pieces to reuse:
`src/components/proyectos/ui.tsx` (SectionHeader, EmptyBlock, InlineError, MetricTile/Row, BigValue, SELECT_CLASS(_LG)) and
`semaforo-chip.tsx`. Ficha tests: open a tab first with `openTab("<name>")` (see `project-ficha-dialog.test.tsx`).
