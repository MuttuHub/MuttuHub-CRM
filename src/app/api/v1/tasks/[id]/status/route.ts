// PATCH /api/v1/tasks/:id/status — state transition (Kanban board moves,
// CRM state changes). `estado` is required, `motivo_bloqueo` when entering
// BLOQUEADA. Leaving BLOQUEADA always clears the motive. Returns the updated
// TaskItem. Write permission: same as the task PATCH (getTaskForWrite).

import { NextResponse } from "next/server";
import type { EstadoTarea } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import {
  catalogEnum,
  getTaskForWrite,
  TASK_SELECT,
  toTaskItem,
  zodError,
} from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const STATUS_SCHEMA = z.object({
  estado: catalogEnum(
    ENUM_VALUES.EstadoTarea as readonly EstadoTarea[],
    "Estado de tarea no válido.",
  ),
  motivo_bloqueo: z
    .string()
    .trim()
    .max(2000, "El motivo de bloqueo es muy largo.")
    .nullable()
    .optional(),
});

export async function PATCH(request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = STATUS_SCHEMA.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const motivo =
      parsed.data.motivo_bloqueo !== undefined
        ? parsed.data.motivo_bloqueo?.trim() || null
        : access.tarea.motivo_bloqueo;

    if (parsed.data.estado === "BLOQUEADA" && !motivo) {
      return apiError("Indica un motivo para bloquear.", 400, "VALIDATION_ERROR");
    }

    const updated = await db.tarea.update({
      where: { id },
      data: {
        estado: parsed.data.estado,
        // Leaving BLOQUEADA always clears the stored reason.
        motivo_bloqueo: parsed.data.estado === "BLOQUEADA" ? motivo : null,
      },
      select: TASK_SELECT,
    });
    return NextResponse.json({ task: toTaskItem(updated) });
  } catch (err) {
    console.error("[tasks] status failed:", err);
    return apiError("No pudimos actualizar el estado. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}