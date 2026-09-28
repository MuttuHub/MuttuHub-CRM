# Design: proyecto-metas-tab — Pestaña Metas

## Technical Approach

One derived read-only field added to two already-existing API routes, plus three UI pieces, in dependency order:

1. **`lib/semaforo.ts`/`lib/catalogs.ts`** — `UmbralesSemaforo` gains a third band, `indicador: { verde: number; amarillo: number }`, alongside `tecnico`/`financiero`. New pure `colorIndicador(razon, u)`, same shape as `colorTecnico`/`colorFinanciero`. `UMBRALES_SEMAFORO_DEFAULT` gains `indicador: { verde: 0.9, amarillo: 0.6 }` (v6's exact cut values, as ratios — same unit as `tecnico`/`financiero`). `resolverUmbrales` merges `indicador` exactly like the other two bands.
2. **`lib/settings.ts`** — new `getUmbralesSemaforo()`, wrapping `getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT)` and backfilling `indicador` from the default when a stored row predates this change (JSON, no migration — without this, an old row would make `colorIndicador` crash on `undefined.verde`). Every reader of the org-level setting for indicator coloring goes through this, not raw `getSetting`.
3. **`api/v1/projects/[id]/indicators/route.ts` (GET)** and **`[indicatorId]/route.ts` (GET/PATCH)** — same pattern as `budget/route.ts`: resolve `umbrales` via `getUmbralesSemaforo()` + `resolverUmbrales(umbralesOrganizacion, proyecto.umbrales_override)`, and add `color_indicador` to each indicador in the response, computed server-side. The frontend never computes this color — it renders it verbatim, exactly like `financiero-tab.tsx` does with `color_financiero`.
4. **`api/v1/settings/route.ts`** — PUT accepts `semaforo_umbrales.indicador` as optional; when omitted (today's case — `UmbralesSection` builds no UI for this band), the server preserves the currently-stored `indicador` instead of overwriting it with `undefined`, so the existing admin flow keeps working unchanged and never silently drops the band. GET always returns it (normalized via `getUmbralesSemaforo()`).
5. **`indicadores-tab.tsx`** — add `export` to the already-built, already-tested `IndicadorFormDialog`. No behavior change; its own tests stay green untouched.
6. **`tabs/metas-tab.tsx`** — reads `useGoals(projectId)`, `useActivities(projectId)`, `useIndicators(projectId)` (all three pre-existing, already fetched by `cronograma-tab.tsx`/`gantt-tab.tsx`/`indicadores-tab.tsx`), groups activities and indicators by `meta_id`, renders one card per `Meta`, numbers activity chips `A{n}` sequentially across the whole project (in `useActivities`' own order — `fecha_planificada asc`, the same order Cronograma/Gantt already consume — before grouping by meta), renders `indicador.color_indicador` verbatim, and reuses `IndicadorFormDialog` for "Editar avance".
7. **`project-workspace.tsx`** — adds `"metas"` as the 2nd tab, right after `"resumen"` (matching v6).

No schema change, no migration, no API route touched. This is the exact case the Auditoría already classified as `UI`-only for RF-02/KPI 3 (`Auditoria v6.dc.html` line 253: `['F1.4', 'Pestaña Metas', 'Metas con indicadores y actividades vinculadas por ID.', 'UI', 'RF-02 · KPI 3', 'S']`).

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | "Editar avance" reuses `IndicadorFormDialog` (exported from `indicadores-tab.tsx`), opened pre-filled for one indicador — no new dialog, no new mutation | Build a dedicated "Registrar avance" dialog local to `metas-tab.tsx`, mirroring the v6 mock's separate `regAvance` handler | The v6 mock's `regAvance` is a placeholder (`this.flash('Avance registrado…')`, never a real form — `Muttu Hub v6.dc.html:1363`). The real, tested update flow already exists: `useUpdateIndicator` + `IndicadorFormDialog`'s edit mode does exactly "change `valor_actual`, keep the rest." Building a second dialog for the same mutation would violate "prefer UI over existing backend" and duplicate validation (`meta_valor`/`valor_actual` numeric checks) that already lives in one place. |
| D2 | "Nuevo indicador" (create) stays exclusive to `indicadores-tab.tsx`; Metas has no create entry point | Add a "Nuevo indicador" CTA to Metas too, mirroring the mock's bottom button | The mock's own button reads "Registrar avance de indicador" (edit semantics, not create) and the Auditoría's F1.4 description is "indicadores y actividades vinculadas **por ID**" — a read/grouping surface, not a second creation path. Two create entry points for the same resource (Indicadores tab and Metas tab) would be redundant UI for zero new capability. |
| D3 | Activity chips within a Meta card compute their own local `A{n} · pct% ` color via a small pure function duplicated in `metas-tab.tsx`, same shape as `gantt-tab.tsx`'s `actividadColor` | Import `actividadColor` from `gantt-tab.tsx`, or extract it to a shared `lib/` helper first | `gantt-tab.tsx`'s `actividadColor` is a local, unexported function — importing it would mean either exporting internals of a sibling tab component (couples two unrelated tabs) or a shared-helper extraction that touches two existing, already-shipped files (`cronograma-tab.tsx`'s inline "a tiempo" check and `gantt-tab.tsx`'s `actividadColor` are already two independent local copies of the same idea — this would be the third, matching established precedent, not a new anti-pattern). Extracting now is out of scope for an `S`-sized, UI-only change; if a fourth consumer appears, that is the right trigger to extract. |
| D4 | Indicator progress bars use `UmbralesSemaforo`'s new `indicador: { verde, amarillo }` band, resolved server-side via `resolverUmbrales` (`Setting["semaforo_umbrales"]` + `Proyecto.umbrales_override`) exactly like `tecnico`/`financiero`, and exposed as `color_indicador` on the GET/PATCH indicator responses — **corrected 2026-09-28** from the original local-hardcoded-threshold decision below | Keep a local, hardcoded threshold in `metas-tab.tsx` (the originally shipped decision, kept here for history) | The user rejected the hardcoded approach: coloring by a magic 90/60 baked into a component contradicts this repo's own established discipline (`colorTecnico`/`colorFinanciero` are the precedent, not `indicadores-tab.tsx`'s pre-existing `pct >= 100` shortcut, which itself predates this discipline and is not extended further). `budget/route.ts` is the concrete model: it resolves `umbrales` server-side and returns `color_financiero` verbatim for the client to render — `indicators/route.ts` now does the same for `color_indicador`. Backward compatibility for `Setting` rows saved before this change is handled by `getUmbralesSemaforo()`'s fallback-fill, so no migration is needed and no existing admin flow breaks. |
| D5 | "Medio de verificación" (`i.mv` in the mock) is omitted entirely — no field, no placeholder text | Show a static "—" or invented placeholder copy per indicator | `Indicador` (`prisma/schema.prisma`) has no column for this; the mock's sample values ("Informe de despliegue", "Encuestas aplicadas") are fixture data with no real source. Inventing a placeholder would either be misleading (implying data that isn't tracked) or dead UI. Per the "do not invent data or copy" constraint, this line is left out of the card until the field exists. |
| D6 | The Metas tab is inserted as the 2nd `TAB_VALUES` entry, right after `"resumen"`, matching v6's visual order exactly — **corrected 2026-09-28** from the original append-at-the-end decision below | Append Metas as the 8th entry (the originally shipped decision, kept here for history) | The user rejected the append-only precedent for this specific tab: v6's own mock places "Metas e indicadores" as the 2nd tab, and KPI 3's natural home in `resumen-tab.tsx` links there — matching that order now avoids a second, larger reordering PR later. The diff cost is one extra `TabsTrigger`/`TabsContent` line moved, not every existing pair rewritten; `project-workspace.test.tsx`'s per-tab assertions are unaffected by order, only by which array index each mount check reads. |
| D7 | `A{n}` activity-chip numbering is sequential across the **whole project** — computed once, in `useActivities`' own order (`fecha_planificada asc`, the same order Cronograma/Gantt already consume), before grouping by meta — **corrected 2026-09-28** from the original per-meta-reset numbering below | Reset numbering at `A1` for each meta's own activity list (the originally shipped assumption, kept here for history) | The user pointed out v6's own sample data numbers activities sequentially across the whole project (Meta 1 → A1-A6, Meta 2 → A7-A10), not per meta. Per-meta reset was an unstated assumption in the first pass, not a decision the mock or the Auditoría actually calls for. Global numbering also avoids two different metas ever showing the same code (`A1` appearing twice), which per-meta reset always does whenever a project has more than one meta with activities. |

## Data Model

No schema change. `Meta`/`Actividad`/`Indicador` (`prisma/schema.prisma`) are unchanged. `Indicador`'s response DTO (`src/hooks/projects.ts`, populated by `INDICATOR_SELECT`'s call sites) gains one derived, read-only field: `color_indicador: "verde" | "amarillo" | "rojo"`, computed server-side (see `## Technical Approach`, step 3) — never a database column.

`UmbralesSemaforo` (`src/lib/semaforo.ts`) gains the `indicador` band:

```ts
export type UmbralesSemaforo = {
  confirmado: boolean;
  tecnico: { verde: number; rojo: number };
  financiero: { verde_min: number; verde_max: number; amarillo_min: number; amarillo_max: number };
  /** D4 (corrected): KPI 3's per-indicator completion band, ratio-based
   * (same unit as tecnico/financiero) — verde >= indicador.verde, amarillo
   * >= indicador.amarillo, else rojo. */
  indicador: { verde: number; amarillo: number };
};

/** razon = valor_actual / meta_valor (0 when valor_actual is null or
 * meta_valor <= 0) — same "razon as ratio, not percentage" convention as
 * colorTecnico/colorFinanciero. */
export function colorIndicador(razon: number, u: UmbralesSemaforo): ColorSemaforo {
  if (razon >= u.indicador.verde) return "verde";
  if (razon >= u.indicador.amarillo) return "amarillo";
  return "rojo";
}
```

Client-side derivation, inside `metas-tab.tsx` — display-only, no color decisions:

```ts
import type { ColorSemaforo } from "@/lib/semaforo";

// D3 — same shape as gantt-tab.tsx's actividadColor, duplicated per that
// file's own documented precedent (a third local copy, not a new pattern).
function actividadColor(actividad: Actividad, today: Date): ColorSemaforo {
  if (actividad.porcentaje_avance >= 100) return "verde";
  const planificada = new Date(actividad.fecha_planificada);
  if (actividad.fecha_real) {
    return new Date(actividad.fecha_real) <= planificada ? "verde" : "rojo";
  }
  return today > planificada ? "rojo" : "amarillo";
}

// D4 (corrected) — server-side now. `indicador.color_indicador` comes from
// the GET/PATCH response (indicators/route.ts, `colorIndicador` in
// lib/semaforo.ts) and is rendered verbatim — this file computes NOTHING
// about the threshold. `indicadorPct` below is still needed client-side,
// purely for the progress bar's `width%` (a display detail, not a color
// decision).

function indicadorPct(indicador: Indicador): number {
  const meta = Number(indicador.meta_valor);
  if (indicador.valor_actual === null || meta <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(indicador.valor_actual) / meta) * 100));
}

// D7 (corrected) — sequential across the WHOLE project, assigned once over
// `actividades` in `useActivities`' own order (fecha_planificada asc) before
// grouping by meta, so two different metas never show the same code. Purely
// presentational — never persisted, never sent in a payload. Matches F1.4's
// own scope line, "actividades vinculadas por ID" (Auditoria v6.dc.html:253).
function actividadCodigos(actividades: Actividad[]): Map<string, string> {
  return new Map(actividades.map((a, index) => [a.id, `A${index + 1}`]));
}
```

These functions live once, in the tab component, purely for display — `indicadorColor`/`actividadColor` never feed back into a mutation.

## Component Structure

### `tabs/metas-tab.tsx`

- Loading state while `useGoals`/`useActivities`/`useIndicators` are pending: `"Cargando…"` (same copy as every sibling tab).
- Empty state (project has no metas): `"Este proyecto no tiene metas registradas todavía."`
- Populated: one card per `Meta` (mirrors the mock's card shape at `Muttu Hub v6.dc.html:606-617`):
  - Title: `meta.nombre`.
  - Activity chips row: one chip per `Actividad` whose `meta_id === meta.id`, label `{actividadCodigos.get(a.id)} · {porcentaje_avance}%` (project-wide sequential code, D7), dot colored via `actividadColor` (same `ColorSemaforo`→Tailwind token map as `gantt-tab.tsx`'s `BAR_COLOR`: `verde→bg-exito`, `amarillo→bg-alerta`, `rojo→bg-destructivo`). Empty state per card: `"Sin actividades vinculadas."`
  - Indicator rows: one per `Indicador` whose `meta_id === meta.id`, each showing `nombre`, `valor_actual`/`meta_valor`/`unidad` (same "Sin medir" fallback as `indicadores-tab.tsx` when `valor_actual` is `null`), a progress bar whose width is `indicadorPct(indicador)` and whose color is `indicador.color_indicador` (server-provided, D4 — rendered verbatim, same `BAR_COLOR` map), and an "Editar avance" icon button (`Pencil`, same `icon-sm` pattern as `indicadores-tab.tsx`) that opens `IndicadorFormDialog` pre-filled for that indicador. Empty state per card: `"Sin indicadores vinculados."`
- A single `IndicadorFormDialog` instance at the tab level, `open`/`indicador` state lifted the same way `indicadores-tab.tsx` already does it (`formOpen`, `editing`).

### `indicadores-tab.tsx`

One-line change: `function IndicadorFormDialog(...)` → `export function IndicadorFormDialog(...)`. No other line changes.

### `project-workspace.tsx`

```ts
const TAB_VALUES = [
  "resumen",
  "metas",
  "cronograma",
  "gantt",
  "indicadores",
  "financiero",
  "legalizacion",
  "soportes",
] as const;
```
Plus one `TabsTrigger`/`TabsContent` pair inserted right after `"resumen"`'s (D6), mirroring every existing tab's shape exactly.

## File Changes

| File | Change |
|---|---|
| `src/lib/semaforo.ts` | Modified — `indicador` band on `UmbralesSemaforo`, `colorIndicador`, merge in `resolverUmbrales` |
| `src/lib/semaforo.test.ts` | Modified — `colorIndicador` cases, `resolverUmbrales` merge of `indicador` |
| `src/lib/catalogs.ts` | Modified — `UMBRALES_SEMAFORO_DEFAULT.indicador` |
| `src/lib/settings.ts` | Modified — `getUmbralesSemaforo()` |
| `src/lib/settings.test.ts` | Modified — backward-compat fallback test |
| `src/app/api/v1/settings/route.ts` | Modified — PUT preserves stored `indicador` when omitted; GET returns it |
| `src/app/api/v1/settings/route.test.ts` | Modified |
| `src/app/api/v1/projects/[id]/indicators/route.ts` | Modified — GET adds `color_indicador` |
| `src/app/api/v1/projects/[id]/indicators/route.test.ts` | Modified |
| `src/app/api/v1/projects/[id]/indicators/[indicatorId]/route.ts` | Modified — GET/PATCH add `color_indicador` |
| `src/app/api/v1/projects/[id]/indicators/[indicatorId]/route.test.ts` | Modified |
| `src/hooks/projects.ts` | Modified — `Indicador.color_indicador` in the DTO |
| `src/components/proyectos/tabs/indicadores-tab.tsx` | Modified — export `IndicadorFormDialog` |
| `src/components/proyectos/tabs/metas-tab.tsx` | New — meta cards, activity chips, indicator rows with progress bar, "Editar avance" |
| `src/components/proyectos/tabs/metas-tab.test.tsx` | New |
| `src/components/proyectos/project-workspace.tsx` | Add `"metas"` tab as the 2nd tab |
| `src/components/proyectos/project-workspace.test.tsx` | Mock + assertions for the new tab, updated order |

## Testing Strategy

Strict TDD, RED before code for each of:

1. `semaforo.test.ts` — `colorIndicador` at/above/below the `indicador.verde`/`indicador.amarillo` cuts (mirrors the existing `colorTecnico` test shape); `resolverUmbrales` merges a partial `indicador` override and falls back to the organization's `indicador` band when the override omits it.
2. `settings.test.ts` — `getUmbralesSemaforo()` fills `indicador` from `UMBRALES_SEMAFORO_DEFAULT` when the stored setting predates this change (no `indicador` key at all).
3. `settings/route.test.ts` — PUT with `semaforo_umbrales` omitting `indicador` preserves the previously-stored `indicador` (not dropped to `undefined`); PUT with an explicit `indicador` saves it; GET always returns an `indicador` band, backfilled for an old stored row.
4. `indicators/route.test.ts` (GET) and `indicators/[indicatorId]/route.test.ts` (GET/PATCH) — response includes `color_indicador` computed from `resolverUmbrales`; a project's `umbrales_override.indicador` overrides the organization default; an indicator with `valor_actual: null` returns `color_indicador: "rojo"`.
5. `metas-tab.test.tsx` — loading/empty/populated states at the tab level; a meta renders its activity chips with the right project-wide sequential `A{n} · pct%` label (two metas' activities never share a code) and color (verde/amarillo/rojo per `actividadColor`'s cases: `porcentaje_avance >= 100`, on-time `fecha_real`, late `fecha_real`, still-pending past/before línea base); a meta with no activities shows its per-card empty state; an indicator renders `valor_actual/meta_valor unidad` with "Sin medir" when `valor_actual` is `null`, and its progress bar color is taken verbatim from the mocked `indicador.color_indicador` (never recomputed client-side); a meta with no indicators shows its per-card empty state; clicking "Editar avance" opens `IndicadorFormDialog` pre-filled with that indicador's values (mock `useUpdateIndicator`, assert `mutateAsync` called with the edited `valor_actual` on submit).
6. `project-workspace.test.tsx` — extend for the `"metas"` tab at its new 2nd position (mount-only-when-selected, mirrors every existing per-tab assertion).

No new tests needed in `indicadores-tab.test.tsx` — the `export` addition has no observable behavior change for that file's existing suite; its correctness for the new consumer is exercised by `metas-tab.test.tsx`'s import succeeding and its dialog-integration assertions above.

## Risks

Same as proposal.md's Risks table, plus:

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Un `Setting["semaforo_umbrales"]` guardado antes de este change no trae `indicador` — `colorIndicador` podría recibir `undefined.verde` | Media (todo ambiente con datos previos a este change) | `getUmbralesSemaforo()` rellena la banda con el default de organización antes de que cualquier ruta la use; probado explícitamente en `settings.test.ts` |
| El PUT de `/api/v1/settings` podría borrar `indicador` cuando `UmbralesSection` (sin UI para esa banda) hace `save` con el payload que arma hoy | Alta si no se corrige | El PUT preserva el `indicador` ya guardado cuando el body lo omite, en vez de reemplazar todo el objeto — probado en `settings/route.test.ts` |

## Assumptions Taken (not resolved by the proposal)

- The Metas tab renders as a stacked card list (not a wide table) — matches the v6 mock's own card shape for this screen (`Muttu Hub v6.dc.html:603-621`), and is consistent with `soportes-tab.tsx`'s precedent for non-tabular, non-financial data.
- No client-side gating of "Editar avance" on `puede_editar_proyecto` — `legalizacion-tab.tsx`/`soportes-tab.tsx` (the two most recent siblings) don't gate their write CTAs client-side either, relying on the server's `canManageProject` 403. This change follows the same established precedent; a 403 from `useUpdateIndicator` surfaces via its existing `toast.error` handling.

## Open Questions

None blocking implementation. D4, D6 and D7 were corrected 2026-09-28 per explicit user feedback (see each decision's rationale above); "medio de verificación" and KPI-card click-through remain out of scope (proposal.md's Scope/Out).
