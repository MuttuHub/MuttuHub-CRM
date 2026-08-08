// GET /api/v1/auth/accesos — bitácora de accesos (PRD §3.3, Hito 7). Solo
// ADMINISTRADOR. Paginación por keyset sobre created_at desc:
//   ?limit=N  (default 20, máximo 100)
//   ?before=ISO  (siguiente página: el created_at del último item anterior)
// Cada login exitoso escribe una fila en `accesos` (best-effort, ver
// POST /api/v1/auth/login). Respuesta:
//   { accesos: [{ id, created_at, ip, user_agent, usuario: { email, nombre } }],
//     next_before: "ISO | null" }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sp = url.searchParams;

  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return apiError("El parámetro 'limit' no es válido.", 400, "VALIDATION_ERROR");
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  let before: Date | undefined;
  const rawBefore = sp.get("before");
  if (rawBefore !== null) {
    const parsed = new Date(rawBefore);
    if (Number.isNaN(parsed.getTime())) {
      return apiError("El parámetro 'before' no es una fecha válida (ISO 8601).", 400, "VALIDATION_ERROR");
    }
    before = parsed;
  }

  try {
    const rows = await db.acceso.findMany({
      where: before ? { created_at: { lt: before } } : undefined,
      orderBy: { created_at: "desc" },
      take: limit + 1,
      select: {
        id: true,
        created_at: true,
        ip: true,
        user_agent: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });

    const hasMore = rows.length > limit;
    const accesos = hasMore ? rows.slice(0, limit) : rows;
    const next_before = hasMore ? accesos[accesos.length - 1].created_at.toISOString() : null;

    return NextResponse.json({ accesos, next_before });
  } catch (err) {
    console.error("[auth/accesos] failed:", err);
    return apiError("No pudimos cargar la bitácora de accesos. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}