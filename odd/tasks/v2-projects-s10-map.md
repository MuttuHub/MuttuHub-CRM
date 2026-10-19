# S10 map: visual plan for the Projects v2 screens (read-only recon, 2026-10-09)

Branch `feat/projects-v2`. Nothing was run; findings come from code and class names.

## 1. What exists vs what the SDD assumes for "v6"

| SDD claim (§4.14, §5.11, REQ-NFR-01) | Reality on this branch |
|---|---|
| "v6 primitives VERIFIED in `src/components/ui/`": StatusChip, KpiTile, ProgressBar, EmptyState, PageHeader | NOT present. `src/components/ui/` has only: avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, password-input, popover, select, separator, sheet, skeleton, table, tabs, tooltip. |
| Button sizes 44/40/36 (`button.tsx:22-27`) | FALSE here. `button.tsx`: default `h-8` (32), sm `h-7`, xs `h-6`, lg `h-9`. 44/40/36 exist only on `feat/v6-primitives` (`h-11`/`h-10`/`h-9`). |
| `odd/tasks/v6-visual-alignment.md` | Not on this branch. It exists on `feat/v6-visual-alignment` and `feat/v6-primitives` (with `-gap-map`, `-feature-gap-audit`, `-requirements-traceability`, `muttu-hub-v6-f0-f1`). |
| Prototype screenshots | None anywhere in this tree. `docs/muttu-hub-v2.html` is a doc, not a UI prototype (not inspected in depth). |

The primitives ARE real, but on the unmerged branch `feat/v6-primitives` (6 feature commits V0.1..V0.6 on top of `11e9bc1`, not an ancestor of HEAD, +2193/-80 lines):
`status-chip.tsx`, `kpi-tile.tsx`, `progress-bar.tsx` (role=progressbar, aria-valuenow/min/max; band via `colorIndicador` + `toneFromSemaforo` in `src/lib/estado-tone.ts`), `empty-state.tsx`, `page-header.tsx`, `typography.tsx` (Eyebrow, KpiNumeral), plus restyled button/card/dialog/sheet/table/tabs/input/select/popover and a `globals.css` change (+104: "v6 dark tokens, D1 primary, fixed-light toast").
There is no "v6" naming in `src/` on this branch (only in `odd/`, `docs/`, and 2 comments about OpenAPI/dashboard route).

Consequence: S10.2/S10.3 REDs (`uses StatusChip`, `uses KpiTile`, `renders EmptyState`) cannot be written until the primitives are merged or cherry-picked. Execution plan ODD-03/P2.1 says the primitives go to main in Phase 2 after a visual check (light+dark, 1440+390) that was never done.

## 2. The design language that is actually in use (follow this)

Tokens (`src/app/globals.css`): Tailwind v4 `@theme` with indirections; `:root` and `.dark` re-pin them, dark via `@custom-variant dark (&:is(.dark *))`.
- Surfaces: `bg-page` / `bg-panel` / `bg-background`, borders `border-ink-200`; ink scale `ink-100..950` that inverts in dark (so `text-ink-*` needs no `dark:`).
- Semantic: `exito`, `alerta`, `destructivo`, `info` (+ `-bg`), brand `rose-50..800`, `--radius .8125rem`, radii utilities `rounded-11/12/14/22` (used widely: 78x rounded-12 in crm/kanban/dashboard).
- Fonts: `font-display` (Bricolage) for headings and KPI numerals, `font-sans` (Instrument Sans), `font-mono` + `tabular-nums` for codes/amounts/dates.
- Typographic habit: section eyebrow `text-[11px] font-bold tracking-[0.08em] uppercase text-ink-500`, body `text-[12.5px]/[13px]`, headings `font-display text-[16..19px] font-bold tracking-[-0.02em] text-ink-950`.
- Chip: `ToneBadge` (`src/components/crm/shared.tsx:21`, `h-[24px] rounded-full text-[11px] font-bold`, tones from `UiTone` in `src/lib/catalogs.ts:16`). `StatusChip` on the v6 branch copies this map on purpose, so migrating is visually a no-op.
- Reference screens for "the app's look": `src/components/crm/client-sheet.tsx` (fixed-height dialog `h-[88dvh] sm:max-w-[min(760px,...)]` with `Tabs` + `TabsList` and per-tab `TabsContent`; `EmptyState` local helper with dashed box), `src/components/dashboard/shared.tsx`, `src/components/kanban/task-dialog.tsx`. They use `ui/Select`, `ui/Input`, `ui/Tabs`, `ui/Dialog`.
- Dark: tokens are complete in main already. Measured contrast (my calc): light exito/alerta/destructivo/info on their -bg = 4.66/4.61/5.72/5.71; ink-500 on panel 4.52 (all pass AA for normal text, `alerta` only barely); dark equivalents 5.2-5.7.

