# Muttu Hub v2 — Projects module (RF v2.0) + Clients gaps — Spec-Driven Development document

## 0. Header

| Field | Value |
|---|---|
| Status | **SDD RE-SCOPED FOR A DIRECT IMPLEMENTATION — nothing implemented yet**. No code, schema, migration or data changed by this document. |
| Date | 2026-09-29 (re-scoped 2026-09-30) |
| Author | Single SDD writer (delegated), for user `agutierrezreginodev` |
| Backbone | `odd/tasks/v2-projects-and-clients-plan.md` (slice IDs S0–S10 and task IDs kept stable) |
| PO sources | RF v2.0 Módulo Proyectos (2026-09-28) → scratchpad `rf.txt`; Estructura del detalle técnico y financiero v1.0 → scratchpad `est.txt`; RF Detalle de Cliente (2026-09-10) → scratchpad `clientes.txt` (scratchpad = `/tmp/claude-1000/-mnt-c-Users-Adrian-Documents-MuttuHub-CRM/271358b0-5ea7-45e9-96f6-1ae64377aa25/scratchpad/`; the originals are the `.docx` files in `~/Downloads`) |
| Branch | `feat/projects-v2`, created from `main` (`11e9bc1`). The v1 Projects module was never shipped: `main` has no projects models or migrations and production has 0 rows in proyectos/metas/actividades. |
| Artifact store | This file (openspec-style content in one ODD feature document). Engram mirror: topic `odd/v2-projects-sdd/tasks` (to be created by the orchestrator, not by this writer). |
| TDD | Strict TDD ON. Runner `npx vitest run <file>`; full suite `npx vitest run`; typecheck `npx tsc --noEmit`; lint `npx eslint <files>` |

### 0.1 Branch strategy note (resolved)
The user resolved **D-01 on 2026-09-30**: the v2 work is developed directly on `feat/projects-v2`, branched
from `main` (`11e9bc1`). The v1 Projects module was never shipped, so there is no base to wait for and no
`feat/v6-visual-alignment` dependency. V2 work never lands on `feat/v6-visual-alignment` itself (another writer
is active there).

### 0.2 How to read this document
1. Section 1 is enough to start tomorrow morning.
2. Sections 2 (proposal) and 3 (delta specs) say WHAT; section 4 (design) says HOW; section 5 is the executable
   task list (each task self-contained: files, RED tests, commands, acceptance, commit message).
3. Section 6 is the release/verification gate list; section 7 the risk/assumption/decision registers and the
   Spanish questions for the PO; section 8 the appendix (fixtures, template map, matrix, glossary).
4. Evidence tags used everywhere:
   - **VERIFIED** — checked in the repo on 2026-09-29 (path/line cited).
   - **PO-C / PO-P / PO-PEND** — PO status Confirmado / Propuesto / Pendiente (RF v2.0 §0).
   - **USER-RESOLVED** — decision taken by the user on 2026-09-29, still "to confirm with PO".
   - **ASSUMPTION A-nn** — our default where the PO source is silent; registered in §7.2 with how to falsify it.
   - **UNVERIFIED** — could not be checked from the repo; a task exists to verify it.
5. PO rule (RF v2.0 §0): never close a Pendiente item without confirmation. Propuesto items are designed and
   built behind admin-editable parameters or clearly labelled defaults, never presented as final.

### 0.3 Glossary (domain terms; Spanish terms are kept verbatim in UI copy — see §8.4)

| Term | Meaning in this document |
|---|---|
| **A** (Asignado vigente) | Assigned budget of a rubro in the current (vigente) version (est §4.5). |
| **P** (Programado acumulado) | Σ monthly programming of the rubro from the first period up to and including the cut-off period. |
| **E** (Ejecutado validado acumulado) | Σ **validated** expenses (`estado = VALIDADO`) of the rubro with `periodo ≤ corte`. |
| **D** (Diferencia) | E − P. Negative = spent less than programmed. |
| E/P, E/A | Percent executed vs programmed / vs assigned, shown with one decimal, half-up rounding. |
| tol (tolerancia financiera) | Yellow band width above P for the financial semáforo (placeholder 10 %). |
| **Objetivo** (específico) | OE1..OEn; replaces v1 `Meta` (USER-RESOLVED DP-01: Meta = Objetivo específico). |
| **Actividad** | Schedule item in relative weeks (`semana_inicio..semana_fin`), code `1.1`, belongs to one Objetivo. |
| **Entregable** | Simple measurable goal of an activity (`1.4-E1`), `cantidad_meta > 0`, `unidad`, `tipo_medio_exigido`. |
| **Avance** | Quantity achieved for an Entregable at a date, with ≥ 1 medio de verificación to count (PO-P). |
| **Medio de verificación** | File or https link supporting an Avance or a Medición. |
| **Indicador de resultado / Medición** | Result indicator on an Objetivo; dated measurement history. |
| **Rubro** | Budget category from the single catalog R01–R15 (codes PO-P). |
| **Programación** | Monthly (`AAAA-MM`) programmed amount of a rubro. |
| **Gasto** | Legalized expense document: Registrado → Validado / Rechazado. |
| **Línea base / versión 0** | The frozen snapshot approved by Gerencia; project moves Borrador → En ejecución. |
| **Versión N** | Snapshot created when a modification request is approved. |
| **Solicitud de modificación** | Request of type traslado / adición / reducción / reprogramación / cronograma / entregables. |
| **Corte** | Cut-off: a period `AAAA-MM` (financial) or a date `AAAA-MM-DD` (technical). |
| **Gerente** | Role GERENCIA (+ ADMINISTRADOR) — USER-RESOLVED N-01. |
| **Gestor / Ejecutor** | COORDINADOR who is a member of the project team — USER-RESOLVED N-01/N-20. |
| **Visualizador** | Any user with `puede_ver_tablero_gerencial = true` who is not ADMINISTRADOR/GERENCIA. |
| pp | Percentage points (technical deviation unit). |

### 0.4 Revision
2026-09-30 — re-scoped for a direct implementation; the v1 module was never shipped, so the coexistence
apparatus (flag, expand/backfill/switch/contract, v1 test retirement, S9.6) was removed; ODD-01..ODD-04 in
`odd/tasks/v2-projects-execution.md`.

2026-09-30 (second pass) — recalibrated the document against `main` @ `11e9bc1`. Two assumptions were still
stale and are now corrected throughout: (1) the **projects tables do not exist** on `main` (no `Proyecto`,
`Actividad`, `Meta`, `Indicador`, `SoporteProyecto`, `Rubro`, `LineaPresupuestal` or `Gasto` model), so every
projects table is **created new** and nothing is "extended" except `Notificacion` and `TipoNotificacion`;
(2) there is **no legacy project data**, so the requirements and decision rows that existed only to convert it
(REQ-BUD-04/05, REQ-GAS-07, N-09, N-12, N-14, N-16, N-17, N-18, A-15) were rewritten or retired.
The normative source for tasks stays §5.

## 1. Executive summary and "Start tomorrow" checklist

### 1.1 Executive summary
The v1 Projects module was **designed from RF v1.0** (Proyecto → Meta → Actividad with one planned date,
LineaPresupuestal, Gasto without validation, bidirectional financial semáforo) but was **NEVER shipped**: `main`
has no projects models in `prisma/schema.prisma`, no projects migrations, and production has 0 rows in
proyectos/metas/actividades (the v1 code lives only in unmerged local branches and is being abandoned). RF v2.0
(PO, 2026-09-28) is therefore implemented **directly** as the only Projects model that ever exists in code:
Objetivo → Actividad in relative weeks → Entregable → Avance → Medio de verificación; result indicators with
measurement history; budget per rubro (A) with monthly programming (P); validated expenses (E) with an
optimal-spend semáforo; Excel template import (atomic, V-01..V-14); baseline approval by Gerencia and versioned,
approved modifications; append-only audit. The Clients requirements (RF-C01..C04, RNF-C01..C02) are mostly already
implemented; three gaps remain (RF-C04 prefill in one step, RNF-C01 panel separation, RNF-C02 assigned-only
visibility).

We deliver this **incrementally** in 11 slices (S0–S10, **66 tasks** after splitting every L task and
removing the five tasks that only existed to manage v1↔v2 coexistence or v1 data migration, §5.13). The v2 module
ships directly against `main` from `feat/projects-v2`: there is no flag, no dual code path and no v1→v2 data
migration. All local data work runs only against the local Docker database (`.env.local`, localhost guard);
promotion to the remote Supabase is a separate, human-run step.

Key fixed decisions (USER-RESOLVED 2026-09-29, to confirm with PO): Meta = Objetivo; only GERENCIA and
ADMINISTRADOR manage projects; COORDINADOR = executor on member projects (many-to-many team); validation by
GERENCIA/ADMINISTRADOR, never by the registrant; overspend blocks validation and alerts Gerencia; optimal-spend
semáforo with tolerance 10 % reproducing the PO example exactly; several strategic lines with one principal;
one-step project creation from a GANADA opportunity; rubro catalog = R01–R15 only; uploads ≤ 25 MB, light
office/image types, never deleted. (The two decisions about legacy projects and legacy expenses are moot on the
direct path: there is no v1 data to convert.)

Two findings discovered while writing this SDD that change the plan:
1. **Hosting upload limit (UNVERIFIED, high impact).** The app is deployed on Vercel (VERIFIED `README.md:14`).
   Vercel functions document a ~4.5 MB request-body limit, and the remote bucket `muttu-docs` is configured at
   10 MB (VERIFIED `docs/plan-supabase-manana.md:53`). Raising uploads to 25 MB through a route handler will not
   work on production as-is → new tasks **S0.8** (verify) and **S0.9** (25 MB policy + direct-to-storage signed
   upload if confirmed).
2. **Inconsistent current limits.** `src/lib/api/files.ts:9` = 10 MB (documents, project supports) while
   `src/app/api/v1/tasks/[id]/attachments/route.ts:32-40` already defaults to 25 MB via `MAX_FILE_SIZE_MB`.

### 1.2 Start tomorrow — first 90 minutes

