// DELETE /api/v1/projects/:id/members/:userId — soft removal (contract E-07, P07).
//
// Removal is an UPDATE, never a DELETE: `removed_at` is set and `removido_por_id`
// records the acting user, so the membership row survives for history and the
// member loses read access immediately (the U1 scope honours `removed_at`, so
// `es_miembro` flips to false with no extra bookkeeping). Re-adding the same
// user later inserts a new row, which the partial index allows because the old
// row falls outside its `removed_at IS NULL` predicate.
//
// Authorization mirrors the POST: the project is read first (404 for missing or
// soft-deleted) and only then the manager gate answers 403. The write and its
// `EDITAR proyecto_miembro` audit rows share one transaction (REQ-ACC-07).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canManageProjects } from "@/lib/permissions";
import { EQUIPO_CONGELADO_MESSAGE, estaCongelado } from "@/lib/proyectos/transiciones-estado";
import { logChanges } from "@/lib/api/audit-cambios";
import { PROYECTO_MIEMBRO_SELECT, toProyectoMiembroItemV2 } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos retirar al integrante. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, userId } = await ctx.params;

    // Existence first (404), then authority (403): the manager gate needs no
    // membership probe.
    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, estado: true },
    });
    if (!proyecto) {
      return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    }

    if (!canManageProjects(auth.usuario)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }
    if (estaCongelado(proyecto.estado)) {
      return apiError(EQUIPO_CONGELADO_MESSAGE, 409, "INVALID_STATE");
    }

    const membresia = await db.proyectoMiembro.findFirst({
      where: { proyecto_id: id, usuario_id: userId, removed_at: null },
      select: { id: true },
    });
    if (!membresia) {
      return apiError("El usuario no es integrante activo del equipo del proyecto.", 404, "NOT_FOUND");
    }

    const removedAt = new Date();
    const row = await db.$transaction(async (tx) => {
      const updated = await tx.proyectoMiembro.update({
        where: { id: membresia.id },
        data: { removed_at: removedAt, removido_por_id: auth.usuario.id },
        select: PROYECTO_MIEMBRO_SELECT,
      });

      // One audit row per changed field (REQ-AUD-04).
      await logChanges(tx, [
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "proyecto_miembro",
          entidad_id: membresia.id,
          proyecto_id: id,
          campo: "removed_at",
          valor_anterior: null,
          valor_nuevo: removedAt.toISOString(),
        },
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "proyecto_miembro",
          entidad_id: membresia.id,
          proyecto_id: id,
          campo: "removido_por_id",
          valor_anterior: null,
          valor_nuevo: auth.usuario.id,
        },
      ]);

      return updated;
    });

    return NextResponse.json({ miembro: toProyectoMiembroItemV2(row) });
  },
);
