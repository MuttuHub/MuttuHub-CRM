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
- [x] **V0.1** `.dark` tokens + new tokens, primary per D1, fixed-light toast (M, needs D1)
- [x] **V0.2** Type utilities: `PageHeader`, eyebrow, section title, KPI numeral, mono data (S)
- [x] **V0.3** `StatusChip` + central estado→tone map, `KpiTile`, semáforo `ProgressBar` (M)
- [x] **V0.4** Control sizing: `ui/button`, `ui/input`, `ui/select` at 44/40/36 (M)
- [x] **V0.5** Surfaces: `ui/card`, `ui/dialog`, `ui/sheet`, overlay, shadows (M)
- [x] **V0.6** `ui/table`, `ui/tabs` rail, shared `EmptyState` (M)
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
- 2026-09-28 V0.1: `.dark` token values changed + new tokens added (`globals.css`),
  `.dark --primary` per D1 (#CD1560 + white foreground), sonner toast fixed-light
  (5s, "Cerrar" close button). Files: `src/app/globals.css`,
  `src/components/shell/theme-toaster.tsx`,
  `src/app/globals.tokens.test.ts` (new), `src/components/shell/theme-toaster.test.tsx` (new).
  TDD: RED 23 failed/15 passed (tokens) + 3 failed (toaster) -> GREEN 38/38 + 3/3.
  `npx tsc --noEmit` clean; `npx eslint` clean on touched files.
  Regression check: `src/components/shell/**` (7 files/63 tests) green.
  WCAG contrast (script run via node, ad hoc, not committed) — all 13 new/changed
  dark pairs pass AA 4.5:1: body-fg/bg 17.59:1, card-fg/card 16.57:1,
  ink-700/page 9.60:1, ink-700/panel 9.06:1, ink-500/page 6.03:1, ink-500/panel
  5.69:1, primary-fg(white)/primary 5.42:1, fg/input-bg 17.59:1, exito-text/
  exito-bg(~15% mix) 6.44:1, alerta-text/alerta-bg 6.55:1, destructivo-text/
  destructivo-bg 5.10:1, info-text/info-bg 5.72:1, toast-fg/toast-bg 16.32:1.
  Light theme: no `:root` value was modified (only new properties added) — the
  frozen-value tests in `globals.tokens.test.ts` assert 15 pre-existing `:root`
  values are byte-identical.
  Visual check (light+dark, 1440/390 — Inicio, Clientes, Proyecto): PENDING
  (to be done in-browser separately, not run in this session).
- 2026-09-28 V0.2: new `PageHeader` component (`src/components/ui/page-header.tsx`)
  and 4 type-utility components (`src/components/ui/typography.tsx`:
  `Eyebrow`, `SectionTitle`, `KpiNumeral`, `MonoData`). No screen wired to them
  yet (screen migration is V2.x). TDD: RED (missing-module import errors) ->
  GREEN 12/12 (5 typography + 7 page-header). `npx tsc --noEmit` and
  `npx eslint` clean on touched files.
  Visual check: PENDING (new components not yet mounted on any real screen).
  Deviation from gap map: `--sidebar-accent`/`--sidebar-border`/
  `--sidebar-foreground` were left unchanged in `.dark` (only `--sidebar`
  itself was updated to #0D0809) — the active-nav-item rail restyle is V1.1's
  job (out of V0.1–V0.6 scope), so those tokens weren't touched to avoid
  pre-empting that task's design. `--popover`/`--popover-foreground` were
  additionally aligned to the new `--card` surface color (not explicitly
  listed in the gap map's token table) to avoid an inconsistent popup surface
  once `--card` changed; this is a low-risk companion change, not a new
  design decision.

- 2026-09-29 V0.3: new `toneFromSemaforo` (`src/lib/estado-tone.ts`), `StatusChip`
  (`ui/status-chip.tsx`), `KpiTile` (`ui/kpi-tile.tsx`), semáforo `ProgressBar`
  (`ui/progress-bar.tsx`) + tests. Route: delegated writer (single bounded writer).
  `ProgressBar` derives the band via `colorIndicador(value/100, umbrales)` (caller passes
  parameterized `umbrales`; no thresholds duplicated) then `toneFromSemaforo`; clamps
  0-100 and NaN->0. No screen migrated (V2.x); only pre-existing bar is inline in
  `proyectos/tabs/metas-tab.tsx` (`BAR_COLOR`), left untouched.
  TDD: RED 4 files failed (missing modules, 0 tests run) -> GREEN 4 files / 26 tests
  (3 estado-tone + 11 status-chip + 5 kpi-tile + 7 progress-bar).
  Full `npx vitest run`: 173 files passed / 1 failed (`prisma/invariant.test.ts`, 16 tests,
  DB-integration, unrelated to this task); 1663 tests passed. `npx tsc --noEmit` and
  `npx eslint` clean on touched files.
  Token gap: `neutro`/`activo`/`riesgo` have no dedicated `*-bg`/text token; `StatusChip`
  reuses the existing screen mappings (ink-100/ink-700, rose-50/rose-700, destructivo).
  `exito`/`alerta`/`destructivo`/`info` tokens exist in light and `.dark`.
  Visual check: PENDING (components not mounted on any screen yet).

## Next step
V0.1–V0.6 on branch `feat/v6-visual-alignment` (from `local/todo-integrado`).
- 2026-09-29 V0.4: control sizing in `ui/button` (default/lg h-11=44, sm h-10=40, xs h-9=36;
  icon/icon-lg size-11, icon-sm size-10, icon-xs size-9), `ui/input` (h-11, file:h-8) and
  `ui/select` trigger (default h-11, sm h-10). Hit-area `after:-inset-*` and radius untouched
  (radius pin to `--radius-12` deferred). Route: delegated writer (single bounded writer).
  TDD: RED 3 files / 4 failed, 10 passed -> GREEN 3 files / 14 tests (button 6, input 4, select 4).
  Deliberate test update: `button.test.tsx` size="sm" assertion `h-7` -> `h-10`.
  Full `npx vitest run`: 173 files passed / 1 failed (`prisma/invariant.test.ts`, 16 tests,
  known DB-integration failure); 1666 tests passed. `npx tsc --noEmit` and `npx eslint` clean.
  Call sites: sizes change globally for every `Button`/`Input`/`SelectTrigger` (compact `size`
  users in crm/client-sheet, documents, kanban, etc. grow); no other class/snapshot tests broke.
  Visual check (light+dark, 1440/390, tap-target): PENDING.
- 2026-09-29 V0.5: surfaces. `ui/card`: `rounded-[20px]`, `border border-border` replaces
  `ring-1 ring-foreground/10`, spacing 16->20px (sm stays 12px). `ui/dialog`: overlay
  `bg-(--overlay)` (blur kept), `sm:max-w-[600px]`, `rounded-[22px]`, border instead of ring,
  padding 26/28 (`px-7 py-[26px]`), footer padding matched, 26px semibold title, close button
  moved to top-4/right-5, new optional `DialogCode` (mono req-code slot; additive export).
  `ui/sheet`: overlay token, `shadow-lg` dropped, header/footer 26/28. Shadows stripped from
  `popover`, `select`, `dropdown-menu` (content + sub-content). Route: delegated writer (single
  bounded writer). TDD: RED 3 files / 12 failed, 8 passed (card 2 new, dialog + sheet new files)
  + 3 failed (popover/select/dropdown-menu shadow) -> GREEN card 5, dialog 8, sheet 7,
  popover 4, select 5, dropdown-menu 2 (new); `src/components/ui` 19 files / 91 tests.
  No existing class-assertion tests encoded old values (none updated). Full `npx vitest run`:
  176 files passed / 1 failed (`prisma/invariant.test.ts`, 16 tests, known DB failure); 1687
  passed. `npx tsc --noEmit` and `npx eslint src/components/ui` clean.
  Affected call sites: ~24 files use DialogContent/SheetContent (crm/entity-dialogs,
  client-sheet, kanban/task-dialog, documents/*, admin/*, proyectos/*, shell/change-password-dialog)
  and every `Card`. Callers that pass className (`sm:max-w-*`, `rounded-[22px]`) still win via
  twMerge; dialogs without a width override grow from `max-w-sm` to 600px; all titles are now 26px.
  Deviations: sheet width left at `sm:max-w-sm` (gap map P3 says 600 default; deferred to avoid
  resizing client-sheet, decide in V2.3); notification-panel `shadow-xl` (not `ui/`) left for V1.3.
  Light theme: `--overlay` light value already reproduces `rgba(0,0,0,.1)`; card border/radius/
  spacing do change light computed styles (required by the gap map P4).
  Visual check (light+dark, 1440/390, 3 dialogs + a card screen): PENDING.
- 2026-09-29 V0.6: `ui/table` (rows h-11/44px, eyebrow `th`, `tabular-nums` cells, `numeric`
  prop on `TableHead`/`TableCell` for right alignment, selected-row 3px primary inset rail),
  `ui/tabs` line-variant active rail (3px primary pill, was 2px foreground), new shared
  `ui/empty-state.tsx` (`title`/`description`/`icon`/`action`/`bordered`). Route: delegated
  writer (single bounded writer). `crm/client-sheet.tsx` private `EmptyState({copy})` now
  delegates to the shared one (same signature and classes, `bordered`); `shell/notification-panel.tsx`
  local EmptyState left untouched (V1.3). Affected call sites of table: 6 files
  (documents/repository-list, proyectos/project-list, admin users/audit-log/accesos/solicitudes,
  crm/client-list) get taller rows + eyebrow headers; tabs line variant is used by
  proyectos workspace. APIs backward compatible.
  TDD: RED 3 files failed (6 failed, 6 passed; table.test.tsx and empty-state.test.tsx new,
  tabs rail case added) -> GREEN 3 files / 17 tests (table 7, empty-state 5, tabs 5).
  Full `npx vitest run`: 178 files passed / 1 failed (`prisma/invariant.test.ts`, 16 tests,
  known DB-integration failure); 1700 tests passed. `npx tsc --noEmit` and `npx eslint` clean.
  Visual check (light+dark, 1440/390): PENDING.
