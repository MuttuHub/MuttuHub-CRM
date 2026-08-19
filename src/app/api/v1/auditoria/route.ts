// GET /api/v1/auditoria — bitácora de auditoría de negocio (QA audit finding
// #9): creación/edición/eliminación de Cliente, Tarea y Documento. Solo
// ADMINISTRADOR. Paginación por keyset, mismo contrato base que
// /api/v1/auth/accesos:
//   ?limit=N   (default 20, máximo 100)
//   ?before=<cursor opaco>  (el next_before de la página anterior)
//   ?entidad=cliente|tarea|documento  (filtro opcional)
// Cada fila la escribe logAudit() (src/lib/api/audit.ts) desde los endpoints
// de negocio. Respuesta:
//   { registros: [{ id, entidad, entidad_id, accion, cambios, created_at,
//                    usuario: { email, nombre } }],
//     next_before: "<cursor> | null" }
//
// Cursor compuesto (created_at, id) — no solo created_at (bug de code
// review): dos filas escritas en el mismo instante son indistinguibles con
// un cursor de un solo campo, así que en el borde de una página una de las
// dos podía saltearse o duplicarse silenciosamente. El id no tiene orden
// semántico (es un uuid), pero alcanza con que sea estable: mismo orderBy y
// mismo desempate en el WHERE garantizan que cada fila aparezca una sola vez.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ENTIDADES = ["cliente", "tarea", "documento"] as const;

type Cursor = { createdAt: Date; id: string };

/** "<ISO>_<uuid>" -> { createdAt, id }, o null si el formato no es válido. */
function parseCursor(raw: string): Cursor | null {
  const sep = raw.lastIndexOf("_");
  if (sep <= 0) return null;
  const createdAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

function encodeCursor(row: { created_at: Date; id: string }): string {
  return `${row.created_at.toISOString()}_${row.id}`;
}

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

    let cursor: Cursor | undefined;
    const rawBefore = sp.get("before");
    if (rawBefore !== null) {
      const parsed = parseCursor(rawBefore);
      if (!parsed) {
        return apiError("El parámetro 'before' no es válido.", 400, "VALIDATION_ERROR");
      }
      cursor = parsed;
    }

    const entidad = sp.get("entidad");
    if (entidad !== null && !ENTIDADES.includes(entidad as (typeof ENTIDADES)[number])) {
      return apiError("El parámetro 'entidad' no es válido.", 400, "VALIDATION_ERROR");
    }

    const rows = await db.auditoria.findMany({
      where: {
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
        ...(entidad ? { entidad } : {}),
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
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
    const next_before = hasMore ? encodeCursor(registros[registros.length - 1]) : null;

    return NextResponse.json({ registros, next_before });
  },
);
