# Muttu Hub v6 — F0 cierre + F1 Tablero de seguimiento (UI sobre backend existente)

## Objective
Implement the Muttu Hub v6 design handoff, phases F0 (close out existing work) and F1
(Tablero de seguimiento UI on top of the already-tested backend), per the client's
action plan in `Web app views creation/design_handoff_muttu_hub_v6/referencia/Auditoria v6.dc.html`.

## Why
Client-approved final design (Muttu Hub v6). F0 unblocks delivery (open PRs, uncommitted
tabs, dead code). F1 is the cheapest high-value slice: budget/legalización/soportes/metas
APIs and models already exist and are tested; only the UI is missing.

## Constraints
- Every deliverable is an OpenSpec change (proposal → design → tasks → apply → verify),
  strict TDD (RED before code, then GREEN).
- Prisma migrations additive-only (nullable/default columns, no drops/destructive backfills).
- Permissions only via `src/lib/permissions.ts` (`canViewProject`, `canManageProject`,
  `canManageOpportunity`, `hasCommercialAccess`); never compare roles inline.
- Semáforo thresholds only via `src/lib/semaforo.ts` (`resolverUmbrales` + settings +
  `umbrales_override`); never hardcode 80/105/120 etc.
- Inputs ≥16px, touch targets ≥44px, horizontal-scroll tables, responsive 390px–1440px.
- Before each PR: `npx tsc --noEmit`, `npx eslint .`, `npm run test` (vitest run) green.
- Git: push only to `origin` (org MuttuHub). **Currently blocked**: `gh auth status` fails
  for all 3 configured accounts (invalid token + TLS error) — network issue, user will fix
  later. Local commits proceed; push/PR creation deferred until resolved.

## Execution mode
Automatic (user confirmed 2026-09-25: "continua todo en automatico"). Report per task,
do not pause for OK between tasks. Delivery strategy: ask-on-risk (default, not yet
triggered). Artifact store: engram (default, available).

## TDD
Strict TDD enabled globally (session config). Runner: `npm run test` (`vitest run`).

## Tasks

- [ ] **F0.1** — Verify PRs #44/#45/#46 status, merge in order, archive the
      `oportunidades-comerciales` OpenSpec change.
      **BLOCKED**: `gh auth` broken (network). Deferred — user will resolve separately.
- [x] **F0.2** — PR-ready the Cronograma/Gantt/Indicadores tabs from `local/todo-integrado`;
      delete confirmed dead code: **all of `project-sheet.tsx` + its test** (not just
      `CronogramaTab` — verified zero live importers beyond its own test).
      Correction to Auditoría: `loadClientScoped`/`loadTaskScoped` are **live** (used by
      contacts/log/tasks/attachments/comments/subtasks routes) — do NOT remove them.
- [ ] **F0.3** — Repair Docker/e2e for the opportunity cycle. Out of scope unless blocking;
      flag to user if Docker/WSL2 repair is needed.
- [ ] **F0.4** — Client decision session (umbrales, role mapping). Using Auditoría's
      recommendations as default per user instruction, documented in each change's design.md.
- [ ] **F1.1** — Pestaña Financiero (RF-05, RF-07). Uses existing
      `/api/v1/projects/[id]/budget` + `semaforo.ts` (already bidirectional). New:
      `useBudget` hook, `tabs/financiero-tab.tsx`. Threshold mismatch to reconcile:
      design brief (80/105/60/79/106/120) vs `UMBRALES_SEMAFORO_DEFAULT` code defaults
      (85/115/60/140) — adopting v6 numbers as org default per Auditoría recommendation.
      Per-person breakdown by rubro explicitly out of scope (no `Gasto.tercero` field yet).
- [ ] **F1.2** — Pestaña Legalización + modal Registrar gasto (RF-06). Additive migration
      on `Gasto`: `tercero`, `numero_comprobante`, `estado_legalizacion`.
