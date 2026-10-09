# Muttu Hub v2 — S11 "Convertir en proyecto" entry point + demo seed for Projects

Parent plan: `odd/tasks/v2-projects-sdd.md`, ledger `odd/tasks/v2-projects-execution.md`. Previous slice: S10 (`v2-projects-s10-execution.md`).
Branch: `feat/projects-v2`. Feature id: `v2-projects-s11-convert-and-seed`. Engram mirror topic: `odd/v2-projects-s11-convert-and-seed/tasks`.

## Objective

Make the opportunity-won -> project flow visible the way the Claude Design documents show it, and make the Projects demo
repeatable with realistic data, without depending on a long manual walkthrough.

## Problem (verified 2026-10-09)

- The API conversion route exists: `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts` (phase switch +
  project creation in one transaction, CONVERTIR + CREAR audit rows). Its only UI caller is `project-create-dialog.tsx`
  (`useCreateProjectFromOpportunity`, `hooks/projects.ts:477`), reached from Proyectos > Nuevo proyecto.
- There is no "Convertir en proyecto" button on the opportunity or client. The only related button is "Convertir a ejecución"
  (`src/components/crm/entity-dialogs.tsx:694-701`), which only switches the opportunity phase.
- The Claude Design docs (Clientes, Roadmap, v6) show a "Convertir en proyecto" modal launched from the oportunidad/cliente.
- No seed creates projects (`prisma/seed.ts` has none). `db:demo:reset:local` only deletes BORRADOR projects: approved projects own
  rows in append-only tables (`versiones_proyecto`, `acceso_soportes`, `auditoria_cambios`) guarded by delete triggers.

## Scope

- U1: a "Convertir en proyecto" action on a GANADA opportunity (client sheet / opportunity dialog) that opens the existing project
  creation dialog preloaded with THAT opportunity, using the existing endpoint and hook. No new endpoint.
- U2: a LOCAL-ONLY, idempotent demo seed for projects (`npm run db:demo:seed-projects:local`) that builds, through the same
  server-side writers the API uses (so audit lotes, v0 version and triggers stay correct): one project in BORRADOR with the
  CedeTextil structure/budget imported, one project EN EJECUCION (approved baseline) with avances, validated gastos, one
  sobreejecución case and semáforos; and leaves at least one GANADA opportunity unconverted for the live conversion demo.

Out of scope: budget seeding from a propuesta económica (no such model), Curva S/radar, plan mensual, Mis actividades, territory field,
the v6 modal visual fidelity, any remote DB write, any schema migration.

## Constraints

- Local DB only. Every DB-touching command loads `.env.local` (`npm run db:*:local`); scripts import `require-local-db` first.
  `.env` points to a remote Supabase with real data. Never touch it.
- Next.js here has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before touching Next-specific code.
- Artifacts (code, comments, UI copy, tests, commits) in English; existing Projects UI copy is Spanish: match the surrounding strings.
- Conventional commits, no AI attribution lines. No push, no PR (human decisions).
- Planning heuristic ~400 authored changed lines per task; not a cap.

## Decisions (defaults, product owner has not confirmed)

- D1: the button is shown only when the opportunity is GANADA, has no project yet, and the user can create projects (same permission
  as Proyectos > Nuevo proyecto). Hidden otherwise (no disabled-with-tooltip ceremony).
- D2: after a successful conversion the dialog closes and the user is taken to Proyectos with the new project visible (reuse what the
  create dialog already does on success; do not invent navigation if it already refreshes the list).
- D3: the seed refuses to run twice: if its marker project already exists it exits with a clear message (idempotent, no duplicates).
- D4: restoring the demo after the seed uses `db:migrate:reset:local` + `db:seed:local` (documented, NOT run by the writer: destructive
  even though local).

## Tasks

- [x] **U1** "Convertir en proyecto" from the GANADA opportunity. Route: delegated (reading prepares a write + 2+ non-trivial files).
  Checks: focused vitest (RED first), `npx tsc --noEmit`, eslint on touched files, full `src/components/{crm,proyectos}` suites.
  Evidence (commit `1909113`, 5 files, +211/-5): `ConvertirEnProyectoAction` in `entity-dialogs.tsx` (GANADA + `canCreateProject` + opportunity
  present in `GET /api/v1/projects/eligible-opportunities`, which already filters `proyecto: { is: null }`, so no new DTO field);
  `ProjectCreateDialog` got optional `initialOportunidadId` (prefill once, dates/línea/municipios still required);
  `useCreateProjectFromOpportunity` now also invalidates the client's opportunities (without it the lifecycle dialog kept a stale phase).
  RED observed before production code: 5 failed / 27 passed (per-test output not kept by the writer; the 3 prop tests in the create dialog
  and 2 of 7 new button tests). GREEN: focused 32/32; crm+proyectos+hooks 48 files / 512 tests; tsc 0 errors; eslint clean. Parent spot check
  re-ran the two touched test files: 32/32. Not covered: no Playwright/dev-server click path (create dialog is mocked in the entity-dialogs tests).
  Assessed tier: medium (`executable_change`), 216 changed lines, `review_due=false` (`under_budget`); first assess returned a spurious `high`/
  `unassessable` because this untracked document was undeclared, re-run with `--untracked-scope=exclude` as the tool instructs.
- [ ] **U2** Demo seed for projects + npm script + doc section in `docs/guia-prueba-proyectos.md`. Route: delegated.
  Checks: unit tests for the pure parts (RED first), `tsc`, eslint, dry-run then real run against the local DB, second run must be a
  no-op with the D3 message, `npm run dev` pages load the seeded projects (HTTP 200 via `172.30.48.1:3000`).

## Authorized scope (allowed edit surfaces)

U1: `src/components/crm/entity-dialogs.tsx`, `src/components/crm/entity-dialogs*.test.tsx`, `src/components/proyectos/project-create-dialog.tsx`,
`src/components/proyectos/project-create-dialog*.test.tsx`, `src/hooks/projects.ts` (only if the hook needs a param).
U2: `scripts/seed-projects-demo.ts`, `scripts/seed-projects-demo*.test.ts`, `package.json` (one script line), `docs/guia-prueba-proyectos.md`.

## Acceptance criteria

- U1: on a GANADA opportunity without project, a user with project-create permission sees "Convertir en proyecto"; clicking opens the
  create dialog with that opportunity preselected; confirming creates `PRY-...` in BORRADOR and the opportunity moves to EJECUCION;
  the button no longer shows for that opportunity; non-permitted users and non-GANADA opportunities never see it.
- U2: after the seed, Proyectos lists the seeded projects with correct estados and semáforos; the Tablero shows data; one GANADA
  opportunity remains eligible; a second run changes nothing and says so; the guide documents run, expected result and restore path.

## Delivery strategy

`ask-on-risk` (default). Forecast ~500 authored changed lines across the two units (U1 ~150 with tests, U2 ~350 with tests), above the
~400 budget: slices are U1 and U2 (one work-unit commit set each). The chain strategy for the whole branch (139 commits ahead of origin)
is pending the user's decision; local work-unit commits proceed, no push/PR.

## Progress

- 2026-10-09: document created after exploration (Claude Design docs vs code comparison; endpoint and schema gaps verified).
- 2026-10-09: U1 done (`1909113`), delegated route; trigger evidence: reading prepares a write, 5 files incl. 2 non-trivial components.

## Next step

Launch the U2 writer (demo seed for projects). Delivery: running slice = U1 (216 lines, under budget); U2 is forecast ~350 lines.
