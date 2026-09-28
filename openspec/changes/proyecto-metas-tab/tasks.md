# Tasks: proyecto-metas-tab — Pestaña Metas (RF-02, KPI 3)

## Review Workload Forecast (recomputed 2026-09-28, post user corrections)

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-950 — grew from the original ~440-540 because D4 was corrected from a local hardcoded threshold to a server-resolved `indicador` band (touches `semaforo.ts`/`catalogs.ts`/`settings.ts`/`settings/route.ts`/two `indicators` routes + their tests), plus D6 (tab reorder) and D7 (project-wide `A{n}`) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Slice A (semáforo `indicador` band + settings backward-compat + server-side `color_indicador` on the indicators routes — no UI) → Slice B (`metas-tab.tsx` read-only: meta cards, activity chips, indicator rows rendering `color_indicador` verbatim — not yet mounted) → Slice C ("Editar avance" wiring via exported `IndicadorFormDialog` + mount `metas-tab.tsx` as the project workspace's 2nd tab) |
| Delivery strategy | ask-on-risk (session default) |
| Chain strategy | Not yet asked of the user for this run — the orchestrator's review workload guard applies before `sdd-apply`; this writer proceeds slice-by-slice with one commit per slice per its explicit instructions, which already satisfies "chained, reviewable work units" |

### Suggested Work Units

| Unit | Goal | Slice | Focused test command | Rollback boundary |
|------|------|-------|-----------------------|--------------------|
| 1 | `lib/semaforo.ts`/`lib/catalogs.ts` — `indicador` band, `colorIndicador`, `resolverUmbrales` merge | A | `npx vitest run src/lib/semaforo.test.ts` | Revert the band/function; nothing else depends on it yet |
| 2 | `lib/settings.ts` — `getUmbralesSemaforo()` backward-compat fill | A | `npx vitest run src/lib/settings.test.ts` | Revert the new export; no call sites yet |
| 3 | `settings/route.ts` — PUT preserves stored `indicador` when omitted, GET returns it | A | `npx vitest run src/app/api/v1/settings/route.test.ts` | Revert the merge line; existing PUT/GET behavior for `task_tags`/`doc_categories` untouched |
| 4 | `indicators/route.ts` (GET) + `indicators/[indicatorId]/route.ts` (GET/PATCH) — `color_indicador` in the response | A | `npx vitest run src/app/api/v1/projects/[id]/indicators/route.test.ts src/app/api/v1/projects/[id]/indicators/[indicatorId]/route.test.ts` | Revert the added field; `hooks/projects.ts`'s `Indicador` type change reverts alongside |
| 5 | `tabs/metas-tab.tsx` — meta cards, activity chips (project-wide `A{n}`, color, pct), indicator rows (value/progress/`color_indicador` verbatim), per-card empty states | B | `npx vitest run src/components/proyectos/tabs/metas-tab.test.tsx` | Delete the new file; not yet wired into `project-workspace.tsx`, zero blast radius |
| 6 | `indicadores-tab.tsx` — export `IndicadorFormDialog`; wire "Editar avance" in `metas-tab.tsx` | C | `npx vitest run src/components/proyectos/tabs/indicadores-tab.test.tsx src/components/proyectos/tabs/metas-tab.test.tsx` | Revert the `export` keyword and the dialog-wiring lines in `metas-tab.tsx` |
| 7 | `project-workspace.tsx` — mount `"metas"` as the 2nd tab | C | `npx vitest run src/components/proyectos/project-workspace.test.tsx` | Revert `TAB_VALUES`/`TabsTrigger`/`TabsContent` addition |

## Slice A: Semáforo `indicador` band + settings backward-compat

- [x] A.1 RED: `semaforo.test.ts` — `colorIndicador` at/above/below `indicador.verde`/`indicador.amarillo`; `resolverUmbrales` merges a partial `indicador` override and falls back to the organization's `indicador` when omitted. Confirm failing.
- [x] A.2 GREEN: add `indicador: { verde, amarillo }` to `UmbralesSemaforo`, `colorIndicador(razon, u)`, extend `UMBRALES_OVERRIDE_SCHEMA`/`resolverUmbrales`'s merge; add `UMBRALES_SEMAFORO_DEFAULT.indicador = { verde: 0.9, amarillo: 0.6 }` in `catalogs.ts`. Confirm passing.
- [x] A.3 RED: `settings.test.ts` — `getUmbralesSemaforo()` backfills `indicador` from the default when the stored row predates this change. Confirm failing.
- [x] A.4 GREEN: implement `getUmbralesSemaforo()` in `settings.ts`. Confirm passing.
- [x] A.5 RED: `settings/route.test.ts` — PUT with `semaforo_umbrales` omitting `indicador` preserves the previously-stored `indicador`; PUT with an explicit `indicador` saves it; GET always returns a backfilled `indicador`. Confirm failing.
- [x] A.6 GREEN: update `isUmbralesSemaforo` (indicador optional, validated when present), PUT handler (merge preserved `indicador`), `readSnapshot` (use `getUmbralesSemaforo()`). Confirm passing. Run the existing `settings/route.test.ts` suite to confirm zero regressions on `task_tags`/`doc_categories`.
- [x] A.7 RED: `indicators/route.test.ts` (GET) — response includes `color_indicador`; project `umbrales_override.indicador` overrides the org default; `valor_actual: null` → `rojo`. Confirm failing.
- [x] A.8 GREEN: GET resolves `umbrales` (`getUmbralesSemaforo()` + `resolverUmbrales` + `db.proyecto.findUnique` for `umbrales_override`, same pattern as `budget/route.ts`) and maps `color_indicador` per indicador. Confirm passing.
- [x] A.9 RED: `indicators/[indicatorId]/route.test.ts` — GET/PATCH responses include `color_indicador`. Confirm failing.
- [x] A.10 GREEN: mirror the same resolution in the detail route's GET/PATCH. Confirm passing.
- [x] A.11 Update `src/hooks/projects.ts`'s `Indicador` type with `color_indicador: "verde" | "amarillo" | "rojo"`. `npx tsc --noEmit` to confirm no downstream breakage.

## Slice B: Metas list (read-only, server-resolved color)

- [x] B.1 RED: `metas-tab.test.tsx` — loading/empty (project has no metas)/populated states; a meta card renders its activity chips with project-wide sequential `A{n} · {porcentaje_avance}%` labels (two metas' chips never repeat a code) and the correct color per `actividadColor`'s four cases; a meta with no activities shows its per-card empty state ("Sin actividades vinculadas."); an indicator row shows `valor_actual/meta_valor unidad`, falling back to "Sin medir" when `valor_actual` is `null`, and its progress bar color comes verbatim from the mocked `indicador.color_indicador` (never recomputed); a meta with no indicators shows its per-card empty state ("Sin indicadores vinculados."). No "Editar avance" assertion yet (Slice C). Confirm failing.
- [x] B.2 GREEN: implement `tabs/metas-tab.tsx` per design.md's Component Structure and the `actividadColor`/`actividadCodigos`/`indicadorPct` helpers in its Data Model section. Confirm passing.

## Slice C: Editar avance (reuse `IndicadorFormDialog`) + workspace mount

- [x] C.1 RED: extend `metas-tab.test.tsx` — clicking "Editar avance" on an indicator opens `IndicadorFormDialog` pre-filled with that indicador's `nombre`/`unidad`/`meta_valor`/`valor_actual`; submitting a new `valor_actual` calls `useUpdateIndicator`'s mutation with the edited payload; on success the row's value reflects the new figure. Confirm failing.
- [x] C.2 GREEN: add `export` to `IndicadorFormDialog` in `indicadores-tab.tsx`; wire it into `metas-tab.tsx` (lifted `formOpen`/`editing` state, same pattern as `indicadores-tab.tsx`). Confirm passing. Run `npx vitest run src/components/proyectos/tabs/indicadores-tab.test.tsx` to confirm zero regressions from the export change.
- [x] C.3 RED: extend `project-workspace.test.tsx` for the `"metas"` tab at its new 2nd position (mount-only-when-selected, mirrors every existing per-tab assertion). Confirm failing.
- [x] C.4 GREEN: add `"metas"` to `TAB_VALUES` right after `"resumen"`, and its `TabsTrigger`/`TabsContent` pair in the same position. Confirm passing.
- [x] C.5 Manual check: "Editar avance" icon buttons ≥44px hit-area (`icon-sm` + `after:-inset-2`, same as `indicadores-tab.tsx`'s pencil/trash pattern), dialog inputs ≥16px (`text-base`, inherited unchanged from `IndicadorFormDialog`), meta cards and their chip rows don't force horizontal scroll at 390px (stacked `flex-col` + `flex-wrap` chips) or break at 1440px. Verified by code review (no browser available in this session).

## Phase 4: Full verification

- [x] 4.1 `npx tsc --noEmit` — 0 errors.
- [x] 4.2 `npx eslint .` (scoped to touched paths) — 0 errors.
- [x] 4.3 `npm run test` (full suite via `npx vitest run`) — all green, no regressions.
- [x] 4.4 Commit as Conventional Commits on `local/todo-integrado` (no push), one commit per slice. No AI attribution.
- [x] 4.5 Update this file's checkboxes and the relevant `odd/tasks/*.md` tracking file's F1.4 line with evidence.
