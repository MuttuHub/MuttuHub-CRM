// PATCH /api/v1/projects/:id/indicators/:indicatorId — edit an indicator (S3 U3).
// DELETE /api/v1/projects/:id/indicators/:indicatorId — soft-delete it.
//
// Manager-only and BORRADOR-only (404 -> 403 -> 409 INVALID_STATE -> 400). An
// indicator is only addressable through its own project. Moving it to another
// objective requires a live objective of the same project; `linea_base: null`
// clears the baseline. One `EDITAR` audit row per changed field, Decimals
// compared by value. Deleting is `deleted_at`, audited as
// `EDITAR indicador.deleted_at`; it answers 409 while the indicator still has
// non-voided measurements.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import {
  NOTHING_TO_UPDATE,
  cantidadNoNegativaField,
  checkObjetivoDelProyecto,
  cantidadPositivaField,
  codigoField,
  conflict,
  gateEstructuraWrite,
  isUniqueViolation,
  parseEstructuraBody,
  textoField,
  toDecimal2,
} from "@/lib/api/estructura";
import { toIndicadorView } from "@/lib/proyectos/indicador";
import { INDICADOR_DUPLICATE_MESSAGE, INDICADOR_INDEX } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; indicatorId: string }> };

const AUDITED_INDICADOR_FIELDS = [
  "objetivo_id",
  "codigo",
  "nombre",
  "meta",
  "unidad",
  "linea_base",
] as const;

export const INDICADOR_PATCH_SCHEMA = z
  .object({
    objetivo_id: z.string().min(1, "El objetivo es obligatorio.").optional(),
    codigo: codigoField.optional(),
    nombre: textoField("El nombre", 300).optional(),
    meta: cantidadPositivaField.optional(),
    unidad: textoField("La unidad", 100).optional(),
    linea_base: cantidadNoNegativaField.nullable().optional(),
  })
  .strict();

const INDICADOR_NOT_FOUND = "El indicador no existe.";

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el indicador. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, INDICADOR_PATCH_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const patch: {
      objetivo_id?: string;
      codigo?: string;
      nombre?: string;
      meta?: ReturnType<typeof toDecimal2>;
      unidad?: string;
      linea_base?: ReturnType<typeof toDecimal2> | null;
    } = {};
    if (input.objetivo_id !== undefined) patch.objetivo_id = input.objetivo_id;
    if (input.codigo !== undefined) patch.codigo = input.codigo;
    if (input.nombre !== undefined) patch.nombre = input.nombre;
    if (input.meta !== undefined) patch.meta = toDecimal2(input.meta);
    if (input.unidad !== undefined) patch.unidad = input.unidad;
    if (input.linea_base !== undefined) {
      patch.linea_base = input.linea_base === null ? null : toDecimal2(input.linea_base);
    }
    if (Object.keys(patch).length === 0) {
      return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");
    }

    const existente = await db.indicador.findFirst({
      where: { id: indicatorId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(INDICADOR_NOT_FOUND, 404, "NOT_FOUND");

    if (patch.objetivo_id !== undefined) {
      const objetivoAjeno = await checkObjetivoDelProyecto(id, patch.objetivo_id);
      if (objetivoAjeno) return objetivoAjeno;
    }

    const cambios = diffFields(existente, patch, AUDITED_INDICADOR_FIELDS);

    try {
      const row = await db.$transaction(async (tx) => {
        const updated = await tx.indicador.update({ where: { id: indicatorId }, data: patch });
        if (cambios.length > 0) {
          await logChanges(
            tx,
            cambios.map((cambio) => ({
              usuario_id: auth.usuario.id,
              accion: "EDITAR" as const,
              entidad: "indicador",
              entidad_id: indicatorId,
              proyecto_id: id,
              ...cambio,
            })),
          );
        }
        return updated;
      });

      return NextResponse.json({ indicador: toIndicadorView(row) });
    } catch (err) {
      if (isUniqueViolation(err, INDICADOR_INDEX)) return conflict(INDICADOR_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el indicador. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await db.indicador.findFirst({
      where: { id: indicatorId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(INDICADOR_NOT_FOUND, 404, "NOT_FOUND");

    const medicionesVivas = await db.medicionIndicador.count({
      where: { indicador_id: indicatorId, anulado_at: null },
    });
    if (medicionesVivas > 0) {
      return conflict("No puedes eliminar un indicador que tiene mediciones registradas. Anula sus mediciones primero.");
    }

    const row = await db.$transaction(async (tx) => {
      const updated = await tx.indicador.update({
        where: { id: indicatorId },
        data: { deleted_at: new Date() },
      });
      await logChanges(tx, [
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "indicador",
          entidad_id: indicatorId,
          proyecto_id: id,
          campo: "deleted_at",
          valor_anterior: null,
          valor_nuevo: updated.deleted_at,
        },
      ]);
      return updated;
    });

    return NextResponse.json({ indicador: toIndicadorView(row) });
  },
);
