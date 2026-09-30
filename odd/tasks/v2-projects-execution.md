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
  `migrate status` is read-only, so nothing was written. **Rule from now on: every DB command uses the explicit node + `--env-file=.env.local` form.** `migrate dev`, `migrate deploy`, `db push` and `db seed` via `npx` are forbidden until a wrapper exists.

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
- [ ] P5.3 S0.5 (weeks + money pure libs) → S0.4 (append-only `auditoria_cambios` + `logChange`, needs the local DB) → S0.6 (migration safety kit with loopback guard, created from scratch).

## Open items / risks

- **CRITICAL (confirmed 2026-09-30): the default Prisma CLI path writes to production.** `npx prisma …` from this
  checkout resolves `DIRECT_URL` from `.env` (the shared remote), not from `.env.local`, because
  `prisma.config.ts` does `import "dotenv/config"`. Any `migrate dev` / `migrate deploy` / `db push` / `db seed`
  run that way would mutate the shared database. Mandatory workaround: `node --env-file=.env.local
  node_modules/prisma/build/index.js <command>`, plus a `db:*:local` npm wrapper as a follow-up. Tracked as R-01 in
  the SDD; the guard in S0.6 must cover this path because a JS-level guard cannot intercept a Prisma subprocess.
- **Environment:** the local stack must be running for S0.4 (live-DB trigger test) and every S1.x migration.
  S0.5 (pure libraries) does not need it.
- **DB-safety tooling does not exist on `main`:** S0.6 creates the loopback guard; it cannot reuse the one from
  the abandoned chain. Merging PR #55 first would provide it, but that needs remote authorization.
- **Business risk (accepted):** confirm with the boss/PO that nothing is expected from the v1
  module in production. Nothing shipped, but there was a PO meeting on 2026-09-22 about
  "gestión de proyectos" features.
- **Remote DB state (unverified):** whether the shared Supabase already has the v1 projects
  tables (the 2026-09-17 seed incident loaded `.env` against cloud). Must be checked before any
  v2 migration. S0.6's loopback guard stays mandatory.
- **`gh` instability:** the GitHub CLI fails intermittently in this WSL environment with
  `tls: failed to verify certificate: unknown authority`. Fall back to local git ancestry for
  triage; retry for remote actions.
- **Fork leftover:** `agutierrezreginodev/MuttuHub-CRM` caused the wrong-account push mistake
  twice; recommended to delete it.
- **Held v6 tasks** still have no owner until S10.1 executes.

## Progress / Evidence

| Date | Task | Commit | Checks observed | Notes |
|---|---|---|---|---|
| 2026-09-30 | Diagnosis + ODD-01..04 decisions | — | PR triage verified via local git ancestry; working tree restored after a dry cherry-pick probe | No remote action taken yet |
| 2026-09-30 | Scope limit recorded | — | — | Local-only until explicit approval; Phase 1 gated. `gh` account = `MuttuHub`; merge style = squash |