**Step 1 — environment sanity (≈15 min).** All commands from the repo root
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM`. Never run a DB command without `.env.local`.

```bash
git status --short
git log --oneline -1                    # expect the current feat/projects-v2 HEAD
# 1. Prove .env.local points to the local Docker DB (prints host only, never credentials):
node --env-file=.env.local -e "console.log(new URL(process.env.DATABASE_URL).host)"   # expect 127.0.0.1:54322
node --env-file=.env.local -e "console.log(new URL(process.env.DIRECT_URL).host)"     # expect 127.0.0.1:54322
# 2. Local Supabase reachable.
#    WSL note (VERIFIED 2026-09-30): Docker Desktop's WSL integration is NOT active in this distro — `docker`
#    is not on PATH, `supabase status` fails with a container-health error, and 127.0.0.1:54322 is unreachable
#    FROM WSL even though the stack runs on Windows. Enable Docker Desktop -> Settings -> Resources ->
#    WSL integration, or run every DB command from the Windows side (cmd.exe / powershell.exe).
supabase status
# 3. Migration state of the LOCAL DB only.
#    Fixed 2026-09-30 (commit 96c4c5c): `prisma.config.ts` no longer loads `.env` — the shared production
#    instance — and `prisma/require-local-db.ts` refuses any non-loopback target. Use the db:*:local scripts;
#    they invoke Prisma through `node --env-file=.env.local`, never through `npx`.
npm run db:migrate:status:local        # -> at "127.0.0.1:54322"
```
Stop if any host is not `127.0.0.1`/`localhost` — do not "fix" it by editing `.env`.

**Step 2 — baseline checks (≈25 min).**
```bash
# Move aside any stale .next/ produced by another branch's dev server BEFORE tsc, or it reports phantom
# TS2307 errors for routes that do not exist here (27 of them on 2026-09-30, inherited from the v6 branch).
npx vitest run --pool=threads     # baseline 2026-09-30: 115 files / 1027 tests, ALL GREEN
npx tsc --noEmit                  # baseline 2026-09-30: 0 errors
npx eslint src/lib/permissions.ts src/lib/api/files.ts   # src/lib/semaforo.ts does not exist on this branch
```
Record in §6.7 "Progress / Evidence": total tests, failures, tsc result.
`prisma/invariant.test.ts` does NOT exist on this branch (it belonged to the abandoned chain), so a green suite
is the expected baseline. Any failure = pre-existing; list it under "Known environmental failures" before
writing code.

**Step 3 — branch (≈5 min, resolved, see §0.1).**
```bash
git switch feat/projects-v2      # already created from main (11e9bc1)
```

**Step 4 — first three tasks (rest of the morning).** Order: **S0.5 → S0.4 → S0.6** (all decision-free).

| # | Task | First RED test to write | Command |
|---|---|---|---|
| 1 | S0.5 weeks + money pure libs | `src/lib/proyectos/weeks.test.ts` → `it("week n starts at fecha_inicio + 7(n−1) days and ends at fecha_inicio + 7n − 1 days")` | `npx vitest run src/lib/proyectos/weeks.test.ts` |
| 2 | S0.4 append-only AuditoriaCambio | `src/lib/api/audit-cambios.test.ts` → `it("diffFields returns one entry per changed field with before and after values")`; live DB: `prisma/auditoria-cambios.invariant.test.ts` → `it("rejects UPDATE on auditoria_cambios with the append-only trigger")` | `npx vitest run src/lib/api/audit-cambios.test.ts` |
| 3 | S0.6 migration safety kit | `scripts/migrate-v2/_guard.test.ts` → `it("aborts before importing the db client when DATABASE_URL is not loopback")` | `npx vitest run scripts/migrate-v2/_guard.test.ts` |

Full RED→GREEN→REFACTOR detail per task is in §5. After these three: S0.1, S0.7, S0.8, then S1.x.

## 2. Proposal

### 2.1 Intent
Make the Projects section of the Muttu Hub the single source of truth for the technical and financial follow-up
of social-impact projects as specified by the PO in RF v2.0 and the Estructura document, and close the residual
Clients/Opportunities gaps — without a big-bang rewrite and without data loss.

### 2.2 Problem
Nothing of the v1 Projects module exists in this branch. `main` has no projects models in
`prisma/schema.prisma`, no projects migrations, and no projects code at all: `src/lib/semaforo.ts`,
`src/lib/api/projects.ts`, `src/app/api/v1/projects/**` and `src/components/proyectos/**` are all absent
(VERIFIED 2026-09-30 on `main` @ `11e9bc1`), and production has 0 rows in `proyectos`/`metas`/`actividades`.
The v1 model described below therefore lives only in abandoned local branches. It is the design we are
**replacing before it ever ships** — not a model to migrate, and not a module users have today.

Contrast that motivates each v2 decision (citations point at the abandoned branches unless noted):
- RF v1.0 shape: `Meta`, `Actividad.fecha_planificada` (single date), `Actividad.peso Int @default(1)`,
  `porcentaje_avance` typed by hand, `LineaPresupuestal` (no programming), `Gasto` without validation states,
  `Indicador.valor_actual` (no history), `Proyecto.territorio String` and a single `linea_estrategica` enum.
- The financial semáforo is bidirectional (`semaforo.ts:47-52` on the abandoned branches), which contradicts
  the confirmed optimal-spend criterion (RF v2.0 §1.4, RF-24).
- COORDINADOR has global write authority over every project: `MANAGE_ANY_ROLES` (`src/lib/permissions.ts:11-15`
  — this file DOES exist on `main`), composed by `canManageProject` and `canCreateProject`, contradicting the
  resolved role model.
- Audit is best-effort and not append-only (`src/lib/api/audit.ts` swallows errors — this file DOES exist on
  `main`; model `Auditoria` has no before/after per field) — gap vs RF-04, RNF-05.

Consequence for every task below: anything under `projects/`, `proyectos/` and `semaforo*` is **created new**
by this plan, not extended. A file listed without "NEW" in §4.3 exists on `main` only if it is one of the
platform files (permissions, audit, settings, catalogs, uploads, openapi); all projects models, routes,
components and pure libraries are new.

### 2.3 Scope
**IN**
- RF-01..RF-36, RNF-01..RNF-07 (Alta first, Media after) of RF v2.0, the entity model, template, V-01..V-14,
  versioning and audit of the Estructura document.
- Residual Clients gaps: RF-C04 (one-step conversion with prefill), RNF-C01 (projects vs opportunities in the
  general panel), RNF-C02 (executors see only assigned active projects).
- Unified upload policy (≤ 25 MB, light office/image types, soft-delete only) for ALL uploads (user wording
  "25mb o menos, para los archivos"), gated by the hosting/bucket verification S0.8.
- Removal of territorial semaforización (RF v2.0 §2).
- Re-plan of held visual tasks (S10).

**OUT** (RF v2.0 §10.2 future, or not requested)
- DIAN XML invoice reading; accounting integration; S-curve and financial close projection; per-type templates.
- Notifications in general (RF v2.0 §10.2). **Exception (USER-RESOLVED DP-11):** the overspend notification to
  Gerencia is IN. The delay alert is visual only (no notification).
- External (client/funder) access to the Hub; they receive exported reports only (RF v2.0 §2, §3).
- Replacement for territorial semaforización (municipios become informative only).
- Personal data of beneficiaries (count only, RF-11).

### 2.4 Success criteria
1. Every RF/RNF/RF-C row maps to a task whose acceptance evidence is recorded (§3.18, §6).
2. The PO's illustrative financial example reproduces **exactly** (all nine figures and both colors) in an
   automated golden test (§3.8, §8.1).
3. An Excel template generated by the Hub for a Borrador project, filled with the CedeTextil structure, imports
   atomically; any single V-rule violation imports nothing and reports sheet/row/column/rule (§3.10).
4. A project can go Borrador → baseline v0 → modification v1 → comparison v0 vs vigente with every step in the
   append-only audit (§3.11, §3.16).
5. No agent-run command ever touches the remote `.env` database; every local data script has a recorded dry-run.
6. The full suite is green at each slice close (except the pre-existing known failure, until it is fixed separately).
7. Management dashboard KPIs answer in < 3 s with the demo dataset × 10 projects (RNF-02, §3.17).

### 2.5 Non-goals
- No new role enum value (Gerente maps to GERENCIA; no financial role — USER-RESOLVED DP-02).
- No redesign of Clients/Opportunities screens beyond the three gaps.
- No generic workflow engine; modification approval is a fixed state machine.
- No offline/mobile app; mobile = responsive web capture of progress and expenses (RNF-01 PO-P, S10.3).
- No automatic "fix" of storage orphans; they are reported only.

### 2.6 Approach summary
- **Additive schema first** (new tables and nullable/defaulted columns, composite `[id, proyecto_id]` FKs, CHECKs
  in SQL). Reuse existing tables where the concept is the same and it avoids moving FKs or storage objects
  (`Actividad`, `LineaPresupuestal` as "PresupuestoRubro", `Gasto`, `Indicador`, `SoporteProyecto`, `Rubro`).
- **Pure domain libraries** under `src/lib/proyectos/` (weeks, money, avance, ficha financiera, semáforo v2,
  KPIs, versioning diff, template validators) — framework/DB-free like `src/lib/permissions.ts`, tested first.
- **Integer-cent money math** in pure libs (bigint), `Decimal(15,2)` in the DB (RNF-06).
- **Append-only audit** `auditoria_cambios` with DB trigger, written inside the same transaction as the business
  write (not best-effort).
- **Snapshot versioning** (JSONB) per RF v2.0 §10.3.
- **Precomputed KPI cache** per project (RF v2.0 §10.3, RNF-02).

### 2.7 Rollback plan
| Phase | Rollback |
|---|---|
| Additive migration merged | Nothing to roll back functionally; schema rollback = a new down-migration only if a column blocks something (never drop data columns before they are unused). |
| Local data script applied | Scripts are idempotent and each writes a `migracion_v2_lote` id; rollback = re-run with `--revert <lote>` (only removes rows created by that lote). Local DB can always be rebuilt with `supabase db reset` + seed. |
| Remote promotion (human) | Pre-promotion `pg_dump` of the remote DB (checklist S0.6); restore = human decision. |

### 2.8 Delivery strategy
- Chained PRs, one reviewable work unit each; **~400 authored changed lines per PR is an advisory review budget,
  not a cap** (additions + deletions, generated files and lockfiles excluded). A correct solution that exceeds it
  is explained in the PR, not artificially split.
- Delivery strategy: `ask-on-risk` (cached from the plan). Chain strategy (`stacked-to-main` vs
  `feature-branch-chain`) is **not chosen yet** → asked once before the first slice that exceeds the budget.
- Work-unit commits: behavior + its tests + docs in the same commit; Conventional Commits
  (`feat(projects): …`, `test(projects): …`, `chore(db): …`, `docs(odd): …`); **no `Co-Authored-By` and no AI
  attribution lines** (user rule, overrides any tool default).
- Reviewer-friendly order inside a slice: schema/migration → pure lib → API → UI → data script.
- Native review (RDD) per work-unit commit under the user-owned switch; the assessed tier and outcome are
  recorded in §6.7.

### 2.9 Affected areas

Nothing under `projects/`, `proyectos/`, `rubros/`, `dashboard/projects/` or `semaforo*` exists on `main`
(§2.2): those paths are NEW on this branch even where the table does not repeat the marker. Everything else
listed below exists on `main` unless marked NEW.

| Area | Paths (see the note above) | Change |
|---|---|---|
| Schema & migrations | `prisma/schema.prisma`, `prisma/migrations/**` (NEW migrations `2026100x…_v2_*`) | Additive models/columns, CHECKs, triggers |
| Permissions | `src/lib/permissions.ts`, `src/lib/api/projects.ts`, `src/components/proyectos/project-list.tsx`, `src/app/api/v1/projects/route.ts`, `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts`, `src/app/api/v1/dashboard/projects/route.ts`, `src/lib/openapi/paths/projects.ts`, `src/lib/openapi/paths/dashboard-admin.ts` | Project-specific predicates; COORDINADOR removed from project management; membership visibility |
| Audit | `src/lib/api/audit.ts` (kept), NEW `src/lib/api/audit-cambios.ts` | Append-only change log |
| Settings / flags | `src/lib/settings.ts`, `src/app/api/v1/settings/route.ts`, `src/lib/catalogs.ts` | Semáforo params v2 |
| Pure domain libs | NEW `src/lib/proyectos/*.ts` | weeks, money, avance, ficha, semáforo v2, kpis, template |
| Semáforo | NEW `src/lib/proyectos/semaforo-v2.ts` | v2 technical and optimal-spend semáforo; there is no v1 semáforo library in the branch |
| Files | `src/lib/api/files.ts`, `src/app/api/v1/tasks/[id]/attachments/route.ts`, `src/app/api/v1/documents/route.ts`, `src/app/api/v1/projects/[id]/attachments/route.ts`, `src/components/proyectos/soporte-dialog.tsx`, `src/components/documents/upload-dialog.tsx` | 25 MB unified policy, type allowlist, signed upload |
| Project API | `src/app/api/v1/projects/**` (15 route files), NEW sub-routes (§4.8) | v2 endpoints |
| Catalog API | `src/app/api/v1/rubros/**`, NEW `src/app/api/v1/strategic-lines/**`, NEW `src/app/api/v1/municipalities/**` | Catalog rules (suspend-not-delete) |
| Opportunities | `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts`, `src/components/crm/entity-dialogs.tsx` | One-step GANADA → project with prefill |
| Dashboards | `src/app/api/v1/dashboard/projects/route.ts`, `src/app/(app)/tablero-gerencial/page.tsx`, `src/components/dashboard/cara-management.tsx`, `src/components/dashboard/kpi-cards.tsx` | v2 KPIs, remove territory |
| UI | `src/components/proyectos/**`, `src/hooks/projects.ts`, `src/app/(app)/proyectos/**` | v2 screens (S10 styling) |
| Notifications | `prisma/schema.prisma` (`TipoNotificacion`, `Notificacion`), `src/app/api/v1/notifications/**` | Overspend notification type |
| Scripts | `scripts/seed-proyectos-demo.ts`, `prisma/seed.ts`, NEW `scripts/migrate-v2/**` | Guarded backfills, v2 demo data |
| Specs/docs | `openspec/changes/{proyecto-financiero-tab,proyecto-legalizacion-tab,proyecto-metas-tab,proyecto-soportes-tab,tablero-gerencial-unificado,admin-umbrales-editables}` | Marked superseded by v2 (S0.1) |

## 3. Specs (delta specs)

### 3.0 Conventions
- Requirement IDs `REQ-<CAP>-nn` are stable; each is tagged `[src: …]` (PO IDs) and `[impl: …]` (task IDs).
- RFC-2119 keywords: MUST / MUST NOT / SHOULD / MAY.
- Scenarios are Given/When/Then; each scenario becomes at least one `it()` in the implementing task (§5).
- "Actor" shorthands: **ADM** = ADMINISTRADOR, **GER** = GERENCIA, **COORD-M** = COORDINADOR member of the
  project team, **COORD-X** = COORDINADOR not a member, **COLAB** = COLABORADOR without flag, **VIS** =
  Visualizador (flag `puede_ver_tablero_gerencial`, not ADM/GER). A user may be COORD-M and VIS at once: the
  union of permissions applies, except that VIS never widens write authority.
- Spanish strings inside quotes are the exact UI/API copy (the app's UI and API messages are Spanish — VERIFIED
  e.g. `src/app/api/v1/projects/route.ts:31-45`).
- These are **delta specs** against `openspec/specs/{project-access-control,project-budget,project-schedule,
  project-tracking,project-attachments,management-dashboard}` — the v1 project specs created by the abandoned
  `tablero-seguimiento-social` change. Those specs do not exist on `main`; this document is therefore the
  definitive specification of these capabilities, not a delta against them.

### 3.1 Capability ACC — Access and roles
[src: RF-36, RF v2.0 §3, DP-02, DP-06, N-01, N-20, RNF-03, RNF-C02] [impl: S0.7, S2.6, S6.5]

**Permission matrix (target, v2).** ✓ = allowed, — = denied (403, or 404 when the project must not be revealed),
"own" = only on projects where the actor is a team member.

| # | Action | ADM | GER | COORD-M | COORD-X | COLAB | VIS |
|---|---|---|---|---|---|---|---|
| P01 | List/see projects (portfolio) | all | all | own | — | — | all (read) |
| P02 | See project ficha (general, technical, schedule) | ✓ | ✓ | own | — | — | ✓ |
| P03 | See financial ficha (aggregates A/P/E/D) | ✓ | ✓ | own | — | — | ✓ |
| P04 | See/download individual financial supports and third-party IDs | ✓ | ✓ | own | — | — | — (RNF-03) |
| P05 | Create project (either origin) | ✓ | ✓ | — | — | — | — |
| P06 | Edit general data / structure / budget / programming in Borrador; import template | ✓ | ✓ | — | — | — | — |
| P07 | Manage team members | ✓ | ✓ | — | — | — | — |
| P08 | Approve baseline (Borrador → En ejecución) | ✓ | ✓ | — | — | — | — |
| P09 | Register avances, medios, mediciones, beneficiarios (En ejecución) | ✓ | ✓ | own | — | — | — |
| P10 | Register expense with supports (En ejecución) | ✓ | ✓ | own | — | — | — |
| P11 | Validate / reject expense (never own registration) | ✓ | ✓ | — | — | — | — |
| P12 | Request modification | ✓ | ✓ | own (A-01) | — | — | — |
| P13 | Approve / reject modification | ✓ | ✓ | — | — | — | — |
| P14 | Close / suspend / cancel project | ✓ | ✓ | — | — | — | — |
| P15 | Catalogs (rubros, líneas, municipios), semáforo params, feature flag | ✓ | — | — | — | — | — |
| P16 | Export project ficha / financial ficha (PDF, Excel) | ✓ | ✓ | own | — | — | ✓ (no supports, no third-party IDs) |
| P17 | Management dashboard (Tablero gerencial) | all | all | own projects only (A-02) | — | — | all |
| P18 | Void (anular) an avance/medición/beneficiario record | ✓ | ✓ | — | — | — | — |

Notes: RF v2.0 §3 lists the Gestor as creator/loader of projects; the user restricted P05/P06 to ADM/GER
(USER-RESOLVED N-01) — flagged in §7.4 as a confirmation for the PO. RF-05 says "solo el rol Gerente puede
aprobar"; the user maps Gerente = GERENCIA **and** ADMINISTRADOR.

**REQ-ACC-01** Project-management authority MUST be granted only to ADMINISTRADOR and GERENCIA. COORDINADOR MUST
NOT derive any project authority from `MANAGE_ANY_ROLES`. `canManageAny` itself MUST remain unchanged for
clients/tasks/documents (no behavior change outside projects).
- Scenario: *Given* a COORDINADOR who is not a member, *When* they `PATCH /api/v1/projects/:id`, *Then* 403
  `FORBIDDEN` "No tienes permisos sobre este proyecto."
- Scenario: *Given* a COORDINADOR, *When* they `POST /api/v1/projects`, *Then* 403 "No tienes permisos para crear
  proyectos." (behavior change: today 201 — VERIFIED `src/lib/permissions.ts:78-80`).
- Scenario: *Given* a COORDINADOR responsable of a client, *When* they edit that client, *Then* it still succeeds
  (regression guard for `canEditClient`).

**REQ-ACC-02** Project visibility MUST be: ADM, GER, VIS see every non-deleted project; a COORDINADOR sees only
projects where they have an active team membership (ASSUMED visibility — DP-06 PO proposal "solo asignados");
COLABORADOR without flag sees none.
- Scenario: *Given* COORD-A member of P1 only, *When* `GET /api/v1/projects`, *Then* the list contains P1 only.
- Scenario: *Given* COORD-A not member of P2, *When* `GET /api/v1/projects/P2`, *Then* 403 `FORBIDDEN`
  (existence is already public to the actor through ids in links; same NOT_FOUND/FORBIDDEN shape as
  `loadProjectScoped`, VERIFIED `src/lib/api/projects.ts:19-35`).
- Scenario: *Given* a COLABORADOR with `puede_ver_tablero_gerencial = true`, *When* `GET /api/v1/projects`,
  *Then* all projects, read-only (`puede_editar_proyecto = false`).

**REQ-ACC-03** Executor actions (P09, P10, P12) MUST require an active membership and project state
`EN_EJECUCION`; structure actions (P06) MUST require state `BORRADOR` and ADM/GER.
- Scenario: *Given* P1 in `BORRADOR`, *When* COORD-M posts an avance, *Then* 409 `INVALID_STATE` "El proyecto aún
  no tiene línea base aprobada."

**REQ-ACC-04** The expense validator MUST NOT be the user who registered the expense (DP-02).
- Scenario: *Given* GER registered gasto G, *When* GER validates G, *Then* 403 "No puedes validar un gasto que tú
  registraste." and G stays `REGISTRADO`.

**REQ-ACC-05** VIS MUST NOT access individual financial supports or third-party identification numbers
(RNF-03, RNF-04 PO-P), in the UI, the API (signed URL endpoints) or exports.
- Scenario: *Given* VIS, *When* `GET /api/v1/projects/:id/expenses/:eid/attachments`, *Then* 403.
- Scenario: *Given* VIS, *When* exporting the financial ficha, *Then* the file contains rubro aggregates only, no
  `tercero_numero_id` column.

**REQ-ACC-06** The `puede_ver_tablero_gerencial` flag MUST never compose into a write predicate (existing
invariant, VERIFIED `src/lib/permissions.ts:82-89` comment; kept).

**REQ-ACC-07** Team membership MUST be many-to-many (a project has 1..n COORDINADORES; a COORDINADOR has 1..n
projects), soft-removable (`removed_at`), audited; only users with `rol = COORDINADOR` MAY be added as executor
members (ADM/GER already see everything).
- Scenario: *Given* P1, *When* GER adds COORD-A and COORD-B, *Then* both see P1 and can register avances.
- Scenario: *When* GER removes COORD-B, *Then* COORD-B loses access immediately; the membership row keeps
  `removed_at` and the audit shows `EDITAR proyecto_miembro`.
- Scenario: *When* GER tries to add a COLABORADOR as member, *Then* 400 `VALIDATION_ERROR` "Solo un Coordinador
  puede ser integrante del equipo del proyecto."

### 3.2 Capability ORG — Project origin and general data
[src: RF-01, RF-02, RF-11, DP-05, DP-07, N-02, N-03, N-17, RF-C04] [impl: S2.1–S2.4, S2.6]

**REQ-ORG-01** Creation MUST ask the origin: `OPORTUNIDAD` or `INDEPENDIENTE` (RF-01 PO-C).
**REQ-ORG-02** For `OPORTUNIDAD`, only opportunities with `estado = GANADA` and no live project MUST be listed;
creating the project MUST, in one transaction, set the opportunity `fase = EJECUCION` and `fecha_adjudicacion`
(if null), create the project with `cliente_id`, `nombre` and `valor_total` prefilled from the opportunity
(editable before saving), and write audit rows `convertir oportunidad` and `CREAR proyecto` (N-02 USER-RESOLVED,
RF-C04). Relation is 1:1 (DP-07 default, `Proyecto.oportunidad_id @unique` VERIFIED `schema.prisma:559`).
- Scenario: *Given* opportunity O in `GANADA`, `fase = PROSPECCION`, *When* GER creates a project from O, *Then*
  201, O.fase = `EJECUCION`, project.origen = `OPORTUNIDAD`, project.cliente_id = O.cliente_id.
- Scenario: *Given* O in `EN_NEGOCIACION`, *When* creating from O, *Then* 409 `CONFLICT` "Solo se crea un
  proyecto desde una oportunidad en estado Ganada."
- Scenario: *Given* O already has a project, *Then* 409 "Esta oportunidad ya tiene un proyecto." (existing copy,
  VERIFIED route line ~86).
- Scenario: *Given* O already `fase = EJECUCION` (converted with the existing two-step flow) and no project, *Then*
  creation succeeds and does not rewrite `fecha_adjudicacion`.
**REQ-ORG-03** For `INDEPENDIENTE`, the client MUST be chosen from Clientes (id), never free text.
**REQ-ORG-04** General data: código (autogenerated), nombre, cliente, responsable (user), líneas estratégicas
(1..n, exactly one principal), municipios (1..n, informative), fecha_inicio, fecha_fin (> inicio),
duración en semanas (calculated, read-only), valor_total (COP, > 0 before baseline), meta de beneficiarios
(integer ≥ 0 at creation, > 0 required at template import V-03 and at baseline approval).
**REQ-ORG-05** Code MUST be autogenerated `PRY-AAAA-NNN` (AAAA = year of creation, NNN = per-year sequence,
zero-padded to 3, grows to 4+ digits after 999), unique, concurrency-safe (N-03 format, PO-P).
- Scenario: *Given* no 2026 project, *When* two projects are created concurrently, *Then* codes are
  `PRY-2026-001` and `PRY-2026-002` (no duplicate, no gap caused by the race).
- Scenario: *Given* an existing code `PRY-2026-004` (created by an earlier seed or a manual fix), *When* the
  sequence is initialised, *Then* the next code is `PRY-2026-005` (sequence starts at max existing matching NNN).
**REQ-ORG-06** If valor_total differs from the opportunity's `valor_estimado_cop`, the UI MUST show a non-blocking
alert and the difference MUST be persisted (`diferencia_valor_oportunidad`) and audited (RF-02 PO-C).
- Scenario: *Given* opportunity value 245.500.000 and project value 245.450.000, *Then* alert "El valor total del
  proyecto difiere del valor de la oportunidad en $50.000." and saving still succeeds.
**REQ-ORG-07** Duration MUST be `ceil((fecha_fin − fecha_inicio + 1) / 7)` weeks (est §3.1).
**REQ-ORG-08** States: `BORRADOR`, `EN_EJECUCION`, `CERRADO` (PO-C) plus `SUSPENDIDO`, `CANCELADO` (PO-P, kept
because they exist — N-25 default). `CERRADO` and `CANCELADO` projects are read-only. The semáforo is a computed
attribute, never a state (RF v2.0 §5).
**REQ-ORG-09** Changing `fecha_inicio` in `BORRADOR` MUST recompute every activity's dates (RF-07); in
`EN_EJECUCION` it MUST only happen through an approved modification (RF-05, RF-26).

### 3.3 Capability CAT — Catalogs: strategic lines, municipios, rubros
[src: RF-33, RF-34, RF-02, DP-05, N-13, N-21, est §4.1] [impl: S1.1a, S1.1b, S1.2, S1.3, S2.1]

**REQ-CAT-01 Rubro catalog.** The catalog MUST contain exactly the 15 PO rubros with immutable codes
(codes PO-P): R01 Personal, R02 Consultor, R03 Subsidio arriendo, R04 Promoción y divulgación, R05 Alistamiento,
R06 Caracterización, R07 Acompañamiento, R08 Formación, R09 Capital semilla, R10 Viáticos, R11 Varios,
R12 Transporte, R13 Suministros, R14 Oficina, R15 Dotación. Existing rows "Personal" and "Transporte" (VERIFIED
migration `20260918153200_tablero_seguimiento_social/migration.sql:293-298`) get R01/R12. "Material POP" and
"Operación logística" MUST leave the catalog (suspended, not offered to any project, no code) and their existing
amounts MUST NOT be touched until the manual per-project reassignment (N-13 USER-RESOLVED).
- Scenario: *Given* the migrated catalog, *When* `GET /api/v1/rubros`, *Then* exactly 15 active rubros ordered
  R01..R15.
- Scenario: *Given* a project with a LineaPresupuestal on "Material POP", *When* the S1.1b report runs, *Then* it
  lists that project, rubro and amount, and writes nothing.
**REQ-CAT-02** A rubro, strategic line or municipio with associated data MUST NOT be renamed or deleted; it MAY
only be suspended (RF-33 PO-C, RF-34 PO-P). Without data, rename/delete (soft) is allowed. Codes are immutable
always.
- Scenario: *Given* R01 used by a project, *When* ADM `PATCH /api/v1/rubros/:id {nombre: "Talento"}`, *Then* 409
  `CONFLICT` "El rubro tiene datos asociados: no se puede renombrar, solo suspender." (today this succeeds —
  VERIFIED `RUBRO_PATCH_SCHEMA` accepts `nombre`, `src/app/api/v1/rubros/[id]/route.ts:22-29`).
- Scenario: *Given* R01 used, *When* `DELETE`, *Then* 409 with the same rule (today soft-deletes, line 80).
- Scenario: *When* ADM suspends R14, *Then* new projects do not get R14; projects that already have an R14 row keep
  it (RF-33 last criterion PO-P).
**REQ-CAT-03 Strategic lines.** A catalog table MUST be seeded with the 8 RF-02 values (Empleabilidad,
Emprendimiento, Productividad, Cultural, Social, Cívico-político, Método Muttu, Ambiental — VERIFIED enum
`LineaEstrategica`, `schema.prisma:102-111`), administrable by ADM with REQ-CAT-02 rules. A project MUST have
1..n lines and exactly one principal (DP-05 USER-RESOLVED). Dashboards count by principal only.
- Scenario: *When* saving a project with two lines and none principal, *Then* 400 "Marca una línea estratégica
  como principal."
**REQ-CAT-04 Municipios.** A catalog table (nombre, departamento, optional código DANE) administrable by ADM with
REQ-CAT-02 rules; a project MUST have ≥ 1 municipio (est §3.1 "Oblig. Sí"); informative only — no semáforo by
municipio (RF v2.0 §2). Catalog source is open (N-21): default = curated list seeded from the manually normalised
legacy `territorio` values; v2 uses a curated list, admin-editable per N-21 and extendable by ADM.

### 3.4 Capability STR — Technical structure: objectives, activities in weeks, deliverables, indicators
[src: RF-06..RF-10, DP-01, DP-08, est §3.2–§3.4, §3.6] [impl: S0.5, S3.1–S3.6c]

**REQ-STR-01 Objetivo.** Code unique per project (`OE1`, `OE2`…), description required. Every activity belongs to
exactly one objective (RF-06, DP-01 USER-RESOLVED).
**REQ-STR-02 Actividad.** Fields: código unique per project (`1.1`…), objetivo, nombre, semana_inicio,
semana_fin, peso, responsable (optional user), calculated dates and state. Rule `1 ≤ semana_inicio ≤ semana_fin ≤
duración` (est §3.3, V-07).
**REQ-STR-03 Week → date.** Week n starts at `fecha_inicio + 7(n−1)` days and ends at `fecha_inicio + 7n − 1`
days (RF-07 PO-C; est §3.3). All date math is calendar-date only (no time zone): stored/compared as `YYYY-MM-DD`.
- Scenario (fixture F-W1): *Given* fecha_inicio 2026-10-05, *When* activity 1.4 spans weeks 3–6, *Then* dates are
  2026-10-19 → 2026-11-15.
- Scenario: *Given* fecha_inicio 2026-10-05 and fecha_fin 2027-01-29, *Then* duración = ceil(117/7) = 17 weeks.
- Scenario: *Given* fecha_inicio 2026-10-05 and fecha_fin 2026-11-01, *Then* duración = 4 (exact 28 days).
- Scenario: the last week MAY end after `fecha_fin` (e.g. 29 days → 5 weeks; week 5 ends 6 days after fecha_fin);
  dates are shown exactly as computed, not clamped (A-03).
**REQ-STR-04 Weight.** Default weight = `semana_fin − semana_inicio + 1` (RF-08 PO-C). Manual override before
baseline is allowed (DP-08 default "Sí", PO-P) and marked `peso_manual = true`; changing weeks of an activity
without manual weight recomputes its weight.
- Scenario: *Given* 1.4 weeks 3–6 and empty weight, *Then* weight 4.
- Scenario: *Given* manual weight 2.5 on 1.4, *When* weeks change to 3–7, *Then* weight stays 2.5.
**REQ-STR-05 Entregable.** Code unique per project (`1.4-E1`), activity, description (one product), cantidad_meta
Decimal > 0, unidad, tipo de medio exigido (RF-09 PO-P). An activity has 1..n deliverables (V-08).
**REQ-STR-06 Indicador de resultado.** Code unique per project (`IND-01`), objetivo, nombre, meta Decimal > 0,
unidad, línea base optional (RF-10 PO-C, est §3.6).
**REQ-STR-07 Draft editing.** In `BORRADOR`, ADM/GER MAY create/edit/soft-delete any structure element on screen;
each change MUST write one append-only audit row per changed field (entity, id, field, before, after) and MUST NOT
create a version (RF-04 PO-C). In any other state, direct edits of versioned fields MUST return 409
`INVALID_STATE` "El proyecto tiene línea base aprobada: solicita una modificación."
**REQ-STR-08 Recompute.** When `fecha_inicio` changes in `BORRADOR`, all activity dates are recomputed on read
(dates are derived, not stored — design ADR-06), so no stale dates exist.
**REQ-STR-09 Activity state (calculated).** `NO_INICIADA`, `EN_CURSO`, `FINALIZADA`, `FINALIZADA_CON_RETRASO`
(est §3.3). Rules (A-04, PO silent on exact rules): FINALIZADA when progress reaches 100 % with the reaching
avance dated ≤ activity end date; FINALIZADA_CON_RETRASO when reached after the end date; EN_CURSO when progress
> 0 or corte ≥ activity start; NO_INICIADA otherwise.

### 3.5 Capability EXE — Progress, verification media, measurements, beneficiaries
[src: RF-11..RF-15, est §3.5–§3.7, N-09, N-10, N-12] [impl: S4.1–S4.4]

**REQ-EXE-01 Avance.** An avance records entregable, fecha (≤ today, Colombia calendar date), cantidad Decimal
> 0, observación (optional), registered by / at (auto). Only in `EN_EJECUCION`, by P09 actors.
- Scenario: *Given* 1.4-E1 goal 2, *When* COORD-M registers 1 on 2026-10-30, *Then* 201 and cumulative = 1.
- Scenario: *When* fecha is tomorrow, *Then* 400 "La fecha del avance no puede ser posterior a hoy."
**REQ-EXE-02 Cap.** Cumulative quantity MUST NOT exceed the goal unless a `justificacion_exceso` text is given
(RF-12 PO-C). Completion used in calculations is capped at 100 %.
- Scenario: *Given* cumulative 2 of goal 2, *When* registering 1 more without justification, *Then* 400 "La
  cantidad acumulada supera la meta del entregable: agrega una justificación."
**REQ-EXE-03 Counting rule.** An avance counts for progress only if it has ≥ 1 medio de verificación (RF-12
support rule PO-P). Implemented as parameter `avance_requiere_medio` (default `true`, labelled "no confirmado").
Avances without medio are shown as "Pendiente de soporte".
**REQ-EXE-04 Medio de verificación.** File (§3.14 policy) or https link; records uploader and timestamp; attached to
exactly one avance or one medición (est §2.2). Stored in the existing `soportes_proyecto` table (same
`storage_path` convention `proyectos/{proyecto_id}/soportes/{soporte_id}_{nombre}` — VERIFIED
`src/lib/api/files.ts:85-91`) and mirrored to Documentos when the mirror succeeds (existing D8 behavior; RF-13
"Documentos/Repositorio" PO-P).
- Scenario: *When* a link uses `http:`, *Then* 400 (existing `isValidExternalUrl`, VERIFIED `files.ts:98-104`).
**REQ-EXE-05 Medición.** fecha, valor Decimal, soporte optional, usuario (auto); history kept; last measurement
and trend (last vs previous: up / down / equal) shown (RF-14 PO-C).
**REQ-EXE-06 Beneficiarios.** Count registry: fecha, cantidad Int > 0, actividad optional, observación without
personal data (RF-15, RF-11). "Beneficiarios atendidos" = Σ cantidad of non-voided rows.
**REQ-EXE-07 Void, never delete.** Execution records are never hard-deleted. ADM/GER MAY void a record with a
motivo; voided records are excluded from calculations and remain visible in history with the audit trail (A-05,
consistent with "nothing is ever deleted").
**REQ-EXE-08 Not versioned.** Avances, mediciones, beneficiarios and gastos are not part of any version snapshot;
they are compared against the chosen version (original v0 or vigente) (est §7.1).

### 3.6 Capability TEC — Technical progress and semáforo
[src: RF-16, RF-17, RF-35, DP-04, 6.7.1] [impl: S4.5, S4.6, S1.4]

**REQ-TEC-01** Activity progress = mean over its deliverables of `min(1, cumulative_counted / cantidad_meta)`
(RF-16 PO-P). An activity without deliverables has progress 0 (V-08 prevents it after import).
**REQ-TEC-02** Project real progress = Σ(peso × progress_activity) / Σ peso; Σ peso = 0 → 0 % (RF-16, 6.7.1).
**REQ-TEC-03** Programmed progress at cut-off date c = Σ(peso × f_a(c)) / Σ peso, where
`f_a(c) = clamp((c − start_a + 1) / (end_a − start_a + 1), 0, 1)` in calendar days (linear assumption PO-P).
**REQ-TEC-04** Deviation (pp) = (programmed − real) × 100. Colors: verde if deviation ≤ umbral1; amarillo if
umbral1 < deviation ≤ umbral2; rojo if deviation > umbral2 (RF-17 PO-C). Negative deviation (ahead) is verde.
Thresholds come from settings (placeholders umbral1 = 10 pp, umbral2 = 20 pp, **"no confirmado"**, DP-04).
- Scenario (fixture F-T1, §8.1): *Given* the CedeTextil structure (1.1 w1, 1.2 w2, 1.3 w3, 1.4 w3–6 weight 4),
  fecha_inicio 2026-10-05, corte 2026-10-25 and the fixture avances, *Then* programmed = 4/7 = 57.1 %, real =
  1.5/7 = 21.4 %, deviation = 35.7 pp → rojo.
- Scenario: deviation exactly 10.0 → verde; 10.1 → amarillo; 20.0 → amarillo; 20.1 → rojo.
**REQ-TEC-05** Every technical figure MUST display its cut-off date (RF-30).

### 3.7 Capability BUD — Budget per rubro and monthly programming
[src: RF-18, RF-19, DP-12, N-14, N-17, est §4.2–§4.3] [impl: S5.1, S5.2, S5.5]

**REQ-BUD-01** Every active catalog rubro MUST appear in the project with an assigned value A ≥ 0 (rows at $0
allowed); no duplicates; budget is independent of activities (RF-18 PO-C).
**REQ-BUD-02** Σ A MUST equal valor_total to the cent before baseline approval (RF-18, V-12). While in Borrador a
mismatch is allowed but shown ("Diferencia presupuesto vs valor total: $X").
**REQ-BUD-03** Programming is monthly (`AAAA-MM`, DP-12 default "Mensual", PO-P); periods cover the month of
fecha_inicio through the month of fecha_fin inclusive (RF-19); values ≥ 0; Σ periods of a rubro MUST equal its A
before baseline (V-13).
- Scenario: *Given* fecha_inicio 2026-10-05, fecha_fin 2027-01-29, *Then* periods = 2026-10, 2026-11, 2026-12,
  2027-01.
- Scenario: *Given* Personal A = 59.500.000 and programming 14.875.000 × 4, *Then* control = 0.
**REQ-BUD-04** A project without monthly programming MUST be flagged "Programación pendiente" and MUST NOT be
approvable (N-14 default: leave pending, no invented split).
**REQ-BUD-05** Budget lines on a suspended rubro MUST be shown as "Rubro suspendido pendiente de reasignación"
and MUST block baseline approval of that project until reassigned (N-13 USER-RESOLVED: reassigned manually).

### 3.8 Capability FIN — Financial ficha and optimal-spend semáforo
[src: RF-23, RF-24, RF-35, DP-03, DP-04, est §4.5] [impl: S5.3, S5.4, S8.4]

**REQ-FIN-01** For a cut-off period c (`AAAA-MM`), per rubro and total: A (vigente), P = Σ programming with
periodo ≤ c, E = Σ validated expenses with periodo ≤ c, D = E − P, E/P, E/A (RF-23 PO-C). Percentages are
rounded **half-up to one decimal**; E/P with P = 0 is "—" (and the color rule REQ-FIN-03 applies); E/A with A = 0
is "—".
**REQ-FIN-02** The ficha MUST be computable against the original (v0 snapshot) or the vigente version; E is the
same in both (execution records are not versioned).
**REQ-FIN-03 Optimal-spend semáforo** (RF-24 PO-C, est §4.5): verde if E ≤ P; amarillo if P < E ≤ P × (1 + tol)
and E ≤ A; rojo if E > P × (1 + tol) or E > A; **P = 0 and E > 0 → rojo**. Comparisons are exact in cents
(no floating point). tol from settings (placeholder 10 %, taken from the PO example; "no confirmado").
**REQ-FIN-04 Golden example (MUST reproduce exactly).** Project of 4 months (fixture F-F1: 2026-10-05 →
2027-01-29), cut-off at month 2 (`2026-11`), tol 10 %:

| Rubro | A | P mes 1 | P mes 2 | P acum | E acum | D | E/P | E/A | Umbral rojo P×1,10 | Semáforo |
|---|---|---|---|---|---|---|---|---|---|---|
| Personal | 59.500.000 | 14.875.000 | 14.875.000 | 29.750.000 | 27.000.000 | −2.750.000 | 90,8 % | 45,4 % | 32.725.000 | Verde (E ≤ P) |
| Transporte | 24.000.000 | 6.000.000 | 6.000.000 | 12.000.000 | 13.500.000 | +1.500.000 | 112,5 % | 56,3 % | 13.200.000 | Rojo (E > 13.200.000) |

- Scenario G1: *Given* F-F1, *When* computing the ficha at `2026-11`, *Then* Personal row equals the table
  (A, P, E, D, 90.8, 45.4, verde).
- Scenario G2: *Then* Transporte row equals the table (112.5, 56.3 — note 56.25 rounds **up** to 56.3, so a
  half-even implementation fails this test — rojo, red threshold 13.200.000).
- Scenario G3: *Given* the extra fixture rows (a REGISTRADO Personal expense of 5.000.000 in 2026-11, a RECHAZADO
  Transporte expense of 800.000 in 2026-10, a VALIDADO Personal expense of 3.000.000 in 2026-12), *Then* E values
  are unchanged (only validated with periodo ≤ corte count).
- Scenario G4: *Given* Transporte E = 13.000.000, *Then* amarillo; E = 13.200.000,00 → amarillo (boundary
  inclusive); E = 13.200.000,01 → rojo.
- Scenario G5: *Given* corte `2027-01`, Transporte P = 24.000.000 and E = 24.500.000, *Then* rojo because E > A
  (although E ≤ P × 1.1 = 26.400.000).
- Scenario G6: *Given* a rubro with P = 0 and E = 1, *Then* rojo; P = 0 and E = 0 → verde.
- Scenario G7 (total row, A-06): *Given* F-F1 with only these two rubros, *Then* total A 83.500.000, P 41.750.000,
  E 40.500.000, D −1.250.000, E/P 97,0 %, E/A 48,5 %, verde (same rule applied to totals, not worst-of rubros).
**REQ-FIN-05 Delay alert** (RF-24 alerta de retraso, **PO-P**): "Posible retraso" SHOULD show when E/P <
umbral_retraso (placeholder 70 %, "no confirmado") AND the technical semáforo is amarillo or rojo; never when P = 0.
Visual only (no notification — RF v2.0 §10.2). DP-03 (precio global vs legalización) only changes the explanatory
copy of under-execution, not the rule.
- Scenario: *Given* Personal E/P 90,8 % and technical rojo, *Then* no delay alert (90,8 ≥ 70).
- Scenario: *Given* E/P 50 % and technical amarillo, *Then* alert "Posible retraso: el gasto va por debajo de lo
  programado y el avance técnico está atrasado."
**REQ-FIN-06** The ficha MUST display the cut-off period and allow selecting any period of the project (RF-23).

### 3.9 Capability GAS — Expenses, validation, duplicates, overspend
[src: RF-20, RF-21, RF-22, RF-25, DP-02, DP-11, N-15, RNF-03, RNF-04, est §4.4] [impl: S6.1–S6.5]

**REQ-GAS-01 Fields** (RF-20 PO-C): fecha del documento, periodo de imputación (default = month of the document
date, PO-P, editable within project months), rubro (MUST have A > 0 in the project), tipo de soporte
(`FACTURA_PROVEEDOR` "Factura de proveedor", `CUENTA_COBRO_PERSONA_NATURAL` "Cuenta de cobro de persona natural",
`OTRO` "Otro"), tercero nombre, tercero tipo de identificación (`NIT`, `CC`, `CE`) and número, número de documento,
descripción, valor > 0, ≥ 1 soporte (file and/or link).
- Scenario: *When* registering on a rubro with A = 0, *Then* 400 "Solo puedes registrar gastos en rubros con
  valor asignado."
- Scenario: *When* registering without any soporte, *Then* 400 "Adjunta al menos un soporte (archivo o enlace)."
  (the registration and its first supports are one multipart/two-step request — §4.8 E-20).
**REQ-GAS-02 States** (RF-22 PO-C): `REGISTRADO` → `VALIDADO` | `RECHAZADO` (motivo required). Only `VALIDADO`
counts in E. A `RECHAZADO` expense MAY be corrected and re-submitted, which returns it to `REGISTRADO` with audit
(A-07). A `VALIDADO` expense is immutable; the PO is silent on corrections, so the default (A-08) is: only ADM/GER
may void a validated expense with a motivo, which removes it from E and is audited.
**REQ-GAS-03 Validator** = ADM or GER, never the registrant (DP-02 USER-RESOLVED; REQ-ACC-04). CHECK in DB:
`validado_por_id <> registrado_por_id`.
**REQ-GAS-04 Duplicate alert** (RF-21, Media, PO-P): on register, if another non-voided expense in ANY project has
the same normalized (tipo_id, número_id) and número de documento, the API MUST return 201 with
`alertas: [{tipo:"DUPLICADO", …}]` and the UI MUST show "Ya existe un gasto con el mismo NIT/cédula y número de
documento (proyecto PRY-…)." The other project's code is revealed only if the actor can see that project;
otherwise "(en otro proyecto)". Never blocks.
**REQ-GAS-05 Overspend** (RF-25 PO-P, DP-11 USER-RESOLVED): validating an expense that would make E_rubro (all
validated, any period) exceed the rubro's A vigente MUST be blocked (409 `OVERSPEND_BLOCKED` "Este gasto supera el
asignado vigente del rubro: requiere una modificación aprobada (traslado o adición) antes de validarlo.") AND MUST
raise the alert: expense flagged `alerta_sobregasto = true` (red flag in lists) and one notification per active
GERENCIA user (type `SOBREGASTO_RUBRO`, deduplicated per expense). Registering is never blocked; at registration
the flag is also set when E_validated + valor > A (early warning). After an approved traslado/adición raises A,
the same validation succeeds.
- Scenario: *Given* Transporte A 24.000.000, validated 23.500.000, *When* GER validates a 1.000.000 expense,
  *Then* 409 `OVERSPEND_BLOCKED`, expense stays `REGISTRADO`, flagged, 1 notification per GERENCIA user.
- Scenario: *When* the same validation is attempted again, *Then* still 409 and no duplicate notification.
- Scenario: *Given* an approved traslado of 1.000.000 into Transporte, *When* validating again, *Then* 200
  `VALIDADO`, flag cleared.
**REQ-GAS-06** RF-28 invariant: a modification MUST NOT leave A of a rubro below its validated E.
**REQ-GAS-07 Expense completeness** (N-15 USER-RESOLVED): every expense starts as `REGISTRADO`; those without third-party
identification are flagged `datos_incompletos` and cannot be validated until completed ("Completa el tipo y número
de identificación del tercero antes de validar.").
**REQ-GAS-08 Supports access** (RNF-03 PO-C, RNF-04 PO-P): expense supports (files, links, third-party ID number)
are visible only to ADM, GER and COORD-M; every signed-URL issuance for an expense support MUST append a row to
the support access log (who, when, which support) — "registro de consultas".

### 3.10 Capability XLS — Excel template: generate and import (V-01..V-14)
[src: RF-03, RF-04, est §5, §6, DP-05, DP-08, DP-12] [impl: S7.1a–S7.7]

**REQ-XLS-01 Generate.** From a project in `BORRADOR`, ADM/GER MUST be able to download the current template
(`exceljs`, VERIFIED dependency `package.json`), prefilled with project code and client, the 15 rubros, month
columns generated from the project dates, and a protected `9. Catálogos` sheet feeding dropdowns (est §5).
Sheets, in order and with exact names: `1. Instrucciones`, `2. Proyecto`, `3. Objetivos`, `4. Actividades`,
`5. Entregables`, `6. Indicadores`, `7. Presupuesto`, `8. Programación`, `9. Catálogos` (column map §8.2).
**REQ-XLS-02 Import is atomic** (RF-03 PO-C): all rules run on the whole workbook before any write; if any error
exists nothing is written and the response is a report of `{regla, hoja, fila, columna, valor, mensaje}`; if no
error, the whole structure/budget/programming is written in ONE database transaction.
**REQ-XLS-03 Only in `BORRADOR`** and only by ADM/GER (V-02). Re-import replaces the draft structure (previous
draft rows soft-deleted inside the same transaction) and writes `IMPORTAR` audit rows with a shared lote id
(RF-04). No version is created.
**REQ-XLS-04 Validation rules** (est §6; the rule text is the PO's; the exact check and message are ours):

| ID | Sheet / columns | Exact rule | Error message (es) |
|---|---|---|---|
| V-01 | All | The 9 sheets exist with the exact names; row 1 headers of sheets 2–8 equal the expected headers (trimmed, case-insensitive) in order; cell `1. Instrucciones!B2` equals the current template version (`PLANTILLA_VERSION`). | "Falta la hoja «{hoja}»." / "Encabezado inválido en «{hoja}», columna {col}: se esperaba «{esperado}» y se encontró «{encontrado}»." / "La plantilla es de la versión {v}; descarga la versión vigente {vigente}." |
| V-02 | `2. Proyecto` Código | Value equals the target project's `codigo`, and the project `estado = BORRADOR`. | "El código {codigo} no corresponde al proyecto {codigo_proyecto}." / "Solo se puede importar en proyectos en estado Borrador." |
| V-03 | `2. Proyecto` Fecha de inicio, Fecha de fin, Valor total, Meta de beneficiarios | Dates are valid dates and inicio < fin; valor total is a number > 0 with ≤ 2 decimals; meta de beneficiarios is an integer > 0. | "La fecha de inicio debe ser anterior a la fecha de fin." / "El valor total debe ser mayor que 0." / "La meta de beneficiarios debe ser un entero mayor que 0." |
| V-04 | `2. Proyecto` Líneas estratégicas, Municipios | Each `;`-separated value exists in the catalog and is active; ≥ 1 of each; the FIRST línea is the principal (A-09). | "La línea estratégica «{v}» no existe o está suspendida." / "El municipio «{v}» no existe o está suspendido." |
| V-05 | `3. Objetivos`…`6. Indicadores` Código | Codes are non-empty and unique within their sheet (case-insensitive, trimmed). | "Código «{codigo}» repetido en «{hoja}» (filas {filas})." / "Falta el código en «{hoja}», fila {fila}." |
| V-06 | `4. Actividades` Código objetivo; `5. Entregables` Código actividad; `6. Indicadores` Código objetivo | Every reference points to a code present in the referenced sheet of the same file. | "La referencia «{ref}» no existe en «{hoja_ref}»." |
| V-07 | `4. Actividades` Semana inicio, Semana fin | Integers with 1 ≤ inicio ≤ fin ≤ duración (duration computed from the sheet-2 dates of the same file). | "Semanas inválidas en la actividad {codigo}: se requiere 1 ≤ inicio ≤ fin ≤ {duracion}." |
| V-08 | `5. Entregables` | Every activity code of sheet 4 has ≥ 1 deliverable row. | "La actividad {codigo} no tiene entregables." |
| V-09 | `4. Actividades` Peso (if present); `5. Entregables` Cantidad; `6. Indicadores` Meta (and Línea base if present, ≥ 0) | Numeric and > 0 (línea base ≥ 0). Empty Peso = default duration (DP-08). | "«{columna}» debe ser un número mayor que 0 (hoja «{hoja}», fila {fila})." |
| V-10 | `3. Objetivos` | Every objective has ≥ 1 activity in sheet 4. | "El objetivo {codigo} no tiene actividades." |
| V-11 | `7. Presupuesto` Código rubro, Valor asignado | Codes exist in the catalog, are active, are not repeated; values are numbers ≥ 0 with ≤ 2 decimals. A missing active rubro row is treated as 0 (A-10). | "El rubro {codigo} no existe o está suspendido." / "Rubro {codigo} repetido." / "El valor asignado de {codigo} debe ser ≥ 0." |
| V-12 | `7. Presupuesto` | Σ valor asignado equals valor total of sheet 2, to the cent. | "La suma del presupuesto ({suma}) no es igual al valor total del proyecto ({total}); diferencia {dif}." |
| V-13 | `8. Programación` | For each rubro, Σ month cells equals its valor asignado in sheet 7, to the cent (Control = 0). | "La programación de {codigo} suma {suma} y su valor asignado es {asignado} (control {dif})." |
| V-14 | `8. Programación` month columns | Month headers `Mes k (AAAA-MM)` fall within the project months derived from sheet-2 dates; no value in a column outside that range; values ≥ 0. | "El mes {periodo} está fuera del periodo del proyecto." / "Valor negativo en {codigo}, {periodo}." |
| V-H1 (Hub, not in PO list) | Required text cells: Objetivos.Descripción, Actividades.Nombre, Entregables.Descripción/Unidad/Tipo de medio exigido, Indicadores.Nombre/Unidad | Non-empty. Labelled as a Hub rule so it is not confused with PO IDs. | "Falta «{columna}» en «{hoja}», fila {fila}." |
| W-01 (warning, non-blocking) | `4. Actividades` Responsable (correo) | If present, matches an active user email; otherwise the field is left empty and a warning is reported. | "El correo {correo} no corresponde a un usuario activo; la actividad queda sin responsable." |

- Scenario: *Given* a template where V-12 fails by $50.000 (CedeTextil 245.500.000 vs 245.450.000), *When*
  importing, *Then* 400 `VALIDATION_ERROR` with one V-12 entry and zero rows written (asserted by counting
  objetivos/actividades/entregables before and after).
- Scenario: *Given* two errors (V-07 row 7 and V-13 R12), *Then* the report lists both with sheet/row/column.
- Scenario: *Given* a valid CedeTextil-structure file, *Then* 1 objective, 4 activities, 7 deliverables are
  written, weights 1/1/1/4, all in one transaction, with one `IMPORTAR` audit lote.
- Scenario (rollback): *Given* a DB error injected after the 3rd insert, *Then* nothing is persisted (live-DB
  test on `.env.local`).

### 3.11 Capability VER — Baseline, versions, modifications
[src: RF-05, RF-26..RF-29, est §7] [impl: S8.1–S8.4]

**REQ-VER-01 Baseline approval.** Only ADM/GER; preconditions: estado `BORRADOR`, ≥ 1 objective, every objective
has an activity, every activity a deliverable, Σ A = valor_total, programming Σ = A per rubro, no retired-rubro
lines (REQ-BUD-05), no "programación pendiente", meta de beneficiarios > 0. On approval, in one transaction:
create version 0 (`LINEA_BASE`) with the full snapshot, set estado `EN_EJECUCION`, audit `APROBAR`.
- Scenario: *Given* a valid Borrador, *When* GER approves, *Then* version 0 exists, estado EN_EJECUCION, direct
  PATCH of `valor_total` returns 409 `INVALID_STATE`.
- Scenario: *Given* Σ A ≠ valor_total, *Then* 409 with the list of failed preconditions.
**REQ-VER-02 Snapshot content** (est §7.1): valor total, fechas, presupuesto por rubro, programación por periodo,
actividades (semanas y peso), entregables (cantidad), indicadores (meta) — plus codes/names for display.
Execution records are not included.
**REQ-VER-03 Modification request** (RF-26 PO-C): tipo ∈ {`TRASLADO`, `ADICION`, `REDUCCION`,
`REPROGRAMACION`, `CRONOGRAMA`, `ENTREGABLES`}, motivo required, structured before/after per element; states
`PENDIENTE` → `APROBADA` | `RECHAZADA` (comment required when rejected).
**REQ-VER-04 Approval** (RF-27): ADM/GER approve → apply the after-values to the live tables and create version N
(N = last + 1) with date, requester, approver, motivo, in one transaction. A rejected request changes no data.
A request created against version k cannot be approved if the vigente version is no longer k (409 "La solicitud
se basa en una versión anterior; vuelve a crearla.").
**REQ-VER-05 Integrity** (RF-28 PO-P): traslado keeps valor_total (Σ deltas = 0); adición/reducción changes
valor_total by Σ deltas and programming MUST be adjusted so Σ P = A; A of a rubro MUST NOT go below its validated
E; periods already elapsed (periodo < current month) MUST NOT be reprogrammed (PO-P, implemented as a rule that
can be disabled by setting `modificacion_bloquea_periodos_pasados`, default true, "no confirmado").
**REQ-VER-06 History and comparison** (RF-29 PO-C): list all versions; compare v0 vs vigente (or any vi vs vj) in
budget, programming, schedule and deliverables; KPIs and ficha selectable against original or vigente.

### 3.12 Capability DSH — Dashboards, exports, territory removal
[src: RF-30, RF-31, RF-32, 6.7.1, DP-09, RNF-02, RF v2.0 §2] [impl: S9.1–S9.5]

**REQ-DSH-01 KPIs** per project and portfolio, each with its cut-off date (RF-30): avance técnico real,
programado, cumplimiento del cronograma (activities finished on time / activities with end ≤ corte), entregables
logrados / programados (goal met AND ≥ 1 support), cumplimiento de indicadores (mean of min(1, last/meta) over
indicators with ≥ 1 measurement; unmeasured listed apart — DP-09 default), avance financiero (E / A vigente),
ejecución vs programado (E / P), beneficiarios atendidos / meta.
**REQ-DSH-02 Portfolio view** (RF-31 PO-P): list with technical and financial semáforo, progress and state;
filters cliente, línea estratégica (principal), responsable, estado, municipio (informative).
**REQ-DSH-03 Exports** (RF-32; formats PO-P): project ficha and financial ficha as PDF and Excel; content respects
the exporter's role (REQ-ACC-05); each export is audited (`exportar`, existing precedent in `logAudit`).
**REQ-DSH-04 Territory removal** (RF v2.0 §2 PO-C): the "Semaforización territorial" section and the
`por_territorio` query (VERIFIED `src/app/api/v1/dashboard/projects/route.ts:26,111-153`) MUST be removed when v2
is on; municipio remains a filter only.
**REQ-DSH-05 Performance** (RNF-02): dashboard KPIs < 3 s (see REQ-NFR-02).

### 3.13 Capability CLI — Clients/Opportunities gaps
[src: RF-C01..RF-C04, RNF-C01, RNF-C02] [impl: S2.3, S2.6, S2.7]

**REQ-CLI-01** RF-C01..RF-C03 are covered today (plan traceability, archived change
`openspec/changes/archive/2026-09-28-oportunidades-comerciales`); their existing tests MUST stay green.
**REQ-CLI-02 (RF-C04)** Conversion to project inherits client and proposal data: nombre and valor from the
opportunity (REQ-ORG-02). Proposal free-text fields (`problema_detectado`, `solucion_propuesta`) MAY be shown as
read-only context in the creation form (A-11).
**REQ-CLI-03 (RNF-C01)** The general panel MUST visually separate active projects in execution from opportunities
in prospection. Panel = dashboard "Mi resumen" + existing kanban opportunity chip (N-19 default).
**REQ-CLI-04 (RNF-C02)** Commercial/management users manage opportunities (existing `hasCommercialAccess`,
VERIFIED `permissions.ts:52-54`); field executors (COORDINADOR) see only the **active** projects they are
assigned to: when v2 is on, a COORDINADOR's project list defaults to `estado = EN_EJECUCION` member projects, with
closed ones reachable via an explicit filter (A-12).

### 3.14 Capability FIL — Files and storage
[src: RNF-07, DP-10 USER-RESOLVED, RNF-03, RF-13, RF v2.0 §10.3] [impl: S0.8, S0.9a, S0.9b, S4.2, S6.5]

**REQ-FIL-01 Size.** Max 25 MB per file for ALL uploads (documents, task attachments, project supports, expense
supports, template import) — single shared constant, overridable by env `MAX_FILE_SIZE_MB` (existing convention,
VERIFIED `tasks/[id]/attachments/route.ts:32-40`). Error 413 `FILE_TOO_LARGE` "El archivo supera el límite de
25 MB." **Gated by S0.8**: production hosting and bucket limits must allow it (UNVERIFIED, §7.1 R-02).
**REQ-FIL-02 Types.** Only pdf, docx, xlsx, pptx, jpg (jpeg), png. The check MUST require an allowed extension
AND (an allowed MIME or an empty/`application/octet-stream` MIME); today it is extension OR MIME (VERIFIED
`files.ts:52-56`), which accepts a disallowed extension with a spoofed MIME. Task attachments currently allow a
wider list (doc, ppt, csv, txt, zip… VERIFIED `tasks/[id]/attachments/route.ts:5`) — narrowing them is a behavior
change listed in "Needs your decision" (§6.8 D-05) because the user's rule says "solo archivos livianos
office/imagen".
**REQ-FIL-03 Never deleted.** No code path MAY remove a storage object or hard-delete a file row; deletion is
`deleted_at` only; no purge/retention job (DP-10 USER-RESOLVED). VERIFIED today: no `storage.remove` call in
`src/` (only DOM `a.remove()`), project/document deletes are soft. A guard test (S0.9a) greps the source tree for
`.storage` `.remove(` usage to keep it that way.
**REQ-FIL-04 Signed URLs only** for downloads (existing, 60 s — VERIFIED
`projects/[id]/attachments/route.ts:75`).
**REQ-FIL-05 Access** to expense supports per REQ-GAS-08.

### 3.16 Capability AUD — Append-only audit
[src: RF-04, RNF-05, RF-35, est §7.4, RF v2.0 §10.3] [impl: S0.4, all write tasks]

**REQ-AUD-01** Table `auditoria_cambios`: usuario, fecha-hora, acción ∈ {`CREAR`, `EDITAR`, `IMPORTAR`, `APROBAR`,
`VALIDAR`, `RECHAZAR`, `SUSPENDER`, `CAMBIAR_PARAMETRO`} (est §7.4) plus `ANULAR`, `SOLICITAR`, `EXPORTAR`,
`CONVERTIR` (Hub additions for void, modification request, export, conversion), entidad, entidad_id,
proyecto_id (nullable), campo, valor_anterior, valor_nuevo (JSON), lote_id (groups one operation).
**REQ-AUD-02** The database MUST reject UPDATE, DELETE and TRUNCATE on `auditoria_cambios` (trigger), so the
application cannot alter it (est §7.4, RNF-05).
- Scenario (live DB): *When* `UPDATE auditoria_cambios SET campo = 'x'`, *Then* the statement fails with
  "auditoria_cambios es de solo escritura".
**REQ-AUD-03** v2 writes MUST insert their audit rows in the same transaction as the business write; if the audit
insert fails, the business write fails (unlike the best-effort `logAudit`, which remains for v1).
**REQ-AUD-04** Edits write one row per changed field with before/after; creates write one row with the created
values in `valor_nuevo`; parameter changes write `CAMBIAR_PARAMETRO` with the whole before/after JSON.

### 3.17 Capability NFR — Non-functional requirements (measurable)

| ID | Requirement (PO) | Status | Measurable check | Task |
|---|---|---|---|---|
| REQ-NFR-01 / RNF-01 | Hub-consistent UI; mobile capture of progress and expenses | PO-C (mobile PO-P) | v6 primitives used (StatusChip, KpiTile, ProgressBar, EmptyState, PageHeader, button heights 44/40/36 — VERIFIED `src/components/ui/button.tsx:22-27`); progress and expense forms usable at 360 px width without horizontal scroll (component test + manual check) | S10.1–S10.3 |
| REQ-NFR-02 / RNF-02 | Management dashboard KPIs < 3 s | PO-C | p95 of `GET /api/v1/dashboard/projects` < 3 s with 50 projects × 20 activities × 30 expenses on local Docker, measured by `scripts/migrate-v2/bench-dashboard.ts` (10 runs) | S9.4 |
| REQ-NFR-03 / RNF-03 | Financial supports restricted to Gestor (COORD-M), Gerente, Admin | PO-C | route tests per actor on every support endpoint (403 for VIS/COORD-X/COLAB) | S6.5 |
| REQ-NFR-04 / RNF-04 | Ley 1581 de 2012: restricted access + consultation log | PO-P | every signed-URL issuance for an expense support inserts one `acceso_soportes` row (test) | S6.5 |
| REQ-NFR-05 / RNF-05 | Unalterable audit of changes, approvals, validations, parameters | PO-C | live-DB trigger test + every write route test asserts its audit row | S0.4 + all |
| REQ-NFR-06 / RNF-06 | Money in decimal COP, not float | PO-P | all money columns `Decimal(15,2)`; pure libs in bigint cents; golden test passes with exact equality | S0.5, S5.3 |
| REQ-NFR-07 / RNF-07 | File types, max size, retention | DP-10 USER-RESOLVED | REQ-FIL-01..03 tests; guard test "no storage remove" | S0.8, S0.9a/b |

### 3.18 Traceability (PO requirement → spec requirement → task)

| PO ID | Prio / status | Spec requirement(s) | Task(s) |
|---|---|---|---|
| RF-01 | Alta / PO-C | REQ-ORG-01..03 | S2.3 |
| RF-02 | Alta / PO-C | REQ-ORG-04..07, REQ-CAT-03, REQ-CAT-04 | S1.2, S1.3, S2.1, S2.2, S2.4 |
| RF-03 | Alta / PO-C | REQ-XLS-01..04 | S7.1a–S7.5 |
| RF-04 | Alta / PO-C | REQ-STR-07, REQ-XLS-03, REQ-AUD-04 | S0.4, S3.6a–c, S5.5, S7.6 |
| RF-05 | Alta / PO-C | REQ-VER-01, REQ-ORG-09 | S8.1, S8.2 |
| RF-06 | Alta / PO-P | REQ-STR-01 | S3.1 |
| RF-07 | Alta / PO-C | REQ-STR-02, REQ-STR-03, REQ-STR-08 | S0.5, S3.2a, S3.2b |
| RF-08 | Alta / PO-C (adjust PO-P) | REQ-STR-04 | S0.5, S3.2a |
| RF-09 | Alta / PO-P | REQ-STR-05 | S3.3 |
| RF-10 | Alta / PO-C | REQ-STR-06, REQ-EXE-05 | S3.4, S4.3 |
| RF-11 | Alta / PO-C | REQ-ORG-04, REQ-EXE-06 | S2.1, S4.4 |
| RF-12 | Alta / PO-C (support rule PO-P) | REQ-EXE-01..03 | S4.1 |
| RF-13 | Alta / PO-C | REQ-EXE-04, REQ-FIL-* | S4.2 |
| RF-14 | Alta / PO-C | REQ-EXE-05 | S4.3 |
| RF-15 | Alta / PO-C | REQ-EXE-06 | S4.4 |
| RF-16 | Alta / PO-P | REQ-TEC-01..03, REQ-STR-09 | S4.5 |
| RF-17 | Alta / PO-C | REQ-TEC-04, REQ-TEC-05 | S4.6, S1.4 |
| RF-18 | Alta / PO-C | REQ-BUD-01, REQ-BUD-02, REQ-BUD-05 | S5.1 |
| RF-19 | Alta / PO-C | REQ-BUD-03, REQ-BUD-04 | S5.2 |
| RF-20 | Alta / PO-C | REQ-GAS-01 | S6.1 |
| RF-21 | Media / PO-P | REQ-GAS-04 | S6.2 |
| RF-22 | Alta / PO-C | REQ-GAS-02, REQ-GAS-03, REQ-ACC-04 | S6.3 |
| RF-23 | Alta / PO-C | REQ-FIN-01, REQ-FIN-02, REQ-FIN-06 | S5.3, S8.4 |
| RF-24 | Alta / PO-C (delay PO-P) | REQ-FIN-03..05 | S5.4 |
| RF-25 | Alta / PO-P | REQ-GAS-05 | S6.4 |
| RF-26 | Alta / PO-C | REQ-VER-03 | S8.3a |
| RF-27 | Alta / PO-C | REQ-VER-04 | S8.3b |
| RF-28 | Alta / PO-P | REQ-VER-05, REQ-GAS-06 | S8.3b |
| RF-29 | Alta / PO-C | REQ-VER-06 | S8.4 |
| RF-30 | Alta / PO-C | REQ-DSH-01, REQ-TEC-05 | S9.1 |
| RF-31 | Alta / PO-P | REQ-DSH-02 | S9.2 |
| RF-32 | Alta / PO-C (formats PO-P) | REQ-DSH-03, REQ-ACC-05 | S9.3a, S9.3b |
| RF-33 | Alta / PO-C | REQ-CAT-01, REQ-CAT-02 | S1.1a, S1.1b |
| RF-34 | Media / PO-P | REQ-CAT-02..04 | S1.2, S1.3 |
| RF-35 | Alta / PO-C | REQ-TEC-04, REQ-FIN-03, REQ-FIN-05, REQ-AUD-04 | S1.4 |
| RF-36 | Alta / PO-C | REQ-ACC-01..07 | S0.7, S2.6 |
| RNF-01..07 | see §3.17 | REQ-NFR-01..07 | see §3.17 |
| V-01..V-14 | est §6 | REQ-XLS-04 | S7.3a (V-01..V-07), S7.3b (V-08..V-14, V-H1, W-01) |
| est §7 versioning/audit | — | REQ-VER-02, REQ-AUD-01..04 | S0.4, S8.1 |
| RF v2.0 §2 territory removed | PO-C | REQ-DSH-04 | S9.5 |
| RF v2.0 §2 activities not linked to Tareas | PO-C | covered today (`Tarea` has no project FK, VERIFIED schema) — regression only | — |
| RF-C01, RF-C02, RF-C03 | — | REQ-CLI-01 | — (keep tests) |
| RF-C04 | — | REQ-CLI-02, REQ-ORG-02 | S2.3, S2.4 |
| RNF-C01 | — | REQ-CLI-03 | S2.7 |
| RNF-C02 | — | REQ-CLI-04, REQ-ACC-02 | S0.7, S2.6 |
| DP-10 (files) | USER-RESOLVED | REQ-FIL-01..05 | S0.8, S0.9a, S0.9b, S4.2 |

## 4. Design

### 4.1 Architecture decisions (ADR)

**ADR-01 Direct single-model implementation of RF v2.0 on top of `main`.**
Context: the v1 Projects module was designed but never shipped (`main` has no projects models or migrations and
production has 0 rows in proyectos/metas/actividades); the v2 module is the only Projects model that will ever
exist in code. Options: (a) build the v1 module first and migrate it; (b) incremental coexistence behind a flag;
(c) implement RF v2.0 directly. Decision: (c) implement RF v2.0 directly as a single-model implementation on top
of `main`, developed on `feat/projects-v2`. Consequences: no flag, no dual code paths, no v1 test retirement,
no contract step, and the v2 domain model is the only one that ever exists in code.

**ADR-02 Keep the v1 domain naming and shapes for the concepts that survive; every projects table is created new.**
Context: the v1 Projects tables do not exist on `main` (VERIFIED 2026-09-30: no `Proyecto`, `Actividad`, `Meta`,
`Rubro`, `LineaPresupuestal`, `Gasto`, `Indicador` or `SoporteProyecto` model), so nothing can be reused. The
decision is about design continuity, not reuse: v2 keeps the v1 table and column names where the concept is
unchanged (`lineas_presupuestales` = PresupuestoRubro with A = `monto_proyectado_cop`; `gastos` with `concepto` =
descripción and `monto_cop` = valor; `soportes_proyecto` carrying medios de verificación and gasto supports with
parent FKs), so the Excel template, the OpenAPI paths and the UI copy stay aligned with the PO's vocabulary.
New tables: objetivos, entregables, avances_entregable, mediciones_indicador,
registros_beneficiarios, programacion_periodo, proyecto_miembros, proyecto_lineas, proyecto_municipios,
lineas_estrategicas, municipios, proyecto_secuencias, versiones_proyecto, solicitudes_modificacion,
auditoria_cambios, acceso_soportes, proyecto_kpi_cache. Consequences: `Gasto.linea_id` FK and every
`storage_path` stay valid; no object moves (plan storage invariant).

**ADR-03 Money in bigint cents in pure libs; `Decimal(15,2)` in the database.**
Options: floats (rejected, RNF-06), `Prisma.Decimal` everywhere (couples pure libs to Prisma runtime), bigint
cents (exact, dependency-free). Decision: pure libs take/return `bigint` cents; the API boundary converts with
`toCents(Decimal | string)` / `fromCents()`. Percentages are integer tenths computed with exact half-up rounding.
Consequences: golden test reproduces the PO example exactly, including 56.25 → 56.3.

**ADR-04 Calendar-date-only schedule math.**
Context: Colombia is UTC−5; `DateTime` midnight UTC shifts a day when rendered locally. Decision: weeks/dates are
computed on `YYYY-MM-DD` strings converted to UTC day numbers; activity dates are derived, never stored. New date
columns use `@db.Date`. Consequences: no off-by-one across time zones; recompute-on-start-change is free
(REQ-STR-08).

**ADR-05 Append-only audit enforced by the database, written transactionally.**
Decision: new `auditoria_cambios` with `BEFORE UPDATE OR DELETE` row trigger and `BEFORE TRUNCATE` statement
trigger raising an exception; `logChange(tx, …)` takes the transaction client. The existing best-effort
`logAudit` (VERIFIED `src/lib/api/audit.ts`) stays for v1 and non-project modules. Consequences: an audit failure
aborts the business write (RNF-05 over availability); tests must mock/assert `logChange` calls.

**ADR-06 Derived, not stored: activity dates, duration, activity state, A/P/E/D, semáforos.**
Stored only: inputs (weeks, weights, quantities, programming, expenses) and snapshots/caches. Consequences: one
source of truth; KPI cache (ADR-12) solves performance.

**ADR-07 Snapshot versioning in JSONB.**
Per RF v2.0 §10.3: each approved version stores a complete JSON copy of the versioned elements
(`versiones_proyecto.snapshot`, schema-versioned `{ "schema": 1, … }`). The vigente state is the live tables;
version N equals the live tables at approval time. Comparison is a pure diff of two snapshots (or snapshot vs live
projection). Versions are immutable (same trigger as audit).

**ADR-08 Project-specific permission predicates; `canManageAny` untouched.**
Decision: new `PROJECT_MANAGER_ROLES = ["ADMINISTRADOR", "GERENCIA"]` and predicates `canManageProjects`,
`canExecuteProject`, `canViewProjectV2`, `canApproveBaseline`, `canValidateExpense`, `canViewFinancialSupports`,
`canApproveModification`; `canCreateProject`/`canManageProject`/`canViewProject` are re-implemented on top of
them. `MANAGE_ANY_ROLES` keeps COORDINADOR because clients/tasks/documents still use it (VERIFIED call sites §4.7).
Consequences: COORDINADOR loses project creation and write-over-others immediately (S0.7 — see §6.8 D-02), and
loses global visibility when membership lands (S2.6).

**ADR-09 Membership table for the team; `responsable_id` kept as "Responsable".**
RF-02 needs one responsable; N-20 needs 1..n executors. Decision: `proyecto_miembros` (soft-removal) drives
executor authority and COORDINADOR visibility; `responsable_id` stays a display/ownership field (ADM, GER or a
member COORDINADOR). Creating a project adds its responsable as a member.

**ADR-10 Excel via `exceljs`, parse → validate (pure) → write (one transaction).**
Parser produces typed rows with positions; validators are pure functions returning `ImportError[]`; the writer
runs only on an empty error list, inside `db.$transaction` with a raised timeout (existing precedent
`TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }` in `prisma/invariant.test.ts`).

**ADR-11 Overspend: block + flag + notify, computed at validation time inside the transaction.**
`SELECT … FOR UPDATE` on the `lineas_presupuestales` row serialises concurrent validations of the same rubro, so
two validations cannot jointly exceed A.

**ADR-12 Precomputed KPI cache per project.**
`proyecto_kpi_cache` (payload JSON + computed_at + corte) recomputed in the same transaction as writes that
change inputs (avance, medición, beneficiario, gasto validation, approvals, imports) — or lazily when stale for
date-driven values (programmed progress depends on "today"): cache key includes the cut-off date; the dashboard
reads caches and recomputes only stale ones.

**ADR-13 Direct-to-storage uploads for files > hosting body limit (conditional on S0.8).**
If S0.8 confirms the ~4.5 MB Vercel request limit, uploads switch to: `POST …/upload-url` (server validates
name/size/type and permission, returns a Supabase signed upload URL for a server-chosen key) → browser uploads
directly to Storage → `POST …/attachments` confirms (server checks the object exists and its size via the storage
API before inserting the row). Otherwise keep multipart through the route handler.

**ADR-14 Single notification type for overspend; other alerts visual only.**
RF v2.0 §10.2 puts notifications out of scope; DP-11 (USER-RESOLVED) explicitly asks for the overspend
notification. Decision: add `TipoNotificacion.SOBREGASTO_RUBRO` and nullable `proyecto_id`/`gasto_id` on
`notificaciones`; the delay alert is a computed badge.

### 4.2 Target Prisma schema (delta against `prisma/schema.prisma`)
Conventions kept from the current schema (VERIFIED): uuid string ids, snake_case columns, `@@map` plural table
names, `deleted_at` soft delete, composite `@@unique([id, proyecto_id])` as FK target on every project child,
`onDelete: NoAction, onUpdate: NoAction` on composite relations that share `proyecto_id`, CHECK constraints in the
migration SQL (Prisma does not model CHECK). All money `@db.Decimal(15, 2)`; quantities/weights `Decimal(15, 2)`
/ `Decimal(9, 2)`; periods `@db.Char(7)` (`AAAA-MM`); calendar dates `@db.Date`.

```prisma
// ── Enums (new or extended; additive) ──────────────────────────────
enum EstadoProyecto {            // NEW on this branch (the v1 enum never shipped)
  PLANIFICACION
  BORRADOR
  EN_EJECUCION
  SUSPENDIDO
  CERRADO
  CANCELADO
}
enum OrigenProyecto { OPORTUNIDAD INDEPENDIENTE }
enum TipoSoporteGasto { FACTURA_PROVEEDOR CUENTA_COBRO_PERSONA_NATURAL OTRO }
enum TipoIdentificacion { NIT CC CE }
enum EstadoGasto { REGISTRADO VALIDADO RECHAZADO ANULADO }
enum TipoVersion { LINEA_BASE MODIFICACION }
enum TipoModificacion { TRASLADO ADICION REDUCCION REPROGRAMACION CRONOGRAMA ENTREGABLES }
enum EstadoSolicitud { PENDIENTE APROBADA RECHAZADA }
enum AccionAuditoria {
  CREAR EDITAR IMPORTAR APROBAR VALIDAR RECHAZAR SUSPENDER CAMBIAR_PARAMETRO   // est §7.4
  ANULAR SOLICITAR EXPORTAR CONVERTIR                                          // Hub additions
}
enum TipoNotificacion {          // extended
  COMPROMISO_VENCIDO
  TAREA_VENCIDA
  POR_VENCER
  SOBREGASTO_RUBRO               // ADR-14
}

// ── Proyecto (NEW) ────────────────────────────────────────────
model Proyecto {
  // NEW: the v1 Proyecto model does not exist on `main` (VERIFIED 2026-09-30)
  origen                       OrigenProyecto?
  valor_total                  Decimal?  @db.Decimal(15, 2)
  diferencia_valor_oportunidad Decimal?  @db.Decimal(15, 2)  // RF-02: valor_total - oportunidad.valor_estimado_cop
  programacion_pendiente       Boolean   @default(false)     // N-14: project without monthly programming
  miembros    ProyectoMiembro[]
  lineas_v2   ProyectoLinea[]
  municipios  ProyectoMunicipio[]
  objetivos   Objetivo[]
  entregables Entregable[]
  avances     AvanceEntregable[]
  mediciones  MedicionIndicador[]
  beneficiarios RegistroBeneficiarios[]
  programacion ProgramacionPeriodo[]
  versiones   VersionProyecto[]
  solicitudes SolicitudModificacion[]
  kpi_cache   ProyectoKpiCache?
}

model ProyectoSecuencia {        // REQ-ORG-05: PRY-AAAA-NNN
  anio   Int @id
  ultimo Int @default(0)
  @@map("proyecto_secuencias")
}

model ProyectoMiembro {          // ADR-09, N-20
  id             String    @id @default(uuid())
  proyecto_id    String
  usuario_id     String
  agregado_por_id String
  created_at     DateTime  @default(now())
  removed_at     DateTime?
  removido_por_id String?
  proyecto Proyecto @relation(fields: [proyecto_id], references: [id])
  usuario  Usuario  @relation("MiembroProyecto", fields: [usuario_id], references: [id])
  @@index([usuario_id, removed_at])
  @@index([proyecto_id])
  @@map("proyecto_miembros")
  // SQL: CREATE UNIQUE INDEX proyecto_miembros_activo_uq ON proyecto_miembros(proyecto_id, usuario_id) WHERE removed_at IS NULL;
}

model LineaEstrategicaCatalogo {
  id               String    @id @default(uuid())
  codigo           String    @unique            // = LineaEstrategica enum literal (EMPLEABILIDAD…), immutable
  nombre           String
  activo           Boolean   @default(true)
  fecha_suspension DateTime?
  orden            Int       @default(0)
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt
  proyectos ProyectoLinea[]
  @@map("lineas_estrategicas")
}

model ProyectoLinea {            // DP-05: N..N + exactly one principal
  proyecto_id String
  linea_id    String
  principal   Boolean @default(false)
  proyecto Proyecto                 @relation(fields: [proyecto_id], references: [id])
  linea    LineaEstrategicaCatalogo @relation(fields: [linea_id], references: [id])
  @@id([proyecto_id, linea_id])
  @@map("proyecto_lineas")
  // SQL: CREATE UNIQUE INDEX proyecto_lineas_principal_uq ON proyecto_lineas(proyecto_id) WHERE principal;
}

model Municipio {
  id               String    @id @default(uuid())
  nombre           String
  departamento     String
  codigo_dane      String?   @unique
  activo           Boolean   @default(true)
  fecha_suspension DateTime?
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt
  proyectos ProyectoMunicipio[]
  @@unique([nombre, departamento])
  @@map("municipios")
}

model ProyectoMunicipio {
  proyecto_id  String
  municipio_id String
  proyecto  Proyecto  @relation(fields: [proyecto_id], references: [id])
  municipio Municipio @relation(fields: [municipio_id], references: [id])
  @@id([proyecto_id, municipio_id])
  @@map("proyecto_municipios")
}

// ── Technical structure ───────────────────────────────────────────
model Objetivo {
  id             String    @id @default(uuid())
  proyecto_id    String
  codigo         String                            // OE1..
  descripcion    String
  orden          Int       @default(0)
  meta_origen_id String?   @unique
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt
  deleted_at     DateTime?
  proyecto    Proyecto    @relation(fields: [proyecto_id], references: [id])
  actividades Actividad[]
  indicadores Indicador[]
  @@unique([id, proyecto_id])
  @@index([proyecto_id])
  @@map("objetivos")
  // SQL: CREATE UNIQUE INDEX objetivos_codigo_uq ON objetivos(proyecto_id, lower(codigo)) WHERE deleted_at IS NULL;
}

model Actividad {
  objetivo_id     String?
  codigo          String?                          // 1.1..
  semana_inicio   Int?
  semana_fin      Int?
  peso_v2         Decimal?  @db.Decimal(9, 2)      // default = semana_fin - semana_inicio + 1
  peso_manual     Boolean   @default(false)
  responsable_id  String?
  objetivo    Objetivo?    @relation(fields: [objetivo_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  responsable Usuario?     @relation("ActividadResponsable", fields: [responsable_id], references: [id])
  entregables Entregable[]
  beneficiarios RegistroBeneficiarios[]
  // SQL CHECK actividades_semanas_ck: semana_inicio IS NULL OR (semana_inicio >= 1 AND semana_fin >= semana_inicio)
  // SQL CHECK actividades_peso_v2_ck: peso_v2 IS NULL OR peso_v2 > 0
  // SQL: CREATE UNIQUE INDEX actividades_codigo_uq ON actividades(proyecto_id, lower(codigo)) WHERE deleted_at IS NULL AND codigo IS NOT NULL;
}

model Entregable {
  id                 String    @id @default(uuid())
  proyecto_id        String
  actividad_id       String
  codigo             String                        // 1.4-E1
  descripcion        String
  cantidad_meta      Decimal   @db.Decimal(15, 2)  // CHECK > 0
  unidad             String
  tipo_medio_exigido String
  sintetico_migracion Boolean  @default(false)     // N-12 "Avance migrado"
  created_at         DateTime  @default(now())
  updated_at         DateTime  @updatedAt
  deleted_at         DateTime?
  proyecto  Proyecto  @relation(fields: [proyecto_id], references: [id])
  actividad Actividad @relation(fields: [actividad_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  avances   AvanceEntregable[]
  @@unique([id, proyecto_id])
  @@index([actividad_id])
  @@map("entregables")
}

model AvanceEntregable {
  id                   String    @id @default(uuid())
  proyecto_id          String
  entregable_id        String
  fecha                DateTime  @db.Date          // <= today (API)
  cantidad             Decimal   @db.Decimal(15, 2) // CHECK > 0
  observacion          String?
  justificacion_exceso String?
  registrado_por_id    String
  created_at           DateTime  @default(now())
  anulado_at           DateTime?
  anulado_por_id       String?
  motivo_anulacion     String?
  proyecto   Proyecto   @relation(fields: [proyecto_id], references: [id])
  entregable Entregable @relation(fields: [entregable_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  medios     SoporteProyecto[]
  @@unique([id, proyecto_id])
  @@index([entregable_id, fecha])
  @@map("avances_entregable")
}

model Indicador {                // NEW on this branch
  objetivo_id String?
  codigo      String?                              // IND-01
  linea_base  Decimal?  @db.Decimal(15, 2)
  objetivo   Objetivo?  @relation(fields: [objetivo_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  mediciones MedicionIndicador[]
  @@unique([id, proyecto_id])                     // NEW: missing today (VERIFIED schema.prisma:716-737)
}

model MedicionIndicador {
  id              String    @id @default(uuid())
  proyecto_id     String
  indicador_id    String
  fecha           DateTime  @db.Date
  valor           Decimal   @db.Decimal(15, 2)
  observacion     String?
  usuario_id      String
  migrada         Boolean   @default(false)       // N-09 synthetic first measurement
  created_at      DateTime  @default(now())
  anulado_at      DateTime?
  anulado_por_id  String?
  motivo_anulacion String?
  proyecto  Proyecto  @relation(fields: [proyecto_id], references: [id])
  indicador Indicador @relation(fields: [indicador_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  soportes  SoporteProyecto[]
  @@unique([id, proyecto_id])
  @@index([indicador_id, fecha])
  @@map("mediciones_indicador")
}

model RegistroBeneficiarios {
  id                String    @id @default(uuid())
  proyecto_id       String
  fecha             DateTime  @db.Date
  cantidad          Int                            // CHECK > 0
  actividad_id      String?
  observacion       String?
  registrado_por_id String
  migrado           Boolean   @default(false)     // N-10
  created_at        DateTime  @default(now())
  anulado_at        DateTime?
  anulado_por_id    String?
  motivo_anulacion  String?
  proyecto  Proyecto   @relation(fields: [proyecto_id], references: [id])
  actividad Actividad? @relation(fields: [actividad_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  @@index([proyecto_id, fecha])
  @@map("registros_beneficiarios")
}

model SoporteProyecto {          // NEW: medios de verificación + soportes de gasto
  avance_id   String?
  medicion_id String?
  avance   AvanceEntregable?  @relation(fields: [avance_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  medicion MedicionIndicador? @relation(fields: [medicion_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  accesos  AccesoSoporte[]
  // SQL CHECK soportes_un_padre_v2_ck: num_nonnulls(gasto_id, avance_id, medicion_id) <= 1
  // (actividad_id MAY coexist with avance_id on the same row — same storage_path)
}

// ── Budget and expenses ───────────────────────────────────────────
model Rubro {                    // NEW on this branch
  codigo           String?   @unique              // R01..R15, immutable (trigger)
  descripcion      String?
  fecha_suspension DateTime?                       // `activo=false` keeps meaning "suspendido"
  // SQL trigger rubros_codigo_inmutable: reject UPDATE of codigo when OLD.codigo IS NOT NULL
}

model LineaPresupuestal {        // NEW = PresupuestoRubro (A = monto_proyectado_cop), ADR-02
  programacion ProgramacionPeriodo[]
  // SQL CHECK lineas_monto_no_negativo_ck: monto_proyectado_cop >= 0
}

model ProgramacionPeriodo {
  id          String   @id @default(uuid())
  proyecto_id String
  linea_id    String
  periodo     String   @db.Char(7)                // AAAA-MM; CHECK periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  valor       Decimal  @db.Decimal(15, 2)         // CHECK >= 0
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  proyecto Proyecto          @relation(fields: [proyecto_id], references: [id])
  linea    LineaPresupuestal @relation(fields: [linea_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  @@unique([linea_id, periodo])
  @@index([proyecto_id, periodo])
  @@map("programacion_periodo")
}

model Gasto {                    // NEW: concepto = descripción, monto_cop = valor,
                                 // fecha_gasto=fecha del documento, tercero=tercero nombre, numero_comprobante=número de documento
  periodo            String?             @db.Char(7)
  tipo_soporte       TipoSoporteGasto?
  tercero_tipo_id    TipoIdentificacion?
  tercero_numero_id  String?                       // personal data (RNF-04)
  estado             EstadoGasto         @default(REGISTRADO)   // N-15: every new expense starts REGISTRADO
  validado_por_id    String?
  validado_at        DateTime?
  motivo_rechazo     String?
  anulado_por_id     String?
  anulado_at         DateTime?
  motivo_anulacion   String?
  alerta_sobregasto  Boolean             @default(false)
  @@index([proyecto_id, estado, periodo])
  @@index([tercero_tipo_id, tercero_numero_id, numero_comprobante])   // RF-21 duplicate lookup
  // SQL CHECK gastos_rechazo_motivo_ck: estado <> 'RECHAZADO' OR motivo_rechazo IS NOT NULL
  // SQL CHECK gastos_validador_ck: validado_por_id IS NULL OR validado_por_id <> registrado_por_id
  // SQL CHECK gastos_valor_positivo_ck: monto_cop > 0
}

model AccesoSoporte {            // RNF-04 consultation log; append-only (same trigger as audit)
  id          String   @id @default(uuid())
  soporte_id  String
  proyecto_id String
  usuario_id  String
  created_at  DateTime @default(now())
  soporte SoporteProyecto @relation(fields: [soporte_id], references: [id])
  @@index([proyecto_id, created_at])
  @@map("acceso_soportes")
}

// ── Versioning ────────────────────────────────────────────────────
model VersionProyecto {
  id              String      @id @default(uuid())
  proyecto_id     String
  numero          Int                               // 0 = línea base
  tipo            TipoVersion
  solicitud_id    String?     @unique               // required when tipo = MODIFICACION (CHECK)
  aprobado_por_id String
  aprobado_at     DateTime    @default(now())
  snapshot        Json                              // { schema: 1, ... } §4.11
  proyecto  Proyecto               @relation(fields: [proyecto_id], references: [id])
  solicitud SolicitudModificacion? @relation(fields: [solicitud_id], references: [id])
  @@unique([proyecto_id, numero])
  @@map("versiones_proyecto")
  // SQL: append-only trigger (no UPDATE/DELETE); CHECK (tipo = 'LINEA_BASE') = (numero = 0)
}

model SolicitudModificacion {
  id                   String           @id @default(uuid())
  proyecto_id          String
  tipo                 TipoModificacion
  motivo               String
  detalle              Json                         // [{elemento, clave, antes, despues}] §4.11
  version_base_numero  Int                          // optimistic concurrency (REQ-VER-04)
  estado               EstadoSolicitud  @default(PENDIENTE)
  solicitado_por_id    String
  solicitado_at        DateTime         @default(now())
  decidido_por_id      String?
  decidido_at          DateTime?
  comentario_decision  String?                      // CHECK: required when RECHAZADA
  proyecto Proyecto         @relation(fields: [proyecto_id], references: [id])
  version  VersionProyecto?
  @@index([proyecto_id, estado])
  @@map("solicitudes_modificacion")
}

// ── Audit and caches ──────────────────────────────────────────────
model AuditoriaCambio {          // REQ-AUD-01; append-only trigger
  id             String          @id @default(uuid())
  created_at     DateTime        @default(now())
  usuario_id     String                             // no FK on purpose (survives user changes), like Auditoria
  accion         AccionAuditoria
  entidad        String                             // "proyecto" | "objetivo" | "actividad" | ...
  entidad_id     String
  proyecto_id    String?
  campo          String?
  valor_anterior Json?
  valor_nuevo    Json?
  lote_id        String?                            // groups one operation (import, approval)
  @@index([proyecto_id, created_at])
  @@index([entidad, entidad_id])
  @@map("auditoria_cambios")
}

model ProyectoKpiCache {         // ADR-12
  proyecto_id  String   @id
  corte        DateTime @db.Date
  calculado_at DateTime @default(now())
  payload      Json
  proyecto Proyecto @relation(fields: [proyecto_id], references: [id])
  @@map("proyecto_kpi_cache")
}

model Notificacion {             // extended (ADR-14)
  proyecto_id String?
  gasto_id    String?
  @@unique([usuario_id, tipo, gasto_id])           // dedupe SOBREGASTO per expense and user
}
```

**Week math** (implemented in `src/lib/proyectos/weeks.ts`, not in SQL): `start(n) = fecha_inicio + 7(n−1)`,
`end(n) = fecha_inicio + 7n − 1`, `duracion = ceil((fecha_fin − fecha_inicio + 1)/7)`. The forward direction
(week → date) is the only one v2 needs: activities are created with explicit weeks, so there is no
date → week conversion.

**Compound-FK invariants preserved:** every new project child carries `proyecto_id` and references
`[parent_id, proyecto_id]` (Entregable→Actividad, Avance→Entregable, Medición→Indicador, Programación→Línea,
Actividad→Objetivo, Indicador→Objetivo, Soporte→Avance/Medición/Gasto). The existing
`Proyecto↔Oportunidad [oportunidad_id, cliente_id]` invariant is unchanged.

**Enum migration caveat:** PostgreSQL cannot use a value added by `ALTER TYPE … ADD VALUE` in the same
transaction; `BORRADOR` is added in its own migration and first used by a later migration.

`Usuario` gains the inverse relations `miembro_de ProyectoMiembro[] @relation("MiembroProyecto")` and
`actividades_responsable Actividad[] @relation("ActividadResponsable")` (no new columns on `usuarios`).

### 4.3 ER overview

```mermaid
erDiagram
  CLIENTE ||--o{ PROYECTO : "tiene"
  OPORTUNIDAD |o--o| PROYECTO : "origina (1:1, [oportunidad_id, cliente_id])"
  PROYECTO ||--o{ PROYECTO_MIEMBRO : "equipo (COORDINADOR)"
  USUARIO ||--o{ PROYECTO_MIEMBRO : ""
  PROYECTO ||--o{ PROYECTO_LINEA : "1..n, 1 principal"
  LINEA_ESTRATEGICA ||--o{ PROYECTO_LINEA : ""
  PROYECTO ||--o{ PROYECTO_MUNICIPIO : "informativo"
  MUNICIPIO ||--o{ PROYECTO_MUNICIPIO : ""
  PROYECTO ||--o{ OBJETIVO : "OE1..n"
  OBJETIVO ||--o{ ACTIVIDAD : "1..n (semanas)"
  ACTIVIDAD ||--o{ ENTREGABLE : "1..n"
  ENTREGABLE ||--o{ AVANCE_ENTREGABLE : "0..n"
  AVANCE_ENTREGABLE ||--o{ SOPORTE_PROYECTO : "medios >=1 para contar"
  OBJETIVO ||--o{ INDICADOR : "resultado"
  INDICADOR ||--o{ MEDICION_INDICADOR : "historial"
  MEDICION_INDICADOR ||--o{ SOPORTE_PROYECTO : "opcional"
  PROYECTO ||--o{ REGISTRO_BENEFICIARIOS : "conteo"
  RUBRO ||--o{ LINEA_PRESUPUESTAL : "A por rubro"
  PROYECTO ||--o{ LINEA_PRESUPUESTAL : ""
  LINEA_PRESUPUESTAL ||--o{ PROGRAMACION_PERIODO : "P por AAAA-MM"
  LINEA_PRESUPUESTAL ||--o{ GASTO : "E (solo VALIDADO)"
  GASTO ||--o{ SOPORTE_PROYECTO : ">=1 soporte"
  SOPORTE_PROYECTO ||--o{ ACCESO_SOPORTE : "log RNF-04"
  PROYECTO ||--o{ VERSION_PROYECTO : "0 = linea base"
  PROYECTO ||--o{ SOLICITUD_MODIFICACION : ""
  SOLICITUD_MODIFICACION |o--o| VERSION_PROYECTO : "aprobada -> version N"
  PROYECTO ||--o| PROYECTO_KPI_CACHE : ""
```
Independence rule (est §2.1, PO-C): no FK between activities and budget; technical and financial meet only at
project and period level.

### 4.4 Schema evolution

v2 schema changes are **additive migrations applied directly** to the branch: new tables and nullable/defaulted
columns, composite `[id, proyecto_id]` FKs, CHECK constraints in SQL (Prisma does not model CHECK), and triggers.
There is **no v1→v2 data migration**: the v1 Projects module was never shipped, so there is no legacy project row
to move. Every projects table is created new on this branch (ADR-02); where a concept survives, v2 keeps the v1
table and column names so the Excel template and the UI copy stay aligned.

Migration names follow the existing pattern `YYYYMMDDHHMMSS_snake_name` (VERIFIED `prisma/migrations/`). All are
created with `npm run db:migrate` (wraps `--env-file=.env.local`, VERIFIED `package.json`) — `prisma migrate dev
--create-only` first when the SQL needs hand-written CHECKs/triggers/partial indexes, then edited, then applied.

### 4.5 Data-script design (`scripts/migrate-v2/`)
- **Guard (S0.6, BUILT):** `scripts/migrate-v2/_guard.ts` is a side-effect module whose FIRST statement is
  `import "../../prisma/require-local-db"` (**corrected 2026-10-01**: this SDD previously named
  `prisma/load-local-env.ts`, which does not exist; the real side-effect guard is `prisma/require-local-db.ts`,
  which loads `.env.local` and asserts `DATABASE_URL` + `DIRECT_URL`), so importing any script against a
  non-loopback `DATABASE_URL`, `DIRECT_URL` or `NEXT_PUBLIC_SUPABASE_URL` throws before `@/lib/db` is
  constructed. `_guard.ts` then re-runs `assertLocalDatabaseUrl(GUARDED_VARS)` with
  `GUARDED_VARS = [DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL]` because `REQUIRED_LOCAL_VARS` covers only
  the two Postgres URLs; `prisma/require-local-db.ts` itself is deliberately NOT widened, because
  `prisma.config.ts` and `db:generate:local` do not need the Supabase URL. `describeTarget()` prints the host
  only. Import order is proved by `__fixtures__/guard-probe.ts` (an addition beyond the original file list).
  The duplicate guard in `scripts/seed-proyectos-demo.ts:42-65` is left as is (not in scope, and the file is
  parked as `.bak`) but noted for later dedupe.
- **Invocation:** `npx tsx --env-file=.env.local scripts/migrate-v2/<script>.ts --dry-run` (default when no flag)
  or `--apply` or `--revert <lote_id>`. Never `npx prisma …` without the env file.
- **Harness (`_harness.ts`, BUILT):** `runMigration({ name, argv, db, plan, apply, revert?, outDir?, now?, print?, host? })`
  where `Plan = { counts: PlanCount[], decisions: PlanDecision[], actions: PlanAction[], storage? }` and
  `PlanCount = { entity, existing, to_create, to_update, skipped }` (**deviation**: this SDD wrote
  `counts: Record<string, number>`, but the count-first table below needs those five columns). The harness is
  DB-agnostic — it never imports `@/lib/db`; each script imports the guard, then the client, then the harness and
  injects `db`, so `_harness.test.ts` runs against a hand-written fake with no database or network. `--dry-run` prints the report
  and exits 0 without opening a write transaction. `--apply` re-computes the plan inside ONE
  `db.$transaction` (timeout 120 s), refuses if the plan differs from a `--expect-hash <sha>` value copied from the
  dry-run (prevents applying a plan nobody reviewed), writes a `lote` row to `auditoria_cambios`
  (`accion = IMPORTAR`, `entidad = "migracion_v2"`, `lote_id`), then applies. **Idempotency:** each action is
  keyed (e.g. `objetivo:meta_origen_id`) and skipped when already applied, so a second `--apply` reports 0 actions.
- **Count-first report format** (stdout, also written to `scripts/migrate-v2/out/<script>-<timestamp>.md`, the
  `out/` folder git-ignored):

```text
# Migration dry-run: s3-estructura  (db host: 127.0.0.1:54322)  plan-hash: 3f9c…
## Counts
| entity | existing | to_create | to_update | skipped (already applied) |
| metas → objetivos | 12 | 12 | 0 | 0 |
| actividades (weeks) | 48 | 0 | 48 | 0 |
## Decisions required (not applied until resolved)
| id | rule | project | row | detail | default |
| N-11 | start week unknown | PRY-2026-004 | act 1.3 | fecha_planificada 2026-10-22 → semana 3 | semana_inicio = 3 |
| N-12 | synthetic deliverable | PRY-2026-002 (EN_EJECUCION) | act 2.1 | porcentaje_avance 40 | re-capture (no synthetic) |
## Storage
| soportes rows | objects found | rows without object | objects without row |
```
- **Storage orphan report (S0.6, read-only):** lists `storage_path` rows whose object is missing and objects
  under `proyectos/` without a row, using the local Storage API (service key from `.env.local`); never deletes.
- **The local guard has no bypass flag.** Remote promotion (human-run, checklist in §6.5) uses a separate
  entrypoint `scripts/migrate-v2/promote-remote.ts` that is written only when the user authorizes promotion,
  imports the same plan/apply functions but replaces the guard with an interactive confirmation of the target host
  typed by a human. Agents never create or run it (CLAUDE.md DB rule).
- **Remote promotion checklist (§6.5):** backup, apply migrations, run each script dry-run from the human
  entrypoint, review decisions, apply with `--expect-hash`, verify counts.

### 4.7 Permissions module changes
**New/changed predicates in `src/lib/permissions.ts`** (pure, no DB — same discipline, VERIFIED header comment):
```ts
export const PROJECT_MANAGER_ROLES: readonly RolUsuario[] = ["ADMINISTRADOR", "GERENCIA"];
export type ProjectMembershipActor = ProjectActor & { es_miembro: boolean };   // resolved by the loader
export function canManageProjects(actor: PermissionActor): boolean;            // P05–P08, P11, P13, P14, P18
export function canCreateProject(actor: PermissionActor): boolean;             // = canManageProjects (CHANGED: no COORDINADOR)
export function canManageProject(p: { responsable_id: string }, actor: PermissionActor): boolean;
//   v1 path, CHANGED: canManageProjects(actor) || (p.responsable_id === actor.id && actor.rol === "COORDINADOR")
export function canExecuteProject(actor: ProjectMembershipActor): boolean;     // P09, P10, P12: manager || (COORDINADOR && es_miembro)
export function canViewProjectV2(actor: ProjectMembershipActor): boolean;      // P01–P03: manager || VIS flag || (COORDINADOR && es_miembro)
export function canViewFinancialSupports(actor: ProjectMembershipActor): boolean; // P04: manager || (COORDINADOR && es_miembro) — VIS excluded
export function canValidateExpense(g: { registrado_por_id: string }, actor: PermissionActor): boolean; // manager && g.registrado_por_id !== actor.id
export function canApproveBaseline(actor: PermissionActor): boolean;           // = canManageProjects
export function canApproveModification(actor: PermissionActor): boolean;       // = canManageProjects
export function canViewPortfolio(actor: ProjectActor): boolean;                // ADM, GER, VIS (COORDINADOR scoped via membership)
```
`canManageAny`, `MANAGE_ANY_ROLES`, `canReadRestrictedDocs`, `canEditClient`, `canEditTask`,
`hasCommercialAccess`, `canManageOpportunity` stay **unchanged** (clients/tasks/documents keep COORDINADOR).
`canViewManagementDashboard` is not used by v2; v2 code uses `canViewPortfolio`.

**Behavior change in S0.7 (applied directly to the project write paths — see §6.8 D-02):** a COORDINADOR can no longer
create projects nor write to projects where they are not the responsable. A COLABORADOR responsable loses write
access (they have no project role, N-01). Read scope is unchanged until S2.6.

**Affected call sites (VERIFIED by `rg`, 2026-09-29):**

| File:line | Symbol | Change |
|---|---|---|
| `src/lib/permissions.ts:78-80` | `canCreateProject` | re-implemented on `canManageProjects` |
| `src/lib/permissions.ts:90-95` | `canManageProject` | new rule above |
| `src/lib/permissions.ts:98-103` | `canViewProject` | unchanged in S0.7; replaced by membership-aware loader in S2.6 |
| `src/lib/api/projects.ts:19-35` | `loadProjectScoped` | S2.6: also loads `es_miembro` (`proyecto_miembros` active row) and uses `canViewProjectV2` |
| `src/lib/api/projects.ts:44-54` | `getProjectForWrite` | S0.7 picks up the new `canManageProject`; S3+ v2 routes use new `getProjectForStructure` / `getProjectForExecution` |
| `src/lib/api/projects.ts:123` | `toProjectItem.puede_editar_proyecto` | S0.7 follows new rule; v2 adds `permisos: {estructura, ejecucion, validar, aprobar}` |
| `src/app/api/v1/projects/route.ts:60-62,90` | list scope (`canViewManagementDashboard`), `canCreateProject` | S0.7 create gate changes; S2.6 list scope = portfolio or membership |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts:69` | `canCreateProject` | S0.7 |
| `src/components/proyectos/project-list.tsx:38,104` | `canCreateProject` (client-side CTA) | S0.7 (UI hides the CTA for COORDINADOR) |
| `src/components/crm/entity-dialogs.tsx:682,809,942` | CTA "Crear proyecto" + server-authority comment | S0.7 test that the CTA is hidden for COORDINADOR |
| `src/app/api/v1/dashboard/projects/route.ts:182,196` | `loadProjectScoped`, `canViewManagementDashboard` | S2.6 / S9.2 |
| `src/lib/openapi/paths/projects.ts:10,97,121,141,159` and `src/lib/openapi/paths/dashboard-admin.ts:347-359` | docs strings naming COORDINADOR | S0.7 doc update |
| `src/components/admin/users-table.tsx:71` | comment | S0.7 doc update |
| 15 project route files (`src/app/api/v1/projects/[id]/**/route.ts`) | `loadProjectScoped` / `getProjectForWrite` | pick up the change transparently; their tests with a COORDINADOR manager fixture must be updated in S0.7 |

### 4.8 API surface (v2)
All routes: `export const dynamic = "force-dynamic"`, `withApiErrorHandling(label, message, handler)`, auth via
`requireApiUser()` (or `requireApiRole(["ADMINISTRADOR"])` for admin), dynamic params as
`ctx.params: Promise<{…}>` (Next 16 convention VERIFIED in `src/app/api/v1/rubros/[id]/route.ts:20`), zod bodies,
errors `{ error, code }` via `apiError` (VERIFIED `src/lib/api/errors.ts`). **`ApiErrorCode` gains two values:**
`INVALID_STATE` (409, wrong project/expense state) and `OVERSPEND_BLOCKED` (409). Import
reports reuse `VALIDATION_ERROR` with an extra `reporte` field (new helper `apiValidationReport(reporte)`).
Money travels as strings `"59500000.00"`.

| # | Method & path | Auth (matrix) | Request → Response (success) | Errors |
|---|---|---|---|---|
| E-02 | GET `/api/v1/projects` | P01 | `?estado&cliente_id&linea_id&municipio_id&responsable_id` → `{proyectos: ProjectItemV2[]}` | 401 |
| E-03 | POST `/api/v1/projects` (INDEPENDIENTE) | P05 | `{nombre, cliente_id, responsable_id, lineas:[{id,principal}], municipio_ids[], fecha_inicio, fecha_fin, valor_total?, beneficiarios_meta?, miembro_ids?}` → 201 `{proyecto}` (código autogenerado) | 400, 403, 404 cliente |
| E-04 | GET `/api/v1/projects/eligible-opportunities` | P05 | → `{oportunidades:[{id, nombre, cliente_id, cliente_nombre, valor_estimado_cop}]}` (GANADA, no project) | 403 |
| E-05 | POST `/api/v1/clients/:id/opportunities/:oid/project` | P05 (+ existing commercial gate) | same body as E-03 minus cliente_id → 201; converts O in the same tx | 403, 404, 409 CONFLICT (not GANADA / has project) |
| E-06 | GET/PATCH `/api/v1/projects/:id` | P02 / P06 | PATCH general data in BORRADOR → `{proyecto, alertas?:[{tipo:"DIFERENCIA_VALOR", diferencia}]}` | 403, 404, 409 INVALID_STATE |
| E-07 | GET/POST `/api/v1/projects/:id/members`, DELETE `/members/:userId` | P02 / P07 | `{usuario_id}` → 201 `{miembro}`; DELETE sets `removed_at` | 400 (not COORDINADOR), 403, 409 duplicate |
| E-08 | GET/POST `/api/v1/projects/:id/objectives`, PATCH/DELETE `/objectives/:oid` | P02 / P06 | `{codigo, descripcion}` | 400, 403, 409 INVALID_STATE, 409 CONFLICT codigo |
| E-09 | GET/POST `/api/v1/projects/:id/activities` (v2 body), PATCH/DELETE `/activities/:aid` | P02 / P06 | `{codigo, objetivo_id, nombre, semana_inicio, semana_fin, peso?, responsable_id?}` → activity with derived `fecha_inicio`, `fecha_fin`, `peso`, `estado` | 400 V-07-like, 403, 409 |
| E-10 | GET/POST `/api/v1/projects/:id/deliverables`, PATCH/DELETE `/deliverables/:did` | P02 / P06 | `{codigo, actividad_id, descripcion, cantidad_meta, unidad, tipo_medio_exigido}` | 400, 403, 409 |
| E-11 | GET/POST `/api/v1/projects/:id/deliverables/:did/progress`; POST `/progress/:pid/void` | P02 / P09; void P18 | `{fecha, cantidad, observacion?, justificacion_exceso?}` → 201 `{avance, cuenta: boolean}`; void `{motivo}` | 400 (future date, over goal), 403, 409 INVALID_STATE |
| E-12 | POST `/api/v1/projects/:id/attachments` (extended), `…/attachments/upload-url` (ADR-13) | P09 (medios) / P10 (gasto) | multipart or confirm `{storage_path, nombre, tamano_bytes, avance_id? | medicion_id? | gasto_id?}` / link `{url_externa, nombre, …}` | 400 type, 413 FILE_TOO_LARGE, 403 |
| E-13 | GET/POST `/api/v1/projects/:id/indicators` (v2 body), GET/POST `/indicators/:iid/measurements`, POST `/measurements/:mid/void` | P02 / P06 (indicator), P09 (measurement) | `{fecha, valor, observacion?}` → `{medicion, ultima, tendencia}` | 400, 403, 409 |
| E-14 | GET/POST `/api/v1/projects/:id/beneficiaries`, POST `/beneficiaries/:bid/void` | P02 / P09 | `{fecha, cantidad, actividad_id?, observacion?}` | 400, 403, 409 |
| E-15 | GET `/api/v1/projects/:id/technical-status?corte=AAAA-MM-DD&base=vigente|original` | P02 | → `{corte, avance_real, avance_programado, desviacion_pp, color, actividades:[…], umbrales:{…, confirmado}}` | 400 corte |
| E-16 | GET/PUT `/api/v1/projects/:id/budget` (v2 body) | P03 / P06 | PUT `{rubros:[{rubro_id, asignado}]}` (all rows) → `{rubros, suma, valor_total, diferencia}` | 400, 403, 409 INVALID_STATE |
| E-17 | GET/PUT `/api/v1/projects/:id/programming` | P03 / P06 | PUT `{filas:[{rubro_id, periodo, valor}]}` → `{filas, control_por_rubro}` | 400 period outside, 403, 409 |
| E-18 | GET `/api/v1/projects/:id/financial-sheet?corte=AAAA-MM&base=vigente|original` | P03 | → `{corte, base, tolerancia, rubros:[FichaRow], total: FichaRow, alerta_retraso}` | 400 |
| E-19 | GET `/api/v1/projects/:id/expenses` (v2 fields), GET `/expenses/:eid` | P03 (list without third-party ID for VIS) | → `{gastos:[…], totales}` | 403 |
| E-20 | POST `/api/v1/projects/:id/expenses` (v2 body) | P10 | multipart: JSON part `datos` + ≥ 1 `archivo` or `enlaces[]` (or two-step with upload-url) → 201 `{gasto, alertas:[DUPLICADO|SOBREGASTO]}` | 400 (A = 0 rubro, no support, periodo outside), 403, 409 INVALID_STATE |
| E-21 | POST `/api/v1/projects/:id/expenses/:eid/validate`, `/reject` `{motivo}`, `/void` `{motivo}`, PATCH `/expenses/:eid` (only REGISTRADO/RECHAZADO) | P11 / P10 (patch own) / P18 (void) | → `{gasto}` | 403 (self), 409 OVERSPEND_BLOCKED, 409 INVALID_STATE (datos incompletos) |
| E-22 | GET `/api/v1/expense-validations?estado=REGISTRADO` | P11 | cross-project queue → `{gastos:[… proyecto_codigo, alerta_sobregasto]}` | 403 |
| E-23 | GET `/api/v1/projects/:id/template` | P06 | → xlsx stream (`Content-Disposition: attachment; filename="PRY-2026-001-plantilla.xlsx"`) | 403, 409 INVALID_STATE |
| E-24 | POST `/api/v1/projects/:id/import` | P06 | multipart `archivo` (.xlsx ≤ 25 MB) → 200 `{importado: true, resumen:{objetivos, actividades, entregables, indicadores, rubros}, advertencias:[W-01…]}` | 400 `{code:"VALIDATION_ERROR", reporte:{errores:[…]}}`, 403, 409 |
| E-25 | POST `/api/v1/projects/:id/baseline/approve` | P08 | → `{version:{numero:0}, proyecto}` | 403, 409 `{precondiciones:[…]}` |
| E-26 | GET/POST `/api/v1/projects/:id/modifications`, POST `/modifications/:mid/approve`, `/reject` `{comentario}` | P02 / P12 / P13 | POST `{tipo, motivo, detalle:[…]}` → 201 `{solicitud}`; approve → `{version:{numero:N}}` | 400 RF-28 rule, 403, 409 stale version |
| E-27 | GET `/api/v1/projects/:id/versions`, GET `/versions/:n`, GET `/versions/compare?from=0&to=vigente` | P02 | → `{versiones}` / `{snapshot}` / `{diferencias:[{elemento, clave, desde, hasta}]}` | 404 |
| E-28 | GET `/api/v1/dashboard/projects` (v2) | P17 | `?corte&linea_id&cliente_id&responsable_id&estado&municipio_id` → portfolio KPIs (no `por_territorio`) | 403 |
| E-29 | GET `/api/v1/projects/:id/export?formato=pdf|xlsx&ficha=proyecto|financiera&corte=` | P16 | → file; audited EXPORTAR | 403 |
| E-30 | Admin: `/api/v1/rubros` (extended rules), NEW `/api/v1/strategic-lines`, `/api/v1/municipalities` (GET any user; POST/PATCH/DELETE ADMINISTRADOR) | P15 | catalog CRUD with suspend-not-delete | 409 CONFLICT has data |
| E-31 | `PATCH /api/v1/settings` (extended keys `semaforo_parametros_v2`) | P15 | → snapshot | 400 |

### 4.9 Pure calculation libraries (`src/lib/proyectos/`)
All modules are framework/DB-free (no `@/lib/db`, no `next/server`), like `src/lib/permissions.ts` and
`src/lib/semaforo.ts`. Types only from `@prisma/client` if needed.

**`weeks.ts` (S0.5)**
```ts
export type IsoDate = string;                        // "YYYY-MM-DD"
export type Periodo = string;                        // "YYYY-MM"
export function toDayNumber(d: IsoDate): number;     // UTC days since epoch; throws RangeError on invalid date
export function fromDayNumber(n: number): IsoDate;
export function daysBetweenInclusive(a: IsoDate, b: IsoDate): number;          // b - a + 1
export function durationWeeks(inicio: IsoDate, fin: IsoDate): number;           // ceil((fin-inicio+1)/7); RangeError if fin < inicio
export function weekStart(inicio: IsoDate, n: number): IsoDate;                 // inicio + 7(n-1); n integer >= 1
export function weekEnd(inicio: IsoDate, n: number): IsoDate;                   // inicio + 7n - 1
export function activityDates(inicio: IsoDate, semIni: number, semFin: number): { inicio: IsoDate; fin: IsoDate };
export function defaultWeight(semIni: number, semFin: number): number;          // semFin - semIni + 1
export function projectPeriods(inicio: IsoDate, fin: IsoDate): Periodo[];       // month of inicio .. month of fin
export function periodOf(d: IsoDate): Periodo;
export function todayInBogota(now?: Date): IsoDate;                             // calendar date in America/Bogota
```
Worked example (fixture F-W1): `durationWeeks("2026-10-05","2027-01-29") = 17`;
`activityDates("2026-10-05",3,6) = {inicio:"2026-10-19", fin:"2026-11-15"}`; `defaultWeight(3,6) = 4`;
`projectPeriods(…) = ["2026-10","2026-11","2026-12","2027-01"]`.
There is no `dateToWeek`: activities are created with explicit weeks, so the reverse mapping has no caller
(removed with the direct path; see §0.4).

**`money.ts` (S0.5)**
```ts
export type Cents = bigint;
export function toCents(v: string | number | { toString(): string }): Cents;   // "59500000", "59500000.5", Prisma.Decimal; >2 decimals -> RangeError
export function fromCents(c: Cents): string;                                   // "59500000.00"
export function sumCents(xs: readonly Cents[]): Cents;
export function percentTenths(num: Cents, den: Cents): bigint | null;          // round-half-up(num*1000/den); den = 0 -> null; handles negatives symmetrically
export function formatPercent(tenths: bigint | null): string;                  // 908n -> "90,8 %", null -> "—"
export function withinTolerance(e: Cents, p: Cents, tolBasisPoints: bigint): boolean; // e*10000 <= p*(10000+bp)
export function toleranceThreshold(p: Cents, tolBasisPoints: bigint): Cents;   // p*(10000+bp)/10000 (display only)
export function formatCOP(c: Cents): string;                                   // "$ 59.500.000" (same shape as formatCOP in src/hooks/crm.ts, computed in bigint)
// Note: tsconfig targets ES2017, so BigInt *literals* (`0n`) are rejected by tsc even though `lib` includes
// esnext. Use named constants built with `BigInt(...)`. The acceptance check
// `rg -n "parseFloat|Number\(" src/lib/proyectos/money.ts` must stay empty — not even in a comment.
```
Example: `percentTenths(2700000000n, 2975000000n) = 908n` (90,8 %); `percentTenths(1350000000n, 2400000000n) =
563n` (56,3 % — exact half-up of 562,5); `withinTolerance(1350000000n, 1200000000n, 1000n) = false`.

**`avance.ts` (S4.5)**
```ts
export type EntregableAvance = { cantidad_meta: number; acumulado_contable: number };  // Decimal -> number (non-money)
export type ActividadAvance = { peso: number; inicio: IsoDate; fin: IsoDate; entregables: EntregableAvance[];
  fecha_cumplimiento?: IsoDate | null };                                                // date the 100 % was reached