## 3. Inventory and consistency assessment

Overall: Projects screens already use the Hub tokens (no hex colors; only 7 raw Tailwind palette uses, all `rose-*` brand with `dark:` fallbacks) and ToneBadge (42 uses). They are consistent at token level. Inconsistencies are structural:

| Screen/component | Findings |
|---|---|
| `project-ficha-dialog.tsx` (372 lines) | Biggest issue. One 720px dialog, one scroll, 12 stacked sections after the field grid: Líneas, Municipios, Equipo, Estructura, Presupuesto, Ejecución, KPIs, Financiero, Gastos, Modificaciones, Versiones, Historial. Every section self-fetches on mount (all 8+ queries fire when the dialog opens). Header is not sticky; estado/semáforo are not visible after scrolling. The CRM ficha uses Tabs for the same job. |
| Section headers | Each `project-*` re-implements the `<h3>` eyebrow+icon; `Tile`/`Row`/`Valor` duplicated in `project-kpis-panel.tsx:180-221` and `semaforo-tecnico.tsx`; `InlineError`, `TextField` live in `estructura-ui.tsx` (name implies one section). No shared `SectionHeader`/`EmptyState`/`Metric`. |
| Semáforo | Rendered as `ToneBadge` with text ("Semáforo técnico: Verde"), so not color-only (good). `COLOR_META` in `semaforo-tecnico.tsx:14` maps rojo to tone `riesgo` while `estado-tone.ts` (v6) maps rojo to `destructivo`: same colors, inconsistent tone vocabulary. No dot/shape; no `ProgressBar`. Avance real vs programado is text only (`ejecucion-avance.tsx` uses native `<progress>` with `accent-rose-600`, not semáforo-colored). |
| Forms (`gasto-form`, `ejecucion-avance-form`, `modificacion-form`, `estructura-ui`) | Inputs `h-9`, buttons `size="sm"` (28px) or `h-8`, native `<select>` with a locally duplicated class string in 4 files (`SELECT`, `SELECT_CLASS`: h-8/h-9). CRM uses `ui/Select`. 17 native selects in proyectos vs 0 in crm/kanban/dashboard. Native radios/file input unstyled. `sm:grid-cols-2` stacks to 1 column on phones (good). |
| Dialogs | create/import/modificación/baseline use `max-h-[90dvh] overflow-y-auto rounded-[22px]` (860px for import/modificación); ficha uses `88dvh`/`p-0`/`rounded-xl` default: two dialog dialects. Dialog `max-w-[calc(100%-2rem)]` leaves 16px gutters on phone, fine. |
| `project-list.tsx`, `project-dashboard.tsx` | `Table className="min-w-[1020px]"` inside `overflow-x-auto`: on a phone it is a horizontal scroller, no card layout. Filters are native selects `h-8`. Empty/loading/error states exist (Skeleton 57 uses, `role="alert"` 15). Empty-state block duplicated verbatim between list and dashboard (`rounded-[16px_16px_16px_6px] bg-rose-100`). |
| `presupuesto-programacion.tsx` grid, `estructura-gantt.tsx`, `modificacion-form` grid | Wide tables in `overflow-x-auto` (OK). Programming grid cells `h-8 w-[8.5rem]`: usable but not a phone capture screen. |
| `admin/umbrales-section.tsx`, `catalogos-v2-section.tsx` | Admin cards `rounded-[22px] border-ink-200 bg-panel p-5 lg:p-6`, consistent with other admin sections; use `Badge`/`Checkbox` (ui) rather than ToneBadge for "No confirmado" (check `catalogos-v2` for the same). Low priority. |
| Notification panel PROYECTOS group | Matches other groups (eyebrow in rose, `ul` rows). Fine; only the group label is uppercase literal "PROYECTOS" (others to verify). |
| Mobile capture (RNF-01) | Avance form and gasto form are reachable only by: open ficha dialog, scroll to Ejecución/Gastos, expand an entregable, open inline form. Controls 28-36 px (below the 44 px target in REQ-NFR-01). No `min-w-0`/overflow problems found in forms; date input has `max`, `inputMode="decimal"` on cantidad (good). |
| A11y | Good: Labels via `htmlFor`, `aria-label` x58, `role="alert"` errors, dialog title sr-only. Gaps: native `<progress>` has no accessible name; ficha tabs/sections do not use `aria-labelledby`; semáforo chips lack `role="img"`/status semantics (text suffices); ficha `DialogTitle` is sr-only while visible h2 is separate (acceptable); no focus management when inline form opens; radio group has `fieldset/legend` (good). |

