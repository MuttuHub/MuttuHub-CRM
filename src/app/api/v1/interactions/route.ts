// GET /api/v1/interactions — cross-client Interacciones feed (v7 alignment
// C3a). READ-ONLY: interactions are the immutable `BitacoraEntrada` rows, so
// creation stays on the per-client POST /clients/:id/log and there are
// intentionally NO PATCH/DELETE routes here (same immutability contract).
//
// Read scope: ADMINISTRADOR and GERENCIA see every client's interactions; every
// other role only those of the clients they are the responsable of (see
// `clienteFeedScope`). Soft-deleted clients are always hidden. Filters: `cliente_id` and `tipo` (the TipoInteraccion catalog).

import { NextResponse } from "next/server";
import type { Prisma, TipoInteraccion } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { clienteFeedScope } from "@/lib/api/crm";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Mirrors the Prisma `TipoInteraccion` enum (kept local: the shared
// ENUM_VALUES catalog is outside this unit's edit surface).
const TIPOS_INTERACCION = ["REUNION", "CORREO", "LLAMADA", "VISITA", "OTRO"] as const;

export type InteractionFeedFilters = {
  /** Read scope of the caller; when omitted the feed is unscoped (managers). */
  scope?: Prisma.ClienteWhereInput;
  cliente_id?: string;
  tipo?: string;
};

/** Projection for the feed: the entry plus its cliente/oportunidad context. */
export const INTERACTION_FEED_SELECT = {
  id: true,
  cliente_id: true,
  cliente: { select: { nombre: true } },
  oportunidad_id: true,
  oportunidad: { select: { nombre: true } },
  autor_id: true,
  autor: { select: { nombre: true } },
  texto: true,
  tipo: true,
  proximo_paso: true,
  created_at: true,
} as const;

/**
 * Shared feed `where`: soft-deleted clients are always hidden and
 * `filters.scope` narrows the owning client (responsable) for non-managers.
 */
export function buildInteractionWhere(
  filters: InteractionFeedFilters,
): Prisma.BitacoraEntradaWhereInput {
  const where: Prisma.BitacoraEntradaWhereInput = {
    cliente: { deleted_at: null, ...filters.scope },
  };
  if (filters.cliente_id) where.cliente_id = filters.cliente_id;
  if (filters.tipo) where.tipo = filters.tipo as TipoInteraccion;
  return where;
}

export const GET = withApiErrorHandling(
  "interactions",
  "No pudimos cargar las interacciones. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo") ?? undefined;
    if (tipo && !TIPOS_INTERACCION.includes(tipo as (typeof TIPOS_INTERACCION)[number])) {
      return apiError("Tipo de interacción no válido.", 400, "VALIDATION_ERROR");
    }
    const cliente_id = url.searchParams.get("cliente_id")?.trim() || undefined;

    const rows = await db.bitacoraEntrada.findMany({
      where: buildInteractionWhere({ scope: clienteFeedScope(), cliente_id, tipo }),
      select: INTERACTION_FEED_SELECT,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({
      interacciones: rows.map(({ cliente, autor, oportunidad, ...rest }) => ({
        ...rest,
        cliente_nombre: cliente.nombre,
        autor_nombre: autor.nombre,
        oportunidad_nombre: oportunidad?.nombre ?? null,
      })),
    });
  },
);
