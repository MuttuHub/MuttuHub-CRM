// POST /api/v1/tasks/:id/attachments/from-document — adjunta un documento del
// Repositorio a una tarea sin re-subir el archivo (plan Fase 2, 4C). Es el
// inverso exacto de mirrorAttachmentAsDocument: reusa el mismo storage_path de
// la versión activa del documento y crea la fila AdjuntoTarea.
//
// DOS gates, ambos obligatorios:
//  1. getTaskForWrite — la escritura es sobre la tarea, hereda su permiso.
//  2. loadDocumentForRead — las descargas de adjuntos de tarea acuñan su propia
//     URL firmada y NO revalidan Documento.categoria: sin este segundo gate un
//     COLABORADOR podría adjuntar un documento Legal a su propia tarea y
//     bajárselo (escalada). Test explícito en route.test.ts.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite } from "@/lib/api/crm";
import { documentAccessError, loadDocumentForRead } from "@/lib/api/documents";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "tasks",
  "No pudimos adjuntar el documento. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<{ documento_id?: string }>(request);
    if (!body?.documento_id) {
      return apiError("Envía el campo 'documento_id'.", 400, "VALIDATION_ERROR");
    }

    // Gate 1: la escritura es sobre la tarea.
    const taskAccess = await getTaskForWrite(id, auth.usuario);
    if (!taskAccess.ok) {
      return apiError(
        taskAccess.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        taskAccess.code === "NOT_FOUND" ? 404 : 403,
        taskAccess.code,
      );
    }

    // Gate 2: el documento debe ser legible (404 / 403 de categoría restringida).
    const docAccess = await loadDocumentForRead(body.documento_id, auth.usuario);
    if (!docAccess.ok) return documentAccessError(docAccess.code);

    // La versión activa es la de mayor numero_version; su storage_path es el
    // archivo que ya está subido (sin re-subir).
    const activa = await db.documentoVersion.findFirst({
      where: { documento_id: body.documento_id },
      orderBy: { numero_version: "desc" },
      select: { storage_path: true, tipo_archivo: true, tamano_bytes: true },
    });
    if (!activa) {
      return apiError("El documento no tiene versiones.", 400, "VALIDATION_ERROR");
    }

    const documento = await db.documento.findFirst({
      where: { id: body.documento_id, deleted_at: null },
      select: { titulo: true },
    });

    const adjunto = await db.adjuntoTarea.create({
      data: {
        tarea_id: id,
        storage_path: activa.storage_path,
        nombre: documento?.titulo ?? "documento",
        tamano_bytes: activa.tamano_bytes,
        documento_id: body.documento_id,
      },
      select: { id: true, nombre: true, tamano_bytes: true, created_at: true },
    });

    await logAudit({
      entidad: "tarea",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: { adjuntar_documento: body.documento_id },
    });

    return NextResponse.json({ adjunto }, { status: 201 });
  },
);