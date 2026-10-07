# Muttu Hub v2 — Projects module: direct path (pivot from v1)

## Objective

Deliver the PO's RF v2.0 projects module **directly on `main`**, without the unshipped v1
module and without a coexistence flag. Before that, clean up the unmerged v1 projects chain
and land the genuinely reusable v6 work on `main`.

## Scope and limits (user, 2026-09-30)

Development happens **locally only**. No write to `origin` until the user gives explicit approval.

- **Allowed now:** branches, commits, cherry-picks, file edits, tests, local verification, local
  branch surgery.
- **Gated on explicit per-batch approval:** `git push`, `gh pr create`, `gh pr close`,
  `gh pr merge`, and any other remote write.
- Phase 1 (PR cleanup) is therefore **gated, not cancelled**. Its triage results stay valid;
  only the execution waits. The 24 open PRs remain exactly as they are.
- No remote action was taken on 2026-09-30: only read-only queries (`gh pr list`, `gh auth status`,
  local `git`).

## Why

Verified 2026-09-30 against the repository:

- `main` (== `origin/main` == `11e9bc1`, PR #47) has **no** projects models in
  `prisma/schema.prisma` and **no** projects migrations (last: `20260915120000_oportunidades_comerciales`).
- The deployed app has no projects section; production rows for `proyectos`/`metas`/`actividades` = 0.
- The v1 module exists only in unmerged local branches: 58 files, 11,047 lines, 20 commits,
  16 open PRs.
- RF v2.0 (PO, 2026-09-28) replaces that data model.
- Consequence: merging v1 means reviewing ~11k lines that get replaced. Meanwhile the
  coexistence apparatus in `odd/tasks/v2-projects-sdd.md` (ADR-01 flag, expand → backfill →
  switch → contract, S9.6, the 419-test v1 retirement) is built on a premise that is false
  ("419 v1 tests and **live data**").

## Decisions taken (2026-09-30, user)

| ID | Decision | Evidence / note |
|---|---|---|
| ODD-01 | The v1 projects chain is **closed as superseded**, not merged. v2 is implemented directly on `main`. | See *Why*. |
| ODD-02 | **#69 and #70 are closed with the chain.** They are stacked 20–21 commits over `main` and import `@/lib/semaforo` (`UmbralesSemaforo`) and `UMBRALES_SEMAFORO_DEFAULT` from `@/lib/catalogs`, both absent from `main`; a dry cherry-pick merged textually but would not compile. | The umbrales **capability** survives and is re-planned inside v2 (admin-editable parameters). |
| ODD-03 | The **light-theme deviation is accepted** as a product decision (V0.4–V2.3 changed heights, radii, chips, card borders against the "light does not change" rule). The rule in `odd/tasks/v6-visual-alignment.md` is updated, and the pending visual check (light + dark, 1440 + 390) is performed **before** merging the v6 PRs. | The check was never done for any v6 task. |
| ODD-04 | Execution order: **Phase 1 (PR cleanup) → Phase 4 (SDD re-scope) → Phase 2 (v6 primitives) → Phase 5 (v2 S0)**. | PR cleanup is independent of everything else. |

## PR triage (24 open, verified by `git merge-base --is-ancestor fdcc46b <branch>`)

`fdcc46b` = v1 projects chain tip (`feat/gestion-proyectos-04b-quinta-cara`).

**Merge on `main` (6 PRs, exactly 1 commit over `main`, no v1 dependency):**

| PR | Commit | Content |
|---|---|---|
| #55 | `d468041` | Seed anti-production guard + `scripts/cleanup-seed-cloud.ts` + `DIAGNOSTICO-SEED-CLOUD.md` + `package.json` |
| #64 | `0568cdf` | Lint unused vars (`prisma/invariant.test.ts`, `auth/reinvite/route.ts`, `auth/confirm/page.tsx`) |
| #65 | `f189ce8` | `scripts/offboard-camarabaq.ts` |
| #66 | `c22d013` | `next.config.ts` `allowedDevOrigins` |
| #67 | `c536776` | `src/app/api/cron/daily/route.ts` per-recipient error logging |
| #68 | `7babc6b` | `src/app/api/v1/auditoria/route.ts` `oportunidad` filter |

**Close as superseded (18 PRs):** `#48`–`#54`, `#56`–`#63` (v1 module) + `#69`, `#70`.

**Needs review before any action:** `#40` (`fix/tarea-sin-datos-archivos-tilde-oportunidad-null`,
2026-09-08) — no matching local or remote branch; provenance unknown.

**Orphan local branches, no PR opened (independent, 1 commit over `main`):**
`feat/paginacion-infinita-listados` (`44bc86e`) and `feat/dashboard-export-excel` (`bc91a26`).

## Phases

### Phase 0 — Baseline on `feat/projects-v2` (done 2026-09-30)

- [x] P0.1 Verify `.env.local` points to loopback: `127.0.0.1:54322` for both `DATABASE_URL` and `DIRECT_URL`. `.env` points to the shared remote (`aws-1-us-west-2.pooler.supabase.com:6543`) and is never used.
- [x] P0.2 Run the suite and the typecheck: `npx vitest run --pool=threads` → **115 files / 1027 tests, all green** (86 s); `npx tsc --noEmit` → **0 errors** after moving a stale `.next/` aside (it was inherited from the v6 dev server and produced 27 phantom `TS2307` errors for routes that do not exist here).
- [x] P0.3 Confirm the DB-safety tooling gap: there is **no** `db:migrate:status` script, no `prisma/local-env.ts` and no `assertLocalTarget` guard on `main` — they live only on the abandoned v1 chain and in unmerged PR #55. **S0.6 must create the guard, not reuse it.**
- [x] P0.4 Local Docker DB reachable — **resolved 2026-09-30**: the stack was simply down. Once the containers are up, `127.0.0.1:54322` responds from WSL, `supabase status` reports the local URLs, and `migrate status` shows 11 migrations, schema up to date.
- [x] P0.5 **CRITICAL safety finding — plain `npx prisma` targets PRODUCTION.** `prisma.config.ts` (on `main`) starts with `import "dotenv/config"`, which loads `.env` (the shared remote). Measured side by side with a shell that had exported the local values:
  - `npx prisma migrate status` → `at "aws-1-us-west-2.pooler.supabase.com:5432"`
  - `node --env-file=.env.local node_modules/prisma/build/index.js migrate status` → `at "127.0.0.1:54322"`
  `migrate status` is read-only, so nothing was written. The workaround was to use the explicit
  `node --env-file=.env.local` form. **Root cause fixed the same day — see P0.6.**
- [x] P0.6 **DB-safety fix landed in this branch** (commit `96c4c5c`). `prisma/local-env.ts` loads `.env.local` only (never `.env`), asserts loopback, fails closed on unparseable values, produces credential-free errors and has no bypass; `prisma/require-local-db.ts` is the side-effect guard, imported first so it runs before the Prisma client is built; `prisma/seed.ts`, `prisma/invariant.test.ts`, `scripts/backfill-document-text.ts` and `scripts/migrate-v2/_guard.ts` import it (**correction 2026-10-01: `prisma.config.ts` does NOT import it — that config only calls `loadLocalEnv()`, so the hard refusal belongs to the guarded entry points, not to the Prisma CLI**); `db:*:local` scripts invoke Prisma through `node --env-file` instead of `npx`. Verified: `npx prisma migrate status` → `127.0.0.1:54322`; a remote target raises `NonLocalDatabaseError`; suite 116 files / 1041 tests green in 52 s (was 86 s). This absorbs the guard half of S0.6 and supersedes PR #55's seed guard.

- [x] P0.7 **Local DB reset to the branch schema** (user-authorized; Prisma's AI-agent guard was satisfied with the user's exact consent text). The local Docker database still carried the abandoned v1 chain: 13 rows in `_prisma_migrations` against 11 in the branch, plus 8 leftover tables (`proyectos`, `metas`, `actividades`, `gastos`, `rubros`, `indicadores`, `lineas_presupuestales`, `soportes_proyecto`) with data, which made `prisma migrate dev` refuse to create anything. After the reset: **11 migrations, zero abandoned tables**, and the seed re-run (12 clientes / 4 usuarios / 20 tareas / 10 oportunidades / 8 documentos). Two follow-ups this exposed: `prisma migrate reset` does **not** run the seed, so it must be run explicitly; and `db:generate:local` was required because the generated client dated from Sep 25 (v1 branch) and still carried `puede_ver_tablero_gerencial`.
- [x] P0.8 **`prisma migrate status` is not a trustworthy baseline check.** It reported "Database schema is up to date!" while the database had two applied migrations missing from the branch. It only compares the directory against the database, never the reverse. Use `_prisma_migrations` when drift is suspected.
- [x] P0.9 **Untracked leftovers that break the typecheck.** `scripts/seed-proyectos-demo.ts` (untracked, seeds the abandoned v1 models) failed `tsc` with 11 errors once the Prisma client was regenerated. Parked as `scripts/seed-proyectos-demo.ts.bak` — reversible, and out of the `**/*.ts` include — rather than deleted.

### Phase 1 — GitHub cleanup (no source code) — **GATED on explicit approval**

- [x] P1.1 Confirm `gh` auth is the correct account — active account is `MuttuHub` (has push access); `agutierrezreginodev` is also configured but inactive.
- [x] P1.2 Confirm the repo's merge style on `main` — **squash merge** (0 merge commits; commit titles end in `(#NN)`).
- [ ] P1.3 Close `#48`–`#54`, `#56`–`#63`, `#69`, `#70` with a comment referencing RF v2.0 and `odd/tasks/v2-projects-sdd.md`.
- [ ] P1.4 Merge `#55`, `#64`, `#65`, `#66`, `#67`, `#68` to `main`.
- [ ] P1.5 Review `#40` and decide (close or merge).
- [ ] P1.6 Open PRs for the two orphan branches (or record them as deferred).

### Phase 4 — Re-scope the SDD v2

- [ ] P4.1 Bring the planning docs to the v2 base: `051a3ff`, `97d639e`, `5c6de65` (v2 plan + SDD) and `dc4a01f` (v6 plan) currently live ONLY on `feat/v6-visual-alignment`.
- [ ] P4.2 Rewrite `odd/tasks/v2-projects-sdd.md` removing the coexistence apparatus: `feature_projects_v2` / `src/lib/features.ts`, expand → backfill → switch → contract, S9.6 contract, and the 419-test v1 retirement choreography (S0.2/S0.3 shrink accordingly).
- [ ] P4.3 Recalibrate the slices that assume v1 code exists in the branch.
- [ ] P4.4 Reuse-as-reference note: keep the v1 `semaforo` lib, permissions split (`canManageAny`/`canReadRestrictedDocs`), catalogs and schema design as inputs, not as merges.

### Phase 2 — v6 primitives to `main`

- [ ] P2.1 Perform the pending visual check (light + dark, 1440 + 390) for the v6 tasks being merged.
- [ ] P2.2 Update the "light does not change" rule in `odd/tasks/v6-visual-alignment.md` per ODD-03.
- [ ] P2.3 Extract V0.1–V0.6 + V1.1–V1.3 (+ `dc4a01f`) onto a branch from `main`; open the primitives PR.

### Phase 3 — Non-project screen restyles to `main`

- [ ] P3.1 V2.1 Acceso, V2.2 Inicio, V2.3 Clientes, V2.9 Documentos as a second PR from `main`.
- [ ] P3.2 V2.4 Kanban and V2.10 Reportes/Admin: decide separately, watching the S2.7/S9.2/S9.5 dashboard collision.
- [ ] P3.3 V2.5–V2.8, V2.11 stay held; ownership transfers to S10.1/S10.2.

### Phase 5 — Start v2

- [x] P5.1 Create `feat/projects-v2` from `main` — done 2026-09-30 (`54a356e`, `57fdc4f`, `f396473`, `d93824e`).
- [x] P5.2 Environment sanity with `.env.local` only; baseline `vitest` / `tsc` — done, see Phase 0.
- [x] P5.3 S0.5 (weeks + money pure libs) → S0.4 (append-only `auditoria_cambios` + `logChange`, needs the local DB) → S0.6 (migration safety kit with loopback guard, created from scratch). **S0.6 done 2026-10-01.**

## Open items / risks

- ~~**CRITICAL: the default Prisma CLI path wrote to production.**~~ **Fixed and merged to `main`** — PR #71, squash commit `6a28935`. `npx prisma …` used to resolve `DIRECT_URL` from `.env` (the shared remote) through `prisma.config.ts`. The config now loads `.env.local` only, the guarded entry points (`prisma/require-local-db.ts`) refuse any non-loopback target, and the `db:*:local` scripts replace plain `npx`. **Precision (2026-10-01): the refusal is not in the Prisma CLI itself** — `prisma.config.ts` only narrows which file is loaded, so exporting the variables still reaches a remote target; that is why promotion is a human-only path (§6.5, §6.9 of the SDD). Re-verified on `main` after the merge: `npx prisma migrate status` → `127.0.0.1:54322`, and a remote target raises `NonLocalDatabaseError`. Residual: a deliberate remote run must export `DATABASE_URL`/`DIRECT_URL` explicitly.
- **Environment:** the local Docker stack must be running for every migration and live-DB test (S1.x onward). The
  pure libraries (S0.5) do not need it. Note that `prisma migrate reset` needs the user's **verbatim consent
  string**, because Prisma blocks that command for AI agents.
- **DB-safety tooling:** no longer a gap. The guard now exists in this branch (P0.6); S0.6 only adds the
  count-first harness, the storage orphan report and the promotion checklist on top of it. PR #55's seed guard is
  superseded; its `scripts/cleanup-seed-cloud.ts` still has its own value.
- **Business risk (accepted):** confirm with the boss/PO that nothing is expected from the v1
  module in production. Nothing shipped, but there was a PO meeting on 2026-09-22 about
  "gestión de proyectos" features.
- **Remote DB state (VERIFIED 2026-10-01, read-only):** the shared Supabase **does** still carry the v1 projects schema — all 8 abandoned tables, with 4 rows in total — plus an applied migration (`20260918153200_tablero_seguimiento_social`) that exists in no branch. Measured and recorded in SDD §6.9 (R-16 / D-10). It does not block v2 development (v2 is additive and creates its own tables) and nothing was changed; the cleanup decision is D-10, to be taken at the human promotion step with a `pg_dump` first.
- **`gh` / git TLS:** failures against GitHub in this environment come from TLS interception, not from `gh`
  itself. Observed 2026-09-30: a Fortinet FortiGate re-signing `github.com`, untrusted in both WSL
  (`certificate signer not trusted`) and Windows (`schannel: SEC_E_UNTRUSTED_ROOT`). It resolved on its own later
  the same day. Verify the issuer (`openssl s_client -connect github.com:443`) before concluding anything, and
  never disable certificate verification or install a corporate CA without an explicit user decision.
- **Fork leftover:** ~~`agutierrezreginodev/MuttuHub-CRM` caused the wrong-account push mistake twice; recommended to delete it.~~ **Resolved 2026-10-03**: the local remote pointer named **`fork`** was removed (`git remote remove fork`), so no agent push can target it by accident any more — verified that only `origin` (`MuttuHub/MuttuHub-CRM`) remains and that a dry-run push to it still negotiates cleanly. The **fork on GitHub was deliberately left alone**: deleting the repository itself is a remote, destructive action on someone else's account and stays with the user (`gh repo delete agutierrezreginodev/MuttuHub-CRM` requires that account's credentials).
- **PRODUCTION-write hazard in a pre-existing script** (found 2026-10-05 by the S1.3 verifier; **not** a v2 defect):
  `scripts/offboard-camarabaq.ts` begins with `import "dotenv/config"` (line 16), which loads **`.env` — the shared
  production instance** — and then calls `db.usuario.delete` (line 79) and `supabaseAdmin.auth.admin.deleteUser`
  (line 84). It **defaults to dry-run** (`--apply` is the write gate; lines 23 and 64), and it is tracked and untouched
  by v2 (`bae437c`, PR #65). Two things to keep in view: it **does not use the loopback guard** that every v2 data
  script must use, which makes it **the one reachable production-write path in this repository**; and even *without*
  `--apply` it still **connects** to production to print row counts. **Never run it as an agent, under any flag.** If it
  is ever needed, that is a human-only operation, and the safest fix would be to put it behind the same
  `prisma/require-local-db.ts` guard — recorded here as a candidate hardening, not done in this slice.
- **Held v6 tasks** still have no owner until S10.1 executes.
- **Review advisory backlog — CONSOLIDATED 2026-10-05.** Until now these lived only in memory, which was drift waiting to
  happen. **None blocks anything and none reopens its review** — every reviewer stated they are later work. Listed by the
  review that produced them, so an id is never ambiguous (finding ids are per-review):
  - **Hardening unit** (`review-9f7649aff2eda2a9`): `R3-001` `src/lib/openapi/document.test.ts:17-19`;
    `R3-002` **WARNING** `prisma/rubros-migration.invariant.test.ts:121` — the widened `public` guard now includes
    extension-owned functions and hashes `prosrc`, so it is environment-coupled if run against a different Supabase.
  - **S1.3** (`review-9c051b00375cdc0e`): `R3-001` `src/app/api/v1/municipalities/[id]/route.ts:177-178`;
    `R3-002` `src/app/api/v1/municipalities/route.ts:85-88`.
  - **S2.1a** (`review-7688a9ea6b77e918`): `R3-1` **WARNING** `prisma/proyecto-migration.invariant.test.ts:164-185`;
    `R3-2` `prisma/proyecto.invariant.test.ts:133-137`; `R3-3` `prisma/proyecto-migration.invariant.test.ts:187-199`;
    plus the two structural ones in the S2.1 block (the `40P01` deadlock among concurrent DDL suites and the composite
    FK's dependency on the pre-existing `oportunidades_id_cliente_id_key` index).
  - **S2.1b**: the eight items in its block and row above. **One is REQUIRED work, not optional** — the JSON-scalar body
    answering 500 instead of 400 at `src/app/api/v1/projects/[id]/route.ts:183` — because S2.3 copies that route's guard.
    Its other `REQUIRED` companion: the **live-DB end-to-end test of create → list → patch** that S2.3 must deliver, since
    the demo runs exactly that path and the `PATCH` transaction is currently covered only by mocks and `tsc`.
    **Both `REQUIRED` items are now closed by S2.3 (`3a42837`):** the guard answers 400 for a JSON scalar, and
    `prisma/proyecto-create-flow.invariant.test.ts` drives the create → list → edit path against the live DB.
  - **S2.1b, second review — after the correction** (`review-d06b538fe42fd4ed`): `R3-002` WARNING
    `src/app/api/v1/projects/[id]/route.ts:323-325`; `R3-003` WARNING `:73`.
  - **S2.2**: the five advisories in its block (`http.ts`'s third `ApiErrorCode` copy; the stale comment in
    `projects.ts:293-295`; the floor applied only on the INSERT path; the migration's adoption branch; and the redundant
    per-call prefix read). And note for the record: **this unit's required `INVALID_STATE` widening is done**, so S2.3
    must delete S2.1b's local 409 helper rather than adding a second one. Also worth knowing: the full suite showed one
    **transient cold-run `5s` timeout in `scripts/migrate-v2/_guard.test.ts`** which passed in isolation and on a warm
    run — that is the documented contention envelope, not a regression. **S2.3 (`3a42837`) carried two of these forward
    unchanged:** the third client-side `ApiErrorCode` copy in `src/lib/api/http.ts` still lacks `INVALID_STATE`, and the
    allocator's counter floor is still applied only on the INSERT path.
  - **S2.3** (`3a42837`): the E-05 body has no dedicated out-of-range test of its own — its bounds are shared through
    `PROJECT_CREATE_BASE` and the verifier proved E-05's schema rejects `1e15`/`3e9`, so it is a test-symmetry gap, not a
    defect; the `Infinity`/`1e400` path is proven at the real-schema level, not by driving a raw body through the handler;
    `src/lib/openapi/document.test.ts` asserts the three new operations' **registration** (presence, status codes, E-05
    body shape), not the route, so a status divergence without a registration change would not be caught; the live-DB
    harness prints a benign `pg` deprecation warning (`client.query() when the client is already executing a query`) from
    the nested `$transaction` on the ambient client — documented in the test — and its only cross-worker interaction is a
    bounded lock wait against `prisma/auditoria-cambios.invariant.test.ts`'s `TRUNCATE` (measured 337–689 ms against a
    20 s timeout); `valor_total` accepts `0` (consistent with PATCH), so REQ-ORG-04's "> 0 before baseline" belongs to
    baseline approval (S8.1); the E-03 contract reading requires `responsable_id`, `lineas`, `municipio_ids`, `fecha_inicio`
    and `fecha_fin` with only `valor_total`/`beneficiarios_meta` optional (E-05's `nombre` optional because the server
    prefills it), so a date-less draft would be a contract change the UI unit must satisfy; and the active-catalog rule is
    enforced at the API layer, not by a database constraint, so a direct DB write could still attach a suspended line or
    municipio.
  - **S2.3 native review closed** — lineage `review-5fc4e617fae85065`, `approved`, authority burned. Four findings,
    **all `informational`, none blocking**: `R3-001` WARNING at
    `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts:196-200`, `R3-002` WARNING at the same
    file `:107-128`, `R3-003` WARNING at `src/app/api/v1/projects/route.ts:231-248`, and `R3-004` SUGGESTION at
    `src/app/api/v1/projects/route.test.ts:367-379`. The provider published **locations and severities only**, so the
    substance stays in the lineage receipt; what the ranges cover, read from the code, is: the E-05 `CONVERTIR` audit
    entry's `valor_anterior` (R3-001), the E-05 opportunity lookup plus its `GANADA` and already-has-a-project
    pre-checks (R3-002), and the E-03 catalog/`responsable` pre-checks through the transaction opening (R3-003) — i.e.
    the two non-transactional pre-check blocks the backlog already describes, where the database constraint rather than
    the pre-check is the real guarantee. They are separate later work by the review's own disposition, never a reason to
    re-run a review on this candidate.
  - **Minimal UI, unit 1** (`review-1451215e08828bb2`, `approved`, authority burned): three findings, all
    `informational` — `R3-stale-data` **WARNING** `src/components/proyectos/project-list.tsx:180`,
    `R3-unknown-estado` **WARNING** `:225-226`, and `R3-filter-reset-test` **SUGGESTION** `:160`. The provider published
    **locations and severities only**, so the substance stays in the lineage receipt. The first one **was resolved inside
    unit 2** — the creation mutations invalidate the whole `["projects"]` prefix, so the new row appears on `/proyectos`
    without a reload and the opportunity just used stops being offered; the other two remain later work.
  - **Minimal UI, unit 2** (`review-4f91c178f70194dd`, `approved`, authority burned): four findings, all
    `informational` — `R3-catalog-error-as-empty` **WARNING**
    `src/components/proyectos/project-create-dialog.tsx:129-133`, `R3-fecha-mas-meses-rollover` **WARNING** `:80`,
    `R3-fecha-fin-test-tautology` **SUGGESTION** `src/components/proyectos/project-create-dialog.test.tsx:156`, and
    `R3-independent-validation-unproved` **SUGGESTION** `project-create-dialog.tsx:222-223`. Read from the ids and the
    ranges, they point at the catalog-error branch, the month-rollover arithmetic of the `+3 months` default, one
    tautological end-date assertion, and the independent path's validation — reading **the code**, not the reviewer's
    text, which the provider did not publish. None reopens the review; all are separate later work.
  - **Demo reset** (`review-f88ee129abdb394d`, `approved`, authority burned): two findings, both `informational` —
    `R3-apply-path-unverified` **WARNING** `scripts/reset-demo.ts:370-373` and `R3-entry-point-detection`
    **SUGGESTION** `:403-405`. Read from the ids and the ranges (the provider published no text), the first covers the
    `--apply` branch of `runDemoReset` — the mode that writes, exercised by the unit test through a fake client and by
    the verifier through a **rolled-back** live-DB probe, but never by a real `--apply` on a database that already held
    demo residue — and the second the `invokedDirectly` guard at the bottom of the module. The independent verifier
    reached the same two spots on its own and named `invokedDirectly`, `reportError` and `readSnapshot`'s
    soft-delete/`orderBy` filters as untested, plus `reportError`'s own weakness: `NonLocalDatabaseError` is thrown at
    **import**, before `runDemoReset` can catch it, so that path still prints a stack despite the comment. None blocks,
    none reopens the review; all are separate later work.
  - **Rehearsal spec** (`review-64049fe2311fe1ea`, `approved`, authority burned): three findings, all
    `informational` — `R3-001` **WARNING** `e2e/proyectos-demo.spec.ts:95-109`, `R3-002` **WARNING** `:164-165`,
    `R3-003` **SUGGESTION** `:140-143`. The provider published locations and severities only, but here the independent
    verifier had already reached the **same three spots** from the code and named them in its own words, which is a rare
    case of the two reviews converging without either seeing the other: `:95-109` is the eligible-opportunity guard
    (the "no eligible opportunities" placeholder also renders while the query is in flight, so a genuine endpoint error
    is misreported after 45 s as "the database is not reset" — misleading on that error path, correct on the happy
    path); `:164-165` is the created-row/client assertion, where the strong check is `row.toContainText(OPP_CLIENTE)`
    and the prefill assertion above it can pass off the opportunity card's own client span; and `:140-143` is the
    strategic-line step, which assumes the catalog's first line is already included **and** principal by default, so a
    legitimate catalog reorder would break it even with the app correct. The verifier added three more of its own:
    the end-date assertions only check non-empty rather than a real value; `docs/guia-demo.md`'s `curl --max-time 30`
    can false-negative on a cold Turbopack route (30–60 s in this environment) and make an operator think the server
    is down; and the spec mutates global database state, so it is only safe run alone after a reset, which the guide
    documents but no fixture enforces. None blocks, none reopens the review; all are separate later work.
  - **Project ficha** (`review-5927aa4e070d5343`, `approved`, authority burned): two findings, both `informational` and
    both **SUGGESTION in test files** — `R3-001` `src/components/proyectos/project-list.test.tsx:346-358` and `R3-002`
    `src/components/proyectos/project-ficha-dialog.test.tsx:14-16`. The first is the one the independent verifier also
    named: the list test uses a single-row fixture, so it cannot distinguish "the row that was clicked" from "the
    first row". The verifier added six more of its own: `ORIGEN_PROYECTO_META` duplicates literals that already live in
    `project-create-dialog.tsx` (drift risk); the ficha has a `DialogTitle` but no `DialogDescription`, so
    `aria-describedby` is absent; every row's action is named exactly "Ver detalle" with no `aria-label` carrying the
    code, so rows are not distinguishable by name; no coverage for empty `lineas`/`municipios` or for a null
    `fecha_fin`/`responsable`; `FichaError` prints the raw `error.message`, so a network failure shows "Failed to
    fetch"; and the skeleton assertion counts six nodes, which is implementation-coupled. None blocks and none reopens
    the review. **Also recorded: the verifier found a pre-existing import cycle unrelated to this unit** —
    `hooks/crm ↔ hooks/kanban`, 40 cycle paths — older debt that this work did not introduce.
  - **Project audit history** (`review-c28c7903f7458059`, `approved`, authority burned): two findings, both
    `informational` — `R3-1` **WARNING** `src/lib/api/project-audit.ts:125-131` and `R3-2` **SUGGESTION**
    `src/components/proyectos/project-ficha-dialog.tsx:278`. Read from the ranges and the code, `R3-1` is the read cap:
    the query takes at most `PROJECT_AUDIT_LIMIT` (100) rows with **no truncation signal** — no cursor, no `has_more` —
    so a project with more than 100 ledger rows silently hides the oldest ones; the OpenAPI description says "máximo
    100" but a client cannot see it. `R3-2` sits inside the Historial rendering. The independent verifier reached the
    same cap issue on its own and added: the **within-step order is a lexical coincidence** — `agruparHistorial` sorts a
    step's entries by `entidad`, so it depends on `"oportunidad" < "proyecto"` alphabetically, and the raw query order
    (`id desc`) actually put `CREAR` before `CONVERTIR`, which means that sort is load-bearing and naming-coupled; that
    order is **untested** (the ficha test and the e2e step assert presence, not order); the **gate precedence is
    untested** (nothing drives "missing project + unreadable actor" to prove 404 beats 403, and the approved detail
    route has the same gap); the Historial **loading state is untested**; and the display helpers (`describeAuditValue`,
    `agruparHistorial`, `formatFechaHora`) have no direct unit tests, so their null/array/unknown-entity edges are
    unpinned. None blocks and none reopens the review.
  - **Documentation drift, pre-existing, not repaired:** the `## Progress / Evidence` table's header has five columns but
    several older rows carry more cells, and the physical line holding the S2.2 content concatenates a few units' cells
    (the same rows also exist separately). The S2.3 row was written with the header's five columns. Repairing the table
    is a separate documentation cleanup, deliberately not folded into the S2.3 evidence commit.
  - **Date-input UTC shift unit — lineage debt, environment defects and verifier advisories (2026-10-07).** Produced by
    the unit that landed as `20a2923` (its own row in the table above). **None of these blocks anything and none reopens
    a review** — every one is later work by the disposition that produced it.
    - **Lineage left in `correction_required` as auditable debt:** `review-26a25fad9dfb40ab` (the pre-correction
      candidate, 13 paths / 243 lines) still stands at `correction_required`. Its target no longer matches the
      worktree, so resolving it requires an **explicit user decision to abandon it**; the corrected candidate was
      reviewed and burned separately under its designated successor `review-bf0bd3a1b00039c3`. Never retry it.
    - **Environment defects outside this repository:** the Pi review facade's `recover` does not forward `--base-ref`,
      which a slice-based lineage needs, and `gentle-ai sync` — the documented continuation for the managed-assets
      precondition — aborts on the missing `pi-mcp-adapter` package
      (`Pi CodeGraph MCP capability probe failed: …/pi-mcp-adapter/index.ts: no such file or directory`). Both are
      tooling defects, not candidate defects; every recovery attempt left `lineage_created: false` and mutated nothing.
    - **Pre-existing display defect found while classifying sites:** `InlineDate` in
      `src/components/crm/client-sheet.tsx:676` renders the raw ISO value in its read-only (`disabled`) branch instead
      of a formatter. It predates this unit and was left untouched, because fixing it would have widened a 7-path
      candidate.
    - **Verifier advisories:** `src/components/crm/client-list.test.tsx:102` and `client-form.test.tsx:43` use a
      date-only string for `fecha_entrega`, a column that can hold real instants; and `client-list.test.tsx:59-77`
      hand-rolls the `@/hooks/crm` mock without `importOriginal`, so it can never catch a regression in those helpers.
  - **S2.6 U1 — membership table and read scope: review advisory, spec drift and verifier advisories (2026-10-07).** Produced
    by the unit that landed as `6d9652b` (T1) + `7faf6f7` (T2) (its own row in the table above). **None of these blocks
    anything and none reopens a review** — every one is later work by the disposition that produced it.
    - **Native-review advisory:** `R3-001` **WARNING** at `prisma/migrations/20261007130000_v2_proyecto_miembros/migration.sql:30-41`,
      on the migration's adoption branch. Later work by the review's own disposition.
    - **Spec prose drift:** the SDD (`odd/tasks/v2-projects-sdd.md:1351`) names the inverse field `miembro_de` while the
      schema ships `proyectos_miembro`; the load-bearing relation name `"MiembroProyecto"` matches on both sides and
      nothing in code depends on the field name.
    - **`loadProjectScoped` time-of-check/time-of-use window:** it issues two statements, so a concurrent removal leaves a
      theoretical TOCTOU window; the removal write lands in T3.
    - **Two `as unknown as` casts** in `src/lib/api/projects.ts` bypass the generated select typing, so the probe's shape is
      guaranteed only by tests.
    - **The "execute" half of the feature's objective is not wired:** `canExecuteProject` (`src/lib/permissions.ts:129`)
      has no caller in `src`, and the write gates (`canCreateProject`, `canManageProjects`) are not membership-aware, so a
      COORDINADOR may read their member projects but still cannot write them. Recorded in the S2.6 feature doc too; the
      SDD scopes S2.6 to visibility.
    - **Scratch harness left outside the repository:** the T2 verifier left `C:/Users/Adrian/Documents/t2-verify-attack`
      (with a `node_modules` junction into the repo); it can be deleted.
  - **S2.6 T3 — the E-07 members routes: review advisories, pre-existing gaps and SDD silences (2026-10-07).** Produced
    by the unit that landed as `643375a` (its own row in the table above). **None of these blocks anything and none
    reopens a review** — every one is later work by the disposition that produced it.
    - **Native-review advisories:** `R3-001` **WARNING** at `src/app/api/v1/projects/[id]/members/[userId]/route.ts:49-52`;
      `R3-002` **WARNING** at `src/app/api/v1/projects/[id]/members/route.ts:119-131`; `R3-003` **SUGGESTION** at
      `.../members/route.ts:84`; and `R3-004` **SUGGESTION** at `.../members/route.ts:134-154`. All four are
      `informational` by the review's own disposition. Later work.
    - **A deactivated manager can still change a team:** `src/lib/supabase/server.ts:59-79` (`getSessionUser` returns the
      profile with **no `activo` filter**) plus `src/lib/permissions.ts:93-95` (`canManageProjects` is **role-only**), so
      an actor `{roc: "GERENCIA", activo: false}` was live-proven to get 201/200. **Pre-existing and repo-wide** — only
      `src/app/api/v1/auth/login/route.ts:67` blocks login — and **not introduced by T3**, which added the target-side
      guard instead.
    - **`AUDIT_ENTIDADES_V2` is a declaration only** (`src/lib/api/audit-cambios.ts:21`): `CambioInput.entidad` is a bare
      `string` and neither the writer nor `projectAuditWhere` validates or filters against it, despite a comment claiming
      the reader filters on it.
    - **The failure-direction atomicity (an audit error rolls the membership back) is unexercised:** the guarantee comes
      from the code shape (one `$transaction`), but no test drives it, and the mocked `$transaction` is a passthrough so
      it cannot prove it.
    - **A concurrent double DELETE could write two `EDITAR` rows for the same membership** — harmless and idempotent, and
      not in the SDD.
    - **The SDD silences T3 had to fill**, so a later reader does not mistake them for contract: the GET response is
      `{miembros: [...]}` and DELETE answers 200 `{miembro}`; a non-existent user is 400; DELETE of a non-active member is
      404; and the listing is **oldest-first with an `id` tiebreaker**, because rows written in one transaction share
      `created_at`.

