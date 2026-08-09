// POST /api/v1/auth/reset-password/confirm — thin server fallback for the
// new-password step. The confirm page primarily uses the direct Supabase
// flow (exchangeCodeForSession + updateUser); this route exists as a switch
// for when the client flow cannot complete (PRD §8.2).
//
// Accepted inputs (all optional but at least one session source is required):
//   - code:          PKCE recovery code (exchanged first)
//   - accessToken + refreshToken: an already-verified recovery session
//                    (used by the dev reset-token flow, no browser needed)

import { NextResponse } from "next/server";
import {
  apiError,
  isValidPassword,
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

  const body = await parseJsonBody<{
    code?: string;
    accessToken?: string;
    refreshToken?: string;
    newPassword?: string;
  }>(request);

  const newPassword = body?.newPassword ?? "";
  if (!isValidPassword(newPassword)) {
    return apiError(
      "La contraseña debe tener al menos 8 caracteres, con letras y números.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const supabase = await createServerSupabase();

  // When a recovery code is present, exchange it first (PKCE flow). When a
  // verified recovery session is supplied as tokens, restore it. The route
  // also works with an already-established session (no session source).
  if (body?.code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(body.code);
    if (exchangeError) {
      console.error(
        "[auth/reset-password/confirm] exchangeCodeForSession failed:",
        exchangeError,
      );
      return apiError(
        "El enlace de recuperación no es válido o ya expiró.",
        400,
        "VALIDATION_ERROR",
      );
    }
  } else if (body?.accessToken && body?.refreshToken) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: body.accessToken,
      refresh_token: body.refreshToken,
    });
    if (setSessionError) {
      console.error(
        "[auth/reset-password/confirm] setSession failed:",
        setSessionError,
      );
      return apiError(
        "El enlace de recuperación no es válido o ya expiró.",
        400,
        "VALIDATION_ERROR",
      );
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error("[auth/reset-password/confirm] updateUser failed:", error);
    return apiError(
      "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Contraseña actualizada. Ya puedes iniciar sesión.",
  });
}