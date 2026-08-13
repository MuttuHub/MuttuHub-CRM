// POST /api/v1/auth/solicitud-acceso — public access request (PRD §3.1).
// No auth: anyone with a name + email can request access. The row lands in
// the admin queue (solicitudes_acceso) and approval is manual — there is no
// public signup with password (the password is chosen by the user when they
// redeem the invite email sent on approval).
//
// Anti-spam (best-effort): 409 when a PENDIENTE request already exists for
// the email, 409 when the email already has an app account (login instead),
// and an in-memory rate limit (3 requests / email / hour). NOTE: the rate
// limit lives in the module's Map — it is not shared across serverless
// instances and resets on cold starts; it only raises the bar for casual
// abuse. A durable limit would need the DB or a store (not in v1 scope).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apiError,
  isValidEmail,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_EMAIL = 3;

const rateLimit = new Map<string, { count: number; windowStart: number }>();

const SOLICITUD_SELECT = {
  id: true,
  estado: true,
  created_at: true,
} as const;

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
  "solicitud-acceso",
  "No pudimos guardar tu solicitud. Inténtalo de nuevo.",
  async (request: Request) => {
    const body = await parseJsonBody<{
      nombre?: string;
      email?: string;
      cargo?: string;
    }>(request);

    const nombre = body?.nombre?.trim() ?? "";
    const email = normalizeEmail(body?.email ?? "");
    const cargo = body?.cargo?.trim() || null;

    if (!nombre || !email) {
      return apiError(
        "Nombre y correo son obligatorios.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (!isValidEmail(email)) {
      return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
    }
    if (cargo && cargo.length > 120) {
      return apiError(
        "El cargo no puede superar los 120 caracteres.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (isRateLimited(email)) {
      return apiError(
        "Ya enviaste varias solicitudes con este correo. Espera un poco e inténtalo de nuevo.",
        429,
        "CONFLICT",
      );
    }

    const pending = await db.solicitudAcceso.findFirst({
      where: { email, estado: "PENDIENTE" },
      select: { id: true },
    });
    if (pending) {
      return apiError(
        "Ya tienes una solicitud en revisión. Pronto tendrás respuesta.",
        409,
        "CONFLICT",
      );
    }

    const existingUser = await db.usuario.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      return apiError(
        "Este correo ya tiene acceso al Hub. Inicia sesión.",
        409,
        "CONFLICT",
      );
    }

    const solicitud = await db.solicitudAcceso.create({
      data: { nombre, email, cargo, origen: "form" },
      select: SOLICITUD_SELECT,
    });
    return NextResponse.json({ solicitud }, { status: 201 });
  },
);