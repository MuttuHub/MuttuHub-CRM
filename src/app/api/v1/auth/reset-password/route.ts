// POST /api/v1/auth/reset-password — sends a password recovery email.
// Always answers 200 for a well-formed email (no user enumeration, PRD §3.1).

import { NextResponse } from "next/server";
import {
  apiError,
  isValidEmail,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
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

  const body = await parseJsonBody<{ email?: string }>(request);
  const email = normalizeEmail(body?.email ?? "");

  if (!email || !isValidEmail(email)) {
    return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
  }

  const supabase = await createServerSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password/confirm?next=/login`,
  });

  if (error) {
    // Email provider errors are real failures; account existence never leaks.
    console.error("[auth/reset-password] resetPasswordForEmail failed:", error);
    return apiError(
      "No pudimos enviar el correo. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
  });
}