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
- [x] P0.6 **DB-safety fix landed in this branch** (commit `96c4c5c`). `prisma/local-env.ts` loads `.env.local` only (never `.env`), asserts loopback, fails closed on unparseable values, produces credential-free errors and has no bypass; `prisma/require-local-db.ts` is the side-effect guard, imported first so it runs before the Prisma client is built; `prisma.config.ts`, `prisma/seed.ts`, `prisma/invariant.test.ts` and `scripts/backfill-document-text.ts` use it; `db:*:local` scripts invoke Prisma through `node --env-file` instead of `npx`. Verified: `npx prisma migrate status` → `127.0.0.1:54322`; a remote target raises `NonLocalDatabaseError`; suite 116 files / 1041 tests green in 52 s (was 86 s). This absorbs the guard half of S0.6 and supersedes PR #55's seed guard.

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
- [ ] P5.3 S0.5 (weeks + money pure libs) → S0.4 (append-only `auditoria_cambios` + `logChange`, needs the local DB) → S0.6 (migration safety kit with loopback guard, created from scratch).

## Open items / risks

- ~~**CRITICAL: the default Prisma CLI path wrote to production.**~~ **Fixed and merged to `main`** — PR #71, squash commit `6a28935`. `npx prisma …` used to resolve `DIRECT_URL` from `.env` (the shared remote) through `prisma.config.ts`. The config now loads `.env.local` only, `prisma/require-local-db.ts` refuses any non-loopback target, and the `db:*:local` scripts replace plain `npx`. Re-verified on `main` after the merge: `npx prisma migrate status` → `127.0.0.1:54322`, and a remote target raises `NonLocalDatabaseError`. Residual: a deliberate remote run must export `DATABASE_URL`/`DIRECT_URL` explicitly.
- **Environment:** the local Docker stack must be running for every migration and live-DB test (S1.x onward). The
  pure libraries (S0.5) do not need it. Note that `prisma migrate reset` needs the user's **verbatim consent
  string**, because Prisma blocks that command for AI agents.
- **DB-safety tooling:** no longer a gap. The guard now exists in this branch (P0.6); S0.6 only adds the
  count-first harness, the storage orphan report and the promotion checklist on top of it. PR #55's seed guard is
  superseded; its `scripts/cleanup-seed-cloud.ts` still has its own value.
- **Business risk (accepted):** confirm with the boss/PO that nothing is expected from the v1
  module in production. Nothing shipped, but there was a PO meeting on 2026-09-22 about
  "gestión de proyectos" features.
- **Remote DB state (unverified):** whether the shared Supabase still carries the v1 projects tables from the
  2026-09-17 seed incident. It does not block v2 development — v2 creates its own tables — but it must be checked
  before the human remote-promotion step (§6.5 of the SDD).
- **`gh` / git TLS:** failures against GitHub in this environment come from TLS interception, not from `gh`
  itself. Observed 2026-09-30: a Fortinet FortiGate re-signing `github.com`, untrusted in both WSL
  (`certificate signer not trusted`) and Windows (`schannel: SEC_E_UNTRUSTED_ROOT`). It resolved on its own later
  the same day. Verify the issuer (`openssl s_client -connect github.com:443`) before concluding anything, and
  never disable certificate verification or install a corporate CA without an explicit user decision.
- **Fork leftover:** `agutierrezreginodev/MuttuHub-CRM` caused the wrong-account push mistake
  twice; recommended to delete it.
- **Held v6 tasks** still have no owner until S10.1 executes.

## Progress / Evidence

| Date | Task | Commit | Checks observed | Notes |
|---|---|---|---|---|
| 2026-09-30 | Diagnosis + ODD-01..04 decisions | — | PR triage verified via local git ancestry; working tree restored after a dry cherry-pick probe | No remote action taken yet |
| 2026-09-30 | Scope limit recorded | — | — | Local-only until explicit approval; Phase 1 gated. `gh` account = `MuttuHub`; merge style = squash |
| 2026-09-30 | Session 2: rebase onto `main` + baseline re-verification | `5f4e4a8` (branch tip; every v2 commit rewritten) | `tsc` 0 errors; `vitest` 120 files / 1094 tests green in 48.8 s; Docker up; `.env.local` loopback | `96c4c5c` dropped as already-applied; `CLAUDE.md` note kept uncommitted; **no source written** |

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

## How to resume

1. `mem_context` for the session summary, then read this document and `odd/tasks/v2-projects-sdd.md`.

1. `mem_context` for the session summary, then read this document and `odd/tasks/v2-projects-sdd.md`.
2. `git switch feat/projects-v2` — **the rebase is already done.** The branch is 0 behind `main` (`6bee83f`) with
   tip `5f4e4a8`, and its baseline is verified green (session 2 above). Do **not** rebase again unless `main`
   moved; do not recreate the old cherry-pick.
3. **Decide `CLAUDE.md` first** — 14 uncommitted lines about the local-vs-remote `.env` rule. It is the only dirty
   tracked file. Either commit it alone (`docs: document the local-vs-remote env rule`) or fold it into S0.6.
4. Next task: **S0.6**. Spec in §4.5 of the SDD plus the S0.6 block. Only the count-first harness, the read-only
   storage orphan report and the promotion checklist remain — the loopback guard already exists **in `main`**.
   Files: `scripts/migrate-v2/{_guard.ts,_guard.test.ts,_harness.ts,_harness.test.ts,storage-orphans.ts,s1-rubros-report.ts}`,
   `.gitignore` (`scripts/migrate-v2/out/`), SDD §6.5 + §6.7.
5. Before **S0.7** (permissions), confirm with the PO **who creates projects**: RF v2.0 §3 says the **Gestor**
   does; the user's decision says only **GERENCIA + ADMINISTRADOR**. Building S0.7 on the wrong answer means
   rework in the permission predicates.
6. Optional, preserves real value: re-open the closed #55 content as a small PR —
   `scripts/cleanup-seed-cloud.ts` (141 lines) and `DIAGNOSTICO-SEED-CLOUD.md` (103 lines).

**Backup ref:** `backup/pre-rebase-feat-projects-v2-20260930` → `97e08be` (the pre-rebase branch state). Delete it
once the rebase is trusted.

**"Starting v2 from scratch" means a fresh session, not discarding work.** Abandoning the v1 module was the
scratch decision, and it is done; `S0.4` and `S0.5` are committed and verified. v2 resumes at `S0.6`.
