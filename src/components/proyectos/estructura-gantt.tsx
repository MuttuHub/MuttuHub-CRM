// Cronograma por semanas (S3.6b, RF-08): una barra por actividad, de
// `semana_inicio` a `semana_fin`, agrupadas por objetivo, en una grilla CSS con
// una columna por semana rotulada con la fecha de inicio de esa semana. Es de
// solo lectura para todos los que pueden leer la ficha: no tiene controles y no
// usa ninguna API nueva (reutiliza las queries de objetivos y actividades). El
// cálculo de columnas vive en `ganttLayout` (puro, con sus pruebas).

"use client";

import { ChartGantt, Scale, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import {
  useProjectActivities,
  useProjectObjectives,
  type ProjectActivity,
  type ProjectListRow,
  type ProjectObjective,
} from "@/hooks/projects";
import { ganttLayout, type GanttBarra } from "@/lib/proyectos/gantt";
import { weekStart } from "@/lib/proyectos/weeks";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/proyectos/ui";

const LOAD_ERROR = "No pudimos cargar el cronograma. Inténtalo de nuevo.";
/** Ancho mínimo de una columna de semana: por debajo, la grilla se desplaza en horizontal. */
const MIN_COLUMNA_PX = 48;

const MES_CORTO = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });

/** "5 ene": inicio de la semana `n` (calendario UTC, sin desfase por zona horaria). */
function etiquetaSemana(fechaInicio: string, semana: number): string {
  const [year, month, day] = weekStart(fechaInicio, semana).split("-").map(Number);
  const mes = MES_CORTO.format(new Date(Date.UTC(year, month - 1, day))).replace(".", "");
  return `${day} ${mes}`;
}

export function EstructuraGantt({ proyecto }: { proyecto: ProjectListRow }) {
  const objetivos = useProjectObjectives(proyecto.id);
  const actividades = useProjectActivities(proyecto.id);

  return (
    <div data-testid="gantt" className="mt-4">
      <SectionHeader as="h4" icon={<ChartGantt className="size-3.5" strokeWidth={2} />}>Cronograma por semanas</SectionHeader>
      <GanttBody
        proyecto={proyecto}
        objetivos={objetivos.data}
        actividades={actividades.data}
        error={objetivos.error ?? actividades.error}
      />
    </div>
  );
}

function GanttBody({
  proyecto,
  objetivos,
  actividades,
  error,
}: {
  proyecto: ProjectListRow;
  objetivos: ProjectObjective[] | undefined;
  actividades: ProjectActivity[] | undefined;
  error: unknown;
}) {
  // La lista de objetivos de arriba ya muestra el error como alerta: aquí solo
  // un aviso en texto, para no duplicar el rol "alert".
  if (error) return <p className="mt-1.5 text-[13px] text-ink-500">{LOAD_ERROR}</p>;
  if (!objetivos || !actividades) return <Skeleton className="mt-2 h-24 w-full rounded-[14px]" />;

  const fechaInicio = proyecto.fecha_inicio;
  if (fechaInicio === null || proyecto.duracion_semanas === null) {
    return (
      <p className="mt-1.5 text-[13px] text-ink-500">
        Define las fechas del proyecto para ver el cronograma.
      </p>
    );
  }

  const layout = ganttLayout(actividades, proyecto.duracion_semanas);
  if (layout.barras.length === 0) {
    return (
      <p className="mt-1.5 text-[13px] text-ink-500">
        Aún no hay actividades para mostrar en el cronograma.
      </p>
    );
  }

  const columnas = { gridTemplateColumns: `repeat(${layout.totalSemanas}, minmax(0, 1fr))` };
  const porActividad = new Map(actividades.map((a) => [a.id, a]));
  const grupos = [...objetivos]
    .sort((a, b) => a.orden - b.orden)
    .map((objetivo) => ({
      objetivo,
      barras: layout.barras.filter((b) => b.objetivoId === objetivo.id),
    }))
    .filter((grupo) => grupo.barras.length > 0);

  return (
    <div className="mt-2 overflow-x-auto rounded-inner border border-border bg-panel p-3">
      <div style={{ minWidth: layout.totalSemanas * MIN_COLUMNA_PX }}>
        <div data-testid="gantt-header" className="grid gap-px" style={columnas}>
          {Array.from({ length: layout.totalSemanas }, (_, i) => i + 1).map((semana) => (
            <div
              key={semana}
              className={cn(
                "flex flex-col items-center text-[10.5px] leading-tight",
                semana > layout.duracionSemanas ? "text-destructivo" : "text-ink-600",
              )}
            >
              <span className="font-mono font-bold tabular-nums">S{semana}</span>
              <span className="tabular-nums">{etiquetaSemana(fechaInicio, semana)}</span>
            </div>
          ))}
        </div>

        {grupos.map(({ objetivo, barras }) => (
          <div key={objetivo.id} data-testid={`gantt-grupo-${objetivo.id}`} className="mt-3">
            <p className="text-[11.5px] font-bold text-ink-700" title={objetivo.descripcion}>
              <span>{objetivo.codigo}</span>
            </p>
            <div className="mt-1 flex flex-col gap-1">
              {barras.map((barra) => (
                <div key={barra.id} className="grid gap-px" style={columnas}>
                  <Barra barra={barra} actividad={porActividad.get(barra.id)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Barra({ barra, actividad }: { barra: GanttBarra; actividad: ProjectActivity | undefined }) {
  const fechas = actividad
    ? `${formatFechaCalendario(actividad.fecha_inicio)} – ${formatFechaCalendario(actividad.fecha_fin)}`
    : "";
  return (
    <div
      data-testid={`gantt-bar-${barra.id}`}
      data-fuera={barra.fueraDeDuracion ? "true" : undefined}
      title={`${barra.nombre} · semanas ${barra.semanaInicio}–${barra.semanaFin}${fechas ? ` · ${fechas}` : ""}`}
      style={{ gridColumn: `${barra.columnaInicio} / ${barra.columnaFin}` }}
      className={cn(
        "flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
        barra.fueraDeDuracion
          ? "border border-destructivo/50 bg-destructivo-bg text-destructivo"
          : "border border-rose-200 bg-rose-100 text-rose-700 dark:text-rose-400",
      )}
    >
      <span className="truncate">{barra.codigo}</span>
      {barra.pesoManual && (
        <Scale aria-label="Peso manual" className="size-3 shrink-0" strokeWidth={2} />
      )}
      {barra.fueraDeDuracion && (
        <TriangleAlert
          aria-label="Fuera de la duración del proyecto"
          className="size-3 shrink-0"
          strokeWidth={2}
        />
      )}
    </div>
  );
}
