// GET /api/v1/projects/:id/activities/:activityId/progress — activity-level progress
// reports (AJ-01, S2/S3/S9/S11). POST — register a report: `{ fecha, porcentaje, observacion }`.
// Unlike AvanceEntregable, a medio is never bundled into creation: attaching one happens
// through the separate attachments route below (same separation AJ-06 established between
// "create" and "attach more" for mediciones).
//
// Create: only the activity's own `responsable_id`, or ADMINISTRADOR/GERENCIA (the same
// override every other write gate in this codebase already has) — S9.5 — on an
// EN_EJECUCION project (404 -> 403 -> 409 -> 404 activity -> 403 responsable -> 400 body ->
// 409 business rules S9.1-S9.4, run by `validarNuevoReporte`). The first report is what
// moves the activity to EN_CURSO (S2): this route never writes a state column — there isn't
// one, `estadoActividad` derives it from the presence of a live report (S7/S8).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, parseEstructuraBody, toDecimal2 } from "@/lib/api/estructura";
import {
  cargarEntregablesCompletos,
  cargarReportesVivos,
  contarMediosVivosReporte,
  gateEjecucionRead,
  gateReporteActividadWrite,
  loadActividadParaReporte,
  toReporteView,
} from "@/lib/api/ejecucion";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { validarNuevoReporte } from "@/lib/proyectos/avance";
import { assertIsoDate } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

export const PORCENTAJE_REQUERIDO_MESSAGE = "El porcentaje debe ser mayor que 0 y menor o igual a 100.";
export const OBSERVACION_REQUERIDA_MESSAGE = "La observación es obligatoria.";

export const fechaField = z
  .string({ error: "La fecha es obligatoria." })
  .refine(
    (value) => {
      try {
        assertIsoDate(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "La fecha no es válida. Usa el formato AAAA-MM-DD." },
  );

// `porcentaje`/`observacion` stay optional at the zod layer on purpose: their required-ness
// (S9.1/S9.2) is enforced by `validarNuevoReporte`, the single source of truth for every
// submission message in S3 ("No se puede guardar un avance sin porcentaje o sin
// observación."), not duplicated here with a different wording.
export const REPORTE_CREATE_SCHEMA = z
  .object({
    fecha: fechaField,
    porcentaje: z.number({ error: PORCENTAJE_REQUERIDO_MESSAGE }).optional(),
    observacion: z.string({ error: OBSERVACION_REQUERIDA_MESSAGE }).optional(),
  })
  .strict();

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los reportes. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const actividad = await loadActividadParaReporte(id, activityId);
    if (!actividad.ok) return actividad.response;

    const rows = await db.reporteActividad.findMany({
      where: { actividad_id: activityId, proyecto_id: id },
      orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
    });
    const medios = await contarMediosVivosReporte(rows.map((row) => row.id));

    return NextResponse.json({
      estado: gate.value.estado,
      reportes: rows.map((row) => toReporteView(row, medios.get(row.id) ?? 0)),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar el avance. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, activityId } = await ctx.params;

    const gate = await gateReporteActividadWrite(auth.usuario, id, activityId);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, REPORTE_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const parametros = await getSemaforoParametrosV2();
    const requiereMedio = parametros.avance_requiere_medio.valor;
    const tope = parametros.tope_en_curso.valor;

    const [reportes, entregablesCompletos] = await Promise.all([
      cargarReportesVivos(id, activityId),
      cargarEntregablesCompletos(id, activityId, requiereMedio),
    ]);

    const porcentaje = input.porcentaje ?? 0;
    const observacion = input.observacion ?? "";
    const validacion = validarNuevoReporte({ porcentaje, observacion, reportes, entregablesCompletos, tope });
    if (!validacion.ok) return conflict(validacion.message);

    const row = await db.$transaction(async (tx) => {
      const created = await tx.reporteActividad.create({
        data: {
          proyecto_id: id,
          actividad_id: activityId,
          fecha: new Date(`${input.fecha}T00:00:00.000Z`),
          porcentaje: toDecimal2(porcentaje),
          observacion: observacion.trim(),
          registrado_por_id: auth.usuario.id,
        },
      });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "CREAR",
        entidad: "reporte_actividad",
        entidad_id: created.id,
        proyecto_id: id,
        valor_nuevo: {
          actividad_id: created.actividad_id,
          fecha: input.fecha,
          porcentaje: created.porcentaje,
          observacion: created.observacion,
        },
      });
      return created;
    });

    return NextResponse.json({ reporte: toReporteView(row, 0) }, { status: 201 });
  },
);
