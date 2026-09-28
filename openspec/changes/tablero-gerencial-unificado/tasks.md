# Tasks: tablero-gerencial-unificado — F1.6

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-800 — endpoint (2 new grouped queries + tests) ~150-200, `cara-management.tsx` (radar reshape, per-project bars, territorial section, filter chips, warning) + its test ~250-320, routing/redirect + nav + their tests ~80-120, hooks/types ~40-60, print page mirror ~40-60, deletions (`tablero-gerencial-client.tsx` + test) negative ~-90 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Slice A (route unification: redirect, nav href, `isNavActive` query-param match, `dashboard-page.tsx` initial tab) → Slice B (endpoint: `linea_estrategica`/`territorio` filters + `por_proyecto`/`por_territorio`) → Slice C (`cara-management.tsx`: radar 5 axes, per-project bars, territorial section, filter chips, doble-conteo warning) → Slice D (print/dashboard/management mirror + cleanup of `tablero-gerencial-client.tsx`) |
| Delivery strategy | ask-on-risk (session default; confirm with the user before `sdd-apply` given High risk) |
| Chain strategy | Not yet asked — surfaced here per the Review Workload Guard for the orchestrator to resolve before apply |

### Suggested Work Units

| Unit | Goal | Slice | Focused test command | Rollback boundary |
|------|------|-------|-----------------------|--------------------|
| 1 | Read this Next.js version's app-router redirect docs (`node_modules/next/dist/docs/`) before writing the redirect | A | N/A (research) | N/A |
| 2 | `tablero-gerencial/page.tsx` — replace body with redirect to `/?cara=management` | A | route test per this Next.js's conventions | Revert the file to its current content |
| 3 | `src/lib/nav.ts` — href change; `isNavActive` accepts a `cara` query match | A | `npx vitest run src/lib/nav.test.ts` (or equivalent) | Revert href/`isNavActive` signature |
| 4 | `sidebar.tsx` — pass current search params to `isNavActive` | A | `npx vitest run src/components/shell/sidebar.test.tsx` | Revert the call site |
| 5 | `page.tsx` (`/`) + `dashboard-page.tsx` — `initialCara` from `?cara=` | A | `npx vitest run src/components/dashboard/dashboard-page.test.tsx` | Revert prop threading |
| 6 | `dashboard/projects/route.ts` — `linea_estrategica`/`territorio` filters | B | `npx vitest run src/app/api/v1/dashboard/projects/route.test.ts` | Revert the two new `WHERE` conditions |
| 7 | `dashboard/projects/route.ts` — `por_proyecto[]`/`por_territorio[]` grouped queries | B | same as above | Revert the two new queries and response fields |
| 8 | `hooks/dashboard.ts`/`hooks/projects.ts` — types + `useDashboardManagement` filter params | B | `npx tsc --noEmit` | Revert type/param additions |
| 9 | `cara-management.tsx` — radar 5 axes | C | `npx vitest run src/components/dashboard/cara-management.test.tsx` | Revert to 1-axis call |
| 10 | `cara-management.tsx` — per-project cronograma/entregables bars | C | same | Revert to aggregated `BarRow` |
| 11 | `cara-management.tsx` — semaforización territorial section | C | same | Remove the new section |
| 12 | `cara-management.tsx` — Línea/Territorio filter chips | C | same | Remove the chips and the passthrough filter props |
| 13 | `cara-management.tsx` — doble-conteo warning | C | same | Remove the conditional banner |
| 14 | `print/dashboard/management/page.tsx` — mirror new sections | D | manual/print test if one exists | Revert to current print content |
| 15 | Delete `tablero-gerencial-client.tsx` + its test | D | full suite green after deletion | Restore from git |

## Slice A: Route unification

- [x] A.1 Read `node_modules/next/dist/docs/` for this version's redirect mechanism in the app router (`redirect()` vs. `next.config` `redirects()` vs. other). Do not assume prior-version behavior. — `permanentRedirect()` (app-router `next/navigation`) gives the 308 the design calls for; `redirect()` defaults to 307.
- [x] A.2 RED: route test asserting `/tablero-gerencial` redirects to `/?cara=management`. Confirm failing.
- [x] A.3 GREEN: implement the redirect per A.1's findings; delete the old page body. Confirm passing.
- [x] A.4 RED: `nav.test.ts`/equivalent — the "Tablero Gerencial" item's `href` is `/?cara=management`; `isNavActive` matches only when both `pathname` and the `cara` query match for hrefs carrying a query. Confirm failing.
- [x] A.5 GREEN: update `nav.ts` (href, `isNavActive` signature); remove the dead `PAGE_HEADERS["/tablero-gerencial"]` entry. Confirm passing.
- [x] A.6 RED: `sidebar.test.tsx` — nav highlighting for `/?cara=management` vs. plain `/`. Confirm failing.
- [x] A.7 GREEN: `sidebar.tsx` reads current search params and passes them to `isNavActive`. Confirm passing.
- [x] A.8 RED: `dashboard-page.test.tsx` — `initialCara="management"` mounts `CaraGerencial` first, not `CaraPipeline`. Confirm failing.
- [x] A.9 GREEN: `page.tsx` reads `cara` from `searchParams`, passes `initialCara` to `DashboardTabs`; `DashboardTabs` seeds its `useState` from it. Confirm passing.

