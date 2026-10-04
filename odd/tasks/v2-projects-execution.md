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
- **Held v6 tasks** still have no owner until S10.1 executes.

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
| 2026-10-03 | **Test-hardening unit** — the three weak assertions + the OpenAPI gap + the two unexercised seed paths | delegated writer (1 round) + independent read-only verifier | commit that follows `563369b` | Closed four recorded residuals without touching production code. The harness fake now **counts** `lote` writes and pins exactly **1** per `--apply` / **0** per `--dry-run` (the most valuable, since a fake that restates the production call shape is what once hid the `writeLote` delegate defect); both catalog migration tests assert `indisunique = true` on the code index and the adoption test proves a duplicate non-NULL `codigo` is rejected; the `public` guard now snapshots **rows + functions + triggers**; and a new `src/lib/openapi/document.test.ts` pins the assembled document's catalog paths so a broken registration import fails a test, not just `tsc`. Separately, `npm run db:seed:local` ran **end to end** against the local DB (`Rubros: 15`, `Líneas estratégicas: 8`, exit 0), closing the "unexecuted seed path" residuals of both S1.1a and S1.2 | Verifier: **READY TO COMMIT: yes**, no blocking findings; it judged every strengthened assertion genuinely meaningful rather than test theatre, confirmed no existing assertion was weakened or deleted, and confirmed the harness fake still models the real `writeLote` faithfully so the delegate defect cannot return unnoticed. Advisory: the widened `public` snapshot is broader than the leak it guards (environment-coupled if run against a different Supabase version) | **Test-only change**: full suite **136 files / 1258 tests green** (baseline 135/1255), `tsc` 0, eslint clean |

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
   **S1.1a's review is already closed** (session 8: `approved`, authority burned, lineage `review-eea4c3aa7621c16c`), and
   **S0.1 closed on 2026-10-02, so the S0 phase is complete**; **S1.2 closed the same day**. Next units: **S1.3**
   (municipios, gate N-21 = curated/admin-extendable) and **S1.4** (semáforo params, gate DP-04 = provisional values),
   in that order; **S1.1b stays deferred until S5.1** creates `lineas_presupuestales`, and the catalogs admin UI is one
   recorded later unit covering rubros + líneas + municipios together; the three unstrengthened assertions (v) and the
   advisory findings R3-1/R3-2 remain as later work.
   Note also that the **consent dialog expires after 10 minutes** and the **option 3 permission dies with a Pi restart**,
   so warn the human before issuing START.
1. `mem_context` for the session summary, then read this document and `odd/tasks/v2-projects-sdd.md`.
2. `git switch feat/projects-v2` — **the rebase is already done.** The branch is 0 behind `main` (`6bee83f`) with
   tip `5f4e4a8`, and its baseline is verified green (session 2 above). Do **not** rebase again unless `main`
   moved; do not recreate the old cherry-pick.
3. ~~**Decide `CLAUDE.md` first**~~ **Done 2026-10-01**: committed alone as `bd7cc00 docs(claude): document the local-vs-remote env rule`.
4. ~~Next task: **S0.6**~~ **Done 2026-10-01** (see session 3 above). Next task is **S0.7** (project permission predicates); its gate is resolved (D-09: GERENCIA + ADMINISTRADOR only).
5. ~~Before **S0.7** (permissions), confirm with the PO **who creates projects**~~ **Resolved 2026-10-01 by the user**: GERENCIA + ADMINISTRADOR. Do not introduce a GESTOR role and do not put COORDINADOR into project management.
6. Optional, preserves real value: re-open the closed #55 content as a small PR —
   `scripts/cleanup-seed-cloud.ts` (141 lines) and `DIAGNOSTICO-SEED-CLOUD.md` (103 lines).

**Backup ref:** `backup/pre-rebase-feat-projects-v2-20260930` → `97e08be` (the pre-rebase branch state). Delete it
once the rebase is trusted.

**"Starting v2 from scratch" means a fresh session, not discarding work.** Abandoning the v1 module was the
scratch decision, and it is done; `S0.4` and `S0.5` are committed and verified. v2 resumes at `S0.6`.
