// PATCH /api/v1/projects/:id/objectives/:objectiveId — edit an objective (S3 U1).
// DELETE /api/v1/projects/:id/objectives/:objectiveId — soft-delete it.
//
// Manager-only and BORRADOR-only, in the order the project PATCH uses:
// 404 -> 403 -> 409 INVALID_STATE -> 400. An objective is only addressable
// through its own project (`proyecto_id` is part of the lookup), so another
// project's objective is a 404. Deleting is `deleted_at`, audited as
// `EDITAR objetivo.deleted_at`, and refused with 409 CONFLICT while the objective
// still has live activities (the indicator guard arrives with U3).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges } from "@/lib/api/audit-cambios";
import {
  NOTHING_TO_UPDATE,
  codigoField,
  conflict,
  gateEstructuraWrite,
  isUniqueViolation,
  ordenField,
  parseEstructuraBody,
} from "@/lib/api/estructura";
import { toObjetivoView } from "@/lib/proyectos/objetivo";
import { OBJETIVO_DUPLICATE_MESSAGE, OBJETIVO_INDEX } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; objectiveId: string }> };

const AUDITED_OBJETIVO_FIELDS = ["codigo", "descripcion", "orden"] as const;

export const OBJETIVO_PATCH_SCHEMA = z
  .object({
    codigo: codigoField.optional(),
    descripcion: z
      .string()
      .trim()
      .min(1, "La descripción no puede estar vacía.")
      .max(2000, "La descripción es muy larga.")
      .optional(),
    orden: ordenField.optional(),
  })
  .strict();

const OBJETIVO_NOT_FOUND = "El objetivo no existe.";

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el objetivo. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, objectiveId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, OBJETIVO_PATCH_SCHEMA);
    if (!body.ok) return body.response;

    const patch: { codigo?: string; descripcion?: string; orden?: number } = {};
    if (body.value.codigo !== undefined) patch.codigo = body.value.codigo;
    if (body.value.descripcion !== undefined) patch.descripcion = body.value.descripcion;
    if (body.value.orden !== undefined) patch.orden = body.value.orden;
    if (Object.keys(patch).length === 0) {
      return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");
    }

    const existente = await db.objetivo.findFirst({
      where: { id: objectiveId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(OBJETIVO_NOT_FOUND, 404, "NOT_FOUND");

    const cambios = diffFields(existente, patch, AUDITED_OBJETIVO_FIELDS);

    try {
      const row = await db.$transaction(async (tx) => {
        const updated = await tx.objetivo.update({ where: { id: objectiveId }, data: patch });
        if (cambios.length > 0) {
          await logChanges(
            tx,
            cambios.map((cambio) => ({
              usuario_id: auth.usuario.id,
              accion: "EDITAR" as const,
              entidad: "objetivo",
              entidad_id: objectiveId,
              proyecto_id: id,
              ...cambio,
            })),
          );
        }
        return updated;
      });

      return NextResponse.json({ objetivo: toObjetivoView(row) });
    } catch (err) {
      if (isUniqueViolation(err, OBJETIVO_INDEX)) return conflict(OBJETIVO_DUPLICATE_MESSAGE);
      throw err;
    }
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el objetivo. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, objectiveId } = await ctx.params;

    const gate = await gateEstructuraWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const existente = await db.objetivo.findFirst({
      where: { id: objectiveId, proyecto_id: id, deleted_at: null },
    });
    if (!existente) return apiError(OBJETIVO_NOT_FOUND, 404, "NOT_FOUND");

    const actividadesVivas = await db.actividad.count({
      where: { objetivo_id: objectiveId, deleted_at: null },
    });
    if (actividadesVivas > 0) {
      return conflict("No puedes eliminar un objetivo que tiene actividades. Elimina o reasigna sus actividades primero.");
    }

    const row = await db.$transaction(async (tx) => {
      const updated = await tx.objetivo.update({
        where: { id: objectiveId },
        data: { deleted_at: new Date() },
      });
      await logChanges(tx, [
        {
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "objetivo",
          entidad_id: objectiveId,
          proyecto_id: id,
          campo: "deleted_at",
          valor_anterior: null,
          valor_nuevo: updated.deleted_at,
        },
      ]);
      return updated;
    });

    return NextResponse.json({ objetivo: toObjetivoView(row) });
  },
);
