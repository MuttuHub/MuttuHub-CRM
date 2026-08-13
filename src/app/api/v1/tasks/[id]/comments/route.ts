// GET /api/v1/tasks/:id/comments — the task's comment thread (ascending).
//   Read scope mirrors the task detail GET (loadTaskScoped): 404 for
//   missing/deleted/out-of-scope tasks, no separate write check.
// POST /api/v1/tasks/:id/comments — append a comment to the task thread.
// The thread is IMMUTABLE by design: ComentarioTarea has no updated_at nor
// deleted_at in the schema, and once posted a comment can never be edited or
// deleted — so there are intentionally no PATCH/DELETE routes here (same rule
// as the client bitácora, PRD §4.2/§8.2).
//
// BUG FIX: GET was missing entirely — src/hooks/kanban.ts's useComments()
// has always called GET on this route (every task-dialog open), which
// 405'd every single time. This route only ever had POST.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite, loadTaskScoped, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const COMMENT_SCHEMA = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El texto del comentario es obligatorio.")
    .max(4000, "El comentario no puede superar los 4000 caracteres."),
});

export const GET = withApiErrorHandling(
  "tasks",
  "No pudimos cargar los comentarios. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const tarea = await loadTaskScoped(id, auth.usuario);
    if (!tarea) {
      return apiError("La tarea no existe.", 404, "NOT_FOUND");
    }
    const comentarios = await db.comentarioTarea.findMany({
      where: { tarea_id: id },
      orderBy: { created_at: "asc" },
      select: { id: true, autor_id: true, texto: true, created_at: true },
    });
    const autorIds = [...new Set(comentarios.map((c) => c.autor_id))];
    const autores = autorIds.length > 0
      ? await db.usuario.findMany({
          where: { id: { in: autorIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const autorNombreById = new Map(autores.map((a) => [a.id, a.nombre]));
    return NextResponse.json({
      comentarios: comentarios.map((c) => ({
        ...c,
        autor_nombre: autorNombreById.get(c.autor_id) ?? "",
      })),
    });
  },
);

export const POST = withApiErrorHandling(
  "tasks",
  "No pudimos guardar el comentario. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = COMMENT_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getTaskForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "La tarea no existe." : "No tienes permisos sobre esta tarea.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    // autor is always the session user — never a client-providable field.
    const comentario = await db.comentarioTarea.create({
      data: { tarea_id: id, autor_id: auth.usuario.id, texto: parsed.data.texto },
      select: { id: true, autor_id: true, texto: true, created_at: true },
    });
    const autor = await db.usuario.findFirst({
      where: { id: auth.usuario.id },
      select: { nombre: true },
    });
    if (!autor) throw new Error("comentario autor not found");
    return NextResponse.json(
      { comentario: { ...comentario, autor_nombre: autor.nombre } },
      { status: 201 },
    );
  },
);