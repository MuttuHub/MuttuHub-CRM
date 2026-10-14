// Body of steps 2-5 for the created project. Temporary shell: the next work units replace it with the
// embedded Borrador editors (Metas, Cronograma, Presupuesto) and the Revisión step.

"use client";

import Link from "next/link";
import { EmptyBlock } from "@/components/proyectos/ui";
import type { ProjectListRow } from "@/hooks/projects";

export function PasoSiguientes({ paso, proyecto }: { paso: number; proyecto: ProjectListRow }) {
  return (
    <EmptyBlock>
      El paso {paso} se completa desde la{" "}
      <Link href={`/proyectos/${proyecto.id}`} className="font-semibold underline">
        ficha del proyecto
      </Link>
      .
    </EmptyBlock>
  );
}
