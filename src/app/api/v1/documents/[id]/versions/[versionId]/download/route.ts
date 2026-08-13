// GET /api/v1/documents/:id/versions/:versionId/download — descarga de ESA
// versión específica (solo descarga; las versiones anteriores no se editan ni
// eliminan, PRD §6.2). 302 a signed URL de 60 s. El check de categoría
// restringida (403 para COLABORADOR) corre ANTES de cualquier signed URL; la
// versión debe pertenecer al documento del path o es 404.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@/lib/api/files";
import { documentAccessError, loadDocumentForRead } from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, versionId } = await ctx.params;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    if (!isSupabaseConfigured()) {
      return apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const version = await db.documentoVersion.findFirst({
      where: { id: versionId, documento_id: id },
      select: { storage_path: true },
    });
    if (!version) {
      return apiError("La versión no existe.", 404, "NOT_FOUND");
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(version.storage_path, 60);
    if (error || !data) {
      console.error("[documents] version download signed url failed:", error);
      return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.redirect(data.signedUrl, 302);
  },
);