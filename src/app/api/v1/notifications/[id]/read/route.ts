// PATCH /api/v1/notifications/:id/read — marca como leída una notificación
// del usuario actual (PRD §8.2). Solo afecta filas propias: una fila de otro
// usuario (o inexistente) responde 404 NOT_FOUND (no se filtra información
// ajena). Idempotente: repetir sobre una ya leída devuelve 200 sin cambios.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  try {
    const fila = await db.notificacion.findFirst({
      where: { id, usuario_id: auth.usuario.id },
      select: { id: true, leida: true },
    });
    if (!fila) {
      return apiError("La notificación no existe.", 404, "NOT_FOUND");
    }

    let leida = fila.leida;
    if (!leida) {
      await db.notificacion.update({ where: { id }, data: { leida: true } });
      leida = true;
    }
    return NextResponse.json({ notificacion: { id, leida } });
  } catch (err) {
    console.error("[notifications] mark-read failed:", err);
    return apiError("No pudimos marcar la notificación como leída. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}