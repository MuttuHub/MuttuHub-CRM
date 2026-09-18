// DELETE /api/v1/projects/:id/attachments/:attachmentId — soft delete de un
// SoporteProyecto (RNF-03: gated by canManageProject, mismo eje que la
// subida). El objeto de storage NUNCA se borra físicamente (Asunciones
// tomadas de design.md: un comprobante financiero legalizado debe quedar
// recuperable) — solo `deleted_at`, igual que `Meta`/`Actividad`.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getProjectForWrite } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el soporte. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, attachmentId } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar soportes de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const soporte = await db.soporteProyecto.findFirst({
      where: { id: attachmentId, proyecto_id: id, deleted_at: null },
      select: { id: true },
    });
    if (!soporte) {
      return apiError("El soporte no existe.", 404, "NOT_FOUND");
    }

    await db.soporteProyecto.update({
      where: { id: attachmentId },
      data: { deleted_at: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  },
);
