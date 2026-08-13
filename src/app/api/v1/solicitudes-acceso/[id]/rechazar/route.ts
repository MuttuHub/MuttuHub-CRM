// POST /api/v1/solicitudes-acceso/:id/rechazar — admin rejection of a public
// access request (PRD §3.1). ADMINISTRADOR only. Marks the request RECHAZADA
// with revisado_por/revisado_at.
//
// DESIGN DECISION: when origen=google the auth user is NOT deleted — the
// requester may retry with Google later (the callback reopens the request),
// and deleting an auth user here would kill any future invite-based flows.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "solicitudes-acceso",
  "No pudimos rechazar la solicitud. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;

    const solicitud = await db.solicitudAcceso.findUnique({
      where: { id },
      select: { estado: true },
    });
    if (!solicitud) {
      return apiError("La solicitud no existe.", 404, "NOT_FOUND");
    }
    if (solicitud.estado !== "PENDIENTE") {
      return apiError(
        "Esta solicitud ya fue revisada.",
        409,
        "CONFLICT",
      );
    }

    await db.solicitudAcceso.update({
      where: { id },
      data: {
        estado: "RECHAZADA",
        revisado_por: auth.usuario.id,
        revisado_at: new Date(),
      },
    });

    return NextResponse.json({
      solicitud: {
        id,
        estado: "RECHAZADA",
        revisado_por: auth.usuario.id,
        revisado_at: new Date().toISOString(),
      },
    });
  },
);
