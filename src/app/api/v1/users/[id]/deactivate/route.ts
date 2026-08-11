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

    // Guard A — self-deactivation lockout: an admin must never deactivate
    // themselves, or they could strip their own access and strand the account.
    if (auth.usuario.id === existing.id) {
      return apiError(
        "No puedes desactivarte a ti mismo. Pide a otro administrador que lo haga.",
        400,
        "VALIDATION_ERROR",
      );
    }

    // Guard B — last-admin lockout: deactivating an admin must never leave
    // the Hub without an active administrator to manage users.
    if (existing.rol === "ADMINISTRADOR") {
      const activeAdmins = await db.usuario.count({
        where: { rol: "ADMINISTRADOR", activo: true },
      });
      if (activeAdmins <= 1) {
        return apiError(
          "Debe quedar al menos un administrador activo en el Hub.",
          400,
          "VALIDATION_ERROR",
        );
      }
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