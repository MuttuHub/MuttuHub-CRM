// Shared support (soporte/medio) plumbing of the v2 projects module: the upload policy and the
// confirm-mode validation used by the avance medios routes (S4) and the expense routes (S6).
//
// Flow: the browser asks for a signed upload URL (`signarSubidaSoporte`), PUTs the file straight
// to storage, then confirms with metadata (`validarSoporte`): either a stored object under THIS
// project's `soportes` prefix or an external https link. The server always chooses the key, reads
// the REAL stored size, and never deletes from storage.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Usuario } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parseEstructuraBody } from "@/lib/api/estructura";
import type { GateResult } from "@/lib/api/estructura";
import { canExecuteProject, type ProjectMembershipActor } from "@/lib/permissions";
import { loadProjectScoped, projectReadActor } from "@/lib/api/projects";
import { PROYECTO_NO_EXISTE } from "@/lib/api/ejecucion";
import {
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  STORAGE_BUCKET,
  isAllowedNameAndMime,
  isValidExternalUrl,
} from "@/lib/api/files";
import { assertKeyBelongsToTarget, proyectoSoportePath, storedObjectSize } from "@/lib/api/signed-upload";

export const FILE_TYPE_MESSAGE =
  "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";
export const STORAGE_PATH_INDEX = "soportes_proyecto_storage_path_key";
export const MEDIO_DUPLICADO_MESSAGE = "Ese archivo ya está adjunto como medio.";
export const MEDIO_CLAVE_MESSAGE = "La ruta del archivo no corresponde a este proyecto.";
export const MEDIO_ARCHIVO_MESSAGE = "El archivo no está disponible o supera el tamaño declarado.";
export const MEDIO_URL_MESSAGE = "El enlace debe ser una URL https válida (máximo 2000 caracteres).";
export const PLATAFORMA_MESSAGE = "Plataforma no configurada. Revisa las variables de entorno.";

const nombreField = z
  .string({ error: "El nombre es obligatorio." })
  .trim()
  .min(1, "El nombre es obligatorio.")
  .max(200, "El nombre es demasiado largo.");

const tamanoField = z
  .number({ error: "El tamaño no es válido." })
  .int("El tamaño no es válido.")
  .min(1, "El tamaño no es válido.");

export const MEDIO_SIGN_SCHEMA = z
  .object({ nombre: nombreField, tamano_bytes: tamanoField, tipo_mime: z.string().max(200).nullable().optional() })
  .strict();

export const MEDIO_ARCHIVO_SCHEMA = z
  .object({
    storage_path: z.string({ error: "La ruta del archivo es obligatoria." }).min(1, "La ruta del archivo es obligatoria.").max(500),
    nombre: nombreField,
    tamano_bytes: tamanoField,
    tipo_mime: z.string().max(200).nullable().optional(),
  })
  .strict();

export const MEDIO_ENLACE_SCHEMA = z
  .object({
    url_externa: z.string({ error: MEDIO_URL_MESSAGE }).refine(isValidExternalUrl, { message: MEDIO_URL_MESSAGE }),
    nombre: nombreField,
  })
  .strict();

export const MEDIO_CREATE_SCHEMA = z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]);

export type SoporteDatos = {
  nombre: string;
  storage_path: string | null;
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
};

/**
 * Body of a sign request -> signed upload URL for a new key under the project's soportes prefix.
 * The caller has already run its own gate (404 -> 403 -> 409).
 */
