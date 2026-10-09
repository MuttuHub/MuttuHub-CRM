import type { Metadata } from "next";
import { ProjectFicha } from "@/components/proyectos/project-ficha";

export const metadata: Metadata = {
  title: "Ficha de proyecto",
};

export const dynamic = "force-dynamic";

// `params` is a Promise in this Next version. A missing or forbidden project is rendered by the
// client component from the GET /api/v1/projects/:id error (404/403), never as a crash.
export default async function ProyectoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProjectFicha projectId={id} backHref="/proyectos" />;
}
