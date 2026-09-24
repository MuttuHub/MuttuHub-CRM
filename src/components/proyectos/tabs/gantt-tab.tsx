// gestion-proyectos-workspace, Phase 6 (project-workspace.tsx's Gantt tab,
// owned by Phases 5-7 per the workspace's original comment). View-only
// visualization only — no drag-and-drop, no inline editing (spec.md scope).
// Reuses the SAME `useGoals`/`useActivities` reads the Cronograma tab already
// fetches (`tabs/cronograma-tab.tsx`) instead of adding a new hook: both
// tabs read the exact same TanStack Query cache entry, so switching tabs
// never re-fetches.
//
// No charting library dependency: `package.json` has none in use elsewhere
// (`src/components/dashboard/curve-s-chart.tsx` is a hand-rolled SVG line,
// `tacometro.tsx` a hand-rolled SVG gauge), so this stays plain flex/CSS —
// consistent with that module's own "no measurement, pure computed %"
// discipline.
//
// Bar color reuses the exact `ColorSemaforo` palette convention already
// established by `tacometro.tsx`/`kpi-cards.tsx` (verde/amarillo/rojo ->
// exito/alerta/destructivo Tailwind tokens) — this file does NOT invent a
// new color scale. Per-actividad status (not the aggregate `colorTecnico`
// ratio from `lib/semaforo.ts`, which needs org-wide `UmbralesSemaforo` this
// tab doesn't have) mirrors the exact "a tiempo" comparison
// `tabs/cronograma-tab.tsx` already uses (`fecha_real <= fecha_planificada`),
// extended with a "still pending, past its línea base" red state for the
// Gantt's forward-looking view.

"use client";

import { cn } from "@/lib/utils";
import { formatFecha } from "@/hooks/crm";
import { useActivities, useGoals, type Actividad, type Meta } from "@/hooks/projects";
import type { ColorSemaforo } from "@/lib/semaforo";

const BAR_COLOR: Record<ColorSemaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-alerta",
  rojo: "bg-destructivo",
};

const MARKER_COLOR: Record<ColorSemaforo, string> = {
  verde: "border-exito",
  amarillo: "border-alerta",
  rojo: "border-destructivo",
};

// C10 fix (WCAG 1.4.1 Use of Color): color was the only signal for a bar's
// status. This text label backs every color both in a legend and per-bar
// (title/aria-label), so the status is available without perceiving color.
const STATUS_LABEL: Record<ColorSemaforo, string> = {
  verde: "A tiempo",
  amarillo: "Pendiente",
  rojo: "Atrasado",
};

/** Reuses the exact "a tiempo" comparison `CronogramaTab` already uses
 * (`fecha_real <= fecha_planificada`); a still-pending actividad whose línea
 * base already passed is treated as late (rojo), otherwise on-track
 * (amarillo) — same "no fecha_real yet = unresolved" reading, just resolved
 * forward instead of left as a neutral `null`. */
