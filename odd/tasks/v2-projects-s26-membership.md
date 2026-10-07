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
panel separation (S2.7), visual styling (S10.2), and the **execute** half of the objective: `canExecuteProject`
(`src/lib/permissions.ts:129`) has **no caller in `src`** today, and the write gates (`canCreateProject` on create and
eligible-opportunities, `canManageProjects` on the PATCH) are not membership-aware — so after T2 a COORDINADOR may read
their member projects but still cannot write them. Wiring that predicate is a write-authority slice of its own, which is
why the SDD scopes S2.6 to visibility; it is recorded here so the objective's "sees and executes" is not read as
delivered.

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
- [x] **T1** Schema `ProyectoMiembro` + migration `20261007130000_v2_proyecto_miembros` with the partial unique
  index `proyecto_miembros_activo_uq` (`removed_at IS NULL`); inverse relations on `Proyecto` and `Usuario`.
  RED: live-DB test that a second active row for the same pair is rejected and a removed one allows re-adding.
  **Closed in `6d9652b`** (3 paths, +266). The delivered shape follows the SDD's own model block: seven columns,
  with the two audit columns `agregado_por_id` (required) and `removido_por_id` as plain columns without FK, the
  named relation `"MiembroProyecto"` on both sides, and the composite `(usuario_id, removed_at)` index that is what
  serves the T2 membership probe. Evidence: `161 files / 1523 tests` green under `TZ=America/Bogota` (baseline
  160/1519, exactly additive), `tsc` 0, eslint 0; the invariant test asserts the `P2002` whose message names the
  partial index and the `P2003` that names each FK, so the guard proven is the index and not the table; the
  migration's `sha256` matches `_prisma_migrations.checksum`, the history holds one non-rolled-back row, and a full
  replay of the file inside a rolled-back transaction proved it idempotent.
- [x] **T2** Resolve `es_miembro` from the database and scope the read paths by active membership.
  RED: "a COORDINADOR sees only projects with an active membership", "removing a member revokes access immediately and
  keeps the row with removed_at".
  **Closed in `7faf6f7`** (8 paths, +520/−46). Design: the list keeps its restriction inside the `where`
  (`miembros: { some: { usuario_id, removed_at: null } }` for a COORDINADOR, the `id: { in: [] }` short circuit for
  every other non-portfolio role), so nothing is pre-resolved in memory and no route branch can widen it; the ficha and
  its Historial share `loadProjectScoped`, which folds the membership probe into the existence read and preserves
  404-before-403 (the audit gate projects only the id, so it pays 2 statements instead of the full graph's 8).
  `es_miembro` is a **required** parameter of `projectReadActor`/`canReadProject`, so the compiler forces every caller to
  resolve it — that is what caught the Historial route, which the first round had left resolving nothing; the portfolio
  predicate keeps its own actor because it genuinely has no membership axis.
  Evidence: `162 files / 1533 tests` green (baseline after T1: 161/1523, exactly additive), `tsc` 0, eslint 0; the new
  live-DB invariant `prisma/proyecto-miembros-scope.invariant.test.ts` drives the three real route handlers under forced
  rollback; the independent verifier re-derived 17 attack scenarios (every list filter as a non-member and as a member
  of another project, and a project that names the actor as `responsable_id`), captured the emitted SQL showing the
  conjunctive `EXISTS` clause, and confirmed the manager regression guard is non-vacuous.
  Measured cost: 0 extra statements on the list, +1 on each per-project read (the membership probe). Advisory: the two
  statements of `loadProjectScoped` leave a theoretical time-of-check/time-of-use window while a concurrent removal
  happens; the removal write lands in T3.

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

T1: delegated to one bounded writer in **two rounds** — the first shipped five columns, and the independent
verification flagged the missing SDD audit columns, so the second round aligned the model to the design source and
reconciled the migration checksum. Two independent read-only verifiers, one per revision, both `READY TO COMMIT: yes`.

## Acceptance

- All RED tests above exist, were observed failing, then pass.
- `npx tsc --noEmit` clean; full vitest suite green under `TZ=America/Bogota`.
- No behavior change for ADMINISTRADOR and GERENCIA.

## Progress

- 2026-10-07: mapping done; document created. No code written yet.
- 2026-10-07: **T1 closed** in `6d9652b`. Advisories recorded, neither blocking: the SDD's prose names the inverse
  field `miembro_de` while the schema ships `proyectos_miembro` (the load-bearing relation name matches on both
  sides and nothing in code depends on the field name), and on an empty table the planner tie-breaks toward the
  partial index instead of the composite one. The ledger row for this unit is batched with the next docs commit.
- 2026-10-07: **T2 closed** in `7faf6f7`. Two rounds: the first scoped the list and the ficha but left the Historial
  route resolving no membership at all, so a COORDINADOR member would have seen the ficha "200" and the Historial "403";
  the second round made `es_miembro` a required parameter — the compiler now refuses an unresolved caller — and routed
  the audit guard through the same loader. Advisories, none blocking: the TOCTOU window noted above, and two
  `as unknown as` casts that bypass the generated select typing, with the probe's shape guaranteed only by tests.

## Next step

T3: the E-07 members routes — `GET`/`POST /projects/:id/members` and `DELETE /projects/:id/members/:userId` as a soft
removal that sets `removed_at` and `removido_por_id` — plus their OpenAPI registration. U1 (T1 + T2) first goes to its
native review as a single slice on `baseRef = b026e30`.
