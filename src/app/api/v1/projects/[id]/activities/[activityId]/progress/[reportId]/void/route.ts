// POST /api/v1/projects/:id/activities/:activityId/progress/:reportId/void (AJ-01, S10).
//
// The "Propuesto" correction flow (S2's "para corregir un error de digitación se edita o
// anula el último reporte"). `AvanceEntregable` has no edit route at all — only void — so
// this feature mirrors that exact precedent rather than inventing an in-place edit with no
// prior pattern to follow: a mistaken report is voided and a new, correct one registered
// through POST .../progress (S10's "edit" reading as "void + create a new one").
//
// Void is gated the same as create (S9.5, responsable-only + ADMINISTRADOR/GERENCIA
// override) and only the single most recent non-voided report of the activity may be
// voided — an older, superseded report is immutable, preserving the "siempre mayor"
// invariant for the ones that remain live. The row is kept (never hard-deleted) and
// audited with ANULAR, exactly like `AvanceEntregable`'s void.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, parseEstructuraBody } from "@/lib/api/estructura";
import { REPORTE_NO_EXISTE, contarMediosVivosReporte, gateReporteActividadWrite, toReporteView } from "@/lib/api/ejecucion";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string; reportId: string }> };

export const REPORTE_ANULADO_MESSAGE = "El reporte ya está anulado.";
export const REPORTE_NO_ES_ULTIMO_MESSAGE =
  "Solo se puede anular el último reporte registrado de la actividad.";

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
  "No pudimos anular el reporte. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId, reportId } = await ctx.params;

    const gate = await gateReporteActividadWrite(auth.usuario, id, activityId);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MOTIVO_ANULACION_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo } = body.value;

    const existente = await db.reporteActividad.findFirst({
      where: { id: reportId, actividad_id: activityId, proyecto_id: id },
    });
    if (!existente) return apiError(REPORTE_NO_EXISTE, 404, "NOT_FOUND");
    if (existente.anulado_at !== null) return conflict(REPORTE_ANULADO_MESSAGE);

    const ultimo = await db.reporteActividad.findFirst({
      where: { actividad_id: activityId, proyecto_id: id, anulado_at: null },
      orderBy: [{ fecha: "desc" }, { created_at: "desc" }],
      select: { id: true },
    });
    if (ultimo?.id !== reportId) return conflict(REPORTE_NO_ES_ULTIMO_MESSAGE);

    const row = await db.$transaction(async (tx) => {
      const { count } = await tx.reporteActividad.updateMany({
        where: { id: reportId, anulado_at: null },
        data: { anulado_at: new Date(), anulado_por_id: auth.usuario.id, motivo_anulacion: motivo },
      });
      if (count === 0) return null; // a concurrent void won the race

      const updated = await tx.reporteActividad.findUniqueOrThrow({ where: { id: reportId } });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "ANULAR",
        entidad: "reporte_actividad",
        entidad_id: reportId,
        proyecto_id: id,
        valor_anterior: { porcentaje: existente.porcentaje, fecha: existente.fecha },
        valor_nuevo: { anulado_at: updated.anulado_at, motivo_anulacion: motivo },
      });
      return updated;
    });
    if (!row) return conflict(REPORTE_ANULADO_MESSAGE);

    const medios = await contarMediosVivosReporte([row.id]);
    return NextResponse.json({ reporte: toReporteView(row, medios.get(row.id) ?? 0) });
  },
);
