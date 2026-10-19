# S9 map — Dashboards, exports, territory removal (DSH §3.12; RF-30..32)

Read-only recon on `feat/projects-v2` @ e92370c. Checked against code, not the SDD.

## 1. Exists vs assumed

| Item | Reality (verified) |
|---|---|
| `src/app/api/v1/dashboard/projects/route.ts`, `por_territorio`, `cara-management.tsx` (SDD §3.12/§5.10 cite file:line) | **Do NOT exist on this branch nor on `main`**. `rg -i "territor\|semaforiz\|por_territorio" src` = 0 hits outside two comments about a legacy `territorio` that never existed. They exist only on `feat/v6-visual-alignment` (96 commits ahead of main) and `local/todo-integrado` (v1 route, test, `cara-management`, `print-dashboard`; commit 91cee6c, not an ancestor of HEAD). |
| Dashboard code here | `src/app/api/v1/dashboard/{clients-activity,my-summary,pipeline,tasks}` + `src/components/dashboard/cara-*` (4 caras, CRM only, filters = `rango`, `tipo_cliente`). Only project touch: `my-summary` group `proyectos_en_ejecucion` (S2.7, uses `projectListWhere`). No project dashboard, no portfolio KPIs, no KPI lib. |
| `/tablero` | It is the **kanban of tasks**, not the gerencial board. SDD's `src/app/(app)/tablero-gerencial/page.tsx` has no nav entry. Home `/` hosts the dashboard caras; `/proyectos` renders only `ProjectList`. |
| `kpis.ts`, `export-xlsx.ts`, `kpi-cache.ts`, `ProyectoKpiCache`, `bench-dashboard.ts`, `E-28/E-29` | None exist. |
| "6.7.1 table" | There is no §6.7.1 in the SDD (§6.7 is the progress ledger). It cites the RF doc. Formulas must come from REQ-DSH-01 + the delivered libs (section 2). |
| Total row of `computeFicha` (S9.1 in the brief) | **Already done** (S5): `ficha-financiera.ts:90-117`, test `G7 total row`. `buildRow` on summed A/P/E; `financial-sheet` returns `total`. Nothing to build. |
| `puede_ver_tablero_gerencial` | No column on `Usuario` (schema 123-140). Pinned `UNRESOLVED_GERENCIAL_FLAG = false` at `src/lib/api/projects.ts:127`, consumed in ONE place (`projectPortfolioActor`, :138). All predicates (`canViewProjectV2`, `canViewPortfolio`, `canViewFinancialSupports` excludes it, write predicates never read it) and their tests (`permissions.test.ts`) already exist. |
| Financial/technical building blocks | `computeFicha`, `colorFinancieroV2`, `alertaRetraso`, `calcularTecnico`, `colorTecnicoV2`, `getSemaforoParametrosV2`, `loadTecnicoStatus` (per project, 3 queries), `loadGastosValidados` (full rows), `resolverBase`, `totalBeneficiarios`, `resumenMediciones`. `technical-status` and `financial-sheet` already return aggregates only and already take `base=original|vigente`. |
| Exports | `clients/export`, `tasks/export` (exceljs 4.4 buffer, `logAudit` best-effort) and `projects/:id/template` (xlsx + `logChange(... accion "EXPORTAR", entidad "proyecto")`, the right precedent: append-only `auditoria_cambios`). `AccionAuditoria.EXPORTAR` exists; legacy `logAudit` entidades do NOT include proyecto. No PDF generator dependency (`unpdf` only extracts text). `src/app/print/dashboard/*` = browser print pages. |
| Seed for the bench | `scripts/seed-proyectos-demo.ts.bak` is v1 (parked). Usable: `scripts/import-plantilla-demo.ts` (one project) and the live-DB pattern of `prisma/*.invariant.test.ts` (`./require-local-db` first, rollback/cleanup). |

## 2. KPIs (RF-30), formulas from real columns

`corte` = calendar date `AAAA-MM-DD` (default `todayInBogota()`), echoed on every KPI. Technical uses the date; financial uses `periodOf(corte)` (`P` and `E` cumulative `periodo <= period`, no clamping needed). Percentages 0..100, 1 decimal; money stays bigint cents (`money.ts`); `null` = not measurable (never 0).

