// Sección "Ejecución técnica" de la ficha (S4 U6). Solo lectura: resumen con el
// semáforo que calcula el servidor y, por actividad, su avance con los
// entregables (meta, contado y avances pendientes de soporte). En BORRADOR el
// proyecto aún no tiene línea base, así que solo se explica, sin leer nada.

"use client";

import { Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError, errorMessage } from "@/components/proyectos/estructura-ui";
import { EjecucionAvance } from "@/components/proyectos/ejecucion-avance";
import { SemaforoTecnico } from "@/components/proyectos/semaforo-tecnico";
import {
  useDeliverableProgress,
  useProjectActivities,
  useProjectDeliverables,
  useProjectTechnicalStatus,
  type ProjectDeliverableProgress,
  type ProjectListRow,
} from "@/hooks/projects";

const TECNICO_ERROR = "No pudimos cargar el semáforo técnico. Inténtalo de nuevo.";
const ACTIVIDADES_ERROR = "No pudimos cargar las actividades. Inténtalo de nuevo.";

export const EJECUCION_BORRADOR_HINT =
  "La ejecución técnica estará disponible cuando el proyecto tenga su línea base aprobada.";

export function ProjectEjecucion({ proyecto }: { proyecto: ProjectListRow }) {
  if (proyecto.estado === "BORRADOR") {
    return (
      <section data-testid="ejecucion">
        <SectionHeader />
        <p className="mt-1.5 text-[12.5px] text-ink-500">{EJECUCION_BORRADOR_HINT}</p>
      </section>
    );
  }

  return (
    <section data-testid="ejecucion">
      <SectionHeader />
      <EjecucionContent proyecto={proyecto} />
    </section>
  );
}

function SectionHeader() {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
      <Gauge className="size-3.5" strokeWidth={2} />
      Ejecución técnica
    </h3>
  );
}

function EjecucionContent({ proyecto }: { proyecto: ProjectListRow }) {
  const tecnicoQuery = useProjectTechnicalStatus(proyecto.id);
  const activitiesQuery = useProjectActivities(proyecto.id);
  const deliverablesQuery = useProjectDeliverables(proyecto.id);

  // Decisión 2: los entregables se leen UNA vez y los avances se abren con
  // `useQueries`, solo mientras la sección está montada.
  const deliverables = deliverablesQuery.data ?? [];
  const progressQueries = useDeliverableProgress(
    proyecto.id,
    deliverables.map((deliverable) => deliverable.id),
  );
  const progreso = new Map<string, ProjectDeliverableProgress>();
  deliverables.forEach((deliverable, index) => {
    const query = progressQueries[index];
    if (query?.data) progreso.set(deliverable.id, query.data);
  });

  if (tecnicoQuery.isError) {
    return (
      <InlineError message={errorMessage(tecnicoQuery.error, TECNICO_ERROR)} className="mt-2" />
    );
  }
  if (!tecnicoQuery.data) {
    return <Skeleton className="mt-2 h-20 w-full rounded-[14px]" />;
  }

  const tecnico = tecnicoQuery.data;
  const actividades = activitiesQuery.data ?? [];
  const tecnicas = new Map(tecnico.actividades.map((actividad) => [actividad.id, actividad]));

  return (
    <div className="mt-2">
      <SemaforoTecnico tecnico={tecnico} />

      {activitiesQuery.isError ? (
        <InlineError
          message={errorMessage(activitiesQuery.error, ACTIVIDADES_ERROR)}
          className="mt-2"
        />
      ) : !activitiesQuery.data ? (
        <Skeleton className="mt-2 h-12 w-full rounded-[12px]" />
      ) : actividades.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-ink-500">Este proyecto todavía no tiene actividades.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {actividades.map((actividad) => {
            const tecnica = tecnicas.get(actividad.id);
            if (!tecnica) return null;
            return (
              <EjecucionAvance
                key={actividad.id}
                actividad={actividad}
                tecnico={tecnica}
                entregables={deliverables.filter(
                  (deliverable) => deliverable.actividad_id === actividad.id,
                )}
                progreso={progreso}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
