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

- [x] **P1** (commit `0edca6d`, 5 files, +1164/-986) Ficha page route + page component (split out of the dialog). Route: delegated (reading prepares a write,
  2+ non-trivial files). Checks: RED-first vitest for the page component (header chips, tabs, lazy mount, back link, not-found/forbidden state), `tsc`,
  eslint, `src/components/proyectos` suite.
  Evidence: `src/app/(app)/proyectos/[id]/page.tsx` is an async server component that awaits `params` (Promise in Next 16.3.0) and renders
  `ProjectFicha` (`project-ficha.tsx`, moved from the dialog with `git mv`) with `backHref="/proyectos"`; the dialog stayed as a thin wrapper for this
  commit only. 404/403 via `useProject` -> `ApiError.status`: `FichaError` shows "Proyecto no encontrado" / "No tienes acceso a este proyecto" /
  "No pudimos abrir la ficha" with the back link always visible. Layout `max-w-6xl` in a card, header + tab bar in one sticky block. RED: 30/30 new tests
  failed (component missing). GREEN: ficha tests 31; `src/components/proyectos src/app` 148 files / 1634 tests; tsc and eslint clean.
- [x] **P2** (commit `cdb2543`) "Ver detalle" -> new-tab links in list and dashboard; remove dialog state. Route: delegated. Checks: RED-first tests (link
  href/target/rel on rows and cards in both views, no dialog rendered), `tsc`, eslint, `src/components/proyectos` suite.
  Evidence: the four "Ver detalle" (list rows/cards, tablero rows/cards) are `Link` to `/proyectos/<id>` with `target="_blank"` and
  `rel="noopener noreferrer"` styled with `buttonVariants`; `fichaId`/`onOpenFicha`/dialog rendering removed; `project-ficha-dialog.tsx` and its test
  deleted; the unused "dialog" layout variant dropped (D4). RED: 5 tests failed. GREEN: 147 files / 1633 tests; tsc and eslint clean. Parent spot check
  re-ran ficha + list + dashboard tests (3 files, 67 tests) and `tsc --noEmit`: clean. Not verified: anything in a real browser (P3).
- [x] **P3** (commits `4746116` e2e, `3d174b9` guide) e2e + guide; run `PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000 npx playwright test e2e/proyectos-demo.spec.ts` against the LOCAL demo.
  Route: delegated. NOTE the e2e needs a clean demo (it creates PRY-2026-001 from a won opportunity) but the local DB now holds the S11 seed
  (approved project, `db:demo:reset:local` cannot delete it): the writer must NOT reset or wipe; if the spec cannot run on the seeded DB, it
  reports that and verifies the page with a separate read-only Playwright script instead (log in as admin, open the seeded `PRY-2026-001` ficha
  from the list, assert the new tab URL `/proyectos/<id>`, the header chips and the six tabs).

## Authorized scope (allowed edit surfaces)

P1/P2: `src/app/(app)/proyectos/**`, `src/components/proyectos/project-ficha*.tsx`, `src/components/proyectos/project-ficha*.test.tsx`,
`src/components/proyectos/project-list.tsx`, `src/components/proyectos/project-list.test.tsx`, `src/components/proyectos/project-dashboard.tsx`,
`src/components/proyectos/project-dashboard.test.tsx`, `src/components/proyectos/proyectos-vista.tsx`, `src/components/proyectos/proyectos-vista.test.tsx`,
`src/components/proyectos/project-team.test.tsx` (only if it imports the dialog), `src/components/proyectos/project-display.ts` (only if needed).
P3: `e2e/proyectos-demo.spec.ts`, `e2e/proyectos-ficha-pagina.spec.ts` (new, read-only spec that requires the S11 demo seed), `docs/guia-prueba-proyectos.md`.

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
- 2026-10-09: P1 (`0edca6d`) and P2 (`cdb2543`) done, delegated route; trigger evidence: reading prepares a write, 5+9 files, two non-trivial components.
- Review: the assessment since the last reviewed boundary `18c5adf` is medium, 2604 lines, `slice_budget_reached` (U3 + docs + S12). The native review is
  deferred until P3 lands: the candidate is frozen only after the implementation is complete (P3 still edits the e2e spec and the guide).

- 2026-10-09: P3 done, delegated route. `proyectos-demo.spec.ts` step 8 follows the new tab (`Promise.all([context.waitForEvent("page"), link.click()])`);
  NOT run (needs a clean demo; the DB holds the S11 seed), checked statically (`tsc` 0 errors, eslint clean, `playwright test --list`). New read-only
  `e2e/proyectos-ficha-pagina.spec.ts` (requires the S11 seed): list tab keeps the lista with no dialog, header código + "En ejecución" + both semáforo
  chips, "Volver a proyectos" href `/proyectos`, six tabs open with their section, `/proyectos/<zero-uuid>` shows "Proyecto no encontrado"; RAN against the
  local demo via `172.30.48.1:3000`: 1 passed (30.8 s). Guide updated (intro, tabs, recorrido steps 1 and 8, §2, §J, §5 table of DB state per spec).
  First REAL browser check; the parent viewed the screenshots (ficha 1440 and 390, tablero 1440; saved in the scratchpad, not committed).
- 2026-10-09: native review of the consolidated slice (`18c5adf..3d174b9`: U3 + S12, medium, 19 files, 2824 lines, `slice_budget_reached`): consent GRANTED,
  one lens (`review-reliability`), APPROVED with ZERO findings, acknowledged (lineage `review-d929d0e46a8a1929`, authority burned). Reviewer notes (not
  findings): `src/app/(app)/proyectos/[id]/page.tsx` has no direct test (awaited `params` and `force-dynamic` unproved); a non-UUID id probably shows the
  generic "No pudimos abrir la ficha" instead of not-found. Review boundary advances to `3d174b9`.
- Observed in the screenshots (follow-ups, none blocking): (1) the page title in the app shell reads "Muttu Hub" instead of "Proyectos" and the page has
  two `h1`; (2) in the Tablero at 1440 px the last column ("Ver detalle") is clipped and needs horizontal scroll; (3) the seed shows both semáforos in
  Verde only, no amarillo/rojo example.

- 2026-10-09: follow-up (1) done, commit `5b8c7ff` (2 files, +27/-10), delegated: Tablero table min width 1020 -> 900 px, long headers may wrap, project name
  capped at 200 px with a `title`, "Acciones" header and cell `sticky right-0 bg-panel` with `group-hover/fila:bg-muted`. RED: sticky-class test failed (1 failed /
  11 passed); GREEN: dashboard + vista 22/22, `src/components/proyectos` 30 files / 327 tests, tsc and eslint clean; parent spot check re-ran the dashboard
  tests (12/12). Real-browser screenshots (parent viewed 1440 and 1024): at 1440 and 1280 the action is fully visible, at 1024 it stays pinned on an opaque
  background ("Semáforo financiero" is partly covered until scrolled; dark theme blends in). Not verified: the sticky cell hover colour in a real browser.
  Assessed: medium, 64 lines since `3d174b9`, `review_due=false` (`under_budget`), so no native review yet.

## Next step

Remaining follow-ups (each needs the user's go-ahead): ficha page title/`h1`; add an amarillo/rojo case to the seed (would need new data and a restore per D4
of S11); test for the `[id]` page and a non-UUID id.
