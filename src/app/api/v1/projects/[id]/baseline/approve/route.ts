// POST /api/v1/projects/:id/baseline/approve — approve the baseline (S8 U3, E-25).
//
// The ONLY API way a project reaches EN_EJECUCION: BORRADOR -> EN_EJECUCION with version 0 frozen,
// the estado change and the audit lote in one transaction (`aprobarLineaBase`). ADM/GER only.
// Order: project (404) -> permission (403) -> estado (409) -> preconditions under the row lock (409
// with `precondiciones`). No body.

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { canApproveBaseline } from "@/lib/permissions";
import {
  BASELINE_ESTADO_MESSAGE,
  BASELINE_YA_APROBADA_MESSAGE,
  aprobarLineaBase,
} from "@/lib/api/versiones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos aprobar la línea base. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const proyecto = await db.proyecto.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, estado: true },
    });
    if (!proyecto) return apiError("El proyecto no existe.", 404, "NOT_FOUND");
    if (!canApproveBaseline(auth.usuario)) {
      return apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN");
    }
    if (proyecto.estado === "EN_EJECUCION") {
      return apiError(BASELINE_YA_APROBADA_MESSAGE, 409, "INVALID_STATE");
    }
    if (proyecto.estado !== "BORRADOR") {
      return apiError(BASELINE_ESTADO_MESSAGE, 409, "INVALID_STATE");
    }

    // The writer repeats the checks under the row lock; a RespuestaAbortada becomes its response.
    const resultado = await db.$transaction(
      (tx) => aprobarLineaBase(tx, { proyectoId: id, usuarioId: auth.usuario.id }),
      TX_OPTIONS,
    );
    return NextResponse.json(resultado, { status: 201 });
  },
);