export function avanceEntregable(e: EntregableAvance): number;                          // min(1, acum/meta)
export function avanceActividad(a: ActividadAvance): number;                            // mean; [] -> 0
export function avanceReal(acts: ActividadAvance[]): number;                            // Σ peso*avance / Σ peso; Σ peso = 0 -> 0
export function fraccionTiempo(a: { inicio: IsoDate; fin: IsoDate }, corte: IsoDate): number; // clamp((corte-inicio+1)/(fin-inicio+1),0,1)
export function avanceProgramado(acts: ActividadAvance[], corte: IsoDate): number;
export function desviacionPp(programado: number, real: number): number;                 // (p - r) * 100, rounded to 0.1 for display only
export function estadoActividad(a: ActividadAvance, corte: IsoDate): "NO_INICIADA"|"EN_CURSO"|"FINALIZADA"|"FINALIZADA_CON_RETRASO";
export function acumuladoContable(avances: {cantidad: number; tiene_medio: boolean; anulado: boolean}[], requiereMedio: boolean): number;
```
Worked example (F-T1, corte 2026-10-25): fracciones 1, 1, 1, 7/28; programado = (1+1+1+4·0,25)/7 = 0,5714;
real = (1·1 + 1·0,5 + 1·0 + 4·0)/7 = 0,2143; desviación = 35,7 pp.

**`semaforo-v2.ts` (S4.6, S5.4)**
```ts
export type ColorSemaforo = "verde" | "amarillo" | "rojo";                     // same union as src/lib/semaforo.ts
export type ParametrosSemaforoV2 = {
  tecnico: { umbral1_pp: number; umbral2_pp: number; confirmado: boolean };
  financiero: { tolerancia_pct: number; confirmado: boolean };                 // 10 -> 1000 bp
  retraso: { umbral_ep_pct: number; confirmado: boolean };
  avance_requiere_medio: boolean;
  modificacion_bloquea_periodos_pasados: boolean;
};
export const PARAMETROS_SEMAFORO_V2_DEFAULT: ParametrosSemaforoV2;            // 10/20 pp, 10 %, 70 %, true, true — all confirmado:false
export function colorTecnicoV2(desviacionPp: number, p: ParametrosSemaforoV2["tecnico"]): ColorSemaforo;
export function colorFinancieroV2(x: { A: Cents; P: Cents; E: Cents }, tolBp: bigint): ColorSemaforo;
//   P = 0n && E > 0n -> rojo; E <= P -> verde; withinTolerance(E,P,tolBp) && E <= A -> amarillo; else rojo
export function alertaRetraso(x: { epTenths: bigint | null; colorTecnico: ColorSemaforo }, umbralPct: number): boolean;
export function parseParametrosV2(raw: unknown): ParametrosSemaforoV2;       // zod; invalid -> default (same pattern as resolverUmbrales)
```

**`ficha-financiera.ts` (S5.3)**
```ts
export type RubroFichaInput = { rubro_id: string; codigo: string; nombre: string; asignado: Cents;
  programacion: { periodo: Periodo; valor: Cents }[]; gastos: { periodo: Periodo; valor: Cents; estado: EstadoGasto }[] };
