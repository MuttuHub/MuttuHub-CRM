// POST /api/v1/documents/:id/restore — saca un documento de la Papelera (S8):
// deleted_at = null. Solo documentos borrados (uno vivo o inexistente -> 404).
// Permiso: la misma regla de escritura que el PATCH (loadDocumentForWrite:
// roles completos o el autor, y nunca sobre una categoría restringida para
// quien no puede leerla). Si la carpeta del documento ya no existe (borrada o
// ausente), el documento vuelve a la raíz (carpeta_id = null). Deja una fila
// de Auditoria "restaurar", igual que el DELETE deja "eliminar".

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit, type AuditAccion } from "@/lib/api/audit";
import { documentAccessError, loadDocumentForWrite } from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const ACCION_RESTAURAR: AuditAccion = "restaurar";

export const POST = withApiErrorHandling(
  "documents",
  "No pudimos restaurar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForWrite(id, auth.usuario, { deleted: true });
    if (!access.ok) return documentAccessError(access.code);

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

    await db.documento.update({
      where: { id },
      data: { deleted_at: null, ...(folderGone ? { carpeta_id: null } : {}) },
    });
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
