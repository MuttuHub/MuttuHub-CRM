// POST /api/v1/auth/login — email+password sign in (PRD §3.1, §8.2).
// Signs in via Supabase, then checks Usuario.activo; inactive accounts are
// signed straight back out and rejected with 403 INACTIVE.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apiError,
  isValidEmail,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
import { sessionExpiresAt } from "@/lib/auth/types";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return apiError(
      "Plataforma no configurada. Revisa las variables de entorno.",
      500,
      "INTERNAL_ERROR",
    );
  }

  const body = await parseJsonBody<{ email?: string; password?: string }>(
    request,
  );
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (!email || !password || !isValidEmail(email)) {
    return apiError("Correo y contraseña son obligatorios.", 400, "VALIDATION_ERROR");
  }

  const supabase = await createServerSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    // Same message for wrong credentials; never reveals account existence.
    return apiError("Correo o contraseña incorrectos.", 401, "UNAUTHORIZED");
  }

  let usuario = null;
  try {
    usuario = await db.usuario.findUnique({ where: { id: data.user.id } });
  } catch (err) {
    console.error("[auth/login] Usuario lookup failed:", err);
  }

  // DB unreachable: revoke the session we just created — safer to deny.
  if (!usuario) {
    await supabase.auth.signOut();
    return apiError(
      "No pudimos validar tu cuenta. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  if (!usuario.activo) {
    // PRD §3.1: the active session continues until it expires naturally, but
    // a fresh login attempt from an inactive account is rejected.
    await supabase.auth.signOut();
    return apiError(
      "Tu cuenta está inactiva. Contacta al administrador.",
      403,
      "INACTIVE",
    );
  }

  // Bitácora de accesos (PRD §3.3): best-effort, never blocks the login.
  try {
    await db.acceso.create({
      data: {
        usuario_id: usuario.id,
        ip: request.headers.get("x-forwarded-for") ?? null,
        user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
  } catch (err) {
    console.error("[auth/login] Acceso log failed (best-effort):", err);
  }

  return NextResponse.json({
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    },
    sessionExpiresAt: sessionExpiresAt(),
  });
}
