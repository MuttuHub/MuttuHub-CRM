// POST /api/v1/uploads/sign — ADR-13 signed direct-to-storage upload (S0.9b).
//
// The app's policy is 25 MB, but any multipart upload through a route handler
// is capped by the hosting platform's request-body limit (~4.5 MB on Vercel),
// which binds BEFORE the route's own checks. This endpoint keeps the bytes out
// of the function: it authorises the actor on the target, validates the shared
// upload policy, computes the storage KEY server-side (never accepts one from
// the client) and returns a Supabase signed upload URL plus the policy limits.
// The browser then uploads straight to Storage and confirms with metadata only
// (see the JSON branch of the document/version/attachment routes).
//
// Never returns the service key, bucket credentials, or a public object URL.

import { NextResponse } from "next/server";
import { getTaskForWrite } from "@/lib/api/crm";
import {
  documentAccessError,
  documentClientFolderForVersions,
  loadDocumentForRead,
} from "@/lib/api/documents";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import {
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  STORAGE_BUCKET,
  documentStoragePath,
  isAllowedNameAndMime,
} from "@/lib/api/files";
import { withApiErrorHandling } from "@/lib/api/handler";
import { taskAttachmentStoragePath } from "@/lib/api/signed-upload";
import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SignBody = {
  kind?: unknown;
  ref_id?: unknown;
  nombre?: unknown;
  tamano_bytes?: unknown;
  tipo_mime?: unknown;
};

const BAD_BODY = "Cuerpo de la solicitud no válido.";
const BAD_TYPE =
  "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";

export const POST = withApiErrorHandling(
  "uploads",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // Storage necesita credenciales de Supabase sí o sí: sin ellas no hay URL.
    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const body = await parseJsonBody<SignBody>(request);
    if (!body || typeof body !== "object") {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    const { kind, ref_id: refId, nombre, tamano_bytes: tamanoBytes } = body;
    if (kind !== "tarea_adjunto" && kind !== "documento_version") {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    if (typeof refId !== "string" || !refId.trim()) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    if (typeof nombre !== "string" || !nombre.trim()) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    if (
      typeof tamanoBytes !== "number" ||
      !Number.isInteger(tamanoBytes) ||
      tamanoBytes <= 0
    ) {
      return apiError(BAD_BODY, 400, "VALIDATION_ERROR");
    }
    const tipoMime = typeof body.tipo_mime === "string" ? body.tipo_mime : null;

    // Shared policy, checked before any URL is issued.
    if (!isAllowedNameAndMime(nombre, tipoMime)) {
      return apiError(BAD_TYPE, 400, "VALIDATION_ERROR");
    }
    if (tamanoBytes > MAX_FILE_BYTES) {
      return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
    }

    // Authorise the target and choose the key server-side. Never accept a key
    // from the client.
    let storagePath: string;
    if (kind === "tarea_adjunto") {
      const access = await getTaskForWrite(refId, auth.usuario);
      if (!access.ok) {
        return apiError(
          access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
          access.code === "NOT_FOUND" ? 404 : 403,
          access.code,
        );
      }
      storagePath = taskAttachmentStoragePath(refId, nombre);
    } else {
      const access = await loadDocumentForRead(refId, auth.usuario);
      if (!access.ok) return documentAccessError(access.code);
      // Same next-version and client-folder rules the versions route uses.
      const ultima = await db.documentoVersion.findFirst({
        where: { documento_id: refId },
        orderBy: { numero_version: "desc" },
        select: { numero_version: true },
      });
      const numero = ultima ? ultima.numero_version + 1 : 1;
      const clienteId = await documentClientFolderForVersions(refId);
      storagePath = documentStoragePath(clienteId, refId, numero, nombre);
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      console.error("[uploads] signed upload URL failed:", error);
      return apiError("No pudimos preparar la subida. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }

    return NextResponse.json({
      storage_path: storagePath,
      token: data.token,
      signed_url: data.signedUrl,
      max_bytes: MAX_FILE_BYTES,
      allowed_extensions: [...ALLOWED_FILE_EXTENSIONS],
    });
  },
);
