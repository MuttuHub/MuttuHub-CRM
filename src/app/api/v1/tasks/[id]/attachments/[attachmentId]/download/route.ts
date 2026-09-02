// GET /api/v1/tasks/:id/attachments/:attachmentId/download — 302 a un signed
// URL (60 s) del archivo en Supabase Storage. El adjunto debe pertenecer a la
// tarea del path. PR 3 (close-phase-1): el alcance del download es GLOBAL —
// cualquier usuario autenticado puede bajar cualquier adjunto de cualquier
// tarea, EXCEPTO si el adjunto tiene un `Documento` vinculado con categoría
// restringida (la compuerta de confidencialidad del módulo de Documentos se
// mantiene intacta: un COLABORADOR que subió un "Legal" a su propia tarea
// sigue sin poder descargarlo de vuelta). Fallos de storage → 500 envelope.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  canReadCategory,
  loadDocCategories,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "muttu-docs";

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, attachmentId } = await ctx.params;

    // PR 3: read-scope gate. The task only needs to exist + be non-deleted;
    // per-role ownership is no longer enforced here.
    const tarea = await db.tarea.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!tarea) {
      return apiError("La tarea no existe.", 404, "NOT_FOUND");
    }

    const adjunto = await db.adjuntoTarea.findFirst({
      where: { id: attachmentId, tarea_id: id },
      select: { storage_path: true, documento_id: true },
    });
    if (!adjunto) {
      return apiError("El adjunto no existe.", 404, "NOT_FOUND");
    }

    // Confidentiality gate (Documents.categoria, PRD §6.2): when the adjunto
    // is mirrored in the Documentos repository, a COLABORADOR still cannot
    // download a restricted-category file even on a task they own.
    if (adjunto.documento_id) {
      const documento = await db.documento.findFirst({
        where: { id: adjunto.documento_id, deleted_at: null },
        select: { categoria: true },
      });
      if (documento) {
        const { restringidas } = await loadDocCategories();
        if (!canReadCategory(auth.usuario, documento.categoria, restringidas)) {
          return apiError(
            "No tienes permisos sobre este documento.",
            403,
            "FORBIDDEN",
          );
        }
      }
    }

    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(adjunto.storage_path, 60);
    if (error || !data) {
      console.error("[tasks] attachment download signed url failed:", error);
      return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.redirect(data.signedUrl, 302);
  },
);