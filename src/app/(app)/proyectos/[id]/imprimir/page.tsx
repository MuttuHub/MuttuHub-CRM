import type { Metadata } from "next";
import { ProjectPrintSheet } from "@/components/proyectos/print/project-print-sheet";

export const metadata: Metadata = {
  title: "Imprimir ficha de proyecto",
};

export const dynamic = "force-dynamic";

// `params` is a Promise in this Next version. The access check is the API's (403/404 from the same
// queries as the ficha); the client component renders it as a readable message, never as a crash.
export default async function ImprimirProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProjectPrintSheet projectId={id} />;
}
