// POST /api/v1/solicitudes-acceso/:id/aprobar — admin approval of a public
// access request (PRD §3.1). ADMINISTRADOR only. The path depends on origin:
//
//   - "form": inviteUserByEmail (same pattern as POST /api/v1/users) and then
//     create the Usuario row with the auth user id returned.
//   - "google": the auth user already exists (auth_id recorded at callback),
//     so only the Usuario row is created — id = auth_id, no invitation.
//
// The solicitud is marked APROBADA + revisado_por (admin id) + revisado_at.
// If the Prisma side fails after the invite, the auth user is rolled back so
// no orphan account is left behind (same as users module).

import { NextResponse } from "next/server";
import type { RolUsuario } from "@prisma/client";
import { db } from "@/lib/db";
import {
  apiError,
  parseJsonBody,
} from "@/lib/api/errors";
import { ROLE_LABELS } from "@/lib/auth/types";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const SOLICITUD_SELECT = {
  id: true,
  nombre: true,
  email: true,
  cargo: true,
  origen: true,
  auth_id: true,
} as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const body = await parseJsonBody<{ rol?: RolUsuario }>(request);
  const rol = body?.rol;

  if (!rol || !(rol in ROLE_LABELS)) {
    return apiError(
      "Debes elegir un rol válido para aprobar la solicitud.",
      400,
      "VALIDATION_ERROR",
    );
  }

  let solicitud: { id: string; nombre: string; email: string; cargo: string | null; origen: string; auth_id: string | null } | null = null;
  try {
    solicitud = await db.solicitudAcceso.findUnique({
      where: { id },
      select: SOLICITUD_SELECT,
    });
  } catch (err) {
    console.error("[solicitudes-acceso] get failed:", err);
    return apiError(
      "No pudimos cargar la solicitud. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
  if (!solicitud) {
    return apiError("La solicitud no existe.", 404, "NOT_FOUND");
  }

  try {
    const pendiente = await db.solicitudAcceso.findUnique({
      where: { id },
      select: { estado: true },
    });
    if (!pendiente || pendiente.estado !== "PENDIENTE") {
      return apiError(
        "Esta solicitud ya fue revisada.",
        409,
        "CONFLICT",
      );
    }
  } catch (err) {
    console.error("[solicitudes-acceso] estado check failed:", err);
    return apiError(
      "No pudimos cargar la solicitud. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  const supabaseAdmin = createSupabaseAdmin();

  // "form": create the auth user via invite email (the user picks their own
  // password when redeeming the link, PRD §3.1 — no password is requested).
  if (solicitud.origen === "form") {
    const { data: created, error: supabaseError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(solicitud.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "http://localhost:3000"}/auth/confirm`,
        data: { nombre: solicitud.nombre, rol },
      });

    if (supabaseError || !created.user) {
      console.error("[solicitudes-acceso] inviteUserByEmail failed:", supabaseError);
      const isDuplicate = String(supabaseError?.message ?? "").toLowerCase().includes("already registered");
      return apiError(
        isDuplicate
          ? "El correo ya tiene una cuenta en el Hub. Considera rechazar la solicitud."
          : "No pudimos enviar la invitación. Inténtalo de nuevo.",
        isDuplicate ? 409 : 500,
        isDuplicate ? "CONFLICT" : "INTERNAL_ERROR",
      );
    }

    try {
      await db.usuario.create({
        data: { id: created.user.id, nombre: solicitud.nombre, email: solicitud.email, rol },
        select: { id: true },
      });
    } catch (err) {
      console.error("[solicitudes-acceso] usuario create failed:", err);
      // Roll back the auth user so no orphan account is left behind.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return apiError(
        "No pudimos guardar el usuario. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }
  } else {
    // "google": the auth user already exists from the OAuth callback.
    if (!solicitud.auth_id) {
      return apiError(
        "La solicitud no tiene un usuario de Google asociado.",
        400,
        "VALIDATION_ERROR",
      );
    }
    try {
      await db.usuario.create({
        data: {
          id: solicitud.auth_id,
          nombre: solicitud.nombre,
          email: solicitud.email,
          rol,
        },
        select: { id: true },
      });
    } catch (err) {
      console.error("[solicitudes-acceso] usuario create failed:", err);
      return apiError(
        "No pudimos guardar el usuario. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }
  }

  try {
    await db.solicitudAcceso.update({
      where: { id },
      data: {
        estado: "APROBADA",
        revisado_por: auth.usuario.id,
        revisado_at: new Date(),
      },
    });
  } catch (err) {
    console.error("[solicitudes-acceso] mark approved failed:", err);
    return apiError(
      "Aprobamos el acceso pero no pudimos actualizar la solicitud. Reinténtalo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  return NextResponse.json({
    solicitud: {
      id,
      estado: "APROBADA",
      revisado_por: auth.usuario.id,
      revisado_at: new Date().toISOString(),
    },
  });
}