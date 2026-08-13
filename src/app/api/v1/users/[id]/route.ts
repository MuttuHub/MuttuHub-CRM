// PATCH /api/v1/users/:id — role, activo or nombre updates (ADMINISTRADOR).
// Audit columns (updated_at) are handled by Prisma @updatedAt.

import { NextResponse } from "next/server";
import type { RolUsuario } from "@prisma/client";
import { db } from "@/lib/db";
import {
  apiError,
  parseJsonBody,
} from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { ROLE_LABELS } from "@/lib/auth/types";
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

export const PATCH = withApiErrorHandling(
  "users",
  "No pudimos actualizar el usuario. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;

    const body = await parseJsonBody<{
      rol?: RolUsuario;
      activo?: boolean;
      nombre?: string;
    }>(request);

    const data: { rol?: RolUsuario; activo?: boolean; nombre?: string } = {};

    if (body?.rol !== undefined) {
      if (!(body.rol in ROLE_LABELS)) {
        return apiError("Rol no válido.", 400, "VALIDATION_ERROR");
      }
      data.rol = body.rol;
    }
    if (body?.activo !== undefined) {
      data.activo = Boolean(body.activo);
    }
    if (body?.nombre !== undefined) {
      const nombre = body.nombre.trim();
      if (!nombre) {
        return apiError("El nombre no puede estar vacío.", 400, "VALIDATION_ERROR");
      }
      data.nombre = nombre;
    }

    if (Object.keys(data).length === 0) {
      return apiError(
        "Envía al menos un campo para actualizar.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const existing = await db.usuario.findUnique({ where: { id } });
    if (!existing) {
      return apiError("El usuario no existe.", 404, "NOT_FOUND");
    }

    // Guard A — self-demotion lockout: an admin must never change their own
    // role or deactivate themselves through this route, or they could strip
    // their own access and leave the account stranded. Own `nombre` is fine.
    const isSelf = auth.usuario.id === existing.id;
    const changesRole =
      body?.rol !== undefined && body.rol !== existing.rol;
    const changesActive =
      body?.activo !== undefined && body.activo !== existing.activo;
    if (isSelf && (changesRole || changesActive)) {
      return apiError(
        "No puedes cambiar tu propio rol ni desactivarte. Pide a otro administrador que lo haga.",
        400,
        "VALIDATION_ERROR",
      );
    }

    // Guard B — last-admin lockout: demoting or deactivating an admin must
    // never leave the Hub without an active administrator to manage users.
    const demotesAdmin =
      existing.rol === "ADMINISTRADOR" &&
      body?.rol !== undefined &&
      body.rol !== "ADMINISTRADOR";
    const deactivatesAdmin =
      existing.rol === "ADMINISTRADOR" && body?.activo === false;
    if (demotesAdmin || deactivatesAdmin) {
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
      data,
      select: USER_SELECT,
    });
    return NextResponse.json({ usuario });
  },
);
