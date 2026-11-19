// POST /api/v1/documents/:id/restore — saca un documento de la Papelera (S8):
// deleted_at = null. Solo documentos borrados (uno vivo o inexistente -> 404).
// Permiso: la misma regla de escritura que el PATCH (loadDocumentForWrite:
// roles completos o el autor, y nunca sobre una categoría restringida para
// quien no puede leerla). Si la carpeta del documento ya no existe (borrada o
// ausente), el documento vuelve a la raíz (carpeta_id = null). Deja una fila
// de Auditoria "restaurar", igual que el DELETE deja "eliminar". Si ya hay un
// documento vivo con el mismo título responde 409, la misma regla que la
// creación; con body `{ force: true }` restaura igual.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit, type AuditAccion } from "@/lib/api/audit";
import {
  documentAccessError,
  duplicateTitleResponse,
  findLiveTitleTwin,
  loadDocCategories,
  loadDocumentForWrite,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const ACCION_RESTAURAR: AuditAccion = "restaurar";

export const POST = withApiErrorHandling(
  "documents",
  "No pudimos restaurar el documento. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForWrite(id, auth.usuario, { deleted: true });
    if (!access.ok) return documentAccessError(access.code);

    if (!(await readForce(request))) {
      const { restringidas } = await loadDocCategories();
      const twin = await findLiveTitleTwin({
        titulo: access.documento.titulo,
        usuario: auth.usuario,
        restringidas,
        excludeId: id,
      });
      if (twin) return duplicateTitleResponse(twin);
    }

    // A folder deleted (or gone) while the document sat in the trash cannot
    // hold it again: the document comes back at the root.
    let folderGone = false;
    const carpetaId = access.documento.carpeta_id;
    if (carpetaId) {
      const carpeta = await db.carpeta.findFirst({
        where: { id: carpetaId, deleted_at: null },
        select: { id: true },
      });
      folderGone = carpeta === null;
    }

    // Conditional on still being in the trash: of two concurrent restores only
    // one flips the row, and only that one writes the audit entry.
    const restored = await db.documento.updateMany({
      where: { id, deleted_at: { not: null } },
      data: { deleted_at: null, ...(folderGone ? { carpeta_id: null } : {}) },
    });
    if (restored.count === 0) return documentAccessError("NOT_FOUND");
    await logAudit({
      entidad: "documento",
      entidad_id: id,
      accion: ACCION_RESTAURAR,
      usuario_id: auth.usuario.id,
      cambios: { titulo: access.documento.titulo },
    });
    return new NextResponse(null, { status: 204 });
  },
);

/** The body is optional (the historical call sends none); only `force: true` counts. */
async function readForce(request: Request): Promise<boolean> {
  try {
    const body = (await request.json()) as { force?: unknown } | null;
    return body?.force === true;
  } catch {
    return false;
  }
}
