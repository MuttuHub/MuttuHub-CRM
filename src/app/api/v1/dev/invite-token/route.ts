// GET /api/v1/dev/invite-token?email=... — dev-only helper that returns the
// invite `hashed_token` for the given email WITHOUT an inbox. Used by local
// Playwright/smoke tests to complete the invitation flow end to end (the
// /auth/confirm page redeems the token_hash and lets the user set a password).
//
// Security: same hardening as reset-token — requires NODE_ENV !== "production"
// AND an explicit ENABLE_DEV_ROUTES=true that nothing sets by default.
import { NextResponse } from "next/server";
import { apiError, isValidEmail, normalizeEmail } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const GET = withApiErrorHandling(
  "dev/invite-token",
  "No pudimos generar el token de invitación.",
  async (request: Request) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.ENABLE_DEV_ROUTES !== "true"
    ) {
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

    // Mint an invite link for the account (no email sent).
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ type: "invite", email }),
    });
    const linkBody = (await linkRes.json()) as {
      hashed_token?: string;
      error?: string;
      msg?: string;
    };

    if (!linkRes.ok || !linkBody.hashed_token) {
      console.error(
        "[dev/invite-token] generate_link failed:",
        linkRes.status,
        linkBody,
      );
      return apiError(
        "No pudimos generar el enlace de invitación.",
        502,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      hashed_token: linkBody.hashed_token,
    });
  },
);