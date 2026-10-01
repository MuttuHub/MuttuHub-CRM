// Shared file-handling helpers for the storage-backed endpoints (módulo
// Repositorio de Documentos, Hito 4). Política ÚNICA de subida para toda la app
// (S0.9a: adjuntos de tarea + Repositorio de Documentos): máx 25 MB
// configurables vía MAX_FILE_SIZE_MB, formatos PDF/DOCX/XLSX/PPTX/JPG/JPEG/PNG
// (aceptados por extensión Y MIME permitido o vacío) y el bucket
// SUPABASE_STORAGE_BUCKET (default "muttu-docs"). La sanitización de nombre
// sigue la convención de path del PRD §6.2 (el key de storage nunca lleva el
// "/" inicial).

/**
 * PRD §8.4: default max upload size. `MAX_FILE_SIZE_MB` overrides it only when
 * it is a plain positive integer; unset, empty, `"0"`, `"5abc"` or `"2.9"` all
 * fall back to this default instead of silently lowering the limit.
 */
export const DEFAULT_MAX_FILE_MB = 25;

// A plain decimal integer, nothing else: `Number.parseInt` would read "5abc" as
// 5 and "2.9" as 2, so an operator typo would quietly shrink the limit instead
// of falling back to the default.
const rawMaxFileMb = (process.env.MAX_FILE_SIZE_MB ?? "").trim();
const configuredMaxFileMb = /^\d+$/.test(rawMaxFileMb) ? Number(rawMaxFileMb) : Number.NaN;
export const MAX_FILE_MB =
  Number.isFinite(configuredMaxFileMb) && configuredMaxFileMb > 0
    ? configuredMaxFileMb
    : DEFAULT_MAX_FILE_MB;

export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * PRD §8.4 + Fase 2 (4A-bis). The single allowlist for the whole app: task
 * attachments and the document repository share this set, so it must not drift.
 * `.jpeg` is the same format as `.jpg`; rejecting it would be an accidental
 * regression, not a policy narrowing.
 */
export const ALLOWED_FILE_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
]);

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

/**
 * True when the extension is allowed AND the MIME is either allowed or
 * absent/generic (PRD §8.4).
 *
 * It is AND, not OR: with OR, a disallowed extension (`report.exe`) passed as
 * long as it declared a friendly MIME such as application/pdf, and any MIME at
 * all passed on an allowed extension. The extension carries the identity and
 * the MIME may only confirm it or stay silent — clients such as curl send
 * application/octet-stream (or nothing) for perfectly valid files.
 */
export function isAllowedFileType(file: File): boolean {
  if (!ALLOWED_FILE_EXTENSIONS.has(fileExtension(file.name))) return false;
  return (
    !file.type || file.type === "application/octet-stream" || ALLOWED_FILE_MIME.has(file.type)
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