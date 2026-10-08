// POST /api/v1/projects/:id/deliverables/:deliverableId/progress/:progressId/void (S4 U2).
//
// Voids an avance (REQ-EXE-07): the row is kept, excluded from every
// calculation and audited with ANULAR. ADMINISTRADOR/GERENCIA only, any project
// estado (a mistake must stay correctable). Order: 404 -> 403 -> 400 -> 404 -> 409.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, parseEstructuraBody } from "@/lib/api/estructura";
import { AVANCE_NO_EXISTE, gateEjecucionVoid, toAvanceView } from "@/lib/api/ejecucion";
import { getSemaforoParametrosV2 } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; deliverableId: string; progressId: string }> };

export const AVANCE_ANULADO_MESSAGE = "El avance ya está anulado.";

export const MOTIVO_ANULACION_SCHEMA = z
  .object({
    motivo: z
      .string({ error: "El motivo es obligatorio." })
      .trim()
      .min(1, "El motivo no puede estar vacío.")
      .max(500, "El motivo es demasiado largo."),
  })
  .strict();

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos anular el avance. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, deliverableId, progressId } = await ctx.params;

    const gate = await gateEjecucionVoid(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MOTIVO_ANULACION_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    const existente = await db.avanceEntregable.findFirst({
      where: { id: progressId, entregable_id: deliverableId, proyecto_id: id },
    });
    if (!existente) return apiError(AVANCE_NO_EXISTE, 404, "NOT_FOUND");
    if (existente.anulado_at !== null) return conflict(AVANCE_ANULADO_MESSAGE);

    const parametros = await getSemaforoParametrosV2();

    const row = await db.$transaction(async (tx) => {
      const { count } = await tx.avanceEntregable.updateMany({
        where: { id: progressId, anulado_at: null },
        data: { anulado_at: new Date(), anulado_por_id: auth.usuario.id, motivo_anulacion: motivo },
      });
      if (count === 0) return null; // a concurrent void won the race

      const updated = await tx.avanceEntregable.findUniqueOrThrow({ where: { id: progressId } });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "avance",
        entidad_id: progressId,
        proyecto_id: id,
        valor_anterior: { cantidad: existente.cantidad, fecha: existente.fecha },
        valor_nuevo: { anulado_at: updated.anulado_at, motivo_anulacion: motivo },
      });
      return updated;
    });
    if (!row) return conflict(AVANCE_ANULADO_MESSAGE);

    return NextResponse.json({ avance: toAvanceView(row, parametros.avance_requiere_medio.valor) });
  },
);