## Slice B: Endpoint — filters + per-project/per-territory breakdowns

- [x] B.1 RED: `dashboard/projects/route.test.ts` — `?linea_estrategica=` and `?territorio=` narrow the aggregate (reuse existing filter-narrowing test shapes for `responsable_id`/`tipo_cliente`). Confirm failing.
- [x] B.2 GREEN: extend `proyectosFiltradosSubquery` and its call site with the two new params. Confirm passing.
- [x] B.3 RED: `por_proyecto[]` includes one row per project in scope with `cumplimiento_cronograma`/`productos_entregados`/`productos_programados`; `por_territorio[]` includes one row per distinct `territorio` with `proyectos_count`/`color_tecnico`/`color_financiero`. Confirm failing.
- [x] B.4 GREEN: add the two new `$queryRaw` calls (reusing `tecnico`/`entregables`/`financiero` CTE shapes with `GROUP BY`); update the file's own "exactly 2 `$queryRaw`" comment to document the new count and why (now 4). Confirm passing.
- [x] B.5 Update `ProjectDashboard` type (`hooks/projects.ts`) with `por_proyecto`/`por_territorio` (optional, additive — existing fixtures without them stay valid); update `useDashboardManagement` (`hooks/dashboard.ts`) to accept `linea_estrategica`/`territorio` via a new `ManagementDashboardFilters` type, isolated from the shared `DashboardFilters` type used by the other 4 caras (per design.md D2). `npx tsc --noEmit` to confirm no downstream breakage in the other 4 caras.
- [x] B.6 Update `src/lib/openapi/paths/dashboard-admin.ts` to document the new params/fields.

## Slice C: `cara-management.tsx` — visualizations

- [ ] C.1 RED: `cara-management.test.tsx` — radar receives 5 axes (técnico, financiero, indicadores, cronograma, entregables) with correct values. Confirm failing.
- [ ] C.2 GREEN: build the 5-axis `RadarAxis[]` from the existing scalars; pass to `Radar`. Confirm passing.
- [ ] C.3 RED: one `BarRow` (or equivalent) rendered per `por_proyecto` entry for cronograma; a grouped-bar visual per `por_proyecto` entry for entregables (planificado vs. entregado). Confirm failing.
- [ ] C.4 GREEN: implement the per-project lists, reusing `BarRow`/`CardSection` primitives; add the small grouped-bar sub-component for entregables (CSS/SVG bars, no new chart library). Confirm passing.
- [ ] C.5 RED: "Semaforización territorial" section renders one row per `por_territorio` entry with two colored dots (técnico/financiero) and `proyectos_count`. Confirm failing.
- [ ] C.6 GREEN: implement the section. Confirm passing.
- [ ] C.7 RED: Línea/Territorio `ChipSelector`s exist and, on selection, the query passed to `useDashboardManagement` includes the new params. Confirm failing.
- [ ] C.8 GREEN: wire the chips (state lifted in `dashboard-page.tsx` or locally in `cara-management.tsx` — decide per existing filter-lifting pattern already used for rango/responsable/tipoCliente). Confirm passing.
- [ ] C.9 RED: doble-conteo warning renders only when `indicadores_beneficiarios_count > 1`. Confirm failing.
- [ ] C.10 GREEN: add the conditional banner next to the beneficiarios KPI. Confirm passing.
- [ ] C.11 Manual check: filter chips ≥44px hit-area, new bar rows don't force horizontal scroll at 390px, territorial list wraps correctly, 1440px layout stays within existing grid. Verified by code review (no browser in this session) unless `run`/browser tooling is invoked separately.

## Slice D: Print mirror + legacy cleanup

- [ ] D.1 Update `src/app/print/dashboard/management/page.tsx` to mirror the new sections (radar 5 axes, per-project bars, territorial list) for PDF export parity with the on-screen view.
- [ ] D.2 Delete `src/components/dashboard/tablero-gerencial-client.tsx` and `tablero-gerencial-client.test.tsx`. Search (`rg -n "tablero-gerencial-client"`) to confirm zero remaining references before deleting.
- [ ] D.3 Full-repo search (`rg -n "tablero-gerencial"`) to confirm no other stale reference remains outside the intended redirect/nav files.

## Phase 5: Full verification

- [ ] 5.1 `npx tsc --noEmit` — 0 errors.
- [ ] 5.2 `npx eslint .` (scoped to touched paths) — 0 errors.
- [ ] 5.3 `npm run test` (full suite via `npx vitest run`) — all green, no regressions, including the other 4 dashboard caras and the project workspace's Resumen tab (`KpiCards`/`CurveSChartContainer` with `projectId`, untouched consumer).
- [ ] 5.4 Manual/code-review pass for the responsive constraints (16px inputs, 44px targets, `overflow-x-auto` on wide content, 390/1440 layouts) across all new sections.
- [ ] 5.5 Commit as Conventional Commits on the current feature branch (no push unless asked), one commit per slice. No AI attribution beyond what the session's attribution reminder requires.
- [ ] 5.6 Update `odd/tasks/*.md`'s F1.6 line (if tracked there) with evidence, and cross-reference this change's commits.
