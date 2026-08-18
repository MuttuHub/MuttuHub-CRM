// GET /api/v1/auditoria — bitácora de auditoría de negocio (QA audit finding
// #9): creación/edición/eliminación de Cliente, Tarea y Documento. Solo
// ADMINISTRADOR. Paginación por keyset sobre created_at desc, mismo
// contrato que /api/v1/auth/accesos:
//   ?limit=N   (default 20, máximo 100)
//   ?before=ISO  (siguiente página: el created_at del último item anterior)
//   ?entidad=cliente|tarea|documento  (filtro opcional)
// Cada fila la escribe logAudit() (src/lib/api/audit.ts) desde los endpoints
// de negocio. Respuesta:
//   { registros: [{ id, entidad, entidad_id, accion, cambios, created_at,
//                    usuario: { email, nombre } }],
//     next_before: "ISO | null" }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ENTIDADES = ["cliente", "tarea", "documento"] as const;

export const GET = withApiErrorHandling(
  "auditoria",
  "No pudimos cargar la bitácora de auditoría. Inténtalo de nuevo.",
  async (request: Request) => {
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

    const entidad = sp.get("entidad");
    if (entidad !== null && !ENTIDADES.includes(entidad as (typeof ENTIDADES)[number])) {
      return apiError("El parámetro 'entidad' no es válido.", 400, "VALIDATION_ERROR");
    }

    const rows = await db.auditoria.findMany({
      where: {
        ...(before ? { created_at: { lt: before } } : {}),
        ...(entidad ? { entidad } : {}),
      },
      orderBy: { created_at: "desc" },
      take: limit + 1,
      select: {
        id: true,
        entidad: true,
        entidad_id: true,
        accion: true,
        cambios: true,
        created_at: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });

    const hasMore = rows.length > limit;
    const registros = hasMore ? rows.slice(0, limit) : rows;
    const next_before = hasMore ? registros[registros.length - 1].created_at.toISOString() : null;

    return NextResponse.json({ registros, next_before });
  },
);
