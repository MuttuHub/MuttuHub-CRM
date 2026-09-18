# Tasks: tablero-seguimiento-social — Tablero de Seguimiento y Gestión de Proyectos de Impacto Social

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3200-3800 (schema+migration ~350, invariants+permissions+semaforo tests ~450, projects/goals/activities/budget/rubros/attachments APIs ~1100, conversion action+audit ~200, dashboard endpoint+test ~300, 3 SVG charts+tests ~400, dashboard/print UI ~350, proyectos UI (ficha/cronograma/presupuesto/soportes) ~450, hooks+openapi ~200) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (schema/migration/catalog/invariants) → PR2a (permissions+access control) → PR2b (Proyecto CRUD+conversion action) → PR3a (metas/actividades/semáforo backend) → PR3b (attachments backend+UI) → PR4a (budget/rubros backend) → PR4b (dashboard aggregated endpoint) → PR4c (SVG charts+management UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — orchestrator must ask the user (stacked-to-main vs feature-branch-chain vs size-exception) before `sdd-apply` |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

**Forecast vs. design.md: REVISED, not confirmed.** Design proposed 4 autonomous slices and anticipated `High`/`Yes`. That macro-shape is confirmed, but each of the 4 slices individually estimates well above the 400-line budget on its own (slice 2 ≈800, slice 3 ≈950, slice 4 ≈1400 lines by component count), so this breakdown splits slices 2-4 into paired sub-units (2a/2b, 3a/3b, 4a/4b/4c) — 8 reviewable units total instead of 4 — while keeping the same dependency order and rollback boundaries design.md already established. Slice 1 (schema/migration) stays a single unit: most of its bulk is Prisma-generated DDL, not authored risk.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema+migration+rubro catalog+DB invariants (deployable no-op) | PR 1 | `npx vitest run prisma/invariant.test.ts` | `npx prisma migrate dev` on dev DB | Additive only; drop 8 new tables/3 enums/1 nullable column |
| 2a | Permissions (`canViewManagementDashboard`/`canCreateProject`/`canManageProject`/`canViewProject`) + admin toggle | PR 2a | `npx vitest run src/lib/permissions.test.ts` | Manual: COLABORADOR+flag sees dashboard, can't edit | Revert gate to `canManageAny`; flag stays inert in DB |
| 2b | Proyecto CRUD + `POST .../opportunities/:id/project` conversion action | PR 2b | `npx vitest run src/app/api/v1/projects/route.test.ts src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.test.ts src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts` | Manual: create project from EJECUCION opportunity, verify audit row | Revert CTA+route; `convert/route.ts` untouched, no comercial rollback needed |
| 3a | Metas/Actividades/cronograma + `semaforo.ts` | PR 3a | `npx vitest run src/lib/semaforo.test.ts prisma/invariant.test.ts src/app/api/v1/projects/[id]/goals/route.test.ts` | N/A — pure calc + DB invariant, no external harness needed | Revert routes+lib; schema stays (additive) |
| 3b | Attachments (file/URL XOR) backend + cronograma/soportes UI | PR 3b | `npx vitest run src/app/api/v1/projects/[id]/attachments/route.test.ts` | Manual: upload file, add https link, reject http link | Revert routes+UI; `CHECK` constraint stays enforced from PR1 |
| 4a | Budget: rubros catálogo + líneas presupuestales + gastos | PR 4a | `npx vitest run src/app/api/v1/rubros/route.test.ts src/app/api/v1/projects/[id]/budget/route.test.ts` | Manual: 2 gastos on 1 línea, verify proyectado not doubled | Revert routes; `Rubro`/`LineaPresupuestal`/`Gasto` tables stay empty |
| 4b | Dashboard aggregated endpoint (6 KPIs, 1 round-trip) | PR 4b | `npx vitest run src/app/api/v1/dashboard/projects/route.test.ts` | Seed script (~50×20×200) + manual p95 measurement vs. 3s (D9, non-blocking) | Revert route; no schema/UI dependency |
| 4c | 3 SVG chart primitives + `cara-management.tsx` + print page | PR 4c | `npx vitest run src/components/dashboard/charts/tacometro.test.tsx src/components/dashboard/charts/curva-s.test.tsx src/components/dashboard/charts/radar.test.tsx` | Manual: render `/dashboard` 5th tab + `/print/dashboard/management` | Remove 5th `CARAS` entry; module (4a/4b) stays fully functional headless |

## Phase 0: Preflight

- [x] 0.1 Run `npx prisma validate` on the composite relations `Proyecto↔Oportunidad` (T1), `Actividad↔Meta` (D2), `Gasto↔LineaPresupuestal`, `SoporteProyecto↔Actividad/Gasto` (T8). Confirm accepted or switch to single-column FK + hand `ALTER TABLE ... FOREIGN KEY` fallback (documented in design.md T1). **Result: accepted, all 4 as composite FKs — see Deviations in apply-progress: `Proyecto↔Oportunidad` needed one extra `@@unique([oportunidad_id, cliente_id])` on `Proyecto` (Prisma's one-to-one-relation rule), not the full single-column fallback.**

## Phase 1: Schema, Migration, Rubro Catalog, Invariants (PR 1 — Unit 1)

- [x] 1.1 RED: `prisma/invariant.test.ts` — Actividad with `meta_id` from another `Proyecto` rejected by composite FK; second `Proyecto` on same `oportunidad_id` rejected (`@unique`); `Proyecto` linked to an `Oportunidad` of another `cliente` rejected; `Gasto` cross-`LineaPresupuestal`/`proyecto` rejected; `SoporteProyecto` with both/neither of `storage_path`/`url_externa` rejected; `url_externa` with `http://` scheme rejected.
- [x] 1.2 GREEN: add to `prisma/schema.prisma` — models `Proyecto`, `Meta`, `Actividad`, `Rubro`, `LineaPresupuestal`, `Gasto`, `Indicador`, `SoporteProyecto`; enums `LineaEstrategica`, `EstadoProyecto`, `TipoSoporte`; `Usuario.puede_ver_tablero_gerencial`; inverse relations on `Cliente`/`Oportunidad`/`Documento`/`Usuario`.
- [x] 1.3 GREEN: `prisma/migrations/20260918153200_tablero_seguimiento_social/migration.sql` — hand `CHECK`s (`peso>0`, avance 0..100, XOR archivo/url, `https`-only, destino único, montos positivos/no-negativos); rubro catalog seed (Personal/Transporte/Material POP/Operación logística); `settings` row `semaforo_umbrales` with **`confirmado:true`** (D10 confirmed by the business on 2026-09-18 — tasks.md's original `confirmado:false` text is superseded by the updated proposal/design).
- [x] 1.4 GREEN: apply migration + `npx prisma generate`; confirm 1.1 passes.
- [x] 1.5 Verify sentinel: `.../opportunities/[opportunityId]/convert/route.test.ts` runs unmodified, all cases green, diff-zero on the route file (D1-bis — 7 `it` cases per design.md correction, not 11).

## Phase 2a: Permissions + Access Control (PR 2a — Unit 2a)

- [x] 2a.1 RED: extend `src/lib/permissions.test.ts` — matrix for `canViewManagementDashboard`/`canCreateProject`/`canManageProject`/`canViewProject` across 4 roles × flag on/off × responsable yes/no; mandatory cell: COLABORADOR+flag → `canViewManagementDashboard` true AND `canManageProject` false.
- [x] 2a.2 GREEN: add `ProjectActor` type + the 4 predicates to `src/lib/permissions.ts` (T9's `responsable_id` axis on `canManageProject`, extension declared in design.md).
- [x] 2a.3 GREEN: add `puede_ver_tablero_gerencial` admin toggle to `src/components/admin/users-table.tsx` (mirrors the existing `gestiona_oportunidades` toggle).
- [x] 2a.4 GREEN: create `src/lib/api/projects.ts` — `loadProjectScoped`, `getProjectForWrite`, `PROJECT_SELECT`, `toProjectItem` (T10, mirrors `getClientForOpportunityWrite` shape).

## Phase 2b: Proyecto CRUD + Conversion Action (PR 2b — Unit 2b)

- [x] 2b.1 RED: `src/app/api/v1/projects/route.test.ts`, `[id]/route.test.ts` — create/read/update/soft-delete gated by `canManageProject`; invalid `cliente_id` rejected; visualizador-only gets 200 GET / 403 write.
- [x] 2b.2 GREEN: create `src/app/api/v1/projects/route.ts`, `[id]/route.ts` — CRUD, soft delete via `deleted_at`.
- [x] 2b.3 RED: new `.../clients/[id]/opportunities/[opportunityId]/project/route.test.ts` — 401/403/404 (cliente)/404 (oportunidad)/409 (`fase≠EJECUCION`)/409 (ya vinculada)/400 (zod)/201+audit row.
- [x] 2b.4 GREEN: create `.../opportunities/[opportunityId]/project/route.ts` per T2 flow and zod schema (`codigo`/`nombre`/`territorio`/`linea_estrategica`/`fecha_inicio`/`fecha_fin`/`beneficiarios_meta?`/`responsable_id?`); never accepts `cliente_id`/`oportunidad_id` from the body.
- [x] 2b.5 GREEN: widen `AuditEntidad` in `src/lib/api/audit.ts` with `"proyecto"`; add label in `src/components/admin/audit-log-section.tsx`.
- [x] 2b.6 GREEN: add "Crear proyecto" CTA in `src/components/crm/entity-dialogs.tsx` for oportunidades in `EJECUCION` (pre-fills from the opportunity; shows linked-project link if one exists). No change to the convert action itself.
- [x] 2b.7 Verify sentinel again: `convert/route.test.ts` diff-zero, still green (D1-bis).

## Phase 3a: Metas, Actividades, Semáforo Técnico (PR 3a — Unit 3a)

- [x] 3a.1 RED: `src/app/api/v1/projects/[id]/goals/route.test.ts` — `Meta` requires a valid `proyecto_id`.
- [x] 3a.2 GREEN: create `goals/route.ts`, `goals/[goalId]/route.ts`.
- [x] 3a.3 RED: `activities/route.test.ts` — valid `Actividad` create accepted; cross-project `meta_id` rejected at the API layer (invariant already covered at DB layer in 1.1).
- [x] 3a.4 GREEN: create `activities/route.ts`, `[activityId]/route.ts` — `peso`, `fecha_planificada`, `fecha_real`, `porcentaje_avance`.
- [x] 3a.5 RED: `src/lib/semaforo.test.ts` — `colorTecnico` verde/amarillo/rojo at exact configured boundaries; weighted `avance_tecnico` `(100×2+40×1)/3=80`; zero-activity project → 0% with no division-by-zero; identical data changes color when only the parameter changes.
- [x] 3a.6 GREEN: create `src/lib/semaforo.ts` — pure (no `@/lib/db`/`next/server`) — `colorTecnico`, `colorFinanciero`, `resolverUmbrales`.
- [x] 3a.7 GREEN: add `SETTING_SEMAFORO_UMBRALES` to `src/lib/settings.ts`; `UMBRALES_SEMAFORO_DEFAULT` (`confirmado:true`, real D10 values — **not** `confirmado:false`, see Deviations: D10 was confirmed 2026-09-18, superseding this task's original placeholder text) to `src/lib/catalogs.ts`. `LineaEstrategica`/`ENUM_VALUES` **skipped** — already done ahead of schedule in Unit 2b.

## Phase 3b: Attachments — Backend + UI (PR 3b — Unit 3b)

- [x] 3b.1 RED: `attachments/route.test.ts` — upload/delete gated by `canManageProject`; read scoped to `canViewProject`; `https://` accepted, `http://` rejected at API layer (DB `CHECK` already covered in 1.1).
- [x] 3b.2 GREEN: extend `src/lib/api/files.ts` — `projectSupportStoragePath(proyectoId, soporteId, nombre)`, `isValidExternalUrl(url)` (`https:` only via `new URL`).
- [x] 3b.3 GREEN: create `projects/[id]/attachments/route.ts` and activity-/gasto-scoped sub-routes (see Deviations in apply-progress: the gasto-scoped sub-route is `expenses/[expenseId]/attachments/route.ts`, not `budget/[id]`, to stay consistent with tasks.md 4a.4's canonical `expenses/` resource name for `Gasto`).
- [x] 3b.4 GREEN: `src/components/proyectos/**` — ficha, cronograma (línea base vs. real), soportes upload-or-link UI.

## Phase 4a: Budget — Rubros, Líneas, Gastos (PR 4a — Unit 4a)

- [x] 4a.1 RED: `rubros/route.test.ts` — inactive `rubro` excluded from new-line options but preserved on historic lines; write gated by `requireApiRole(["ADMINISTRADOR"])`.
- [x] 4a.2 GREEN: create `rubros/route.ts`, `[id]/route.ts`.
- [x] 4a.3 RED: `budget/route.test.ts` — invalid `rubro_id` rejected; aggregation groups proyectado/ejecutado by `rubro_id` without mixing; 2 `gastos` on 1 línea don't double the proyectado (double-counting trap called out in design.md risks — see Deviations in apply-progress: implemented as `findMany`+JS aggregation per repo's established SMALL-volume pattern, not the raw `LEFT JOIN LATERAL` SQL, which design.md reserves for the cross-project Unit 4b dashboard endpoint).
- [x] 4a.4 GREEN: create `projects/[id]/budget/route.ts`, `expenses/route.ts` (+ `expenses/[expenseId]/route.ts` for edit/delete) — `monto_ejecutado_cop` derived via `SUM`, never a counter column (T3).
- [x] 4a.5 GREEN: widen `AuditEntidad` with `"presupuesto"`, `"actividad"`, `"soporte"`; sync `src/hooks/admin.ts` label maps; add UI labels in `src/components/admin/audit-log-section.tsx`.

## Phase 4b: Dashboard Aggregated Endpoint (PR 4b — Unit 4b)

- [ ] 4b.1 RED: `dashboard/projects/route.test.ts` — all 6 KPIs resolve in one round-trip; `Indicador` without `valor_actual` not counted as cumplido; `Actividad` completed without soporte not counted as "entregada"; visualizador-only actor gets 200, every POST/PATCH/DELETE in the module gets 403.
- [ ] 4b.2 GREEN: create `dashboard/projects/route.ts` — single `db.$queryRaw` per D9's `tecnico`/`financiero`/`indicadores`/`entregables` CTEs; curva S series (planificado per T7's peso-weighted distribution, ejecutado from `gastos.fecha_gasto`) computed in the same request.
- [ ] 4b.3 Measure and report p95 against the 3s target (RNF-02/D9) on a seeded ~50×20×200 dataset — measured budget, non-blocking.

## Phase 4c: SVG Charts + Management Dashboard UI (PR 4c — Unit 4c)

- [ ] 4c.1 RED: `charts/tacometro.test.tsx`, `curva-s.test.tsx`, `radar.test.tsx` — deterministic render with empty/one-point/N-point data, no DOM measurement.
- [ ] 4c.2 GREEN: create `src/components/dashboard/charts/{tacometro,curva-s,radar}.tsx` — named `Tacometro` (not `Gauge`, which collides with the lucide icon already imported in `dashboard-page.tsx`, per D7).
- [ ] 4c.3 GREEN: create `src/components/dashboard/cara-management.tsx` — 6 KPIs (`Tacometro`, `CurvaS`, `Radar`, `BarRow` ×2, `StatTile`).
- [ ] 4c.4 GREEN: add 5th `CARAS` entry in `src/components/dashboard/dashboard-page.tsx`; create `src/app/print/dashboard/management/page.tsx` mirroring `print/dashboard/pipeline/page.tsx`.
- [ ] 4c.5 GREEN: update `src/lib/openapi/paths/projects.ts`, `dashboard.ts`; update `src/hooks/projects.ts`, `dashboard.ts`.
- [ ] 4c.6 Verify: full suite + `npx tsc --noEmit` green; `permissions.test.ts` covers every new matrix cell; `convert/route.test.ts` still diff-zero.