## 4. Prioritized improvements (highest impact first)

| # | Change | Files | Size | Risk |
|---|---|---|---|---|
| 1 | Convert the ficha stack into tabs (Resumen, Estructura, Avance, Presupuesto, Gastos, Cambios [Modificaciones+Versiones+Historial]; Equipo in Resumen) following `client-sheet.tsx`; mount tab content lazily so queries fire per tab. Existing tests render sections via the dialog, so most keep passing. | `project-ficha-dialog.tsx` (+ test) | M ~200 | Medium: `getByTestId` tests inside the dialog now need the tab selected; the SDD tab list is "label final in S10.1" (decision D1). |
| 2 | Sticky ficha header with code, name, estado chip, técnico and financiero semáforo chips (data already in `ProjectKpisPanel` query / list row; reuse query, no recompute) | ficha, `project-kpis-panel.tsx` | S ~80 | Low |
| 3 | One `SemaforoChip` component (tone map + label + dot) replacing `COLOR_META`/`ToneBadge` combos in ficha, dashboard, list, kpis; becomes `StatusChip` wrapper once v6 lands. Keeps D1: never recomputes. | new `proyectos/semaforo-chip.tsx`, kpis panel, `semaforo-tecnico`, dashboard, financiero | S ~100 | Low |
| 4 | Shared section primitives: `SectionHeader` (eyebrow+icon+action), `EmptyBlock`, `Metric/Row`, move `InlineError`/`TextField` out of `estructura-ui.tsx` into `proyectos/ui.tsx` | all `project-*.tsx` | M ~250 | Low (mechanical, tests unchanged) |
| 5 | Mobile capture: avance and gasto forms in a bottom `Sheet` (exists in ui) with 44 px controls (`h-11` inputs, buttons `size="lg"`), `inputMode` and `enterKeyHint`; entry point "Registrar avance" as a visible button in the sticky header on phones | `ejecucion-avance-form.tsx`, `gasto-form.tsx`, `ejecucion-avance.tsx`, `project-gastos.tsx` | M ~250 | Medium: depends on v6 button sizes or local `h-11` overrides (decision D2) |
| 6 | Phone layout for list and tablero: card list below `md` (`hidden md:block` table + `md:hidden` cards) instead of 1020 px scroller | `project-list.tsx`, `project-dashboard.tsx` | M ~220 | Low |
| 7 | `ProgressBar` with semáforo band for avance real/programado in ficha and tiles (accessible, replaces native `<progress>`) | `ejecucion-avance.tsx`, kpis panel | S ~80 | Low; needs v6 `ProgressBar` or a local copy that already matches its API |
| 8 | Replace 17 native `<select>` with `ui/Select` | 10 files | L ~400 | Medium: base-ui Select behaves differently in tests (`userEvent`, `selectOptions` break); native select is better on phones. Recommend KEEP native on mobile forms (decision D3) and only unify the class string into one `SELECT_CLASS`. |
| 9 | Unify dialog dialect (`rounded-xl` default vs `rounded-[22px]`) and widths | create/import/modificación/baseline | S ~40 | Low |
| 10 | Admin sections: tone chips and spacing parity | `umbrales-section.tsx`, `catalogos-v2-section.tsx` | S ~40 | Low |

