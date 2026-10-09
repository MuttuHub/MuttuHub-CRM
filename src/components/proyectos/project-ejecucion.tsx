// Sección "Ejecución técnica" de la ficha (S4 U6). Solo lectura: resumen con el
// semáforo que calcula el servidor y, por actividad, su avance con los
// entregables (meta, contado y avances pendientes de soporte). En BORRADOR el
// proyecto aún no tiene línea base, así que solo se explica, sin leer nada.

"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { useCurrentUser } from "@/hooks/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SectionHeader } from "@/components/proyectos/ui";
import { EjecucionAvance } from "@/components/proyectos/ejecucion-avance";
import { EjecucionBeneficiarios } from "@/components/proyectos/ejecucion-beneficiarios";
import { EjecucionIndicadores } from "@/components/proyectos/ejecucion-indicadores";
import { SemaforoTecnico } from "@/components/proyectos/semaforo-tecnico";
import {
  useDeliverableProgress,
  useProjectActivities,
  useProjectDeliverables,
  useProjectMembers,
  useProjectTechnicalStatus,
  type ProjectBase,
  type ProjectDeliverableProgress,
  type ProjectListRow,
} from "@/hooks/projects";
import { canManageProjects } from "@/lib/permissions";

const TECNICO_ERROR = "No pudimos cargar el semáforo técnico. Inténtalo de nuevo.";
const ACTIVIDADES_ERROR = "No pudimos cargar las actividades. Inténtalo de nuevo.";

export const EJECUCION_BORRADOR_HINT =
  "La ejecución técnica estará disponible cuando el proyecto tenga su línea base aprobada.";

export function ProjectEjecucion({ proyecto }: { proyecto: ProjectListRow }) {
  if (proyecto.estado === "BORRADOR") {
    return (
      <section data-testid="ejecucion">
        <EjecucionHeader />
        <p className="mt-1.5 text-[12.5px] text-ink-500">{EJECUCION_BORRADOR_HINT}</p>
      </section>
    );
  }

  return (
    <section data-testid="ejecucion">
      <EjecucionHeader />
      <EjecucionContent proyecto={proyecto} />
    </section>
  );
}

function EjecucionHeader() {
  return <SectionHeader icon={<Gauge className="size-3.5" strokeWidth={2} />}>Ejecución técnica</SectionHeader>;
}

function EjecucionContent({ proyecto }: { proyecto: ProjectListRow }) {
  const [base, setBase] = useState<ProjectBase>("vigente");
  const tecnicoQuery = useProjectTechnicalStatus(proyecto.id, base);
  const activitiesQuery = useProjectActivities(proyecto.id);
  const deliverablesQuery = useProjectDeliverables(proyecto.id);

  // Decisión 3: control de escritura para gestores, o un COORDINADOR que sea
  // integrante activo (su lectura de `/members` está permitida). Anular es solo
  // de gestores. La API sigue siendo la autoridad final.
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyecto.id);
  const usuario = userQuery.data;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembroCoordinador = Boolean(
    usuario &&
      usuario.rol === "COORDINADOR" &&
      (membersQuery.data ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  const canWrite = esGestor || esMiembroCoordinador;
  const canVoid = esGestor;

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
      <SemaforoTecnico tecnico={tecnico} onBaseChange={setBase} />

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
                proyectoId={proyecto.id}
                actividad={actividad}
                tecnico={tecnica}
                entregables={deliverables.filter(
                  (deliverable) => deliverable.actividad_id === actividad.id,
                )}
                progreso={progreso}
                canWrite={canWrite}
                canVoid={canVoid}
              />
            );
          })}
        </ul>
      )}

      <EjecucionIndicadores proyectoId={proyecto.id} canWrite={canWrite} canVoid={canVoid} />

      <EjecucionBeneficiarios proyecto={proyecto} canWrite={canWrite} canVoid={canVoid} />
    </div>
  );
}