- [ ] **F1.3** — Pestaña Soportes (RF-04).
- [ ] **F1.4** — Pestaña Metas (RF-02, KPI 3).
- [ ] **F1.5** — Umbrales del semáforo editables en Administración.
- [ ] **F1.6** — Tablero gerencial unificado (`/tablero-gerencial` + `/`) con visualizaciones v6.

## Known risks (from code exploration, 2026-09-25)
- `project-workspace.tsx` / `.test.tsx` mid-edit, uncommitted (Cronograma work) — F1.1
  touches the same tab-registration lines; sequence F0.2 merge before branching F1.1.
- No `useBudget`/budget DTO in `src/hooks/projects.ts` yet — net-new for F1.1.
- No `CHECK` constraint visible in schema text for `Gasto`-adjacent enums; grep migrations
  before adding `estado_legalizacion` in F1.2.

## Progress / Evidence
(updated per task as it completes)

### F0.2 (2026-09-25)
- Prior-session state confirmed: `gantt-tab.tsx`/`.test.tsx` and `indicadores-tab.tsx`/`.test.tsx`
  were already committed to the branch (tracked, unmodified). Only `cronograma-tab.tsx`/`.test.tsx`
  (untracked) and `project-workspace.tsx`/`.test.tsx` (modified, wiring the 4th tab) were
  uncommitted this session — that wiring + test coverage is what F0.2 actually completed.
- `project-workspace.tsx` confirmed with all 4 tabs wired: `TAB_VALUES = ["resumen",
  "cronograma", "gantt", "indicadores"]`, matching `TabsTrigger`/`TabsContent` entries.
- Dead-code re-verification: `rg -l "project-sheet" src` before deletion returned only
  `project-sheet.test.tsx` (self-import) plus 3 files with mere *comment* mentions
  (`cronograma-tab.tsx`, `cronograma-tab.test.tsx`, `project-list.test.tsx` — no `import`/`from`
  statements). Zero live importers confirmed → deleted `project-sheet.tsx` +
  `project-sheet.test.tsx`.
- `src/lib/api/crm.ts` left untouched per instructions (`loadClientScoped`/`loadTaskScoped` are
  live).
- Checks (before deletion): `npx tsc --noEmit` clean; `npm run test` → 160 files / 1467 tests
  passed, 0 failed.
- Checks (after deletion, final): `npx tsc --noEmit` clean (0 errors). `npx eslint .` → 211
  pre-existing problems (161 errors/50 warnings), ALL in files outside this task's scope and
  outside this session's diff: `Web app views creation/**/support.js` (untracked vendor/demo
  bundle), `src/app/auth/confirm/page.tsx`, `src/hooks/use-infinite-scroll.ts`,
  `supabase/.temp/...index.ts` (generated file) — confirmed via `git diff --stat HEAD` (no diff)
  that these predate this session. `npx eslint src/components/proyectos/` (this task's scope)
  → 0 problems. `npm run test` (final) → 159 files / 1460 tests passed, 0 failed (exactly
  -1 file/-7 tests vs. the pre-deletion run, matching `project-sheet.test.tsx`'s removed suite).
- Commit: `e78f7ee` — `feat(proyectos): integrate Cronograma tab and remove dead ficha component`
  (4 files changed: `project-workspace.tsx`, `project-workspace.test.tsx`,
  `tabs/cronograma-tab.tsx` + `.test.tsx` added, `project-sheet.tsx` + `.test.tsx` deleted).
  `CLAUDE.md` and other unrelated untracked files (HANDOFF, PENDIENTES-MENORES, the zip,
  `scripts/seed-proyectos-demo.ts`, other `odd/tasks/*.md`, `.codegraph/`) intentionally left
  unstaged per task scope.

## Next step
F0.2 done. Next: F0.1 (blocked on `gh auth`), F0.3 (Docker/e2e, out of scope unless
blocking), or F0.4/F1.x per user direction.
