// POST /api/v1/tasks/:id/comments — append a comment to the task thread.
// The thread is IMMUTABLE by design: ComentarioTarea has no updated_at nor
// deleted_at in the schema, and once posted a comment can never be edited or
// deleted — so there are intentionally no PATCH/DELETE routes here (same rule
// as the client bitácora, PRD §4.2/§8.2).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const COMMENT_SCHEMA = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El texto del comentario es obligatorio.")
    .max(4000, "El comentario no puede superar los 4000 caracteres."),
});

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = COMMENT_SCHEMA.safeParse(body);
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
  } catch (err) {
    console.error("[tasks] comment failed:", err);
    return apiError("No pudimos guardar el comentario. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}