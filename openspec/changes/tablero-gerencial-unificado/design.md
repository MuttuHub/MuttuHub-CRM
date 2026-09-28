# Design: tablero-gerencial-unificado

## Current State (verified in code, 2026-09-28)

Two independent implementations exist today, both reading the same `GET /api/v1/dashboard/projects` (org-wide, no `proyecto_id`):

| Route | Component | Data | Permission handling |
|---|---|---|---|
| `/tablero-gerencial` | `tablero-gerencial-client.tsx` → `KpiCards` + `CurveSChartContainer` | `useProjectDashboard(null)` | Generic error ("No se pudo cargar el tablero gerencial") on ANY error, including 403 |
| `/` → 5th tab "Tablero gerencial" | `dashboard-page.tsx` (`DashboardTabs`) → `cara-management.tsx` (`CaraGerencial`) | `useDashboardManagement(filters)` | Explicit 403 handling: renders the server's permission message (`ApiError.message`) |

Both call the same endpoint; the DTOs are structurally identical (`ProjectDashboard`), but `CaraGerencial` is the richer, already-permission-aware surface (own file comment: "quinta cara", built in `tablero-seguimiento-social` Fase 4c) and matches v6's visual language (tacómetro/curva S/radar) far more closely than the older `KpiCards` text-card layout.

The nav (`src/lib/nav.ts`) lists `/tablero-gerencial` unconditionally in the "Dirección" group — visible to every role regardless of `puede_ver_tablero_gerencial`, with no client-side gating. `sidebar.tsx` renders `NAV_GROUPS` with zero permission filtering anywhere in the shell.

## Already Exists vs. v6 Gap (per visualization)

v6's "Tablero gerencial" screen (`Muttu Hub v6.dc.html:311-326`, `README.md:160-161`) specifies 6 KPI cards, a filter row (Línea · Territorio · Periodo), and a "Semaforización territorial" table.

