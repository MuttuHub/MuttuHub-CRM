// POST /api/v1/auth/reinvite — resend the account-invitation email (PRD §3.1).
//
// Public, no auth: this is used from the "Enlace no válido" screen so a user
// whose invite link expired or was lost can ask for a fresh one without the
// admin's help. It never enumerates accounts: it always answers the same
// success message for a well-formed email, whether or not a pending invite
// exists.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apiError,
  isValidEmail,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_EMAIL = 3;

const rateLimit = new Map<string, { count: number; windowStart: number }>();

function pruneExpiredRateLimits(now: number) {
  for (const [email, entry] of rateLimit) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimit.delete(email);
    }
  }
}

function isRateLimited(email: string): boolean {
  const now = Date.now();
  pruneExpiredRateLimits(now);

  const entry = rateLimit.get(email);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimit.set(email, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_PER_EMAIL;
}

export const POST = withApiErrorHandling(
  "reinvite",
  "No pudimos reenviar el correo. Inténtalo de nuevo.",
  async (request: Request) => {
    const body = await parseJsonBody<{ email?: string }>(request);

    const email = normalizeEmail(body?.email ?? "");

    if (!email || !isValidEmail(email)) {
      return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
    }
    if (isRateLimited(email)) {
      return apiError(
        "Ya solicitaste varias veces con este correo. Espera un poco e inténtalo de nuevo.",
        429,
        "CONFLICT",
      );
    }

    // The app profile is the source of truth for "is an account". If it does
    // not exist, there is nothing to re-invite — but we respond the generic
    // success message anyway to avoid email enumeration.
    const appUser = await db.usuario.findUnique({
      where: { email },
      select: { id: true },
    });

    if (appUser) {
      const supabaseAdmin = createSupabaseAdmin();
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (baseUrl && serviceRole) {
        // GoTrue admin endpoint: POST /auth/v1/admin/users/{id}/reinvite.
        // The installed @supabase/auth-js has no reinviteUserById wrapper, so
        // call the REST endpoint directly with the service-role key. Failing
        // to send is not fatal here: the endpoint stays non-enumerating and
        // the caller just gets the generic "check your inbox" message.
        try {
          await fetch(
            `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(appUser.id)}/reinvite`,
            {
              method: "POST",
              headers: {
                apikey: serviceRole,
                Authorization: `Bearer ${serviceRole}`,
              },
            },
          );
        } catch (err) {
          console.error("[reinvite] resend failed (best-effort):", err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        "Si el correo está registrado y tiene una invitación pendiente, te la reenviamos.",
    });
  },
);