| KPI | Formula | Source |
|---|---|---|
| avance real | `calcularTecnico(...).avance_real` (Σ peso·prog / Σ peso) | `avances_entregable` (`anulado_at null`, `fecha<=corte`, medio if `avance_requiere_medio`), `actividades.peso`, `entregables.cantidad_meta` |
| avance programado, desviación pp, color técnico | `calcularTecnico` + `colorTecnicoV2(umbral1,umbral2)` | same; params from `getSemaforoParametrosV2` |
| cumplimiento cronograma | activities with `fin<=corte` that are `FINALIZADA` (not `_CON_RETRASO`) / activities with `fin<=corte`; denominator 0 -> null. Needs `fin` in the kpi input (`calcularTecnico` result has estado but not `fin`) | `activityDates(inicio, semana_inicio, semana_fin)` |
| entregables logrados / programados | programados = non-deleted entregables whose actividad `fin<=corte`; logrados = of those, `acumuladoContable >= cantidad_meta` AND >=1 live support on a counted avance (`soportes_proyecto.avance_id`, `deleted_at null`, `contarMediosVivos`). Return both counts + ratio | `entregables`, `avances_entregable`, `soportes_proyecto` |
| cumplimiento indicadores (DP-09) | mean over indicators with >=1 non-voided `mediciones_indicador` (`fecha<=corte`) of `min(1, ultima.valor / meta)` (last by fecha, created_at); `meta<=0` treated as unmeasured; `sin_medir` = count of the rest, listed apart | `indicadores.meta`, `mediciones_indicador` |
| avance financiero | `total.eaTenths` = E/A vigente; A=0 -> null | `lineas_presupuestales.monto_proyectado_cop`, `gastos` `estado VALIDADO`, `periodo<=period` |
| ejecución vs programado | `total.epTenths` = E/P; P=0 -> null; `total.color`; `alertaRetraso(total.epTenths, colorTecnico)` | `programacion_periodo.valor` |
| beneficiarios / meta | Σ `registros_beneficiarios.cantidad` (`anulado_at null`, `fecha<=corte`) / `proyectos.beneficiarios_meta`; meta null or 0 -> null | `totalBeneficiarios` |
| BORRADOR | E unavailable (same rule as `financial-sheet`: `ejecucion_disponible=false`, no color/percent) | `proyectos.estado` |

Portfolio (A-13): financial = Σ E / Σ A and Σ E / Σ P (money-weighted, over projects with data); technical = simple mean of avance real and programado; counts by estado and by color. KPIs computed only for `EN_EJECUCION`, `SUSPENDIDO`, `CERRADO` with dates; others listed with state and null KPIs.

## 3. API and roles

| Route | Gate | Notes |
|---|---|---|
| `GET /api/v1/dashboard/portfolio?corte&linea_id&cliente_id&responsable_id&estado&municipio_id` (E-28) | 403 unless `canReadProjectList(u)` or `rol==='COORDINADOR'`; rows via the existing `projectListWhere` (ADM/GER/flag: all; COORDINADOR: active memberships only, A-02/D-06; COLAB without flag: 403) | `{corte, proyectos:[{id,codigo,nombre,cliente,estado,responsable,semaforo_tecnico,semaforo_financiero,alerta_retraso,kpis}], agregado, por_estado}`. **No `por_territorio`**; municipio only as filter (already in `projectListWhere`). Totals A/P/E allowed for all permitted roles (aggregates; P04/REQ-ACC-05 only forbid supports and tercero ids); no per-rubro/per-gasto here. |
| `GET /api/v1/projects/:id/kpis?corte&base` | `loadProjectScoped` + `canReadProject` (404 -> 403 -> 409 sin fechas -> 400), same as `technical-status` | Same `kpisProyecto`; `base=original` via `resolverBase` (structure/budget of v0, live avances/E, like the sheet). Feeds a ficha section. Not in the SDD, needed for "per project". |
| `GET /api/v1/projects/:id/export?formato=xlsx&ficha=proyecto\|financiera&corte&base` (E-29) | same read gate | `formato=pdf` -> 400 "Formato no disponible" until N-23. Audit `logChange(db,{accion:"EXPORTAR",entidad:"proyecto",entidad_id:id,proyecto_id:id})` best-effort, as in `template/route.ts`. |
| `GET /api/v1/dashboard/portfolio/export` (same filters) | same as portfolio | xlsx of the portfolio table; audit `entidad_id:"portafolio"`, `proyecto_id:null`. Cap 500 rows like clients export. |

