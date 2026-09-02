// GET /api/v1/tasks/:id — task detail: TaskItem + immutable comment thread
//   (ascending). Read scope mirrors the list; 404 for missing/deleted/out of
//   scope.
// PATCH /api/v1/tasks/:id — partial update of any editable field (same
//   validation as POST; nullable fields accept null to clear them).
// DELETE /api/v1/tasks/:id — soft delete (deleted_at = now), 204.
// Write permission: full roles anywhere; COLABORADOR only when they are the
// task's responsable (or the responsable of the linked client) — see
// getTaskForWrite in src/lib/api/crm.ts.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import {
  bloqueoValido,
  TASK_SCHEMA,
} from "@/app/api/v1/tasks/route";
import {
  getTaskForWrite,
  loadTaskScoped,
  parseDate,
  TASK_SELECT,
  toTaskItem,
  zodError,
  completedAtFor,
} from "@/lib/api/crm";
import { canEditTask } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const TASK_PATCH_SCHEMA = TASK_SCHEMA.partial().refine(
  (d) => Object.keys(d).length > 0,
  "Envía al menos un campo para actualizar.",
);

const COMENTARIO_SELECT = {
  id: true,
  autor_id: true,
  texto: true,
  created_at: true,
} as const;

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos cargar la tarea. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const tarea = await loadTaskScoped(id, auth.usuario);
    if (!tarea) {
      return apiError("La tarea no existe.", 404, "NOT_FOUND");
    }
    const [row, comentarios] = await Promise.all([
      db.tarea.findUnique({ where: { id }, select: TASK_SELECT }),
      db.comentarioTarea.findMany({
        where: { tarea_id: id },
        orderBy: { created_at: "asc" },
        select: COMENTARIO_SELECT,
      }),
    ]);
    const autorIds = [...new Set(comentarios.map((c) => c.autor_id))];
    const autores = autorIds.length > 0
      ? await db.usuario.findMany({
          where: { id: { in: autorIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const autorNombreById = new Map(autores.map((a) => [a.id, a.nombre]));
    // Server-authoritative flag (PR 2): sub-entities inherit it from the parent
    // task — recomputing per row would require N extra parent reads.
    const puede_editar = canEditTask(
      {
        responsable_id: row!.responsable_id,
        cliente_responsable_id: row!.cliente?.responsable_id ?? null,
      },
      { id: auth.usuario.id, rol: auth.usuario.rol },
    );
    return NextResponse.json({
      task: {
        ...toTaskItem(row!),
        puede_editar,
        comentarios: comentarios.map((c) => ({
          ...c,
          autor_nombre: autorNombreById.get(c.autor_id) ?? "",
          puede_editar,
        })),
      },
    });
  },
);

export const PATCH = withApiErrorHandling(
  "tasks",
  "No pudimos actualizar la tarea. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = TASK_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    const effectiveEstado = parsed.data.estado ?? access.tarea.estado;
    const effectiveMotivo =
      parsed.data.motivo_bloqueo !== undefined
        ? parsed.data.motivo_bloqueo
        : access.tarea.motivo_bloqueo;
    if (!bloqueoValido(effectiveEstado, effectiveMotivo)) {
      return apiError("Indica un motivo para bloquear.", 400, "VALIDATION_ERROR");
    }

    if (parsed.data.responsable_id !== undefined) {
      const nuevoResponsable = await db.usuario.findFirst({
        where: { id: parsed.data.responsable_id, activo: true },
      });
      if (!nuevoResponsable) {
        return apiError("El responsable no existe o está inactivo.", 400, "VALIDATION_ERROR");
      }
    }

    if (parsed.data.cliente_id !== undefined && parsed.data.cliente_id !== null) {
      const cliente = await db.cliente.findFirst({
        where: { id: parsed.data.cliente_id, deleted_at: null },
        select: { id: true },
      });
      if (!cliente) {
        return apiError("El cliente no existe o fue eliminado.", 400, "VALIDATION_ERROR");
      }
    }

    const data: Prisma.TareaUncheckedUpdateInput = {};
    if (parsed.data.titulo !== undefined) data.titulo = parsed.data.titulo;
    if (parsed.data.descripcion !== undefined) {
      data.descripcion = parsed.data.descripcion === null ? null : parsed.data.descripcion.trim();
    }
    if (parsed.data.responsable_id !== undefined) data.responsable_id = parsed.data.responsable_id;
    if (parsed.data.cliente_id !== undefined) data.cliente_id = parsed.data.cliente_id;
    if (parsed.data.estado !== undefined) {
      data.estado = parsed.data.estado;
      // Plan Fase 3 (3B): marca real de cierre, vía el helper central (misma
      // regla que el endpoint de status).
      Object.assign(data, completedAtFor(parsed.data.estado, access.tarea.estado));
    }
    if (parsed.data.origen !== undefined) data.origen = parsed.data.origen;
    if (parsed.data.prioridad !== undefined) data.prioridad = parsed.data.prioridad;
    if (parsed.data.etiquetas !== undefined) {
      data.etiquetas = { set: parsed.data.etiquetas ?? [] };
    }
    if (parsed.data.fecha_entrega !== undefined) {
      data.fecha_entrega =
        parsed.data.fecha_entrega === null ? null : parseDate(parsed.data.fecha_entrega);
    }
    if (parsed.data.motivo_bloqueo !== undefined) {
      data.motivo_bloqueo =
        parsed.data.motivo_bloqueo === null ? null : parsed.data.motivo_bloqueo.trim() || null;
    }

    const updated = await db.tarea.update({ where: { id }, data, select: TASK_SELECT });
    await logAudit({
      entidad: "tarea",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: parsed.data,
    });
    return NextResponse.json({ task: toTaskItem(updated) });
  },
);

export const DELETE = withApiErrorHandling(
  "tasks",
  "No pudimos eliminar la tarea. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }
    await db.tarea.update({ where: { id }, data: { deleted_at: new Date() } });
    await logAudit({
      entidad: "tarea",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });
    return new NextResponse(null, { status: 204 });
  },
);