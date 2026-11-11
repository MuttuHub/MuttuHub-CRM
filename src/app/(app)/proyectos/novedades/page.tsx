import type { Metadata } from "next";
import { NovedadesProyectos } from "@/components/proyectos/ficha/novedades/novedades-proyectos";

export const metadata: Metadata = {
  title: "Novedades de Proyectos",
};

// «Ver qué cambió» of the ficha's Novedades notice lands here; `desde` is the project to go back to.
// `searchParams` is a Promise in this Next version.
export default async function NovedadesProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[] }>;
}) {
  const { desde } = await searchParams;

  return <NovedadesProyectos desdeProyectoId={typeof desde === "string" ? desde : null} />;
}
