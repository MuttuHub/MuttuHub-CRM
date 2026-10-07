# Muttu Hub v2 — S2.6 Project team membership and visibility

Parent plan: `odd/tasks/v2-projects-sdd.md` (S2.6, ADR-09, DP-06/N-20) and
`odd/tasks/v2-projects-execution.md` (ledger). Branch: `feat/projects-v2`.

## Objective

A COORDINADOR sees and executes only the projects where they have an active membership. ADMINISTRADOR and
GERENCIA keep seeing everything. Membership is managed through an API and a team tab in the project ficha.

## Problem (verified 2026-10-07)

- `src/lib/api/projects.ts:119-128` pins `UNRESOLVED_MEMBERSHIP = false` and `UNRESOLVED_GERENCIAL_FLAG = false`, so
  every non-manager gets an empty list (`projectListWhere`, :158) and a 403 on the detail.
- `ProyectoMiembro` does not exist in `prisma/schema.prisma` nor in the migrations (latest:
  `20261007120000_v2_proyecto_secuencias`).
- The predicates already exist (`src/lib/permissions.ts`: `canExecuteProject`, `canViewProjectV2`,
  `ProjectMembershipActor.es_miembro`); nothing resolves `es_miembro` from the database.
- The SDD names `loadProjectScoped` and `getProjectForWrite`; neither exists in `src`. The seam is `projectReadActor()`.
- POST `/projects` rejects `miembro_ids` with 400, and creating a project does not add the responsable as a member
  (ADR-09 says it should).

## Scope

In: schema + migration, `es_miembro` lookup, list/detail scope, E-07 members routes with OpenAPI, responsable added
as member on create, team tab in the ficha.
Out: `puede_ver_tablero_gerencial` (no column; stays `false`, owned by a later slice), tablero gerencial (S9.2),
panel separation (S2.7), visual styling (S10.2).

## Constraints

- Local only; no push, PR or remote write without explicit approval.
- Every DB command loads `.env.local` explicitly (`node --env-file=.env.local` / `tsx --env-file=.env.local`).
- Artifacts in English. Conventional commits, no attribution.
- Planning heuristic ~400 authored changed lines per unit, advisory only.

## Execution settings

- TDD: **on** (project config, "Strict TDD Mode: enabled"). Runner: `TZ=America/Bogota npx vitest run <path>`;
  typecheck `npx tsc --noEmit`.
- Delivery strategy: `ask-on-risk`. Forecast ~400 lines across 3 work units (below).
- Native review: per work-unit commit, only under the user-owned RDD switch. Re-verify the three `/mnt/c` review
  prerequisites first (see `v2-projects-execution.md`, "How to resume" step 0).

## Tasks

Work unit U1 (data and scope)
- [ ] **T1** Schema `ProyectoMiembro` + migration `<ts>_v2_proyecto_miembros` with partial unique index
  `proyecto_miembros_activo_uq` (`removed_at IS NULL`); inverse relations on `Proyecto` and `Usuario`.
  RED: live-DB test that a second active row for the same pair is rejected and a removed one allows re-adding.
- [ ] **T2** Resolve `es_miembro` from the database in `projectReadActor()`; scope `projectListWhere` and the detail
  guard by active membership. RED: "a COORDINADOR sees only projects with an active membership",
  "removing a member revokes access immediately and keeps the row with removed_at".

Work unit U2 (API)
- [ ] **T3** E-07 routes: GET/POST `/projects/:id/members`, DELETE `/projects/:id/members/:userId` (soft remove),
  OpenAPI registration. RED: "only COORDINADOR users can be added as members", "adding an existing active member
  returns 409", 403 for non-managers.
- [ ] **T4** Create flow adds the responsable as an active member; accept `miembro_ids` on POST `/projects`
  (currently 400). RED: created project has the responsable as member.

Work unit U3 (UI)
- [ ] **T5** Team tab component in the project ficha (list, add COORDINADOR, remove) with tests.

## Route declaration

Per task: inline vs delegated is recorded here when each task starts. Exploration of S2.6 was delegated (one mapper,
trigger: 4+ files). T1–T4 touch 2+ non-trivial files each, so they go to one bounded writer.

## Acceptance

- All RED tests above exist, were observed failing, then pass.
- `npx tsc --noEmit` clean; full vitest suite green under `TZ=America/Bogota`.
- No behavior change for ADMINISTRADOR and GERENCIA.

## Progress

- 2026-10-07: mapping done; document created. No code written yet.

## Next step

T1: `ProyectoMiembro` schema and migration against the local database only.
