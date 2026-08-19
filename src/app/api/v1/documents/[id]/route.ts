// GET /api/v1/documents/:id — detalle completo del documento: campos base,
// clientes, autor (nombres resueltos por lote), la versión activa y el
// historial completo de versiones (desc). 404 si no existe/borrado; 403 cuando
// la categoría es restringida y el usuario es COLABORADOR.
// DELETE /api/v1/documents/:id — soft delete (deleted_at) del documento
// completo; las versiones conservan el historial pero el documento desaparece
// de todos los listados (PRD §6.2: nunca se borra una versión individual).
// Permiso: roles completos o el autor del documento.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import {
  DOCUMENT_BASE_SELECT,
  DOCUMENT_VERSION_SELECT,
  documentAccessError,
  loadActiveVersions,
  loadDocumentClients,
  loadDocumentForDelete,
  loadDocumentForRead,
  loadUserNames,
  toDocumentItem,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos cargar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    const [documento, versiones, clientsByDoc, activeVersions] = await Promise.all([
      db.documento.findFirst({
        where: { id, deleted_at: null },
        select: DOCUMENT_BASE_SELECT,
      }),
      db.documentoVersion.findMany({
        where: { documento_id: id },
        orderBy: { numero_version: "desc" },
        select: DOCUMENT_VERSION_SELECT,
      }),
      loadDocumentClients([id]),
      loadActiveVersions([id]),
    ]);
    if (!documento) {
      return apiError("El documento no existe.", 404, "NOT_FOUND");
    }

    const userNames = await loadUserNames([
      ...new Set([documento.autor_id, ...versiones.map((v) => v.subido_por_id)]),
    ]);

    const versionesConNombre = versiones.map((v) => ({
      ...v,
      subido_por_nombre: userNames.get(v.subido_por_id) ?? "—",
    }));

    return NextResponse.json({
      documento: {
        ...toDocumentItem(documento, activeVersions, userNames, clientsByDoc),
        versiones: versionesConNombre,
        versiones_count: versiones.length,
      },
    });
  },
);

export const DELETE = withApiErrorHandling(
  "documents",
  "No pudimos eliminar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForDelete(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    await db.documento.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await logAudit({
      entidad: "documento",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });
    return new NextResponse(null, { status: 204 });
  },
);