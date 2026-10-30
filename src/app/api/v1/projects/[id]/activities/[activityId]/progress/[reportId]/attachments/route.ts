// GET /api/v1/projects/:id/activities/:activityId/progress/:reportId/attachments — live
// medios of an activity progress report (AJ-01, S11). POST — attach a medio: confirm an
// object already uploaded with a signed URL (`{ storage_path, nombre, tamano_bytes,
// tipo_mime? }`) or link an external https URL (`{ url_externa, nombre }`). A
// self-contained mirror of the AJ-06 mediciones attachment routes, scoped to
// `reporte_actividad_id` instead of `medicion_id` (S11: a dedicated route per parent type,
// not an overload of the older generic `progress/{progressId}/attachments` resource).
//
// Write: same S9.5 gate as creating/voiding the report (responsable-only + ADMIN/GERENCIA
// override) on an EN_EJECUCION project (404 -> 403 -> 409 -> 404 activity -> 403
// responsable), on a non-voided report (409). A file is confirmed only when its key sits
// under THIS project's `soportes` prefix, the object exists in storage and is not larger
// than declared or than the app limit; the stored row keeps the REAL size. Never deletes
// from storage; the same object cannot back two medios. No `cuenta`/semáforo concept for a
// report either (same as a medición), so POST answers just the created medio.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation } from "@/lib/api/estructura";
import {
  gateEjecucionRead,
  gateReporteActividadWrite,
  loadReporteParaMedio,
  toMedioView,
} from "@/lib/api/ejecucion";
import { MEDIO_DUPLICADO_MESSAGE, STORAGE_PATH_INDEX, validarSoporte } from "@/lib/api/soportes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string; reportId: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los medios. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId, reportId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const reporte = await loadReporteParaMedio(id, activityId, reportId, { permitirAnulado: true });
    if (!reporte.ok) return reporte.response;

    const medios = await db.soporteProyecto.findMany({
      where: { reporte_actividad_id: reportId, proyecto_id: id, deleted_at: null },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ medios: medios.map(toMedioView) });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos adjuntar el medio. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId, reportId } = await ctx.params;

    const gate = await gateReporteActividadWrite(auth.usuario, id, activityId);
    if (!gate.ok) return gate.response;
    const reporte = await loadReporteParaMedio(id, activityId, reportId);
    if (!reporte.ok) return reporte.response;

    const body = await parseJsonBody<unknown>(request);
    const soporte = await validarSoporte(id, body);
    if (!soporte.ok) return soporte.response;
    const datos = soporte.value;

    try {
      const medio = await db.$transaction(async (tx) => {
        const created = await tx.soporteProyecto.create({
          data: { proyecto_id: id, reporte_actividad_id: reportId, subido_por_id: auth.usuario.id, ...datos },
        });
        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "reporte_actividad",
          entidad_id: reportId,
          proyecto_id: id,
          campo: "medio",
          valor_nuevo: {
            medio_id: created.id,
            nombre: created.nombre,
            tipo: created.storage_path ? "archivo" : "enlace",
            url_externa: created.url_externa,
            tamano_bytes: created.tamano_bytes,
          },
        });
        return created;
      });

      return NextResponse.json({ medio: toMedioView(medio) }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
