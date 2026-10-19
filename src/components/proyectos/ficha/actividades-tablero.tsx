// Vista Tablero de la pestaña Actividades (U5): un kanban de SOLO LECTURA derivado del estado técnico. La
// columna de cada actividad sale de `columnaTablero` (regla pura y compartida con "Requiere atención");
// no hay arrastre, ni escritura, ni relación con el modelo `Tarea` del CRM. El color del semáforo llega del
// servidor y aquí solo se pinta (D11).

"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  useProjectMembers,
  useProjectObjectives,
  useProjectTechnicalStatus,
  type ColorSemaforo,
  type ProjectActivity,
  type ProjectListRow,
} from "@/hooks/projects";
import { COLUMNAS_TABLERO, columnaTablero, type ColumnaTablero } from "@/lib/proyectos/estado-actividad";
import { weekEnd } from "@/lib/proyectos/weeks";

const LOAD_ERROR = "No pudimos cargar el tablero de actividades. Inténtalo de nuevo.";

const COLUMNA_TITULO: Record<ColumnaTablero, string> = {
  por_iniciar: "Por iniciar",
  en_curso: "En curso",
  atrasada: "Atrasada",
  terminada: "Terminada",
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

type Tarjeta = {
  id: string;
  codigo: string;
  nombre: string;
  objetivo: string;
  responsable: string | null;
  real: number;
  plan: number | null;
  color: ColorSemaforo | null;
};

/** Last day of the activity: its own date, or the end of its last week when it has none. */
function finDe(actividad: ProjectActivity, inicioProyecto: string | null): string | null {
  if (actividad.fecha_fin) return actividad.fecha_fin.slice(0, 10);
  if (!inicioProyecto) return null;
  try {
    return weekEnd(inicioProyecto.slice(0, 10), actividad.semana_fin);
  } catch {
    return null;
  }
}

export function ActividadesTablero({
  proyecto,
  onAbrirActividad,
}: {
  proyecto: ProjectListRow;
  /** Click or Enter on a card: the parent switches to the Lista and focuses that activity. */
  onAbrirActividad: (actividadId: string) => void;
}) {
  const actividades = useProjectActivities(proyecto.id);
  const objetivos = useProjectObjectives(proyecto.id);
  const tecnico = useProjectTechnicalStatus(proyecto.id);
  const miembros = useProjectMembers(proyecto.id);

  const error = actividades.error ?? tecnico.error;
  if (error) {
    return (
      <div data-testid="tablero">
        <InlineError message={errorMessage(error, LOAD_ERROR)} className="mt-1.5" />
      </div>
    );
  }
  if (!actividades.data || !tecnico.data) {
    return (
      <div data-testid="tablero" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-[14px]" />
        ))}
      </div>
    );
  }
  if (actividades.data.length === 0) {
    return (
      <div data-testid="tablero">
        <EmptyBlock>Este proyecto todavía no tiene actividades.</EmptyBlock>
      </div>
    );
  }

  const corte = tecnico.data.corte.slice(0, 10);
  const tecnicas = new Map(tecnico.data.actividades.map((actividad) => [actividad.id, actividad]));
  const codigoObjetivo = new Map((objetivos.data ?? []).map((objetivo) => [objetivo.id, objetivo.codigo]));
  const nombreMiembro = new Map((miembros.data ?? []).map((miembro) => [miembro.usuario.id, miembro.usuario.nombre]));

  const columnas = new Map<ColumnaTablero, Tarjeta[]>(COLUMNAS_TABLERO.map((columna) => [columna, []]));
  for (const actividad of actividades.data) {
    const tecnica = tecnicas.get(actividad.id);
    const progreso = tecnica?.progreso ?? 0;
    const color = tecnica?.color ?? null;
    const columna = columnaTablero({ progreso, color, fin: finDe(actividad, proyecto.fecha_inicio), corte });
    columnas.get(columna)!.push({
      id: actividad.id,
      codigo: actividad.codigo,
      nombre: actividad.nombre,
      objetivo: codigoObjetivo.get(actividad.objetivo_id) ?? tecnica?.objetivo_codigo ?? "",
      responsable: actividad.responsable_id ? (nombreMiembro.get(actividad.responsable_id) ?? null) : null,
      real: progreso,
      plan: tecnica?.programado ?? null,
      color,
    });
  }

  return (
    <div data-testid="tablero" className="min-w-0 overflow-x-auto pb-1">
      <div className="grid min-w-[44rem] grid-cols-4 gap-3">
        {COLUMNAS_TABLERO.map((columna) => {
          const tarjetas = columnas.get(columna)!;
          return (
            <section
              key={columna}
              data-testid={`tablero-col-${columna}`}
              className="flex min-w-0 flex-col gap-2 rounded-inner bg-ink-100/60 p-2"
            >
              <h4 className="px-1 text-[12.5px] font-semibold text-ink-800">
                {COLUMNA_TITULO[columna]} <span className="font-normal text-ink-500 tabular-nums">{tarjetas.length}</span>
              </h4>
              <ul className="flex flex-col gap-2">
                {tarjetas.map((tarjeta) => (
                  <li key={tarjeta.id}>
                    <TarjetaActividad tarjeta={tarjeta} onAbrir={() => onAbrirActividad(tarjeta.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaActividad({ tarjeta, onAbrir }: { tarjeta: Tarjeta; onAbrir: () => void }) {
  return (
    <button
      type="button"
      data-testid="tablero-tarjeta"
      onClick={onAbrir}
      className="flex min-h-11 w-full min-w-0 flex-col gap-1.5 rounded-inner border border-border bg-panel p-2.5 text-left outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-[13px] text-ink-900">
        <span className="font-mono text-[11px] text-ink-500 tabular-nums">{tarjeta.codigo}</span>{" "}
        <span className="font-semibold">{tarjeta.nombre}</span>
      </span>
      {tarjeta.objetivo && <span className="text-[12px] text-ink-600">Objetivo {tarjeta.objetivo}</span>}
      {tarjeta.responsable && <span className="text-[12px] text-ink-600">{tarjeta.responsable}</span>}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-700 tabular-nums">
        <span>{nf.format(tarjeta.real)} % real</span>
        {tarjeta.plan !== null && <span>{nf.format(tarjeta.plan)} % plan</span>}
        {tarjeta.color && <SemaforoChip color={tarjeta.color} />}
      </span>
    </button>
  );
}
