// Shared file-handling helpers for the storage-backed endpoints (módulo
// Repositorio de Documentos, Hito 4). Reusa las reglas del adjunto de tareas
// (src/app/api/v1/tasks/[id]/attachments/route.ts): máx 10 MB (PRD §8.4),
// formatos PDF/DOCX/XLSX/JPG/PNG (aceptado por extensión O MIME) y el bucket
// SUPABASE_STORAGE_BUCKET (default "muttu-docs"). La sanitización de nombre
// sigue la convención de path del PRD §6.2 (el key de storage nunca lleva el
// "/" inicial).

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // PRD §8.4: máx 10 MB.

export const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "pptx", "jpg", "png"]); // PRD §8.4 + Fase 2 (4A-bis).
export const ALLOWED_FILE_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "muttu-docs";

export const MAX_SANITIZED_FILENAME_LENGTH = 120;

/**
 * Nombre de archivo seguro para keys de storage y entradas de zip: elimina
 * separadores de path, diacríticos (tildes, ñ) y cualquier otro carácter que
 * Supabase Storage rechace como key inválida (espacios incluidos), recorta
 * espacios y lo limita a 120 caracteres conservando la extensión original.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\]/g, "_")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_");
  if (!cleaned) return "documento";
  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0) return cleaned.slice(0, MAX_SANITIZED_FILENAME_LENGTH);
  const extension = cleaned.slice(dot); // incluye el punto
  const maxCore = Math.max(1, MAX_SANITIZED_FILENAME_LENGTH - extension.length);
  return `${cleaned.slice(0, dot).slice(0, maxCore)}${extension}`;
}

/** "archivo.PDF" -> "pdf" (sin punto, en minúscula). */
export function fileExtension(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** True cuando la extensión O el MIME están en los sets permitidos (PRD §8.4). */
export function isAllowedFileType(file: File): boolean {
  return (
    ALLOWED_FILE_EXTENSIONS.has(fileExtension(file.name)) || ALLOWED_FILE_MIME.has(file.type)
  );
}

/**
 * Key de storage de un documento del Repositorio, según la convención del
 * PRD §6.2 sin el "/" inicial:
 * `documentos/{cliente_id o "general"}/{documento_id}/v{n}_{nombre-sanitizado}`.
 */
export function documentStoragePath(
  clienteId: string | null,
  documentoId: string,
  versionNumber: number,
  originalName: string,
): string {
  const clientKey = clienteId ?? "general";
  return `documentos/${clientKey}/${documentoId}/v${versionNumber}_${sanitizeFileName(originalName)}`;
}

/** Extensión (con punto) del archivo que queda al final de un key de storage. */
export function extensionFromStoragePath(storagePath: string): string {
  const lastSegment = storagePath.split("/").pop() ?? "";
  return fileExtension(lastSegment) ? `.${fileExtension(lastSegment)}` : "";
}

/**
 * Key de storage de un `SoporteProyecto` subido como archivo (tablero-
 * seguimiento-social, T8/D8): `proyectos/{proyecto_id}/soportes/{soporte_id}_{nombre-sanitizado}`,
 * misma convención sin "/" inicial que `documentStoragePath`. El `soporte_id`
 * (no un `randomUUID()` aparte) hace la key determinística respecto de la fila.
 */
export function projectSupportStoragePath(
  proyectoId: string,
  soporteId: string,
  originalName: string,
): string {
  return `proyectos/${proyectoId}/soportes/${soporteId}_${sanitizeFileName(originalName)}`;
}

/**
 * D8: `url_externa` solo acepta esquema `https:`. Validado con el
 * constructor `URL` (no una regex) — cualquier cadena que no parsea como URL
 * válida, o que parsea con otro esquema (`http:`, `file:`, etc.), se rechaza.
 */
export function isValidExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}