export type FichaRow = { rubro_id: string | null; codigo: string; nombre: string; A: Cents; P: Cents; E: Cents; D: Cents;
  epTenths: bigint | null; eaTenths: bigint | null; umbralRojo: Cents; color: ColorSemaforo };
export function computeFicha(input: { rubros: RubroFichaInput[]; corte: Periodo; toleranciaBp: bigint }):
  { corte: Periodo; rubros: FichaRow[]; total: FichaRow };
export function validadoAcumulado(gastos: RubroFichaInput["gastos"]): Cents;   // any period, VALIDADO only (overspend check)
export function excederiaAsignado(x: { asignado: Cents; validado: Cents; nuevo: Cents }): boolean; // validado + nuevo > asignado
```
Golden fixture F-F1 (§8.1) is the primary test; the total row is computed by the same rule on sums (A-06).

**`kpis.ts` (S9.1)** — pure functions for the 6.7.1 table: `cumplimientoCronograma(acts, corte)`,
`entregablesLogrados(entregables)`, `cumplimientoIndicadores(indicadores)` → `{promedio, sin_medir: n}`,
`avanceFinanciero(E, A)`, `ejecucionVsProgramado(E, P)`, `beneficiariosVsMeta(sum, meta)`, and
`kpisProyecto(input, corte)` composing them; `kpisPortafolio(kpis[])` (weighted by valor_total for financial,
simple mean for technical — A-13).

**`versiones.ts` (S8.1, S8.3b, S8.4)** — `buildSnapshot(live) → SnapshotV1`, `diffSnapshots(a, b) →
Diferencia[]`, `applyModificacion(live, solicitud) → live'`, `validarModificacion(live, solicitud, ejecutado,
periodoActual, params) → ErrorRegla[]` (RF-28).

**`plantilla/` (S7.x)** — `columns.ts` (sheet/column constants §8.2), `parse.ts` (workbook → `ParsedTemplate`
with `{hoja, fila, columna}` on every cell), `validate.ts` (V-01..V-14 each an exported function
`v01(parsed, ctx): ImportError[]` … composed by `validateTemplate`).

### 4.10 Excel template design
- **Generate (S7.1a/b):** `exceljs` `Workbook`; sheets per §8.2; `2. Proyecto` is field–value (A = label,
  B = value) with prefilled Código (locked cell) and Cliente (informative, not imported); dropdown data
  validations reference named ranges on `9. Catálogos` (rubros, líneas, municipios, unidades); `9. Catálogos`
  protected with `sheet.protect(<random per-download password not stored>, { selectLockedCells: true })`;
  `7. Presupuesto` precarga the 15 active rubros; `8. Programación` generates one column per project month,
  header `Mes k (AAAA-MM)`, plus `Total` (formula `=SUM(…)`) and `Control` (formula `=Total − VLOOKUP(asignado)`);
  `1. Instrucciones!B2 = PLANTILLA_VERSION` (constant `"2026.1"` in `columns.ts`).
- **Parse (S7.2):** read with `workbook.xlsx.load(buffer)`; formula cells read `.result`; dates accept Excel date
  cells and `DD/MM/AAAA` / `AAAA-MM-DD` text; numbers accept numeric cells or text with `.` thousands and `,`
  decimals (Colombian format) — normalized to `string` decimals for `toCents`.
- **Validate (S7.3a/b):** all rules run; errors sorted by sheet order then row; max 500 errors returned (a
  `truncado: true` flag beyond that).
- **Write (S7.4):** single `db.$transaction(async tx => …, { timeout: 60_000, maxWait: 10_000 })`: soft-delete
  previous draft objetivos/actividades(v2 columns)/entregables/indicadores, upsert project general fields,
  lines/municipios, budget (all 15 rows), programming, then insert new structure, then `logChange` rows with one
  `lote_id`. Any throw rolls back everything.
- **Error report format:** `{ errores: [{ regla: "V-07", hoja: "4. Actividades", fila: 7, columna: "Semana fin",
  valor: "19", mensaje: "Semanas inválidas en la actividad 1.4: se requiere 1 ≤ inicio ≤ fin ≤ 17." }],
  advertencias: [...], resumen: { "V-07": 1 }, truncado: false }`. The UI (S7.5) renders a table grouped by sheet
  and offers "Descargar reporte (.xlsx)" built client-side from the same JSON.

### 4.11 Versioning design
- **Snapshot v1 JSON:**
  ```json
  { "schema": 1,
    "proyecto": { "valor_total": "177360000.00", "fecha_inicio": "2026-10-05", "fecha_fin": "2027-01-29" },
    "presupuesto": [{ "rubro_codigo": "R01", "asignado": "59500000.00" }],
    "programacion": [{ "rubro_codigo": "R01", "periodo": "2026-10", "valor": "14875000.00" }],
    "actividades": [{ "codigo": "1.4", "objetivo_codigo": "OE1", "nombre": "…", "semana_inicio": 3, "semana_fin": 6, "peso": "4.00" }],
    "entregables": [{ "codigo": "1.4-E1", "actividad_codigo": "1.4", "descripcion": "…", "cantidad_meta": "2.00" }],
    "indicadores": [{ "codigo": "IND-01", "objetivo_codigo": "OE1", "meta": "50.00" }] }
  ```
- **Version 0** is created by E-25; **version N** by E-26 approve. Both immutable (trigger).
- **Modification `detalle`:** `[{ "elemento": "presupuesto", "clave": "R12", "antes": "24000000.00",
  "despues": "25000000.00" }, …]`. Allowed elements per tipo: TRASLADO/ADICION/REDUCCION → presupuesto (+
  programacion); REPROGRAMACION → programacion; CRONOGRAMA → actividades (semanas, peso) and proyecto.fechas;
  ENTREGABLES → entregables.cantidad_meta and indicadores.meta.
- **Approval transaction:** lock project row (`SELECT … FOR UPDATE`), check `version_base_numero = max(numero)`,
  `validarModificacion` (RF-28), apply to live tables, `buildSnapshot` → insert version N, update request
  (APROBADA, decidido_*), audit `APROBAR` per changed field with a shared `lote_id`, recompute KPI cache.
- **Comparison:** `diffSnapshots(v0, current)` → rows `{elemento, clave, desde, hasta}`; ficha "original" = A and
  P from v0 snapshot with E from live expenses.

### 4.12 Audit design
- `src/lib/api/audit-cambios.ts` (S0.4):
  ```ts
  export type CambioInput = { usuario_id: string; accion: AccionAuditoria; entidad: string; entidad_id: string;
    proyecto_id?: string | null; campo?: string | null; valor_anterior?: unknown; valor_nuevo?: unknown; lote_id?: string };
  export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: readonly (keyof T)[]):
    { campo: string; valor_anterior: unknown; valor_nuevo: unknown }[];          // pure; Decimal/Date normalised to strings
  export async function logChange(tx: Prisma.TransactionClient, input: CambioInput): Promise<void>;       // throws on failure
  export async function logChanges(tx: Prisma.TransactionClient, inputs: CambioInput[]): Promise<void>;   // createMany
  ```
- Trigger SQL (migration `v2_auditoria_cambios`):
  ```sql
  CREATE FUNCTION auditoria_cambios_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'auditoria_cambios es de solo escritura'; END $$;
  CREATE TRIGGER auditoria_cambios_no_update_delete BEFORE UPDATE OR DELETE ON auditoria_cambios
    FOR EACH ROW EXECUTE FUNCTION auditoria_cambios_inmutable();
  CREATE TRIGGER auditoria_cambios_no_truncate BEFORE TRUNCATE ON auditoria_cambios
    FOR EACH STATEMENT EXECUTE FUNCTION auditoria_cambios_inmutable();
  ```
  The same function is attached to `versiones_proyecto` (S8.1) and `acceso_soportes` (S6.5).
- Reader: `GET /api/v1/auditoria` (ADMINISTRADOR, VERIFIED `src/app/api/v1/auditoria/route.ts:55`) gains a
  `fuente=cambios` mode in S9.x; the project workspace shows a per-project history (ADM/GER) in S10.2.

### 4.13 Notifications and alerts
- **Overspend (DP-11):** inside the validation transaction, when `excederiaAsignado` is true: update gasto
  `alerta_sobregasto = true`; `createMany` notifications (`tipo = SOBREGASTO_RUBRO`, `proyecto_id`, `gasto_id`)
  for every active `rol = GERENCIA` user with `skipDuplicates: true` (unique `[usuario_id, tipo, gasto_id]`);
  commit, then return 409 `OVERSPEND_BLOCKED`. (The flag and notifications are committed even though the
  validation is refused — the transaction writes them and does not change `estado`.) The existing notifications
  UI (`src/app/api/v1/notifications/**`) lists them; S6.4 adds the label "Gasto supera el asignado del rubro" and
  a link to the project.
- **Early warning at registration:** same predicate against validated E; sets the flag; no notification.
- **Delay alert:** computed in E-15/E-18/E-28 responses (`alerta_retraso: boolean`), shown as a badge; no
  notification (ADR-14).

### 4.14 UI plan (styling in S10; functional components in each slice)
- Reuse v6 primitives (VERIFIED in `src/components/ui/`): `StatusChip` (project state, expense state, semáforo),
  `KpiTile` (ficha totals, dashboard), `ProgressBar` (avance real vs programado), `EmptyState`, `PageHeader`,
  `Button` sizes default 44 px / `sm` 40 px / `xs` 36 px (`button.tsx:22-27`), `Table`, `Tabs`, `Dialog`, `Sheet`.
- New screens (functional in slices, styled in S10.2): creation stepper with origin question (S2.3), team tab
  (S2.6), Objetivos/Actividades/Entregables editor + Gantt in weeks (S3.6), progress capture sheet (S4.1, mobile
  S10.3), financial ficha by rubro with cut-off selector (S5.3/S5.4), programming grid (S5.2), expense form and
  validation queue (S6.x), template download/import report (S7.5), baseline approval dialog with preconditions
  (S8.2), modifications and version comparison (S8.3/S8.4), portfolio (S9.2).
- Tabs in v2 workspace: Resumen · Estructura · Cronograma · Avance · Indicadores · Presupuesto · Gastos ·
  Versiones (labels final in S10.1, which edits `odd/tasks/v6-visual-alignment.md`).
- Components never recompute semáforos (existing D1 discipline VERIFIED `financiero-tab.test.tsx` header): the
  API returns colors; components render them.

### 4.15 Performance (RNF-02)
- KPI cache per project (ADR-12); dashboard query reads `proyecto_kpi_cache` for visible projects + one
  aggregate; recompute stale caches (`corte` ≠ today) in a bounded batch (max 20 per request, rest served stale
  with `calculado_at` shown) — A-14.
- Indexes listed in §4.2 (`gastos(proyecto_id, estado, periodo)`, `programacion_periodo(proyecto_id, periodo)`,
  `avances_entregable(entregable_id, fecha)`, `proyecto_miembros(usuario_id, removed_at)`).
- Measured by `scripts/migrate-v2/bench-dashboard.ts` (local only, guarded): data comes from the demo seeder
  extended with `--v2 --count 50` (`scripts/seed-proyectos-demo.ts`, local Docker only), then 10 timed requests
  to the dashboard handler; pass = p95 < 3 s.

### 4.16 Security and privacy
- Ley 1581 de 2012 (RNF-04, PO-P): third-party identification and "cuentas de cobro" are personal data →
  (1) restricted to P04 actors, (2) consultation log `acceso_soportes`, (3) excluded from VIS views/exports,
  (4) never in logs (`console.error` of zod errors must not print bodies), (5) no personal data of beneficiaries.
- Signed URLs 60 s (existing); buckets private (VERIFIED docs `public: false`).
- Upload hardening: extension AND MIME allowlist (REQ-FIL-02); server-chosen storage keys (existing
  `projectSupportStoragePath`); size checked server-side (and in the signed-upload confirm step, ADR-13).
- Authorization checked server-side on every route; UI flags are hints only (existing convention).
- Audit append-only (ADR-05); versions immutable.

### 4.17 Test strategy
- **Strict TDD:** every behavior task starts with an observed RED (`npx vitest run <file>` failing for the right
  reason), then GREEN, then REFACTOR; the RED output line is pasted in §6.7 evidence.
- **Pyramid:**
  1. Pure unit tests (majority): `src/lib/proyectos/*.test.ts`, `src/lib/permissions.test.ts`,
     template validators one `describe` per V-rule.
  2. Route tests with mocked `@/lib/db`, `@/lib/supabase/server`, `@/lib/api/audit-cambios`
     — the existing pattern (VERIFIED `src/app/api/v1/projects/route.test.ts:1-60`: `vi.mock` factories,
     `authAs(usuario)`, row builders, `new Request(...)`).
  3. Component tests with `@testing-library/react`, `vi.hoisted` query stubs and `vi.mock("@/hooks/projects")`
     partial mocks (VERIFIED `src/components/proyectos/tabs/financiero-tab.test.tsx:1-60`).
  4. Live-DB invariant tests (few): files under `prisma/*.invariant.test.ts` that import `./load-local-env`
     FIRST and wrap everything in a forced-rollback transaction (pattern VERIFIED `prisma/invariant.test.ts`);
     used for triggers, CHECKs, partial unique indexes, atomic import rollback, overspend row lock.
  5. E2E (Playwright, `e2e/`, excluded from vitest — VERIFIED `vitest.config.ts`): one happy path per slice
     closure from S8 on (create → import → approve → progress → expense → validate), run manually against
     `next dev` + local Supabase.
- **Golden fixtures:** F-F1 (financial example), F-W1 (weeks), F-T1 (technical), F-X1 (CedeTextil template
  structure) in `src/lib/proyectos/__fixtures__/` (§8.1); asserted with exact equality (bigint).
- **Factories:** `src/test/factories/proyectos-v2.ts` (NEW): `makeProyectoV2`, `makeActividadV2`,
  `makeEntregable`, `makeGastoV2`, `makeActor({rol, flag, miembro})` — plain objects for route/component tests.
- **Known failing baseline:** `prisma/invariant.test.ts` is failing before this work (caller-provided); new
  live-DB tests live in separate files so the baseline failure does not mask them.
- **Commands per task:** focused `npx vitest run <files>`; `npx tsc --noEmit`; `npx eslint <touched files>`;
  full `npx vitest run` at slice close.

## 5. Tasks

### 5.0 Conventions for every task
- Format: **Goal · Files · RED → GREEN → REFACTOR · Commands · Acceptance · Deps · Gate · Lines · Commit · PR**.
- "Lines" = estimated authored changed lines (advisory, ~400 per PR budget). Sizes: S ≤ ~150, M ~150–400,
  L > 400 (all L tasks of the plan are split below into a/b/c with their own PRs).
- "Gate" says which decision gates the task; **"none"** = can start without any decision.
- Standard commands (`CMD-STD`): `npx vitest run <new/changed test files>`, `npx tsc --noEmit`,
  `npx eslint <touched files>`; at slice close add `npx vitest run`.
- DB commands only with `.env.local`: `npm run db:migrate` / `npm run db:migrate:status` (already wrapped),
  scripts `npx tsx --env-file=.env.local scripts/migrate-v2/<x>.ts --dry-run|--apply`.
- Every commit: Conventional Commit, subject ≤ 72 chars, body lists the task ID and the checks run; **no
  Co-Authored-By / AI attribution**. Record commit hash + checks + RDD outcome in §6.7.
- Every write route in v2: RED includes (a) happy path, (b) 403 per forbidden actor class from the matrix,
  (c) 409 wrong state, (d) audit `logChange` called with the expected rows.
- Order for tomorrow: **S0.5, S0.4, S0.6**, then S0.1, S0.7, S0.8, S0.9a/b, then S1.x.

### 5.1 Slice S0 — Foundations and decision closure

#### S0.5 — Pure week and money libraries (S, decision-free) ★ first task
- **Goal:** exact, dependency-free schedule and money math (RF-07, RF-08, RNF-06).
- **Files:** NEW `src/lib/proyectos/weeks.ts`, `src/lib/proyectos/weeks.test.ts`, `src/lib/proyectos/money.ts`,
  `src/lib/proyectos/money.test.ts`, `src/lib/proyectos/__fixtures__/weeks.ts` (F-W1).
- **RED** (`weeks.test.ts`):
  - `it("week n starts at fecha_inicio + 7(n−1) days and ends at fecha_inicio + 7n − 1 days")`
  - `it("computes activity 1.4 (weeks 3–6) as 2026-10-19 → 2026-11-15 for a 2026-10-05 start")`
  - `it("duration is ceil((fin − inicio + 1) / 7): 28 days → 4 weeks, 29 days → 5 weeks, 117 days → 17 weeks")`
  - `it("throws RangeError when fecha_fin is before fecha_inicio")`
  - `it("default weight is semana_fin − semana_inicio + 1")`
  - `it("lists project periods from the start month to the end month inclusive, across a year boundary")`
  - `it("does not shift dates across the America/Bogota offset (todayInBogota at 2026-10-05T03:00Z is 2026-10-04)")`
- **RED** (`money.test.ts`):
  - `it("parses decimal strings and Prisma-like decimals to integer cents without float error")`
  - `it("rejects more than two decimals")`
  - `it("percentTenths rounds half-up: 27.000.000 / 29.750.000 → 908 and 13.500.000 / 24.000.000 → 563")`
  - `it("percentTenths returns null when the denominator is zero")`
  - `it("withinTolerance compares e·10000 ≤ p·(10000 + bp) exactly: 13.200.000 within, 13.200.000,01 outside for P 12.000.000 and 10 %")`
  - `it("formats COP with dots as thousands separators and no decimals when whole")`
- **GREEN:** implement per §4.9 signatures (UTC day numbers via `Date.UTC`; bigint arithmetic).
- **REFACTOR:** share `assertIsoDate`; no exports beyond §4.9.
- **Commands:** `npx vitest run src/lib/proyectos/weeks.test.ts src/lib/proyectos/money.test.ts`; CMD-STD.
- **Acceptance:** all tests green; no import of `@/lib/db`/`next/*`; `rg -n "parseFloat|Number\(" src/lib/proyectos/money.ts` empty.
- **Deps:** none. **Gate:** none (RF-07 PO-C). **Lines:** ~220 (tests ~130).
- **Commit:** `feat(projects): add pure week and money libraries for v2 (S0.5)` · **PR-02**.
- **DONE 2026-09-30.** 36 tests green (17 weeks + 19 money); `tsc` 0 errors; eslint clean;
  `rg -n "parseFloat|Number\(" src/lib/proyectos/money.ts` empty; no `@/lib/db` or `next/*` import. Deviations:
  (1) `formatCOP` renders `"$ 59.500.000"` with a space, matching the repo's Intl `es-CO` output, and is computed
  in bigint instead of delegating to Intl with a float; (2) `tsconfig`'s ES2017 target is left untouched, so named
  `BigInt(...)` constants replace bigint literals; (3) `dateToWeek` is gone — activities are created with explicit
  weeks, so the inverse has no caller. Commit recorded in §6.7.

#### S0.4 — Append-only `AuditoriaCambio` + `logChange` (M, decision-free)
- **Goal:** per-field before/after audit that the app cannot alter (RF-04, RNF-05, est §7.4).
- **Files:** `prisma/schema.prisma` (enum `AccionAuditoria`, model `AuditoriaCambio`); NEW migration
  `prisma/migrations/<ts>_v2_auditoria_cambios/migration.sql` (table + trigger function + 2 triggers, §4.12);
  NEW `src/lib/api/audit-cambios.ts`, `src/lib/api/audit-cambios.test.ts`,
  `prisma/auditoria-cambios.invariant.test.ts`.
- **RED** (`audit-cambios.test.ts`, db mocked):
  - `it("diffFields returns one entry per changed field with before and after values")`
  - `it("diffFields ignores unchanged fields and normalises Decimal and Date to strings")`
  - `it("logChange inserts through the given transaction client, not the global db")`
  - `it("logChange propagates insert errors instead of swallowing them")` (contrast with `logAudit`)
  - `it("logChanges writes all rows with one createMany call and the shared lote_id")`
- **RED** (`prisma/auditoria-cambios.invariant.test.ts`, live local DB, forced rollback):
  - `it("accepts INSERT into auditoria_cambios")`
  - `it("rejects UPDATE on auditoria_cambios with the append-only trigger")`
  - `it("rejects DELETE on auditoria_cambios with the append-only trigger")`
  - `it("rejects TRUNCATE on auditoria_cambios")`
- **GREEN:** `npm run db:migrate -- --create-only --name v2_auditoria_cambios` (check the script forwards args;
  otherwise `node --env-file=.env.local node_modules/prisma/build/index.js migrate dev --create-only --name
  v2_auditoria_cambios`), add trigger SQL, apply with `npm run db:migrate`; implement module.
- **REFACTOR:** export `AUDIT_ENTIDADES_V2` constant union for entity names.
- **Commands:** `npx vitest run src/lib/api/audit-cambios.test.ts prisma/auditoria-cambios.invariant.test.ts`; `npm run db:migrate:status`; CMD-STD.
- **Acceptance:** 9 tests green; `logAudit` untouched (`git diff --stat src/lib/api/audit.ts` empty).
- **Deps:** none. **Gate:** none. **Lines:** ~260.
- **Commit:** `feat(audit): add append-only auditoria_cambios with per-field diff (S0.4)` · **PR-03**.
- **DONE 2026-09-30.** 16 tests green (12 unit + 4 live-DB invariant); full suite 120 files / 1093 tests; `tsc` 0
errors; eslint clean; `logAudit` untouched (`git diff --stat src/lib/api/audit.ts` empty). The generated migration also
carries two cosmetic FK renames Prisma normalised (`bitacora_entradas`, `tareas`).

#### S0.6 — Migration safety kit (M, decision-free)
**DONE 2026-10-01.** 13 tests green (5 guard + 8 harness); `tsc` 0 errors; eslint clean; both reports run read-only
against the local Docker DB (host `127.0.0.1:54322`); the dry-run path never calls `$transaction`; `--apply`
requires a reviewed `--expect-hash` and writes one `IMPORTAR` lote inside a single 120 s transaction, with the
recompute+compare *before* any write; `--revert` is scoped to one lote. Deviations: the guard wraps
`prisma/require-local-db` (not the nonexistent `prisma/load-local-env`); `PlanCount` is a five-column row list;
`__fixtures__/guard-probe.ts` was added to prove import order; `_harness.ts` imports only `connectionTarget` (no
side-effect guard) so the tests load without a configured DB; `s1-rubros-report.ts` probes `to_regclass` and
reports zero rows with an explicit "schema not migrated yet" note, because the v2 budget tables do not exist yet;
`storage-orphans.ts` walks the whole bucket for "rows without object" and restricts "objects without row" to the
`proyectos/` prefix. Residual (recorded, not blocking): no runtime `revert()` implementation exists yet, so lote
scoping is exercised only at harness level.

- **Goal:** make it impossible for a v2 data script to write anywhere but the local Docker DB; count-first
  harness; read-only storage orphan report; remote promotion checklist.
- **Note (2026-09-30):** the loopback guard this task originally had to create **already exists**. `prisma/local-env.ts` + `prisma/require-local-db.ts` and the `db:*:local` scripts landed with commit `96c4c5c` (see §6.7). S0.6 therefore builds only the count-first harness, the read-only storage orphan report and the promotion checklist on top of it.
- **Files:** `scripts/migrate-v2/_guard.ts` (thin wrapper re-exporting `prisma/local-env.ts`),
  `scripts/migrate-v2/_guard.test.ts`,
  `scripts/migrate-v2/_harness.ts`, `scripts/migrate-v2/_harness.test.ts`, `scripts/migrate-v2/storage-orphans.ts`,
  `scripts/migrate-v2/s1-rubros-report.ts` (count-first report for N-13, read-only), `.gitignore` (`scripts/migrate-v2/out/`),
  this document §6.5 (checklist).
- **RED** (`_guard.test.ts`, spawn a child process with a fake env so the real `.env.local` is not needed):
  - `it("aborts before importing the db client when DATABASE_URL is not loopback")`
  - `it("aborts when DIRECT_URL or NEXT_PUBLIC_SUPABASE_URL is remote")`
  - `it("error message names the host and never the password")`
  - `it("has no flag or env var that bypasses the guard")` (asserts `--allow-remote`/`FORCE` are rejected/ignored)
  These four are already covered by `prisma/local-env.test.ts` (commit `96c4c5c`); this file asserts them
  through the harness entrypoint so a regression in the wrapper is caught too.
- **RED** (`_harness.test.ts`, db mocked):
  - `it("dry-run prints counts and decisions and never opens a write transaction")`
  - `it("apply refuses when --expect-hash does not match the recomputed plan")`
  - `it("apply is idempotent: a second run reports zero actions")`
  - `it("revert only touches rows created by the given lote")`
  - `it("writes the markdown report to scripts/migrate-v2/out/")`
- **GREEN:** `_guard.ts` re-exports `assertLocalDatabaseUrl`/`loadLocalEnv` from `prisma/local-env.ts` (already
  implemented: loads `.env.local`, loopback-only, credential-free errors, no bypass) and adds a
  `describeTarget()` helper printing the host only; harness per §4.5; orphan report uses `createSupabaseAdmin()`
  (VERIFIED used by `prisma/seed.ts`) with `list()` only.
- **REFACTOR:** shared `printTable()`.
- **Commands:** `npx vitest run scripts/migrate-v2/_guard.test.ts scripts/migrate-v2/_harness.test.ts`;
  `npx tsx --env-file=.env.local scripts/migrate-v2/s1-rubros-report.ts` (prints the N-13 count report — record
  output in §6.7); `npx tsx --env-file=.env.local scripts/migrate-v2/storage-orphans.ts`; CMD-STD.
- **Acceptance:** guard tests green; on a fresh local DB the count-first report runs read-only and reports zero
  rows (there is no v1 data to reassign — the report exists for rubros suspended later); orphan report runs
  read-only.
- **Deps:** none (S0.4 for lote rows at `--apply`; harness can stub until then). **Gate:** none. **Lines:** ~250
  (reduced from ~330: the guard half is already built and tested).
- **Commit:** `feat(db): add guarded v2 migration harness and read-only reports (S0.6)` · **PR-04**.

#### S0.1 — Decision log + freeze superseded openspec changes (S, docs)
- **Goal:** record the 2026-09-29 USER-RESOLVED decisions and the PO answers when they arrive; mark the six v1
  openspec changes as superseded (no archive into main specs).
- **Files:** `odd/tasks/v2-projects-and-clients-plan.md` (decision table already updated — add a "see SDD" link),
  `openspec/changes/{proyecto-financiero-tab,proyecto-legalizacion-tab,proyecto-metas-tab,proyecto-soportes-tab,tablero-gerencial-unificado,admin-umbrales-editables}/proposal.md`
  (prepend a "Status: SUPERSEDED by odd/tasks/v2-projects-sdd.md (2026-09-29)" line). Note: `proyecto-financiero-tab`
  `proposal.md`/`design.md` are currently **untracked** (git status) — ask the user whether to commit them as-is
  before marking (§6.8 D-07).
- **TDD:** n/a (docs). **Acceptance:** six files carry the status line; decisions table references §7.3.
- **Deps:** none. **Gate:** none. **Lines:** ~30. **Commit:** `docs(openspec): mark v1 project changes superseded by v2 (S0.1)` · **PR-01**.
- **Scope recalibrated 2026-10-01 (session 5) — read this before writing S0.1.** Of the six v1 openspec changes named
  above, **only `proyecto-financiero-tab` exists** in the tree; the other five (`proyecto-legalizacion-tab`,
  `proyecto-metas-tab`, `proyecto-soportes-tab`, `tablero-gerencial-unificado`, `admin-umbrales-editables`) do not
  exist at all. Only `openspec/changes/{close-phase-1,oportunidades-comerciales}` are tracked (13 files). And
  `proyecto-financiero-tab/` is excluded by **`.git/info/exclude`**, not `.gitignore` — a per-clone and untracked file,
  so `git status` shows nothing for it even though the files are on disk. **D-07 is resolved** (see §6.8): mark it
  superseded and leave it out of git. The task therefore shrinks to prepending the status line to that one change,
  correcting this file list, and linking the decisions table to §7.3.

#### S0.7 — Project permission predicates; COORDINADOR out of project management (M)
**DONE 2026-10-01.** Scope recalibrated before writing: `src/lib/api/projects.ts`, `src/app/api/v1/projects/**`,
`src/components/proyectos/**` and `src/lib/openapi/paths/projects.ts` **do not exist on this branch** (they belonged
to the never-shipped v1 module), so this task delivers the pure predicates and their tests only; the three route
403 tests and the UI "hides the Crear proyecto CTA" test move to the slice that builds the v2 routes (S2.x).
14 new test cases (34 → 48 cases in `permissions.test.ts`) plus one added during verification
(`canApproveBaseline`/`canApproveModification` manager-true); `permissions.test.ts` +
`permissions.read.test.ts` = **63 green**; `tsc` 0 errors; eslint clean. The pre-existing exports are
byte-identical: `git diff -U0` shows a single pure append (`@@ -67,0 +68,120 @@`), 0 deletions. Independent verifier
confirmed every predicate against the contract, **zero `canManageAny` calls** in the new block and **no write
predicate reading the gerencial flag**. Deviations: `canViewFinancialSupports` and `canExecuteProject` are granted
to a COORDINADOR by **membership**, never by the flag, so the flag's non-granting is asserted with a
non-member fixture (a COORDINADOR member does get the financial axis); `canViewPortfolio` uses
`PROJECT_MANAGER_ROLES || flag`, deliberately NOT `canManageAny`, so a COORDINADOR gets no global portfolio view.

- **Goal:** REQ-ACC-01, REQ-ACC-04 predicates, ADR-08; behavior change tested.
- **Files (RECALIBRATED 2026-10-01):** `src/lib/permissions.ts`, `src/lib/permissions.test.ts`. The original list
  here named `src/lib/api/projects.ts`, `src/app/api/v1/projects/{route,[id]/route}.test.ts`, the opportunities→
  project route test, `src/components/proyectos/project-list.test.tsx`, `src/lib/openapi/paths/projects.ts`,
  `src/lib/openapi/paths/dashboard-admin.ts` and `src/components/admin/users-table.tsx` — **none of the project
  ones exist on this branch**; only the two `src/lib/permissions*` files are real. Do not re-add the v1 paths to
  this task.
- **RED** (`permissions.test.ts`):
  - `it("canCreateProject is true only for ADMINISTRADOR and GERENCIA")`
  - `it("canManageProject denies a COORDINADOR on a project they are not responsable of")`
  - `it("canManageProject allows the COORDINADOR responsable (v1 path) and denies a COLABORADOR responsable")`
  - `it("canExecuteProject requires COORDINADOR membership unless the actor is a project manager")`
  - `it("canViewFinancialSupports excludes the Visualizador flag")`
  - `it("canValidateExpense denies the user who registered the expense")`
  - `it("canManageAny still includes COORDINADOR for clients, tasks and documents")` (regression)
  - `it("puede_ver_tablero_gerencial never grants write in any project predicate")`
- **RED** (routes) — **DEFERRED to S2.x** (2026-10-01): `it("POST /api/v1/projects returns 403 for COORDINADOR")`,
  `it("POST .../opportunities/:oid/project returns 403 for COORDINADOR")`,
  `it("PATCH /api/v1/projects/:id returns 403 for a non-responsable COORDINADOR")` and the UI
  `it("hides the Crear proyecto CTA for COORDINADOR")` cannot be written here: no v2 project route, component or
  openapi path exists yet. They are part of the acceptance of the first v2 project route slice.
- **Commands:** `npx vitest run src/lib/permissions.test.ts src/lib/permissions.read.test.ts src/app/api/v1/projects src/components/proyectos/project-list.test.tsx "src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project"`; CMD-STD.
- **Acceptance:** all green; clients/tasks/documents suites unchanged and green.
- **Deps:** none. **Gate:** N-01, DP-02, DP-06 — all USER-RESOLVED; **D-02** resolved 2026-09-30: the
  COORDINADOR project-write restriction is applied directly (see §6.8). **Lines:** ~300. **Commit:** `feat(projects)!: restrict project management to ADMINISTRADOR and GERENCIA (S0.7)`
  (the `!` marks the behavior change; body explains COORDINADOR impact) · **PR-06**.

#### S0.8 — Upload-limit verification (S, investigation + decision record)
**DONE 2026-10-01, and it closed without the dashboard.** The remote bucket's `file_size_limit` was read read-only
through the Storage API with the service key already present in `.env` (10 MB, not public, no MIME restriction), and
the Vercel body limit turned out to be a documented platform constant (4.5 MB) rather than an account value. The
decisive result: the 4.5 MB function limit binds **before** the app's 10 MB / 25 MB checks, so multipart can never
honour 25 MB — **D-04 is resolved to the signed direct upload of ADR-13**. Full record in §6.7.

- **Goal:** turn R-02 into facts before raising limits (DP-10).
- **Checks (read-only; no remote writes):** (1) Vercel function request-body limit for the current plan
  (docs/dashboard, by the user); (2) remote bucket `muttu-docs` `file_size_limit` (documented 10 MB,
  `docs/plan-supabase-manana.md:53`) — the user reads it in the Supabase dashboard; (3) local
  `supabase/config.toml:118` = 50 MiB (VERIFIED); (4) API routes bypass `src/proxy.ts` (VERIFIED matcher excludes
  `api`, so `proxyClientMaxBodySize` does not apply — Next doc
  `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`);
  (5) current effective limits per route (10 MB documents/project supports, 25 MB default task attachments).
- **Output:** a short "Upload limits" record in §6.7 + decision D-04: multipart (if hosting ≥ 25 MB) or signed
  direct upload (ADR-13).
- **TDD:** n/a. **Deps:** none. **Gate:** **resolved 2026-10-01** — no dashboard read was needed; see the record in §6.7. **Lines:** ~20.
- **Commit:** `docs(odd): record verified upload limits and approach (S0.8)` · **PR-01** (or its own if late).

#### S0.9a — Unified upload policy: 25 MB, light types, never delete (S)
**DONE 2026-10-01.** One policy now lives in `src/lib/api/files.ts` and everything derives from it: the two upload
routes that exist, the client hook, both UI surfaces and the OpenAPI descriptions. Final policy: limit
`MAX_FILE_SIZE_MB` when it is a plain positive integer, else **25 MB**; extensions
`{pdf, docx, xlsx, pptx, jpg, jpeg, png}`; `isAllowedFileType` = **allowed extension AND (allowed MIME or empty or
`application/octet-stream`)** — it used to be OR, which let `report.exe` through on a PDF MIME. The attachments
route's duplicate constants and its 13-type wider list are gone; the documents 413 message no longer hardcodes
10 MB. 14 paths, +409/−117 plus a new 120-line guard spec; suite **123 files / 1143 tests green**, `tsc` 0 errors,
eslint clean.

- **Scope recalibrated before writing:** `src/app/api/v1/projects/[id]/attachments/route.ts`,
  `src/components/proyectos/soporte-dialog.tsx` and `src/hooks/projects.ts` in the original file list **do not exist**
  (they belong to a later v2 slice) → deferred there. `src/app/api/v1/documents/[id]/versions/route.ts` also uploads
  and was missing from the list → included.
- **Deliberate deviations:** `jpeg` was **added** to the extension allowlist (same format as `jpg`; rejecting the
  extension would be an accidental regression, not a narrowing); the two 400 messages now say "JPG/JPEG" (they
  under-advertised what the code accepts — the same defect class as R3-001); and the env override is validated as a
  plain integer, so `MAX_FILE_SIZE_MB="5abc"`/`"2.9"` falls back to 25 MB instead of silently setting 5 MB/2 MB.
- **Follow-ups recorded (not silent gaps):** (1) **documentation drift** — `README.md:33,408`,
  `docs/Muttu_Hub_PRD_v2.md:562,1037` and `voy-a-hacer-un-synthetic-rabin.md:249` still say 10 MB; fixing them is
  deferred until S0.9b lands **and** the bucket is raised, because advertising 25 MB while production still caps at
  4.5 MB/10 MB would be the more misleading statement; (2) the never-delete guard's regexes do not cover
  `storage.update()`, `upload(..., { upsert: true })`, `deleteBucket`/`emptyBucket`/`createBucket`, variable-bound
  bucket objects, or anything outside `src/` — harden when S0.9b adds signed-upload code paths; (3) the AND rule
  rejects an allowed extension sent with a legacy MIME such as `application/vnd.ms-excel` / `application/vnd.ms-word`
  (spec-compliant, but a plausible real-client tightening) — widening the MIME set is a **product decision**;
  (4) `MAX_FILE_SIZE_MB` is not `NEXT_PUBLIC_`, so the browser resolves it to undefined and the UI always advertises
  the 25 MB default while a deployment with a different value enforces that other value (pre-existing class; fix path
  is a `NEXT_PUBLIC_` variable or a server-provided prop); (5) 153 of 315 tracked `src/**/*.{ts,tsx}` files lack a
  trailing newline — a repo-wide normalisation, if wanted, belongs in its own slice.
- **Native review: APPROVED and acknowledged (2026-10-01).** Lineage `review-f168688ab3c24e95`, candidate = this work
  unit only (15 files / 699 lines, tier **medium**, one lens: `review-reliability`). Consent was relayed, the review ran
  via the Pi host relay (1 model run, ~6 min), the outcome was `approved`, and the acknowledgement burned the authority
  (`gentle-ai.review-acknowledged/v1`). This is the first native review cycle completed end to end in this project —
  the S0.6 lineage is still stranded at `correction_required` because the post-correction validator slot cannot be
  driven from the Pi facade. Three **non-blocking advisory findings** were recorded with the closure and must be treated
  as separate later work, never as a reason to re-run the review on this candidate:
  - **R3-001** (WARNING, `src/lib/api/files.ts:98`) — the silent-MIME escape: a file with an allowed extension always
    passes when the client sends no MIME or `application/octet-stream`, so the **extension is the real identity** and a
    renamed executable slips through. Intentional (curl sends `octet-stream` for valid files) but a residual that must
    be stated rather than implied. Fix path if wanted: magic-byte sniffing, a product decision.
  - **R3-002** (WARNING, `src/hooks/kanban.ts:540`) — `MAX_FILE_SIZE_MB` is not `NEXT_PUBLIC_`, so the browser always
    resolves the 25 MB default while a deployment with another value enforces that other value: the client can accept
    what the server rejects. Fix path: expose the effective limit (a `NEXT_PUBLIC_` variable or a server-provided prop).
  - **R3-003** (SUGGESTION, `src/lib/api/files.test.ts:69-71`) — the test titled "rejects a 25 MB + 1 byte file with the
    25 MB message" exercises no file and no message: it only compares constants and arithmetic. Make it drive a real
    `File` (or retitle it and lean on the route-level 413 assertions that do).
  All three are folded into the next upload-related work unit (S0.9b), except the magic-byte question, which is a
  product decision.

- **Goal:** REQ-FIL-01..03 for ALL uploads.
- **Files:** `src/lib/api/files.ts` (+ test): `MAX_FILE_BYTES` from `MAX_FILE_SIZE_MB` default 25; `isAllowedFileType`
  = extension AND (MIME allowed or empty/octet-stream); `src/app/api/v1/tasks/[id]/attachments/route.ts` (drop its
  duplicate constant and wider list — only if D-05 = narrow), `src/app/api/v1/documents/route.ts`,
  `src/app/api/v1/projects/[id]/attachments/route.ts` (messages "25 MB" from the constant),
  `src/components/proyectos/soporte-dialog.tsx`, `src/components/documents/upload-dialog.tsx` (client hint text);
  NEW `src/lib/api/no-storage-delete.test.ts`.
- **RED:** `it("rejects a 25 MB + 1 byte file with 413 FILE_TOO_LARGE and the 25 MB message")`,
  `it("accepts exactly 25 MB")`, `it("rejects report.exe sent with MIME application/pdf")`,
  `it("accepts photo.JPG with an empty MIME")`, `it("MAX_FILE_SIZE_MB env overrides the default")`,
  `it("no source file calls storage remove()")` (reads `src/**/*.ts` and asserts no `.storage` chain ending in `.remove(`).
- **Deps:** S0.8. **Gate:** S0.8 outcome; remote bucket raised to ≥ 25 MB by the user **before deploying**;
  D-05 for task-attachment types. **Lines:** ~180.
- **Commit:** `feat(files): unify upload policy at 25 MB with strict type allowlist (S0.9a)` · **PR-07**.

#### S0.9b — Direct-to-storage signed upload (M, conditional)
**DONE 2026-10-01 (session 4).** ADR-13 signed direct-to-storage uploads are complete for every upload surface that
exists on this branch: the sign endpoint (three kinds), the key-ownership guard, JSON confirm mode in the version,
task-attachment and document-creation routes (all multipart branches untouched and behaviour-identical), and all three
clients on sign → PUT (`x-upsert: false`) → JSON confirm. Suite **126 files / 1194 tests green** at slice close
(baseline at the partial `7a5e29f`: 125 files / 1167 tests; +1 file and +27 tests accounted for), `tsc` 0 errors,
eslint clean.

**What landed in this slice** (sessions 3 + 4: `7a5e29f` partial, `a5a3c5f` docs, then the completion commit)
- `POST /api/v1/uploads/sign` takes
  `{ kind: "tarea_adjunto" | "documento_version" | "documento_nuevo", ref_id?, nombre, tamano_bytes, tipo_mime?, cliente_id?, titulo?, categoria?, force? }`,
  authorises the target, chooses the key **server-side** and returns
  `{ storage_path, token, signed_url, max_bytes, allowed_extensions, documento_id? }`. It never returns the service key,
an anon key or a public object URL.
- `documento_nuevo` **pre-generates the document id** and signs the FINAL key
  `documentos/{cliente|general}/{newId}/v1_{nombre}` — no temporary key and no rename, because the never-delete policy
  forbids moving the object afterwards.
- The confirm branch of `POST /api/v1/documents` **derives** the id and the owning cliente from the signed
  `storage_path` (4-segment shape + `UUID_RE` + a byte-identical rebuild against `documentStoragePath`), never trusting
  a client-supplied id, verifies that the object exists and is not larger than declared or `MAX_FILE_BYTES`, and then
  creates the row with that explicit id, its v1 version, its audit entry and the same best-effort text extraction as
  the multipart branch. A *thrown* Storage error is caught and returns the `{error, code}` envelope rather than
  escaping as a framework 500.
- `src/hooks/documents.ts` (`useUploadDocument` and the version upload) and `src/hooks/kanban.ts`
  (`useUploadAttachment`) all use the signed path, and the kanban client still invalidates both the task's attachments
  and the nav counts badge.

**B1 — the blocking finding the independent verifier caught, and its correction.** Moving creation to the signed path
initially put the **duplicate-title 409 and the categoria 400/403 after the browser PUT**: the sign request did not
carry `titulo` or `categoria`, so those checks could only run at confirm. The multipart branch had rejected the same
request **before** any Storage write, so with the never-delete policy the object became permanent — a *routine* flow
leaked one orphan per attempt. Three triggers, all reachable from the shipped dialog: the duplicate title (the exact
flow QA audit #4 exists for), the restricted-category 403 (the dialog renders every category, including restricted
ones) and the invalid-category 400 (the dialog falls back to the static list while the live catalog loads or fails).
**R-17's recorded acceptance did not cover this**: R-17 is about the *size* guarantee, not about triggers unbounded in
count. **Correction:** the `documento_nuevo` sign request now carries `titulo`, `categoria` and `force?`, and the new
shared guard `guardDocumentCreate` — categoria validity 400, restricted-category 403, duplicate-title 409, in
`src/lib/api/documents.ts` — runs **inside the existing authorise phase, before `createSignedUploadUrl` is called**, so
a rejected request never gets a URL and therefore never PUTs. The confirm branch re-runs the same guard as defence in
depth. The recorded validation order (auth → configured → shape → policy → authorise) is unchanged. Tests pin it: every
new rejection asserts `createSignedUploadUrl` was not called, and the hook test asserts the duplicate-title flow
performs exactly one fetch, to the sign endpoint, with no PUT.

**Residuals and follow-ups recorded, not silently accepted**
1. **R-17 shrinks but does not disappear** (see its row below): the confirm re-check still runs after the PUT, so a
   *concurrent* create inside the sign→confirm window — or an oversized object — can still orphan an object.
2. ~~**The multipart branch still carries its own inline copy** of the categoria/duplicate logic. Its `POST` body is
   byte-identical to HEAD apart from the JSON-dispatch block, so it was deliberately not refactored onto
   `guardDocumentCreate`; nothing prevents drift → consolidate in a later slice.~~ **CLOSED 2026-10-01 (session 5,
   `8d10180`):** the multipart branch now takes categoria validity, restricted-category authorization and the
   duplicate-title conflict from `guardDocumentCreate`, and its inline copies are gone, so the QA-audit-#4 logic has
   one home. The accepted consequence is that the guard's `categoria` trim now applies there too: a padded valid value
   that used to 400 now validates, and the trimmed value is what gets persisted.
3. **Magic-byte validation (R3-001) — RESOLVED 2026-10-01 (user): the residual is ACCEPTED, deliberately not implemented.**
   The policy keeps validating extension **AND** MIME, and nothing sniffs the file's content, so a binary renamed to
   `informe.pdf` and sent with `application/pdf` still passes. The user weighed implementing signature sniffing
   (which on the signed path would also mean reading the object's head back from Storage) against the risk and chose to
   accept it as documented. Revisit only if a real abuse case appears.
4. Confirming the same `documento_id` twice hits the Prisma unique constraint → 500 (the same replay shape as the
   versions confirm; pre-existing).
5. Small: ~~the guard's own tests do not assert `mode: "insensitive"` / `deleted_at: null` on the duplicate lookup~~
   **CLOSED 2026-10-01 (session 5):** the guard's tests now pin both clauses with an exact `toHaveBeenCalledWith`, so
   silently dropping either fails. Still open from this item: the
   OpenAPI declares the per-kind-required fields as optional (documentation nit); `useUploadDocument`'s sign call uses
   raw `fetch` instead of `apiPost` so the 409's `documento` payload survives (it loses the `Accept` header and the
   generic fallback messages; no user-visible regression); confirmed versions skip inline text extraction until the
   backfill runs; and a concurrent version create can leave the key's `vN` differing from the row's `numero_version`
   (cosmetic — downloads use `storage_path`).
6. The user-run **bucket raise to 25 MB is still pending**, so production still caps below the policy (Vercel's 4.5 MB
   on the multipart paths, the bucket's 10 MB as the signed path's hard bound) — which is why the 25 MB docs drift
   stays deferred.
7. **Two advisory findings from the slice's own native review** (the receipt is approved; neither opened a correction and neither reopens the review, so they are separate later work): **R3-1** (WARNING, `src/app/api/v1/documents/route.ts:229-249`) — ~~the confirm branch's `documento.create` → `documentoCliente.create` → `documentoVersion.create` sequence is not transactional, so a failure between the steps can leave a document row without its v1 version; the multipart branch has the same shape and soft-deletes the orphan document only when the *upload* fails, so this is pre-existing rather than introduced.~~ **CLOSED 2026-10-01 (session 5, `8d10180`):** the three inserts are now ONE `db.$transaction`, so a rejected insert cancels the whole create; `logAudit` and the best-effort extraction stay outside it, and the rejection path answers the 500 envelope without auditing or writing. The multipart branch keeps its compensating shape (soft delete on upload failure) by design, untouched. Still open from this item: **R3-2** (SUGGESTION, `src/app/api/v1/documents/[id]/versions/route.ts:103`) — that confirm route awaits `storedObjectSize` without a local try/catch, unlike the documents confirm after C2; it is harmless there because that route's `POST` is wrapped in `withApiErrorHandling`, so a thrown Storage error still returns the `{error, code}` envelope. Worth knowing: C2 was a real gap in the documents branch precisely because its `POST` is a bare exported function with no such wrapper.
8. **The hygiene unit's own residuals (session 5, `8d10180`).** (a) **Ordering deltas**, accepted and deliberate: the live
   catalog now loads *after* the multipart form checks, so a malformed form answers its own 400 instead of the catalog's
   500 (and no settings error is logged for it); and the etiquetas check now precedes the categoria check, so a request
   failing both gets `Demasiadas etiquetas` instead of `Categoría no válida` — both 400 `VALIDATION_ERROR`. No test pins
   either combination. (b) **Dead flag:** `parseUploadForm`'s `requiereCategoria`/`categorias` parameters are now
   `false`/`[]` at *both* call sites, so that branch is dead in production; kept deliberately so the versions route and
   its test stayed byte-identical — remove the parameter in a later unit. (c) **Stale comment:**
   `src/lib/openapi/paths/documents.ts` still says the multipart schema requires the categoria via
   `(requiereCategoria: true)`, which is no longer how it is enforced (the observable contract is unchanged). Fix it
   together with the dead flag — they are the same follow-up. (d) **H2 proof depth:** atomicity is proven structurally
   (one `db.$transaction`, op identity, and the rejection path), not against a real Postgres rollback, because no
   database is touched. (e) **This unit's native review** (lineage `review-d4d492b8adb83210`, 3 files / 247 lines, tier
   medium, one reliability lens, approved and burned) carried one advisory WARNING at
   `src/app/api/v1/documents/route.ts:526`, disposition `informational`, with no description in the closure envelope and
   no correction offered. **Watch the ID collision:** finding IDs are numbered per review, so this `R3-001` is *not* the
   slice review's `R3-001` (which is the magic-bytes item above). (f) The multipart create→upload path stays
   non-atomic by design (compensating soft delete), untouched.

**Closure decisions taken in session 4 (2026-10-01), before writing code:**

- **(a)** Items 1 and 3 are in scope for this slice and are implemented with strict TDD (one delegated writer, one
  independent read-only verifier).
- **(b)** Item 4's ordering finding is **accepted as-is, not reordered**: the sign endpoint keeps
  auth → configured → shape → policy → authorise, so a forbidden target with a disallowed extension answers 400
  instead of 403. The policy check reads only the caller's own payload and therefore distinguishes nothing about the
  target, and rejecting a malformed request before the target lookup is the cheaper order. The behaviour and this
  reasoning are recorded here so it is a decision, not an accident.
- **(c)** Item 2 (magic-byte validation, R3-001) was an **open product decision** at the time of this slice and was
  explicitly **out of it**; nothing about it was silently accepted. **Resolved 2026-10-01 (user): the residual is
  accepted as documented — see residual 3 in the S0.9b block.**
- **(d)** **R-17 is accepted for now** with the bucket `file_size_limit` as the enforced hard bound — recorded as an
  explicit promotion step (§6.5 step 3) — and detected with the S0.6 read-only
  `scripts/migrate-v2/storage-orphans.ts`. The human-run sweeper stays an **open decision** and is surfaced to the
  user; no new deletion path is added (the never-delete policy and its guard spec are untouched). **Amended 2026-10-01
  after B1:** this acceptance covers the *size* guarantee only, so B1's routine orphan triggers (duplicate title,
  categoria 400/403) were **not** accepted — they were fixed by moving those gates before the URL is issued. R-17 now
  covers only what remains after that correction.

**Open risk R-17 — must be consciously accepted or mitigated before promotion.** The signed path moves the size
guarantee *after* persistence: the sign endpoint checks the **declared** size, but the browser PUT goes straight to
Storage, and the real size is only checked at confirm — which then fails. An authorised user can therefore leave an
**oversized orphan object** that the app's never-delete policy forbids removing. The enforced bound is the bucket's
`file_size_limit` (10 MB in production today, to be raised to 25 MB), **not** the app. Mitigations: keep the bucket
limit as the hard bound and put it in the promotion checklist; use the S0.6 read-only
`scripts/migrate-v2/storage-orphans.ts` report to find objects without a row; decide whether a human-run sweeper is
wanted. The multipart path did not carry this exposure because the platform body cap bounded it.

- **Scope recalibrated 2026-10-01:** `src/app/api/v1/projects/[id]/attachments/route.ts` and `src/hooks/projects.ts`
  in the list below **do not exist yet** (later slice) → out of scope. In scope: NEW `src/lib/api/signed-upload.ts`,
  NEW `src/app/api/v1/uploads/sign/route.ts`, the confirm mode in `src/app/api/v1/documents/route.ts` and
  `src/app/api/v1/tasks/[id]/attachments/route.ts`, and `src/hooks/documents.ts`. **Gate satisfied:** D-04 resolved
  to signed direct upload, because the 4.5 MB Vercel body limit is a platform constant that binds before the app's
  own checks (§6.7).
- **Goal:** ADR-13 — only if S0.8 confirms the hosting body limit < 25 MB.
- **Files:** NEW `src/lib/api/signed-upload.ts` (+ test), NEW `src/app/api/v1/uploads/sign/route.ts` (+ test),
  `src/app/api/v1/projects/[id]/attachments/route.ts` (confirm mode), `src/app/api/v1/documents/route.ts`,
  `src/app/api/v1/tasks/[id]/attachments/route.ts`, `src/hooks/documents.ts`, `src/hooks/projects.ts` (upload helpers).
- **RED:** `it("sign returns a signed upload URL for a server-chosen key when the actor may upload")`,
  `it("sign rejects size > 25 MB and disallowed types before issuing a URL")`,
  `it("confirm rejects a storage_path outside the key issued for this project")`,
  `it("confirm rejects when the storage object is missing or larger than declared")`.
- **Deps:** S0.9a. **Gate:** D-04. **Lines:** ~380. **Commit:** `feat(files): upload large files directly to storage via signed URLs (S0.9b)` · **PR-08**.

### 5.2 Slice S1 — Catalogs and admin (RF-33, RF-34, RF-35)

#### S0.10 — Production drift record and the cleanup decision (S, docs + human-gated)
**DONE 2026-10-01.** The verified production state is recorded in §6.9 (8 abandoned v1 tables with 4 rows total,
`auditoria_cambios` absent, 12 applied migrations including the phantom `20260918153200_tablero_seguimiento_social`),
R-16 was added, D-10 records the "leave them" default, §6.5 now forbids `migrate dev` against production, and the
R-01 cell was corrected: the no-bypass refusal lives in the guarded entry points, not in the Prisma CLI.

- **Goal:** keep the measured production state and the migration drift in the plan of record so no future
  promotion starts from a false model of production.
- **Files:** this document (§6.5, §6.7, §6.8, §6.9) and `odd/tasks/v2-projects-execution.md`. Docs only.
- **TDD:** n/a. **Acceptance:** §6.9 carries the measured numbers; R-16 and D-10 exist; §6.5 warns about the phantom
  migration and forbids `prisma migrate dev` against production.
- **Deps:** none. **Gate:** the cleanup itself (D-10) is the user's and is explicitly **out of scope** here — this
  task never writes to production. **Lines:** ~70. **Commit:** `docs(odd): record the verified production state and
  the migration drift (S0.10)`.

#### S1.1a — Rubro catalog R01–R15 with immutable codes and suspend-not-delete (M)
**Scope recalibrated 2026-10-01 (session 6) — this is GREENFIELD, not an adoption of branch code.** A read-only recon
found **no `Rubro` model, no `rubros` table, no rubros migration and no rubros route** anywhere in the repository; the
only non-SDD occurrence of "rubro" is the entity-name literal in `AUDIT_ENTIDADES_V2`
(`src/lib/api/audit-cambios.ts:37`), and nothing holds a `rubro_id` foreign key. The "VERIFIED" citations inside
REQ-CAT-02 itself (`RUBRO_PATCH_SCHEMA` at `src/app/api/v1/rubros/[id]/route.ts:22-29`, "today this succeeds", "today
soft-deletes, line 80") point at v1 code that is **not in this branch** — the same staleness class as S0.6, S0.7 and
S0.1, except this time it reached the acceptance criteria. Two consequences, both decided by the user:

- **(1) Two REQ-CAT-02 scenarios are DEFERRED, not dropped.** "409 when renaming a rubro that has associated data" and
  the "Rubro suspendido pendiente de reasignación" display both need `lineas_presupuestales` and projects, which are
  S5.x work — there is no table to hold the association yet, so the rules are untestable today and can only be faked.
  **In scope now:** the catalog, immutable codes, suspend-not-delete (`DELETE` → 409 "solo suspender", never a soft
  delete), and suspend-without-touching-already-referencing rows as a *rule* that becomes observable only once the
  budget table exists. **Deferred:** the association-dependent 409s and the suspended-rubro display, recorded as S5.x
  acceptance criteria.
- **(2) The migration MUST be adoptive and idempotent, because production already has a `rubros` table.** §6.9 measured
  all 8 abandoned v1 project tables present in production, `rubros` among them, holding `Personal`, `Transporte`,
  `Material POP` and `Operación logística`; D-10 decided to leave them. A plain `CREATE TABLE rubros` would fail at
  `migrate deploy` (the table exists, our migration is not in `_prisma_migrations`), and §6.5 forbids reconstructing
  production's schema from the repo. So the migration must create the table when absent (the branch/local reality)
  **and** adopt it when present: add the `codigo` column if missing, backfill `R01`/`R12` for `Personal`/`Transporte`,
  leave `Material POP` and `Operación logística` suspended and code-less, and install the trigger exactly once.
  REQ-CAT-01 already describes this ("Existing rows Personal and Transporte get R01/R12"). Add it to the promotion
  checklist. **Asymmetry to carry:** only the greenfield path can be exercised end to end locally; the adoption path
  needs its own fixture.

- **Goal:** REQ-CAT-01/02 for rubros, minus the two deferred scenarios above.
- **Files:** `prisma/schema.prisma` (**NEW** `Rubro` model: `codigo` unique and immutable, `nombre`, `activo`,
  ordering); NEW migration dir `prisma/migrations/<ts>_v2_rubros_codigo/migration.sql` (table + `codigo` column +
  conditional immutability trigger + the adoptive, idempotent backfill); NEW `scripts/migrate-v2/s1-rubros.ts` + NEW
  `scripts/migrate-v2/s1-rubros.test.ts` (pure `planRubros()`); NEW `src/app/api/v1/rubros/route.ts` + NEW
  `src/app/api/v1/rubros/[id]/route.ts` (+ tests); NEW `prisma/rubros.invariant.test.ts` (live DB, `import
  "./require-local-db"` first, forced rollback — mirror `prisma/auditoria-cambios.invariant.test.ts`);
  `prisma/seed.ts` (new installs get R01–R15); `src/lib/catalogs.ts` (`RUBROS_V2` constant with codes and names); NEW
  `src/lib/openapi/paths/rubros.ts` **plus its import line in `src/lib/openapi/document.ts`** — the repo's OpenAPI
  convention, a path the SDD originally omitted.
- **RED:** `it("planRubros seeds the 15 R01–R15 rubros in code order")`,
  `it("planRubros is idempotent: a second run reports 0 actions")`,
  `it("PATCH /rubros/:id allows renaming a rubro")`, `it("PATCH /rubros/:id never changes codigo")`,
  `it("PATCH /rubros/:id suspends a rubro without deleting it")`,
  `it("DELETE /rubros/:id answers 409 and never deletes")`,
  `it("GET /rubros returns the 15 active rubros ordered by codigo")`;
  live DB: `it("the database rejects updating an existing rubro codigo")` (`prisma/rubros.invariant.test.ts`).
- **Commands:** `npx vitest run src/app/api/v1/rubros scripts/migrate-v2/s1-rubros.test.ts prisma/rubros.invariant.test.ts`;
  the migration is created through the local wrapper **`npm run db:migrate:local`** (never plain `npx prisma`); then
  `npx tsx --env-file=.env.local scripts/migrate-v2/s1-rubros.ts --dry-run` and `--apply --expect-hash <h>`; CMD-STD.
- **Acceptance (recalibrated):** the local catalog is exactly the 15 active rubros R01–R15 with immutable codes;
  `PATCH` renames and suspends but never changes `codigo`; `DELETE` always answers 409; the database itself rejects a
  `codigo` change; the migration is idempotent and promotion-safe against production's legacy `rubros`.
  **Deferred to S5.x:** the 409-on-rename-with-associated-data and the suspended-rubro display string.
- **Deps:** S0.4, S0.6. **Gate:** R-codes PO-P (low risk, codes immutable → confirm before remote promotion).
- **Lines:** ~320. **Commit:** `feat(catalogs): adopt R01–R15 rubro catalog with suspend-not-delete (S1.1a)` · **PR-09**.

#### S1.1b — Suspended-rubro reassignment report (S, read-only)
- **Goal:** N-13 — count-first list of budget lines on a suspended rubro per project; no writes.
- **Files:** `scripts/migrate-v2/s1-rubros-report.ts` (from S0.6) extended with gastos per line and totals.
- **RED:** `it("reports each project line on a suspended rubro with its amount and expense count")`,
  `it("opens no write transaction")`.
- **Deps:** S1.1a. **Gate:** none (applying reassignments later is a separate, user-driven task outside this SDD).
- **Lines:** ~80. **Commit:** `feat(db): report budget lines on suspended rubros for manual reassignment (S1.1b)` · **PR-09**.

#### S1.2 — Strategic-lines catalog (M, decision-free)
- **Goal:** REQ-CAT-03 catalog part.
- **Files:** schema `LineaEstrategicaCatalogo`; migration `<ts>_v2_lineas_estrategicas` (table + seed 8 rows from
  enum, idempotent `ON CONFLICT (codigo) DO NOTHING`); NEW `src/app/api/v1/strategic-lines/route.ts`,
  `[id]/route.ts` (+ tests); `src/components/admin/` new section `lineas-section.tsx` (+ test).
- **RED:** `it("seeds the 8 RF-02 strategic lines")`, `it("GET lists active lines for any authenticated user")`,
  `it("POST/PATCH/DELETE require ADMINISTRADOR")`, `it("rename or delete of a line used by a project returns 409")`,
  `it("suspending a line keeps it on existing projects and hides it for new ones")`.
- **Deps:** S0.4. **Gate:** none. **Lines:** ~330. **Commit:** `feat(catalogs): add administrable strategic lines catalog (S1.2)` · **PR-10**.

#### S1.3 — Municipios catalog (M)
- **Goal:** REQ-CAT-04 catalog part.
- **Files:** schema `Municipio`; migration `<ts>_v2_municipios`; NEW `src/app/api/v1/municipalities/route.ts`,
  `[id]/route.ts` (+ tests); admin section `municipios-section.tsx` (+ test).
- **RED:** `it("creates a municipio with nombre and departamento unique together")`, `it("rejects duplicate código DANE")`,
  `it("rename/delete of a municipio used by a project returns 409")`, `it("suspended municipios are not offered to new projects")`.
- **Deps:** S0.4. **Gate:** N-21 (source) — default curated/empty + admin CRUD; seeding is done by this catalog task.
- **Lines:** ~300. **Commit:** `feat(catalogs): add administrable municipios catalog (S1.3)` · **PR-10**.

#### S1.4 — Semáforo parameters v2 (M)
- **Goal:** RF-35 — umbral1/umbral2 (pp), tolerancia (%), umbral de retraso (%), `avance_requiere_medio`,
  `modificacion_bloquea_periodos_pasados`, each with `confirmado:false` and audit.
- **Files:** NEW `src/lib/proyectos/semaforo-v2.ts` (params part + `parseParametrosV2`) + test; `src/lib/settings.ts`
  (`SETTING_SEMAFORO_PARAMETROS_V2 = "semaforo_parametros_v2"`, `getParametrosSemaforoV2()`); settings route (+ test);
  NEW `src/components/admin/umbrales-section.tsx` (+ test) — v2 form with "no confirmado" badges.
- **RED:** `it("defaults are 10/20 pp, 10 % tolerance and 70 % delay threshold, all unconfirmed")`,
  `it("parseParametrosV2 falls back to defaults on malformed JSON")`,
  `it("PATCH settings rejects umbral2 < umbral1")`, `it("each parameter change writes CAMBIAR_PARAMETRO with before/after")`,
  `it("the admin form shows a 'no confirmado' badge next to every unconfirmed value")`.
- **Deps:** S0.4. **Gate:** DP-04 values only (placeholders ship). **Lines:** ~320.
- **Commit:** `feat(settings): add v2 semáforo parameters with audit (S1.4)` · **PR-11**.

### 5.3 Slice S2 — Project origin and general data (RF-01, RF-02, RF-11; RF-C04, RNF-C01/C02)

#### S2.1 — Expand Proyecto: origen, valor_total, lines N..N with principal, municipios, BORRADOR (M)
- **Files:** schema (§4.2 Proyecto, ProyectoLinea, ProyectoMunicipio, enum values); migrations
  `<ts>_v2_proyecto_estado_borrador` (ADD VALUE only) and `<ts>_v2_proyecto_general` (columns, link tables,
  partial unique principal index); `src/lib/catalogs.ts` (label "Borrador"); `src/lib/api/projects.ts`
  (`PROJECT_SELECT_V2`, `toProjectItemV2`); `src/app/api/v1/projects/[id]/route.ts` PATCH v2 body (+ test);
  `src/lib/proyectos/proyecto-general.ts` (+ test): `validarLineas`, `duracionProyecto`.
- **RED:** `it("validarLineas requires at least one line and exactly one principal")`,
  `it("PATCH v2 in BORRADOR updates lines and municipios and audits each change")`,
  `it("PATCH v2 of valor_total in EN_EJECUCION returns 409 INVALID_STATE")`,
  `it("toProjectItemV2 exposes duracion_semanas derived from dates")`,
  live DB: `it("rejects two principal lines for the same project")`.
- **Deps:** S1.2, S1.3, S0.4. **Gate:** DP-05 (USER-RESOLVED), N-25 default keep states. **Lines:** ~380.
- **Commit:** `feat(projects): add v2 general data with strategic lines and municipios (S2.1)` · **PR-12**.

#### S2.2 — Autogenerated code PRY-AAAA-NNN (S)
- **Files:** schema `ProyectoSecuencia`; migration `<ts>_v2_proyecto_secuencias`; NEW `src/lib/api/project-code.ts`
  (+ test) `nextProjectCode(tx, year)`; `src/lib/proyectos/codigo.ts` (+ test) pure `formatProjectCode`,
  `parseProjectCode`.
- **RED:** `it("formats PRY-2026-001 and PRY-2026-1000")`, `it("parseProjectCode extracts year and sequence or returns null when the code does not match the format")`,
  `it("nextProjectCode increments the per-year counter with UPDATE … RETURNING in the given transaction")`,
  live DB: `it("two concurrent transactions get consecutive, distinct codes")`,
  `it("initialises the counter from the max existing PRY-AAAA-NNN code")`.
- **Deps:** S2.1. **Gate:** N-03 (format PO-P). **Lines:** ~180.
- **Commit:** `feat(projects): autogenerate PRY-AAAA-NNN project codes (S2.2)` · **PR-12**.

#### S2.3 — Creation flow with origin; one-step GANADA conversion (M)
- **Files:** `src/app/api/v1/projects/route.ts` (v2 POST independent, + test); NEW
  `src/app/api/v1/projects/eligible-opportunities/route.ts` (+ test);
  `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts` (+ test): accept `estado = GANADA`,
  convert in the same `$transaction`, prefill; `src/components/proyectos/project-form.tsx` (+ test): origin step;
  `src/components/crm/entity-dialogs.tsx` (CTA shows for GANADA); `src/hooks/projects.ts`.
- **RED:** `it("lists only GANADA opportunities without a live project")`,
  `it("creating from a GANADA opportunity converts it (fase EJECUCION, fecha_adjudicacion) in the same transaction")`,
  `it("does not overwrite fecha_adjudicacion of an already converted opportunity")`,
  `it("returns 409 for an opportunity that is not GANADA")`,
  `it("independent creation requires a cliente_id of an existing client")`,
  `it("the form asks the origin first and prefills nombre and valor from the chosen opportunity")`,
  `it("audits CONVERTIR and CREAR with the same lote_id")`.
- **Deps:** S2.1, S2.2, S0.7. **Gate:** N-02 (USER-RESOLVED), DP-07 default 1:1. **Lines:** ~400.
- **Commit:** `feat(projects): create projects from won opportunities in one audited step (S2.3)` · **PR-13**.

#### S2.4 — Value-difference alert (S)
- **Files:** `src/lib/proyectos/proyecto-general.ts` (`diferenciaValor`), routes E-03/E-05/E-06 (+ tests), form alert.
- **RED:** `it("stores diferencia_valor_oportunidad = valor_total − valor_estimado_cop")`,
  `it("returns alerta DIFERENCIA_VALOR without blocking the save")`, `it("the form shows the difference as $50.000")`.
- **Deps:** S2.3. **Gate:** N-17 default. **Lines:** ~120. **Commit:** `feat(projects): alert and record project vs opportunity value difference (S2.4)` · **PR-13**.

#### S2.6 — Team membership and membership-based visibility (M)
- **Files:** schema `ProyectoMiembro`; migration `<ts>_v2_proyecto_miembros` (+ partial unique active index);
  NEW `src/app/api/v1/projects/[id]/members/route.ts`, `[userId]/route.ts` (+ tests); `src/lib/api/projects.ts`
  (`loadProjectScoped` resolves `es_miembro`; v2 visibility); `src/app/api/v1/projects/route.ts` list scope;
  team tab component (+ test).
- **RED:** `it("a COORDINADOR sees only projects with an active membership")`,
  `it("removing a member revokes access immediately and keeps the row with removed_at")`,
  `it("only COORDINADOR users can be added as members")`, `it("adding an existing active member returns 409")`.
- **Deps:** S0.7, S2.1. **Gate:** DP-06/N-20 USER-RESOLVED (visibility assumed); A-02 dashboard scope. **Lines:** ~400.
- **Commit:** `feat(projects): add project team membership and member-based visibility (S2.6)` · **PR-15**.

#### S2.7 — RNF-C01 panel separation (S)
- **Files:** `src/components/dashboard/` "Mi resumen" card (component + test) showing "Proyectos en ejecución" vs
  "Oportunidades en prospección" counts/lists; kanban chip kept.
- **RED:** `it("Mi resumen shows active projects and prospecting opportunities in separate, labelled groups")`,
  `it("a COORDINADOR only sees their member projects in the group")`.
- **Deps:** S2.6. **Gate:** N-19 default (dashboard + kanban). Coordinate with the v6 dashboard writer (touches
  dashboard files) — do after the v6 branch merges or via the user. **Lines:** ~150.
- **Commit:** `feat(dashboard): separate active projects from prospecting opportunities (S2.7)` · **PR-16**.

### 5.4 Slice S3 — Technical structure (RF-06..RF-10, RF-04)

#### S3.1 — Objetivo (M)
- **Files:** schema `Objetivo`; migration `<ts>_v2_objetivos` (+ partial unique code index); NEW
  `src/app/api/v1/projects/[id]/objectives/route.ts`, `[objectiveId]/route.ts` (+ tests).
- **RED:** `it("creates OE codes unique per project, case-insensitive")`, `it("rejects edits outside BORRADOR with 409 INVALID_STATE")`,
  `it("soft-deleting an objective with activities returns 409")`, `it("403 for COORDINADOR, COLABORADOR and Visualizador")`,
  `it("404 when projects_v2 is off")`, `it("audits CREAR/EDITAR per field")`.
- **Deps:** S2.1, S0.4. **Gate:** DP-01 USER-RESOLVED. **Lines:** ~330. **Commit:** `feat(projects): add specific objectives (S3.1)` · **PR-17**.

#### S3.2a — Actividad v2 schema + derived schedule mapping (M)
- **Files:** schema `Actividad` v2 columns; migration `<ts>_v2_actividades_semanas` (CHECKs, partial unique code);
  NEW `src/lib/proyectos/actividad.ts` (+ test): `toActividadV2View(row, fecha_inicio)` using `weeks.ts`,
  `pesoEfectivo`, weeks-change weight rule.
- **RED:** `it("derives fecha_inicio/fecha_fin from weeks and the project start")`,
  `it("uses duration as weight unless peso_manual")`, `it("keeps a manual weight when weeks change")`,
  `it("recomputes dates when the project start changes")`, live DB: `it("rejects semana_fin < semana_inicio")`.
- **Deps:** S0.5, S3.1. **Gate:** DP-08 default "Sí" (PO-P). **Lines:** ~260. **Commit:** `feat(projects): add week-based activity schedule model (S3.2a)` · **PR-18**.

#### S3.2b — Actividad v2 API (M)
- **Files:** `src/app/api/v1/projects/[id]/activities/route.ts`, `[activityId]/route.ts` (+ tests) — v2 body.
- **RED:** `it("validates 1 ≤ semana_inicio ≤ semana_fin ≤ duracion")`, `it("requires an objective of the same project")`,
  `it("returns derived dates, weight and estado")`, `it("v1 body keeps working when projects_v2 is off")`,
  `it("403 matrix and 409 outside BORRADOR")`.
- **Deps:** S3.2a. **Gate:** none beyond S3.2a. **Lines:** ~300. **Commit:** `feat(projects): serve week-based activities through the v2 API (S3.2b)` · **PR-18**.

#### S3.3 — Entregable (M)
- **Files:** schema `Entregable`; migration `<ts>_v2_entregables`; NEW `src/app/api/v1/projects/[id]/deliverables/route.ts`,
  `[deliverableId]/route.ts` (+ tests).
- **RED:** `it("requires cantidad_meta > 0, unidad and tipo_medio_exigido")`, `it("codes are unique per project")`,
  `it("activity must belong to the same project (composite FK)")`, `it("409 outside BORRADOR")`.
- **Deps:** S3.2a. **Gate:** RF-09 PO-P (confirm; design proceeds). **Lines:** ~300. **Commit:** `feat(projects): add measurable deliverables per activity (S3.3)` · **PR-19**.

#### S3.4 — Indicador de resultado on Objetivo (M)
- **Files:** schema `Indicador` v2 columns + `@@unique([id, proyecto_id])`; migration `<ts>_v2_indicadores_resultado`;
  `src/app/api/v1/projects/[id]/indicators/**` (+ tests) v2 body.
- **RED:** `it("requires objetivo, codigo IND-nn unique, meta > 0 and unidad")`, `it("línea base is optional and ≥ 0")`,
  `it("v1 indicator body still works when projects_v2 is off")`.
- **Deps:** S3.1. **Gate:** DP-01; N-08 only for backfill. **Lines:** ~260. **Commit:** `feat(projects): attach result indicators to objectives (S3.4)` · **PR-19**.

#### S3.6a / S3.6b / S3.6c — Draft editor UI (M each)
- **S3.6a Objetivos editor:** NEW `src/components/proyectos/tabs/estructura-tab.tsx` (+ test) objectives list/form.
  RED: `it("lists objectives with their activities count")`, `it("hides edit actions outside BORRADOR")`.
  **Lines:** ~350 · `feat(projects): add objectives editor (S3.6a)` · **PR-21**.
- **S3.6b Actividades editor + week Gantt:** activity form (weeks, weight, responsable), Gantt by weeks
  (`gantt-tab.tsx`). RED: `it("shows computed dates next to the weeks")`,
  `it("marks manual weights")`, `it("renders one bar per activity from semana_inicio to semana_fin")`.
  **Lines:** ~400 · `feat(projects): add week-based activity editor and Gantt (S3.6b)` · **PR-22**.
- **S3.6c Entregables + indicadores editor:** RED: `it("adds a deliverable with quantity and unit")`,
  `it("shows a warning for activities without deliverables")`. **Lines:** ~300 ·
  `feat(projects): add deliverables and indicators editor (S3.6c)` · **PR-23**.
- **Deps:** S3.1–S3.4, S0.4. **Gate:** none beyond S3.x. Styling deferred to S10.

### 5.5 Slice S4 — Technical execution and semáforo (RF-12..RF-17)

#### S4.1 — Avance de entregable (M)
- **Files:** schema `AvanceEntregable`; migration `<ts>_v2_avances`; NEW
  `src/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route.ts`, `.../progress/[progressId]/void/route.ts` (+ tests);
  progress capture sheet component (+ test).
- **RED:** `it("registers an avance for a member COORDINADOR on an EN_EJECUCION project")`,
  `it("rejects a future date")`, `it("rejects exceeding the goal without justificacion_exceso")`,
  `it("returns cuenta=false until a medio is attached when avance_requiere_medio is true")`,
  `it("403 for non-member COORDINADOR and Visualizador")`, `it("409 while the project is BORRADOR")`,
  `it("void requires ADM/GER and a motivo and keeps the record")`.
- **Deps:** S3.3, S2.6, S1.4. **Gate:** RF-12 support rule PO-P (parameter). **Lines:** ~380.
- **Commit:** `feat(projects): register deliverable progress (S4.1)` · **PR-24**.

#### S4.2 — Medios de verificación on SoporteProyecto (M)
- **Files:** migration `<ts>_v2_soportes_padres` (`avance_id`, `medicion_id`, composite FKs, CHECK); attachments
  routes (+ tests); `soporte-dialog.tsx` (+ test).
- **RED:** `it("attaches a file or https link to an avance")`, `it("rejects a support with both gasto_id and avance_id")`,
  `it("records uploader and timestamp")`, `it("after attaching, the avance counts")`, `it("keeps the Documentos mirror behavior")`.
- **Deps:** S4.1, S0.9a. **Gate:** DP-10 (resolved) + S0.8 outcome for > 4.5 MB files. **Lines:** ~300.
- **Commit:** `feat(projects): attach verification media to progress records (S4.2)` · **PR-25**.

#### S4.3 — Mediciones (M)
- **Files:** schema `MedicionIndicador`; migration `<ts>_v2_mediciones`; measurement routes (+ tests);
  `scripts/migrate-v2/s4-mediciones.ts` (+ test); indicadores tab v2 (+ test).
- **RED:** `it("stores measurement history and returns last and trend")`, `it("trend is 'sube' when last > previous")`,
  `it("backfill creates one migrada measurement dated updated_at from valor_actual")`.
- **Deps:** S3.4. **Gate:** N-09 default. **Lines:** ~350. **Commit:** `feat(projects): add indicator measurement history (S4.3)` · **PR-26**.

#### S4.4 — Beneficiaries registry (S)
- **Files:** schema `RegistroBeneficiarios`; migration; routes (+ tests); `scripts/migrate-v2/s4-beneficiarios.ts` (+ test).
- **RED:** `it("registers a positive count with optional activity")`, `it("sum excludes voided rows")`,
  `it("backfill creates one migrado row from cuenta_beneficiarios indicators")`.
- **Deps:** S2.1. **Gate:** N-10 default. **Lines:** ~220. **Commit:** `feat(projects): add beneficiaries count registry (S4.4)` · **PR-26**.

#### S4.5 — `avance.ts` pure library (M)
- **Files:** NEW `src/lib/proyectos/avance.ts`, `avance.test.ts`, `__fixtures__/tecnico.ts` (F-T1).
- **RED:** `it("activity progress is the mean of capped deliverable completion")`,
  `it("project real progress is weighted by peso")`, `it("programmed progress uses the linear time fraction")`,
  `it("F-T1 at 2026-10-25: programado 57.1 %, real 21.4 %, desviación 35.7 pp")`,
  `it("avances without medio do not count when required")`, `it("estadoActividad covers the four states")`,
  `it("no activities → 0 %, never NaN")`.
- **Deps:** S0.5. **Gate:** RF-16 PO-P (formulas as PO proposes). **Lines:** ~280. Can be built before S4.1 (pure).
- **Commit:** `feat(projects): add technical progress calculations (S4.5)` · **PR-27**.

#### S4.6 — Technical semáforo v2 + status endpoint (S)
- **Files:** `src/lib/proyectos/semaforo-v2.ts` (`colorTecnicoV2`) + test; NEW `src/app/api/v1/projects/[id]/technical-status/route.ts`
  (+ test); `cronograma-tab.tsx` v2 mode (+ test).
- **RED:** `it("deviation 10.0 is verde, 10.1 amarillo, 20.0 amarillo, 20.1 rojo with 10/20 thresholds")`,
  `it("negative deviation is verde")`, `it("technical-status returns corte, colors and the unconfirmed flag")`.
- **Deps:** S4.5, S1.4. **Gate:** DP-04 values (placeholders). **Lines:** ~220.
- **Commit:** `feat(projects): add deviation-based technical semáforo (S4.6)` · **PR-27**.

### 5.6 Slice S5 — Budget, programming, financial ficha (RF-18, RF-19, RF-23, RF-24)

#### S5.1 — Budget per rubro (A) (M)
- **Files:** migration `<ts>_v2_lineas_check`; `src/app/api/v1/projects/[id]/budget/route.ts` v2 PUT/GET (+ test);
  `scripts/migrate-v2/s5-presupuesto.ts` (+ test).
- **RED:** `it("PUT sets A for every active rubro, allowing $0")`, `it("rejects negative values")`,
  `it("GET returns suma, valor_total and diferencia")`, `it("seeding adds $0 rows for active rubros that have no line yet")`,
  `it("lines on a suspended rubro are returned as heredado_pendiente")`.
- **Deps:** S1.1a, S2.1. **Gate:** N-13 (USER-RESOLVED later manual), N-17. **Lines:** ~330.
- **Commit:** `feat(projects): assign budget per catalog rubro (S5.1)` · **PR-28**.

#### S5.2 — Monthly programming (P) (M)
- **Files:** schema `ProgramacionPeriodo`; migration `<ts>_v2_programacion`; NEW `src/app/api/v1/projects/[id]/programming/route.ts`
  (+ test); programming grid component (+ test).
- **RED:** `it("accepts only periods between the start and end month")`, `it("returns control = Σ periods − A per rubro")`,
  `it("marks a project with no programming as programacion_pendiente")`, `it("grid shows one column per project month")`.
- **Deps:** S5.1, S0.5. **Gate:** DP-12 default monthly, N-14 default. **Lines:** ~380.
- **Commit:** `feat(projects): add monthly budget programming (S5.2)` · **PR-29**.

#### S5.3 — `ficha-financiera.ts` pure library with the golden example (M) — decision-free
- **Files:** NEW `src/lib/proyectos/ficha-financiera.ts`, `ficha-financiera.test.ts`, `__fixtures__/financiero.ts` (F-F1).
- **RED:** scenarios G1–G7 of REQ-FIN-04 as seven `it()`:
  `it("G1 Personal at 2026-11: A 59.500.000, P 29.750.000, E 27.000.000, D −2.750.000, 90,8 %, 45,4 %, verde")`,
  `it("G2 Transporte at 2026-11: P 12.000.000, E 13.500.000, D +1.500.000, 112,5 %, 56,3 %, umbral 13.200.000, rojo")`,
  `it("G3 only VALIDADO expenses with periodo ≤ corte count")`, `it("G4 yellow band boundaries are inclusive")`,
  `it("G5 E > A is rojo even inside the tolerance band")`, `it("G6 P = 0 with E > 0 is rojo; both 0 is verde")`,
  `it("G7 total row applies the same rule to sums")`.
- **Deps:** S0.5. **Gate:** none (RF-23 PO-C; tol placeholder). Can start right after S0.5. **Lines:** ~260.
- **Commit:** `feat(projects): compute financial ficha reproducing the PO example (S5.3)` · **PR-30**.

#### S5.4 — Optimal-spend semáforo + delay alert + financial-sheet endpoint (S)
- **Files:** `semaforo-v2.ts` (`colorFinancieroV2`, `alertaRetraso`) + test; NEW `src/app/api/v1/projects/[id]/financial-sheet/route.ts`
  (+ test); `financiero-tab.tsx` (+ test).
- **RED:** `it("colorFinancieroV2 matches the RF-24 truth table")`, `it("alertaRetraso requires E/P below the threshold and technical amarillo or rojo")`,
  `it("no delay alert when P = 0")`, `it("financial-sheet returns corte, base and rows from computeFicha")`,
  `it("the tab renders colors verbatim from the API")`.
- **Deps:** S5.3, S5.2, S4.6. **Gate:** DP-04 values, RF-24 delay PO-P, DP-03 copy only. **Lines:** ~300.
- **Commit:** `feat(projects): add optimal-spend financial semáforo and delay alert (S5.4)` · **PR-31**.

#### S5.5 — Draft edit of budget/programming with audit (M)
- **Files:** budget/programming UI edit mode (+ tests); routes already audit (assert).
- **RED:** `it("editing A in BORRADOR writes one EDITAR audit row per changed rubro")`,
  `it("edit controls are hidden after baseline")`, `it("shows Σ A vs valor total difference live")`.
- **Deps:** S5.1, S5.2. **Gate:** none. **Lines:** ~250. **Commit:** `feat(projects): edit draft budget and programming with audit (S5.5)` · **PR-32**.

### 5.7 Slice S6 — Expenses and validation (RF-20..RF-22, RF-25, RNF-03, RNF-04)

#### S6.1 — Gasto v2 fields (M)
- **Files:** schema `Gasto` v2 columns + enums; migration `<ts>_v2_gastos_validacion` (CHECKs, default REGISTRADO);
  `src/app/api/v1/projects/[id]/expenses/route.ts`, `[expenseId]/route.ts` (+ tests) v2 body;
  `expense-dialog.tsx` (+ test).
- **RED:** `it("registers an expense with all RF-20 fields and at least one support")`,
  `it("rejects a rubro with A = 0")`, `it("defaults periodo to the document month and rejects periods outside the project")`,
  `it("rejects valor ≤ 0 and unknown tipo_soporte")`,
  `it("Visualizador list responses omit tercero_numero_id")`.
- **Deps:** S5.1, S4.2 (support attach), S2.6. **Gate:** N-15 USER-RESOLVED. **Lines:** ~400.
- **Commit:** `feat(projects): capture v2 expense fields with mandatory supports (S6.1)` · **PR-33**.

#### S6.2 — Duplicate alert (S)
- **Files:** NEW `src/lib/proyectos/gastos.ts` (+ test) `normalizarIdentificacion`, `normalizarNumeroDocumento`;
  expenses POST (+ test).
- **RED:** `it("normalises NIT with dots, spaces and check digit separators")`,
  `it("returns a DUPLICADO alert when the same ID and document number exist in any project")`,
  `it("reveals the other project code only if the actor can view it")`, `it("never blocks the registration")`.
- **Deps:** S6.1. **Gate:** RF-21 PO-P (non-blocking, low risk). **Lines:** ~180.
- **Commit:** `feat(projects): warn about duplicate expense documents across projects (S6.2)` · **PR-33**.

#### S6.3 — Validation flow (M)
- **Files:** NEW `.../expenses/[expenseId]/validate/route.ts`, `reject/route.ts`, `void/route.ts` (+ tests);
  NEW `src/app/api/v1/expense-validations/route.ts` (+ test); validation queue component (+ test);
  `legalizacion-tab.tsx`.
- **RED:** `it("GERENCIA validates a REGISTRADO expense of another user")`,
  `it("the registrant cannot validate their own expense (403)")`, `it("rejection requires a motivo")`,
  `it("a RECHAZADO expense edited by its registrant returns to REGISTRADO")`,
  `it("only VALIDADO expenses are counted in E")`, `it("expenses with datos_incompletos cannot be validated")`,
  `it("the queue lists REGISTRADO expenses across projects for ADM/GER only")`,
  live DB: `it("the CHECK rejects validado_por_id = registrado_por_id")`.
- **Deps:** S6.1, S0.7. **Gate:** DP-02 USER-RESOLVED. **Lines:** ~400.
- **Commit:** `feat(projects): validate or reject expenses with segregation of duties (S6.3)` · **PR-34**.

#### S6.4 — Overspend block + flag + notification (S)
- **Files:** validate route (+ test); migration `<ts>_v2_notificaciones_sobregasto`; `src/app/api/v1/notifications/route.ts`
  (+ test) label; `prisma/overspend.invariant.test.ts`.
- **RED:** `it("blocks validation with 409 OVERSPEND_BLOCKED when validated E + valor > A")`,
  `it("flags the expense and notifies every active GERENCIA user once")`,
  `it("a second blocked attempt creates no duplicate notification")`,
  `it("after A increases the same validation succeeds and clears the flag")`,
  `it("registration sets the early-warning flag but never blocks")`,
  live DB: `it("two concurrent validations on the same rubro cannot jointly exceed A")` (row lock).
- **Deps:** S6.3; unblock path needs S8.3b (test uses a direct A update until then). **Gate:** DP-11 USER-RESOLVED
  (RF-25 PO-P). **Lines:** ~260. **Commit:** `feat(projects): block and alert expense validation over the assigned budget (S6.4)` · **PR-35**.

#### S6.5 — Support access restriction + consultation log (M)
- **Files:** schema `AccesoSoporte`; migration `<ts>_v2_acceso_soportes` (append-only trigger);
  `src/app/api/v1/projects/[id]/expenses/[expenseId]/attachments/route.ts`, `attachments/route.ts` (+ tests).
- **RED:** `it("Visualizador gets 403 on expense supports")`, `it("non-member COORDINADOR gets 403")`,
  `it("each signed URL issued for an expense support writes one acceso_soportes row")`,
  `it("verification media stay visible to Visualizador")` (RNF-03 restricts financial supports only),
  live DB: `it("acceso_soportes rejects UPDATE and DELETE")`.
- **Deps:** S6.1, S2.6. **Gate:** RNF-04 PO-P (log is additive, low risk). **Lines:** ~280.
- **Commit:** `feat(projects): restrict financial supports and log every access (S6.5)` · **PR-36**.

### 5.8 Slice S7 — Excel template (RF-03, RF-04)

#### S7.1a — Template generator: structure sheets (M)
- **Files:** NEW `src/lib/proyectos/plantilla/columns.ts`, `generate.ts` (+ test); NEW `src/app/api/v1/projects/[id]/template/route.ts` (+ test).
- **RED:** `it("creates the 9 sheets with the exact names in order")`, `it("prefills code and client on 2. Proyecto")`,
  `it("writes the expected headers on sheets 3–6")`, `it("writes PLANTILLA_VERSION on 1. Instrucciones!B2")`,
  `it("template route returns 409 outside BORRADOR and 403 for non-managers")`.
- **Deps:** S3.x, S1.x. **Gate:** DP-05, DP-08 resolved/defaults. **Lines:** ~350.
- **Commit:** `feat(projects): generate the v2 Excel template structure sheets (S7.1a)` · **PR-37**.

#### S7.1b — Template generator: budget, programming, catalogs (M)
- **Files:** `generate.ts` (+ test).
- **RED:** `it("precargas the 15 active rubros on 7. Presupuesto")`,
  `it("generates one 'Mes k (AAAA-MM)' column per project month plus Total and Control formulas")`,
  `it("protects 9. Catálogos and wires dropdown validations to its named ranges")`.
- **Deps:** S7.1a, S5.2. **Gate:** DP-12 default monthly. **Lines:** ~300.
- **Commit:** `feat(projects): generate budget, programming and catalog sheets (S7.1b)` · **PR-37**.

#### S7.2 — Parser with positions (M) — decision-free
- **Files:** NEW `plantilla/parse.ts` (+ test), `__fixtures__/plantilla-cedetextil.ts` (builds F-X1 workbook in memory).
- **RED:** `it("reads every sheet into typed rows carrying hoja, fila and columna")`,
  `it("reads formula cells by result")`, `it("parses Colombian number formats 59.500.000 and 1.440.000,50")`,
  `it("parses Excel dates and DD/MM/AAAA text as IsoDate")`, `it("splits líneas and municipios on ';' keeping order")`.
- **Deps:** S0.5. **Gate:** none. **Lines:** ~300. **Commit:** `feat(projects): parse the v2 Excel template with cell positions (S7.2)` · **PR-38**.

#### S7.3a — Validators V-01..V-07 (M)
- **Files:** NEW `plantilla/validate.ts` (+ `validate.v01-v07.test.ts`).
- **RED:** one `describe` per rule, each with a passing and a failing fixture, e.g.
  `it("V-01 reports a missing sheet by name")`, `it("V-01 reports a header mismatch with expected and found")`,
  `it("V-01 rejects an old PLANTILLA_VERSION")`, `it("V-02 rejects a code of another project")`, `it("V-02 rejects a non-BORRADOR project")`,
  `it("V-03 rejects inicio ≥ fin, valor total ≤ 0 and beneficiaries ≤ 0")`, `it("V-04 rejects unknown or suspended lines and municipios")`,
  `it("V-05 reports repeated codes with all their rows")`, `it("V-06 reports dangling objective and activity references")`,
  `it("V-07 reports weeks outside 1..duración")`.
- **Deps:** S7.2. **Gate:** none. **Lines:** ~380. **Commit:** `feat(projects): validate template rules V-01 to V-07 (S7.3a)` · **PR-39**.

#### S7.3b — Validators V-08..V-14, V-H1, W-01 (M)
- **Files:** `plantilla/validate.ts` (+ `validate.v08-v14.test.ts`).
- **RED:** `it("V-08 reports activities without deliverables")`, `it("V-09 rejects non-positive quantities, metas and weights")`,
  `it("V-10 reports objectives without activities")`, `it("V-11 rejects unknown, suspended or repeated rubros and negatives")`,
  `it("V-12 reports the CedeTextil $50.000 difference to the cent")`, `it("V-13 reports control ≠ 0 per rubro")`,
  `it("V-14 rejects months outside the project period and negative values")`, `it("V-H1 reports empty required text cells")`,
  `it("W-01 warns on unknown responsable emails without blocking")`, `it("validateTemplate returns all errors sorted by sheet and row")`.
- **Deps:** S7.3a. **Gate:** none. **Lines:** ~380. **Commit:** `feat(projects): validate template rules V-08 to V-14 (S7.3b)` · **PR-39**.

#### S7.4 — Atomic import (M)
- **Files:** NEW `plantilla/import.ts` (writer), NEW `src/app/api/v1/projects/[id]/import/route.ts` (+ test);
  `prisma/import-atomic.invariant.test.ts`.
- **RED:** `it("writes nothing and returns the report when any rule fails")`,
  `it("writes objectives, activities, deliverables, indicators, budget and programming in one transaction")`,
  `it("writes one IMPORTAR audit lote")`, `it("rejects files over 25 MB and non-xlsx types")`,
  live DB: `it("rolls back every insert when a failure is injected mid-import")`.
- **Deps:** S7.3b, S0.4, S0.9a. **Gate:** none. **Lines:** ~360. **Commit:** `feat(projects): import the Excel template atomically (S7.4)` · **PR-40**.

#### S7.5 — Import UI and error report (M)
- **Files:** NEW `src/components/proyectos/import-dialog.tsx` (+ test); `src/hooks/projects.ts` (`useImportTemplate`).
- **RED:** `it("uploads the file and shows the summary on success")`, `it("renders errors grouped by sheet with row, column and rule")`,
  `it("offers the report download")`, `it("disables import outside BORRADOR")`.
- **Deps:** S7.4. **Gate:** none (styling S10). **Lines:** ~300. **Commit:** `feat(projects): add template import dialog with error report (S7.5)` · **PR-41**.

#### S7.6 — Re-import replaces the draft (S)
- **Files:** `plantilla/import.ts` (+ test).
- **RED:** `it("re-import soft-deletes the previous draft structure and writes the new one")`,
  `it("audits the replacement with before/after counts")`, `it("keeps supports and execution records untouched")`.
- **Deps:** S7.4. **Gate:** none. **Lines:** ~150. **Commit:** `feat(projects): replace draft structure on template re-import (S7.6)` · **PR-40**.

#### S7.7 — Local pilot load of the CedeTextil structure (S, data)
- **Goal:** end-to-end check on local Docker with the structural fixture (figures illustrative, N-22 USER-RESOLVED).
- **Files:** `scripts/seed-proyectos-demo.ts` (`--v2` loads F-X1) (+ planner test).
- **Acceptance:** import report of the intentionally inconsistent file shows V-12; corrected file imports.
- **Deps:** S7.4. **Gate:** none. **Lines:** ~150. **Commit:** `chore(seed): load the CedeTextil v2 structure on local demo data (S7.7)` · **PR-41**.

### 5.9 Slice S8 — Baseline, modifications, versions (RF-05, RF-26..RF-29)

#### S8.1 — Version model + snapshot builder (M)
- **Files:** schema `VersionProyecto`, `SolicitudModificacion`; migration `<ts>_v2_versiones` (trigger, CHECKs);
  NEW `src/lib/proyectos/versiones.ts` (`buildSnapshot`, `diffSnapshots`) + test.
- **RED:** `it("buildSnapshot contains exactly the est §7.1 elements")`, `it("diffSnapshots lists changed budget, programming, weeks, weights and quantities")`,
  `it("diff of identical snapshots is empty")`, live DB: `it("versiones_proyecto rejects UPDATE and DELETE")`.
- **Deps:** S3.x, S5.x. **Gate:** none. **Lines:** ~330. **Commit:** `feat(projects): add immutable version snapshots (S8.1)` · **PR-42**.

#### S8.2 — Baseline approval (M)
- **Files:** NEW `src/app/api/v1/projects/[id]/baseline/approve/route.ts` (+ test); `src/lib/proyectos/linea-base.ts`
  (`precondicionesLineaBase`) + test; approval dialog (+ test).
- **RED:** `it("lists every failed precondition")` (one it per precondition of REQ-VER-01),
  `it("approval creates version 0, sets EN_EJECUCION and audits APROBAR in one transaction")`,
  `it("only ADM/GER can approve")`, `it("after approval direct structure edits return 409")`.
- **Deps:** S8.1. **Gate:** N-01, N-18 USER-RESOLVED. **Lines:** ~350.
- **Commit:** `feat(projects): approve the baseline and freeze version 0 (S8.2)` · **PR-43**.

#### S8.3a — Modification requests (M)
- **Files:** NEW `src/app/api/v1/projects/[id]/modifications/route.ts` (+ test); request form (+ test).
- **RED:** `it("creates a PENDIENTE request with tipo, motivo and structured detail")`,
  `it("rejects elements not allowed for the tipo")`, `it("member COORDINADOR can request, Visualizador cannot")`,
  `it("audits SOLICITAR")`.
- **Deps:** S8.2. **Gate:** A-01 (who requests). **Lines:** ~300. **Commit:** `feat(projects): request execution modifications (S8.3a)` · **PR-44**.

#### S8.3b — Approve/reject + RF-28 rules (M)
- **Files:** `versiones.ts` (`applyModificacion`, `validarModificacion`) + test; NEW `.../modifications/[modId]/approve/route.ts`,
  `reject/route.ts` (+ tests).
- **RED:** `it("traslado keeps valor_total")`, `it("adición and reducción change valor_total by the sum of deltas")`,
  `it("rejects leaving A below validated E")`, `it("rejects reprogramming elapsed periods when the rule is on")`,
  `it("approval creates version N and applies changes in one transaction")`,
  `it("rejection requires a comment and changes no data")`, `it("stale version_base_numero returns 409")`.
- **Deps:** S8.3a, S6.3. **Gate:** RF-28 past-periods rule PO-P (parameter). **Lines:** ~400.
- **Commit:** `feat(projects): approve modifications into new versions with integrity rules (S8.3b)` · **PR-45**.

#### S8.4 — History and comparison (M)
- **Files:** NEW `.../versions/route.ts`, `[n]/route.ts`, `compare/route.ts` (+ tests); ficha/technical endpoints
  accept `base=original` (+ tests); versions tab (+ test).
- **RED:** `it("lists versions with date, requester, approver and motivo")`, `it("compares v0 vs vigente")`,
  `it("financial-sheet base=original uses v0 A and P with live E")`, `it("technical-status base=original uses v0 weeks and weights")`.
- **Deps:** S8.3b. **Gate:** none. **Lines:** ~350. **Commit:** `feat(projects): browse and compare project versions (S8.4)` · **PR-46**.

### 5.10 Slice S9 — Dashboards, exports, territory removal

#### S9.1 — KPIs 6.7.1 (M)
- **Files:** NEW `src/lib/proyectos/kpis.ts` (+ test).
- **RED:** one `it` per KPI formula of 6.7.1, plus `it("unmeasured indicators are excluded from the average and counted apart")`,
  `it("every KPI carries its corte")`.
- **Deps:** S4.5, S5.3. **Gate:** DP-09 default. **Lines:** ~300. **Commit:** `feat(projects): compute RF-30 key indicators (S9.1)` · **PR-47**.

#### S9.2 — Portfolio view (M)
- **Files:** `src/app/api/v1/dashboard/projects/route.ts` v2 branch (+ test); portfolio component (+ test);
  `src/app/(app)/tablero-gerencial/page.tsx`.
- **RED:** `it("returns both semáforos, progress and state per visible project")`, `it("filters by principal line, client, responsable, estado and municipio")`,
  `it("a COORDINADOR sees only member projects")`.
- **Deps:** S9.1, S2.6. **Gate:** RF-31 PO-P; coordinate with the v6 dashboard writer. **Lines:** ~380.
- **Commit:** `feat(dashboard): add v2 project portfolio view (S9.2)` · **PR-48**.

#### S9.3a — Excel exports (M)
- **Files:** NEW `src/lib/proyectos/export-xlsx.ts` (+ test); NEW `src/app/api/v1/projects/[id]/export/route.ts` (+ test).
- **RED:** `it("exports the project ficha and the financial ficha as xlsx")`, `it("omits supports and third-party IDs for Visualizador")`, `it("audits EXPORTAR")`.
- **Deps:** S9.1. **Gate:** formats PO-P. **Lines:** ~300. **Commit:** `feat(projects): export project and financial fichas to Excel (S9.3a)` · **PR-49**.

#### S9.3b — PDF exports (M)
- **Files:** export route `formato=pdf` (+ test); PDF renderer module.
- **RED:** `it("returns application/pdf with the same sections as the Excel export")`, `it("respects the exporter's role")`.
- **Deps:** S9.3a. **Gate:** N-23 (engine) — **blocks**; default proposal: server-side HTML → PDF is NOT available
  on Vercel without extra deps, so evaluate a pure-JS generator; the user decides the dependency. **Lines:** ~350.
- **Commit:** `feat(projects): export project and financial fichas to PDF (S9.3b)` · **PR-50**.

#### S9.4 — KPI cache and < 3 s check (M)
- **Files:** schema `ProyectoKpiCache`; migration `<ts>_v2_kpi_cache`; `src/lib/api/kpi-cache.ts` (+ test); write
  routes call `refreshKpiCache(tx, proyecto_id)`; NEW `scripts/migrate-v2/bench-dashboard.ts`.
- **RED:** `it("refreshes the cache inside validation, progress, approval and import transactions")`,
  `it("dashboard reads caches and recomputes at most 20 stale ones")`.
- **Acceptance:** bench p95 < 3 s recorded in §6.7. **Deps:** S9.2. **Gate:** none. **Lines:** ~300.
- **Commit:** `perf(dashboard): precompute project KPIs for the management dashboard (S9.4)` · **PR-51**.

#### S9.5 — Remove territorial semaforización (S)
- **Files:** `src/app/api/v1/dashboard/projects/route.ts` (drop `por_territorio`), `src/components/dashboard/cara-management.tsx`,
  `print-dashboard.tsx` (+ tests).
- **RED:** `it("v2 dashboard response has no por_territorio")`, `it("the management face has no territorial section")`.
- **Deps:** S9.2. **Gate:** none (PO-C). **Lines:** ~150. **Commit:** `refactor(dashboard): remove territorial semaforización in v2 (S9.5)` · **PR-51**.

### 5.11 Slice S10 — Visual plan for the new screens

#### S10.1 — Re-plan held visual tasks (S, docs)
- **Files:** `odd/tasks/v6-visual-alignment.md` (V2.5 list, V2.6 header/tabs/indicadores/Gantt, V2.7 cronograma,
  V2.8 financiero, V2.11 creation stepper → re-scoped to v2 screens and IDs).
- **Deps:** S0.1. **Gate:** none. **Lines:** ~60. **Commit:** `docs(odd): re-plan held v6 project screens against RF v2.0 (S10.1)` · **PR-01** or own.

#### S10.2 — Design screens missing from the prototype (M)
- **Scope:** financial-by-rubro ficha, versions/modifications, import report, expense validation queue, team tab,
  baseline approval dialog — using the v6 primitives (§4.14).
- **RED (per component):** `it("uses StatusChip for semáforo and state")`, `it("uses KpiTile for A/P/E/D totals")`, `it("renders the EmptyState when there is no data")`.
- **Deps:** each functional task. **Gate:** N-24 default (prototype is the target for existing tabs). **Lines:** ~400 per PR (split per screen).
- **Commit:** `feat(ui): apply v6 design to <screen> (S10.2)` · **PR-53..**.

#### S10.3 — Mobile capture of progress and expenses (M)
- **RED:** `it("progress sheet fits a 360 px viewport without horizontal scroll")` (layout classes), `it("controls are at least 44 px tall")`.
- **Deps:** S4.1, S6.1. **Gate:** RNF-01 mobile PO-P. **Lines:** ~250. **Commit:** `feat(ui): make progress and expense capture usable on mobile (S10.3)` · **PR-5x**.

### 5.12 Dependency order and PR grouping
S0.5 → S0.4 → S0.6 → (S0.1, S0.8 docs) → S0.7 → S0.9a → S0.9b (conditional) → S1.1a → S1.1b → S1.2 → S1.3 → S1.4 →
S2.1 → S2.2 → S2.3 → S2.4 → S2.6 → S2.7 → S3.1 → S3.2a → S3.2b → S3.3 → S3.4 → S3.6a–c →
S4.5 (can run early) → S4.1 → S4.2 → S4.3 → S4.4 → S4.6 → S5.3 (can run right after S0.5) → S5.1 → S5.2 → S5.4 →
S5.5 → S6.1 → S6.2 → S6.3 → S6.4 → S6.5 → S7.2 (can run early) → S7.1a → S7.1b → S7.3a → S7.3b → S7.4 → S7.6 →
S7.5 → S7.7 → S8.1 → S8.2 → S8.3a → S8.3b → S8.4 → S9.1 → S9.2 → S9.3a → S9.3b → S9.4 → S9.5;
S10.1 after S0.1; S10.2/S10.3 alongside their functional tasks.

**Task count:** S0 8 · S1 5 · S2 6 · S3 8 · S4 6 · S5 5 · S6 5 · S7 9 · S8 5 · S9 6 · S10 3 = **66 tasks**, ~48 PRs.

**Decision-free tasks (can start now):** S0.1, S0.4, S0.5, S0.6, S0.8 (needs the user to read two dashboard
values), S1.2, S4.5, S5.3, S7.2, S7.3a/b, S10.1. S0.7 is USER-RESOLVED (only D-02 timing default).

### 5.13 Removed with the direct path

Five task IDs that existed only to manage v1↔v2 coexistence or to migrate v1 data were deleted from this plan.
Their IDs are retired and never reused.

| Task ID | Was | Removed because |
|---|---|---|
| S0.2 | Legacy test inventory (classify 419 v1 cases / 39 files as KEEP / REWRITE / RETIRE) | v1 projects module was never shipped (`main` has no projects models or migrations, 0 production rows); there is nothing to migrate, no flag to coexist with, and no contract step |
| S0.3 | Coexistence flag `feature_projects_v2` + `src/lib/features.ts` + `GET /api/v1/features` | Same: nothing to migrate, no flag to coexist with, no contract step |
| S2.5 | Backfill of general project data (origen, valor_total, lines, municipios, estados) | Same: nothing to migrate, no flag to coexist with, no contract step |
| S3.5 | Backfill of technical structure (Meta → Objetivo, weeks, deliverables, supports, indicators) | Same: nothing to migrate, no flag to coexist with, no contract step |
| S9.6 | Contract: flip the flag, drop v1 columns/tables/enum values, retire v1 tests | Same: nothing to migrate, no flag to coexist with, no contract step |

## 6. Verification and release

### 6.1 Per-slice closing checklist
| Slice | Must be true before closing |
|---|---|
| S0 | Pure libs 100 % branch-covered by their tests; audit trigger live-DB test green; guard tests green and the N-13 report recorded; COORDINADOR behavior change covered by the **predicate** tests — the route-level 403 tests and the UI CTA test moved to the first v2 project-route slice (S2.x), because no project route, component or openapi path exists yet; upload limits recorded (S0.8); suite green under the §6.10 envelope |
| S1 | Local catalog = 15 active rubros R01–R15 with immutable codes; rename/delete-with-data returns 409 for rubros, lines, municipios; v2 params editable with "no confirmado" badges |
| S2 | New project gets `PRY-AAAA-NNN`; GANADA → project converts in one tx; value-difference alert; membership visibility enforced |
| S3 | CedeTextil structure can be entered on screen; weeks → dates exact (F-W1); deliverables and indicators editable in BORRADOR |
| S4 | F-T1 reproduces; avances count only with medio (param); technical semáforo placeholders visible as unconfirmed |
| S5 | **F-F1 golden test green (all nine figures, both colors)**; programming Σ = A enforced; delay alert rule tested |
| S6 | Segregation of duties CHECK + route tests; overspend block + single notification + unblock path; VIS cannot reach supports; access log rows written |
| S7 | Every V-rule has a pass and a fail test; atomic rollback live-DB test green; CedeTextil pilot file behaves as expected |
| S8 | v0 frozen and immutable; modification → vN with RF-28 rules; v0 vs vigente comparison in ficha and technical status |
| S9 | KPIs per 6.7.1 with corte; bench p95 < 3 s recorded; territory section gone; exports role-aware |
| S10 | New screens use v6 primitives; mobile capture checks |

### 6.2 Slice integration criteria
- A slice closes only when its v2 API + UI are merged together and its own tests pass; there is no switch step,
  because the v2 module is the only Projects implementation in the branch.
- The v2 endpoints are reachable by default: no flag gates them and no v1 read path has to keep working.
- Only local data scripts (catalogs, defaults) run before a slice closes; §6.4 checks apply to those scripts.

### 6.3 Definition of done (per task)
1. RED observed and recorded; GREEN; REFACTOR done with tests still green.
2. CMD-STD green (focused vitest, `npx tsc --noEmit`, eslint on touched files); full suite at slice close.
3. Every scenario of the implemented REQ has a test; audit rows asserted for every write.
4. Docs updated in the same commit (this SDD's §6.7 row, openapi paths when routes change —
   `src/lib/openapi/paths/*.ts`).
5. Conventional Commit without attribution lines; commit hash recorded; RDD assessment outcome recorded.

### 6.4 Local data-script acceptance checks
These apply to the catalog/default scripts that still exist (rubros, municipios, $0 budget lines, KPI cache),
never to a v1→v2 migration, which does not exist.
| Check | Query/evidence | Pass |
|---|---|---|
| Local target only | service host resolves to loopback; the guard aborts otherwise | yes |
| No unrelated row lost | per table `count(*)` before vs after each `--apply` (report) | equal for tables the script does not own |
| Catalogs | 15 active rubros R01–R15; municipios curated per N-21 | yes |
| Defaults | $0 budget rows only for active rubros missing per project; retired-rubro lines untouched | yes |
| Storage | `storage_path` set identical before/after; orphan report unchanged | identical |
| Audit | one `migracion_v2` lote row per applied script | yes |
| Idempotency | second `--apply` reports 0 actions | yes |

### 6.5 Remote promotion checklist (human-run only — agents never execute these)

> **Production is not this repository.** Production carries 8 abandoned v1 project tables and an applied
> migration (`20260918153200_tablero_seguimiento_social`) that exists in no branch of this repo. Read §6.9 before
> promoting anything. **Never run `prisma migrate dev` against production**, and never reconstruct production's
> schema from this repository: `_prisma_migrations` is the only authority for what production has.

1. Announce a maintenance window.
2. `pg_dump` backup of the remote database (user's tooling); verify the dump restores into a scratch DB.
3. Raise the `muttu-docs` bucket `file_size_limit` to 25 MB if S0.9a/S0.9b is being deployed (Supabase
   dashboard). **This bucket limit is the enforced hard bound for the signed-upload path (R-17):** the browser PUTs
   straight to Storage, so the app's own size check runs only at confirm — *after* the object exists — and the
   never-delete policy forbids removing an oversized orphan. Never deploy the signed path with a bucket limit below
   the app policy (25 MB), and check for leftovers with the read-only
   `scripts/migrate-v2/storage-orphans.ts` after any large-upload incident. Vercel's 4.5 MB function body limit is a
   separate platform constant that binds the multipart paths only.
4. Apply pending migrations to the remote DB from a human terminal with `prisma migrate deploy` — **never
   `migrate dev`**: it compares the directory with the database, will flag
   `20260918153200_tablero_seguimiento_social` as applied-but-absent, and can try to reconcile by resetting.
   **Watch the first v2 migration whose target name production already has.** Production carries the abandoned v1
   `rubros` table (§6.9), so S1.1a's migration is deliberately **adoptive and idempotent**: it creates the table when
   absent and adopts it when present (adds `codigo` if missing, backfills `R01`/`R12` for `Personal`/`Transporte`, and
   leaves `Material POP` and `Operación logística` suspended and code-less). A plain `CREATE TABLE rubros` would abort
   the deploy. **Exercise the adoption path against a `pg_dump` restore of production before running it for real**,
   then diff the resulting `rubros` rows and the trigger's presence. The same trap applies to every later v2 migration
   that shares a name with one of the 8 abandoned tables (`proyectos`, `metas`, `actividades`, `gastos`, `rubros`,
   `indicadores`, `soportes_proyecto`, `lineas_presupuestales`).
5. For each data script, run the human entrypoint `promote-remote.ts` in dry-run, review decisions, then apply
   with `--expect-hash <sha>` copied from that dry-run. The harness refuses `--apply` without a hash, refuses a
   recomputed mismatch *before* writing anything, and writes one `IMPORTAR` lote row per applied script.
6. Run the §6.4 checks remotely; keep the outputs (each dry-run also writes
   `scripts/migrate-v2/out/<script>-<stamp>.md`; the folder is git-ignored).
7. Rollback = restore the backup; the schema is additive, so no code rollback is required.
8. To undo a single applied script before a full restore, use `--revert <lote_id>`: it is scoped to the rows that
   lote created and touches nothing else. `promote-remote.ts` does not exist yet — it is written only when the
   user authorizes promotion, and agents never create or run it (CLAUDE.md DB rule).
9. Cleaning up the abandoned v1 tables is **D-10** and deliberately lives outside this checklist: it is a
   destructive remote operation, it needs its own verified backup and a reviewed migration, and no agent ever runs
   it. `migrate deploy` will never remove them on its own.

### 6.6 Review checklist (per PR)
- Authorization: matrix row(s) covered by tests; no `canManageAny` in new project code; VIS never in write paths.
- State machine: BORRADOR/EN_EJECUCION guards; 409 `INVALID_STATE` copy.
- Money: no `Number`/`parseFloat` on money; cents helpers; Decimal(15,2) columns.
- Dates: `IsoDate` only; no `new Date()` arithmetic on calendar dates outside `weeks.ts`.
- Audit: `logChange` inside the same transaction; before/after per field.
- Files: size/type via the shared policy; no storage removal; signed URLs only.
- DB safety: any script imports the guard first; commands use `.env.local`.
- Endpoint exposure: v2 routes are reachable by default; no flag gates them.
- Tests: RED evidence recorded; scenarios ↔ `it()` titles match this SDD.
- No persona/slang in code, UI copy, commits (Spanish UI copy is neutral and professional).

### 6.7 Progress / Evidence
| Date | Task | Route | Commit | Checks (observed) | RDD tier / outcome | Notes |
|---|---|---|---|---|---|---|
| 2026-09-29 | SDD | delegated writer | — (not committed) | — | — | This document created; no code changed |
| 2026-09-30 | Re-scope for the direct path | orchestrator + delegated writer (partial) | — (same commit as this re-scope) | 5 coexistence-only tasks removed; `feature_projects_v2` / `PROJECTS_V2_OVERRIDE` / `src/lib/features.ts` / `REQ-FLAG` / S9.6 / v1-backfill references eliminated except in §0.4 and the §5.13 tombstone; task count 71 → 66; no source code touched | — | v1 module was never shipped; see `odd/tasks/v2-projects-execution.md` ODD-01..04 |
| 2026-09-30 | Recalibration pass 2 against `main` | orchestrator | same commit | Verified with `git show main:prisma/schema.prisma`: all nine projects models are absent → "extended" markers removed and ADR-02 rewritten as design continuity, not reuse. Legacy-data requirements and decision rows rewritten or retired. `npx tsc` evidence on the primitives branch | — | §0.4 second pass |
| 2026-09-30 | **DB-safety root cause fixed** | orchestrator | `96c4c5c` | `prisma/local-env.ts` + `prisma/require-local-db.ts` + 14 tests; `npx prisma migrate status` now reports `127.0.0.1:54322`; a remote target raises `NonLocalDatabaseError` without credentials; suite 116 files / 1041 tests green in 52 s (was 86 s, because the DB test now hits local Docker); `tsc` 0 errors | — | Absorbs the guard half of S0.6 and supersedes PR #55's seed guard; `db:*:local` scripts added |
| 2026-09-30 | **S0.5 pure week and money libraries** | orchestrator (inline, TDD) | see the commit after `93eac47` | RED: both test files failed to resolve their modules. GREEN: **36 tests** (17 `weeks` + 19 `money`); `tsc` 0 errors; eslint clean; `rg -n "parseFloat|Number\(" src/lib/proyectos/money.ts` **empty**; no `@/lib/db` or `next/*` import | — | Deviations: `formatCOP` renders `"$ 59.500.000"` (space, matching Intl `es-CO`) computed in bigint; ES2017 target untouched so `BigInt(...)` replaces bigint literals; `dateToWeek` dropped (no caller) |
| 2026-09-30 | **Local DB reset to the branch schema** | user-authorized (Prisma AI-agent guard satisfied with the user's exact consent text) | n/a | Before: 13 migrations in `_prisma_migrations` and 8 extra abandoned tables (`proyectos`, `metas`, `actividades`, `gastos`, `rubros`, `indicadores`, `lineas_presupuestales`, `soportes_proyecto`) with data. After: **11 migrations, zero abandoned tables**, seed re-run (12 clientes / 4 usuarios / 20 tareas / 10 oportunidades / 8 documentos) | — | `prisma migrate reset` **does not run the seed**; it had to be run explicitly. Also needed `db:generate:local`: the generated client was from Sep 25 (v1 branch) and still carried `puede_ver_tablero_gerencial`. `scripts/seed-proyectos-demo.ts` (untracked, v1) was parked as `.ts.bak` because it broke `tsc` once the client was regenerated |
| 2026-09-30 | **S0.4 append-only auditoria_cambios** | orchestrator (inline, TDD) | see the commit after the S0.5 one | RED: unit file failed to resolve its module. GREEN: **16 tests** (12 unit + 4 live-DB invariant: INSERT accepted, UPDATE / DELETE / TRUNCATE rejected by trigger); `tsc` 0 errors; eslint clean; `logAudit` untouched; migrations 12 and in sync | — | First v2 migration, created through `db:migrate:local` (the `.env.local` wrapper), not `npx` |
| 2026-10-01 | **S0.6 migration safety kit** | delegated writer + independent verifier (read-only) | `108c682` | RED: both spec files failed to resolve (`_harness` absent, `__fixtures__/guard-probe.ts` absent). GREEN: **13 tests** (5 guard spawned against a fake env, 8 harness against a fake `$transaction` client); `tsc` 0 errors; eslint clean; `s1-rubros-report` → 1 zero-valued row, host `127.0.0.1:54322`, `storage-orphans` → 11 rows / 11 objects / 0 rows-without-object / 0 objects-without-row; independent verifier confirmed no `$transaction` on the dry-run path, hash-check before write, one 120 s transaction, `list()`-only storage access, and that only `.gitignore` changed among tracked files | — | Verifier's two findings were wording-level ("only .gitignore + scripts/migrate-v2 in status" — there were 11 entries, the rest pre-existing; "0 rows" — one zero-valued row). Unfixed residuals recorded in the S0.6 block. `CLAUDE.md` committed separately as `bd7cc00` before this task |
| 2026-10-01 | **Native review of S0.6 → R3-001 CRITICAL → fixed** | native 4-lens review + delegated writer (correction) | `959ca33` | Lineage `review-5f975df81d7b1418`, candidate = the S0.6 work unit (10 files / 1018 lines, tier **high**, correction budget 200). 4 lenses ran (host relay, ~293 s; prompts ~65 KB, results 3.4–8.4 KB). One finding: **R3-001** (reliability, CRITICAL, deterministic, introduced) — the dry-run printed only 12 chars of the plan hash and returned no hash, so `--apply --expect-hash <sha>` could never obtain the reviewed value. Fixed with RED first (`Received: undefined` → 13/13 green, `tsc` 0 errors, eslint clean); correction plan of **12 diff lines** accepted by the provider | — | The correction had to be **committed** before native could see it (`stop/corrected_candidate_unavailable` otherwise). Authority stayed at `correction_required`: the final `collect/targeted_validation_required` slot is unreachable from the Pi facade (it cannot carry a `base-ref`, so with a clean tree it reports `empty_candidate_base_ref_required`), and the validator verdict must not be authored by Pi. **The review closed nothing and approves no delivery.** Lineage intentionally left open, recorded in memory |
| 2026-10-01 | **S0.7 project permission predicates** | delegated writer + independent verifier (read-only) | see the commit after `959ca33` | Scope recalibrated first (`src/lib/api/projects.ts`, `src/app/api/v1/projects/**`, `src/components/proyectos/**`, `src/lib/openapi/paths/projects.ts` absent on this branch → route/UI 403 tests deferred to S2.x). RED: 13 new cases failed with `TypeError: <predicate> is not a function`. GREEN: **63 tests** across `permissions.test.ts` + `permissions.read.test.ts`; `tsc` 0 errors; eslint clean; `git diff -U0` = single append hunk, 0 deletions. Verifier confirmed all 13 predicates against the contract, **zero `canManageAny`** in the new block, no write predicate reading the gerencial flag | — | Verifier blocked the commit on two untested positive branches (`canViewFinancialSupports` membership; `canApproveBaseline`/`canApproveModification` manager-true) — both closed, +1 test and +1 assertion. Deliberate behaviour changes vs v1: `canCreateProject` and `canManageProject` no longer admit a non-manager responsable |
| 2026-10-01 | **CP-4 test-suite envelope** | orchestrator (measurement) + independent verifier | `86a6e9d` (first config revision) | Root cause isolated: one full suite is green (122 files / 1122 tests) but **two concurrent suites fail 6-7 tests each** in `src/components/crm/*` and `scripts/migrate-v2/_guard.test.ts` (`Test timed out in 5000ms`, pointer-events), while those same specs pass in isolation. `vitest.config.ts` now pins `pool: "threads"` and `maxWorkers: 4`; three sequential non-contended runs were green ×3, `tsc` 0 errors, eslint clean, single 13-line additive hunk | — | The verifier **refuted** the first revision: `minWorkers` does not exist in vitest 4.1.10 and broke `tsc` (TS2769) — removed. It also corrected two numbers in my comment (unreproduced `environment` figures, available RAM) so the recorded envelope matches what was actually observed |
| 2026-10-01 | **S0.8 upload-limit verification** | orchestrator (read-only) | see the commit after `4866d8a` | All five checks resolved into facts, two of them without the dashboard: the remote bucket `muttu-docs` `file_size_limit` = **10485760 B (10 MB)**, `public=false`, no MIME restriction (read-only Storage API `getBucket` with the service key from `.env`); Vercel Function body limit = **4.5 MB** (documented platform constant, 413 `FUNCTION_PAYLOAD_TOO_LARGE`); `proxyClientMaxBodySize` default 10 MB but **not applicable** (`src/proxy.ts:91` excludes `api`); local storage 50 MiB; app limits 10 MB documents / 25 MB task attachments | — | **D-04 resolved**: the 4.5 MB platform limit binds before the app's own checks, so multipart cannot honour 25 MB → signed direct upload (ADR-13) with the bucket raised to 25 MB by the user. Recorded dev/prod asymmetry: local 50 MiB vs remote 10 MB. No writes, no dashboard read |
| 2026-10-01 | **S0.9a unified upload policy** | delegated writer (2 rounds) + independent verifier (read-only) | see the commit after `50eabf6` | Policy unified in `src/lib/api/files.ts`: 25 MB default with a strict-integer `MAX_FILE_SIZE_MB` override, allowlist `{pdf,docx,xlsx,pptx,jpg,jpeg,png}`, `isAllowedFileType` = extension **AND** (allowed MIME or empty/octet-stream); the attachments route's duplicate constants and 13-type list deleted; documents 413 message no longer hardcodes 10 MB; client hook, both UI surfaces and the OpenAPI descriptions derive from the shared module; NEW never-delete guard spec. Suite **123 files / 1143 tests green** (baseline 122/1122, +21 tests accounted for exactly), `tsc` 0 errors, eslint clean, 14 paths | — | Verifier blocked nothing (`READY TO COMMIT: yes`) but listed five real findings; three were closed inside the unit (JPG/JPEG messages, strict env validation, trailing newline) and two are recorded follow-ups (docs drift deferred until 25 MB is real end-to-end; never-delete regex coverage), plus the Office-MIME product decision |
| 2026-10-01 | **S0.10 production drift record** | orchestrator (read-only audit + docs) | `0dc08ec` (docs commit after it) | Read-only audit of the shared remote: 28 public tables; **all 8 abandoned v1 project tables present** with **4 rows total**; `auditoria_cambios` **absent**; **12 applied migrations** including the phantom `20260918153200_tablero_seguimiento_social`, which exists in **no branch** of the repo yet is recoverable from `6e4c6c8`. TLS never weakened, no table scans (catalog estimates first), no writes | — | Recorded in §6.9 + R-16 + D-10; §6.5 now forbids `migrate dev` against production; R-01 corrected (the no-bypass refusal is in the guarded entry points, not in the Prisma CLI). Decision: touch nothing in production now; v2 is additive and collides with none of the leftovers |
| 2026-10-01 | **S0.9b signed direct-to-storage uploads — completion and the B1 correction** | delegated writer (2 rounds, strict TDD) + independent read-only verifier (2 passes) | see the completion commit after `a5a3c5f` | Round 1 (completion, 9 files, +899/−73): the sign endpoint gained `kind: "documento_nuevo"` **pre-generating the document id** and signing the FINAL key `documentos/{cliente|general}/{newId}/v1_{nombre}`; `POST /documents` gained a JSON confirm branch that **derives** the id and cliente from the signed path; `useUploadDocument` and `useUploadAttachment` moved to sign → PUT → confirm; the stale `multipartUpload` comment went away. Verifier pass 1: `READY TO COMMIT: no` — every command green, but **B1** blocking. Round 2 (correction): NEW shared `guardDocumentCreate` in `src/lib/api/documents.ts` (categoria 400, restricted 403, duplicate 409) called by the sign endpoint **before `createSignedUploadUrl`** and re-called by the confirm branch; the thrown-Storage path now returns the `{error, code}` envelope; the decorative `assertKeyBelongsToTarget` call removed; two test gaps closed. Verifier pass 2: `READY TO COMMIT: yes`, no blocking finding. Own checks: 7 focused files / **85 tests** green; **full suite 126 files / 1194 tests green** in 123 s (baseline 125/1167); `tsc` 0 errors; eslint clean on the 11 touched files | **medium** tier, **1 lens** (`review-reliability`), lineage `review-ba69dfb46439abc1`: **approved**, acknowledged, **authority burned** (prompt 166 KB → result 5.9 KB). Two **advisory, non-blocking** findings — R3-1 WARNING `documents/route.ts:229-249`, R3-2 SUGGESTION `versions/route.ts:103` — both `informational`; no correction transition was offered and neither reopens the review | B1 was a **newly introduced parity regression**: the multipart path rejected the same request *before* any Storage write, the signed path initially rejected it *after*, and the never-delete policy made every orphan permanent — so a routine flow leaked one object per attempt. Three triggers were reachable from the shipped dialog (duplicate title, restricted-category 403, invalid-category 400). **R-17's recorded acceptance (size guarantee) did not cover them**; after the correction R-17 covers only the confirm-side TOCTOU and oversized objects. Residuals carried in the S0.9b block: multipart↔guard duplication (no drift guard), R3-001, replay-500, the OpenAPI optionality nit, raw `fetch` vs `apiPost` |
| 2026-10-01 | **S0.9b hygiene unit — one home for the create gates + R3-1** | delegated writer (strict TDD) + independent read-only verifier | `8d10180` (+51/−64 in the route, +112 and +20 in the two test files) | The multipart branch no longer carries its own categoria/duplicate logic (`parseUploadForm` is called with `requiereCategoria: false`), so all three create gates come from `guardDocumentCreate`; the confirm branch's documento/version/cliente inserts are now ONE `db.$transaction` with the audit call and the extraction outside; the guard's tests now pin `mode: "insensitive"` and `deleted_at: null` with an exact `toHaveBeenCalledWith`. Verifier: `READY TO COMMIT: yes`, no blocking finding; it established the response contract is byte-identical and named three benign ordering deltas. Own checks: focused 41 + 8 + 18 + 14 green; **full suite 126 files / 1201 tests green** (baseline 1194); `tsc` 0 errors; eslint clean | **medium** tier, **1 lens** (`review-reliability`), lineage `review-d4d492b8adb83210`: **approved**, acknowledged, **authority burned** (prompt 26 KB → result 1.5 KB). One advisory WARNING at `route.ts:526` (`informational`, no description in the closure envelope, no correction offered) | Closes S0.9b residual 2 (multipart↔guard duplication), the guard-assertion gap and **R3-1**; the unit's own residuals are item 8 of the S0.9b block. `src/lib/api/documents.ts` needed no change. Tooling note: the first capture attempt failed with `native-status-failed — the negotiated review operation exceeded its aggregate time budget` while the *identical* retry succeeded, so treat that message as transient rather than fatal |

**Upload limits record (S0.8, measured 2026-10-01).** Every check is now a fact, and the last unknown was closed
**read-only instead of from the dashboard**:

| Constraint | Value | How it was verified |
|---|---|---|
| Vercel Function request **and response** body | **4.5 MB** — a platform constant, not plan-dependent | Vercel docs *Functions Limits* and *FUNCTION_PAYLOAD_TOO_LARGE* (413); the KB article "How do I bypass the 4.5MB body size limit of Vercel Functions" explicitly says to upload directly to the storage provider |
| Next proxy body buffering (`proxyClientMaxBodySize`) | default **10 MB**, `experimental` | installed Next doc `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md` |
| Does that proxy limit apply here? | **No** — the matcher excludes `api` | repo: `src/proxy.ts:91` |
| Remote bucket `muttu-docs` `file_size_limit` | **10485760 B = 10 MB**; `public=false`; `allowed_mime_types=null` | **read-only Storage API `getBucket`** against `rxwtgvuijaketidnbtoh.supabase.co` with the service key already in `.env`; metadata only, no writes |
| Local Supabase storage | **50 MiB** | `supabase/config.toml:118` |
| App limit — documents / project supports | **10 MB** (`MAX_FILE_BYTES`), returns 413 | `src/lib/api/files.ts:9`, enforced at `src/app/api/v1/documents/route.ts:95` |
| App limit — task attachments | **25 MB default**, env-overridable via `MAX_FILE_SIZE_MB` | `src/app/api/v1/tasks/[id]/attachments/route.ts:34-40`, enforced at :207 |
| Allowed types (shared) | pdf, docx, xlsx, pptx, jpg, png — extension **or** MIME | `src/lib/api/files.ts:11-19` |

**The decisive conclusion.** In production the binding constraint for any multipart upload through a route is the
**4.5 MB function body limit**, which is a platform constant: the app's own 10 MB / 25 MB checks can never be
reached with anything larger. The documented limits are therefore **misleading in production** — a 5 MB document is
rejected by the platform with `FUNCTION_PAYLOAD_TOO_LARGE` before the route handler runs, and raising the bucket to
25 MB does not change that. The only way to honour 25 MB is to keep the bytes **out of the function**: the signed
direct upload of ADR-13 / S0.9b. Note also the **dev/prod asymmetry**: local allows 50 MiB while production allows
10 MB, so a 25 MB upload succeeds locally and fails in production — a trap when testing S0.9a.

**Baseline suite result (Step 2 of §1.2):** 122 files / **1122 tests** green under the bounded envelope of §6.10,
with `tsc` 0 errors and eslint clean. The "115 files / 1027 tests" figure recorded in §1.2 is stale.

### 6.8 Needs your decision (user; one at a time when asked)
| ID | Decision | Default used meanwhile | Blocks |
|---|---|---|---|
| D-01 | ~~Branch base~~ — **RESOLVED 2026-09-30**: `feat/projects-v2`, branched from `main` (`11e9bc1`) | — | — |
| D-02 | ~~COORDINADOR restriction timing~~ — **RESOLVED 2026-09-30**: applied directly to the project write paths (no flag exists) | — | S0.7 |
| D-03 | Chain strategy for PRs: `stacked-to-main` vs `feature-branch-chain` | ask at first PR over budget | PR-06+ |
| D-04 | ~~Upload approach after S0.8: multipart through routes vs signed direct upload~~ — **RESOLVED 2026-10-01 by measurement**: the Vercel Function body limit is a **4.5 MB platform constant** and binds before the route's own 10 MB / 25 MB checks, so multipart cannot honour 25 MB. Chosen: **signed direct upload (ADR-13)**, which keeps the bytes out of the function. The user must raise the `muttu-docs` bucket limit from 10 MB to 25 MB before deploy. | — | — |
| D-05 | ~~Narrow task-attachment types to pdf/docx/xlsx/pptx/jpg/png (drops doc, ppt, csv, txt, zip…)~~ — **APPLIED 2026-10-01** with the documented default (narrow), per the user's recorded rule "solo livianos office/imagen". `jpeg` was added to the allowlist on purpose (same format as `jpg`). **CONFIRMED 2026-10-01 (user): keep it narrow.** The earlier caveat — that this was applied by documented default and not by an explicit user confirmation — no longer applies: the dropped types (`doc`, `ppt`, `csv`, `txt`, `zip`, `heic`) were reviewed and confirmed out. If it ever needs reverting it is a one-line change in `src/lib/api/files.ts` plus the message strings and the OpenAPI descriptions. `jpeg` stays in the allowlist on purpose (same format as `jpg`). | narrow (confirmed) | — |
| D-06 | COORDINADOR access to the Tablero gerencial: scoped to member projects vs none | scoped (A-02) | S2.6, S9.2 |
| D-07 | ~~Commit the untracked `openspec/changes/proyecto-financiero-tab/{proposal,design}.md` before marking superseded~~ **RESOLVED 2026-10-01 (user, session 5): mark it superseded and keep it OUT of git** — leave the `.git/info/exclude` entry as it is. Two facts to carry: that exclusion lives in a **per-clone, untracked** file, so it is invisible to the repository and to every other clone; and the S0.1 file list is **stale** (see the S0.1 block) | ask | S0.1 |
| D-08 | PDF engine (N-23) | none — blocks S9.3b only | S9.3b |
| D-09 | ~~Who can create projects~~ — **RESOLVED 2026-10-01 by the user**: only **GERENCIA + ADMINISTRADOR** (`PROJECT_MANAGER_ROLES`), i.e. the recorded decision wins over RF v2.0 §3's "Gestor". No GESTOR role is introduced and COORDINADOR stays out of project management. | — | — |
| D-10 | Fate of the 8 inert v1 project tables in production (4 rows total, no code reads them): leave them, or drop them with a verified backup and a reviewed migration | **leave them** — zero risk and v2 is additive | production promotion step (§6.5 item 9) |

### 6.9 Production state (verified 2026-10-01, read-only)

Measured on 2026-10-01 with read-only `SELECT`s against the shared remote
(`aws-1-us-west-2.pooler.supabase.com:5432` — the only remote instance, i.e. PRODUCTION). Credentials were read
from `.env` and never appeared on a command line or in any output; **TLS verification was left at its default**
(never weakened); no table scan was run — catalog estimates first (`pg_class` / `n_live_tup`), exact `count(*)`
only on the tables under examination. No writes occurred.

| Fact | Measurement |
|---|---|
| Public tables | 28 |
| Abandoned v1 project tables | **all 8 present**: `proyectos`, `metas`, `actividades`, `gastos`, `rubros`, `indicadores`, `soportes_proyecto`, `lineas_presupuestales` |
| Rows in them | **4 in total** (`rubros` 4; all seven others 0). ~4.1 MB of empty relations and indexes |
| `auditoria_cambios` (v2, S0.4) | **absent** — the branch has not leaked into production |
| Applied migrations on production | **12**, including `20260918153200_tablero_seguimiento_social`, which **exists in no branch of this repository** |
| Migration sets | `main` 11; this branch 12 (`…_oportunidades_comerciales` + `20260930181056_v2_auditoria_cambios`); production 12 (the 11 of `main` + the phantom one) |

**Interpretation.** "The v1 module was never shipped" is true of the *application* and **false of the *database***.
R-06 remains correct about `main` (no v1 models in `schema.prisma`), and the previously recorded "0 production rows"
is confirmed for `proyectos`/`metas`/`actividades` — but the tables themselves do exist in production. The concrete
consequence: **the rows are inert, the schema is not absent, and this repository does not describe production.**

**The phantom migration is recoverable.** `20260918153200_tablero_seguimiento_social` was added by commit
`6e4c6c8` ("feat(tablero): esquema y migracion del modulo de seguimiento social") and is still present in the
`feat/tablero-seguimiento-*` and v1 chain branches. So the abandoned module was named "tablero de seguimiento
social" first and later renamed "proyectos": the 8 production tables and the projects v1 chain are the same work.
This matters because the DDL of those tables is readable on demand, which makes a future reviewed *drop* migration
feasible without guessing.

**Why the migration file is deliberately NOT restored into this repo.** Adding
`prisma/migrations/20260918153200_tablero_seguimiento_social/migration.sql` without the matching models in
`schema.prisma` would leave migrations and schema inconsistent: `prisma migrate dev` would then want to reconcile by
*removing* those tables, and the already-reset local database would try to apply it and recreate 8 dead tables.
Documenting the drift and treating `_prisma_migrations` as the authority for production is the lower-risk position.

**Decision (2026-10-01, recorded): touch nothing in production now.** No code on `main` reads those tables, so they
are inert weight; removing them is cosmetic, needs a verified backup and a reviewed migration, and `migrate deploy`
can never remove them by itself. The cleanup decision is D-10 and belongs to the promotion step.

**Hard rules derived from this audit**
1. `prisma migrate deploy` only, from a human terminal; never `migrate dev` against production.
2. `_prisma_migrations` on the remote is the authority for production's schema; the repo is not.
3. Any future destructive remote step needs its own `pg_dump`, its own review, and a human to run it.
4. v2 is additive (`auditoria_cambios` + its own tables), so it collides with none of the leftovers — do not
   "clean up first" as a precondition for shipping v2; that would add risk for no benefit.

### 6.10 Test-suite envelope (CP-4, measured 2026-10-01)

The suite is **not intrinsically flaky**: it fails when the host is oversubscribed. Measured on the project machine
(12 logical CPUs, 7.6 GiB total, 2.7-3.1 GiB available):

| Scenario | Result |
|---|---|
| One full suite, vitest default workers (one per CPU) | **122 files / 1122 tests green**; cumulative jsdom `environment` time 213-317 s |
| One full suite, `--maxWorkers=4` | green; `environment` 123 s (warm) |
| **Two full suites concurrently** | **6-7 failures in each run**, always `src/components/crm/{client-form,client-list,client-sheet}.test.tsx` plus `scripts/migrate-v2/_guard.test.ts` (a spec that spawns child processes), with `Test timed out in 5000ms` and `Unable to perform pointer interaction as the element has 'pointer-events: none'` |
| Those same failing specs in isolation | always green |
| Three sequential runs under the pinned envelope | green ×3 (122 files, exit 0), zero `FAIL` lines, zero timing/pointer-events failures |
| First run on a cold cache (drvfs) | `environment` 299-317 s vs 164-172 s warm — a ~1.8× spread that is filesystem-related, not flakiness |

`vitest.config.ts` now pins `pool: "threads"` and `maxWorkers: 4`, so `npm test`, an ad-hoc `npx vitest run` and the
documented `--pool=threads` command all share one bounded envelope. `testTimeout` is deliberately **left at the 5 s
default**: raising it would hide contention instead of removing it.

**Rules**
1. **Never run two full suites at once**, and do not start another heavy command (a second suite, a build) while a
   suite runs. This is the only reproducible cause of failures observed here.
2. When a full-suite verification is delegated, the verifier must own the machine for its duration. An earlier
   "all green" claim in this project was measured while other suites were in flight — the very condition that
   produces false reds. A flaky suite is also what let R3-001 survive until the native review found it.
3. Judge the suite by `FAIL` lines and by warm runs, not by wall time: a slow first run on this filesystem is
   expected.
4. `minWorkers` does **not** exist in vitest 4.1.10 (it fails `tsc` with TS2769 and is silently ignored at
   runtime). Only `maxWorkers` is valid.

## 7. Risks, assumptions, open decisions, questions for the PO

### 7.1 Risks and mitigations
| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R-01 | A migration/backfill runs against the remote `.env` Supabase (real-looking data) | ~~High~~ Low / Critical | **ROOT CAUSE FIXED 2026-09-30 (commit `96c4c5c`).** Plain `npx prisma …` used to resolve `.env` — the shared remote — through `prisma.config.ts`. Now that config loads `.env.local` only, a local `npx prisma …` resolves loopback by default, and the `db:*:local` scripts replace plain `npx`. **Precision (corrected 2026-10-01):** the hard refusal with no bypass lives in the *guarded entry points* — `prisma/require-local-db.ts`, imported by the seed, the DB invariant tests, `scripts/backfill-document-text.ts` and `scripts/migrate-v2/_guard.ts` — **not in the Prisma CLI itself**; `prisma.config.ts` only calls `loadLocalEnv()`, so a deliberate remote run remains possible by exporting the variables, which is exactly why the promotion path is human-only (§6.5, §6.9). Measured after the fix: `npx prisma migrate status` reports `127.0.0.1:54322`. Residual risk: a deliberate remote run must export the variables explicitly (§4.5, §6.5) |
| R-02 | 25 MB uploads cannot work in production: the Vercel Function body limit is **4.5 MB** (verified platform constant) and the remote bucket `muttu-docs` is at **10 MB** (read read-only 2026-10-01) | High / **High** | Verified in S0.8 (§6.7). D-04 resolved to the ADR-13 signed direct upload, which keeps the bytes out of the function; the user raises the bucket to 25 MB before deploy; local 50 MiB vs remote 10 MB is a known asymmetry |
| R-03 | COORDINADOR users lose project creation/edit (S0.7) | Medium / Medium | D-02 resolved (applied directly); release note, CTA hidden in UI, 403 copy explains; membership in S2.6 restores executor access |
| R-04 | Test churn from v1 project tests | High / Low | Removed by the direct path: there are no v1 project tests in this branch, because the v1 module was never shipped (re-scoped from the original 419-case risk) |
| R-05 | PO reverses a USER-RESOLVED decision (e.g. Gestor creates projects per RF v2.0 §3; Gerente-only approval) | Medium / Medium | Predicates isolated (ADR-08) so a role change is a one-file edit + tests; questions §7.4 sent early |
| R-06 | ~~Legacy project data cannot be mapped automatically~~ | — / — | Removed by the direct path: there is no legacy project data to map (0 production rows, no v1 tables on `main`) |
| R-07 | Collisions with the active v6 writer on dashboard files | Medium / Low | Separate branch; S2.7/S9.2/S9.5 scheduled after the v6 merge or coordinated |
| R-08 | Enum `ADD VALUE` used in the same transaction | Medium / Low | Separate migrations (§4.2 caveat); no enum value is ever removed, so no rename-swap migration is needed |
| R-09 | Dashboard > 3 s with many projects (RNF-02) | Medium / Medium | KPI cache (ADR-12), indexes, bench script with pass criterion |
| R-10 | Transactional audit makes writes fail when audit fails | Low / Medium | Intended (RNF-05); monitored via `withApiErrorHandling` logs; audit insert is a single `createMany` |
| R-11 | Exposure of personal data (cuentas de cobro, IDs) — Ley 1581 | Medium / High | RNF-03 matrix, VIS exclusions, access log, no bodies in logs |
| R-12 | Propuesto PO items change after build (RF-09, RF-12 rule, RF-16, RF-25, RF-28, formats) | Medium / Medium | Parameters (`avance_requiere_medio`, `modificacion_bloquea_periodos_pasados`), pure libs isolated, "no confirmado" badges |
| R-13 | Rounding differences vs the PO spreadsheet | Low / High | Exact cents + half-up tenths; golden test with 56,25 → 56,3 |
| R-14 | Known failing `prisma/invariant.test.ts` masks new DB failures | Medium / Low | New live-DB tests in separate files; baseline failure recorded |
| R-15 | PDF export engine incompatible with serverless | Medium / Low | S9.3b gated by N-23/D-08; Excel export ships first |
| R-16 | **The repository does not describe production**: 8 abandoned v1 project tables (4 rows total) and an applied migration (`20260918153200_tablero_seguimiento_social`) that exists in no branch | Low / Medium | Measured read-only on 2026-10-01 and recorded in §6.9; promotion uses `migrate deploy` only; D-10 decides the cleanup; `_prisma_migrations` is the authority for production |
| R-17 | **Signed uploads move the guarantees after persistence**: the sign endpoint validates the declared size, the categoria and the duplicate title, but the browser PUT lands in Storage unchecked and confirm only then fails — so an authorised user can leave an orphan object that the never-delete policy forbids removing. Two triggers remain after S0.9b's correction: an **oversized object** (only the bucket limit binds) and a **concurrent create inside the sign→confirm window** (the confirm re-check fails legitimately, after the bytes are stored) | Medium / Low (was Medium / Medium before the correction) | The enforced bound is the bucket's `file_size_limit` (10 MB today, 25 MB after the raise) — recorded in the promotion checklist (§6.5 step 3); detect with `scripts/migrate-v2/storage-orphans.ts`; **the sweeper decision is RESOLVED 2026-10-01 (user): keep the read-only report as the only tool and never delete** — no automated or documented manual cleanup script is wanted, which keeps the never-delete policy intact. **S0.9b's correction removed the routine triggers**: every rejection that the multipart path made side-effect-free (duplicate title, categoria 400/403) now happens before `createSignedUploadUrl`. Introduced by S0.9b; the multipart path was bounded by the platform body cap |

### 7.2 Assumptions register
| ID | Assumption (default) | Where | How to falsify / owner |
|---|---|---|---|
| A-01 | A member COORDINADOR may request modifications (RF v2.0 §3 "Gestor solicita") | P12, S8.3a | PO says only Gerente requests → remove from `canExecuteProject` for requests (user/PO) |
| A-02 | COORDINADOR sees the Tablero gerencial scoped to member projects | P17, S2.6, S9.2 | User answer D-06 |
| A-03 | Activity dates are not clamped to `fecha_fin` (PO formula applied literally) | REQ-STR-03 | PO/Gerente reviews a Gantt where the last week overflows |
| A-04 | Activity state rules (FINALIZADA by the date the 100 % avance was registered) | REQ-STR-09 | PO defines another rule → change `estadoActividad` only |
| A-05 | Execution records are voided, never deleted | REQ-EXE-07 | PO/user asks for hard corrections (conflicts with "nothing is deleted") |
| A-06 | Financial total row uses the same rule on sums | REQ-FIN-04 G7 | PO wants worst-of-rubros → one function change |
| A-07 | A rejected expense can be corrected and re-submitted | REQ-GAS-02 | PO says rejected is final → new expense instead |
| A-08 | A validated expense is immutable; only ADM/GER void it | REQ-GAS-02 | PO/user defines another correction path |
| A-09 | Template multi-values separated by `;`, first línea = principal | V-04, §8.2 | Gerente/PO tries the template and prefers another convention |
| A-10 | Missing active rubro row in the template = 0 | V-11 | PO wants an error instead |
| A-11 | Opportunity proposal texts shown read-only on creation | REQ-CLI-02 | User/PO feedback |
| A-12 | COORDINADOR list defaults to EN_EJECUCION projects (RNF-C02 "activos") | REQ-CLI-04 | PO wants all states |
| A-13 | Portfolio financial KPIs weighted by money (Σ E / Σ A), technical by simple mean | kpis.ts | PO/Gerente definition |
| A-14 | KPI cache recomputes ≤ 20 stale projects per request | §4.15 | Bench shows it is too slow/fast |
| A-15 | v2 semáforo uses global parameters only | S1.4 | PO asks for per-project thresholds (RF-35 says global) |
| A-16 | "Today" for date rules is the America/Bogota calendar date | REQ-EXE-01 | — (Colombian operation) |
| A-17 | Production hosting is Vercel (VERIFIED README) and its body limit applies to route handlers (UNVERIFIED) | R-02 | S0.8 |
| A-18 | V-03 requires inicio strictly before fin ("anterior") | V-03 | PO accepts same-day projects |

### 7.3 Open decisions (status copied from the plan unless marked; blocking and defaults)
| ID | Status (plan, 2026-09-29) | Blocks a slice? | Default meanwhile | Owner |
|---|---|---|---|---|
| DP-10 scope + hosting (25 MB) | USER-RESOLVED size/types/never-delete; scope stated "for all files"; hosting/bucket limits UNVERIFIED | Blocks deploying S0.9a/S0.9b and large uploads in S4.2/S6.1/S7.4 | Build with 25 MB constant; deploy only after S0.8 + bucket raise | User (S0.8) |
| DP-04 technical thresholds + delay alert | Tolerance 10 % provisional from PO example; umbral1/2 (10/20 pp) and delay (70 %) NOT in PO docs | No (placeholders) | 10/20 pp, 70 %, `confirmado:false` | Gerente/PO |
| DP-03 contract mode | Open ("decide before pilot") | No (copy only) | Neutral copy "subejecución" | PO |
| DP-07 opportunity → projects cardinality | Recommendation 1:1 | No | 1:1 (`@unique`) | PO |
| DP-08 manual weight | Recommendation Yes | No | Yes, before baseline | PO |
| DP-09 exclude unmeasured indicators | Recommendation Yes, shown apart | No | Yes | PO |
| DP-12 periodicity | Recommendation Monthly | No | Monthly | PO |
| N-03 code format | Recommendation PRY-AAAA-NNN | No | PRY-AAAA-NNN | PO |
| N-08 indicators without meta | N/A — no v1 indicators exist | No | — | — |
| N-09 first measurement for an indicator | N/A — no v1 values to convert | No | — | — |
| N-10 beneficiary indicators → count rows | Yes | No | Yes | User |
| N-11 start week unknown | N/A — activities are created in v2 with explicit weeks | No | start = end when entered manually | User |
| N-12 synthetic "Avance migrado" | N/A — no legacy progress to migrate | No | — | — |
| N-14 project without programming | Leave pending, block baseline | No | Pending flag | User |
| N-16 territorio → municipios | N/A — municipios are captured directly in v2 | No | — | — |
| N-17 valor_total source | Σ A, alert if ≠ opportunity | No | Σ A | User |
| N-19 which "panel general" (RNF-C01) | Dashboard Mi resumen + kanban chip | No | as plan | PO/User |
| N-21 municipios catalog source | Curated, admin-extendable | No | Curated list, admin-editable | PO/User |
| N-23 PDF engine | Decide in S9.3 | **Blocks S9.3b** | Excel first | User |
| N-24 prototype = target design | Yes for existing tabs; new views in S10.2 | No | as plan | PO |
| N-25 Suspendido / Cancelado states | Keep (exist) | No | Keep | PO |

### 7.4 Preguntas abiertas para el PO (listas para reenviar)
**Pendientes de definición**
1. Umbrales del semáforo técnico: ¿qué valores usamos para el umbral 1 y el umbral 2 de desviación (avance
   programado − avance real, en puntos porcentuales)? Mientras tanto usamos 10 y 20 puntos, marcados como
   "no confirmado". (DP-04)
2. Tolerancia financiera: el ejemplo del documento usa 10 %; ¿confirman ese valor inicial para el semáforo de gasto
   óptimo? (DP-04)
3. Alerta de posible retraso: ¿por debajo de qué porcentaje de ejecución vs. programado (E/P) se activa, cuando el
   semáforo técnico está en amarillo o rojo? Mientras tanto usamos 70 %. (RF-24, DP-04)
4. Modalidad contractual: ¿los proyectos son a precio global o de legalización del total? Esto define cómo
   explicamos la subejecución (ahorro o devolución). (DP-03)
5. ¿Una oportunidad ganada puede originar más de un proyecto, o es siempre 1:1? (DP-07)
6. ¿Se permite ajustar manualmente el peso de las actividades antes de aprobar la línea base? (DP-08)
7. En el cumplimiento de indicadores, ¿se excluyen del promedio los indicadores sin medición y se muestran aparte?
   (DP-09)
8. ¿La programación financiera es mensual? (DP-12)
9. ¿Confirman el formato de código PRY-AAAA-NNN y que los proyectos existentes conservan su código actual? (N-03)
10. ¿Un avance de entregable solo cuenta si tiene al menos un medio de verificación? (RF-12)
11. En las modificaciones, ¿los periodos ya transcurridos no se pueden reprogramar? (RF-28)
12. ¿Mantenemos los estados Suspendido y Cancelado del proyecto? (N-25)
13. Municipios: ¿usamos el listado completo del DANE o un catálogo propio que el Administrador va ampliando? (N-21)
14. ¿El prototipo visual de Proyectos es el diseño objetivo para las pestañas existentes? Las vistas nuevas
    (ficha financiera por rubro, versiones, validación de gastos, reporte de importación) las diseñamos nosotros.
    (N-24)
15. En el "panel general", ¿dónde debe verse la diferencia entre proyectos en ejecución y oportunidades en
    prospección: en el resumen del inicio, en el tablero Kanban o en ambos? (RNF-C01, N-19)

**Decisiones tomadas por el equipo que necesitamos que confirmen**
16. Solo Gerencia y Administrador crean proyectos, cargan la plantilla, corrigen en borrador, aprueban la línea base
    y validan gastos. El Coordinador es el ejecutor: registra avances, medios, mediciones, beneficiarios y gastos en
    los proyectos donde está asignado. Esto difiere de la sección 3 del documento, donde el Gestor crea y carga
    proyectos. ¿Lo confirman? (N-01, RF-36)
17. Un proyecto puede tener varios Coordinadores y un Coordinador varios proyectos; cada Coordinador ve solo los
    proyectos donde está asignado. ¿Correcto? (DP-06, N-20)
18. Quien registra un gasto no puede validarlo; valida Gerencia o Administrador. ¿Correcto? (DP-02)
19. Un gasto que supera el asignado vigente del rubro bloquea su validación y genera una alerta a Gerencia hasta
    que se apruebe un traslado o una adición; el registro del gasto nunca se bloquea. ¿Correcto? (DP-11, RF-25)
20. "Meta N" del prototipo equivale a Objetivo específico, con indicadores de resultado por objetivo. ¿Correcto?
    (DP-01)
21. Un proyecto puede tener varias líneas estratégicas con una principal; los tableros cuentan solo la principal.
    ¿Correcto? (DP-05)
22. Proyectos ya cargados: los que están en ejecución vuelven a Borrador hasta que Gerencia apruebe su línea base, y
    sus gastos vuelven a "Registrado" para ser validados. ¿Correcto? (N-18, N-15)
23. El catálogo de rubros queda solo con los 15 del documento; "Material POP" y "Operación logística" salen del
    catálogo y sus valores se reasignan proyecto por proyecto más adelante. ¿Correcto? (N-13, RF-33)
24. Archivos: máximo 25 MB por archivo, solo PDF, Word, Excel, PowerPoint, JPG y PNG, y nunca se borra ningún
    archivo (solo se oculta). ¿Correcto? (DP-10, RNF-07)

## 8. Appendix

### 8.1 Golden fixtures (`src/lib/proyectos/__fixtures__/`)
**F-W1 weeks** — fecha_inicio `2026-10-05` (Monday), fecha_fin `2027-01-29` → 117 days → 17 weeks; periods
`2026-10, 2026-11, 2026-12, 2027-01` (4 months = the PO example's "proyecto de 4 meses").

| Activity | Weeks | Dates (derived) | Default weight |
|---|---|---|---|
| 1.1 | 1–1 | 2026-10-05 → 2026-10-11 | 1 |
| 1.2 | 2–2 | 2026-10-12 → 2026-10-18 | 1 |
| 1.3 | 3–3 | 2026-10-19 → 2026-10-25 | 1 |
| 1.4 | 3–6 | 2026-10-19 → 2026-11-15 | 4 |

Source note: the extracted est.txt table lost merged cells; weeks are reconstructed from the weights shown
(1, 1, 4) and the "Sem. inicio" values; CedeTextil is a **structural** fixture only (N-22 USER-RESOLVED).

**F-T1 technical** (on F-W1, corte `2026-10-25`, all avances with ≥ 1 medio):

| Deliverable | Goal | Counted | Completion |
|---|---|---|---|
| 1.1-E1 Memorias de eventos de socialización validadas | 2 | 2 | 100 % |
| 1.1-E2 Informe de línea base | 1 | 1 | 100 % |
| 1.2-E1 Mapas de expectativas y liderazgos consolidados | 2 | 1 | 50 % |
| 1.3-E1 Actas de selección de la figura jurídica suscritas | 2 | 0 | 0 % |
| 1.4-E1 Estatutos asociativos aprobados | 2 | 0 | 0 % |
| 1.4-E2 Certificados de existencia y representación legal | 2 | 0 | 0 % |
| 1.4-E3 RUT con NIT activo | 2 | 0 | 0 % |

Activity progress 1.1 = 100 %, 1.2 = 50 %, 1.3 = 0 %, 1.4 = 0 %; time fractions 1, 1, 1, 7/28.
Real = 1,5/7 = 21,4 %; programado = 4/7 = 57,1 %; desviación = 35,7 pp → rojo (10/20 pp).
Variant F-T1b: add one uncounted avance (no medio) of 1 on 1.3-E1 → real unchanged (tests REQ-EXE-03).

**F-F1 financial** (project F-W1, tol 10 % = 1000 bp, corte `2026-11`):

| Rubro | A | 2026-10 | 2026-11 | 2026-12 | 2027-01 | Validated expenses (periodo: valor) | Other expenses (must not count) |
|---|---|---|---|---|---|---|---|
| R01 Personal | 59.500.000 | 14.875.000 | 14.875.000 | 14.875.000 | 14.875.000 | 2026-10: 12.000.000; 2026-11: 15.000.000 (Σ 27.000.000) | REGISTRADO 2026-11: 5.000.000; VALIDADO 2026-12: 3.000.000 (after corte) |
| R12 Transporte | 24.000.000 | 6.000.000 | 6.000.000 | 6.000.000 | 6.000.000 | 2026-10: 7.000.000; 2026-11: 6.500.000 (Σ 13.500.000) | RECHAZADO 2026-10: 800.000 |

Expected (REQ-FIN-04): Personal P 29.750.000, E 27.000.000, D −2.750.000, E/P 908 tenths (90,8 %), E/A 454 (45,4 %),
umbral rojo 32.725.000, verde. Transporte P 12.000.000, E 13.500.000, D +1.500.000, E/P 1125 (112,5 %), E/A 563
(56,3 %), umbral rojo 13.200.000, rojo. Total A 83.500.000, P 41.750.000, E 40.500.000, D −1.250.000, E/P 970
(97,0 %), E/A 485 (48,5 %), verde. The CedeTextil budget sheet example (est §5.2, Σ 177.360.000 over 15 rubros)
is F-X1's budget; Programación rows for R01/R12 there equal F-F1.

**F-X1 template** — CedeTextil structure: sheet 3 `OE1`; sheet 4 activities of F-W1; sheet 5 the seven
deliverables of F-T1 with units (Memoria, Informe, Mapa, Acta, Estatuto, Certificado, RUT) and media (est §5.1);
sheet 7 the 15 rubros of est §5.2 (R01 59.500.000, R04 34.000.000, R06 1.440.000, R08 45.000.000, R11 300.000,
R12 24.000.000, R13 12.800.000, R15 320.000, others 0; Σ 177.360.000); sheet 2 valor total 177.360.000 (valid
variant) or 177.410.000 (V-12 failing variant, +$50.000 mirroring the PO's documented inconsistency).

### 8.2 Excel template sheet map (PLANTILLA_VERSION "2026.1")
| Sheet | Row 1 headers (exact, in order) | Notes |
|---|---|---|
| `1. Instrucciones` | — (A1 title; B2 = PLANTILLA_VERSION) | Not imported (except B2 for V-01) |
| `2. Proyecto` | `Campo`, `Valor` | Rows: Código (locked, prefilled), Cliente (informative), Líneas estratégicas (`;`, first = principal), Municipios (`;`), Fecha de inicio, Fecha de fin, Valor total, Meta de beneficiarios |
| `3. Objetivos` | `Código`, `Descripción` | |
| `4. Actividades` | `Código`, `Código objetivo`, `Nombre`, `Semana inicio`, `Semana fin`, `Responsable (correo)`, `Peso (opcional)` | Empty weight = duration |
| `5. Entregables` | `Código`, `Código actividad`, `Descripción`, `Cantidad`, `Unidad`, `Tipo de medio exigido` | One product per row |
| `6. Indicadores` | `Código`, `Código objetivo`, `Nombre`, `Meta`, `Unidad`, `Línea base` | |
| `7. Presupuesto` | `Código rubro`, `Rubro`, `Valor asignado` | 15 rows precargadas; `Rubro` informative |
| `8. Programación` | `Código rubro`, `Rubro`, `Mes 1 (AAAA-MM)` … `Mes N (AAAA-MM)`, `Total`, `Control` | Control = Total − Asignado must be 0 |
| `9. Catálogos` | `Rubros`, `Líneas estratégicas`, `Municipios`, `Unidades` | Protected; named ranges for dropdowns |

### 8.3 Permission predicates map (matrix §3.1 → code)
| Matrix rows | Predicate (`src/lib/permissions.ts`) | Loader / guard (`src/lib/api/projects.ts`) |
|---|---|---|
| P01–P03, P16 | `canViewProjectV2` / `canViewPortfolio` | `loadProjectScoped` (membership-aware from S2.6) |
| P04 | `canViewFinancialSupports` | expense attachments routes (S6.5) |
| P05 | `canCreateProject` (= `canManageProjects`) | `POST /projects`, opportunity project route |
| P06, P07, P14 | `canManageProjects` + state BORRADOR (P06) | NEW `getProjectForStructure` |
| P08 | `canApproveBaseline` | baseline route |
| P09, P10, P12 | `canExecuteProject` + state EN_EJECUCION | NEW `getProjectForExecution` |
| P11 | `canValidateExpense` | validate/reject routes |
| P13 | `canApproveModification` | modification approve/reject |
| P15 | `requireApiRole(["ADMINISTRADOR"])` (existing) | admin routes |
| P17 | `canViewPortfolio` (+ membership scope) | dashboard route |
| P18 | `canManageProjects` | void routes |

### 8.4 Spanish domain terms kept verbatim in UI copy
Proyecto, Oportunidad (Ganada), Cliente, Objetivo específico, Actividad, Entregable, Avance, Medio de verificación,
Indicador de resultado, Medición, Beneficiarios atendidos, Meta de beneficiarios, Línea estratégica (principal),
Municipio, Rubro, Presupuesto, Valor asignado, Programación, Gasto, Soporte, Factura de proveedor, Cuenta de cobro
de persona natural, Tercero, NIT / CC / CE, Registrado / Validado / Rechazado / Anulado, Borrador / En ejecución /
Suspendido / Cerrado / Cancelado, Línea base, Versión, Solicitud de modificación (Traslado, Adición, Reducción,
Reprogramación, Cronograma, Entregables), Semáforo técnico / financiero (Verde / Amarillo / Rojo), Posible
retraso, Ficha financiera, Corte, Tablero gerencial, Plantilla, Gerencia, Coordinador, "no confirmado".

### 8.5 References
- Plan: `odd/tasks/v2-projects-and-clients-plan.md` (slices, mapping, decisions).
- PO: RF v2.0 (`rf.txt`), Estructura v1.0 (`est.txt`), Detalle de Cliente (`clientes.txt`) — scratchpad paths §0.
- Code (VERIFIED): `prisma/schema.prisma`, `src/lib/permissions.ts`, `src/lib/semaforo.ts`, `src/lib/catalogs.ts:163-170`,
  `src/lib/settings.ts`, `src/lib/api/{files,errors,handler,audit,projects,crm}.ts`, `src/app/api/v1/projects/**`,
  `src/app/api/v1/rubros/**`, `src/app/api/v1/settings/route.ts`, `src/app/api/v1/dashboard/projects/route.ts`,
  `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts`, `src/app/api/v1/tasks/[id]/attachments/route.ts`,
  `src/proxy.ts`, `prisma/{load-local-env,local-env,seed}.ts`, `prisma/invariant.test.ts`, `scripts/seed-proyectos-demo.ts`,
  `vitest.config.ts`, `package.json`, `supabase/config.toml`, `docs/plan-supabase-manana.md`, `docs/guia-demo.md`, `README.md`.
- Next 16 docs: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`
  (proxy-only body buffering; API routes are outside the proxy matcher here).
- Visual plan: `odd/tasks/v6-visual-alignment.md` (V2.5–V2.8, V2.11 ON HOLD).
- Superseded v1 changes: `openspec/changes/{proyecto-financiero-tab,proyecto-legalizacion-tab,proyecto-metas-tab,proyecto-soportes-tab,tablero-gerencial-unificado,admin-umbrales-editables}`.
