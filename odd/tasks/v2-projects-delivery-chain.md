# Muttu Hub v2 — Delivery plan for `feat/projects-v2` (chained PRs)

Branch: `feat/projects-v2`, branch point `6bee83f594e953199498ea260fb1a61ea24d2c50`. Feature id: `v2-projects-delivery-chain`.
Engram mirror topic: `odd/v2-projects-delivery-chain/tasks`. Created 2026-10-09 from a read-only slicing analysis (nothing was built, run or
merged by the analysis).

## Decision (user, 2026-10-09)

Chain strategy: **Feature Branch Chain**. A draft/no-merge tracker PR on an integration branch; child PR #1 targets the tracker branch and each
later child targets its immediate parent branch; the tracker stays draft until every child is reviewed and integrated. Do not mix strategies.
Delivery strategy for ODD: `ask-on-risk` with `chain_strategy = feature-branch-chain`. Push, PR creation and merge remain the user's decisions.

## Branch size (verified 2026-10-09)

188 commits over the branch point, 470 files, +82,825 / -291 lines, 19 new migration folders, 70 `docs(odd)` commits (7,262 net lines in `odd/tasks/`).
The 400-line budget CANNOT be met: almost every commit is 400 to 2,000 lines, a literal split is about 150 PRs. One honest slicing pass at layer
boundaries gives 21 units (about 45 PRs if each is split at the sub-boundaries). Every unit above 400 needs a maintainer-accepted `size:exception`
(reason in each: indivisible schema + route + test triplets, or one UI screen with its tests).

## Units, in forced order (migrations are strictly serial)

Counts are gross additions + deletions per commit, summed (fixups counted twice), `odd/` excluded; migrations SQL and docs included.

