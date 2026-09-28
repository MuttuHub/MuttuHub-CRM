// proyecto-metas-tab (F1.4, RF-02, KPI 3), Slice B (design.md "Component
// Structure" — `tabs/metas-tab.tsx`, read-only): one card per Meta with its
// linked Actividad chips and Indicador rows. Follows `tabs/soportes-tab.tsx`'s
// pattern: "use client", no Dialog/Card wrapper of its own (the workspace's
// `<Tabs>` already supplies the chrome), explicit loading/empty/populated
// states.
//
// D4 (corrected — proposal.md/design.md): indicator progress-bar color is
// `indicador.color_indicador`, computed server-side (indicators/route.ts via
// `lib/semaforo.ts`'s `colorIndicador` + `resolverUmbrales`) and rendered
// here VERBATIM — this file performs zero threshold math.
//
// D3: activity-chip color reuses `gantt-tab.tsx`'s own `actividadColor`
// shape, duplicated locally per that file's own documented precedent (a
// third local copy, not a new pattern) — `useActivities`/`useGoals` don't
// carry `UmbralesSemaforo` context this tab would need to call `colorTecnico`.
//
// D7 (corrected): `A{n}` activity codes are sequential across the WHOLE
// project — assigned once over `useActivities`' own order (`fecha_planificada
// asc`, the same order Cronograma/Gantt already consume) — before grouping by
// meta, so two different metas never show the same code. Purely
// presentational: never persisted, never sent in a payload.

"use client";

import { cn } from "@/lib/utils";
import { useActivities, useGoals, useIndicators, type Actividad, type Indicador, type Meta } from "@/hooks/projects";
import type { ColorSemaforo } from "@/lib/semaforo";

const DOT_COLOR: Record<ColorSemaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-alerta",
  rojo: "bg-destructivo",
};

const BAR_COLOR: Record<ColorSemaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-alerta",
  rojo: "bg-destructivo",
};

/** Reuses the exact "a tiempo" comparison `gantt-tab.tsx`'s `actividadColor`
 * already uses (see this file's header comment, D3). */
function actividadColor(actividad: Actividad, today: Date): ColorSemaforo {
  if (actividad.porcentaje_avance >= 100) return "verde";
  const planificada = new Date(actividad.fecha_planificada);
  if (actividad.fecha_real) {
    return new Date(actividad.fecha_real) <= planificada ? "verde" : "rojo";
  }
  return today > planificada ? "rojo" : "amarillo";
}

/** D7: project-wide sequential code, assigned once over `actividades` in its
 * own (`fecha_planificada asc`) order, before any per-meta grouping. */
function actividadCodigos(actividades: Actividad[]): Map<string, string> {
  return new Map(actividades.map((a, index) => [a.id, `A${index + 1}`]));
}

/** Display-only percentage for the progress bar's width — NOT a color
 * decision (D4: color comes from `indicador.color_indicador`, verbatim). */
function indicadorPct(indicador: Indicador): number {
  const meta = Number(indicador.meta_valor);
  if (indicador.valor_actual === null || meta <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(indicador.valor_actual) / meta) * 100));
}

function ActividadChip({
  actividad,
  codigo,
  today,
}: {
  actividad: Actividad;
  codigo: string;
  today: Date;
}) {
  const color = actividadColor(actividad, today);
  return (
    <span
      data-testid="meta-actividad-chip"
      data-color={color}
      title={actividad.nombre}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-panel px-2.5 py-1 text-[11.5px] font-medium text-ink-700"
    >
      <span className={cn("size-2 rounded-full", DOT_COLOR[color])} />
      {codigo} · {actividad.porcentaje_avance}%
    </span>
  );
}

function IndicadorRow({ indicador }: { indicador: Indicador }) {
  const pct = indicadorPct(indicador);
  const meta = indicador.meta_valor > 0 ? indicador.meta_valor : 0;
  return (
    <li className="flex flex-col gap-1.5">
      <p className="text-[12.5px] font-medium text-ink-800">{indicador.nombre}</p>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div
            data-testid="indicador-progreso"
            data-color={indicador.color_indicador}
            className={cn("h-full rounded-full", BAR_COLOR[indicador.color_indicador])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="shrink-0 text-[12px] font-medium text-ink-600">
          {indicador.valor_actual === null ? "Sin medir" : indicador.valor_actual.toLocaleString()} /{" "}
          {meta.toLocaleString()} {indicador.unidad}
        </p>
      </div>
    </li>
  );
}

function MetaCard({
  meta,
  actividades,
  indicadores,
  codigos,
  today,
}: {
  meta: Meta;
  actividades: Actividad[];
  indicadores: Indicador[];
  codigos: Map<string, string>;
  today: Date;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-14 border border-ink-200 bg-panel px-4 py-3">
      <p className="text-[13.5px] font-semibold text-ink-950">{meta.nombre}</p>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold tracking-[0.04em] text-ink-500 uppercase">Actividades</p>
        {actividades.length === 0 ? (
          <p className="text-[12.5px] text-ink-600">Sin actividades vinculadas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actividades.map((actividad) => (
              <ActividadChip
                key={actividad.id}
                actividad={actividad}
                codigo={codigos.get(actividad.id) ?? "—"}
                today={today}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold tracking-[0.04em] text-ink-500 uppercase">Indicadores</p>
        {indicadores.length === 0 ? (
          <p className="text-[12.5px] text-ink-600">Sin indicadores vinculados.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {indicadores.map((indicador) => (
              <IndicadorRow key={indicador.id} indicador={indicador} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MetasTab({ projectId }: { projectId: string }) {
  const goalsQuery = useGoals(projectId);
  const activitiesQuery = useActivities(projectId);
  const indicatorsQuery = useIndicators(projectId);

  if (goalsQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }

  const metas = goalsQuery.data ?? [];
  if (metas.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-600">Este proyecto no tiene metas registradas todavía.</p>
    );
  }

  const actividades = activitiesQuery.data ?? [];
  const indicadores = indicatorsQuery.data ?? [];
  const codigos = actividadCodigos(actividades);
  const today = new Date();

  return (
    <div className="flex flex-col gap-3">
      {metas.map((meta) => (
        <MetaCard
          key={meta.id}
          meta={meta}
          actividades={actividades.filter((a) => a.meta_id === meta.id)}
          indicadores={indicadores.filter((i) => i.meta_id === meta.id)}
          codigos={codigos}
          today={today}
        />
      ))}
    </div>
  );
}
