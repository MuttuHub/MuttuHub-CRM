// Session guard + cookie refresh for the whole app (PRD §3.1).
// Next.js 16 renamed the middleware convention to proxy; file and export are
// both `proxy`. API routes are excluded from this matcher on purpose: they
// answer 401/403 JSON themselves (PRD §8.2) instead of browser redirects.
//
// Unconfigured dev mode: when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are missing
// every request passes through, so the demo stays visible; the login page
// renders a "plataforma no configurada" notice card instead of the form.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/reset-password"];

// Reachable by both anonymous and logged-in users: the email confirmation
// link arrives with the OTP token in the query string and the page exchanges
// it itself (verifyOtp / exchangeCodeForSession). Forcing login would drop
// the token for fresh signups; forcing logout would break change-email flows.
const NEUTRAL_PATHS = ["/auth/confirm"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isNeutralPath(pathname: string): boolean {
  return NEUTRAL_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validates the JWT (and refreshes it if close to expiry).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname) && !isNeutralPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Logged-in users don't need the auth pages (neutral paths are exempt).
  if (user && isPublicPath(pathname) && !isNeutralPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Everything except static assets and the API surface (routes auth
    // themselves with JSON error envelopes, PRD §8.2).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)$).*)",
  ],
};
