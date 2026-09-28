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
      2026-09-28: `gh auth` works (active account MuttuHub). #44/#45/#46 all MERGED to main
      on 2026-09-17 (plus #47: ephemeral Postgres for invariant tests in CI). Remaining:
      archive the `oportunidades-comerciales` OpenSpec change (pending user OK).
- [x] **F0.2** — PR-ready the Cronograma/Gantt/Indicadores tabs from `local/todo-integrado`;
      delete confirmed dead code: **all of `project-sheet.tsx` + its test** (not just
      `CronogramaTab` — verified zero live importers beyond its own test).
      Correction to Auditoría: `loadClientScoped`/`loadTaskScoped` are **live** (used by
      contacts/log/tasks/attachments/comments/subtasks routes) — do NOT remove them.
- [ ] **F0.3** — Repair Docker/e2e for the opportunity cycle. Out of scope unless blocking;
      flag to user if Docker/WSL2 repair is needed.
- [ ] **F0.4** — Client decision session (umbrales, role mapping). Using Auditoría's
      recommendations as default per user instruction, documented in each change's design.md.
- [x] **F1.1** — Pestaña Financiero (RF-05, RF-07). Uses existing
      `/api/v1/projects/[id]/budget` + `semaforo.ts` (already bidirectional). New:
      `useBudget` hook, `tabs/financiero-tab.tsx`. Threshold mismatch to reconcile:
      design brief (80/105/60/79/106/120) vs `UMBRALES_SEMAFORO_DEFAULT` code defaults
      (85/115/60/140) — adopting v6 numbers as org default per Auditoría recommendation.
      Per-person breakdown by rubro explicitly out of scope (no `Gasto.tercero` field yet).
- [x] **F1.2** — Pestaña Legalización + modal Registrar gasto (RF-06). Additive migration
      on `Gasto`: `tercero`, `numero_comprobante`, `observado`, `observacion`
      (`estado_legalizacion` is derived in the API, not stored). Migration applied to NO DB yet.
- [x] **F1.3** — Pestaña Soportes (RF-04). UI-only, no schema/API changes: adds
      `tabs/soportes-tab.tsx` (list, type chip, vinculado a/autor/fecha/formato,
      download, delete) and `soporte-dialog.tsx` ("Agregar soporte", Archivo/Enlace
      XOR radio per design D1) to `project-workspace.tsx`'s 7th tab. Fixed a stale
      client type: `Soporte` in `src/hooks/projects.ts` was missing `subido_por_id`
      even though `SUPPORT_SELECT` already returns it. Commits: `68e7275` (list +
      delete), `2a80cf0` (modal + workspace wiring), both on `local/todo-integrado`.
      openspec change: `proyecto-soportes-tab`.
- [x] **F1.4** — Pestaña Metas (RF-02, KPI 3). Corrected 3 points post-review before
      implementing (openspec change `proyecto-metas-tab`, design.md D4/D6/D7): indicator
      progress-bar color is now a parametrized `UmbralesSemaforo.indicador` band
      (verde ≥90%/amarillo ≥60% org default), resolved server-side via `resolverUmbrales`
      exactly like técnico/financiero and exposed as `color_indicador` on
      `GET/PATCH .../indicators` (never hardcoded in the component); tab is the 2nd one
      (right after Resumen, matching v6), not appended at the end; `A{n}` activity codes
      are sequential across the whole project, not reset per meta. Slice A (semáforo band +
      settings backward-compat + server-side color): commit `4285ec2`. Slice B (read-only
      `metas-tab.tsx`): commit `46a84d3`. Slice C (Editar avance wiring + workspace mount):
      commit `66d7fec`. All three on `local/todo-integrado`, no push. Full suite green
      (166 files / 1573 tests) after Slice C.
- [x] **F1.5** — Umbrales del semáforo editables en Administración. `UmbralesSection`
      gained the `indicador` band (verde/amarillo, %) editing inputs, mirroring the
      server-side coherence check (`indicador.amarillo ≤ indicador.verde`, same message
      as `route.ts:189-195`); round-trips through the existing GET/PUT
      `/api/v1/settings` unchanged — no server-side files touched. Strict TDD: RED (4/8
      tests failing) → GREEN (8/8 passing). Full suite green (166 files / 1574 tests).
      Commit `90db05b` on `local/todo-integrado`, no push.
- [x] **F1.6** — Tablero gerencial unificado (`/tablero-gerencial` + `/`) con visualizaciones v6.
      openspec change: `tablero-gerencial-unificado` (proposal/design/tasks written this
      session). `/tablero-gerencial` now `permanentRedirect()`s (308) to `/?cara=management`
      instead of rendering `TableroGerencialClient` (deleted); the 5.ª cara `CaraGerencial`
      is the one surviving implementation, enriched with radar multi-eje (5 axes: técnico,
      financiero, indicadores, cronograma, entregables — D1 default), per-project
      cronograma/entregables bars (`por_proyecto[]`, no more single aggregated bar),
      "Semaforización territorial" (`por_territorio[]`, colors always against the org
      umbral, never a per-project override — D6), Línea/Territorio filters kept LOCAL to
      `cara-management.tsx` (never lifted into the shared `DashboardFilters` — D2), nav
      highlighting fixed via a `cara` query-param match on `isNavActive` (D3), and a
      doble-conteo warning when `indicadores_beneficiarios_count > 1`. D4/D5 (Visualizador
      landing + hiding the nav item) stayed explicitly out of scope, as designed.
      Slice A (route unification): `86682c9`. Slice B (endpoint filters + breakdowns):
      `91cee6c`. Slice C (radar/bars/territorial/filters/warning): `8947e48`. Slice D
      (print mirror + legacy cleanup): `f13cf29` + `befa554`. All five on `local/todo-integrado`,
      no push. Full suite green: 166 files / 1600 tests (baseline 166/1574; net +26 new
      tests from this change — two transient full-suite flakes in unrelated files during
      verification were reproduced as false alarms: a clean third run and isolated re-runs
      of every flagged file were 100% green).

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

### F1.1 (2026-09-25)
OpenSpec change `proyecto-financiero-tab` (proposal/design/tasks already written this
session) applied phase-by-phase, strict TDD (RED confirmed before every GREEN):

- **Phase 1** — `useBudget(projectId)` + `Budget`/`RubroBudget` DTOs in
  `src/hooks/projects.ts`. RED: 3 new tests in `projects.test.ts` failed
  (`useBudget is not a function`). GREEN: implemented, mirroring `useProjectDashboard`
  (not `useGoals` as design.md assumed — see deviation below). `npx vitest run
  src/hooks/projects.test.ts` → 20/20 passed.
- **Phase 2** — D-FIN1 threshold default. RED: updated `catalogs.test.ts`'s financiero
  assertion to v6 cuts, confirmed failing against the old defaults (85/115/60/140).
  GREEN: updated `UMBRALES_SEMAFORO_DEFAULT.financiero` in `src/lib/catalogs.ts` to
  `{ verde_min: 0.8, verde_max: 1.05, amarillo_min: 0.6, amarillo_max: 1.2 }` (tecnico
  untouched). Verified no regression in `semaforo.test.ts` (uses its own local fixture,
  not the default), `settings/route.test.ts`, `dashboard/projects/route.test.ts`,
  `tacometro.test.tsx`, `budget/route.test.ts` — all green.
- **Phase 3** — `tabs/financiero-tab.tsx`. RED: 8 tests in a new
  `financiero-tab.test.tsx` failed (module didn't exist). GREEN: implemented — gauge
  (CSS conic-gradient, no new dependency), semáforo chip + legend, rubro table
  (`overflow-x-auto` wrapper, asignado/ejecutado/diferencia/%/chip columns), alert card
  (one entry per non-verde rubro, static per-color copy). Every color renders
  `color_financiero`/`color_financiero_total` verbatim — zero client-side semáforo
  computation (D1). `npx vitest run .../financiero-tab.test.tsx` → 8/8 passed.
- **Phase 4** — wired into `project-workspace.tsx`: `"financiero"` added to
  `TAB_VALUES`, `TabsTrigger`/`TabsContent` added. RED: 2 new assertions in
  `project-workspace.test.tsx` failed (tab not registered). GREEN: wired, mount-only-
  when-selected confirmed. `npx vitest run project-workspace.test.tsx` → 10/10 passed.
- **Phase 5** — full verification: `npx tsc --noEmit` → 0 errors. `npx eslint` (scoped
  to the 8 touched files) → 0 problems. `npm run test` (full suite) → **160 files /
  1473 tests passed**, 0 failed (vs. F0.2's 159/1460 baseline — net +1 file/+13 tests
  from this change, no regressions elsewhere).
- **Deviations from design.md** (both discovered while reading `budget/route.ts` before
  writing `useBudget`, documented in `tasks.md` too):
  1. `GET /api/v1/projects/:id/budget` has **no envelope key** — the response body
     itself is `{ rubros, proyectado_total, ejecutado_total, color_financiero_total }`.
     `useBudget` mirrors `useProjectDashboard`'s `apiGet<Budget>(...)` direct-return
     pattern, not `useGoals`' `res.metas` unwrap that design.md specified.
  2. `monto_proyectado_cop`/`monto_ejecutado_cop`/`proyectado_total`/`ejecutado_total`
     are typed `number`, not `string` — `round2()` in the route returns a plain JS
     number and `NextResponse.json` serializes it as a JSON number, never a
     Decimal-as-string as design.md's Data Model section assumed.
  Neither deviation changes behavior or scope — both are corrections to design.md's
  DTO shape based on the actual route implementation, confirmed by reading
  `budget/route.ts` and its existing test file.
- Not done in this session: the 390px-viewport dev-server visual check called out in
  tasks.md 3.3 — the horizontal-scroll wrapper is covered by an automated test
  (`overflow-x-auto` assertion) and the tab has no interactive controls to violate the
  44px touch target, so this is a non-blocking follow-up, not a gap in the delivered
  behavior.
- Commit: `14ce6db` — `feat(proyectos): add Financiero tab with budget hook and D-FIN1
  thresholds` (8 files changed, 572 insertions(+), 34 deletions(-): `hooks/projects.ts`
  + `.test.ts`, `lib/catalogs.ts` + `.test.ts`, `tabs/financiero-tab.tsx` + `.test.tsx`
  added, `project-workspace.tsx` + `.test.tsx`).
  `CLAUDE.md` and other unrelated untracked files (HANDOFF, PENDIENTES-MENORES, the zip,
  `scripts/seed-proyectos-demo.ts`, other `odd/tasks/*.md`, `.codegraph/`) intentionally left
  unstaged per task scope.

### F1.2 (2026-09-28)
- Commits: `a06ce4d` (schema + migration + API + hooks), `c86b532` (tab + dialog + workspace wiring).
- Route: phases 1–3 inline (finishing a prior agent's work); phase 4 delegated (writer trigger: 4+ non-trivial files).
- RED→GREEN: legalizacion-tab 0/10→10/10, expense-dialog 0/5→5/5, project-workspace 10/12→12/12;
  expenses routes + hooks 50/50.
- `npx tsc --noEmit`: 0 errors. eslint (touched files): 0 problems.
- Full suite: 1501/1503. The 2 failures are `prisma/invariant.test.ts`, which loads root `.env`
  (REMOTE shared DB, rollback-only transactions) and fails because the new columns are not there.
- Deviation: migration `20260928120000_legalizacion_gasto` generated offline with
  `prisma migrate diff` — local `supabase_db` was down and Windows-side `npx` does not inherit
  WSL env (prisma.config.ts fell back to remote `.env`). Must be applied locally before e2e.
- Deviations vs v6: native `<select>` for Rubro/Soporte; `min-h-11` (44px) targets; full-word
  table headers. Task 4.7 (390px manual check) verified structurally only, not in a browser.

### F1.6 (2026-09-28)
- Slice A (route unification): `86682c9`. RED→GREEN per work unit — redirect page test
  (0/1→1/1), `nav.test.ts` (10/12→12/12), `sidebar.test.tsx` (4/6→6/6, one assertion
  loosened to match design.md D3's own documented gap: "Inicio" and "Tablero Gerencial"
  both highlight while on `/` per the design's explicit "no other nav item currently
  needs it"), `dashboard-page.test.tsx` (8/10→10/10).
- Slice B (endpoint): `91cee6c`. `dashboard/projects/route.test.ts` 29/29→41/41 (12 new:
  filter validation/narrowing, `por_proyecto[]`/`por_territorio[]` shape, D6's
  org-umbral-always rule). Endpoint went from 2 to 4 `db.$queryRaw` calls per request
  (file's own invariant comment updated). `ProjectDashboard.por_proyecto`/`por_territorio`
  added as OPTIONAL fields (not required) so every pre-existing fixture across
  `kpi-cards.test.tsx`/`curve-s-chart.test.tsx`/`projects.test.ts` stayed valid untouched.
  New `ManagementDashboardFilters` type (in `hooks/dashboard.ts`) keeps `linea_estrategica`/
  `territorio` OUT of the shared `DashboardFilters` the other 4 caras use (D2).
- Slice C (`cara-management.tsx`): `8947e48`. 6/14→14/14. Radar axis math extracted into a
  pure, separately-tested `buildRadarAxes()`. Territorio filter implemented as a free-text
  input, not a chip catalog — `Proyecto.territorio` is a free string with no catalog
  (design.md's own "Assumptions Taken"), so a fixed chip list isn't representable.
- Slice D (print + cleanup): `f13cf29` (delete `tablero-gerencial-client.*`) + `befa554`
  (print mirror + reworded stale comments in `curve-s-chart.tsx`/`kpi-cards.tsx` that named
  the deleted file, no behavior touched). No pre-existing automated test covered
  `print-dashboard.tsx`; verified by `tsc`/`eslint`/code review only.
- Phase 5: `npx tsc --noEmit` 0 errors. `npx eslint` on every touched file (22 files across
  all 4 slices) — 0 problems. Full suite: 166/1600 green (see F1.6 checklist entry above
  for the flakiness note).

## Next step
F1.6 done (local commits `86682c9`, `91cee6c`, `8947e48`, `f13cf29`, `befa554`; no push).
F0–F1 (F1.1–F1.6) are now all complete on `local/todo-integrado`. Pending, carried forward
from earlier sessions and still unresolved:
- Archive the `oportunidades-comerciales` openspec change, pending user OK.
- Split `local/todo-integrado` (many commits ahead of `main`) into reviewable PRs — not
  attempted this session (out of scope for a single ODD task; needs an explicit chain/
  stacked-PR decision from the user per the delivery-strategy contract).
- Manual 390px-viewport checks across Legalización/Soportes/Metas AND the new tablero
  gerencial sections (filter row, per-project bars, territorial list) — only verified
  structurally (responsive utility classes, `overflow-x-auto`, `flex-wrap`), never in an
  actual browser this session.
- No new F0/F1 task is open; the next work item is either a fresh feature request or the
  PR-splitting/archival housekeeping above, both of which need explicit user direction
  before proceeding.
