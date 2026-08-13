// GET/POST /api/v1/tasks/:id/subtasks — checklist de la tarjeta (PRD §5.2).
// NOT in the §8.2 contract (added per §5.2): the contract lists task CRUD,
// status, comments, attachments and export, but not the subtask endpoints.
// GET  → flat, unpaginated list [{id, titulo, completada, tarea_id}], read
//        scoped like the task detail (loadTaskScoped).
// POST → create {titulo 1-200, completada? default false} → 201. Write
//        permission = same as the task PATCH (getTaskForWrite).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite, loadTaskScoped, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const SUBTASK_SCHEMA = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, "El título de la subtarea es obligatorio.")
    .max(200, "El título es muy largo."),
  completada: z.boolean().optional(),
});

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos cargar las subtareas. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const tarea = await loadTaskScoped(id, auth.usuario);
    if (!tarea) {
      return apiError("La tarea no existe.", 404, "NOT_FOUND");
    }
    const subtareas = await db.subtarea.findMany({
      where: { tarea_id: id },
      orderBy: { id: "asc" },
      select: { id: true, titulo: true, completada: true, tarea_id: true },
    });
    return NextResponse.json({ subtareas });
  },
);

export const POST = withApiErrorHandling(
  "tasks",
  "No pudimos guardar la subtarea. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = SUBTASK_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const subtarea = await db.subtarea.create({
      data: {
        tarea_id: id,
        titulo: parsed.data.titulo,
        completada: parsed.data.completada ?? false,
      },
      select: { id: true, titulo: true, completada: true, tarea_id: true },
    });
    return NextResponse.json({ subtarea }, { status: 201 });
  },
);