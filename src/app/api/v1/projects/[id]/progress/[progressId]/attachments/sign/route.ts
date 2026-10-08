// POST /api/v1/projects/:id/progress/:progressId/attachments/sign (S4 U3).
//
// ADR-13 signed direct-to-storage upload for a medio of an avance: the bytes go
// from the browser to Supabase Storage, never through this function. The server
// authorises like any execution write (404 -> 403 -> 409), validates the shared
// upload policy, chooses the KEY (`proyectos/{id}/soportes/{uuid}_{name}`; a key
// from the client is never read) and returns a signed upload URL. The browser then
// confirms with metadata through POST .../attachments. Objects are never deleted.

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { gateEjecucionWrite, loadAvanceParaMedio } from "@/lib/api/ejecucion";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  STORAGE_BUCKET,
  isAllowedNameAndMime,
} from "@/lib/api/files";
import { proyectoSoportePath } from "@/lib/api/signed-upload";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; progressId: string }> };

export const FILE_TYPE_MESSAGE =
  "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";

export const MEDIO_SIGN_SCHEMA = z
  .object({
    nombre: z.string({ error: "El nombre es obligatorio." }).trim().min(1, "El nombre es obligatorio.").max(200, "El nombre es demasiado largo."),
    tamano_bytes: z
      .number({ error: "El tamaño no es válido." })
      .int("El tamaño no es válido.")
      .min(1, "El tamaño no es válido."),
    tipo_mime: z.string().max(200).nullable().optional(),
  })
  .strict();

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos preparar la subida. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const avance = await loadAvanceParaMedio(id, progressId);
    if (!avance.ok) return avance.response;

    const body = await parseEstructuraBody(request, MEDIO_SIGN_SCHEMA);
    if (!body.ok) return body.response;
    const { nombre, tamano_bytes: tamanoBytes, tipo_mime: tipoMime } = body.value;

    if (!isAllowedNameAndMime(nombre, tipoMime)) {
      return apiError(FILE_TYPE_MESSAGE, 400, "VALIDATION_ERROR");
    }
    if (tamanoBytes > MAX_FILE_BYTES) {
      return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
    }
    if (!isSupabaseConfigured()) {
      return apiError("Plataforma no configurada. Revisa las variables de entorno.", 500, "INTERNAL_ERROR");
    }

    const storagePath = proyectoSoportePath(id, nombre);
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(storagePath);
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
  },
);
