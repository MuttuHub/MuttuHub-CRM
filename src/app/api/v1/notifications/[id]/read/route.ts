// PATCH /api/v1/notifications/:id/read — marca como leída una notificación
// del usuario actual (PRD §8.2).
// DELETE /api/v1/notifications/:id/read — revierte el estado leído (undo de
// "marcar todas como leídas").
// Ambas solo afectan filas propias: una fila de otro usuario (o inexistente)
// responde 404 NOT_FOUND (no se filtra información ajena). Idempotentes:
// repetir sobre un estado ya alcanzado devuelve 200 sin cambios.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiErrorHandling(
  "notifications",
  "No pudimos marcar la notificación como leída. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

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
  },
);

export const DELETE = withApiErrorHandling(
  "notifications",
  "No pudimos desmarcar la notificación como no leída. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const fila = await db.notificacion.findFirst({
      where: { id, usuario_id: auth.usuario.id },
      select: { id: true, leida: true },
    });
    if (!fila) {
      return apiError("La notificación no existe.", 404, "NOT_FOUND");
    }

    let leida = fila.leida;
    if (leida) {
      await db.notificacion.update({ where: { id }, data: { leida: false } });
      leida = false;
    }
    return NextResponse.json({ notificacion: { id, leida } });
  },
);
