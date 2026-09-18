// GET/PATCH/DELETE /api/v1/projects/:id/goals/:goalId — Meta detail, edit and
// soft delete. Same access axis as the parent goals/route.ts. `goalId` is
// always scoped by `proyecto_id` on every query — a meta from another
// project is treated as not found, never leaked through this route.

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { zodError } from "@/lib/api/crm";
import { getProjectForWrite, loadProjectScoped } from "@/lib/api/projects";
import { GOAL_SELECT } from "../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; goalId: string }> };

export const GOAL_PATCH_SCHEMA = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre de la meta no puede estar vacío.")
      .max(200, "El nombre es muy largo."),
    descripcion: z.string().trim().max(2000, "La descripción es muy larga."),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

async function loadGoal(proyectoId: string, goalId: string) {
  return db.meta.findFirst({
    where: { id: goalId, proyecto_id: proyectoId, deleted_at: null },
    select: GOAL_SELECT,
  });
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar la meta. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, goalId } = await ctx.params;

    const access = await loadProjectScoped(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El proyecto no existe." : "No tienes permisos sobre este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const meta = await loadGoal(id, goalId);
    if (!meta) {
      return apiError("La meta no existe.", 404, "NOT_FOUND");
    }

    return NextResponse.json({ meta });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar la meta. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, goalId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = GOAL_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para actualizar metas de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const meta = await loadGoal(id, goalId);
    if (!meta) {
      return apiError("La meta no existe.", 404, "NOT_FOUND");
    }

    const data: Prisma.MetaUncheckedUpdateInput = {};
    if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre;
    if (parsed.data.descripcion !== undefined) data.descripcion = parsed.data.descripcion.trim() || null;

    const updated = await db.meta.update({
      where: { id: goalId },
      data,
      select: GOAL_SELECT,
    });

    return NextResponse.json({ meta: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "projects",
  "No pudimos eliminar la meta. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, goalId } = await ctx.params;

    const access = await getProjectForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND"
          ? "El proyecto no existe."
          : "No tienes permisos para eliminar metas de este proyecto.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const meta = await loadGoal(id, goalId);
    if (!meta) {
      return apiError("La meta no existe.", 404, "NOT_FOUND");
    }

    await db.meta.update({
      where: { id: goalId },
      data: { deleted_at: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  },
);