export async function signarSubidaSoporte(request: Request, proyectoId: string): Promise<Response> {
  const body = await parseEstructuraBody(request, MEDIO_SIGN_SCHEMA);
  if (!body.ok) return body.response;
  const { nombre, tamano_bytes: tamanoBytes, tipo_mime: tipoMime } = body.value;

  if (!isAllowedNameAndMime(nombre, tipoMime)) return apiError(FILE_TYPE_MESSAGE, 400, "VALIDATION_ERROR");
  if (tamanoBytes > MAX_FILE_BYTES) {
    return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
  }
  if (!isSupabaseConfigured()) return apiError(PLATAFORMA_MESSAGE, 500, "INTERNAL_ERROR");

  const storagePath = proyectoSoportePath(proyectoId, nombre);
  const { data, error } = await createSupabaseAdmin().storage.from(STORAGE_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    console.error("[projects] signed upload URL failed:", error);
    return apiError("No pudimos preparar la subida. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }

  return NextResponse.json({
    storage_path: storagePath,
    token: data.token,
    signed_url: data.signedUrl,
    max_bytes: MAX_FILE_BYTES,
    allowed_extensions: [...ALLOWED_FILE_EXTENSIONS],
  });
}

/**
 * Validates one confirm-mode soporte (`{ storage_path, nombre, tamano_bytes, tipo_mime? }` or
 * `{ url_externa, nombre }`). A body naming `url_externa` is read as a link, anything else as a file
 * confirmation, so the message points at the right field instead of a generic union error.
 */
export async function validarSoporte(
  proyectoId: string,
  input: unknown,
): Promise<{ ok: true; value: SoporteDatos } | { ok: false; response: Response }> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, response: apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR") };
  }
  const esEnlace = "url_externa" in input;
  const parsed = (esEnlace ? MEDIO_ENLACE_SCHEMA : MEDIO_ARCHIVO_SCHEMA).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR"),
    };
  }
  const data = parsed.data;

  if ("url_externa" in data) {
    return {
      ok: true,
      value: { nombre: data.nombre, storage_path: null, url_externa: data.url_externa, tipo_mime: null, tamano_bytes: null },
    };
  }

  const tipoMime = data.tipo_mime ?? null;
  if (!isAllowedNameAndMime(data.nombre, tipoMime)) {
    return { ok: false, response: apiError(FILE_TYPE_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  if (!assertKeyBelongsToTarget(data.storage_path, { kind: "proyecto_soporte", proyectoId })) {
    return { ok: false, response: apiError(MEDIO_CLAVE_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  if (!isSupabaseConfigured()) return { ok: false, response: apiError(PLATAFORMA_MESSAGE, 500, "INTERNAL_ERROR") };

  const realSize = await storedObjectSize(createSupabaseAdmin(), STORAGE_BUCKET, data.storage_path);
  if (realSize === null || realSize > data.tamano_bytes || realSize > MAX_FILE_BYTES) {
    return { ok: false, response: apiError(MEDIO_ARCHIVO_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  return {
    ok: true,
    value: { nombre: data.nombre, storage_path: data.storage_path, url_externa: null, tipo_mime: tipoMime, tamano_bytes: realSize },
  };
}

// ---------------------------------------------------------------------------
// Project-origin documents (DOC1)
// ---------------------------------------------------------------------------

export const DOCUMENTO_DUPLICADO_MESSAGE = "Ese archivo ya está adjunto a un documento.";
export const DOCUMENTO_NO_EXISTE = "El documento no existe.";
export const DOCUMENTO_FORBIDDEN_MESSAGE = "No tienes permiso para cambiar los documentos de este proyecto.";
export const DOCUMENTO_STATE_MESSAGE = "No se pueden cambiar los documentos del proyecto en su estado actual.";

/**
 * Estados where project documents can be created or deleted (managers and member COORDINADORs).
 * SUSPENDIDO, CERRADO and CANCELADO are frozen (B7, PO decision D-C).
 */
export const ESTADOS_DOCUMENTO_ESCRITURA: readonly string[] = ["BORRADOR", "EN_EJECUCION"];

/** A project-origin row: no avance, measurement or expense parent. */
export const SOPORTE_ORIGEN_PROYECTO = { avance_id: null, medicion_id: null, gasto_id: null } as const;

/**
 * 404 -> 403 -> 409 for a project-document write (create, sign, delete): managers or an active team
 * member, allowed in BORRADOR/EN_EJECUCION and refused in the frozen and closed states.
 */
export async function gateSoporteProyectoWrite(
  usuario: Usuario,
  proyectoId: string,
): Promise<GateResult<{ id: string; estado: string }>> {
  const scoped = await loadProjectScoped(usuario, proyectoId, { id: true, estado: true });
  if (!scoped) return { ok: false, response: apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND") };
  const actor: ProjectMembershipActor = projectReadActor(usuario, scoped.es_miembro);
  if (!canExecuteProject(actor)) {
    return { ok: false, response: apiError(DOCUMENTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN") };
  }
  if (!ESTADOS_DOCUMENTO_ESCRITURA.includes(scoped.row.estado)) {
    return { ok: false, response: apiError(DOCUMENTO_STATE_MESSAGE, 409, "INVALID_STATE") };
  }
  return { ok: true, value: scoped.row };
}

/** HTTP shape of a project-origin document; the storage key is never exposed. */
export type DocumentoProyectoView = {
  id: string;
  nombre: string;
  tipo: "archivo" | "enlace";
  tipo_mime: string | null;
  tamano_bytes: number | null;
  origen: "proyecto";
  origen_id: null;
  vinculo: null;
  url_externa: string | null;
  subido_por_id: string;
  created_at: string;
};

export function toDocumentoProyectoView(row: {
  id: string;
  nombre: string;
  storage_path: string | null;
  url_externa: string | null;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_id: string;
  created_at: Date;
}): DocumentoProyectoView {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.storage_path ? "archivo" : "enlace",
    tipo_mime: row.tipo_mime,
    tamano_bytes: row.tamano_bytes,
    origen: "proyecto",
    origen_id: null,
    vinculo: null,
    url_externa: row.url_externa,
    subido_por_id: row.subido_por_id,
    created_at: row.created_at.toISOString(),
  };
}