## 5. Safe unattended vs needs a human

Safe with tests (no design decision): 3, 4, 7 (once ProgressBar source is chosen), 9, 10, the A11y fixes in section 7, and the structural part of 6.
Needs a decision (default proposed, in order of importance; ask ONE at a time):
- D0 How to get the v6 primitives: (a) merge/cherry-pick `feat/v6-primitives` into this branch (changes button/card/dialog/table sizes app-wide, light theme deviation already accepted in ODD-03, visual check pending), (b) cherry-pick only the 6 new component files + `estado-tone.ts` + `typography.tsx` (no restyle of existing primitives), (c) build local equivalents in `src/components/proyectos/`. Default: (b), it unblocks S10.2 without touching CRM/Kanban pixels.
- D1 Ficha tab names/grouping (SDD §4.14: Resumen, Estructura, Cronograma, Avance, Indicadores, Presupuesto, Gastos, Versiones). Default: Resumen · Estructura · Avance · Presupuesto · Gastos · Cambios.
- D2 Mobile capture entry: bottom Sheet vs inline form. Default: Sheet on `<md`, inline on desktop.
- D3 Native vs `ui/Select`. Default: keep native, share one class constant.
- D4 PO expectation of a "v6 prototype design" (execution doc risk). Default: Hub patterns as documented.

## 6. Work units (TDD, each <= ~400 lines, dependency order)

1. WU1 shared pieces (items 3+4): `semaforo-chip.tsx`, `proyectos/ui.tsx` (SectionHeader, EmptyBlock, Metric, SELECT_CLASS); migrate kpis panel and semaforo-tecnico. RED: chip tone per color, label text kept, `data-color` kept; existing tests stay green. ~300. (If D0 = (b), do D0 first as WU0: cherry-pick files + their tests, ~0 authored.)
2. WU2 ficha tabs + sticky header (items 1+2). RED: renders Tabs with the agreed labels, only active tab content mounted (spy on queries), header keeps estado + semáforo chips while scrolled (class `sticky`), default tab Resumen, keyboard arrows move tabs. ~300.
3. WU3 progress and tiles (item 7): `ProgressBar`/accessible bar in avance rows and KPI tiles, EmptyBlock in all sections. RED: `role=progressbar` with name and aria-valuenow; empty state present per section. ~250.
4. WU4 mobile capture (item 5 + 6): Sheet for avance/gasto forms, 44 px controls, card lists below `md`. RED: see 7. ~400 (split into 4a forms, 4b list/tablero cards if over budget).
5. WU5 polish (items 9+10) + docs `docs(odd)` S10.1 re-plan note. ~120.

## 7. Accessibility and mobile checks to add as tests (jsdom, class-based; no screenshots)

- Every input/select/textarea in `gasto-form`, `ejecucion-avance-form`, `modificacion-form`, `project-create-dialog` has an accessible name (`getByLabelText` for all, loop over `container.querySelectorAll`).
- Each `ProgressBar`/`<progress>` has an accessible name and min/max/now; semáforo chip text includes the color word (not color only).
- Dialog: exactly one title, focus returns to trigger on close, tab list reachable by keyboard, `aria-selected` toggles.
- Mobile capture: form root classes contain no fixed widths over 360 px (assert no `w-[` > 22rem/`min-w-[` > 360 in avance and gasto forms; grid classes `grid-cols-1` at base); controls use `h-11` (or `size="lg"`) on avance/gasto submit and inputs; table wrappers have `overflow-x-auto` and cards render under `md:hidden`.
- Contrast guard (pure unit test): script the ratios for semáforo foreground/background pairs from `globals.css` tokens, light and dark, assert >= 4.5 (today alerta/light is 4.61, little margin; a token tweak would silently fail).
- Dark mode: no raw palette utilities without a `dark:` pair or token (lint-style test over `src/components/proyectos/*.tsx`: forbid `bg-(white|gray|slate|...)`, `text-black`; allow `rose-*` only with `dark:` or inside StatusChip map).
- Optional real visual regression (needs the running app + Playwright, out of scope for unattended unit work): 1440 and 390 screenshots of ficha, list, tablero in light and dark; the `testsprite_tests/` folder exists but holds an old report only.
