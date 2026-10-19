// GET /api/v1/projects/:id/progress/:progressId/attachments/:attachmentId/download (S4 U3).
//
// A stored file answers `{ tipo: "archivo", url, expires_in: 60 }` with a 60 s
// signed URL; a link medio answers its https URL. Read access follows the ficha
// (ADM/GER or an active-member COORDINADOR); a medio is only addressable through
// its own project and avance, and only while it is live.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { gateEjecucionRead } from "@/lib/api/ejecucion";
import { STORAGE_BUCKET } from "@/lib/api/files";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; progressId: string; attachmentId: string }> };

export const DOWNLOAD_TTL_SECONDS = 60;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la descarga. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, progressId, attachmentId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const medio = await db.soporteProyecto.findFirst({
      where: { id: attachmentId, avance_id: progressId, proyecto_id: id, deleted_at: null },
      select: { id: true, storage_path: true, url_externa: true },
    });
    if (!medio) return apiError("El medio no existe.", 404, "NOT_FOUND");

    if (!medio.storage_path) {
      return NextResponse.json({ tipo: "enlace", url: medio.url_externa, expires_in: null });
    }

    if (!isSupabaseConfigured()) {
      return apiError("Plataforma no configurada. Revisa las variables de entorno.", 500, "INTERNAL_ERROR");
    }
    const { data, error } = await createSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .createSignedUrl(medio.storage_path, DOWNLOAD_TTL_SECONDS);
    if (error || !data) {
      console.error("[projects] medio download signed url failed:", error);
      return apiError("No pudimos generar el enlace de descarga. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }
    return NextResponse.json({ tipo: "archivo", url: data.signedUrl, expires_in: DOWNLOAD_TTL_SECONDS });
  },
);
