// GET /api/v1/auth/me — current session profile (PRD §8.2). 401 when no
// session; { usuario } when signed in (usuario null if the DB is down).

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return apiError("Sesión no válida o expirada.", 401, "UNAUTHORIZED");
  }
  return NextResponse.json({ usuario: session.usuario });
}