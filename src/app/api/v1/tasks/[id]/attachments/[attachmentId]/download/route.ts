// GET /api/v1/tasks/:id/attachments/:attachmentId/download — 302 a un signed
// URL (60 s) del archivo en Supabase Storage. El adjunto debe pertenecer a la
// tarea del path y el alcance es el mismo que el PATCH de tarea
// (getTaskForWrite: full roles o responsable). Fallos de storage → 500
// envelope en lugar de crash.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getTaskForWrite } from "@/lib/api/crm";

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

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const adjunto = await db.adjuntoTarea.findFirst({
      where: { id: attachmentId, tarea_id: id },
      select: { storage_path: true },
    });
    if (!adjunto) {
      return apiError("El adjunto no existe.", 404, "NOT_FOUND");
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