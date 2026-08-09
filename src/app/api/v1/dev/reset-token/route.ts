// GET /api/v1/dev/reset-token?email=... — dev-only helper that returns a
// verified password-recovery session (accessToken + refreshToken) for the
// given email WITHOUT an inbox. Used by TestSprite sign-in tests (TC006) and
// local smoke tests to complete the password-recovery flow end to end.
//
// Security: only reachable outside production builds. It emits a recovery
// session for any account and must never ship in a production environment.

import { NextResponse } from "next/server";
import { apiError, isValidEmail, normalizeEmail } from "@/lib/api/errors";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError("No disponible.", 404, "NOT_FOUND");
  }

  if (!isSupabaseConfigured()) {
    return apiError(
      "Plataforma no configurada. Revisa las variables de entorno.",
      500,
      "INTERNAL_ERROR",
    );
  }

  const email = normalizeEmail(
    new URL(request.url).searchParams.get("email") ?? "",
  );
  if (!email || !isValidEmail(email)) {
    return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return apiError(
      "Falta la service key en el entorno de desarrollo.",
      500,
      "INTERNAL_ERROR",
    );
  }

  try {
    // 1. Mint a recovery link for the account (no email sent).
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ type: "recovery", email }),
    });
    const linkBody = (await linkRes.json()) as {
      hashed_token?: string;
      error?: string;
      msg?: string;
    };

    if (!linkRes.ok || !linkBody.hashed_token) {
      console.error(
        "[dev/reset-token] generate_link failed:",
        linkRes.status,
        linkBody,
      );
      return apiError(
        "No pudimos generar el enlace de recuperación.",
        502,
        "INTERNAL_ERROR",
      );
    }

    // 2. Redeem the recovery token directly against the Auth API.
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        token_hash: linkBody.hashed_token,
        type: "recovery",
      }),
    });
    const verifyBody = (await verifyRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      msg?: string;
    };

    if (!verifyRes.ok || !verifyBody.access_token || !verifyBody.refresh_token) {
      console.error(
        "[dev/reset-token] verify failed:",
        verifyRes.status,
        verifyBody,
      );
      return apiError(
        "No pudimos canjear el enlace de recuperación.",
        502,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      accessToken: verifyBody.access_token,
      refreshToken: verifyBody.refresh_token,
    });
  } catch (error) {
    console.error("[dev/reset-token] unexpected failure:", error);
    return apiError(
      "No pudimos generar el token de recuperación.",
      500,
      "INTERNAL_ERROR",
    );
  }
}