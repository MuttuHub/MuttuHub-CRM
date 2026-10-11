// Cronograma del proyecto (S14 P4): vista de solo lectura de las actividades
// agrupadas por su semana de inicio, con las fechas derivadas y las semanas de
// cada una. Reutiliza el resumen de solo lectura de `estructura-actividades`
// (misma marca, sin acciones) y las mismas queries que el Gantt; no expone
// ningún control de escritura. La unidad P6 la enriquecerá con el estado técnico
// por actividad (programado, días, al corte, color, soporte).

"use client";

import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivitySummary } from "@/components/proyectos/estructura-actividades";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  type ProjectActivity,
  type ProjectListRow,
} from "@/hooks/projects";

const LOAD_ERROR = "No pudimos cargar el cronograma. Inténtalo de nuevo.";

export type SemanaGrupo = { semana: number; actividades: ProjectActivity[] };

/**
 * Agrupa las actividades por la semana en que empiezan (`semana_inicio`), en
 * orden ascendente; dentro de cada semana, por código. Es puro y estable para
 * que la vista agrupada sea predecible.
 */
export function agruparPorSemana(actividades: readonly ProjectActivity[]): SemanaGrupo[] {
  return [...actividades]
    .sort((a, b) => a.semana_inicio - b.semana_inicio || a.codigo.localeCompare(b.codigo, "es"))
    .reduce<SemanaGrupo[]>((grupos, actividad) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.semana === actividad.semana_inicio) ultimo.actividades.push(actividad);
      else grupos.push({ semana: actividad.semana_inicio, actividades: [actividad] });
      return grupos;
    }, []);
}

export function ProjectCronograma({ proyecto }: { proyecto: ProjectListRow }) {
  const query = useProjectActivities(proyecto.id);

  return (
    <section data-testid="cronograma">
      <SectionHeader icon={<CalendarDays className="size-3.5" strokeWidth={2} />}>
        Cronograma
      </SectionHeader>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, LOAD_ERROR)} className="mt-1.5" />
      ) : !query.data ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
          ))}
        </div>
      ) : query.data.length === 0 ? (
        <EmptyBlock>Este proyecto todavía no tiene actividades.</EmptyBlock>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          {agruparPorSemana(query.data).map((grupo) => (
            <section key={grupo.semana} data-testid={`cronograma-semana-${grupo.semana}`}>
              <h4 className="text-[12px] font-bold text-ink-600">Semana {grupo.semana}</h4>
              <ul className="mt-1.5 flex flex-col gap-2">
                {grupo.actividades.map((actividad) => (
                  <li
                    key={actividad.id}
                    data-testid="cronograma-actividad"
                    className="rounded-inner border border-border bg-panel p-2.5"
                  >
                    <ActivitySummary actividad={actividad} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
