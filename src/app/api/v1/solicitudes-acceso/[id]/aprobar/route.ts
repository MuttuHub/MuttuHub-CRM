// POST /api/v1/solicitudes-acceso/:id/aprobar — admin approval of a public
// access request (PRD §3.1). ADMINISTRADOR only. The path depends on origin:
//
//   - "form": inviteUserByEmail, then create the Usuario row with the auth
//     user id returned.
//   - "google": the auth user already exists (auth_id recorded at callback),
//     so only the Usuario row is created — id = auth_id, no invitation.
//
// `auth_id` doubles as an idempotency checkpoint, not just Google's marker:
// right after a successful invite, it's saved on the solicitud BEFORE
// anything else happens. If a later step fails and the admin retries, the
// route sees auth_id already set and skips inviteUserByEmail entirely —
// it reuses that id instead of inviting again. Without this, a retry after
// a partial failure would invite the SAME email a second time and Supabase
// would reject it as "already registered", forever, with no way to recover
// except manually deleting the account. Once checkpointed, the auth user is
// never rolled back — only the invite step itself (before the checkpoint
// write lands) can still be safely undone, since nothing durable recorded
// it yet.
//
// Creating the Usuario row and marking the solicitud APROBADA happen inside
// one Prisma transaction: either both land or neither does. This closes the
// other half of the same bug — previously these were two separate writes,
// and a failure between them left a real Usuario account with no way to
// tell the solicitud was ever handled (stuck in PENDIENTE forever, while
// the account it was "still waiting on" already existed).

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
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const SOLICITUD_SELECT = {
  id: true,
  nombre: true,
  email: true,
  cargo: true,
  origen: true,
  auth_id: true,
  estado: true,
} as const;

type SolicitudRow = {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  origen: string;
  auth_id: string | null;
  estado: string;
};

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "solicitudes-acceso",
  "No pudimos aprobar la solicitud. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
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

  let solicitud: SolicitudRow | null = null;
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
  if (solicitud.estado !== "PENDIENTE") {
    return apiError("Esta solicitud ya fue revisada.", 409, "CONFLICT");
  }

  const supabaseAdmin = createSupabaseAdmin();
  let authId = solicitud.auth_id;

  if (!authId) {
    if (solicitud.origen !== "form") {
      return apiError(
        "La solicitud no tiene un usuario de Google asociado.",
        400,
        "VALIDATION_ERROR",
      );
    }

    // "form": create the auth user via invite email (the user picks their own
    // password when redeeming the link, PRD §3.1 — no password is requested).
    // The SDK call can THROW (bad service-role key, timeout, malformed URL)
    // instead of returning { data, error }: wrap it so the route answers the
    // JSON envelope instead of crashing into Vercel's raw 500.
    let created: { user: { id: string } | null } | null = null;
    let supabaseError: { message?: string; code?: string } | null = null;
    try {
      const res = await supabaseAdmin.auth.admin.inviteUserByEmail(solicitud.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "http://localhost:3000"}/auth/confirm`,
        data: { nombre: solicitud.nombre, rol },
      });
      created = res.data;
      supabaseError = res.error;
    } catch (err) {
      console.error("[solicitudes-acceso] inviteUserByEmail threw:", err);
      return apiError(
        "No pudimos enviar la invitación. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }

    if (supabaseError || !created?.user) {
      console.error("[solicitudes-acceso] inviteUserByEmail failed:", supabaseError);
      // Match Supabase's stable error code first — its human-readable message
      // has changed wording before ("already registered" -> "already been
      // registered"), which silently broke a plain substring check here and
      // let a real duplicate-email case fall through as a raw 500.
      const isDuplicate =
        supabaseError?.code === "email_exists" ||
        /already\s+(?:been\s+)?registered/i.test(String(supabaseError?.message ?? ""));
      return apiError(
        isDuplicate
          ? "El correo ya tiene una cuenta en el Hub. Considera rechazar la solicitud."
          : "No pudimos enviar la invitación. Inténtalo de nuevo.",
        isDuplicate ? 409 : 500,
        isDuplicate ? "CONFLICT" : "INTERNAL_ERROR",
      );
    }

    // Checkpoint immediately, before anything else touches Usuario or
    // estado: once this is saved, a retry always reuses this id instead of
    // inviting the same email again.
    try {
      await db.solicitudAcceso.update({
        where: { id },
        data: { auth_id: created.user.id },
      });
    } catch (err) {
      console.error("[solicitudes-acceso] auth_id checkpoint failed:", err);
      // Nothing durable recorded this invite yet — safe (and correct) to
      // roll it back so a retry starts clean instead of leaking an account.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return apiError(
        "No pudimos guardar el usuario. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }
    authId = created.user.id;
  }

  try {
    await db.$transaction([
      db.usuario.create({
        data: { id: authId, nombre: solicitud.nombre, email: solicitud.email, rol },
      }),
      db.solicitudAcceso.update({
        where: { id },
        data: {
          estado: "APROBADA",
          revisado_por: auth.usuario.id,
          revisado_at: new Date(),
        },
      }),
    ]);
  } catch (err) {
    console.error("[solicitudes-acceso] finalize failed:", err);
    // authId is already checkpointed (or was always known, for google) — it
    // is never rolled back here. A retry reuses it and only redoes this
    // transaction: no re-invite, no duplicate-email loop.
    return apiError(
      "Aprobamos el acceso pero no pudimos guardar el usuario. Reinténtalo.",
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
  },
);
