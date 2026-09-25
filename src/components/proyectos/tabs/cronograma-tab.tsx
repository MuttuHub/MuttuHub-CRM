// gestion-proyectos-workspace, Phase 5 (design.md's Cronograma tab, owned by
// Phases 5-7 per project-workspace.tsx's original comment). Adapted from the
// dead-code `CronogramaTab` in `project-sheet.tsx` (that Dialog-based ficha is
// not wired into any route — confirmed via `rg -l "from.*project-sheet" src`
// returning only its own test file). Behavior is unchanged: same
// `useGoals`/`useActivities` reads, same "línea base vs. real" row markup,
// only the file location and export site move to match the
// `tabs/resumen-tab.tsx` pattern (`{ projectId: string }` prop, no Dialog
// wrapper — the workspace's own `Tabs` already supplies the chrome).

"use client";

import { cn } from "@/lib/utils";
import { formatFecha } from "@/hooks/crm";
import { useActivities, useGoals, type Actividad, type Meta } from "@/hooks/projects";

export function CronogramaTab({ projectId }: { projectId: string }) {
  const goalsQuery = useGoals(projectId);
  const activitiesQuery = useActivities(projectId);
  const metas = goalsQuery.data ?? [];
  const actividades = activitiesQuery.data ?? [];
  const metaNombre = new Map(metas.map((m: Meta) => [m.id, m.nombre]));

  if (activitiesQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }
  if (actividades.length === 0) {
    return <p className="text-[12.5px] text-ink-600">Este proyecto no tiene actividades todavía.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {actividades.map((actividad: Actividad) => {
        const aTiempo = actividad.fecha_real
          ? new Date(actividad.fecha_real) <= new Date(actividad.fecha_planificada)
          : null;
        return (
          <div
            key={actividad.id}
            className="flex flex-col gap-1.5 rounded-14 border border-ink-200 bg-panel px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink-950">{actividad.nombre}</p>
              <span className="text-[12px] font-bold text-ink-700">{actividad.porcentaje_avance}%</span>
            </div>
            <p className="text-[11.5px] text-ink-600">
              Meta: {metaNombre.get(actividad.meta_id) ?? "—"}
            </p>
            <div className="flex items-center gap-4 text-[12px] text-ink-600">
              <span>Línea base: {formatFecha(actividad.fecha_planificada)}</span>
              <span
                className={cn(
                  "font-medium",
                  aTiempo === true && "text-exito",
                  aTiempo === false && "text-destructivo",
                )}
              >
                Real: {formatFecha(actividad.fecha_real)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
