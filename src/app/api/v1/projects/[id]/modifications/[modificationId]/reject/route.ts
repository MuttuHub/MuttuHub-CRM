// POST /api/v1/projects/:id/modifications/:modificationId/reject — reject a request (S8 U4, E-26).
//
// ADM/GER only; the comment is mandatory. The request becomes RECHAZADA and no domain data changes.
// Order: project (404) -> permission (403) -> request (404) -> already decided (409) -> body (400).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  DECISION_SCHEMA,
  gateModificacionDecision,
  loadSolicitudView,
  rechazarModificacion,
} from "@/lib/api/modificaciones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; modificationId: string }> };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos rechazar la modificación. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, modificationId } = await ctx.params;

    const gate = await gateModificacionDecision(auth.usuario, id, modificationId);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, DECISION_SCHEMA);
    if (!body.ok) return body.response;

    await db.$transaction((tx) =>
      rechazarModificacion(tx, {
        proyectoId: id,
        solicitudId: modificationId,
        usuarioId: auth.usuario.id,
        comentario: body.value.comentario,
      }),
    );
    return NextResponse.json({ solicitud: await loadSolicitudView(modificationId) });
  },
);
