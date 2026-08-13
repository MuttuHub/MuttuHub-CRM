// GET /api/v1/documents/:id/download — descarga de la VERSIÓN ACTIVA (la de
// mayor numero_version, PRD §6.2 "Versión activa"). 302 a un signed URL de
// 60 s de Supabase Storage. El check de categoría restringida (403 para
// COLABORADOR) corre ANTES de generar cualquier signed URL.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@/lib/api/files";
import { documentAccessError, loadDocumentForRead } from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const activa = await db.documentoVersion.findFirst({
      where: { documento_id: id },
      orderBy: { numero_version: "desc" },
      select: { storage_path: true },
    });
    if (!activa) {
      return apiError("El documento no tiene versiones.", 404, "NOT_FOUND");
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(activa.storage_path, 60);
    if (error || !data) {
      console.error("[documents] download signed url failed:", error);
      return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.redirect(data.signedUrl, 302);
  },
);