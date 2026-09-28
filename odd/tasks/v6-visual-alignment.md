# Muttu Hub v6 — Visual alignment of existing screens

## Objective
Bring the v6 prototype's visual design (tokens, shell, shared primitives, per-screen layout)
into the screens that already exist in the app, without adding new features or data models.

## Problem
The app was built from an earlier mockup. v6 changed the visual contract: dark-mode primary,
44px controls, rail-style active nav, tinted status chips, larger dialogs and table/tab styling.
Status chips and KPI tiles are re-implemented per screen, some inconsistently.

## Why
User direction (2026-09-28): "llevar el diseño a la app". This is option A. Option B, updating
the prototypes to match the app, was rejected.

## Scope
- In: tokens (`globals.css` `.dark` + new tokens), shared primitives (`src/components/ui/*`,
  new `PageHeader`/`StatusChip`/`KpiTile`/`EmptyState`), shell, restyle of existing screens.
- Out: anything visual-looking that needs data/features. See `v6-visual-alignment-gap-map.md` §7
  (CRM tab strip, Oportunidades kanban, Ficha de seguimiento, Beneficiarios, Equipo, Modo campo,
  health score, Roles matrix, scheduled reports).

## Constraints
- Light theme: default and frozen (D1). Dark mode is opt-in via the existing toggle and receives the v6 tokens. Light-theme computed styles must not change in V0.x.
- Strict TDD: failing class/role assertions before restyling. Runner: `npx vitest run <file>`;
  full suite `npx vitest run`; `npx tsc --noEmit`; eslint on touched files.
- Visual check per task: light + dark, 1440px and 390px. No horizontal page scroll at 390px
  except inside tables.
- Next.js 16: read `node_modules/next/dist/docs/` before routing/layout changes.
- ~400 authored lines per task is an advisory heuristic only.

## Sources
- Design: `Web app views creation/design_handoff_muttu_hub_v6/` (identical to the Desktop zips,
  verified by byte comparison 2026-09-28).
- Gap map (full detail per screen/token): `odd/tasks/v6-visual-alignment-gap-map.md`.
- Related reports: `odd/tasks/v6-feature-gap-audit-2026-09-28.md`,
  `odd/tasks/v6-requirements-traceability-2026-09-28.md`.

## Open decisions (resolve before the dependent task)
| ID | Decision | Blocks |
|---|---|---|
| D1 | **Resolved 2026-09-28**: light theme stays default and unchanged; dark mode stays opt-in via the existing toggle and adopts v6 (incl. `--primary` `#CD1560` + white text). | V0.1 |
| D2 | Wizard: step grouping only vs creation-time data; "8 line toggles" single vs multi | V2.11 |
| D3 | Shadows: v6 none-except-toast vs UIUX sh-1/2/3 (kanban drag) | V2.4 |
| D4 | Aliados ficha: keep modal vs split pane | V2.12 |
| D5 | CurveS series colors: neutral plan/executed pair | V2.2 |
| D6 | Rename "Cliente" → "Aliado" in UI copy | V2.13 |
| D7 | Kanban chip filters vs dropdowns; column count | V2.4 |
| D8 | Solicitudes: Administración tab vs separate route | V2.10 |
| D9 | Profile + Salir: sidebar only vs sidebar + header | V1.2 |

## Tasks
- [ ] **V0.1** `.dark` tokens + new tokens, primary per D1, fixed-light toast (M, needs D1)
- [ ] **V0.2** Type utilities: `PageHeader`, eyebrow, section title, KPI numeral, mono data (S)
- [ ] **V0.3** `StatusChip` + central estado→tone map, `KpiTile`, semáforo `ProgressBar` (M)
- [ ] **V0.4** Control sizing: `ui/button`, `ui/input`, `ui/select` at 44/40/36 (M)
- [ ] **V0.5** Surfaces: `ui/card`, `ui/dialog`, `ui/sheet`, overlay, shadows (M)
- [ ] **V0.6** `ui/table`, `ui/tabs` rail, shared `EmptyState` (M)
- [ ] **V1.1** Sidebar: 44px items, rail active state, lockup sizing (S)
- [ ] **V1.2** Sidebar profile + Salir block; header `PageHeader` slot (M, needs D9)
- [ ] **V1.3** Notification panel + session banner token pass (S)
- [ ] **V2.1** Acceso brand panel (S–M)
- [ ] **V2.2** Inicio caras restyle (M, D5)
- [ ] **V2.3** Clientes list + ficha restyle, modal kept (M)
- [ ] **V2.4** Kanban restyle (S–M, needs D3/D7)
- [ ] **V2.5** Proyectos list (M)
- [ ] **V2.6** Workspace header/tabs + Metas + Indicadores + Gantt "hoy" line (M)
- [ ] **V2.7** Cronograma → meta-grouped semáforo table (L, may split)
- [ ] **V2.8** Financiero gauge + Legalización + Resumen alert card (M–L)
- [ ] **V2.9** Documentos restyle (M)
- [ ] **V2.10** Reportes + Administración pass (M, D8)
- [ ] **V2.11** Nuevo proyecto 5-step stepper over existing fields (L, needs D2)
- [ ] **V2.12** (optional, D4) Aliados split pane (L)
- [ ] **V2.13** (optional, D6) Cliente → Aliado copy sweep (M)

## Acceptance criteria
- Every existing screen matches the v6 visual contract for tokens, shell and primitives.
- No behavior change: existing tests stay green (baseline 166 files / 1600 tests), and payloads
  and routes are unchanged.
- Light + dark checks at 1440/390 recorded per task.

## Delivery
Forecast is well above 400 lines (~22 tasks). Strategy: `ask-on-risk`; the chain strategy is
asked once before the first commit that exceeds budget. Branch: `feat/v6-visual-alignment`, created from `local/todo-integrado`.

## Progress / Evidence
- 2026-09-28: exploration done (visual gap map). Feature document created. No code changes yet.

## Next step
V0.1–V0.6 on branch `feat/v6-visual-alignment` (from `local/todo-integrado`).
