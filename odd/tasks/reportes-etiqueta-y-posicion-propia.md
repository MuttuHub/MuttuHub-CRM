# Reportes por etiqueta y proyectos de posición propia

Objective: implement the proposal in `docs/propuesta-posicion-propia-y-reportes.md` (phases 2 to 4). **Status: approved 2026-11-23 (L7); phase 2 in progress. D1–D4 still open.**
Branch: `feat/reportes-etiqueta`, stacked on `feat/pp-6-v5` (top of PR chain #214–#219) so its migration lands after theirs; rebase onto `main` once the chain merges. Phase 3 goes on `feat/posicion-propia`. Delivery: `ask-on-risk`, chain strategy `stacked-to-main` (cached from the pendientes chain), one work-unit commit per task.
Test runner: Vitest (`npx vitest run <path>`, suite `npm test`); live-DB invariants with `node --env-file=.env.local node_modules/vitest/vitest.mjs run prisma --no-file-parallelism` against the local Docker DB only (never `.env`).
Design reference: Claude Design canvas https://claude.ai/artifact/M3yhSP5rZ1zRy9HcrzGBw2 (A4 PDF pages and the interactive Excel) and the Muttu Hub identity manual v2 (see memory `muttu-brand-manual`).

## Specs

### Phase 2 — Tags on projects and the tag report

- **S1 — Project tags.** `Proyecto` gets `etiquetas String[] @default([])` through an additive migration; existing projects end with `[]`.
  - The tags are set in the create stepper (`paso-general.tsx`, inside `ProjectCreateForm`) and in «Editar datos generales» (`ficha/editar-datos-generales.tsx`).
  - The choices come from the same admin catalog that clients and tasks use (`task_tags`, via `useTaskTags()`). The chip-toggle pattern from `ClientTagsField` (`client-form.tsx:162`) is reused, not copied a fourth time.
  - Validation reuses `CLIENT_ETIQUETAS_SCHEMA` (`clients/route.ts:54`): trim, 1–50 characters, at most 20 tags, no duplicates.
  - The API changes:
    - POST `/api/v1/projects` accepts `etiquetas`.
    - PATCH `/api/v1/projects/:id` accepts `etiquetas` and writes it with `{ set }`.
    - GET `/api/v1/projects` accepts `?etiqueta=`, an exact match like clients and tasks.
  - OpenAPI (`src/lib/openapi/paths/projects.ts`) documents the new field and filter.
- **S2 — What the tag report includes.** The proposal (§2.3), verbatim:
  - «**Proyectos:** los que tienen la etiqueta. […] No se deducen desde la etiqueta del cliente».
  - «**Clientes:** los que tienen la etiqueta».
  - «**Oportunidades y bitácora:** las de los clientes etiquetados, porque hoy no tienen etiquetas propias».
  - «**Tareas:** las que tienen la etiqueta».
  - «Si un cliente tiene dos etiquetas, aparece en los dos reportes. Por eso los totales de distintas etiquetas no se deben sumar entre sí». The report prints this as a footnote.
- **S3 — Filters.** The proposal: «Se elige una etiqueta […] y un período». Assumptions, not asked:
  - The period filters bitácora entries by date, and tasks by due date (open tasks with no due date are always included).
  - Project and opportunity figures are a snapshot at the cut-off date.
  - The tag picker lists the `task_tags` catalog.
- **S4 — Content.** The proposal (§2.3), verbatim:
  1. «**Resumen:** cuántos clientes y proyectos incluye, valor total de los proyectos, ejecución presupuestal, pipeline abierto y avance de tareas.»
  2. «**Proyectos:** estado, avance de actividades y presupuesto ejecutado frente al programado.»
  3. «**Clientes:** proyectos y oportunidades abiertas de cada uno, y fecha de la última interacción. Se resaltan los clientes que llevan más de 15 días sin interacciones.»
  4. «**Oportunidades abiertas** de esos clientes, con su estado y valor.»
  5. «**Bitácora:** las últimas interacciones con esos clientes y el próximo paso.»
  6. «**Tareas** con la etiqueta, con las vencidas primero.»

  The figures reuse the existing calculations: project progress and execution come from the same source as the project dashboard and portfolio, and the pipeline from open opportunities (`dashboard/pipeline/route.ts:97`).
- **S5 — Access.** Assumption, not asked: each section follows the scope rules that already exist, so the report never shows more than the user can already see.
  - Clients: `clienteScopeWhere`.
  - Tasks: `tareaScopeWhere`.
  - Projects: `projectListWhere`.
  - Opportunities and pipeline: only with `hasCommercialAccess`.
  - A section the user cannot see is hidden, not shown empty (identity manual v2: «se oculta, no se deshabilita»).
- **S6 — Export.**
  - **PDF:** a print page under `src/app/print/reportes/etiqueta` built on `PrintSheet` (auto `window.print()`), following the A4 prototypes.
  - **Excel:** built server-side with exceljs.
    - Sheets: Resumen, Proyectos, Clientes, Oportunidades, Bitácora, Tareas.
    - Amounts are numbers and dates are real dates.
    - Frozen header row with filters; totals rows on Proyectos, Clientes and Oportunidades.
    - Every sheet passes `assertSinEncabezadosProhibidos`, and text goes through `celdaTexto`.
  - Each export writes an EXPORTAR audit row, like the weekly report.
  - The look follows the identity manual v2: color lockup, Bricolage for titles and figures, JetBrains Mono for amounts, dates and codes, eyebrow table headers, and status chips as a 15 % tint.
- **S7 — Entry point.** The report is a new tab in `/reportes` (`reportes-page.tsx`), next to Tareas and Semanal.

### Phase 3 — Projects of posición propia with several allies

- **S8 — New origin.** The proposal: «Proponemos un nuevo tipo de proyecto: **posición propia**. Se suma a los dos que ya existen».
  - `OrigenProyecto` gains `POSICION_PROPIA`.
  - `Proyecto.cliente_id` becomes nullable only for that origin. A DB CHECK enforces `origen = 'POSICION_PROPIA' OR cliente_id IS NOT NULL`, and the API validates the same rule.
  - In the create stepper the user chooses «Posición propia». The client picker is then replaced by the allies list (S9).
- **S9 — Allies.** The proposal: «Se le vinculan varios clientes como aliados. Por cada aliado se registra: el rol: financiador, aliado o prospecto; el estado: en gestión, comprometido o descartado; opcionalmente, el aporte comprometido».
  - A new `ProyectoCliente` table: proyecto, cliente, `rol` (FINANCIADOR, ALIADO, PROSPECTO), `estado` (EN_GESTION, COMPROMETIDO, DESCARTADO), optional `aporte_cop`, unique `(proyecto_id, cliente_id)`.
  - Allies are added, edited and removed from the project's ficha. Each change writes an audit row.
- **S10 — Opportunity link.** The proposal: «si un aliado abre una oportunidad para aportar al proyecto, esa oportunidad cuenta en el pipeline como cualquier otra y además queda vinculada al proyecto». Blocked by decision D1.
- **S11 — Dashboard figures.** The proposal: «El valor del proyecto **no** suma al pipeline comercial».
  - Verified 2026-11-19: the pipeline already sums only `Oportunidad.valor_estimado_cop` (`dashboard/pipeline/route.ts:84-133`), so this needs a regression test, not new code.
  - The portfolio (`cargarPortafolio`, `lib/api/portafolio.ts`) counts every project regardless of origin. Assumption, not asked: posición propia projects do appear in the portfolio, because they are executed like any other project.
  - The portfolio's client filter matches a posición propia project when that client is one of its allies.
- **S12 — Readers of `cliente_id`.** About 33 non-test files read `Proyecto.cliente_id` or `proyecto.cliente` (mapping 2026-11-19, L3). All of them must handle a null client:
  - **Display:** headers, ficha, project list, historial, print sheet, Excel exports. They show «Posición propia · N aliados».
  - **Weekly report** (`lib/reportes/semanal.ts:136,184`): groups these projects under «Posición propia».
  - **Client health** (`clients/health/route.ts:138`) and **my summary** (`dashboard/my-summary/route.ts:88`): count the project for each ally.
  - **Template import** (`lib/api/plantilla-import.ts:188,291`): works without a client.
- **S13 — API contract.**
  - POST `/api/v1/projects` accepts `origen: "POSICION_PROPIA"` without `cliente_id`, together with the initial allies.
  - PATCH must not move a project into or out of `POSICION_PROPIA`. Today `origen` is editable at `[id]/route.ts:79`.
  - OpenAPI documents the new origin, the optional `cliente_id` and the allies endpoints.
- **S14 — Permissions.** Blocked by decision D3. Default until it is decided: creating follows `canCreateProject` (`permissions.ts:126`), and managing allies follows `canEditProjectData` (`:150`).

### Phase 4 — Report by project

- **S15 — Content.** The proposal (§2.2), verbatim:
  1. «**Resumen:** valor, presupuesto, estado, meta frente a lo comprometido.»
  2. «**Aliados:** quiénes son, su rol, su estado y su aporte.»
  3. «**Oportunidades** vinculadas y su etapa.»
  4. «**Bitácora:** las últimas interacciones con cada aliado sobre este proyecto y el próximo paso acordado.»
  5. «**Tareas:** porcentaje de avance, tareas vencidas y próximas.»

  Assumptions, not asked:
  - The goal (meta) is the project's `valor_total`.
  - Comprometido is the sum of `aporte_cop` of COMPROMETIDO allies; en gestión is the same sum for EN_GESTION allies.
  - Sin cubrir = meta − comprometido − en gestión, never below 0.
- **S16 — Bitácora per project.** «las últimas interacciones con cada aliado sobre este proyecto» needs a link that does not exist today: `BitacoraEntrada` has no project. This spec adds an optional `proyecto_id` to `BitacoraEntrada`, chosen when logging an interaction with an ally.
  - The proposal's technical notes do not include this link.
  - It adds about 1–2 days to the phase 4 estimate.
- **S17 — Export and access.** The proposal: «disponible en la sección **Reportes** y como botón en la ficha del proyecto».
  - PDF and Excel follow S6.
  - Excel sheets: Resumen, Aliados, Oportunidades, Bitácora, Tareas.
  - Access follows `canAccessProject`.

### Open decisions (from the proposal, §6)

- **D1:** «¿se registran como oportunidades del cliente (cuentan en el pipeline, como se propone) o solo dentro del proyecto?» Blocks S10.
- **D2:** «¿convertimos las etiquetas de los tres proyectos en proyectos de posición propia, vinculando automáticamente los clientes que hoy las tienen?» If yes, task T10 changes real data: it needs a backup and its own review.
- **D3:** «¿qué roles pueden crear proyectos de posición propia y vincular aliados?» Blocks S14.
- **D4:** «¿alcanza con traer las oportunidades y la bitácora de los clientes etiquetados, o también hay que poder etiquetarlas una por una?» S2 assumes the first option.

## Tasks

Approved 2026-11-23 (L7). Route: inline unless a writer trigger fires.

| ID | Specs | Risk | Status |
|----|-------|------|--------|
| T1 | S1: migration, API, OpenAPI, form chips, list filter | item 3 (adds an optional field and filter only) | done (inline): RED→GREEN route, lib, form and dialog tests; tsc, knip, changed-file lint clean; full suite green except live-DB invariants (local DB down) and a WSL fs-scan timeout in guard-utils (passes alone); commit 605d1972 |
| T2 | S2, S3, S4, S5: tag report data endpoint | item 2 (scope rules) | done (inline): RED→GREEN `reports/tag/route.test.ts` 5/5; tsc, knip, changed-file lint clean; affected dirs (dashboard, reports, clients, lib) 110 files / 1623 tests green; independent verifier (item 2): S2, S4, S5 pass, S3 partial (opportunities ignored the cut-off) → fixed with `created_at <= end of corte` + member-scope count test; commits af70a029, c54cc7e5 |
| T3 | S4, S6, S7: tag report tab, print page and Excel | none expected | done (delegated: 2 parallel writers, trigger (a), disjoint surfaces): RED→GREEN export route 16 tests, tab/print/page 28 tests; seam check 31 files / 267 tests green, tsc, knip, lint clean; commits 57c0907d (Excel), bebbccac (tab + print) |
| T4 | S8, S9, S13: origin, nullable client with CHECK, ProyectoCliente, API | items 1 and 3 | pending |
| T5 | S8, S9, S14: creation choice and allies management in the ficha | item 2 (D3) | pending, blocked by D3 |
| T6 | S11, S12: null-safe readers, portfolio client filter, pipeline regression test | item 3 | pending |
| T7 | S10: opportunity ↔ project link | item 3 | pending, blocked by D1 |
| T8 | S16: optional `BitacoraEntrada.proyecto_id` | item 1 (additive) | pending |
| T9 | S15, S17: project report data, UI, print and Excel | none expected | pending |
| T10 | D2: convert the three tags into posición propia projects | item 1 (real data) | only if D2 = yes |

## Log

- **L1 (2026-11-19, user):** «Hola mi jefe me estuvo solicitando ciertas cositas, mejorar el tema de reportes, crearemos prototipos en claude design para los reportes que se exporten en pdf y excel. Me pidió que si en la sección de proyectos se podría incluir a mas de un cliente, algo parecido a un fondo.»
- **L2 (2026-11-19, user):** «También me comentó que le gustaría generar reportes de la gestión de proyectos, actividades y demás por etiqueta, por ejemplo, las nuevas que el creó como Fábrica Milagro, Reconstrucción y Distrito Creativo.» Clarified: «a el le gustaría generar un reporte de gestión de aquellos proyectos o clientes con las etiquetas que te mencioné».
- **L3 (2026-11-19, mapping):** A read-only explorer mapped the touchpoints. Findings:
  - Tags come from one admin catalog (`task_tags`). There is no shared tag input and no endpoint that lists tags in use; filters are exact and case-sensitive.
  - The pipeline sums only opportunities.
  - The portfolio counts all projects with no origin filter.
  - PDF is a client print page with `window.print()`; Excel is built server-side with exceljs.
  - **About 33 non-test files read `Proyecto.cliente_id`.** The proposal says «unos 15», which counted only the projects, portfolio and dashboard folders. Phase 3's 4–5 days for adapting readers may fall short; re-estimate before starting T6.
- **L4 (2026-11-19, user):** «Esperemos a que mi jefe me apruebe, mientras podemos ir creando las specs?» This document only records specs. Nothing is implemented, and no branch is created until approval.
- **L5 (2026-11-19, user):** «Sí, corrígelo». Changes to the proposal (`.md` and PDF), to match L3 and S16:
  - Phase 3: «unos 33 archivos», 12–15 days.
  - Phase 4: 6–9 days, including the bitácora ↔ project link.
  - Total: 25–34 business days, «unas 5 a 7 semanas».
  - Impact table: new rows for Portafolio and Bitácora.
  - Annex: notes on the PATCH `origen` guard and on `BitacoraEntrada.proyecto_id`.
- **L6 (2026-11-20, user):** «Para la nueva propuesta, crea un documento ya con todas las specs en PDF». Delivered `docs/specs-reportes-etiqueta-y-posicion-propia.pdf`: 10 pages, Spanish, identity manual v2.
  - Covers S1–S17, each with an acceptance criterion («Se acepta si») and touchpoints, plus D1–D4 and T1–T10 with estimates.
  - The acceptance criteria restate the specs; they add no new requirements.
- **L7 (2026-11-23, user):** «me dijo que si, que empezaramos». The boss approved; the decisions D1–D4 were not answered, so T5, T7 and T10 stay blocked. Before branching, `feat/producto-pendientes` (16 unpushed commits) went up as six stacked PRs to `main`, one per item (user: «primero sube pendientes por aparte», then «PRs encadenados por ítem»): #214 D4 → #215 V9 → #216 V8 → #217 V2 → #218 B6 → #219 V5. The knip fix moved into the V8 slice so `lint:dead` passes there. Phase 2 starts with T1.
- **L8 (2026-11-23, T1 implementation):** decisions and assumptions, not asked:
  - Tags are editable while the project is EN_EJECUCION too, because they classify the project for reports and do not change the baseline. This changes the existing 409 message to «En un proyecto en ejecución solo se pueden editar la descripción, los beneficiarios y las etiquetas. Los demás datos cambian la línea base: solicítalo como modificación.» and the dialog copy to «En ejecución puedes cambiar la descripción, los beneficiarios y las etiquetas.»
  - `CLIENT_ETIQUETAS_SCHEMA` moved to `src/lib/api/etiquetas.ts` as `ETIQUETAS_SCHEMA` (same rules), shared by clients and projects. `ClientTagsField` became the shared `EtiquetasField` (`src/components/crm/etiquetas-field.tsx`), used by the client form, the create form and «Editar datos generales». The tasks dialog keeps its own chips (not touched).
  - The GANADA conversion (E-05) also accepts and stores `etiquetas`, since it shares `PROJECT_CREATE_BASE` with E-03 and the same form posts to both.
  - The tags change is audited as one `etiquetas` row (before/after arrays), like any other general field.
  - The list filter is API-only (`GET /projects?etiqueta=`), as S1 states; no list UI filter was added.
- **L9 (2026-11-23, T1 closed):** full unit suite: every failure is a `prisma/*.invariant.test.ts` (`Can't reach database server at 127.0.0.1:54322`) or the `guard-utils` 5 s timeout scanning `/mnt/c` (passes alone). Live-DB invariants for the `etiquetas` migration remain pending until the local DB is up; CI runs them. Next: T2.
- **L10 (2026-11-23, T2 implementation):** decisions and assumptions, not asked:
  - Route `GET /api/v1/reports/tag?etiqueta=&desde=&hasta=` (English path, like `reports/weekly`); loader `src/lib/reportes/etiqueta.ts`. 400 «Elige una etiqueta.» without a tag; the period reuses `parseDashboardFilters`.
  - Projects come from `cargarPortafolio` (its `parsePortafolioFilters` now reads `etiqueta`), so the 403 and the member scope are the portfolio's. «Valor total» is the sum of `Proyecto.valor_total` (separate select by id); «ejecución» is the portfolio aggregate `programado`/`ejecutado`.
  - Open opportunity states moved to `OPEN_OPPORTUNITY_STATES` in `lib/api/crm.ts`; the pipeline route reuses it. Opportunity amounts are summed in cents, not floats.
  - Clients and tasks use `clienteScopeWhere`/`tareaScopeWhere` with scope `"all"`, plus `clienteFeedScope()` for clients. Verified: client, task, opportunity and interaction reads are global for every role (`clients/route.ts:5`, `tasks/route.ts:2`, `clientReadScope()` returns `{}` at `crm.ts:41`), so S5 «never more than the user can already see» holds.
  - A client never contacted counts as «sin interacción reciente». The bitácora lists the latest 50 entries in the period.
- **L11 (2026-11-23, T2 verification):** independent verifier: no blockers; S2, S4, S5 pass. S3 partial: opportunities, their per-client count and the pipeline ignored the cut-off. Fixed: open opportunities are those created up to the end of `corte` (current state; a true historical state would need the audit log). Added tests for the cut-off and for the member scope of the client project count. Known, not changed: for a past period `dias_sin_interaccion` counts against today; open tasks due before `desde` fall outside the period (T3 states this in the UI). Stale comments at `crm.ts:7` and `interactions/route.ts:6-8` still claim COLABORADOR reads only own clients.
- **L12 (2026-11-23, T3 plan):** two parallel units. (A) Excel: `GET /api/v1/reports/tag/export?etiqueta=&desde=&hasta=[&formato=xlsx]`, builder `src/lib/reportes/etiqueta-xlsx.ts`, EXPORTAR audit, filename `reporte-etiqueta-<slug>-<corte>.xlsx`. (B) UI: «Etiqueta» tab in `/reportes`, hook `useReporteEtiqueta` + `downloadReporteEtiqueta` in `hooks/reportes.ts`, print page `src/app/print/reportes/etiqueta`. Shared type `ReporteEtiqueta` exported from `lib/reportes/etiqueta.ts` by the parent. The S2 footnote and the L11 period notes appear in both the tab/print and the Excel Resumen sheet.
- **L13 (2026-11-23, T3 closed):** both writers stayed inside their surfaces. Seam fix by the parent: the notes moved to `lib/reportes/etiqueta-notas.ts` (shared by UI and Excel; keeps exceljs out of the client bundle), with the Excel wording as canonical. Writer choices kept: 403 before `formato` like the weekly export; the autofilter excludes the totals row; Resumen shows programado/ejecutado amounts without a new percentage; the tag Select cannot be cleared once chosen; `keepPreviousData` keeps the previous tag's report visible while the next loads. Phase 2 tasks T1–T3 done; T4+ next per the task table (T5/T7/T10 blocked by D3/D1/D2).
- **L14 (2026-11-23, phase 2 published):** user: «listo dale» (push and open the phase 2 PRs). Stacked to main after #219: #220 `feat/re-1-t1-etiquetas` (proposal docs + T1, 3cdbab28..605d1972), #221 `feat/re-2-t2-datos` (T2, af70a029..06505d4f), #222 `feat/re-3-t3-excel` (T3 Excel, 57c0907d), #223 `feat/re-4-t3-pestana` (T3 tab + print, bebbccac..). #221–#223 request `size:exception` (each is one behavior with its tests). Merge in order, rebasing after each squash merge.