Export redaction decision (no per-role branching needed): both fichas contain **only aggregates** (ficha de proyecto: general data, structure counts, KPIs; financiera: rubro rows + total from `computeFicha`). Never gasto-level rows, `tercero_*`, supports, or soporte URLs for any role -> VIS rule (REQ-ACC-05) satisfied by construction. Test pins it: workbook has no `tercero`/`soporte` header for every role. Add a gasto sheet only later, and then only for `canViewFinancialSupports`.

**Gerencial flag decision.** Minimal safe = real column, mirroring `gestiona_oportunidades` (same orthogonal-axis precedent, same admin UI): migration `ALTER TABLE usuarios ADD COLUMN puede_ver_tablero_gerencial BOOLEAN NOT NULL DEFAULT false` (additive, no seed, nobody loses/gains access); `schema.prisma` field; replace `UNRESOLVED_GERENCIAL_FLAG` with `usuario.puede_ver_tablero_gerencial`; `users/[id]` PATCH + `users` select + `users-table.tsx` switch (ADM only, as the sibling). A no-column alternative (user-id list in `settings`) is rejected: unindexed, no FK, needs a loader on every read path. Cost of the column: one local migration (`db:migrate:local` + `db:generate:local`; the remote needs the user's authorization later).

## 4. Territory removal

Nothing to remove here: no section, no query, no component. S9.5 reduces to (a) a guard test (`portfolio response has no por_territorio`; `rg` check in the work-unit evidence) and (b) a merge note: when `feat/v6-visual-alignment` / `local/todo-integrado` merge, delete `dashboard/projects/route.ts(.test)`, `cara-management(.test)` and the territory block of `print-dashboard.tsx` (they read the abandoned v1 schema and will not compile against the v2 Prisma client). Municipio stays a filter and a column of the table.

## 5. UI placement

Do NOT touch the CRM `dashboard-page.tsx` (its filters are CRM `rango`; collides with the v6 writer, R-07) nor `/tablero`. Recommend `/proyectos?vista=tablero` with `Tabs` (`ui/tabs.tsx` exists): "Portafolio" (current `ProjectList`) and "Tablero" (new), tab shown if `canViewPortfolio` or COORDINADOR. Components (new, `src/components/proyectos/`): `project-dashboard.tsx` (filters estado/cliente/línea/responsable/municipio + corte date input, `StatTile`/`BarRow` from `dashboard/shared.tsx`, table with two semáforo chips via `COLOR_META` of `semaforo-tecnico.tsx`, "Exportar Excel" button), `project-kpis-panel.tsx` (per-project, new section in `project-ficha-dialog.tsx` before Financiero), hooks `useProjectsPortfolio`/`useProjectKpis` in `hooks/projects.ts`. Components render server colors; they never recompute (D1).

## 6. TDD work units (strict TDD; each <= ~400 authored lines; this order)

1. **U1 kpis pure** (`src/lib/proyectos/kpis.ts`+test, ~300). RED: `cumplimientoCronograma` ignores activities with fin>corte and counts `FINALIZADA_CON_RETRASO` as late; denominator 0 -> null; `entregablesLogrados` needs meta met AND a support; `cumplimientoIndicadores` caps at 1, excludes unmeasured and counts them in `sin_medir`; `beneficiariosVsMeta` meta null/0 -> null; BORRADOR yields null financials; every KPI carries `corte`; `kpisPortafolio` = ΣE/ΣA weighted vs simple technical mean.
2. **U2 gerencial flag** (migration, schema, `projects.ts`, users PATCH/GET, `users-table`, tests, ~200). RED: invariant (default false, column exists); `canReadProjectList` true for a flagged COLABORADOR via the real actor (not a fixture); flagged user still 403 on every write gate (reuse `permissions.test` invariant); `PATCH users/:id` ADM-only; flag does not widen `canViewFinancialSupports`.
3. **U3 batched loader** (`src/lib/api/kpis-portafolio.ts`+test, ~350). One query per table for ALL ids (`proyecto_id IN`): actividades+entregables, avances, soportes count by avance, indicadores+mediciones, beneficiarios, A/P/E via `groupBy`/`$queryRaw` SUMs (no row loading). RED: constant call count for 1 vs 50 projects (mocked `db`, assert each `findMany/groupBy` called once); **parity** test: batched result == `loadTecnicoStatus` + `financial-sheet` total for the same fixture (corte before/inside/after project; BORRADOR).
4. **U4 routes + bench** (`dashboard/portfolio/route.ts`, `projects/[id]/kpis/route.ts`, openapi paths, `scripts/migrate-v2/bench-dashboard.ts`, ~400). RED: 403 for COLABORADOR without flag, 200 for flagged; COORDINADOR sees member projects only; filters (línea principal, cliente, responsable, estado, municipio); both semáforos + state per project; no `por_territorio` key; corte echoed; bad corte 400; per-project 404->403->409->400 order; `base=original`.
5. **U5 exports** (`src/lib/proyectos/export-xlsx.ts`, export routes, ~380). RED: workbook opens with exceljs and has the expected sheets; financiera total row equals `computeFicha` total; no tercero/soporte header for ADM, COORD-M and flagged VIS; audit EXPORTAR written and an audit failure does not fail the download; `formato=pdf` 400.
6. **U6 UI** (`project-dashboard.tsx`, `project-kpis-panel.tsx`, hooks, tabs in `/proyectos`, ~400). RED: tab hidden for COLABORADOR without flag; renders colors from the payload without recomputing; filters change the query key; empty state; export button hits the route; ficha shows the KPI panel and the "no confirmado" badge while params are unconfirmed.

## 7. Performance bench plan

Scale (50 projects x 20 activities x ~3 entregables x 30 gastos) is ~15k rows touched. Batched, the dashboard needs ~8-10 queries, all on existing indexes (`gastos(proyecto_id,estado,periodo)`, `programacion_periodo(proyecto_id,periodo)`, `avances_entregable(proyecto_id)`, `(entregable_id,fecha)`, `proyecto_miembros`). **Cache table (S9.4, ADR-12) is NOT warranted**: write it only if the bench p95 > ~1.5 s; the per-project loop the SDD implies (~6 queries x 50 = 300 round trips, ~15 s at remote latency) is the real risk, solved by U3, not by caching. `bench-dashboard.ts`: `import "../../prisma/require-local-db"` first; seed 50 `BENCH-` projects with `createMany` (EN_EJECUCION, direct insert, no `logChange`, so no append-only rows), run the loader 10 times (+1 warm-up), print min/p50/p95/max (nearest-rank), write `scripts/migrate-v2/out/bench-dashboard-<ts>.json` (dir is gitignored), delete the `BENCH-` rows in `finally`. Record the p95 in the execution ledger. Plus the deterministic unit test of U3 (call count) as the CI-safe guard; do not assert wall-clock in vitest (CP-4 contention flakes).

## 8. Risks, SDD discrepancies, decisions (defaults so work proceeds)

- Discrepancies: `dashboard/projects/route.ts:26,111-153`, `por_territorio`, `cara-management.tsx` do not exist here (S9.5 = guard + merge note); no §6.7.1; "total row" already shipped; `tablero-gerencial` page path clashes with nothing but has no nav; `kpisPortafolio` sketch says weight by `valor_total` while A-13 says ΣE/ΣA (use A-13).
- R-collision: `dashboard/projects/route.ts` exists on v6 branches; adding the same path here gives add/add conflict. **Default: use `dashboard/portfolio`** and tell the user the E-28 path changed.
- Technical corte vs financial corte differ (date vs month); `financial-sheet` caps the technical date at end-of-month/today for the delay alert; the portfolio uses the single date for both. Parity test must cover it.
- Params (`umbral1/2`, tolerancia, retraso) are PLACEHOLDER unconfirmed: surface `confirmado` in every payload (the sheet does).
- Gasto rows for the bench: verify no trigger blocks direct `VALIDADO` inserts/deletes before U4 (only `acceso_soportes` and `auditoria_cambios`, `versiones_proyecto` are append-only per migrations).
- Decisions (defaults): D1 PDF (N-23): excel only; `pdf` -> 400; later default = browser print page (existing `/print/dashboard` pattern, zero dependency), S9.3b stays blocked on the user. D2 entregables "programados" = those of activities due by corte. D3 portfolio always `base=vigente`; per-project `base` supported. D4 COORDINADOR sees member projects (A-02). D5 KPI rows only for EN_EJECUCION/SUSPENDIDO/CERRADO. D6 UI on `/proyectos?vista=tablero`. D7 migration for the flag runs locally only; remote migration is a separate user-authorized step (use `.env.local` for every DB command).