| Unit | Title | Commits | +/- | Depends on | Merge-risk (judgement, nothing was run) |
|---|---|---|---|---|---|
| U0a | S0 foundations: week/money libs, audit table, v2 migration harness, role restriction | 88d4b67 689ef32 108c682 959ca33 0dc08ec 4866d8a cf8b837 bd7cc00 | 2,482 | none | Low-medium (`0dc08ec` is a breaking authz change) |
| U0b | Unified uploads 25 MB, signed uploads, documents/attachments | cb192df 7a5e29f 415ec27 8d10180 | 3,803 | U0a | Medium (rewrites CRM document flows) |
| U2c | Date-input UTC-5 fix (non-project CRM fix, can go first) | 20a2923 | 212 | none | Low |
| U1 | Catalogs: rubros R01-R15, strategic lines, municipios (3 migrations) | 9cf8466 563369b 986cf3b 4762eb8 | 4,632 | U0a | Low |
| U2a | Proyecto model, API, PRY codes, create-from-opportunity (2 migrations) | 9ddc68a e59bbd4 6617a4f afa4c27 3a42837 | 4,928 | U1 | Low-medium |
| U2b | Projects list, creation dialog, ficha, audit history | 3e94c11 885401f b2a2fcd 01a69e5 | 3,856 | U2a | Medium (first user of `project-ficha-dialog.tsx`) |
| U2d | Demo reset script and narrated e2e (fold fixup `1250829`) | 5ee8d36 8d260b9 1250829 | 1,121 | U2b | Low |
| U2.6 | Project membership: table, scoped reads, routes, team UI | 6d9652b 7faf6f7 643375a d540ffd 574cea3 | 3,522 | U2b | Medium (`7faf6f7` changes read scoping) |
| U2.4/2.7 | Project vs opportunity value alert, dashboard split | 482d233 6b4d2c4 | 778 | U2a | Medium (`6b4d2c4` edits the CRM dashboard) |
| U3 | Structure: objectives, week activities, deliverables/indicators, UI, Gantt (3 migrations) | fb8bad3 ffb3a84 fbaa1a0 812868e 4f568e1 53632e7 | 7,075 | U2.6 | Medium |
| UA | Admin catalogs section and semáforo v2 parameters | e535518 170fcb0 8723ef1 a7e640c | 1,715 | U1 | Low |
| U4 | Technical execution: avances, evidence uploads, measurements, beneficiaries (3 migrations) | bd775f7 021b560 2aed734 b38868e 42f777c a42c45e 1601b93 | 8,525 | U3, UA, U0b | Medium |
| U5 | Budget and financial ficha: libs, tables, routes, editors | 6e39cde dbe8f91 7673e50 63d3938 9371645 318c915 | 4,496 | U4 | Medium |
| U6 | Expenses: rules, register, validate/reject, notifications, supports (3 migrations) | 3d2384f 089fad3 13dae48 0fc495d cca878b 015eada 3a90878 | 6,815 | U5, U0b | Medium-high (`cca878b` edits notifications; enum migration `...130000` must precede `...130100`) |
| U7 | Excel template: generator, parser, validators, import routes/dialog, pilot script | ae2881d bf7bcd6 6f8b6a3 90d7776 5b9b9bb 4b6c565 b68d0da eb96b31 ed4dd96 3a05c6c 5a5d30d | 8,688 | U6 | Medium |
| U8 | Versions and modifications: baseline v0, requests, approval, comparison (1 migration) | b66dd75 07e6db0 d1f7bcf f42588c b30c6e1 87c742f 4b52ed4 ef26992 6a91733 4fa441c 2e7ed11 45e8f9a | 6,796 | U7 | Medium-high (`d1f7bcf` locks the project row in every structure writer) |
| U9 | KPI libs, gerencial flag, portfolio dashboard, KPIs, Excel exports (1 migration) | 03c45be f853583 671b8e5 60a1c06 8046fca 6df4b13 8cab543 f02c717 81f0fcd 23cb5a9 e6b0616 8d1c544 6ff6bab | 5,391 | U8 | Medium (`f02c717`/`81f0fcd` refactor U5 files) |
| U10 | Visual redesign: primitives, tabbed ficha, progress/KPI, bottom sheets, cards | 951f0da 4f95cf4 f5d4767 6f0009e 2a44ff5 c67ea5d bbfc700 a269f2c | 2,624 | U9 | Medium (`f5d4767` reorganises the whole ficha) |
| US11 | "Convertir en proyecto" button, local demo seed, robust seed marker | 1909113 18c5adf d897051 (squash the last into `18c5adf`) | ~1,330 | U2a, U10 | Low |
| UG | Test guide `docs/guia-prueba-proyectos.md` | f193920 2d8f64a d36dd94 88fb665 f370050 | 702 | one per slice | Low (slice each guide section into its unit's PR) |
| UODD | `odd/tasks/*` ledger | 70 `docs(odd)` commits, 21 files | 7,262 net | n/a | Low (plan, SDD and execution ledgers in one docs-only PR at the head; each `s<N>-execution.md` rides with its unit) |

Fixups to squash into their unit: `959ca33`, `cf8b837`, `6617a4f`, `986cf3b`, `6f8b6a3`, `4b6c565`, `45e8f9a`, `f853583`, `8046fca`, `a269f2c`,
`1250829`, `d897051`; `3a05c6c` and `5a5d30d` are late test-only commits that belong with U7.
Only U0b, U2c and UA are reorderable relative to the migration chain.

## Hot-spots (cherry-pick / rebase conflicts)

`prisma/schema.prisma` (14 commits), `src/lib/openapi/document.ts` and `registry.ts` (14 and 16), `project-ficha-dialog.tsx` (13 commits +
604-line test), `docs/guia-prueba-proyectos.md` (7), `scripts/` (14 commits), plus tiny `package.json`, `.gitignore`, `CLAUDE.md`,
`vitest.config.ts`, `playwright.config.ts`. Mitigation: build the chain in order so each unit rebases onto the previous one.

## Review state

Native review is per candidate (work unit or PR slice), never the whole branch. Reviewed and acknowledged so far: the S11 slice
`f370050..18c5adf` (medium, approved; lineage `review-94ce7b1766a736fc`). Everything else is unreviewed; the whole-branch candidate fails with
`lens_context_budget_exceeded`, so review each unit PR slice when it is built.

## Update 2026-10-09 (after the plan)

- New unit **US12** after US11: project ficha as its own page `/proyectos/[id]` opened in a new browser tab (commits `0edca6d`, `cdb2543`, `4746116`,
  `3d174b9`, plus doc commits; feature doc `v2-projects-ficha-page.md`). It depends on U10 (tabbed ficha) and U9. `d897051` (seed partial-run fix) stays
  squashed into US11.
- Native review: the S12 + U3 slice `18c5adf..3d174b9` was reviewed and APPROVED with zero findings (lineage `review-d929d0e46a8a1929`). The last
  reviewed boundary is `3d174b9`. Reviewed so far: US11 (`f370050..18c5adf`) and US12 + U3; everything older is unreviewed.

## Update 2026-10-09 (S13 UI base)

- New unit **US13** after US12: v6/brand-manual UI base (feature doc `v2-ui-v6-base.md`): U2 `7948b40` (single h1), U1 `6fb8b0d` `fcc97ce` `cd48a1b` (tokens + primitives), U1b `d3f1ac8`
  `57b6aad` `7b19b54` (manual v2 palette, light default, outline destructive), plus the Tablero action-column fix `5b8c7ff` (belongs with US12). Depends on U10 (tabbed ficha) and US12.
  Pending U3-U6 will add US14+ (sidebar, tables, controls, cards).
- Native review: the slice `3d174b9..7b19b54` (medium, 32 files, 1402 lines) was reviewed and APPROVED (lineage `review-11bd620b6afa4bc8`; one advisory warning checked and not materialized).
  The last reviewed boundary is `7b19b54`. Reviewed so far: US11, US12 + U3, US13 (partial); everything older is unreviewed.
- Also committed: `docs/brief-video-direccion.md` (`4acf547`), a standalone doc, not part of any unit.

## Status

- [x] Slicing analysis (read-only), 2026-10-09.
- [x] Chain strategy chosen: feature-branch-chain.
- [ ] Maintainer decision on `size:exception` for the units above 400 lines.
- [ ] Integration branch + tracker PR (draft). Needs the user's go-ahead for branch creation, push and PR.
- [ ] Unit branches built in order (cherry-pick, squashing the listed fixups), each verified independently (tests/build) before its PR.

## Next step

Ask the user how far to go: build the local branch chain only (no push, no PRs), or stop at the plan.
