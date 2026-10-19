// POST /api/v1/projects/:id/modifications/:modificationId/approve — approve a request (S8 U4, E-26).
//
// ADM/GER only. Creates version N+1 and applies the change in one transaction (`aplicarModificacion`):
// the project row and the budget lines are locked, the RF-28 rules and REQ-GAS-06 are judged again
// with E read under those locks, and a request based on an older version is refused. Order: project
// (404) -> permission (403) -> request (404) -> already decided (409) -> the rules under the locks.
// No body.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { aplicarModificacion, gateModificacionDecision, loadSolicitudView } from "@/lib/api/modificaciones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; modificationId: string }> };

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos aprobar la modificación. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, modificationId } = await ctx.params;

    const gate = await gateModificacionDecision(auth.usuario, id, modificationId);
    if (!gate.ok) return gate.response;

    // The writer repeats every check under the locks; a RespuestaAbortada becomes its response.
    const { version } = await db.$transaction(
      (tx) => aplicarModificacion(tx, { proyectoId: id, solicitudId: modificationId, usuarioId: auth.usuario.id }),
      TX_OPTIONS,
    );
    return NextResponse.json({ version, solicitud: await loadSolicitudView(modificationId) });
  },
);
