# Muttu Hub v2 — S13 v6 UI base (app-wide), light and dark

Parent plan: `odd/tasks/v2-projects-sdd.md`. Previous: S12 (`v2-projects-ficha-page.md`). Delivery chain: `odd/tasks/v2-projects-delivery-chain.md`.
Branch: `feat/projects-v2`. Feature id: `v2-ui-v6-base`. Engram mirror topic: `odd/v2-ui-v6-base/tasks`.
Design source: the user's Claude Design export `Muttu Hub v6.dc.html` (`/mnt/c/Users/Adrian/Downloads/Web app views creation/`), dark-only.

## Objective

The user judged the UI "not aligned" with the v6 prototype. A visual comparison (design vs app, 2026-10-09) found the palette and fonts already close and the
real gaps in structure, density and shared primitives. The user decided to apply the COMMON BASE app-wide (not only Projects) and requires that the app
stays usable in BOTH light and dark mode. Section-by-section work on the Projects screens (portafolio, ficha tabs) follows after the base.

## Problem (verified 2026-10-09 by a read-only mapping)

- `src/components/ui/*` are stock shadcn: Button default h-8 (sm h-7, xs h-6, lg h-9, radius ~13 px), Input/Select h-8, Card `rounded-xl ring-1`, Table head
  `h-10 font-medium`, Tabs default is a pill, Dialog `rounded-xl p-4 max-w-sm`.
- v6 target: controls 44/40/36 px, radius 12 px; cards 20-22 px with surface + border (no ring); table head uppercase 12 px bold +0.1em `#A08A91`; tabs underline
  with accent, 15.5 px, no pill; sidebar ~220 px, active item = surface `#1B1316` + 3 px left bar `#CD1560` (not the solid pink pill); a single `<h1>` on the
  ficha showing the project NAME.
- Branch `feat/v6-primitives` (6 commits on top of `11e9bc1`, not an ancestor of HEAD) already has most of this: `ae464c6` V0.1 tokens, `3a5d662` V0.2 PageHeader,
  `869d739` V0.3 StatusChip/KpiTile/ProgressBar, `68968a4` V0.4 sizes 44/40/36, `904f15e` V0.5 card/dialog/sheet surfaces, `53dd5d2` V0.6 table + tabs rail.
  Gaps on that branch: radius still `rounded-lg` (13 px) instead of 12; Tabs default still a pill and 15.5 px not set; `--shell-surface` is `#221a1c` not `#1B1316`;
  its light theme is deliberately FROZEN (its decision D1); sidebar width unchanged. Do NOT merge `feat/v6-visual-alignment` (287 files, conflicts).
- `ui/card.tsx` has ZERO importers: real cards are hard-coded (~279 `bg-panel` uses in 73 files, ~85 `rounded-[20-26px]` in 40 files).
- 35 `TableHead` call sites hard-code `text-[11px] tracking-[0.08em]` (they override the primitive); 16 files use raw `<table>`.
- 117 uses of `size="sm|xs|icon-*"` (28/24 px today -> 40/36 with the branch sizes) in 37 files; ~25 explicit `h-6..h-10` overrides on controls.
- The ficha shows two `<h1>`: the shell header's fallback "Muttu Hub" (`src/components/shell/header.tsx:73`, `PAGE_HEADERS[pathname] ?? ...` keyed by exact pathname in
  `src/lib/nav.ts`) and the ficha's own project-name heading (`project-ficha.tsx:~138`).
- The theme comes from `localStorage["muttu-theme"]`, else the system preference (`src/app/layout.tsx:57`); the `.dark` class goes on `<html>`.
- Visual baseline ("before"): 52 PNGs (13 screens x 2 themes x 2 widths) in the session scratchpad `.../scratchpad/uibase/before-<slug>-<theme>-<width>.png`.

## Decisions

- D1 (user): app-wide base, not Projects-only. D2 (user): light AND dark must both work.
- D3: dark follows v6 literally. Light is DERIVED from the same semantic token structure (same names, light values) keeping the brand pink `#CD1560`
  and the app's existing light surfaces unless v6's structure requires otherwise; it is a design judgement, so the user reviews before/after in both themes.
- D4: reuse `feat/v6-primitives` V0.1 and V0.4-V0.6 by cherry-pick (or by porting the diff by hand if a cherry-pick conflicts), then fix the gaps above.
- D5: CHECKPOINT: after U1 (and before U3), the parent shows the user dark + light before/after shots and waits for approval of the palette.

## Tasks

- [ ] **U2** One `<h1>` on the ficha: the shell header must not print "Muttu Hub" on `/proyectos/<id>`; show a breadcrumb/"Proyectos" label as `<p>` (or no title)
  and keep controls on the same row; the project name stays the page `<h1>`. ~40 lines + test asserting exactly one `h1`. Route: delegated.
