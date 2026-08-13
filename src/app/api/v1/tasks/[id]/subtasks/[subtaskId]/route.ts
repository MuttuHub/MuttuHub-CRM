// PATCH/DELETE /api/v1/tasks/:id/subtasks/:subtaskId — edit (titulo y/o
// completada) and remove checklist items (PRD §5.2).
// Not in the §8.2 contract (added per §5.2), same as the subtask list route.
// DELETE is a HARD delete: the Subtarea model has no deleted_at (nor
// updated_at) in the schema, and the PRD doesn't require soft delete for
// subtasks — removing the row is enough for a checklist item.
// Write permission = same as the task PATCH (getTaskForWrite).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; subtaskId: string }> };

export const SUBTASK_PATCH_SCHEMA = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(1, "El título de la subtarea no puede estar vacío.")
      .max(200, "El título es muy largo."),
    completada: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Envía al menos un campo para actualizar.");

const SUBTASK_SELECT = {
  id: true,
  titulo: true,
  completada: true,
  tarea_id: true,
} as const;

export const PATCH = withApiErrorHandling(
  "tasks",
  "No pudimos actualizar la subtarea. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, subtaskId } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = SUBTASK_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const subtarea = await db.subtarea.findFirst({
      where: { id: subtaskId, tarea_id: id },
      select: { id: true },
    });
    if (!subtarea) {
      return apiError("La subtarea no existe.", 404, "NOT_FOUND");
    }

    const data: Prisma.SubtareaUncheckedUpdateInput = {};
    if (parsed.data.titulo !== undefined) data.titulo = parsed.data.titulo;
    if (parsed.data.completada !== undefined) data.completada = parsed.data.completada;

    const updated = await db.subtarea.update({
      where: { id: subtaskId },
      data,
      select: SUBTASK_SELECT,
    });
    return NextResponse.json({ subtarea: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "tasks",
  "No pudimos eliminar la subtarea. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, subtaskId } = await ctx.params;

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const subtarea = await db.subtarea.findFirst({
      where: { id: subtaskId, tarea_id: id },
      select: { id: true },
    });
    if (!subtarea) {
      return apiError("La subtarea no existe.", 404, "NOT_FOUND");
    }

    await db.subtarea.delete({ where: { id: subtaskId } });
    return new NextResponse(null, { status: 204 });
  },
);