function actividadColor(actividad: Actividad, today: Date): ColorSemaforo {
  if (actividad.porcentaje_avance >= 100) return "verde";
  const planificada = new Date(actividad.fecha_planificada);
  if (actividad.fecha_real) {
    return new Date(actividad.fecha_real) <= planificada ? "verde" : "rojo";
  }
  return today > planificada ? "rojo" : "amarillo";
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

export function GanttTab({ projectId }: { projectId: string }) {
  const goalsQuery = useGoals(projectId);
  const activitiesQuery = useActivities(projectId);
  const metas = goalsQuery.data ?? [];
  const actividades = activitiesQuery.data ?? [];

  if (activitiesQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }
  if (actividades.length === 0) {
    return <p className="text-[12.5px] text-ink-600">Este proyecto no tiene actividades todavía.</p>;
  }

  const today = new Date();
  const dates: Date[] = [today];
  for (const a of actividades) {
    dates.push(new Date(a.fecha_planificada));
    if (a.fecha_real) dates.push(new Date(a.fecha_real));
  }
  const minTime = Math.min(...dates.map((d) => d.getTime()));
  const maxTime = Math.max(...dates.map((d) => d.getTime()));
  // Guard against a zero-width span (single date across every actividad):
  // falls back to a 1-day span so every point resolves to a valid, non-NaN %.
  const span = Math.max(maxTime - minTime, 24 * 60 * 60 * 1000);
  const pct = (d: Date) => clampPct(((d.getTime() - minTime) / span) * 100);

  const metaNombre = new Map(metas.map((m: Meta) => [m.id, m.nombre]));
  const actividadesPorMeta = new Map<string, Actividad[]>();
  for (const a of actividades) {
    const grupo = actividadesPorMeta.get(a.meta_id) ?? [];
    grupo.push(a);
    actividadesPorMeta.set(a.meta_id, grupo);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-[11.5px] text-ink-500">
        <span>{formatFecha(new Date(minTime).toISOString())}</span>
        <span>{formatFecha(new Date(maxTime).toISOString())}</span>
      </div>

      {/* C10 fix (WCAG 1.4.1 Use of Color): the bar color below is not the
          only way to read a status — this legend backs every color with
          text, same pattern as `curve-s-chart.tsx`'s legend row. */}
      <div className="flex items-center gap-3 text-[12px] text-ink-600">
        {(Object.keys(STATUS_LABEL) as ColorSemaforo[]).map((color) => (
          <span key={color} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", BAR_COLOR[color])} />
            <span>{STATUS_LABEL[color]}</span>
          </span>
        ))}
      </div>

      {[...actividadesPorMeta.entries()].map(([metaId, grupo]) => (
        <div key={metaId} className="flex flex-col gap-2">
          <p className="text-[12px] font-bold tracking-[0.04em] text-ink-500 uppercase">
            {metaNombre.get(metaId) ?? "Sin meta"}
          </p>
          <div className="flex flex-col gap-2">
            {grupo.map((actividad) => {
              const color = actividadColor(actividad, today);
              const planPct = pct(new Date(actividad.fecha_planificada));
              const endDate = actividad.fecha_real ? new Date(actividad.fecha_real) : today;
              const endPct = pct(endDate);
              const left = Math.min(planPct, endPct);
              const width = Math.max(Math.abs(endPct - planPct), 1.5);

              return (
                // Mobile: column layout so the label gets its own full-width
                // line (fixed w-40 + w-10 + gap-3 = 224px was eating almost
                // all of a 390px viewport before the flex-1 bar even started
                // — the bar was left with only a 2-4px sliver). From `sm:` up,
                // this restores the original single-row layout exactly.
                <div key={actividad.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <p
                    className="w-full truncate text-[12.5px] font-medium text-ink-800 sm:w-40 sm:shrink-0"
                    title={actividad.nombre}
                  >
                    {actividad.nombre}
                  </p>
                  {/* `sm:contents` drops this wrapper from the box tree at
                      `sm:` and up, so the bar track and % badge become direct
                      flex children of the row above — byte-for-byte the same
                      desktop layout as before this fix. On mobile it just
                      keeps bar+% together on the second line. */}
                  <div className="flex items-center gap-2 sm:contents">
                    <div className="relative h-6 flex-1 rounded-6 bg-ink-100">
                      <div
                        data-testid="gantt-bar"
                        data-color={color}
                        title={STATUS_LABEL[color]}
                        aria-label={STATUS_LABEL[color]}
                        className={cn("absolute top-0.5 h-5 rounded-6", BAR_COLOR[color])}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                      <div
                        data-testid="gantt-marker"
                        className={cn("absolute top-0 h-6 w-0 border-l-2", MARKER_COLOR[color])}
                        style={{ left: `${planPct}%` }}
                        title={`Línea base: ${formatFecha(actividad.fecha_planificada)}`}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[11.5px] font-bold text-ink-700">
                      {actividad.porcentaje_avance}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
