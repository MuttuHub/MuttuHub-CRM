// DELETE /api/v1/tasks/:id/attachments/:attachmentId — quita un adjunto de la
// tarea. Mismo permiso que el resto de escrituras de la tarea (getTaskForWrite).
//
// Si el adjunto tiene espejo en el Repositorio de Documentos (QA audit #12,
// `AdjuntoTarea.documento_id`), el espejo se da de baja con él (soft delete +
// auditoría): un archivo adjuntado por error no debe seguir visible como
// documento. El objeto de Storage se conserva (igual que en el DELETE de
// documentos), para no romper trazabilidad ni versiones.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> };

export const DELETE = withApiErrorHandling(
  "tasks",
  "No pudimos eliminar el adjunto. Inténtalo de nuevo.",
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
      select: { id: true, nombre: true, documento_id: true },
    });
    if (!adjunto) {
      return apiError("El adjunto no existe.", 404, "NOT_FOUND");
    }

    await db.adjuntoTarea.delete({ where: { id: attachmentId } });

    if (adjunto.documento_id) {
      await db.documento.update({
        where: { id: adjunto.documento_id },
        data: { deleted_at: new Date() },
      });
      await logAudit({
        entidad: "documento",
        entidad_id: adjunto.documento_id,
        accion: "eliminar",
        usuario_id: auth.usuario.id,
        cambios: { origen: "adjunto_tarea", adjunto_id: attachmentId },
      });
    }

    await logAudit({
      entidad: "tarea",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
      cambios: { adjunto_id: attachmentId, nombre: adjunto.nombre },
    });

    return new NextResponse(null, { status: 204 });
  },
);
