// GET/PATCH/DELETE /api/v1/projects/:id/indicators/:indicatorId — Indicador
// detail, edit and soft delete. Same access axis as the parent
// indicators/route.ts. `indicatorId` is always scoped by `proyecto_id` on
// every query — an indicador from another project is treated as not found,
// never leaked through this route (same pattern as goals/[goalId]/route.ts).
// When `meta_id` is patched, it is re-validated against this project the
// same way creation does, mirroring activities/[activityId]/route.ts.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { INDICATOR_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; indicatorId: string }> };

export const INDICATOR_PATCH_SCHEMA = z
  .object({
    meta_id: z.string().min(1, "La meta no puede estar vacía."),
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre del indicador no puede estar vacío.")
      .max(200, "El nombre es muy largo."),
    unidad: z.string().trim().min(1, "La unidad no puede estar vacía.").max(100, "La unidad es muy larga."),
    meta_valor: z.number().positive("La meta del indicador debe ser mayor a cero."),
    valor_actual: z.number().min(0, "El valor actual no puede ser negativo."),
    cuenta_beneficiarios: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

async function loadIndicator(proyectoId: string, indicatorId: string) {
  return db.indicador.findFirst({
    where: { id: indicatorId, proyecto_id: proyectoId, deleted_at: null },
    select: INDICATOR_SELECT,
  });
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el indicador. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const indicador = await loadIndicator(id, indicatorId);
    if (!indicador) {
      return apiError("El indicador no existe.", 404, "NOT_FOUND");
    }

    return NextResponse.json({ indicador });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el indicador. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = INDICATOR_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para actualizar indicadores de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const indicador = await loadIndicator(id, indicatorId);
    if (!indicador) {
      return apiError("El indicador no existe.", 404, "NOT_FOUND");
    }

    // 3a.3-style friendly rejection of a cross-project meta_id on re-point,
    // same pattern as activities/[activityId]/route.ts.
    if (parsed.data.meta_id !== undefined) {
      const meta = await db.meta.findFirst({
        where: { id: parsed.data.meta_id, proyecto_id: id, deleted_at: null },
        select: { id: true },
      });
      if (!meta) {
        return apiError("La meta no existe o no pertenece a este proyecto.", 400, "VALIDATION_ERROR");
      }
    }

    const data: Prisma.IndicadorUncheckedUpdateInput = {};
    if (parsed.data.meta_id !== undefined) data.meta_id = parsed.data.meta_id;
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.unidad !== undefined) data.unidad = parsed.data.unidad;
    if (parsed.data.meta_valor !== undefined) data.meta_valor = new Prisma.Decimal(parsed.data.meta_valor);
    if (parsed.data.valor_actual !== undefined) data.valor_actual = new Prisma.Decimal(parsed.data.valor_actual);
    if (parsed.data.cuenta_beneficiarios !== undefined) data.cuenta_beneficiarios = parsed.data.cuenta_beneficiarios;

    const updated = await db.indicador.update({
      where: { id: indicatorId },
      data,
      select: INDICATOR_SELECT,
    });

    return NextResponse.json({ indicador: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar el indicador. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, indicatorId } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar indicadores de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const indicador = await loadIndicator(id, indicatorId);
    if (!indicador) {
      return apiError("El indicador no existe.", 404, "NOT_FOUND");
    }

    await db.indicador.update({
      where: { id: indicatorId },
      data: { deleted_at: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  },
);