## Progress / Evidence

| Date | Task | Commit | Checks observed | Notes |
|---|---|---|---|---|
| 2026-09-30 | Diagnosis + ODD-01..04 decisions | — | PR triage verified via local git ancestry; working tree restored after a dry cherry-pick probe | No remote action taken yet |
| 2026-09-30 | Scope limit recorded | — | — | Local-only until explicit approval; Phase 1 gated. `gh` account = `MuttuHub`; merge style = squash |
| 2026-09-30 | Session 2: rebase onto `main` + baseline re-verification | `5f4e4a8` (branch tip; every v2 commit rewritten) | `tsc` 0 errors; `vitest` 120 files / 1094 tests green in 48.8 s; Docker up; `.env.local` loopback | `96c4c5c` dropped as already-applied; `CLAUDE.md` note kept uncommitted; **no source written** |
| 2026-10-01 | Session 3: `CLAUDE.md` closed + S0.6 migration safety kit | `bd7cc00` (docs) + `108c682` (S0.6) | S0.6: RED both spec files unresolved → GREEN 13 tests (5 guard + 8 harness); `tsc` 0 errors; eslint clean; `s1-rubros-report` read-only, host `127.0.0.1:54322`, zero-valued row; `storage-orphans` 11/11/0/0; independent verifier confirmed guard-first import, hash-before-write, one 120 s `$transaction`, `list()`-only storage, and `.gitignore` as the only modified tracked file | S0.4/S0.5 hash table below is now stale by one commit |
| 2026-10-01 | Session 3: native review of S0.6 (R3-001 fixed) | `959ca33` | 4 lenses ran (host relay, ~293 s); 1 CRITICAL deterministic finding (R3-001: truncated plan hash) fixed RED-first → 13/13 green, `tsc` 0 errors, eslint clean; 12-line correction plan accepted | Review left open at `correction_required`: the final targeted-validation slot is unreachable from the Pi facade, so nothing was approved |
| 2026-10-01 | Session 3: S0.7 project permission predicates | see the commit after `959ca33` | Scope recalibrated (v1 paths absent → route/UI 403 tests deferred to S2.x); RED 13 failures → GREEN **63 tests**, `tsc` 0 errors, eslint clean, `git diff -U0` = one pure append hunk with 0 deletions | Verifier confirmed all 13 predicates, zero `canManageAny`, no write predicate reading the gerencial flag; blocked commit on two untested positive branches, both closed |
| 2026-10-01 | Session 3: CP-1 remote backup + CP-2 production audit + CP-4 suite envelope | `86a6e9d` + the CP-4 commit | CP-1: user pushed `feat/projects-v2` to `origin` (tip `0dc08ec` at push time, additive, no PR). CP-2: read-only audit → 8 abandoned v1 tables in production with 4 rows total, `auditoria_cambios` absent, phantom migration `20260918153200_tablero_seguimiento_social` (recoverable from `6e4c6c8`). CP-4: two concurrent suites → 6-7 failures each, one suite → 122/122 green; `pool: threads` + `maxWorkers: 4` pinned, 3 sequential runs green, `tsc` 0 errors | CP-4's first revision was **refuted** by the verifier (`minWorkers` is not a vitest 4.1.10 option and broke `tsc`); removed, and the comment's unreproduced numbers were corrected. The review of the branch-wide candidate is impossible by budget (measured twice) — nothing approved |
| 2026-10-01 | Session 4: S0.9b completion + the B1 correction | `415ec27` (code + SDD) | Round 1 (9 files, +899/−73): sign kind `documento_nuevo` pre-generating the id and signing the final key, JSON confirm branch deriving the id/cliente from the signed path, kanban client migrated. Independent verifier pass 1: `READY TO COMMIT: no` — all commands green but **B1** blocking. Round 2: shared `guardDocumentCreate` (categoria 400 / restricted 403 / duplicate 409) called by the sign endpoint **before `createSignedUploadUrl`** and re-called by the confirm branch; thrown-Storage path returns the envelope; decorative guard call removed; two test gaps closed. Verifier pass 2: `READY TO COMMIT: yes`. Own checks: 7 focused files / **85 tests** green; **full suite 126 files / 1194 tests green** in 123 s; `tsc` 0 errors; eslint clean | B1 was a **parity regression**: the multipart path rejected the same request before any Storage write, the signed path after it, so every routine duplicate-title/categoria attempt leaked a permanent orphan. R-17's size-only acceptance did not cover it |
| 2026-10-01 | Session 4: native review of the S0.9b slice | lineage `review-ba69dfb46439abc1` | `review.start` over the **full slice** (base tree `35da212` = `2cbc678`, `committed-only`): 21 paths, 2934 lines, tier **medium**, one lens (`review-reliability`), correction budget 200. Consent envelope relayed verbatim; the human chose `granted`. One reviewer ran (host relay, prompt 166 KB → result 5.9 KB). State **approved**; two advisory `informational` findings (R3-1 WARNING, R3-2 SUGGESTION); acknowledgement completed, **authority burned** | Satisfies RDD. The same session's plans-only candidate (`review-0d0f1e39bb4aadc2`, 26 lines, risk low, `non_executable_only`, 0 lenses) was also approved and burned. The user explicitly **deferred** review of the pre-correction code candidate `sha256:edeb3872…` to the corrected one — a human disposition, not an opt-out |
| 2026-10-01 | Session 5: S0.9b hygiene unit (one home for the create gates + R3-1) | `8d10180` | The multipart branch of `POST /documents` now takes categoria validity, restricted-category authorization and the duplicate-title conflict from `guardDocumentCreate` (`parseUploadForm` is called with `requiereCategoria: false`) and its inline copies are deleted; the confirm branch's documento/version/cliente inserts are one `db.$transaction` with the audit call and the extraction outside; the guard's tests pin `mode: "insensitive"` / `deleted_at: null`. Verifier: `READY TO COMMIT: yes`, no blocking finding, response contract byte-identical, three benign ordering deltas named. Own checks: focused 41 + 8 + 18 + 14 green; **full suite 126 files / 1201 tests green** (baseline 1194); `tsc` 0 errors; eslint clean | **medium** tier, 1 lens (`review-reliability`), lineage `review-d4d492b8adb83210`: **approved**, acknowledged, **authority burned**; one advisory WARNING at `route.ts:526`, `informational` | Closes S0.9b residual 2, the guard-assertion gap and **R3-1**. `src/lib/api/documents.ts` needed no change. The first capture attempt failed with `native-status-failed — the negotiated review operation exceeded its aggregate time budget`; the identical retry succeeded |
| 2026-10-01 | Session 6: user decisions + S1.1a (greenfield rubro catalog) | see the commit after `d55144e` | Decisions closed: D-05 confirmed narrow, R3-001 accepted as a documented residual, **no orphan sweeper ever**, and the v1 openspec change `proyecto-financiero-tab` marked superseded while staying out of git. Then a read-only recon established S1.1a is **greenfield** (no `Rubro` model, table, migration or route; the SDD's "VERIFIED" citations pointed at v1 code absent from this branch), and it is the recon that surfaced the production collision: the abandoned v1 `rubros` table would abort a plain `CREATE TABLE` at `migrate deploy`. Delivered as recalibrated: `RUBROS_V2`, the `Rubro` model, the adoptive/idempotent migration, `s1-rubros.ts` + `planRubros()` test, `GET`/`PATCH`/`DELETE` routes (+ tests), the trigger's live-DB invariant test, the adoption-path test running the real SQL text in a throwaway schema, the seed and the OpenAPI paths. Also fixed at the root: the S0.6 harness's `writeLote` used a delegate the client never exposes, so **no real `--apply` had ever worked**. Own checks: focused green throughout; **full suite 131 files / 1226 tests green** (baseline 126/1201); `tsc` 0 errors; eslint clean on 15 files. Script exercised dry-run → apply → revert → re-apply against the local DB | Verifier pass 1 `READY TO COMMIT: yes` (no blocking finding) and it independently confirmed the harness defect; verifier pass 2 after the correction also `yes`, with isolation confirmed and the judgement that the harness test would now fail red if the defect returned | Residuals recorded in the S1.1a block: the reconstructed (not `pg_dump`) adoption shape, the untouched `activo` on the two backfilled rows, the invisible suspended rubros, the unexecuted seed path, and three unstrengthened assertions left because the writer runtime failed three times (bash stall, model never started, `capacity quarantined`) |
| 2026-10-02 | Session 7: S1.1a review re-creation attempt | no commit, no lineage | `inspect` → `managed_assets_outdated` → ran the **prescribed** `gentle-ai sync --agent pi` (installed the v4.0.0 managed assets, 9 files) → `inspect` ready again, offering only the **branch-wide** candidate (left unstarted by prior decision) → START for the slice `d55144e89ddc37dd671e0195382e9b0281563da5..HEAD` with `{"mode":"ordinary","baseRef":…,"committedOnly":true}` → `candidate-owner-parent-chmod-ineffective`: v4.0.0 attests POSIX privacy on `<git-common-dir>/gentle-ai/candidate-views` and `/mnt/c` is 9p `drvfs` without `metadata` (`stat` reads `777`; a `chmod 700` probe read back `777`). The first, badly-formed attempt (`mode` omitted) had failed as `graph-v1 START requires lineageId`. **`lineage_created: false` / `mutation_outcome: none` both times** | Blocker is environmental and clone-wide, not about this candidate: **no** native review can start here until it is fixed. User chose (2026-10-02) to enable `[automount] options = "metadata,umask=22,fmask=11"` in `/etc/wsl.conf`, then `wsl --shutdown` and reopen. Safe: `core.filemode=false` and all 472 tracked files `100644`. Next step after the restart: `inspect` → START the same range with a fresh key (executed in session 8, next row) |
| 2026-10-02 | Session 8: the three `/mnt/c` blockers cleared + **S1.1a review CLOSED** | no commit yet at the time of the review; this row lands in the docs commit that follows `a9f89a8` | Environment, all three measured rather than assumed: (1) `metadata` active on the 9p drvfs mount (confirmed in `/proc/mounts`), so `chmod 700` is honoured again; (2) `.git/gentle-ai/candidate-views` set to `700` **by hand**, because `metadata` alone does not satisfy the owner-parent privacy attestation (`review-candidate-view-owner.ts:306`); (3) `GENTLE_PI_CANDIDATE_GIT_TIMEOUT_MS=60000` exported in `~/.bashrc` **and Pi restarted**, because `lib/review-candidate-view.ts:15` caps each `git checkout-index` at 10 s while it materializes the **whole** tree — 472 files, measured **18.28 s cold / 19.17 s warm**, `sys 0.77 s` (pure 9p I/O), split into 2 path-batches of ~9.3 s each. Then the review ran end to end | `lineage_id=review-eea4c3aa7621c16c`, target `sha256:7d5967a7…`, **19 files / 1548 lines**, tier **medium**, **one lens** (`review-reliability`), correction budget 200, `base-ref=6055d125…` (the slice, not the branch). Consent resolved by the host with **option 3** ("Review and allow this session"). Capture forecast: 1 model run, `pi_host_relay`. Closing `native-last-event-closure` → **`approved`**; acknowledgement completed → **`authority: burned`** (`gentle-ai.review-acknowledged/v1`). Findings **advisory only, none blocking**: R3-1 WARNING at `migration.sql:34`, R3-2 SUGGESTION at `s1-rubros.ts:175-187`. Worktree untouched (clean at `a9f89a8`, `candidate-views` empty afterwards) |
| 2026-10-02 | **S0.1** decision log + superseded v1 openspec change — **the S0 phase is now CLOSED** | docs commit that follows `9892f79` | The superseded banner went into the **only** v1 openspec change on disk (`openspec/changes/proyecto-financiero-tab/`: `proposal.md` + `design.md`); the five other changes the original goal named **do not exist anywhere**. `.git/info/exclude:33` keeps that directory out of git (`git status --porcelain openspec/` is empty, and the exclusion was deliberately left alone per D-07), so the banner is intentionally untracked and acceptance is evidenced by reading the file on disk — not by a commit | The plan's decision table now points at **SDD §7.3** as the maintained state (only N-23 blocks anything, and only S9.3b), and the SDD's S0.1 acceptance criterion was corrected from "six files carry the status line" to "the one that exists". Folded into the same commit: the **push** of the 9-commit batch (`dbc2f52..9892f79`) on user authorisation |
| 2026-10-02 | **S1.2** strategic-lines catalog (`LINEAS_ESTRATEGICAS_V2` LE01..LE08) | delegated writer (1 round) + independent read-only verifier | see the commit after the S1.2 recalibration | Recon **before** writing found it greenfield and corrected the SDD: no `LineaEstrategica` enum exists (REQ-CAT-03's citation `schema.prisma:102-111` actually points at `model Usuario`), and 2 of the 5 RED scenarios need a `Proyecto` that S2.1 creates, so they were deferred instead of faked. Delivered: the model, the adoptive/idempotent migration (seed + conditional immutability trigger), 4 routes (GET any user; POST/PATCH/DELETE ADMINISTRADOR; suspend-never-delete), the seed section, OpenAPI, and 2 live-DB invariant files. Own checks: focused 20 + 29 green; live-DB invariants 7 green; **full suite 135 files / 1255 tests green** (baseline 131/1226); `tsc` 0; eslint clean on 11 files. Migration applied → 14 migrations, in sync, no drift, and the 8 rows plus the trigger confirmed directly in the local DB | Verifier: **READY TO COMMIT: yes**, no blocking findings; it judged the three interpretation choices (soft-delete over the rubro 409, explicit `codigo` on POST, `codigo NOT NULL`) all non-defects | **Environment incident:** the local Supabase stack had been **down for two days** (`supabase_db_muttu-hub` `Exited (127)`, with auth/storage/realtime stuck in a restart loop), so the writer could not apply the migration or run the live-DB tests; fixed with `docker desktop start` + `supabase start` (non-destructive: no `stop --no-backup`), after which everything ran clean. Residuals are in the S1.2 block: the unexercised `seed.ts` path, the `ADD COLUMN … NOT NULL` edge, and no dedicated OpenAPI test |
| 2026-10-03 | **Test-hardening unit** — the three weak assertions + the OpenAPI gap + the two unexercised seed paths | delegated writer (1 round) + independent read-only verifier | `986cf3b` (restored row) | Closed four recorded residuals without touching production code. The harness fake now **counts** `lote` writes and pins exactly **1** per `--apply` / **0** per `--dry-run`; both catalog migration tests assert `indisunique = true` on the code index and the adoption test proves a duplicate non-NULL `codigo` is rejected; the `public` guard snapshots **rows + functions + triggers**; and a new `src/lib/openapi/document.test.ts` pins the assembled document's catalog paths. Separately `npm run db:seed:local` ran end to end (`Rubros: 15`, `Líneas estratégicas: 8`, exit 0), closing the "unexecuted seed path" residuals of S1.1a and S1.2 | Verifier: **`READY TO COMMIT: yes`**, no blocking findings; it judged each strengthened assertion genuinely meaningful rather than test theatre, confirmed no existing assertion was weakened, and confirmed the harness fake still models the real `writeLote` faithfully | **Test-only change**: full suite **136 files / 1258 tests green** (baseline 135/1255), `tsc` 0, eslint clean |
| 2026-10-05 | **S1.3** municipios catalog (`Municipio`; the migration seeds nothing) | delegated writer (1 round) + independent read-only verifier (**2 passes**) | `4762eb8` (restored row) | Recon first: greenfield again (no `Municipio`, no `territorio`), so the catalog starts **empty** by decision and only the demo seed populates it. Delivered: the model (unique `(nombre, departamento)` together, unique `codigo_dane` when present), the adoptive/idempotent migration with **zero INSERTs**, `GET`/`POST`/`PATCH`/`DELETE /api/v1/municipalities` (GET any user; mutations ADMINISTRADOR only; suspend-never-delete), OpenAPI, two live-DB invariant files, and `seedMunicipios()` with 7 real municipios. Own checks: focused 45 green; **full suite 140 files / 1302 tests green**; `tsc` 0; eslint clean on 9 files; migration applied → 15 migrations, in sync, and **0 rows before the seed**; the seed ran end to end | Pass 1: **`READY TO COMMIT: no`** — a real blocking defect: the invariant test reused `codigo_dane 05001`, which the same unit's demo seed assigns to Medellín, so the full suite was red on a migrated + seeded database (the rollback was correct; the collision was with a committed demo row). Fixed in one line (`99001` synthetic, plus a comment) and re-verified. Pass 2: **`READY TO COMMIT: yes`**, suite 140/1302 with 0 failures | Two project-dependent scenarios stay deferred (they need `Proyecto`, S2.1); API-only as decided; pass-1 advisories recorded in the consolidated backlog below |
| 2026-10-05 | **S2.1a** `Proyecto` schema + adoption migration (the schema half of S2.1) | delegated writer (1 round, stopped once on a spec error) + independent read-only verifier | commit that follows | Recon first: the task title said "Expand `Proyecto`" but **`Proyecto` did not exist** (22 models, none of them `Proyecto`; the v1 module never shipped), so S2.1 was split into **S2.1a** (schema, this row) and **S2.1b** (API). The design in §4.2 is a *delta* written for the v1 model, so the base field list was assembled from the repo's own authoritative sources — the API contract table E-02/E-03, ADR-09 and the plan's F1 — instead of being invented. Delivered: `EstadoProyecto` + `OrigenProyecto`, the `Proyecto` model, `ProyectoLinea`, `ProyectoMunicipio`, five back-relations, and **one** migration `20261006120000_v2_proyecto_general` with no seed and no CHECK. Checks: focused 11 green; **full suite 142 files / 1313 tests green** (baseline 140/1302) run twice on the **migrated + seeded** DB; `tsc` 0; eslint clean; `prisma/` 63 green; schema valid; migration applied as **16 of 16 with no drift** | Verifier: **`READY TO COMMIT: yes`**, no blocking findings, and it proved the guarantees **at the database level, not by the constraints' existence**: the composite FK rejects a project whose client differs from its opportunity's, the partial index rejects a second principal line while allowing many non-principal ones, and a second project per opportunity is rejected | **The writer stopped on a real error in my own spec**: Prisma P1012 rejects a 1:1 relation whose defining tuple is not unique. Correction is **option A** (`@@unique([oportunidad_id, cliente_id])` kept alongside the composite FK), the only candidate preserving the guarantee that a project cannot point at another client's opportunity. Advisories: a non-reproducible `40P01` deadlock among four concurrent DDL migration suites (CI flake candidate), the composite FK's hidden dependency on the pre-existing `oportunidades_id_cliente_id_key` index, and the `ADD COLUMN … NOT NULL` greenfield assumption |
| 2026-10-05 | **S2.1b** project API + pure general-data rules (the API half of S2.1) | delegated writer (1 round) + independent read-only verifier | commit that follows | `src/lib/proyectos/proyecto-general.ts` (`validarLineas` with the copy the SDD's own scenario quotes, `duracionProyecto` **delegating to the existing `durationWeeks`** rather than duplicating week arithmetic); `src/lib/api/projects.ts` (`PROJECT_SELECT_V2`, `ProjectItemV2`, `toProjectItemV2`, read-scope helpers, `projectListWhere`, audited-field list, line/municipio diffs, referential checks); `GET /api/v1/projects` (E-02 + its five filters); `GET`/`PATCH /api/v1/projects/:id` (E-06: `BORRADOR`-only, one transaction, per-field and per-line/municipio audit via `logChanges`); and the OpenAPI paths. `prisma/` untouched. Checks: focused 44 green; **full suite 145 files / 1356 tests green** (baseline 142/1313) on the migrated + **seeded** DB; `tsc` 0; eslint clean on 9 files | Verifier: **`READY TO COMMIT: yes`**, no blocking findings, and it attacked rather than read the slice: no path mutates a non-`BORRADOR` project, every write shares one transaction with its audit, `validarLineas` is enforced **by the route**, the list scope is a `where` restriction the caller cannot widen, and `estado`/`miembro_ids` are refused with 400 rather than ignored. It also found **one real defect in our own new code** (see below) and confirmed nothing outside the declared surfaces moved | **Read scope is narrow by design until S2.6**: `projectReadActor()` pins `es_miembro: false` (the membership table is S2.6) and `puede_ver_tablero_gerencial: false` — pinned because **that column does not exist in this branch's schema at all**, so nothing can resolve it. Net effect today: ADMINISTRADOR/GERENCIA see every project, everyone else gets an empty list and a 403 on the detail → **the Friday demo must be shown as an ADMINISTRADOR**. **Defect to fix in S2.3, not optional**: a JSON *scalar* body answers **500 instead of 400** at `src/app/api/v1/projects/[id]/route.ts:183`, and S2.3 will copy that guard. Also recorded: the 409 is built locally because `ApiErrorCode` lacks `INVALID_STATE` (widen it in S2.2/S2.3), and there is **no live-DB test for the PATCH transaction** (route tests mock `@/lib/db`; `tsx` cannot run in this shell because the installed esbuild binary is win32-x64 while the shell is linux-x64) — **S2.3 must close it with an end-to-end create → list → patch test against the live DB**, since that is the demo's own path |
| 2026-10-05 | **S2.2** autogenerated `PRY-AAAA-NNN` project codes + `INVALID_STATE` widened | delegated writer (1 round) + independent read-only verifier | commit that follows | `src/lib/proyectos/codigo.ts` (pure format/parse, minimum three digits and never truncated) and `src/lib/api/project-code.ts` (`nextProjectCode(tx, year)`, transaction-scoped, one atomic upsert with `ON CONFLICT … DO UPDATE SET "ultimo" = "ultimo" + 1 RETURNING "ultimo"`, floor initialised from the max existing code for that year); the standalone `ProyectoSecuencia` model; one adoptive migration `20261007120000_v2_proyecto_secuencias` that seeds nothing; and `"INVALID_STATE"` added to `ApiErrorCode` and to the `ErrorEnvelopeSchema` enum, which closes the gap that forced S2.1b to build its 409 locally. Checks: pure 11 + mocked 3 + live-DB 2 green; **full suite 148 files / 1373 tests green** (baseline 145/1357); `tsc` 0; eslint clean; 17 migrations | Verifier: **`READY TO COMMIT: yes`**, no blocking findings. It reasoned the first-allocation race instead of trusting a comment: two concurrent transactions can both compute the same floor, and the loser still gets `floor + 1` because the update reads `"ultimo" + 1` and not `EXCLUDED.ultimo`. It confirmed the allocator never opens its own transaction, that the floor read is scoped to the year, and that soft-deleted rows still raise it | **Demo protection verified**: every DB-touching test uses a synthetic year (1999), and after the full suite `proyectos` and `proyecto_secuencias` are both empty, so the demo's first allocation is still `PRY-2026-001`. Advisories: a third client-side `ApiErrorCode` copy in `http.ts`, a now-stale comment in `projects.ts` for S2.3 to fix, the floor being applied only on the INSERT path (a backfill bypassing the allocator could desync the counter), the migration's adoption branch assuming an empty table, and a redundant per-call prefix read | Recon first: greenfield again (no `Municipio`, no `territorio`), so the catalog starts **empty** by decision and only the demo seed populates it. Delivered: the model (unique `(nombre, departamento)` together, unique `codigo_dane` when present), the adoptive/idempotent migration with **zero INSERTs**, `GET`/`POST`/`PATCH`/`DELETE /api/v1/municipalities` (GET any user; mutations ADMINISTRADOR only; suspend-never-delete), OpenAPI, two live-DB invariant files, and `seedMunicipios()` with 7 real municipios. Own checks: focused 45 green; **full suite 140 files / 1302 tests green**; `tsc` 0; eslint clean on 9 files; migration applied → 15 migrations, in sync, and **0 rows before the seed**; the seed ran end to end (`Rubros: 15`, `Líneas: 8`, `Municipios (demo): 7`) | Pass 1: **`READY TO COMMIT: no`** — a real blocking defect: the invariant test reused `codigo_dane 05001`, which the same unit's demo seed assigns to Medellín, so the full suite was red on a migrated + seeded database (the rollback was correct; the collision was with a committed demo row). Fixed in one line (`99001` synthetic, plus a comment) and re-verified. Pass 2: **`READY TO COMMIT: yes`**, no blocking findings, suite 140/1302 with 0 failures | Two project-dependent scenarios stay deferred (they need `Proyecto`, S2.1); API-only as decided; and the pass-1 advisories are recorded — the pre-existing **`scripts/offboard-camarabaq.ts` production-write path** (now an *Open items / risks* entry) and the explicit `npm run db:generate:local` step that any schema unit now needs | Closed four recorded residuals without touching production code. The harness fake now **counts** `lote` writes and pins exactly **1** per `--apply` / **0** per `--dry-run` (the most valuable, since a fake that restates the production call shape is what once hid the `writeLote` delegate defect); both catalog migration tests assert `indisunique = true` on the code index and the adoption test proves a duplicate non-NULL `codigo` is rejected; the `public` guard now snapshots **rows + functions + triggers**; and a new `src/lib/openapi/document.test.ts` pins the assembled document's catalog paths so a broken registration import fails a test, not just `tsc`. Separately, `npm run db:seed:local` ran **end to end** against the local DB (`Rubros: 15`, `Líneas estratégicas: 8`, exit 0), closing the "unexecuted seed path" residuals of both S1.1a and S1.2 | Verifier: **READY TO COMMIT: yes**, no blocking findings; it judged every strengthened assertion genuinely meaningful rather than test theatre, confirmed no existing assertion was weakened or deleted, and confirmed the harness fake still models the real `writeLote` faithfully so the delegate defect cannot return unnoticed. Advisory: the widened `public` snapshot is broader than the leak it guards (environment-coupled if run against a different Supabase version) | **Test-only change**: full suite **136 files / 1258 tests green** (baseline 135/1255), `tsc` 0, eslint clean |
| 2026-10-05 | **S2.3** creation API: a project from a GANADA opportunity in one audited step (E-03/E-04/E-05) | `3a42837` | Delegated writer (three rounds: implement, close the V-04 gap, close the verifier's findings) + independent read-only verifier in **two passes**; RED first for every behaviour (9 POST failures, then the four out-of-range assertions); focused **91 green**; **full suite 151 files / 1431 tests green, run twice** on the migrated + seeded DB (baseline 148/1373, exactly additive); `tsc` 0 errors; eslint clean on 13 files; the forced-rollback integration test (`prisma/proyecto-create-flow.invariant.test.ts`) drives the real route handlers and leaves `proyectos` and `proyecto_secuencias` empty with no 2026 sequence row, so the demo's first allocation is still `PRY-2026-001` | Three debts closed: the local 409 helper deleted for the shared `apiError(…, 409, "INVALID_STATE")`, `normalizeProjectDate`/`toProjectDecimal` moved into `src/lib/api/projects.ts`, and the V-04 active-catalog rule implemented via `onlyActive` on E-03/E-05 while PATCH keeps the existence-only default. The verifier found a real **P2020 500-shape** in this unit's own new code (`valor_total` beyond `numeric(15,2)`, `beneficiarios_meta` beyond `int4`) and it was fixed in-unit — bounds added to both POST schemas and to the PATCH schema. New advisories recorded in the backlog below. |
| 2026-10-05 | **S2.3 native review** (per-slice lineage) + the ODD evidence commit | `1ef1e97` (docs) | `review.start` over the **slice** (`base-ref afa4c27226ae6aa691aef3d008a4a4047c0962d1`, `committed-only`), ignoring the branch-wide candidate `inspect` offers by default: **15 paths / 2071 lines**, tier **medium**, **one lens** (`review-reliability`), correction budget 200. Consent was resolved by the host — no envelope reached the model. Forecast relayed (1 model run, `pi_host_relay`), then one host-relay reviewer run. `native-last-event-closure` → **`approved`**; `acknowledge-approved` executed → **`authority: burned`** (`gentle-ai.review-acknowledged/v1`), `delivery: ordinary-repository-policy` | Four advisory findings, **all `informational`, none blocking**, so no correction opened: `R3-001` WARNING at `.../project/route.ts:196-200`, `R3-002` WARNING at `.../project/route.ts:107-128`, `R3-003` WARNING at `src/app/api/v1/projects/route.ts:231-248`, `R3-004` SUGGESTION at `src/app/api/v1/projects/route.test.ts:367-379` — recorded in the backlog above with their line-range substance. This row's commit carries the SDD DONE block, this row, the backlog entries, the sprint-plan status, and the note that the Progress table's older rows are malformed. **First lineage of the session (1 of ~7).** |
| 2026-10-05 | **Minimal UI, unit 1**: the read-only projects list at `/proyectos` | `3e94c11` (6 files, +863/−0) | RED first — the focused tests failed against the previous code, including the verifier's exact `TypeError` reproduced through the table; 26 focused green; **full suite 153 files / 1452 tests green** (baseline 151/1431, exactly additive); `tsc` 0 errors; eslint clean. Independent read-only verifier: `READY TO COMMIT: yes`, no blocking findings | **Native review (per-slice lineage)**: `review.start` over the slice (`base-ref 3adfca1241eba538f177cfff760b6e763a3dd144`, `committed-only`), **6 paths / 863 lines**, tier **medium**, one lens (`review-reliability`), correction budget 200; consent resolved by the host; forecast relayed (1 model run, `pi_host_relay`); one host-relay reviewer run; `native-last-event-closure` → **`approved`**, `acknowledge-approved` → **`authority: burned`** (`lineage review-1451215e08828bb2`). Three advisory findings, none blocking. The ledger rows for this unit were deliberately **batched with unit 2's into one docs commit** so that a docs-only candidate never spends a lineage. |
| 2026-10-05 | **Minimal UI, unit 2**: the creation dialog with the opportunity-origin step — the demo's centrepiece | `885401f` (6 files, +1254/−14) | RED first; focused green; **full suite 154 files / 1475 tests green** (baseline 153/1452, additive); `tsc` 0 errors; eslint clean. Independent read-only verifier: `READY TO COMMIT: yes`, no blocking findings, and it proved the `["projects"]` invalidation is a **prefix** that reaches the `eligible-opportunities` key | Origin first, as REQ-ORG-01 requires, with "desde una oportunidad ganada" as the default path. The eligible path posts to `/clients/{cliente_id}/opportunities/{opportunityId}/project` so the API's own pairing check decides and the client stays **server-supplied and read-only** — never a user-editable field. The visible prefills are the recorded product decision (responsable = the logged-in user, `fecha_inicio` = today, `fecha_fin` = today + 3 months, first strategic line as principal, no municipio preselected) and they **satisfy E-03 instead of reopening a contract whose review was already burned**. Validation (`≥1` municipio, exactly one principal line, `fecha_fin` ≥ `fecha_inicio`) runs **before** the request, and a 409 keeps the dialog open with the server's own message. The three missing hooks (`useEligibleOpportunities`, `useStrategicLines`, `useMunicipalities`) close unit 1's `R3-stale-data` WARNING. **Native review**: lineage **`review-4f91c178f70194dd`** — the previous attempt died on the environment with `lineage_created: false` and burned nothing — slice `base-ref 3e94c113d71b0caf0de71b7b09ae3988b65866f2` (frozen base tree `62cecaf2b6b864300abb8bf25d1e3bad25fc57ca`, which **is** `3e94c11`'s tree, confirming the selector was honoured), **6 paths / 1268 lines**, tier **medium**, one lens (`review-reliability`), budget 200; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**. Four advisory findings, none blocking. **Two lineages for the two UI units**, both closed `approved` with zero corrections. |
| 2026-10-06 | **Demo reset**: `npm run db:demo:reset:local` — dry-run-first, loopback-only rehearsal reset | `5ee8d36` (`scripts/reset-demo.ts` + `scripts/reset-demo.test.ts` + `docs/guia-demo.md` §1.5 + one `package.json` script; 4 paths / 788 lines) | Delegated writer (one round) + an independent read-only verifier against the **live loopback DB**. 12 focused tests green; **full suite 155 files / 1487 tests green** (baseline 154/1475, exactly additive, +1 file / +12 tests); `tsc` 0 errors; eslint clean on both new files; `vitest.config.ts` sets no `include`, so the default glob does collect `scripts/reset-demo.test.ts` (verified with `vitest list`, not assumed). The verifier proved the load-bearing guarantees **at the database rather than by reading the constraints**: the delete order (municipios → lineas → proyecto → oportunidad → secuencia) driven inside a `db.$transaction` with a **forced rollback**, with pre- and post-rollback counts identical; `proyectos.oportunidad_id_key` read from `pg_indexes` as a plain **non-partial** UNIQUE index, which is what makes the hard delete required rather than stylistic; the two child FKs read from `pg_constraint` as `r` (RESTRICT); the default mode proven write-free by before/after counts; and the loopback guard proven to refuse an unreachable non-local host **before any connection attempt** | The demo converts a `GANADA` opportunity into a project and `PRY-2026-001` is a consumable resource, so every rehearsal needs the pre-conversion state back; this is the unit that makes the rehearsal repeatable. `planDemoReset` is **pure and time-free**: a project is deleted only while `estado` is still the initial `BORRADOR` (anything that shows work — another state, a soft delete — is reported with its reason and left alone), a converted opportunity returns to `PROSPECCION` only when that would actually change a value, and a `proyecto_secuencias` year row is dropped only when no surviving project of that year remains (matching `nextProjectCode`'s floor-from-max, so deleting a row cannot duplicate a code). `auditoria_cambios` is **never referenced** — append-only, its triggers reject UPDATE/DELETE, and a rehearsal is not an auditable business event. `require-local-db` is the **first import**, so it loads `.env.local` and refuses a non-loopback host before `@/lib/db` can build a Prisma client, and the script reuses the shared adapter-backed client instead of instantiating one. **Native review**: slice `base-ref 18dfba337eabf6904656546d6b52595542aa4b63` (`committed-only`); the frozen base tree `da1909a7d720c0ae93ae4ec8020f73308598daed` **is** `git rev-parse 18dfba3^{tree}` and the candidate tree `f91c4c14c73718ac18db3482dcb8afd979a1cddd` **is** `git rev-parse 5ee8d36^{tree}`, so the slice selector was honoured and the ~118-path branch-wide candidate that `inspect` offers by default was correctly ignored. **4 paths / 788 lines**, tier **medium**, one lens (`review-reliability`), correction budget 200; the host resolved the consent (no envelope reached the model); forecast relayed (1 model run, `pi_host_relay`), then one host-relay reviewer run; `native-last-event-closure` → **`approved`**, `acknowledge-approved` → **`authority: burned`** (`gentle-ai.review-acknowledged/v1`), `delivery: ordinary-repository-policy`. Two advisory findings, none blocking, recorded in the backlog above. **Operational note worth keeping:** the first START of this candidate came back `consent-binding-expired` — the host-created consent binding went unanswered for 10 minutes — with `lineage_created: false` and `mutation_outcome: none`, so nothing was created and nothing was burned; a fresh START with a new key created the lineage on the second attempt. **First lineage of this session, and the third of the sprint's ~7 budget** (the two UI units spent the other two). |
| 2026-10-06 | **Rehearsal spec** of the demo's real path: `e2e/proyectos-demo.spec.ts` + a `PLAYWRIGHT_BASE_URL` override + the operator ritual in the guide | `8d260b9` (3 paths / 217 lines: the new spec, `playwright.config.ts`, `docs/guia-demo.md` §1.6) | Delegated writer (one round) + an independent read-only verifier that re-ran everything itself. The spec **passed twice from the same clean reset state** (29.2 s and 38.1 s), and the verifier confirmed the persisted row with **direct SQL**, not through the app: `codigo=PRY-2026-001`, `estado=BORRADOR`, `origen=OPORTUNIDAD`, `valor_total=180000000.00`, `proyecto_lineas`=2 with `principales`=1, `proyecto_municipios`=1, and the consumed opportunity at `fase=EJECUCION` with `fecha_adjudicacion` set. The verifier then read the placeholder guard and measured a healthy run at 29.2 s (no 45 s of dead time), proved there is **no** `page.route`/mock/`skip` in the spec, and confirmed `tsc` 0, eslint clean, the config's default unchanged, and both `test-results/` and `playwright-report/` gitignored. Verdict: `READY TO COMMIT: yes`, no blockers, six advisories | The demo's promise is "create a project from a `GANADA` opportunity and see it listed", and **no real row had ever been rendered** — every other test mocks `fetch` and the seeded `proyectos` table is empty — so this spec is the rehearsal, the backup recording, and the only end-to-end proof. One serial test with the mold's `beat()` pacing, so one run yields one watchable video; the recording was spot-checked by extracting the frame at 32 s, which shows the real row (`PRY-2026-001` · Renovación convenio · Empleabilidad · Emprendimiento · Universidad Central del Valle · **Borrador** · Laura Jiménez) with the "Proyecto creado desde la oportunidad." toast. Two deliberate design points: the eligible-opportunity precondition is guarded explicitly (the `No hay oportunidades ganadas sin proyecto.` placeholder renders both while the query is in flight and when it resolves empty, so the spec waits for the card first and only then reports a genuine empty state with the reset instruction), and the strategic-line step unchecks the catalog's default principal before checking another, because the seed's first line is already principal and two principals would fail validation. **Native review**: lineage **`review-64049fe2311fe1ea`**, slice `base-ref 474d7fd…` (`committed-only`), 3 paths / 217 lines, tier **medium**, one lens (`review-reliability`), budget 109; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**. Three advisory findings, none blocking, whose locations **match the verifier's advisories one for one** — recorded in the backlog above. **Environment finding worth the ink:** the human started `next dev` from Windows, so from WSL `http://localhost:3000` does not connect while the server is up; the config change is what makes the rehearsal runnable at all, and the default keeps every existing spec unaffected. The recorded video is gitignored, and a copy was preserved outside the tree at `~/muttu-demo/ensayo-proyectos-20261006-0920.webm` because a later Playwright run overwrites `test-results/`. **Fourth lineage of the sprint (~4 of 7); second of this session.** |
| 2026-10-06 | **Project ficha**: the read-only detail dialog opened from the list | `b2a2fcd` (8 paths / 645 lines: the new ficha, the new `project-display.ts`, the list action, `useProject`, and their tests) | Delegated writer (**two rounds**) + an independent read-only verifier. Round 2 was forced by a defect the first round left: the dialog imported its display helpers **from its own parent** (`project-list.tsx`), which imports the dialog, so the child depended on the parent. Extracting `project-display.ts` fixed it, and because it was a pure refactor the test count proves it — **156 files / 1496 tests before and after**. Checks: focused green; full suite **156 / 1496** (baseline 155 / 1487, purely additive); `tsc` 0; eslint 0; and the **rehearsal spec passed untouched** (29.4 s) against the live dev server with the database reset before and after, which is what proves the list still drives the demo. The verifier went further and fetched the real E-06 payload with an authenticated `curl`: `valor_total:"180000000"`, `diferencia_valor_oportunidad:null`, 2 lineas (LE02 principal), 1 municipio. Verdict: `READY TO COMMIT: yes`, no blockers | **UI-only by design**: it consumes `GET /api/v1/projects/:id` (E-06), which already existed, was approved and had burned authority, and which **no screen had ever used** — so no server code, no migration and nothing approved reopened. A dialog rather than a `/proyectos/[id]` page, because the app has **no detail-page pattern** (its only dynamic UI route is `src/app/print/clientes/[id]`) and does have the dialog-ficha pattern in `/clientes`. Two traps avoided rather than rediscovered: dates go through the UTC calendar formatter, never `formatFecha` (which shifts `@db.Date` by a day under `America/Bogota`), and decimals arrive as strings so the money path is the list's own `toCents`/`formatCOP`. `diferencia_valor_oportunidad` renders **only when non-null**, because S2.4 does not write it yet. **The writer corrected the parent's brief**: the payload already carries a server-derived `duracion_semanas`, so the ficha displays it instead of recomputing it. **Native review**: lineage **`review-5927aa4e070d5343`**, slice `base-ref 22519b8…`, 8 paths / 645 lines, tier **medium**, one lens, budget 200; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**; only **two advisories, both SUGGESTION and both in test files** (recorded in the backlog above). **Also found by the verifier: a pre-existing import cycle** (`hooks/crm ↔ hooks/kanban`) that this unit did not introduce. |
| 2026-10-06 | **Project audit history**: the reader over `auditoria_cambios`, `GET /api/v1/projects/:id/audit`, and the Historial section in the ficha | `01a69e5` (13 paths / 1085 lines: reader + route + OpenAPI + hook + Historial section + the rehearsal-spec step, with their tests) | Delegated writer (one round, which **stopped at its scope boundary** instead of hacking around it) + an independent read-only verifier. The writer hit a full-suite regression caused by a `vi.mock("@/hooks/projects")` factory in `project-list.test.tsx` that the new hook export was missing from — outside its allowed surfaces, so it stopped and asked; the parent added that single mock line and the verifier judged the fix legitimate. Checks: focused 5 files / 39 tests green; full suite **158 files / 1513 tests** (baseline 156 / 1496, additive: +2 files / +17 tests); `tsc` 0; eslint 0; and the **extended rehearsal spec passed twice from the same clean reset state** (41.6 s and 35.3 s) with the database left reset (`proyectos = 0`, both `GANADA` opportunities back in `PROSPECCION`). Verdict: `READY TO COMMIT: yes`, no blockers, six advisories | The module's whole claim is that the conversion happens in **one audited step**, and nothing on screen proved it: `auditoria_cambios` was written and never read. The data shape is what makes this small — the conversion writes both rows through **one `logChanges` call**, so the `CONVERTIR` row of the opportunity and the `CREAR` row of the project share one `lote_id`, and **both carry `proyecto_id`**; the history is a `where: { proyecto_id }` query, not a cross-entity join, and that is also what lets the UI present the two entries as one step. Three decisions with reasons: the order is `created_at desc, id desc` because Postgres `now()` is the **transaction** timestamp and both rows of one lote carry the **identical** `created_at` (the verifier confirmed this in the live ledger with SQL — the tiebreaker is mandatory, not theoretical); the read is **capped at 100 rows** because the ledger is append-only and unbounded, stated in the OpenAPI description; and `usuario_id` has **no FK by design**, so the actor is resolved in a second query and a vanished user degrades to "Usuario no disponible" instead of a fabricated name or a crash. The route settles existence before visibility, exactly like the approved detail route: 404 for missing or soft-deleted, then 403 for a project the actor may not read (REQ-ACC-02). **Native review**: lineage **`review-c28c7903f7458059`**, slice `base-ref b2a2fcd…`, 13 paths / 1085 lines, tier **medium**, one lens, budget 200; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**; two advisories, both `informational` (recorded in the backlog above), and the WARNING about the missing truncation signal is the one the verifier also raised on its own. |
| 2026-10-07 | **Date-input calendar days formatted in UTC** — the one-day UTC-5 shift on the two date-input columns | `20a2923` (7 paths, +204/−8, parent `dcd0ba3`; local only, 20 commits ahead of `origin/feat/projects-v2`) | Delegated writer + an independent read-only verifier for the initial slice, then a bounded correction and a replacement review. Verifier's verdict on the corrected candidate: `READY TO COMMIT: yes`. Checks: focused green; **full suite 160 files / 1519 tests green** under `TZ=America/Bogota npx vitest run` (baseline 158 / 1513 before this unit); `tsc` 0 errors; eslint 0; the verifier reproduced the RED itself under `TZ=America/Bogota` (`31 de jul` rendered where the picker said `01 de ago`). **Native review chain (two lineages, the interesting part):** (1) slice lineage `review-26a25fad9dfb40ab` (base-ref `dcd0ba3`, 13 paths, 243 lines, tier medium, one lens `review-reliability`, correction budget 122) returned one CRITICAL, deterministic, candidate-caused finding **`R3-001`**: the task due dates had been moved to the UTC formatter while `prisma/seed.ts` writes real instants for them. (2) A bounded correction of 69 diff lines (37 additions + 32 deletions) reverted every task/compromiso due date to the viewer-zone formatter; the six files whose only change was that returned to their `dcd0ba3` content, so the corrected candidate is **7 paths**. (3) The correction changed the candidate scope, so the provider replaced the correction-plan slot with a recovery (`disposition: scope_changed`, designated successor lineage `review-bf0bd3a1b00039c3`); the recovery could not complete, and **nothing mutated in any attempt** — the Pi facade does not forward the `--base-ref`/`--committed-only` that native `gentle-ai review recover` needs for a slice-based lineage, and the direct native command aborts with `managed reviewer assets are outdated; run gentle-ai sync` while `gentle-ai sync` itself fails with `Pi CodeGraph MCP capability probe failed: …/pi-mcp-adapter/index.ts: no such file or directory`. (4) Fallback, user-authorized: a fresh ordinary START for the corrected candidate; the provider assigned it exactly the successor lineage **`review-bf0bd3a1b00039c3`** (7 paths, 212 lines, correction budget 106). (5) Result: **`approved`** → `acknowledge-approved` → **`authority: burned`** (`gentle-ai.review-acknowledged/v1`); two advisories, both `informational` and non-blocking — `R3-001` **WARNING** at `src/components/crm/print-ficha.tsx:177` and `R3-002` **SUGGESTION** at `src/hooks/crm-format.test.ts:20-29` | `formatFechaDia` (new, in `src/hooks/crm.ts`) formats a UTC-midnight calendar day in UTC and is applied to the two date-input columns only: `fecha_primer_contacto` (`print-ficha.tsx`) and `fecha_ultima_gestion` (`client-sheet.tsx`, `print-ficha.tsx`). `prisma/seed.ts` gained `calendarDayFromNow`, used at three call sites so both columns are written as UTC midnight. **The domain rule that shaped the correction:** `Tarea.fecha_entrega` deliberately keeps the viewer-zone `formatFecha` because the seed writes real instants for it and both `esVencida` (`src/hooks/crm.ts`) and the tasks report compare that column with `now` — only the two date-input columns are normalized. New tests: `src/hooks/crm-format.test.ts` and `src/components/crm/print-ficha.test.tsx`, plus a case in `client-sheet.test.tsx`. |
| 2026-10-07 | **S2.6 U1 — project membership table + membership-aware read scope** (T1 + T2 of the slice's first unit) | `6d9652b` (T1, 3 paths, +266) + `7faf6f7` (T2, 8 paths, +520/−46); slice `b026e30..7faf6f7` = 11 paths, +786/−46; local only | Three independent read-only verifications across the two revisions, each `READY TO COMMIT: yes`; **full suite 162 files / 1533 tests green** under `TZ=America/Bogota npx vitest run` (baseline 160/1519, additive in both steps); `tsc` 0; eslint 0; the T2 verifier re-derived **17 live-DB attack scenarios** by driving the real route handlers (member reads list/detail/audit; non-member 403 and empty list; a member of project A cannot read B even when B names them `responsable_id`; `removed_at` revokes all three while the row survives; a COLABORADOR with a stray membership row sees nothing; ADMINISTRADOR and GERENCIA unchanged; 404-before-403 on both routes), confirmed the emitted SQL carries the conjunctive `EXISTS` clause, and measured the cost: **0 extra statements on the list, +1 on each per-project read**; the migration's `sha256` matches `_prisma_migrations.checksum` with one non-rolled-back row | T1 is `ProyectoMiembro` → `proyecto_miembros` in `prisma/schema.prisma`, the hand-written idempotent migration `20261007130000_v2_proyecto_miembros/migration.sql`, and the live-DB invariant test `prisma/proyecto-miembros.invariant.test.ts`; T2 touches `src/lib/api/projects.ts`, the three project routes (list, detail, audit) and their tests, plus the new live-DB `prisma/proyecto-miembros-scope.invariant.test.ts`. **Shape worth recording:** `es_miembro` comes from `proyecto_miembros` (an active row is `removed_at IS NULL`); a COORDINADOR gets `miembros: { some: { usuario_id, removed_at: null } }` **inside the `where`** of the list query (every other non-portfolio role keeps the `id: { in: [] }` short circuit), so the scope cannot be widened by request input; the ficha and its Historial share `loadProjectScoped`, which folds the membership probe into the existence read and preserves 404-before-403; `es_miembro` is a **required** parameter of `projectReadActor`/`canReadProject` so the compiler forces every caller to resolve it; the guard Prisma cannot express is the partial unique index `proyecto_miembros_activo_uq` over `(proyecto_id, usuario_id) WHERE removed_at IS NULL`. **Native review**: lineage **`review-ab42ace5342e9dd6`**, slice `base-ref b026e30` (`committed-only`), 11 paths / 832 lines, tier **medium**, one lens (`review-reliability`), correction budget 200; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**. One advisory, `R3-001` **WARNING** at `prisma/migrations/20261007130000_v2_proyecto_miembros/migration.sql:30-41`, recorded in the backlog above. Next: **T3**, the E-07 members routes (closed in the row below). |
| 2026-10-07 | **S2.6 T3 — the E-07 project members routes** (read the team, add a member and soft-remove one; a removed member can be re-added) | `643375a` `feat(projects): add the project team membership routes (S2.6 T3)` (12 paths, +1297/−11; local only, 25 commits ahead of `origin/feat/projects-v2`) | Delegated writer + an independent read-only verifier. Own checks: **full suite 165 files / 1560 tests green** under `TZ=America/Bogota npx vitest run` (baseline after U1 162/1533, exactly additive: +3 files / +27 tests); `tsc` 0 errors; eslint 0. The verifier re-derived **18 attack scenarios** by driving the real route handlers against the **live database**: the authorization could not be widened (a member COORDINADOR still gets 403 on POST and DELETE; a malformed body is rejected behind the gate; actor and membership never come from the body), mass assignment was ignored, every invalid `usuario_id` shape answered **400 rather than 500**, the member's read access flipped to **403 on the list, the ficha and the Historial** the moment `removed_at` was set, and the 409 was matched against the **real driver error** whose `meta` names the index. New surface: `src/app/api/v1/projects/[id]/members/route.ts` (GET list, POST add) and `src/app/api/v1/projects/[id]/members/[userId]/route.ts` (DELETE as a soft removal) with their tests, the shared projection in `src/lib/api/projects.ts`, the OpenAPI registration in `src/lib/openapi/paths/projects.ts` with `src/lib/openapi/document.test.ts`, and the live-DB invariant `prisma/proyecto-miembros-routes.invariant.test.ts`; a second round also touched `src/lib/api/audit-cambios.ts` (+ its test), `src/components/proyectos/project-display.ts` and `project-ficha-dialog.test.tsx` | Implemented literally from the SDD's E-07 table (`odd/tasks/v2-projects-sdd.md:1512`) and REQ-ACC-07 (`:381-388`): body `{usuario_id}` → 201 `{miembro}`; **managers only for the writes with 404 before 403**; the read scope for the list; the target must be a COORDINADOR, else 400 with the SDD's exact copy; the **409 mapped from `P2002` on the partial index `proyecto_miembros_activo_uq`** so it cannot lose a race; DELETE sets `removed_at` and `removido_por_id` and the row survives; a removed member can be re-added (a new row, exactly one active); and both writes carry their audit rows **in the same transaction** as the write. **Two decisions taken from evidence rather than taste:** (1) the target must also be **`activo`**, because every other grant path in this repository requires it — `src/app/api/v1/catalogs/users/route.ts:22`, `checkResponsableActivo` (`src/lib/api/projects.ts:412-414`) and the clients/tasks routes; (2) the audit vocabulary was unified to **`proyecto_miembro`** end to end (the routes, `AUDIT_ENTIDADES_V2`, the reader and the ficha's `ENTIDAD_AUDITORIA_META`), replacing an `equipo` value that nothing ever wrote and that left the Historial rendering the raw entity name — the proof is a component test that asserts the **label the ficha shows** ("Integrante del equipo"), not the row. **Native review**: lineage **`review-92166de3c97f832e`**, slice `base-ref 3d52717` (`committed-only`), 12 paths / 1308 lines, tier **medium**, one lens (`review-reliability`), correction budget 200; forecast 1 model run (`pi_host_relay`); **`approved`**, `acknowledge-approved` → **authority burned**. Four advisories, all `informational` and none blocking, recorded in the backlog above. |

### Session 3 detail (2026-10-01)

- `CLAUDE.md` (the two-`.env` rule) closed as its own work unit: `bd7cc00 docs(claude): document the local-vs-remote env rule`.
- **S0.6 implemented by a delegated writer under strict TDD, then independently verified** (read-only verifier, no commits).
- New surface: `scripts/migrate-v2/{_guard.ts,_guard.test.ts,__fixtures__/guard-probe.ts,_harness.ts,_harness.test.ts,s1-rubros-report.ts,storage-orphans.ts}` plus one `.gitignore` rule (`scripts/migrate-v2/out/`).
- **What the kit enforces:** any v2 data script that imports `_guard` first aborts on a non-loopback `DATABASE_URL`, `DIRECT_URL` **or** `NEXT_PUBLIC_SUPABASE_URL`, before `@/lib/db` is constructed and with no bypass flag or env var; `--dry-run` (the default) reads and reports without opening a transaction; `--apply` demands `--expect-hash <sha>` from a reviewed dry-run, recomputes and compares inside **one** 120 s transaction *before* writing, and records one `IMPORTAR` lote; `--revert <lote_id>` is scoped to that lote.
- **Deviations from the SDD, all now recorded in the SDD:** the guard wraps `prisma/require-local-db.ts` (the SDD named `prisma/load-local-env.ts`, which does not exist); `PlanCount` is a five-column row list instead of `Record<string, number>`; `__fixtures__/guard-probe.ts` was added to prove import order.
- **Residuals (not blocking):** no script implements `revert()` yet, so lote scoping is only exercised at harness level; the harness does not sanitize `name` (not CLI-reachable — `name` is a constant in the shipped scripts).
- **D-09 resolved by the user:** only **GERENCIA + ADMINISTRADOR** may create/manage projects. RF v2.0 §3's "Gestor" is not adopted. **S0.7 is therefore unblocked** and must keep COORDINADOR out of project management.

### Next task: S0.7 — project permission predicates (USER-RESOLVED, no longer gated)

#### S0.7 — DONE 2026-10-01

- **Scope recalibrated before writing.** The SDD's file list for S0.7 named `src/lib/api/projects.ts`,
  `src/app/api/v1/projects/**`, `src/components/proyectos/**` and `src/lib/openapi/paths/projects.ts`; **none of
  them exist on this branch** (they were v1). Delivered: the pure predicates in `src/lib/permissions.ts` plus
  their tests. The three route-level 403 tests and the UI CTA test are **deferred to S2.x**, where the v2 routes
  and components will exist.
- **Delivered:** `PROJECT_MANAGER_ROLES = ["ADMINISTRADOR", "GERENCIA"]`, `ProjectActor`,
  `ProjectMembershipActor`, and `canManageProjects`, `canCreateProject`, `canManageProject`, `canExecuteProject`,
  `canViewProjectV2`, `canViewFinancialSupports`, `canValidateExpense`, `canApproveBaseline`,
  `canApproveModification`, `canViewPortfolio`.
- **Behaviour changes vs v1 (deliberate):** a COORDINADOR can no longer create a project, and ownership alone no
  longer grants management (a COLABORADOR responsable is denied). The shared `canManageAny` and every pre-existing
  export are byte-identical — `git diff -U0` is a single pure append hunk with 0 deletions.
- **Verified:** RED first (`TypeError: <predicate> is not a function`) → **63 tests** green across
  `permissions.test.ts` + `permissions.read.test.ts`; `tsc` 0 errors; eslint clean. An independent verifier checked
  all 13 predicates against the contract and confirmed zero `canManageAny` calls and no write predicate reading
  the gerencial flag; it blocked the commit on two untested positive branches, which were then closed.
- **How to reuse this in S2.x:** `canViewPortfolio` deliberately uses `PROJECT_MANAGER_ROLES || flag`, not
  `canManageAny`, so a COORDINADOR gets no global portfolio view — keep the P01–P18 mapping in SDD §4.7 as the
  source of truth when wiring the routes.

### Session 4 detail (2026-10-01)

- **S0.9b closed.** Document *creation* now goes through the signed path too: the sign endpoint's new `documento_nuevo`
  kind pre-generates the document id and signs the FINAL key, and the JSON confirm branch of `POST /documents` derives
  that id (and the owning cliente) from the signed `storage_path` instead of trusting the client. The kanban attachment
  client moved to sign → PUT → confirm as well. ADR-13 is therefore complete for every upload surface on this branch.
- **What the independent verifier caught that the orchestrator did not.** B1's blast radius was **three** triggers, not
  one: besides the duplicate title, the restricted-category 403 and the invalid-category 400 were also reachable from
  the shipped dialog (it renders every category, and falls back to the static list while the live catalog loads). All
  three leaked a permanent object per attempt. Reading the diff myself surfaced only the duplicate-title one.
- **Native review — the first slice review driven from Pi end to end since S0.9a**, and the first to close on a
  multi-commit range: raw-CLI `review.start` with `--consent=relay` → relayed the exact
  `gentle-ai.review-integration.consent/v3` envelope verbatim → ran the provider's own `granted` invocation → facade
  `status` to obtain the canonical `collectBindings` → `gentle_review_capture_group` (forecast, then
  `reviewerRunAcknowledged: true`) → `acknowledge-approved` (authority burned).
- **Tooling fact worth keeping:** the `collectBindings` obtained from the **raw CLI** are rejected by the facade
  capture group (`collectBindings are unknown, expired, or belong to different session routes`). The facade's **own**
  `status` must supply them; the CLI-rendered and facade-rendered bindings differ (key casing and argument order), and
  only the facade's are accepted by the facade route.
- **New open items recorded:** (1) consolidate the multipart branch onto `guardDocumentCreate` so the QA-audit-#4 logic
  has one home; (2) **R3-1** — the confirm branch's create sequence is not transactional; (3) **R3-2** — the versions
  confirm route has no local try/catch around `storedObjectSize` (harmless: that route is wrapped by
  `withApiErrorHandling`, unlike the documents one, which is exactly why C2 was real); (4) the guard's tests do not
  assert `mode: "insensitive"` / `deleted_at: null`; (5) still pending from the user: raise the `muttu-docs` bucket to
  25 MB, decide **R3-001** (magic bytes), confirm or reverse **D-05**, answer **D-07**; (6) the human-run orphan
  sweeper decision.
- **Nothing was pushed.** `origin/feat/projects-v2` is now several commits behind local; the remote step still needs
  explicit per-batch approval.

### Session 7 (2026-10-02) — the S1.1a review re-creation, blocked by the filesystem

- **The handoff's next step was taken as written**: a **new** lineage was attempted for the S1.1a slice rather than
  retrying the stranded `review-5a50cbc2ef8376c2`.
- **Two consecutive stops, neither of them about the candidate.** (1) `inspect` answered `managed_assets_outdated` with
  its own prescribed continuation; running that exact `gentle-ai sync --agent pi` installed the **v4.0.0** managed assets
  (9 files) and cleared the stop. (2) `inspect` then offered only the **branch-wide** candidate, so START was issued for
  the slice with an explicit committed range — and died with `candidate-owner-parent-chmod-ineffective`: v4.0.0 attests
  POSIX privacy on `<git-common-dir>/gentle-ai/candidate-views`, and `/mnt/c` is 9p `drvfs` **without `metadata`**, where
  `chmod` is a no-op. Measured, not assumed: `stat` reads `777` on `.git/gentle-ai` and on `candidate-views`, and a
  `chmod 700` probe also read back `777`. **`lineage_created: false` and `mutation_outcome: none` on both attempts** — no
  lineage, no candidate view, the repository untouched.
- **Lesson from the first attempt**: an explicit-`baseRef` START still needs `"mode":"ordinary"` in its input. Without
  it the facade falls through to the graph-v1 branch and fails with `Judgment Day graph-v1 START requires lineageId`,
  an error that says nothing about the real mistake.
- **Consequence until the environment is fixed**: **every** native review in this clone is blocked, not just S1.1a's, so
  this is a prerequisite for the per-slice review discipline rather than a nicety.
- **User decision (2026-10-02)**: enable the WSL `metadata` option on the C: automount in `/etc/wsl.conf`, then
  `wsl --shutdown` and reopen the distro. Offered only after measuring the exec-bit risk: `core.filemode=false` here and
  all 472 tracked files `100644`, so no mode churn is possible.
- **Nothing was pushed and no review authority exists.** Next step after the restart: `inspect`, then START
  `d55144e89ddc37dd671e0195382e9b0281563da5..HEAD` with a fresh idempotency key.

### Session 8 (2026-10-02) — the three `/mnt/c` blockers cleared and the S1.1a review closed

- **What the restart inherited.** Session 7 had stopped at `candidate-owner-parent-chmod-ineffective`. Enabling
  `metadata` cleared that attestation but exposed **two further, independent blockers** — which is the useful part of
  this session: the three are **cumulative requirements, not alternatives**, and each one only became visible once the
  previous was satisfied.
- **Blocker 1 — POSIX `chmod` (resolved by the user).** `[automount] options = "metadata,umask=22,fmask=11"` in
  `/etc/wsl.conf` plus `wsl --shutdown`. Verified afterwards in `/proc/mounts`, not assumed.
- **Blocker 2 — the owner-parent privacy mode.** `metadata` does **not** cover this one: the attestation at
  `review-candidate-view-owner.ts:306` requires `<git-common-dir>/gentle-ai/candidate-views` at mode `700` with no group
  or other bits. It was sitting at `755`; `chmod 700` on that single directory cleared the stop. This is a
  per-directory, non-environment fix that will have to be checked again if `.git/gentle-ai` is ever recreated.
- **Blocker 3 — the materialization timeout.** `lib/review-candidate-view.ts:15` fixes a 10 s deadline per
  `git checkout-index` invocation, and `checkoutMaterializedEntries()` materializes the **whole frozen tree**, not the
  slice: **472 files**, measured at **18.28 s cold and 19.17 s warm** on this drvfs mount, with `user 0.12 s / sys 0.77 s`
  — that is pure 9p I/O, not CPU. The 16 384-byte path-batching splits it into **2 invocations of ~9.3 s**, right against
  the 10 s edge, which is why the failure looked intermittent. Fixed with
  `export GENTLE_PI_CANDIDATE_GIT_TIMEOUT_MS=60000` in `~/.bashrc` **and a Pi restart**, because the value is read from
  Pi's own `process.env`; an invalid value or one above 120 000 falls back to 10 s **silently**. Counter-intuitive but
  important: enabling `metadata` resolved the `chmod` attestation and *made this phase slower*, so the third fix is a
  direct consequence of the first.
- **The review, end to end.** `inspect` → `ready`; START for the slice with
  `{"mode":"ordinary","baseRef":"d55144e89ddc37dd671e0195382e9b0281563da5","committedOnly":true}` and a fresh
  idempotency key → the host presented the consent dialog, the user chose **option 3** ("Review and allow this session")
  → lineage `review-eea4c3aa7621c16c`, tier `medium`, **one lens** (`review-reliability`), 19 files / 1548 lines,
  budget 200 → `status` offered one collect slot → the capture returned its forecast (1 model run, `pi_host_relay`, no
  mutation) and, re-submitted with `reviewerRunAcknowledged: true`, returned the terminal closure
  `native-last-event-closure` with **`state: approved`** → `status` returned the exact
  `approved_acknowledgement_required` continuation → `acknowledge-approved` completed with
  **`authority: burned`**. Two advisory findings, both explicit that they open no correction and are not a reason to
  re-run the review on this candidate: **R3-1** (WARNING) at `prisma/migrations/20261001185211_v2_rubros_codigo/migration.sql:34`
  and **R3-2** (SUGGESTION) at `scripts/migrate-v2/s1-rubros.ts:175-187`.
- **`inspect` re-offers the branch-wide candidate by default, and it must be ignored.** The same lesson as sessions 6
  and 7: the ready candidate on offer was the whole branch against `main` (63 paths), while the review that ran was the
  slice via an explicit `baseRef`. The provider accepted the slice range and resolved its own base (`6055d125…`).
- **The repository was never touched by the review.** Afterwards: branch `feat/projects-v2` clean at `a9f89a8`,
  `candidate-views` empty, 7 commits ahead of `origin/feat/projects-v2`. No push, no PR.
- **What this does not mean.** Delivery is still a human decision under ordinary repository policy, and the two
  advisory findings are later work rather than a defect in the closure.
- **Two operating lessons worth keeping.** (1) The consent dialog **expires after 10 minutes** and returns
  `consent-binding-stale` without creating a lineage or mutating anything — so warn the human *before* issuing START
  (session 7 lost two windows to this). (2) The dialog's session permission is destroyed by a Pi restart ("quit, process
  exit remove all session grants") but preserved by an extension *reload*, so **option 3 must be answered again in each
  new session**; in exchange it covers the later candidates of that same session and repository, which is why the
  docs-only candidate that follows this row should not need to ask again.

### Session 6 detail (2026-10-01)

- **User decisions that closed the open board**: D-05 confirmed narrow (the dropped attachment types stay dropped by
  explicit decision), R3-001 accepted as a documented residual (extension + MIME only, no content sniffing), **no orphan
  sweeper ever** (the read-only report is the only tool, so the never-delete policy keeps no exception), and the v1
  openspec change `proyecto-financiero-tab` marked superseded while staying out of git.
- **The recon earned its keep.** S1.1a turned out to be **greenfield**: no `Rubro` model, no table, no migration, no
  routes, and the SDD's "VERIFIED" citations for rubros pointed at v1 code that is not in this branch. Two REQ-CAT-02
  scenarios (the 409 on renaming a rubro a project uses, and the "Rubro suspendido pendiente de reasignación" display)
  are **impossible to test today** because the table that holds the association does not exist; they were deferred to
  S5.x rather than faked.
- **The production collision nobody had noticed.** Production still carries the abandoned v1 `rubros` table (D-10 chose
  to leave it), so a plain `CREATE TABLE rubros` would have aborted `migrate deploy`. The user chose an **adoptive,
  idempotent migration**, and the trap is now a rule in §6.5 for any future v2 migration that shares a name with one of
  the 8 abandoned tables.
- **A real defect, fixed at the root.** `scripts/migrate-v2/_harness.ts` wrote its lote through
  `tx.auditoria_cambios`, a delegate the generated client **never** exposes (it is `auditoriaCambio`) — so **no real
  `--apply` could ever have worked**, for any script. The harness's own test hid it, because its fake encoded the same
  wrong name: the mock agreed with the bug. Fixed the harness, corrected the fake so the defect fails red again, and
  **deleted the adapter** that `s1-rubros.ts` had used as a bridge instead of shipping it. This is the **second** time in
  this project that the `--apply` path was silently dead (the first was the truncated plan hash, R3-001 of the S0.6
  review) and both times an independent reviewer, not a test, found it.
- **Adoption coverage.** A new test reconstructs the legacy table with production's shape (v1 columns, the unique index
  on `nombre`, `deleted_at`, no `codigo`) in a throwaway schema, runs the **real migration SQL text read from the file**
  at runtime, and asserts adoption, idempotency and isolation. Everything runs inside one always-rolling-back
  transaction; the verifier confirmed no leftover schema and that `public.rubros` is untouched.
- **Left unclosed by infrastructure, not by choice.** Three assertions the verifier called weak (the harness fake's
  write count, `indisunique` on the code index, and a `public` guard covering functions/triggers rather than rows only)
  were **not** strengthened: the writer runtime failed three times in a row — a stall after a `bash` call, a model that
  never started (`no first run event received`), and finally `capacity quarantined`. They are recorded in the S1.1a
  block and are non-blocking. The first of the three is the most valuable, because it targets the same weakness class
  that let the harness defect live.
- **Nothing was pushed.** The commit waits for explicit push authorization, as always.

**Session-6 close (handoff).** The five session commits are `627e54a` (the three decisions), `d55144e` (the S1.1a
recalibration), `cf8b837` (the harness fix), `9cf8466` (S1.1a, 17 files) and `748817b` (the branch-wide review
disposition), leaving local **5 commits ahead** of `origin/feat/projects-v2` (`dbc2f52`). The user configured this
clone during the session (`remote.origin.fetch` for all heads, a fetch, and the branch upstream), so for the first time
`git status -sb` reports the branch against its remote; note that a push still leaves no local ref to compare against
unless the fetch refspec stays as configured.

**Review ledger for the session.** Four candidates burned: `review-c327208600982a26` (the decisions document),
`review-42eb76c1e76ae2d6` (the S1.1a recalibration), and — with the whole S1.1a unit — `review-ba69dfb46439abc1`-style
full treatment culminating in `review-5a50cbc2ef8376c2`, which was **created and consented but never completed**: it
failed in the pre-native phase with `operation_timeout` (`retry_safe: false`, `next_action: stop`) after seven lineages
in one session, so **no lens ran, no collect slot was obtained, and the lineage stays at `reviewing` approving
nothing**. The branch-wide candidate (`sha256:3320df1d…`, re-offered as `sha256:b7e5a9df…` after the disposition commit —
same `paths_digest`, same 63 paths against `main`) was **left unreviewed by explicit user decision**, because a
branch-wide candidate has exceeded the lens context budget every time it was measured and because the review budget was
already spent. **Tomorrow: re-create the S1.1a review with a NEW lineage in a fresh session** — never retry the stranded
one — and remember that roughly seven review lineages exhaust a session's aggregate budget.

### Session 5 detail (2026-10-01)

- **Why this unit and not S1.1a.** After S0.9b closed, the plan's next task was the first catalogs slice, but the user
  chose the slice's hygiene unit first: three recorded residuals were cheap and would otherwise become drift.
- **What landed** (`8d10180`, 3 files): the multipart branch of `POST /api/v1/documents` stopped carrying its own copy
  of the QA-audit-#4 logic — categoria validity, the restricted-category 403 and the duplicate-title 409 now all come
  from the shared `guardDocumentCreate`, called before the inserts; **R3-1** was fixed by making the confirm branch's
  documento/version/cliente inserts one `db.$transaction` with `logAudit` and the best-effort extraction outside it; and
  the guard's tests now pin `mode: "insensitive"` / `deleted_at: null`, which could previously be dropped unnoticed.
- **The independent verifier's most useful contribution** was not a finding but an inventory: it established that the
  response contract is byte-identical and enumerated the *ordering* deltas the consolidation introduced (the live
  catalog now loads after the form checks, so a malformed form gets its own 400 instead of the catalog's 500; and the
  etiquetas check now precedes the categoria check). Both are accepted and recorded; neither combination is tested.
- **Native review**: lineage `review-d4d492b8adb83210`, 3 files / 247 lines, tier medium, one reliability lens,
  **approved** and **authority burned**, with one advisory WARNING at `route.ts:526`. The first capture attempt died
  with `native-status-failed — the negotiated review operation exceeded its aggregate time budget`, and the
  **identical** retry worked: read that message as transient, not fatal.
- **D-07 decided** (user): the v1 openspec change `proyecto-financiero-tab` is to be marked superseded and kept **out of
  git**, leaving its `.git/info/exclude` entry alone. Recorded with the two facts that matter — that exclusion is
  per-clone and untracked, so no collaborator sees it; and the SDD's S0.1 file list is stale (only 1 of its 6 named
  changes still exists).
- **New residuals** are item 8 of the S0.9b block: the two ordering deltas, the now-dead `requiereCategoria` flag plus
  the stale OpenAPI comment that names it (one follow-up), and the fact that H2's atomicity is proven structurally
  rather than against Postgres.
- **Nothing was pushed.** Local is still ahead of `origin/feat/projects-v2`; the remote step needs explicit approval.

### Session 3 also left one open item: the S0.6 review lineage

The native review of S0.6 (`review-5f975df81d7b1418`) is **intentionally left open at
`authority.state = correction_required`**. Its one CRITICAL finding was fixed and committed (`959ca33`) and the
12-line correction plan was accepted, but the final `collect/targeted_validation_required` slot cannot be driven
from the Pi facade (it cannot carry a `base-ref`; with a clean tree it answers
`empty_candidate_base_ref_required`), and the validator verdict must be admitted natively rather than authored by
Pi. No approval and no closure were recorded, so **the review endorses nothing**; delivery remains an ordinary
human decision and the work is local-only. Details and workarounds are in memory
(`muttuhub-crm/native-review/environment-blockers`, `gentle-ai/pi-facade/review-routing-defects`).

## State at session close (2026-09-30)

**`main` is green and the remote front is clean.**

| | |
|---|---|
| `origin/main` | `6bee83f` — CI green: `unit` success, `e2e` success |
| Open PRs | **0** |
| Merged this session | `6a28935` #71 (DB-safety fix), `2512f01` #64, `bae437c` #65, `5da944c` #66, `aee0a41` #67, `6bee83f` #68 |
| Closed as superseded | 19: the 15-PR v1 projects chain (#48–54, #56–63), #69 and #70 (umbrales), #40 (already in `main` as `29a8f26` + `33720b2`), #55 (guard superseded by #71) |
| Local `main` | fast-forwarded to `6bee83f` |

**On `feat/projects-v2` (local, unpushed):** the re-scoped and recalibrated SDD (66 tasks), this execution plan,
`S0.5` (weeks + money, 36 tests) and `S0.4` (append-only audit, 16 tests).

**Nothing of v2 is pushed.** That is deliberate: v2 stays local until the remote step is explicitly authorized.

## State at session close — session 2 (2026-09-30, rebase + baseline)

Session 2 executed the branch surgery the previous handoff asked for and stopped there. **No source code was
written and no remote action was taken.**

| | |
|---|---|
| Rebase | `git rebase main` completed: **0 behind / 10 ahead** of `main` (`6bee83f`). `96c4c5c` was skipped as *previously applied* — same patch-id as `6a28935`. Expected and correct. |
| New branch tip | `5f4e4a8` (`docs(odd): close the v2 execution handoff with the final state and resume steps`) |
| Rewritten hashes | The rebase rewrote **every** v2 commit. Mapping below. Pre-rebase state preserved at `backup/pre-rebase-feat-projects-v2-20260930` (`97e08be`). |
| Baseline after rebase | `npx tsc --noEmit` → **0 errors**; `npx vitest run --pool=threads` → **120 files / 1094 tests green** in 48.8 s. The handoff predicted 1093; the extra test is real, not a regression. |
| Local stack | Docker Supabase **up**; `.env.local` → `127.0.0.1:54322` for both `DATABASE_URL` and `DIRECT_URL`. |
| Uncommitted | `CLAUDE.md` has 14 uncommitted lines documenting the two-`.env` rule (`.env` = shared remote, `.env.local` = local Docker). Written before session 2; **preserved verbatim, not committed** (it was stashed for the rebase and restored). |
| S0.6 | **Not started.** Nothing exists yet in `scripts/migrate-v2/`. |

**Hash mapping (pre-rebase → post-rebase).** Commit *messages* are unchanged, so a rebased commit can always be
found by its subject if this table goes stale:

| pre-rebase | post-rebase | subject |
|---|---|---|
| `54a356e` | `aad091b` | bring v2 projects plan and SDD to the main-based v2 branch |
| `57fdc4f` | `37b6493` | add v2 projects execution plan and pivot decisions |
| `f396473` | `4963ab2` | re-scope v2 projects plan and SDD for a direct implementation on main |
| `d93824e` | `ef9f9ee` | recalibrate v2 plan and SDD against main |
| `9983ad4` | `388c765` | record the feat/projects-v2 baseline and its environment blockers |
| `1432a72` | `9cc9c03` | record the critical Prisma CLI path that targets production |
| `96c4c5c` | *(dropped)* | DB-safety fix — already in `main` as `6a28935` |
| `93eac47` | `7e5b25c` | sync the v2 plan with the DB-safety fix |
| `3c3d0ff` | `88d4b67` | S0.5 weeks + money |
| `47ce839` | `689ef32` | S0.4 append-only audit |
| `97e08be` | `5f4e4a8` | close the v2 execution handoff |

## Checkpoint state (session 3 close, 2026-10-01)

| | |
|---|---|
| **CP-1 — remote backup** | **DONE.** `feat/projects-v2` pushed to `origin` by the user at `0dc08eccd2c0ca253617478de82446c35681aa5c`; local and remote tips match. Additive push, no force. No PR opened. |
| **CP-2 — production state recorded** | **DONE.** Read-only audit of the shared remote (see SDD §6.9): 28 public tables, **all 8 abandoned v1 project tables present with 4 rows total**, `auditoria_cambios` absent, **12 applied migrations including the phantom `20260918153200_tablero_seguimiento_social` that exists in no branch** (recoverable from `6e4c6c8`). Recorded as §6.9 + R-16 + D-10; §6.5 now forbids `migrate dev` against production; the R-01 claim about `prisma.config.ts` was corrected here and in the SDD. |
| **CP-3 — `main` as the deployable baseline** | **DONE (already true).** `main` = `6bee83f`, CI green, DB-safety fix `6a28935` merged, no projects models, 0 open PRs. |
| **CP-4 — trustworthy test suite** | **DONE 2026-10-01.** Root cause isolated with a reproducible trigger: one full suite is green (122 files / **1122 tests**) but **two concurrent suites fail 6-7 tests each** — always `src/components/crm/{client-form,client-list,client-sheet}.test.tsx` plus `scripts/migrate-v2/_guard.test.ts` — with `Test timed out in 5000ms` and `pointer-events: none`, while those same specs pass in isolation. `vitest.config.ts` now pins `pool: "threads"` + `maxWorkers: 4`; three sequential non-contended runs green ×3, `tsc` 0 errors, eslint clean. Recorded in SDD §6.10. |
| **Production risk today** | **Low.** No code on `main` reads the abandoned tables; v2 is additive; no promotion has happened. The only real trap is a future `prisma migrate dev` against production — now explicitly forbidden. |
| **Remote hygiene (needs per-batch authorization)** | `origin` has **34 branches**: 6 from the v1 `gestion-proyectos-*` chain and 9 from `tablero-seguimiento-*` (the same abandoned module, renamed), plus ~15 merged `fix/*`/`feat/*`. The fork `agutierrezreginodev/MuttuHub-CRM` still holds 5. |

## Session 8 close (2026-10-02) — handoff and the plan for the next session

**State at close**

| | |
|---|---|
| Branch / tip | `feat/projects-v2` @ **`52210ef`**, working tree **clean** |
| Remote | `origin/feat/projects-v2` = **`9892f79`**, **in sync** with local. The 9-commit batch (`dbc2f52..9892f79`) was **pushed on 2026-10-02** on explicit user authorisation — fast-forward, additive, no force. This supersedes the "nothing pushed" line this handoff originally carried |
| Production | **Untouched.** v2 is additive and nothing of it is deployed |
| Test baseline | **131 files / 1226 tests green** (last full run at `9cf8466`, session 6). **Not re-run in session 8**: the only tracked files that changed were two `.md`. The next *code* unit must re-establish it |
| Review authority | Two lineages opened and **burned** today, both approved: `review-eea4c3aa7621c16c` (the S1.1a code slice) and `review-70a80526e9e73d84` (the docs commit). **Nothing is awaiting acknowledgement** |
| Review budget | 2 of the session's practical ~7 lineages used |

**The plan for the next session, in order.** Each step names its SDD task, size, gate and first action.

0. **Environment first, or no review can start** — see item 0 of *How to resume* below. Three cumulative checks:
   `mount | grep /mnt/c` shows `metadata`; `stat -c '%a' .git/gentle-ai/candidate-views` prints `700`;
   `echo $GENTLE_PI_CANDIDATE_GIT_TIMEOUT_MS` prints `60000`. Warn the human **before** issuing START: the consent
   dialog expires after 10 minutes, and a fresh Pi session needs **option 3** answered again.
1. **S0.1 — decision log + mark the superseded v1 openspec change (S, docs).** The last open S0 item, ~5 lines.
   Verified 2026-10-02: `openspec/changes/proyecto-financiero-tab/proposal.md` still has **no**
   `Status: SUPERSEDED` line, and of the six v1 changes S0.1 originally named, **only that one exists** in the tree.
   Two traps: the directory is excluded by `.git/info/exclude` (per-clone, untracked), so that edit will **not**
   appear in the commit — and D-07 decided to leave it out of git — so the commit carries only the SDD/plan
   corrections; and the acceptance criterion about "six files" must be rewritten to "the one that exists".
   Docs-only → the review closes in seconds with 0 lenses.
2. **S1.2 — Líneas estratégicas catalog table (M, decision-free).** The best next **code** unit: no gate at all, and
   it is the catalog `ProyectoLinea` (S2.1) depends on. Suspended-not-deleted rule, seeded from the 8 existing enum
   values.
3. **S1.3 — Municipios catalog + admin CRUD (M).** Gate **N-21**, whose recorded default is a **curated,
   admin-extendable** list — not the full DANE dump.
4. **S1.4 — Semáforo parameters v2 shape with audit (M).** Gate **DP-04**: ship the PO's 10 % tolerance plus
   `umbral1/umbral2` (10/20 pp) and the delay threshold (70 %) as admin-editable **placeholders flagged
   `confirmado:false`**, additively alongside `Setting["semaforo_umbrales"]`.
5. **S1.1b — suspended-rubro reassignment report (S, read-only): DEFER, and today's evidence says why.** Verified
   2026-10-02: `lineas_presupuestales` exists **nowhere** in the repository — there is no `LineaPresupuestal` model in
   `prisma/schema.prisma` (the only v2 additions are `AuditoriaCambio` and `Rubro`), and the string survives only as
   the report's own entity label (`scripts/migrate-v2/s1-rubros-report.ts:27`) and as gitignored
   `scripts/migrate-v2/out/` artifacts. The report can therefore only ever return zero rows until **S5.1** creates the
   budget table. Recording it as *deferred until S5.1* is honest; shipping a report against a non-existent table is a
   simulation. N-13's *values* reassignment stays manual and per project, as the user decided.
6. **Then S2 opens the visible module** — the first slice whose output a user of the Hub would recognise:
   **S2.1** (`Proyecto` gains `origen`, `valor_total`, computed duration, N..N strategic lines with a principal, N..N
   municipios, `BORRADOR` state; gates DP-05 and N-25, both resolved/keep), **S2.2** (autogenerated `PRY-AAAA-NNN`
   with a concurrency-safe per-year sequence; gate N-03), **S2.3** (create the project from a `GANADA` opportunity in
   one audited step; gates N-02 resolved and DP-07's 1:1 recommendation). Dependency order then holds:
   S0 → S1 → S2 → S3 → S4; S1 + S2 → S5 → S6; S3 + S5 → S7; S3 + S5 + S6 → S8; all → S9; S10 alongside.

**Nothing in this plan is waiting for the PO.** Of the open rows in SDD §7.3 only **N-23** (PDF engine) is marked
blocking, and it blocks **S9.3b** alone. Everything else carries a default or a provisional user decision and gets
built with `confirmado:false` markers where the value is genuinely unknown.

**Documentation drift corrected in this same commit.** `odd/tasks/v2-projects-and-clients-plan.md` still declared
*"PLAN ONLY (2026-09-29). Nothing implemented"* and still showed S0.6/S0.7 as unchecked although both closed on
2026-10-01 — a reader of that document alone would conclude the project had not started. Its header, its slice-plan
warning and its `Next step` now point at the authoritative sources (this document's log, and SDD §5/§6.7). Note the
plan remains the source of truth for **decisions and requirement traceability**; it is only **progress** that lives
here and in the SDD.

**Residuals carried forward, none blocking** (all recorded in the SDD's S1.1a block): the three unstrengthened test
assertions — the harness fake's **write count** is the valuable one, because it targets the weakness class that let
the `writeLote` defect live; the two **advisory** findings from the closed review, R3-1 (WARNING at
`prisma/migrations/20261001185211_v2_rubros_codigo/migration.sql:34`) and R3-2 (SUGGESTION at
`scripts/migrate-v2/s1-rubros.ts:175-187`); the unexecuted `seedRubros` re-seed path; and the fact that a suspended
rubro disappears from `GET` with nothing listing suspended ones — which the S1.2/S1.3 admin UI is the natural place
to cover.

**User-only actions still open**
1. ~~Authorise the push of the local commits~~ **DONE 2026-10-02.** `git push origin feat/projects-v2` moved
   `dbc2f52..9892f79` — 9 commits, fast-forward, no force — and `origin/feat/projects-v2` now equals the local tip.
   **No PR was opened** and no branch other than this one was touched. Note for the next push: a second remote named
   **`fork`** points at `agutierrezreginodev/MuttuHub-CRM`, which is the one that caused the wrong-account push twice;
   the correct target is **`origin`** (`MuttuHub/MuttuHub-CRM`).
2. Raise the `muttu-docs` bucket from 10 MB to **26214400** bytes (Supabase dashboard → Storage → `muttu-docs` →
   file size limit). A production infrastructure write, so it stays with the human. Until it is done, 25 MB uploads
   cannot be deployed: the app's limit would pass the sign check and Storage would cut the object — exactly the R-17
   orphan scenario.
3. Optionally forward the 12 PO questions (plan §"Preguntas para el PO"). Non-blocking: they confirm decisions the
   user already took provisionally.

## Sprint plan to Friday 2026-10-09 — the local live demo

**The decision (user, 2026-10-05).** The deliverable is a **live local demo** (no deployment, no production change):
**create a project from a `GANADA` opportunity and see it listed.** That is RF-01/RF-02 in the shape the PO recognises as
"the projects module". Today is Monday 2026-10-05; the demo is Friday 2026-10-09, so roughly four working days plus the
Friday buffer.

### Critical path, in order

| # | Unit | Real size | Notes |
|---|---|---|---|
| 1 | **S1.3** municipios catalog + API | M (~300) | Greenfield, recon done 2026-10-05. Catalog starts **empty**; only the demo seed populates it. Two project-dependent scenarios deferred. API-only. |
| 2 | **S2.1** `Proyecto` **from zero** + `ProyectoLinea` + `ProyectoMunicipio` + `EstadoProyecto.BORRADOR` + `origen`, `valor_total`, `duracion_semanas` | **L, not M** | The SDD says "expand `Proyecto`"; verified 2026-10-05 that **`Proyecto` does not exist** (0 matches among 22 models). It is a full new model plus two join tables, so it splits into two chained work units: schema + adoptive migration, then the API. |
| 3 | **S2.2** autogenerated code `PRY-AAAA-NNN` | S | Concurrency-safe per-year sequence. |
| 4 | **S2.3** creation flow from a `GANADA` opportunity, one audited step (N-02), with prefill of cliente/nombre/valor | M | `Oportunidad` verified fit: `estado` (`EstadoOportunidad.GANADA`), `valor_estimado_cop` `Decimal(15,2)`. **Done and committed as `3a42837`.** |
| 5 | **Minimal UI**: `src/app/(app)/proyectos` — list + creation dialog from an eligible opportunity | M | **Done and committed as `3e94c11` (list) + `885401f` (dialog), both independently verified and both natively reviewed (`approved`, authority burned).** Greenfield: no projects UI existed anywhere (`find src/app src/components -iname "*proyect*"` was empty). Built from the established patterns: `src/components/crm/client-list.tsx`, `client-form.tsx`, `entity-dialogs.tsx`, and the page shape of `src/app/(app)/clientes/page.tsx`. The creation dialog spends no lineage on a separate docs candidate — its ledger row is batched with unit 1's in one `docs(odd)` commit. |

| 6 | **Demo reset**: `npm run db:demo:reset:local` — a dry-run-first, loopback-only rehearsal reset | S | Not on the demo's happy path but it protects the demo: `PRY-2026-001` is consumable and only two opportunities are `GANADA`, so without it every rehearsal permanently spends a demo resource. **Done and committed as `5ee8d36`, independently verified and natively reviewed (`approved`, authority burned).** Deletes only `BORRADOR` projects (with their lineas and municipios, children first because the FKs are `ON DELETE RESTRICT`) and the sequence rows of years left without projects, returns converted opportunities to `PROSPECCION`, and never touches `auditoria_cambios`. Documented for the operator in `docs/guia-demo.md` §1.5. |

| 7 | **Rehearsal spec**: `e2e/proyectos-demo.spec.ts` — the demo's real path, narrated, against the real API and the live local database | S | The only proof that the UI works end to end: before this unit **no real row had ever been rendered** (every other test mocks `fetch` and the seeded `proyectos` table is empty). It is also the **backup recording** if the live demo misbehaves. **Done and committed as `8d260b9`, independently verified and natively reviewed (`approved`, authority burned).** Run it as `PLAYWRIGHT_BASE_URL=http://<gateway>:3000 npx playwright test e2e/proyectos-demo.spec.ts`, after the reset of unit 6. |

| 8 | **Ficha del proyecto**: dialog de detalle abierto desde la lista (datos generales, líneas con la principal marcada, municipios, duración) | M | **UI-only sobre un API ya revisado**: consume `GET /api/v1/projects/:id` (E-06), que existe, está aprobado y hoy **ninguna pantalla usa**. Se eligió dialog con el patrón de la ficha de cliente (acción `Ver detalle` por fila) en vez de una página `/proyectos/[id]`, porque la app **no tiene ningún patrón de página de detalle** (la única ruta dinámica de UI es `src/app/print/clientes/[id]`) y sí tiene el de dialog con pestañas. Cero código de servidor nuevo, cero migración. **Done and committed as `b2a2fcd`, independently verified and natively reviewed (`approved`, authority burned); its two review advisories are both SUGGESTION in test files.** |
| 9 | **Historial auditado del proyecto**: lector de `auditoria_cambios` + sección en la ficha + extensión del spec de ensayo | M | Es la respuesta a "¿y quién cambió esto?" y el diferenciador real frente al Excel. `AuditoriaCambio` guarda **`proyecto_id` en las dos filas** del lote (la `CONVERTIR` de la oportunidad también lo lleva) y tiene índice `[proyecto_id, created_at]`, así que el lector es una consulta por `proyecto_id` ordenada por fecha y agrupada por `lote_id` — que es justamente lo que prueba el "un solo paso auditado". `usuario_id` **no tiene FK** (a propósito: el libro sobrevive a los usuarios), así que el nombre del actor se resuelve aparte y debe degradar con dignidad cuando el usuario ya no existe. **Done and committed as `01a69e5`, independently verified against the live ledger with SQL and natively reviewed (`approved`, authority burned); the rehearsal spec now walks it, so the demo ends on the audit trail.** |

Dependencies: 4 needs 2 + 3; 5 needs 4; 6 and 7 are independent of 1–5, but 7 needs 6 (it consumes the demo state and is only repeatable because the reset restores it); 9 needs 8 (the historial lives in the ficha) and both should land before the final rehearsal, since 9 also extends `e2e/proyectos-demo.spec.ts` to walk the new surface.

### Explicitly OUT for Friday (to protect the date)
S3 (objetivos, actividades, entregables), S5 (presupuesto), S6 (gastos), S1.4 (parámetros de semáforo) and S4
(semáforo), the catalogs admin UI, S2.4 (value-difference alert), S2.6/S2.7 (fine-grained visibility). If the week goes
badly, the cut order is: the UI's creation dialog first (fall back to creating via API and showing the list), then S2.2.

### The demo script the work must support
1. Local stack up, demo data seeded.
2. An opportunity in `GANADA` appears as eligible.
3. Creating the project from it performs the conversion in one audited step, prefills cliente/nombre/valor, and assigns
   `origen`, `valor_total`, one principal strategic line, N municipios.
4. The project gets `PRY-2026-001` and lands in `BORRADOR`.
5. The list shows it. **Now proven end to end** by the rehearsal spec (`8d260b9`), which asserts a real
   `PRY-2026-001` row in `BORRADOR` and the consumed opportunity dropping out of the eligible list.

### Risks that actually threaten the date
- **The SDD keeps describing things that do not exist** — seven times now (S0.6, S0.7, S0.1, S1.1a, S1.2, S1.3, S2.1).
  Mitigation: a mandatory recon before every unit, exactly as done for S1.3; never trust a "VERIFIED" citation.
- **The UI has no prototype in this branch.** `odd/tasks/v6-visual-alignment.md`, which the plan references for V2.5–V2.11,
  **does not exist** here, and neither does any screenshot. The demo screen is therefore built from the Hub's existing
  patterns above. **If the PO expects to see the v6 prototype's design, say so now** — that is a different task.
- **Review budget:** roughly seven native-review lineages per session. A four-day sprint crosses that, so expect one
  mid-sprint Pi restart (which costs one extra consent dialog, since option 3 dies with the restart).
- **Environment:** the local Supabase stack silently disappeared for two days once already; recovery is documented in
  `muttuhub-crm/local-db/supabase-stack-recovery`. Check the port before blaming code.
- **The dev server is sometimes started on Windows**, and then `http://localhost:3000` does **not** connect from WSL
  (`curl` exits 7) even though the server is up: its listener sits on the Windows network stack
  (`netstat.exe -ano | findstr :3000` shows `0.0.0.0:3000`) and WSL only reaches it through the NAT gateway
  (`ip route show default | awk '{print $3}'`). `playwright.config.ts` now reads `PLAYWRIGHT_BASE_URL`, keeping
  `http://localhost:3000` as the default, and `docs/guia-demo.md` §1.6 documents the override. `next.config.ts`'s
  `allowedDevOrigins` already allows the `172.*` range for exactly this reason. Two further traps measured
  2026-10-06: the first request to each route can take 30–60 s while Turbopack compiles over the 9p mount, and
  `ps` shows the server as `node.exe` under `/mnt/c` — so a port check that only looks at WSL's own listeners will
  wrongly conclude the server is down.

## How to resume

0. **The `/mnt/c` review prerequisites are DONE (2026-10-02) — but re-verify all three before starting any review, or
   START fails before a lineage exists.** They are **cumulative, not alternatives**, and they were discovered one at a
   time: (1) `metadata` on the C: automount in `/etc/wsl.conf`, applied with `wsl --shutdown` from Windows and a reopen;
   (2) `.git/gentle-ai/candidate-views` at mode **`700`** — `metadata` alone does **not** satisfy
   `review-candidate-view-owner.ts:306`, so if `.git/gentle-ai` is ever recreated, `chmod 700` it again; (3)
   `export GENTLE_PI_CANDIDATE_GIT_TIMEOUT_MS=60000` in `~/.bashrc` **and a Pi restart**, because the value is read from
   Pi's own `process.env` (an invalid value or one above 120 000 falls back to 10 s **silently**). Quick check:
   `mount | grep /mnt/c` shows `metadata`, `stat -c '%a' .git/gentle-ai/candidate-views` prints `700`, and
   `echo $GENTLE_PI_CANDIDATE_GIT_TIMEOUT_MS` prints `60000`.
   Then `inspect` and START the slice with `{"mode":"ordinary","baseRef":"<slice base>","committedOnly":true}` —
   `inspect` keeps offering the **branch-wide** candidate by default, which is *not* what this project reviews, and
   **never retry** the stranded `review-5a50cbc2ef8376c2`.
   **Every unit of the Friday sprint is now closed** (rows 1–9 above), each one independently verified and natively
   reviewed with its authority burned, so the Friday sprint has no "next unit" to pick up — the post-demo work is
   S2.6, already in progress — and the remaining sprint work is the final
   rehearsal and the advisory backlog — the `formatFecha` hygiene fix this line used to list is now closed by
   `20a2923` — all listed in the resume path below. Deferred from earlier and
   still true: **S1.1b waits on S5.1** (`lineas_presupuestales`); the catalogs admin UI is one later unit covering
   rubros + líneas + municipios together; and the three unstrengthened assertions (v) plus the advisory findings
   R3-1/R3-2 remain later work.
   Two review-policy facts learned the hard way on 2026-10-06: the **consent dialog expires after 10 minutes** (a stale
   binding comes back as `consent-binding-expired` with `lineage_created: false` and burns nothing — just START again
   with a fresh `idempotencyKey`), and the **option 3 permission dies with a Pi restart**, so warn the human before
   issuing START. `inspect` always offers the **branch-wide** candidate, which this project never reviews: re-frame it
   to the slice of the new material, and remember that a slice whose only new material is a passive **docs** commit is
   deliberately exempted rather than spending a lineage (see `env/rdd-docs-only-exemption-policy` in memory).
1. `mem_context` for the session summary, then read this document and `odd/tasks/v2-projects-sdd.md`. The unit-by-unit
   receipts, the environment traps and the review policy live in memory (project `muttuhub-crm`) under these topic keys:
   `v2-projects/demo-reset-unit`, `v2-projects/demo-rehearsal-e2e-spec`, `v2-projects/ui-unit-3-project-ficha`,
   `v2-projects/ui-unit-4-project-audit-history`, `v2-projects/detail-and-audit-plan`,
   `env/rdd-docs-only-exemption-policy` and `env/native-review-slice-vs-untracked-selection`.
2. `git switch feat/projects-v2` — the rebase is long done (0 behind `main` at `6bee83f`); never rebase again unless
   `main` moved, and never recreate the old cherry-pick. **Tip at close of 2026-10-07: `643375a`, 25 commits ahead of
   `origin/feat/projects-v2` (the ledger commit for this row follows it), working tree clean.** The push is the
   human's, over HTTPS from home; do not switch the remote to SSH. **S2.6 is now in progress:** U1 (T1 + T2) and
   **T3** (the E-07 members routes) are closed and their native reviews burned (`review-ab42ace5342e9dd6`,
   `review-92166de3c97f832e`), and **T4** (the creation flow adding the responsable as a member and accepting
   `miembro_ids`) is next.
3. **Every unit of the Friday sprint is delivered** (rows 1–9 above), each independently verified and natively reviewed
   with authority burned. What remains before Friday is not a new unit:
   - **the final rehearsal**, in this order: `npm run db:demo:reset:local` (dry run, read the plan) →
     `npm run db:demo:reset:local -- --apply` → dev server up (see the environment risk above if it was started on
     Windows) → `PLAYWRIGHT_BASE_URL=http://$(ip route show default | awk '{print $3}'):3000 npx playwright test
     e2e/proyectos-demo.spec.ts` → **copy the video out of `test-results/`**, because the next run overwrites it (a
     copy from 2026-10-06 lives at `~/muttu-demo/`).
   - **the `formatFecha` hygiene fix is DONE** (`20a2923`): the new `formatFechaDia` in `src/hooks/crm.ts` formats a
     UTC-midnight calendar day in UTC and is applied to the two date-input columns only (`fecha_primer_contacto`,
     `fecha_ultima_gestion`) — **per column, never globally**, exactly as this bullet required. `Tarea.fecha_entrega`
     deliberately keeps the viewer-zone `formatFecha`, because the seed writes real instants for it and `esVencida`
     compares that column with `now`.
   - **the consolidated advisory backlog** in *Open items / risks*: separate later work by every reviewer's own
     disposition, never a reason to re-run a review.
4. **Out of scope for Friday, decided and reasoned** — do not start these before the demo: **S2.4** (blocked by N-17
   and it would reopen the already-approved creation route), **S4/S1.4** (the semáforo needs S3's activities and
   deliverables first), **S2.6** (no longer blocked: it is in progress beyond the Friday scope, with U1 and T3 closed above)
   and **S2.7** (still blocked by the `puede_ver_tablero_gerencial` column, which does not exist in this branch).
5. Optional, preserves real value: re-open the closed #55 content as a small PR — `scripts/cleanup-seed-cloud.ts`
   (141 lines) and `DIAGNOSTICO-SEED-CLOUD.md` (103 lines).

**Backup ref:** `backup/pre-rebase-feat-projects-v2-20260930` → `97e08be` (the pre-rebase branch state). Delete it
once the rebase is trusted.

**"Starting v2 from scratch" means a fresh session, not discarding work.** Abandoning the v1 module was the scratch
decision and it is done. The Friday demo path is complete and rehearsed: resume by re-reading the sprint plan and the
backlog; the post-demo work continues in S2.6, where U1 (T1 + T2) and T3 are closed and T4 is the next unit.
