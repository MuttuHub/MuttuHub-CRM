// Etiqueta corta del formato de un soporte (la lista de Documentos de la ficha).

import type { ProjectSupport } from "@/hooks/projects";

/** Short format badge: the extension of the file, "Drive" for links. */
export function formatoSoporte(soporte: Pick<ProjectSupport, "tipo" | "nombre" | "url_externa">): string {
  if (soporte.tipo === "enlace") return soporte.url_externa?.includes("drive.google") ? "Drive" : "Enlace";
  const ext = soporte.nombre.split(".").pop();
  return ext && ext.length <= 5 && ext !== soporte.nombre ? ext.toUpperCase() : "Archivo";
}
