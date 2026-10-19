// DELETE /api/v1/projects/:id/supports/:supportId — soft-deletes a project-origin document (DOC1).
//
// Managers delete any project document; an active team member only their own uploads. The
// project must be BORRADOR/EN_EJECUCION/SUSPENDIDO (404 -> 403 -> 409). Supports of avances,
// measurements and expenses are not addressable here (404). The row keeps living (deleted_at) and the
// deletion is audited inside the same transaction as the update; a concurrent delete that won the race
// answers 404 and writes no audit.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { canManageProjects } from "@/lib/permissions";
import {
  DOCUMENTO_FORBIDDEN_MESSAGE,
  DOCUMENTO_NO_EXISTE,
  SOPORTE_ORIGEN_PROYECTO,
  gateSoporteProyectoWrite,
} from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; supportId: string }> };

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, supportId } = await ctx.params;

    const gate = await gateSoporteProyectoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const where = { id: supportId, proyecto_id: id, deleted_at: null, ...SOPORTE_ORIGEN_PROYECTO };
    const documento = await db.soporteProyecto.findFirst({
      where,
      select: { id: true, nombre: true, storage_path: true, subido_por_id: true },
    });
    if (!documento) return apiError(DOCUMENTO_NO_EXISTE, 404, "NOT_FOUND");

    if (!canManageProjects(auth.usuario) && documento.subido_por_id !== auth.usuario.id) {
      return apiError(DOCUMENTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    }

    const eliminado = await db.$transaction(async (tx) => {
      const { count } = await tx.soporteProyecto.updateMany({ where, data: { deleted_at: new Date() } });
      if (count === 0) return false;
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "proyecto",
        entidad_id: id,
        proyecto_id: id,
        campo: "documento",
        valor_anterior: {
          documento_id: documento.id,
          nombre: documento.nombre,
          tipo: documento.storage_path ? "archivo" : "enlace",
        },
      });
      return true;
    });

    if (!eliminado) return apiError(DOCUMENTO_NO_EXISTE, 404, "NOT_FOUND");
    return NextResponse.json({ soporte: { id: documento.id } });
  },
);
