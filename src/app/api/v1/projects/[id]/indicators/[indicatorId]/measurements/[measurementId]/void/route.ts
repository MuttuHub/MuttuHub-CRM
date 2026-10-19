// POST /api/v1/projects/:id/indicators/:indicatorId/measurements/:measurementId/void (S4 U4).
//
// Voids a measurement (REQ-EXE-07): the row is kept, excluded from `ultima`,
// `tendencia` and every calculation, and audited with ANULAR. ADMINISTRADOR/
// GERENCIA only, any project estado. Order: 404 -> 403 -> 400 -> 404 -> 409.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, parseEstructuraBody } from "@/lib/api/estructura";
import { gateEjecucionVoid } from "@/lib/api/ejecucion";
import { toMedicionView } from "@/lib/api/mediciones";
import { MOTIVO_ANULACION_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/[progressId]/void/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; indicatorId: string; measurementId: string }> };

export const MEDICION_NO_EXISTE = "La medición no existe.";
export const MEDICION_ANULADA_MESSAGE = "La medición ya está anulada.";

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos anular la medición. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId, measurementId } = await ctx.params;

    const gate = await gateEjecucionVoid(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MOTIVO_ANULACION_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    const existente = await db.medicionIndicador.findFirst({
      where: { id: measurementId, indicador_id: indicatorId, proyecto_id: id },
    });
    if (!existente) return apiError(MEDICION_NO_EXISTE, 404, "NOT_FOUND");
    if (existente.anulado_at !== null) return conflict(MEDICION_ANULADA_MESSAGE);

    const row = await db.$transaction(async (tx) => {
      const { count } = await tx.medicionIndicador.updateMany({
        where: { id: measurementId, anulado_at: null },
        data: { anulado_at: new Date(), anulado_por_id: auth.usuario.id, motivo_anulacion: motivo },
      });
      if (count === 0) return null; // a concurrent void won the race

      const updated = await tx.medicionIndicador.findUniqueOrThrow({ where: { id: measurementId } });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "medicion",
        entidad_id: measurementId,
        proyecto_id: id,
        valor_anterior: { valor: existente.valor, fecha: existente.fecha },
        valor_nuevo: { anulado_at: updated.anulado_at, motivo_anulacion: motivo },
      });
      return updated;
    });
    if (!row) return conflict(MEDICION_ANULADA_MESSAGE);

    return NextResponse.json({ medicion: toMedicionView(row) });
  },
);