- [ ] **U1** Tokens + primitives: V0.1, V0.4, V0.5, V0.6 (+ V0.2/V0.3 only if their files are required by the tokens), radius 12 px on button/input/select, Tabs underline
  default at 15.5 px, `--shell-surface` `#1B1316` (dark), and a derived light palette per D3 with coherent light variants of `--ink-500`, `--card`, `--border`, `--primary` usage.
  Update tests (`button.test.tsx`, `proyectos/ui.test.tsx`, `dashboard/shared.test.tsx` as needed). Checks: vitest full suites of ui/crm/proyectos/dashboard/admin/documents,
  `tsc`, eslint, after-shots in both themes. Route: delegated. Then D5 checkpoint.
- [ ] **U3** Sidebar: ~220 px, active item surface + 3 px left bar, light variant; `sidebar.test.tsx`. Route: delegated.
- [ ] **U4** Tables: delete the 35 hard-coded `TableHead` classes, convert the raw tables that matter; update `proyectos/ui.test.tsx`. Route: delegated.
- [ ] **U5** Controls sweep: audit the 117 `size="sm"` buttons and ~25 height overrides; keep dense toolbars usable (Kanban, documents, clientes). Route: delegated.
- [ ] **U6** Cards/surfaces: one shared surface class or `Card` consumers, then migrate the ~85 hard-coded surfaces in batches (crm, dashboard, kanban, proyectos, admin, documents).
  Route: delegated, one writer per area batch.

Each unit: strict test-first where a runnable test fits (class/structure assertions; jsdom cannot measure layout), then an "after" screenshot run with the same
temporary spec protocol against the seeded demo (same slugs, themes, widths), compared to the "before" PNGs; focus on 390 px, light theme and the Kanban/Clientes/Dashboard
screens (pixels at risk). Never leave temp specs or screenshots in git.

## Authorized scope (allowed edit surfaces, per unit; the writer stops and reports if another file is needed)

U2: `src/components/shell/header.tsx`, `src/components/shell/header*.test.tsx`, `src/lib/nav.ts`, `src/lib/nav*.test.ts`.
U1: `src/app/globals.css`, `src/components/ui/{button,input,select,card,dialog,sheet,table,tabs,progress-bar,status-chip,kpi-tile,empty-state,page-header,typography}.tsx` and their
`*.test.tsx`, `src/lib/estado-tone.ts` (+ test), and test files that assert the changed classes (named in the report).
U3: `src/components/shell/sidebar*.tsx`, `src/components/shell/sidebar*.test.tsx`, `src/app/globals.css` (shell tokens only), `src/lib/nav.ts` only if needed.
U4-U6: the files of the area being migrated, listed by the parent in each delegation.

## Constraints

- Local DB only; the Next dev server runs on Windows (`http://172.30.48.1:3000` from WSL; Playwright via Windows npx ignores `PLAYWRIGHT_BASE_URL` set in WSL, hardcode the URL in temp specs;
  its `/tmp` writes land in `C:\tmp` = `/mnt/c/tmp`). Read-only browsing for screenshots; no data writes.
- Next 16.3.0 has breaking changes (`AGENTS.md`); read `node_modules/next/dist/docs/` before Next-specific code (U2 touches a client shell component only).
- Artifacts in English; UI copy stays Spanish. Conventional commits, no AI attribution lines. No push, no PR.
- ~400 authored changed lines per task is a planning heuristic only.

## Acceptance criteria

- Dark: controls 44/40/36, cards 20-22 px with border, table heads eyebrow style, tabs underline, sidebar active style, matching the v6 screenshots; light: same structure with a coherent
  derived palette (no unreadable text, no stale dark values, contrast of text/chips/semáforos kept); the user approves both at the D5 checkpoint.
- A single `<h1>` on `/proyectos/<id>` equal to the project name.
- No regression in CRM, Kanban, Dashboard, Documentos, Admin: before/after shots reviewed; full unit suites, `tsc` and eslint green.

## Delivery strategy

`ask-on-risk`, `chain_strategy = feature-branch-chain` (see the delivery chain doc). New slices after US12: US13 = U2 + U1 (+ D5), US14 = U3 + U4, US15 = U5, US16.. = U6 batches.
Forecast well above 400 lines in total; each unit stays near 400 where possible. Local work-unit commits only; no push, no PR. Native review per slice (medium/high consent asked as usual).

## Progress

- 2026-10-09: document created after the visual comparison and the read-only mapping (blast radius, baseline shots). User decisions D1 and D2 recorded.

## Next step

Launch the U2 writer (small, independent), then U1.
