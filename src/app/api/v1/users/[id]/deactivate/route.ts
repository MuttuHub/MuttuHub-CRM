// POST /api/v1/users/:id/deactivate — soft deactivation (PRD §3.4):
// activo = false, never a hard delete; the user keeps full history.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiRole } from "@/lib/supabase/server";

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  created_at: true,
} as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: RouteContext) {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  try {
    const existing = await db.usuario.findUnique({ where: { id } });
    if (!existing) {
      return apiError("El usuario no existe.", 404, "NOT_FOUND");
    }
    const usuario = await db.usuario.update({
      where: { id },
      data: { activo: false },
      select: USER_SELECT,
    });
    return NextResponse.json({ usuario });
  } catch (err) {
    console.error("[users] deactivate failed:", err);
    return apiError(
      "No pudimos desactivar el usuario. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
}