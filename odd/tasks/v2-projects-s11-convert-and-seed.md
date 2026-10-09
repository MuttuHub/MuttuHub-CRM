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
- [x] **U2** Demo seed for projects + npm script + doc section in `docs/guia-prueba-proyectos.md`. Route: delegated.
  Checks: unit tests for the pure parts (RED first), `tsc`, eslint, dry-run then real run against the local DB, second run must be a
  no-op with the D3 message, `npm run dev` pages load the seeded projects (HTTP 200 via `172.30.48.1:3000`).
  Evidence (commit `18c5adf`, 5 files, +1088/-2): `scripts/seed-projects-demo.ts` (+ test), `package.json` script `db:demo:seed-projects:local`,
  `export` added to two helpers in `import-plantilla-demo.ts`, guide section "0.1 Seed de proyectos (demo)". Deviation: route bodies are inline
  and need a Supabase session, so the seed MIRRORS them call for call and reuses the exported helpers; `importarPlantilla`, `aprobarLineaBase`
  and `validarEnTransaccion` are called directly; audit goes through `logChange(s)` (drift risk if a route changes). Created: `PRY-2026-001`
  EN_EJECUCION (v0 approved, 5 avances, 3 mediciones, 5 gastos: 2 VALIDADO, 3 REGISTRADO incl. one `alerta_sobregasto`), `PRY-2026-002`
  BORRADOR (same workbook, $177.360.000), plus one extra GANADA opportunity left eligible. RED: module-missing failure on the first run (per-test
  output not kept). GREEN: seed + plantilla tests 28/28 (parent spot check re-ran them: 28/28), `tsc` 0 errors, eslint clean. Real local run:
  dry run, `--apply`, second `--apply` = no-op with the D3 message; read-only query confirmed 2 projects, 1 version, 5 avances, 5 gastos,
  1 free GANADA, 219 audit rows. Not verified: Tablero/semáforos/"Convertir en proyecto" in a browser; a pg `client.query()` deprecation
  warning was seen and not investigated. Local DB now holds an approved project (`db:demo:reset:local` cannot delete it; restore per D4).

- [x] **U3** (commit `d897051`, 3 files, +63/-16; accepted 2026-10-09 from the review advisory `R3-marker-matches-half-built-b`) Make the seed's idempotency robust to a partial run:
  the marker must identify a COMPLETE seed (e.g. project A's exact name, created last) and a partial seed (B exists, A missing) must be
  detected and reported with the D4 restore hint instead of "already seeded"; fix the misleading comment at `seed-projects-demo.ts:780-790`;
  add tests for the partial-run decision (RED first). Route: delegated. Checks: seed unit tests, `tsc`, eslint, dry run against the local DB
  (it already holds a complete seed: it must still say "already seeded, nothing changed"). No new real write run.
  Evidence: `decideSeed` now takes the existing demo project names and returns `seed` / `already-seeded` (both exact names) / `partial`
  (anything in between); the runner reads names with `findMany` and on `partial` throws `PARTIAL_SEED_MESSAGE` before any write (exit 1,
  restore hint D4); the false comment is fixed; guide section 0.1 describes the three states. RED: 6 failed / 16 passed before the
  implementation (`client.proyecto.count is not a function` on the partial case). GREEN: 22/22 (parent spot check re-ran them: 22/22),
  `tsc` 0 errors (a `s`-flag regex hit TS1501 and was rewritten with `[\s\S]`), eslint clean, dry run against the local DB printed
  "already seeded ... Nothing was changed". Not verified: a REAL partial state against the DB (needs a failed `--apply`); that path is covered
  by unit tests only. Route: delegated (2 non-trivial files + reading that prepares a write).

## Authorized scope (allowed edit surfaces)

U3: `scripts/seed-projects-demo.ts`, `scripts/seed-projects-demo.test.ts`, `docs/guia-prueba-proyectos.md` (only if the documented message changes).

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
- 2026-10-09: U2 done (`18c5adf`), delegated route; trigger evidence: reading prepares a write, 836-line script + tests + guide.
- 2026-10-09: native review of the S11 slice (`f370050..18c5adf`, medium, 11 files, 1403 lines, `slice_budget_reached`): consent GRANTED by the
  user, one lens (`review-reliability`), outcome APPROVED and acknowledged (lineage `review-94ce7b1766a736fc`, authority burned). One advisory
  WARNING, non-blocking and not a reason to re-review: `R3-marker-matches-half-built-b` at `scripts/seed-projects-demo.ts:780-790` — the
  idempotency marker is `startsWith("Demo CedeTextil")`, which matches BOTH projects, contradicting the comment that A is the marker; if a run
  fails after B is created, the next run prints "already seeded" with A missing and the opportunities consumed, and only a full DB reset
  recovers. Idempotency therefore holds only for complete runs.
- Review boundary: advances to `18c5adf`.

- 2026-10-09: U3 done (`d897051`) after the user approved the follow-up. Review boundary stays at `18c5adf` (U3 is a small slice pending
  under budget unless the assessment says otherwise).

## Next step

Browser check of the Tablero, semáforos and "Convertir en proyecto" on the seeded data (user-side, local app on Windows). Delivery: the
chained-PR slicing plan for the whole branch is being prepared; the chain strategy (stacked-to-main vs feature-branch-chain) needs the
user's decision.
