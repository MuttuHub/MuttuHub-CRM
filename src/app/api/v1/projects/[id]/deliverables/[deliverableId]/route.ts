// PATCH /api/v1/projects/:id/deliverables/:deliverableId — edit a deliverable (S3 U3).
// DELETE /api/v1/projects/:id/deliverables/:deliverableId — soft-delete it.
//
// Manager-only and BORRADOR-only (404 -> 403 -> 409 INVALID_STATE -> 400). A
// deliverable is only addressable through its own project. Moving it to another
// activity requires a live activity of the same project. One `EDITAR` audit row
// per changed field, quantities compared as Decimals. Deleting is `deleted_at`,
// audited as `EDITAR entregable.deleted_at`; it answers 409 while the deliverable
// still has non-voided avances.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import {
  NOTHING_TO_UPDATE,
  cantidadPositivaField,
  codigoField,
  conflict,
  gateEstructuraWrite,
  isUniqueViolation,
  parseEstructuraBody,
  textoField,
  toDecimal2,
} from "@/lib/api/estructura";
import { toEntregableView } from "@/lib/proyectos/entregable";
import {
  ENTREGABLE_DUPLICATE_MESSAGE,
  ENTREGABLE_INDEX,
  checkActividadDelProyecto,
} from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; deliverableId: string }> };

const AUDITED_ENTREGABLE_FIELDS = [
  "actividad_id",
  "codigo",
  "descripcion",
  "cantidad_meta",
  "unidad",
  "tipo_medio_exigido",
] as const;

export const ENTREGABLE_PATCH_SCHEMA = z
  .object({
    actividad_id: z.string().min(1, "La actividad es obligatoria.").optional(),
    codigo: codigoField.optional(),
    descripcion: textoField("La descripción", 2000).optional(),
    cantidad_meta: cantidadPositivaField.optional(),
    unidad: textoField("La unidad", 100).optional(),
    tipo_medio_exigido: textoField("El tipo de medio exigido", 200).optional(),
  })
  .strict();

const ENTREGABLE_NOT_FOUND = "El entregable no existe.";

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el entregable. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, deliverableId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, ENTREGABLE_PATCH_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const patch: {
      actividad_id?: string;
      codigo?: string;
      descripcion?: string;
      cantidad_meta?: ReturnType<typeof toDecimal2>;
      unidad?: string;
      tipo_medio_exigido?: string;
    } = {};
    if (input.actividad_id !== undefined) patch.actividad_id = input.actividad_id;
    if (input.codigo !== undefined) patch.codigo = input.codigo;
    if (input.descripcion !== undefined) patch.descripcion = input.descripcion;
    if (input.cantidad_meta !== undefined) patch.cantidad_meta = toDecimal2(input.cantidad_meta);
    if (input.unidad !== undefined) patch.unidad = input.unidad;
    if (input.tipo_medio_exigido !== undefined) patch.tipo_medio_exigido = input.tipo_medio_exigido;
    if (Object.keys(patch).length === 0) {
      return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");
    }

    const existente = await db.entregable.findFirst({
      where: { id: deliverableId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(ENTREGABLE_NOT_FOUND, 404, "NOT_FOUND");

    if (patch.actividad_id !== undefined) {
      const actividadAjena = await checkActividadDelProyecto(id, patch.actividad_id);
      if (actividadAjena) return actividadAjena;
    }

    const cambios = diffFields(existente, patch, AUDITED_ENTREGABLE_FIELDS);

    try {
      const row = await db.$transaction(async (tx) => {
        const updated = await tx.entregable.update({ where: { id: deliverableId }, data: patch });
        if (cambios.length > 0) {
          await logChanges(
            tx,
            cambios.map((cambio) => ({
              usuario_id: auth.usuario.id,
              accion: "EDITAR" as const,
              entidad: "entregable",
              entidad_id: deliverableId,
              proyecto_id: id,
              ...cambio,
            })),
          );
        }
        return updated;
      });

      return NextResponse.json({ entregable: toEntregableView(row) });
    } catch (err) {
      if (isUniqueViolation(err, ENTREGABLE_INDEX)) return conflict(ENTREGABLE_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el entregable. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, deliverableId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await db.entregable.findFirst({
      where: { id: deliverableId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(ENTREGABLE_NOT_FOUND, 404, "NOT_FOUND");

    const avancesVivos = await db.avanceEntregable.count({
      where: { entregable_id: deliverableId, anulado_at: null },
    });
    if (avancesVivos > 0) {
      return conflict("No puedes eliminar un entregable que tiene avances registrados. Anula sus avances primero.");
    }

    const row = await db.$transaction(async (tx) => {
      const updated = await tx.entregable.update({
        where: { id: deliverableId },
        data: { deleted_at: new Date() },
      });
      await logChanges(tx, [
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "entregable",
          entidad_id: deliverableId,
          proyecto_id: id,
          campo: "deleted_at",
          valor_anterior: null,
          valor_nuevo: updated.deleted_at,
        },
      ]);
      return updated;
    });

    return NextResponse.json({ entregable: toEntregableView(row) });
  },
);
