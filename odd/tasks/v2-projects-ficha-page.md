# Muttu Hub v2 — S12 Project ficha as its own page (`/proyectos/[id]`), opened in a new browser tab

Parent plan: `odd/tasks/v2-projects-sdd.md`, ledger `odd/tasks/v2-projects-execution.md`. Previous: S11 (`v2-projects-s11-convert-and-seed.md`),
delivery chain: `odd/tasks/v2-projects-delivery-chain.md`. Branch: `feat/projects-v2`. Feature id: `v2-projects-ficha-page`.
Engram mirror topic: `odd/v2-projects-ficha-page/tasks`.

## Objective

The project ficha carries a lot of information (six tabs, header with semáforo chips, budgets, gastos, versions). The user wants to read it on
its own page instead of in a modal dialog. User choice (2026-10-09): "Ver detalle" opens the page in a NEW BROWSER TAB.

## Problem (verified 2026-10-09)

- `ProjectFichaDialog` (`src/components/proyectos/project-ficha-dialog.tsx`, 434 lines, test 604 lines) is a dialog opened from two places:
  `project-list.tsx:174` (rows ~251 and cards ~309) and `project-dashboard.tsx:160` (rows ~274 and cards ~323), via `fichaId` state.
- The only project route is `src/app/(app)/proyectos/page.tsx`; there is no `/proyectos/[id]`.
- `client-list.tsx` also has a "Ver detalle" (clients): NOT in scope, do not touch it.
- Next is 16.3.0 with breaking changes (see `AGENTS.md`): read the relevant guide under `node_modules/next/dist/docs/` (dynamic routes, `params`,
  `notFound`, linking) before writing route code.

## Scope

- P1: route `src/app/(app)/proyectos/[id]/page.tsx` that renders the ficha as a full page: fixed header (code, name, estado, "Aprobar línea base",
  semáforo chips outside Borrador), a "Volver a proyectos" link to `/proyectos`, and the same six tabs (Resumen, Estructura, Avance, Presupuesto,
  Gastos, Cambios) with the same lazy-mount behavior. The ficha content moves out of the dialog wrapper into a page-oriented component
  (rename/split `project-ficha-dialog.tsx`; keep all section components unchanged). Wider layout than the 760 px dialog.
- P2: every project "Ver detalle" (list rows, list cards, dashboard rows, dashboard cards) becomes a real link to `/proyectos/[id]` with
  `target="_blank"` and `rel="noopener noreferrer"`; remove the `fichaId` dialog state and `ProjectFichaDialog` usage from list and dashboard.
  The project CREATE dialog, the import dialog and the capture bottom sheets stay as they are.
- P3: update the e2e spec (`e2e/proyectos-demo.spec.ts` step 8 and any step that assumes the dialog: it must follow the new tab with
  `context.waitForEvent("page")`) and the guide `docs/guia-prueba-proyectos.md` (it describes the ficha as a dialog); then run the e2e for real.

Out of scope: `?tab=` deep links, notification links to `/proyectos`, clients ficha, any API or schema change, redesign of the tab contents.

## Constraints

- Local DB only (`.env.local`, `npm run db:*:local`; `.env` is a REMOTE Supabase with real data). The Next dev server runs on Windows; from WSL use
  `PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000`. Do not start another dev server.
- Existing authorization must hold: a coordinator sees only projects where they are an active member; a missing or forbidden project must render a
  clear not-found/forbidden state on the page, never a crash or a blank screen. Reuse the existing GET endpoints/hooks; no new endpoint.
- Artifacts in English (code, comments, tests, commits); UI copy stays Spanish, matching the surrounding strings.
- Conventional commits, no AI attribution lines. No push, no PR.
- ~400 authored changed lines per task is a planning heuristic only.

## Decisions (defaults, product owner has not confirmed)

- D1: new tab via `target="_blank"` links (user's choice). Plain click opens a new tab; Ctrl/middle click still work.
- D2: the page keeps the six tabs with `Resumen` first, no URL state for the active tab.
- D3: the "Volver a proyectos" link goes to `/proyectos` (the page may have been opened in a fresh tab with no history).
- D4: `project-ficha-dialog.tsx` is replaced, not kept alongside (no dead dialog code); its test file moves with it.

## Tasks

- [ ] **P1** Ficha page route + page component (split out of the dialog). Route: delegated (reading prepares a write, 2+ non-trivial files).
  Checks: RED-first vitest for the page component (header chips, tabs, lazy mount, back link, not-found/forbidden state), `tsc`, eslint,
  `src/components/proyectos` suite.
- [ ] **P2** "Ver detalle" -> new-tab links in list and dashboard; remove dialog state. Route: delegated. Checks: RED-first tests (link href/target/rel on
  rows and cards in both views, no dialog rendered), `tsc`, eslint, `src/components/proyectos` suite.
- [ ] **P3** e2e + guide; run `PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000 npx playwright test e2e/proyectos-demo.spec.ts` against the LOCAL demo.
  Route: delegated. NOTE the e2e needs a clean demo (it creates PRY-2026-001 from a won opportunity) but the local DB now holds the S11 seed
  (approved project, `db:demo:reset:local` cannot delete it): the writer must NOT reset or wipe; if the spec cannot run on the seeded DB, it
  reports that and verifies the page with a separate read-only Playwright script instead (log in as admin, open the seeded `PRY-2026-001` ficha
  from the list, assert the new tab URL `/proyectos/<id>`, the header chips and the six tabs).

## Authorized scope (allowed edit surfaces)

P1/P2: `src/app/(app)/proyectos/**`, `src/components/proyectos/project-ficha*.tsx`, `src/components/proyectos/project-ficha*.test.tsx`,
`src/components/proyectos/project-list.tsx`, `src/components/proyectos/project-list.test.tsx`, `src/components/proyectos/project-dashboard.tsx`,
`src/components/proyectos/project-dashboard.test.tsx`, `src/components/proyectos/proyectos-vista.tsx`, `src/components/proyectos/proyectos-vista.test.tsx`,
`src/components/proyectos/project-team.test.tsx` (only if it imports the dialog), `src/components/proyectos/project-display.ts` (only if needed).
P3: `e2e/proyectos-demo.spec.ts`, `docs/guia-prueba-proyectos.md`.

## Acceptance criteria

- Clicking "Ver detalle" on any project row or card (list and tablero) opens `/proyectos/[id]` in a new browser tab; no project dialog appears.
- The page shows the same header (código, nombre, estado, "Aprobar línea base" in Borrador for admin/gerencia, semáforo chips with the color word
  outside Borrador) and the six tabs with the same content as before; tabs mount lazily.
- "Volver a proyectos" returns to `/proyectos`; an unknown id or a project the user cannot see shows a clear not-found/forbidden state.
- Existing behavior elsewhere is unchanged (clients, create dialog, import, capture sheets). `tsc`, eslint and the proyectos suites are green.

## Delivery strategy

`ask-on-risk` with `chain_strategy = feature-branch-chain` (see the delivery chain doc). This is a new slice after US11 (call it US12). Forecast
~700 changed lines gross (mostly moved code and test updates). Local work-unit commits only; no push, no PR.

## Progress

- 2026-10-09: document created after exploration (dialog usage mapped; user chose "new browser tab").

## Next step

Launch the P1 + P2 writer.
