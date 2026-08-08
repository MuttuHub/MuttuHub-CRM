// Server-side Supabase client (@supabase/ssr createServerClient) with auth
// gate helpers for pages and API routes. Session cookie is 4h (PRD §3.1) and
// is driven by the Supabase JWT expiry configured in the dashboard (14400s).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { RolUsuario, Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";

/** True when the public Supabase env vars are present; false = unconfigured dev mode. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Server client reading cookies via next/headers (async API in Next 16). */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; cookies are read-only there.
            // Session refresh happens in proxy.ts (updateSession), not here.
          }
        },
      },
    },
  );
}

export type SessionUser = {
  /** App-level profile; null when Supabase is reachable but the DB is not. */
  usuario: Usuario | null;
  supabaseUser: User;
};

/**
 * Raw session fetch: null when unconfigured or no session; a SessionUser
 * otherwise (usuario may be null when the DB is unreachable — best-effort).
 * Any Prisma failure is logged and surfaced as usuario: null, never thrown.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  let usuario: Usuario | null = null;
  try {
    usuario = await db.usuario.findUnique({ where: { id: user.id } });
  } catch (err) {
    console.error("[auth] Usuario lookup failed (best-effort):", err);
  }

  return { usuario, supabaseUser: user };
}

/**
 * Page gate: redirects to /login when there is no session. Returns null only
 * in unconfigured dev mode so the demo stays visible without a Supabase
 * project (documented in the README).
 */
export async function requireUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session;
}

/**
 * Page gate for role-protected pages: redirects to /login without a session
 * and to `redirectTo` when the user lacks one of the required roles. Returns
 * null only in unconfigured dev mode.
 */
export async function requireRole(
  roles: RolUsuario[],
  redirectTo = "/",
): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.usuario || !roles.includes(session.usuario.rol)) {
    redirect(redirectTo);
  }
  return session;
}

type ApiAuthOk = { ok: true; usuario: Usuario; supabaseUser: User };
type ApiAuthFail = { ok: false; response: Response };

/**
 * API gate (users module etc.): returns a typed JSON error response instead
 * of redirecting. 401 UNAUTHORIZED / 403 FORBIDDEN / 500 INTERNAL_ERROR per
 * PRD §8.2.
 */
export async function requireApiUser(): Promise<ApiAuthOk | ApiAuthFail> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: apiError(
        "Plataforma no configurada. Revisa las variables de entorno.",
        500,
        "INTERNAL_ERROR",
      ),
    };
  }

  const session = await getSessionUser();
  if (!session) {
    return {
      ok: false,
      response: apiError("Sesión no válida o expirada.", 401, "UNAUTHORIZED"),
    };
  }
  if (!session.usuario) {
    return {
      ok: false,
      response: apiError(
        "No pudimos verificar tus permisos. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      ),
    };
  }
  return { ok: true, usuario: session.usuario, supabaseUser: session.supabaseUser };
}

// TODO(Hito 7): los permisos granulares por módulo del PRD §3.3.2 quedaron
// FUERA del alcance v1 — los gates son por rol completo (requireRole /
// requireApiRole), sin combinaciones finas por módulo o recurso.

/** API gate restricted to the given roles (ADMINISTRADOR for users module). */
export async function requireApiRole(
  roles: RolUsuario[],
): Promise<ApiAuthOk | ApiAuthFail> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  if (!roles.includes(auth.usuario.rol)) {
    return {
      ok: false,
      response: apiError(
        "No tienes permisos para realizar esta acción.",
        403,
        "FORBIDDEN",
      ),
    };
  }
  return auth;
}
