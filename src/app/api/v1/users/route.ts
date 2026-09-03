// Users admin API (PRD §3.3, §8.2). ADMINISTRADOR only — every handler goes
// through requireApiRole which answers 401/403 JSON instead of redirects.
//
// KEY DESIGN DECISION: the app-level Usuario row gets `id = Supabase auth
// user uuid`. An admin creating a user calls supabase.admin.createUser first
// (service role key), then prisma.usuario.create with that same id — a 1:1
// mapping that keeps FK integrity between Supabase Auth and the usuarios
// table (documented in the README).

import { NextResponse } from "next/server";
import type { RolUsuario } from "@prisma/client";
import { db } from "@/lib/db";
import {
  apiError,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { ROLE_LABELS } from "@/lib/auth/types";
import {
  requireApiRole,
} from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  created_at: true,
} as const;

export const GET = withApiErrorHandling(
  "users",
  "No pudimos cargar los usuarios. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const usuarios = await db.usuario.findMany({
      select: USER_SELECT,
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ usuarios });
  },
);

export const POST = withApiErrorHandling(
  "users",
  "No pudimos crear el usuario. Inténtalo de nuevo.",
  async (request: Request) => {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<{
    nombre?: string;
    email?: string;
    rol?: RolUsuario;
    password?: string;
    invite?: boolean;
  }>(request);

  const nombre = body?.nombre?.trim() ?? "";
  const email = normalizeEmail(body?.email ?? "");
  const rol = body?.rol;
  const password = body?.password ?? "";
  // Invitation mode (`invite: true`, default in the UI) creates the auth user
  // via inviteUserByEmail: no password is required and the user receives an
  // email with an OTP link to set their own password on first sign-in.
  const isInvite = body?.invite === true;

  if (!nombre || !email || !rol) {
    return apiError(
      "Nombre, correo y rol son obligatorios.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (!isValidEmail(email)) {
    return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
  }
  if (!(rol in ROLE_LABELS)) {
    return apiError("Rol no válido.", 400, "VALIDATION_ERROR");
  }
  if (!isInvite && !isValidPassword(password)) {
    return apiError(
      "La contraseña debe tener al menos 8 caracteres, con letras y números.",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Early conflict check (best-effort; Supabase is the final authority).
  try {
    const existing = await db.usuario.findUnique({ where: { email } });
    if (existing) {
      return apiError("El correo ya está registrado.", 409, "CONFLICT");
    }
  } catch (err) {
    console.error("[users] email conflict check failed:", err);
  }

  // Service-role client: auth.admin.* (createUser/deleteUser/inviteUserByEmail)
  // requires the service role key, the anon-key client cannot perform admin
  // operations. inviteUserByEmail returns the same { data: { user }, error }
  // shape as createUser, so both modes share the error path and rollback below.
  const supabaseAdmin = createSupabaseAdmin();

  const { data: created, error: supabaseError } = isInvite
    ? await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        // Standard Supabase fallback after the invite link is redeemed. The
        // repo's custom template (supabase/email-templates/invite.html) already
        // points to /auth/confirm, which handles type=invite via verifyOtp.
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "http://localhost:3000"}/auth/confirm`,
        // user_metadata forwarded to the email template ({{ .Data }}).
        data: { nombre, rol },
      })
    : await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

  if (supabaseError) {
    // Never leak the raw Supabase error message.
    console.error("[users] supabase admin failed:", supabaseError);

    // 422 "already registered" happens when the auth user already exists but
    // has not accepted its invite (or confirmed email). That is a RE-INVITE
    // case, not a hard conflict: look the user up and resend via
    // reinviteUserById so an existing pending invite gets a fresh link.
    //
    // Match the stable error code first — Supabase's human-readable message
    // has changed wording before ("already registered" -> "already been
    // registered"), which silently broke a plain substring check here and
    // let a real duplicate-email case fall through as a raw 500.
    const isDuplicate =
      supabaseError.code === "email_exists" ||
      /already\s+(?:been\s+)?registered/i.test(String(supabaseError.message ?? ""));

    if (isDuplicate) {
      const { data: existingAuth } =
        await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = (existingAuth?.users ?? []).find(
        (u) => u.email?.trim().toLowerCase() === email.toLowerCase(),
      );
      if (match && !match.email_confirmed_at) {
        // Regenerate a fresh invite link for the existing (pending) user via
        // generateLink({ type: "invite" }) — inviteUserByEmail would return
        // 422 for an already-registered address. The link is returned to the
        // admin UI to copy/send instead of relying on SMTP delivery.
        const { data: linkData, error: linkError } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "invite",
            email,
          });
        if (linkError || !linkData?.properties?.action_link) {
          console.error("[users] generateLink failed:", linkError);
          return apiError(
            "No pudimos generar el enlace de invitación. Inténtalo de nuevo.",
            500,
            "INTERNAL_ERROR",
          );
        }
        return NextResponse.json(
          {
            resent: true,
            inviteUrl: linkData.properties.action_link,
            message: "Enlace de invitación generado.",
          },
          { status: 200 },
        );
      }
      return apiError("El correo ya está registrado.", 409, "CONFLICT");
    }

    return apiError(
      "No pudimos crear el usuario. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  if (!created?.user) {
    return apiError(
      "No pudimos crear el usuario. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  try {
    // Usuario.id = Supabase auth user uuid (1:1 mapping, FK integrity).
    const usuario = await db.usuario.create({
      data: {
        id: created.user.id,
        nombre,
        email,
        rol,
      },
      select: USER_SELECT,
    });

    // Best-effort reconciliation: an admin creating a user directly for an
    // email that also has a pending public access request (PRD §3.1) should
    // resolve that queue entry instead of leaving an orphan PENDIENTE row.
    // Same fields the approval endpoint sets (aprobar/route.ts). A failure
    // here never fails the request — the user was already created, which is
    // the primary outcome.
    try {
      const pendiente = await db.solicitudAcceso.findFirst({
        where: { email, estado: "PENDIENTE" },
        select: { id: true },
      });
      if (pendiente) {
        await db.solicitudAcceso.update({
          where: { id: pendiente.id },
          data: {
            estado: "APROBADA",
            revisado_por: auth.usuario.id,
            revisado_at: new Date(),
          },
        });
      }
    } catch (err) {
      console.error("[users] solicitud reconciliation failed:", err);
    }

    return NextResponse.json({ usuario }, { status: 201 });
  } catch (err) {
    console.error("[users] prisma create failed:", err);
    // Roll back the Supabase side so no orphan auth user is left behind.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return apiError(
      "No pudimos guardar el usuario. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
  },
);