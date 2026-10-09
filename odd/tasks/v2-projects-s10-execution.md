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

- [ ] **WU0** Primitives copied from `feat/v6-primitives` + tests (a11y: progressbar role/aria-valuenow, chip text carries
  the colour word).
- [ ] **WU1** `SemaforoChip` + shared section primitives (`proyectos/ui.tsx`), replacing `COLOR_META`/ToneBadge semáforo
  chips and the duplicated Tile/Row/Valor/InlineError/section header (behavior-preserving).
- [ ] **WU2** Ficha as Tabs (D1 names), fixed-height dialog, sticky header (codigo, nombre, estado + semáforo chips),
  lazy tab content, keyboard-accessible tabs.
- [ ] **WU3** `ProgressBar` (semáforo band) in avance rows and KPI tiles replacing native `<progress>`; `EmptyBlock` /
  `EmptyState` in every section. RED: `role=progressbar` with name and aria-valuenow; empty state per section.
- [ ] **WU4** Mobile capture (Sheet for avance/gasto forms below `md`, 44 px controls) and card lists below `md` in list and
  tablero (4a forms, 4b cards if over budget).
- [ ] **WU5** Polish (unify dialog dialect, admin chips) + a11y/dark/contrast guard tests from the map §7 + `docs(odd)`.

## Progress

- 2026-10-09: document created with the map (committed together).

## Next step

Round 1: WU0 -> WU1 -> WU2, one commit each. Then update this doc with hashes and evidence.
