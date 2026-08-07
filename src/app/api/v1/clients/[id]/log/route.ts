// GET/POST /api/v1/clients/:id/log — bitácora de gestión (PRD §4.2 tab
// "Bitácora de gestión"). Entries are IMMUTABLE by design: once saved they
// can never be edited or deleted — only appended (PRD §4.2, schema has no
// updated_at nor deleted_at on BitacoraEntrada). There are intentionally NO
// PATCH/DELETE routes for this resource.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { getClientForWrite, loadClientScoped, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const LOG_ENTRY_SCHEMA = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El texto de la nota es obligatorio.")
    .max(4000, "La nota no puede superar los 4000 caracteres."),
});

export async function GET(_request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  try {
    const cliente = await loadClientScoped(id, auth.usuario);
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    const entradas = await db.bitacoraEntrada.findMany({
      where: { cliente_id: id },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        autor_id: true,
        autor: { select: { nombre: true } },
        texto: true,
        created_at: true,
      },
    });
    return NextResponse.json({
      entradas: entradas.map(({ autor, ...entrada }) => ({
        ...entrada,
        autor_nombre: autor.nombre,
      })),
    });
  } catch (err) {
    console.error("[log] list failed:", err);
    return apiError("No pudimos cargar la bitácora. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await parseJsonBody<unknown>(request);
  if (body === null) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  const parsed = LOG_ENTRY_SCHEMA.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    // autor is always the session user — never a client-providable field.
    const entrada = await db.bitacoraEntrada.create({
      data: { cliente_id: id, autor_id: auth.usuario.id, texto: parsed.data.texto },
      select: {
        id: true,
        autor_id: true,
        autor: { select: { nombre: true } },
        texto: true,
        created_at: true,
      },
    });
    return NextResponse.json(
      { entrada: { ...entrada, autor_nombre: entrada.autor.nombre } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[log] create failed:", err);
    return apiError("No pudimos guardar la nota. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}