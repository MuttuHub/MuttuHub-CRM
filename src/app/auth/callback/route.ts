// GET /auth/callback — Google OAuth handback (PRD §3.1). The browser lands
// here with a PKCE `code` after signInWithOAuth; the route exchanges it for a
// session, then routes by app account:
//
//   - Usuario row exists for the auth user → redirect / (registered login).
//   - No row (or the DB lookup failed) → record/refresh a SolicitudAcceso
//     with origen "google" (only when no PENDIENTE exists for the email) and
//     redirect /login?solicitud=1 so the page shows the review notice.
//   - Exchange errors → /login?error=1.
//
// Signed-in users hitting the callback without a code go straight to / to
// avoid a redirect loop.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }

  const supabase = await createServerSupabase();

  // Already signed in and no code to exchange: nothing to do here.
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (currentUser && !code) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error);
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }

  const user = data.user;
  const email = (user.email ?? "").trim().toLowerCase();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const nombre =
    (typeof meta?.nombre === "string" && meta.nombre.trim()) ||
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    email.split("@")[0] ||
    "Sin nombre";

  // Registered user → home. A DB failure is treated as "not registered" so
  // the request still lands in the queue instead of breaking the flow.
  let usuario = null;
  try {
    usuario = await db.usuario.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
  } catch (err) {
    console.error("[auth/callback] Usuario lookup failed (best-effort):", err);
  }

  if (usuario) {
    // Bitácora de accesos (PRD §3.3): best-effort, never blocks the redirect.
    try {
      await db.acceso.create({
        data: {
          usuario_id: user.id,
          ip: request.headers.get("x-forwarded-for") ?? null,
          user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
        },
      });
    } catch (err) {
      console.error("[auth/callback] Acceso log failed (best-effort):", err);
    }
    return NextResponse.redirect(new URL("/", url.origin));
  }

  try {
    const pendiente = await db.solicitudAcceso.findFirst({
      where: { email, estado: "PENDIENTE" },
      select: { id: true },
    });
    if (!pendiente) {
      const anterior = await db.solicitudAcceso.findFirst({
        where: { email },
        orderBy: { created_at: "desc" },
        select: { id: true },
      });
      if (anterior) {
        // Reopen a rejected/expired request (same queue, one per email) —
        // the requester can retry without accumulating rows.
        await db.solicitudAcceso.update({
          where: { id: anterior.id },
          data: {
            nombre,
            cargo: null,
            origen: "google",
            auth_id: user.id,
            estado: "PENDIENTE",
            revisado_por: null,
            revisado_at: null,
          },
        });
      } else {
        await db.solicitudAcceso.create({
          data: { nombre, email, origen: "google", auth_id: user.id },
        });
      }
    }
  } catch (err) {
    console.error("[auth/callback] solicitud upsert failed:", err);
  }

  // Revoke the session created by the exchange: the requester has no app
  // account yet, so the proxy would bounce them off /login back to the app.
  // After approval they sign in again (Google or email+password).
  await supabase.auth.signOut().catch(() => {});

  return NextResponse.redirect(new URL("/login?solicitud=1", url.origin));
}