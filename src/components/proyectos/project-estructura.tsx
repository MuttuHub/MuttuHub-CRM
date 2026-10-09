// Estructura técnica del proyecto (S3 U4) dentro de la ficha: objetivos con sus
// actividades (ubicadas por semanas), entregables e indicadores. Todos los que
// ven la ficha ven la estructura; solo quien gestiona proyectos
// (`canManageProjects`) y mientras el proyecto está en BORRADOR ve los controles
// de alta, edición y baja. Esa visibilidad es comodidad de interfaz: la
// autoridad es la API (403 a otros roles, 409 INVALID_STATE fuera de BORRADOR).

"use client";

import { ListTree } from "lucide-react";
import { EstructuraGantt } from "@/components/proyectos/estructura-gantt";
import { ImportDialog } from "@/components/proyectos/import-dialog";
import { EstructuraObjetivos } from "@/components/proyectos/estructura-objetivos";
import { useCurrentUser } from "@/hooks/kanban";
import type { ProjectListRow } from "@/hooks/projects";
import { canManageProjects } from "@/lib/permissions";

export function ProjectEstructura({ proyecto }: { proyecto: ProjectListRow }) {
  const userQuery = useCurrentUser();
  const usuario = userQuery.data;
  const puedeGestionar = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esBorrador = proyecto.estado === "BORRADOR";
  const canEdit = puedeGestionar && esBorrador;

  return (
    <section data-testid="estructura">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
          <ListTree className="size-3.5" strokeWidth={2} />
          Estructura técnica
        </h3>
        {canEdit && <ImportDialog proyecto={proyecto} />}
      </div>

      {puedeGestionar && !esBorrador && (
        <p className="mt-1.5 text-[12.5px] text-ink-500">
          La estructura solo se edita mientras el proyecto está en borrador.
        </p>
      )}

      <EstructuraObjetivos proyecto={proyecto} canEdit={canEdit} />

      <EstructuraGantt proyecto={proyecto} />
    </section>
  );
}