| # | Visualization (v6 copy, verbatim) | Already exists | v6 gap |
|---|---|---|---|
| 1 | **Avance técnico** — "Promedio ponderado de actividades e hitos" (gauge/tacómetro, ● En rango) | `Tacometro` (SVG semicircle) in `cara-management.tsx`, fed by `data.avance_tecnico`/`data.color_tecnico` | None — matches design. Legend dot ("● En rango"/"● Atención") not rendered today (only the bar tone); minor, see Open Decisions |
| 2 | **Avance financiero · Curva S** — "Ejecutado / asignado · $ X de $ Y" | `CurveSChart` in `cara-management.tsx`, fed by `data.curva_s` | Missing the "$ ejecutado de $ proyectado" caption text and the big `%` number above the chart (design shows both; current only shows the chart) |
| 3 | **Cumplimiento de indicadores** — radar, N axes | `Radar` primitive in `radar.tsx`, but `cara-management.tsx` passes exactly ONE axis (`cumplimiento_indicadores`) — the component's own comment says it "draws as a single-axis radar" and "supports N axes for when a per-indicator series exists" | **Gap**: needs 5 axes (see Open Decisions D1) — primitive already supports N, zero new chart code |
| 4 | **Cumplimiento del cronograma** — one horizontal bar **per project** | `cara-management.tsx` renders ONE aggregated `BarRow` (org-wide %), no per-project breakdown | **Gap**: needs `por_proyecto[]` from the endpoint (new, additive) + a `BarRow` per project |
| 5 | **Productos entregados/programados** — **grouped bars** (planned vs. delivered) **per project** | `cara-management.tsx` renders ONE aggregated `BarRow` (entregados/programados as a single ratio) | **Gap**: needs `por_proyecto[]` (same new field, more columns) + a grouped-bar visual per project (new small SVG/CSS, same primitive family as the existing bars — no new chart library) |
| 6 | **Beneficiarios atendidos** — big stat, progress bar, "de N personas en la meta poblacional" | `StatTile` in `cara-management.tsx` shows `atendidos/meta` as text, no progress bar | **Gap**: add a progress bar (same pattern as `KpiCardsView`'s beneficiary bar in `kpi-cards.tsx`, reused visually) |
| — | **Filtros: Línea · Territorio · Periodo** | Only "Periodo" exists (shared `DashboardFilters.desde/hasta`, the common rango chip) | **Gap**: Línea (`LineaEstrategica` enum) and Territorio (`Proyecto.territorio` string) don't exist as dashboard filters anywhere today |
| — | **Semaforización territorial** (table: territorio, proyectos count, semáforo técnico/financiero) | Does not exist in any form | **Gap**: new `por_territorio[]` from the endpoint + new list section in `cara-management.tsx` |
| — | **"Una sola ruta"** (Auditoría F1.6) | Two routes exist today | **Gap**: this is the routing decision below |
| — | **Advertencia de doble conteo de beneficiarios** (Auditoría KPI 6 gap) | `indicadores_beneficiarios_count` is already returned but never surfaced as a warning | **Gap**: show a warning when `indicadores_beneficiarios_count > 1` |

## Routing Decision — "unify `/tablero-gerencial` and `/`"

**Decision**: `/` keeps being the single Inicio route with its 5-tab `DashboardTabs`. `/tablero-gerencial` becomes a **server-side redirect** to `/?cara=management` (permanent, 308) instead of rendering its own page. `TableroGerencialClient` and its test are deleted — `KpiCards`/`CurveSChartContainer` are NOT deleted (they're still used by the project workspace's Resumen tab with a `projectId`, per `gestion-proyectos-workspace`'s design.md T6 — that consumer is untouched).

`dashboard-page.tsx` reads an initial `?cara=` search param (mirrors the existing `notice` search param already read by `page.tsx`) to preselect one of the 5 tabs on load; `cara=management` selects "Tablero gerencial". The nav item in `src/lib/nav.ts` changes its `href` from `/tablero-gerencial` to `/?cara=management`, keeping the same label ("Tablero Gerencial") and icon, so users navigating via the sidebar land directly on the right tab.

**Why a redirect, not deleting the route silently**: a bookmarked or externally-linked `/tablero-gerencial` URL must keep working (constraint: "don't regress existing dashboards... call out anything removed or moved"). A 308 is the correct HTTP semantics here — this Next.js version's routing conventions live in `node_modules/next/dist/docs/`; a `redirect()` call in a Server Component `page.tsx` (or a `next.config`'s `redirects()` entry, whichever this version's app-router docs specify — **verify against the local docs before implementing**, this design does not assume which mechanism is current) is the implementation target, not a client-side `router.push`.

**Existing links/bookmarks**: only one internal reference exists (`src/lib/nav.ts`'s nav item and `PAGE_HEADERS["/tablero-gerencial"]`); no other in-app link points there (verified via `rg -n "tablero-gerencial"` across `src/`). External bookmarks are covered by the redirect.

**Nav highlighting**: `isNavActive` (`src/lib/nav.ts`) does prefix matching; once the href becomes `/?cara=management`, exact-path highlighting no longer works for query-param state (today's `isNavActive` only compares `pathname`, never `searchParams`). The nav item will highlight whenever `pathname === "/"`, same as "Inicio" — both items would appear active simultaneously on `/`. This is a real UX regression versus today (where `/tablero-gerencial` highlights uniquely) and needs one of:
- (a) `isNavActive`/`SidebarContent` reads `useSearchParams()` too, comparing `cara` when the href carries one — small addition, no other nav item currently needs it.
- (b) Accept that "Inicio" and "Tablero Gerencial" both highlight when the management tab is active (matches v6's mock loosely, where nav highlighting is per top-level view, not per-tab).

This design takes **(a)** as the default (see Open Decisions) — it is the smaller, most correct fix and doesn't regress the one existing precedent (`/tablero` vs `/tablero-gerencial` exact-match comment already shows this codebase cares about correct nav highlighting).

**Per-role landing, incl. a user WITHOUT `puede_ver_tablero_gerencial`**:
- A management-role user (`ADMINISTRADOR`/`GERENCIA`/`COORDINADOR`, i.e. `canManageAny`) or a `COLABORADOR` with `puede_ver_tablero_gerencial` visiting `/?cara=management` (via nav, via the old `/tablero-gerencial` redirect, or via a raw URL) sees the full tablero content — same as today's `CaraGerencial` 200 path.
- A user WITHOUT that flag (a `COLABORADOR` without `puede_ver_tablero_gerencial`) hitting `/?cara=management` (nav, redirect, or raw URL) gets the SAME experience as clicking the tab manually today: the endpoint 403s, and `CaraGerencial` shows the server's permission message inline, INSIDE the `/` shell — never a full-page error, never silently falling back to another tab. This is unchanged behavior (already correct today for the 5th-tab path) and now also covers everyone who used to hit `/tablero-gerencial` directly.
- v6's actual behavior for this role (Visualizador) is to skip Inicio entirely and land on the tablero (`LANDING.Visualizador = 'tablero'`) with no "Inicio" nav item at all (`ACCESS.Visualizador` excludes `'inicio'`) — **this is explicitly OUT of scope** (see proposal.md Scope/Out) because the Auditoría's F1.6 row doesn't mention landing/redirect changes and doing so would require a session-aware post-login redirect and a role-conditional nav, both cross-cutting changes beyond a `M`-sized UI change. Documented here as a known, deliberate gap versus the full v6 vision — see Open Decisions.

## Data Gaps (new API fields vs. already available)

`GET /api/v1/dashboard/projects` today returns one aggregated row (org-wide or single-project). No schema change needed for any of the below — `Proyecto.territorio`/`Proyecto.linea_estrategica` already exist (`prisma/schema.prisma:560-561`).

| New need | New query param / response field | Migration? | Source |
|---|---|---|---|
| Filter by línea estratégica | `?linea_estrategica=<LineaEstrategica>` (query param) | No | `Proyecto.linea_estrategica` (existing enum column) — same pattern as `?tipo_cliente=` already does via `parseDashboardFilters`, but scoped to THIS endpoint only (see Open Decisions D2 — not added to the shared `DashboardFilters` type used by the other 4 caras) |
| Filter by territorio | `?territorio=<string>` (query param) | No | `Proyecto.territorio` (existing string column) |
| Cronograma bar per project | `por_proyecto: { proyecto_id, nombre, cumplimiento_cronograma }[]` | No | One additional `GROUP BY p.id` query reusing the existing `tecnico` CTE's shape (same JOINs/FILTERs, just not collapsed to one row) — the route's own comment already anticipates this exact addition for "Fase 4c" |
| Entregables grouped bar per project | `por_proyecto[].productos_entregados` / `.productos_programados` (same array, more columns) | No | Same additional query, reusing the `entregables` CTE's shape per-project |
| Semaforización territorial | `por_territorio: { territorio, proyectos_count, color_tecnico, color_financiero }[]` | No | One additional `GROUP BY p.territorio` query reusing the `tecnico`/`financiero` CTEs' ratios, resolved through `colorTecnico`/`colorFinanciero` per territory group (org-level thresholds — no per-territory override concept exists, same as today's org-wide colors) |
| Radar 5 axes | No new field — reshape client-side from 5 already-returned scalars (`avance_tecnico`, `avance_financiero`, `cumplimiento_indicadores`, `cumplimiento_cronograma`, and `productos_entregados/productos_programados` as a %) | No | Purely a `cara-management.tsx` change: build `RadarAxis[]` instead of a 1-element array |
| Doble conteo warning | No new field — `indicadores_beneficiarios_count` already returned | No | Purely a `cara-management.tsx` conditional render (`count > 1`) |

**Query cost**: adding `por_proyecto`/`por_territorio` means 2 more `db.$queryRaw` calls in the same request (the route already declares "exactly 2 `$queryRaw`" as a hard invariant in its own comment — this changes that invariant to 4, which must be re-documented, not silently violated). Both new queries reuse the exact same `proyectosFiltradosSubquery` and CTE shapes already in the file — no new SQL patterns, just `GROUP BY` instead of full collapse.

## Open Decisions (client sign-off needed; default = Auditoría's own recommendation where one exists)

| # | Decision | Default (applied unless client overrides) | Source |
|---|---|---|---|
| D1 | Radar's 5 axes: exactly which 5 KPIs, in what order/labels | `Avance técnico`, `Avance financiero`, `Cumplimiento de indicadores`, `Cumplimiento de cronograma`, `Entregables` (the 5 non-beneficiary KPIs already computed, beneficiarios excluded because it's a count-vs-meta stat, not a %-of-100 ratio suited to a radar axis) | No explicit v6 mock data for the 5 radar labels (placeholder `{{ r.l }}` in the `.dc.html`); default follows the Auditoría's framing "6 KPIs" minus the one that doesn't fit the 0-100% radar shape |
| D2 | Should `linea_estrategica`/`territorio` become part of the SHARED `DashboardFilters` type (`src/lib/dashboard.ts`, used by all 5 caras) or stay local to `dashboard/projects` only | Local to `dashboard/projects` only — the other 4 caras (pipeline/tasks/clients-activity/my-summary) have no v6 requirement for these filters; extending the shared type would silently add unused params to 4 unrelated endpoints | v6's README only mentions these filters for the "Tablero gerencial" screen |
| D3 | Nav highlighting fix for `/?cara=management` (Routing Decision, option a vs. b) | Option (a): `isNavActive` reads the `cara` query param for hrefs that carry one | Auditoría/README don't address nav highlighting; default follows the codebase's own existing precedent of correct exact-match nav behavior (`nav.ts`'s `/tablero` comment) |
| D4 | Visualizador role landing (skip Inicio, land on tablero) and hiding "Inicio" from Visualizador's nav | NOT implemented in this change (Scope/Out) — kept as a documented gap for a future, separate change | v6 (`LANDING`/`ACCESS` in `Muttu Hub v6.dc.html`) vs. Auditoría F1.6's own `M`-sized scope which doesn't mention it |
| D5 | Whether hiding the "Tablero Gerencial" nav item entirely for users without `puede_ver_tablero_gerencial` (client-side, in addition to the server's 403) is in scope | NOT implemented — the item stays visible to everyone, same as today; the 403 message is the only permission signal, matching today's already-accepted deviation in `cara-management.tsx`'s own file comment ("el shell NO oculta la pestaña a quien no puede verla... el endpoint responde 403") | `cara-management.tsx`'s own documented, already-accepted deviation extends verbatim to the unified route |
| D6 | Semáforo por territorio: usa siempre el umbral de organización (no hay concepto de override por territorio) | Sí — mismo criterio que el agregado org-wide ya usa hoy (nunca hay "un" proyecto cuyo override aplicar a un grupo de territorio) | Extensión directa de la "Desviación declarada" ya documentada en `dashboard/projects/route.ts` para el agregado org-wide |

None of these are migrations or destructive; all defaults are additive and reversible.

## Technical Approach

1. **`src/app/(app)/tablero-gerencial/page.tsx`** — replace the page body with a redirect to `/?cara=management` (mechanism per this Next.js version's app-router docs — verify in `node_modules/next/dist/docs/` before writing; do not assume `redirect()` semantics from prior Next.js versions given this repo's "breaking changes" warning). Delete `tablero-gerencial-client.tsx` and its test.
2. **`src/lib/nav.ts`** — change the "Tablero Gerencial" item's `href` to `/?cara=management`; remove the now-orphaned `PAGE_HEADERS["/tablero-gerencial"]` entry (or keep it pointed at `/`'s header — `/` already overrides its header dynamically per `page.tsx`'s comment, so this entry becomes dead and should be deleted, not repurposed).
3. **`isNavActive`** — extend to accept the current `searchParams` and, when an item's href has a `cara=` query, require it to match too (D3).
4. **`src/app/(app)/page.tsx`** — read `cara` from `searchParams` (already an async prop) and pass it to `DashboardTabs` as an initial-tab override.
5. **`dashboard-page.tsx`** — accept `initialCara?: CaraId` and seed `useState(initialCara ?? "pipeline")`.
6. **`src/app/api/v1/dashboard/projects/route.ts`** — add `linea_estrategica`/`territorio` to `proyectosFiltradosSubquery`'s params and `WHERE`; add the two new `GROUP BY` queries for `por_proyecto`/`por_territorio`, reusing existing CTE fragments; update the file's own "exactly 2 `$queryRaw`" comment to reflect 4.
7. **`src/hooks/dashboard.ts`** / **`src/hooks/projects.ts`** — extend `useDashboardManagement`'s filter param and `ProjectDashboard`'s type with the new optional fields.
8. **`cara-management.tsx`** — radar 5 axes; per-project bars for cronograma/entregables (new small presentational sub-components, same file or a co-located helper, following the existing `BarRow`/`CardSection` primitives — no new chart library); "Semaforización territorial" list section (same `CardSection` + row pattern as the existing territory-less content); Línea/Territorio filter chips (reuse `ChipSelector`, same as the rango chip in `dashboard-page.tsx`); doble-conteo warning banner (same visual language as the existing 403 message, `text-alerta`).
9. **`src/app/print/dashboard/management/page.tsx`** — mirror the same new sections for the PDF export (already exists for the current, simpler content).

## File Changes

See proposal.md's "Affected Areas" table — reproduced here 1:1 per this repo's own convention of listing files once in proposal.md.

## Testing Strategy

Strict TDD, RED before code:

1. `dashboard/projects/route.test.ts` — `linea_estrategica`/`territorio` filters narrow the aggregate and the new `por_proyecto`/`por_territorio` arrays; a project with `indicadores_beneficiarios_count > 1` is still returned as-is (warning is a UI concern, not an API concern — the route test only proves the count is present and unmodified).
2. `cara-management.test.tsx` — radar receives 5 axes with correct values; per-project bars render one row per `por_proyecto` entry; territorial section renders one row per `por_territorio` entry with correct dot colors; Línea/Territorio chip selection triggers a refetch with the right query params; the 403 permission-message path (already tested) stays green; the doble-conteo warning renders only when `indicadores_beneficiarios_count > 1`.
3. `dashboard-page.test.tsx` — `initialCara="management"` (from `?cara=management`) mounts `CaraGerencial` on first render, not `CaraPipeline`.
4. `nav.test.ts`/`sidebar.test.tsx` (whichever currently references `/tablero-gerencial`) — updated href, `isNavActive` with a `cara` query param.
5. `tablero-gerencial/page.test.tsx` (new or renamed) — visiting the route returns a redirect to `/?cara=management` (exact assertion mechanism depends on the Next.js version's testing conventions for `redirect()` in this app-router version).

## Risks

See proposal.md's Risks table.

## Assumptions Taken (not resolved by the proposal)

- The redirect is a permanent (308) server-side redirect, not a client-side one — no flash of an empty/loading `/tablero-gerencial` page before landing on `/`.
- "Semaforización territorial" resolves `territorio` from `Proyecto.territorio` (a free-text string in the current schema, not an enum) — grouping is by exact string value; no normalization/catalog of territories is introduced (out of scope, would need a `Territorio` catalog/enum, which doesn't exist today).
- The grouped bars for "Entregables" (planned vs. delivered per project) reuse the existing `entregables` CTE's shape (entregados/programados counts), not a new formula.

## Open Questions

- Exact radar axis labels/order (D1) — needs client confirmation; default applied.
- Whether Línea/Territorio filters should also gate the OTHER 4 caras in a future change (explicitly out of scope here, D2's default keeps them isolated).
- Visualizador's landing/nav behavior (D4) — explicitly deferred to a future change, not blocking F1.6.
