// GET /api/v1/projects/:id/indicators/:indicatorId/measurements — measurements of an indicator (S4 U4).
// POST — register one.
//
// Create: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR, only while the
// project is EN_EJECUCION (404 -> 403 -> 409 -> 400). `valor >= 0`; the date
// cannot be after today in Bogota. The response carries `ultima` and
// `tendencia` (last live value against the previous live one). Voided rows are
// listed but never counted.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { cantidadNoNegativaField, parseEstructuraBody, toDecimal2 } from "@/lib/api/estructura";
import { gateEjecucionRead, gateEjecucionWrite, listarSoportesVivosMedicion } from "@/lib/api/ejecucion";
import { resumenMediciones, toMedicionView } from "@/lib/api/mediciones";
import { todayInBogota } from "@/lib/proyectos/weeks";
import { fechaField } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; indicatorId: string }> };

export const INDICADOR_NO_EXISTE = "El indicador no existe.";
export const FECHA_MEDICION_FUTURA_MESSAGE = "La fecha de la medición no puede ser posterior a hoy.";

export const MEDICION_CREATE_SCHEMA = z
  .object({
    fecha: fechaField,
    valor: cantidadNoNegativaField,
    observacion: z.string().trim().max(2000, "La observación es demasiado larga.").optional(),
  })
  .strict();

async function loadIndicador(proyectoId: string, indicatorId: string) {
  return db.indicador.findFirst({
    where: { id: indicatorId, proyecto_id: proyectoId, deleted_at: null },
    select: { id: true, codigo: true, nombre: true, meta: true, unidad: true },
  });
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar las mediciones. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const indicador = await loadIndicador(id, indicatorId);
    if (!indicador) return apiError(INDICADOR_NO_EXISTE, 404, "NOT_FOUND");

    const rows = await db.medicionIndicador.findMany({
      where: { indicador_id: indicatorId, proyecto_id: id },
      orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
    });
    const { ultima, tendencia } = resumenMediciones(rows);
    const soportes = await listarSoportesVivosMedicion(rows.map((row) => row.id));

    return NextResponse.json({
      estado: gate.value.estado,
      indicador: {
        id: indicador.id,
        codigo: indicador.codigo,
        nombre: indicador.nombre,
        meta: indicador.meta.toString(),
        unidad: indicador.unidad,
      },
      // AJ-06 T3, S3: "3 archivos y 1 enlace muestra los 4" — additive per medición, oldest first.
      mediciones: rows.map((row) => ({ ...toMedicionView(row), soportes: soportes.get(row.id) ?? [] })),
      ultima,
      tendencia,
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar la medición. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, MEDICION_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const indicador = await loadIndicador(id, indicatorId);
    if (!indicador) return apiError(INDICADOR_NO_EXISTE, 404, "NOT_FOUND");

    if (input.fecha > todayInBogota()) {
      return apiError(FECHA_MEDICION_FUTURA_MESSAGE, 400, "VALIDATION_ERROR");
    }

    const previas = await db.medicionIndicador.findMany({
      where: { indicador_id: indicatorId, proyecto_id: id, anulado_at: null },
    });

    const row = await db.$transaction(async (tx) => {
      const created = await tx.medicionIndicador.create({
        data: {
          proyecto_id: id,
          indicador_id: indicatorId,
          fecha: new Date(`${input.fecha}T00:00:00.000Z`),
          valor: toDecimal2(input.valor),
          observacion: input.observacion && input.observacion.length > 0 ? input.observacion : null,
          registrado_por_id: auth.usuario.id,
        },
      });
      await logChange(tx, {
        usuario_id: auth.usuario.id,
        accion: "CREAR",
        entidad: "medicion",
        entidad_id: created.id,
        proyecto_id: id,
        valor_nuevo: {
          indicador_id: indicatorId,
          fecha: input.fecha,
          valor: created.valor,
          observacion: created.observacion,
        },
      });
      return created;
    });

    const { ultima, tendencia } = resumenMediciones([...previas, row]);
    return NextResponse.json({ medicion: toMedicionView(row), ultima, tendencia }, { status: 201 });
  },
);
