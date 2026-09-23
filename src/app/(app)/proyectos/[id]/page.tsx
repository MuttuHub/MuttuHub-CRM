// Workspace de un Proyecto — gestion-proyectos-workspace, Phase 4
// (design.md T1, File Changes: `src/app/(app)/proyectos/[id]/page.tsx`).
// Mirrors `src/app/print/clientes/[id]/page.tsx`'s async-params convention
// and `src/app/(app)/proyectos/page.tsx`'s Suspense+skeleton shell.

import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectWorkspace } from "@/components/proyectos/project-workspace";

export const metadata: Metadata = {
  title: "Proyecto",
};

export const dynamic = "force-dynamic";

export default async function ProyectoWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="flex h-[600px] items-center justify-center">Cargando proyecto…</div>}>
      <ProjectWorkspace projectId={id} />
    </Suspense>
  );
}
