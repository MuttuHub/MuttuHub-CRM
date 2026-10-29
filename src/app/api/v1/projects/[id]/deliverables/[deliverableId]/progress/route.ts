// GET /api/v1/projects/:id/deliverables/:deliverableId/progress — avances of a deliverable (S4 U2).
// POST — register an avance.
//
// Create: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR, only while the
// project is EN_EJECUCION (404 -> 403 -> 409 -> 400). The date cannot be after
// today in Bogota. The cumulative non-voided quantity cannot exceed the goal
// without a `justificacion_exceso`; the check and the insert run in ONE
// transaction behind a row lock on the deliverable, so two concurrent avances
// cannot both slip under the cap. Voided rows are listed but never counted.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { cantidadPositivaField, parseEstructuraBody, toDecimal2 } from "@/lib/api/estructura";
import {
  ENTREGABLE_NO_EXISTE,
  contarMediosVivos,
  gateEjecucionRead,
  gateEjecucionWrite,
  listarSoportesVivos,
  toAvanceView,
} from "@/lib/api/ejecucion";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import { assertIsoDate, todayInBogota } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; deliverableId: string }> };

export const FECHA_FUTURA_MESSAGE = "La fecha del avance no puede ser posterior a hoy.";
export const EXCESO_MESSAGE =
  "La cantidad acumulada supera la meta del entregable. Indica una justificación del exceso.";

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

export const AVANCE_CREATE_SCHEMA = z
  .object({
    fecha: fechaField,
    cantidad: cantidadPositivaField,
    observacion: z.string().trim().max(2000, "La observación es demasiado larga.").optional(),
    justificacion_exceso: z.string().trim().max(2000, "La justificación es demasiado larga.").optional(),
  })
  .strict();

class ExcesoSinJustificacion extends Error {}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los avances. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, deliverableId } = await ctx.params;

    const gate = await gateEjecucionRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const entregable = await db.entregable.findFirst({
      where: { id: deliverableId, proyecto_id: id, deleted_at: null },
      select: { id: true, cantidad_meta: true },
    });
    if (!entregable) return apiError(ENTREGABLE_NO_EXISTE, 404, "NOT_FOUND");

    const [rows, parametros] = await Promise.all([
      db.avanceEntregable.findMany({
        where: { entregable_id: deliverableId, proyecto_id: id },
        orderBy: [{ fecha: "asc" }, { created_at: "asc" }],
      }),
      getSemaforoParametrosV2(),
    ]);
    const requiereMedio = parametros.avance_requiere_medio.valor;
    const ids = rows.map((row) => row.id);
    const [medios, soportes] = await Promise.all([contarMediosVivos(ids), listarSoportesVivos(ids)]);

    return NextResponse.json({
      estado: gate.value.estado,
      meta: entregable.cantidad_meta.toString(),
      avances: rows.map((row) =>
        toAvanceView(row, requiereMedio, medios.get(row.id) ?? 0, soportes.get(row.id) ?? []),
      ),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar el avance. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, deliverableId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, AVANCE_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const entregable = await db.entregable.findFirst({
      where: { id: deliverableId, proyecto_id: id, deleted_at: null },
      select: { id: true, cantidad_meta: true },
    });
    if (!entregable) return apiError(ENTREGABLE_NO_EXISTE, 404, "NOT_FOUND");

    if (input.fecha > todayInBogota()) {
      return apiError(FECHA_FUTURA_MESSAGE, 400, "VALIDATION_ERROR");
    }

    const cantidad = toDecimal2(input.cantidad);
    const justificacion = input.justificacion_exceso && input.justificacion_exceso.length > 0 ? input.justificacion_exceso : null;
    const parametros = await getSemaforoParametrosV2();
    const requiereMedio = parametros.avance_requiere_medio.valor;

    try {
      const row = await db.$transaction(async (tx) => {
        // Serialise concurrent avances of this deliverable so the cap check below is race-free.
        await tx.$queryRaw`SELECT "id" FROM "entregables" WHERE "id" = ${deliverableId} FOR UPDATE`;

        const { _sum } = await tx.avanceEntregable.aggregate({
          where: { entregable_id: deliverableId, anulado_at: null },
          _sum: { cantidad: true },
        });
        // Every non-voided avance counts against the cap (supported or not), so a
        // medio attached later can never push the total over the goal.
        const acumulado = _sum.cantidad ?? toDecimal2(0);
        const excede = acumulado.plus(cantidad).greaterThan(entregable.cantidad_meta);
        if (excede && justificacion === null) throw new ExcesoSinJustificacion();

        const created = await tx.avanceEntregable.create({
          data: {
            proyecto_id: id,
            entregable_id: deliverableId,
            fecha: new Date(`${input.fecha}T00:00:00.000Z`),
            cantidad,
            observacion: input.observacion && input.observacion.length > 0 ? input.observacion : null,
            justificacion_exceso: excede ? justificacion : null,
            registrado_por_id: auth.usuario.id,
          },
        });

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "avance",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            entregable_id: created.entregable_id,
            fecha: input.fecha,
            cantidad: created.cantidad,
            observacion: created.observacion,
            justificacion_exceso: created.justificacion_exceso,
          },
        });

        return created;
      });

      const avance = toAvanceView(row, requiereMedio);
      return NextResponse.json({ avance, cuenta: avance.cuenta }, { status: 201 });
    } catch (err) {
      if (err instanceof ExcesoSinJustificacion) return apiError(EXCESO_MESSAGE, 400, "VALIDATION_ERROR");
      throw err;
    }
  },
);
