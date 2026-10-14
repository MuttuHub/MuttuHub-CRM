// Body of steps 2-5 for the created project. Steps 2-4 embed, as they are, the editors the ficha already
// uses while the project is in BORRADOR (the editors decide by themselves who can edit: `canManageProjects`
// plus BORRADOR; the API stays the authority):
//   2 Metas       -> ProjectEstructura: objectives, activities (by weeks), deliverables and indicators, with
//                    "Descargar plantilla" / "Importar plantilla".
//   3 Cronograma  -> ProjectCronograma + EstructuraGantt: read-only views of the activities.
//   4 Presupuesto -> ProjectPresupuesto: valor total, rubros and the monthly programming.
//   5 Revisión    -> PasoRevision: read-only summary plus the existing baseline approval.

"use client";

import Link from "next/link";
import { EstructuraGantt } from "@/components/proyectos/estructura-gantt";
import { PasoRevision } from "@/components/proyectos/nuevo-proyecto/paso-revision";
import { hrefNuevoProyecto } from "@/components/proyectos/nuevo-proyecto/stepper-logic";
import { ProjectCronograma } from "@/components/proyectos/project-cronograma";
import { ProjectEstructura } from "@/components/proyectos/project-estructura";
import { ProjectPresupuesto } from "@/components/proyectos/project-presupuesto";
import type { ProjectListRow } from "@/hooks/projects";

const PANEL_CLASS = "flex flex-col gap-6";

export function PasoSiguientes({ paso, proyecto }: { paso: number; proyecto: ProjectListRow }) {
  switch (paso) {
    case 2:
      return (
        <div className={PANEL_CLASS}>
          <ProjectEstructura proyecto={proyecto} />
        </div>
      );
    case 3:
      return (
        <div className={PANEL_CLASS}>
          <p className="text-[12.5px] text-ink-600">
            Las actividades se registran en el paso Metas, dentro de cada objetivo, ubicadas por semanas.{" "}
            <Link
              href={hrefNuevoProyecto({ proyecto: proyecto.id, paso: 2 })}
              className="font-semibold text-ink-900 underline"
            >
              Ir a Metas
            </Link>
            .
          </p>
          <ProjectCronograma proyecto={proyecto} />
          <EstructuraGantt proyecto={proyecto} />
        </div>
      );
    case 4:
      return (
        <div className={PANEL_CLASS}>
          <ProjectPresupuesto proyecto={proyecto} />
        </div>
      );
    case 5:
      return <PasoRevision proyecto={proyecto} />;
    default:
      return null;
  }
}
