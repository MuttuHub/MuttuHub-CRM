// GET /api/v1/contacts — cross-client contact list (v7 alignment C4a
// Relaciones). READ-ONLY: creation and editing stay on the per-client routes
// (POST/PATCH/DELETE /clients/:id/contacts), so only GET is registered here.
//
// Read scope mirrors the client list reads, which are GLOBAL (PR 3): every
// signed-in role sees every client's contacts; only soft-deleted contacts and
// soft-deleted clients are hidden. Filters: `cliente_id` and, optionally, the
// power × interest quadrant (`con_quadrante`, or the exact `poder`/`interes`).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type ContactFeedFilters = {
  cliente_id?: string;
  poder?: number;
  interes?: number;
  con_quadrante?: boolean;
};

/** Projection for the feed: the contact plus its cliente and owner context. */
export const CONTACT_FEED_SELECT = {
  id: true,
  cliente_id: true,
  cliente: { select: { nombre: true } },
  nombre: true,
  cargo: true,
  correo: true,
  telefono: true,
  rol_decision: true,
  notas: true,
  poder: true,
  interes: true,
  fuerza_relacion: true,
  owner_id: true,
  owner: { select: { nombre: true } },
  created_at: true,
} as const;

/**
 * Shared feed `where`: soft-deleted contacts and clients are always hidden.
 * Reads are global, matching the client list (PR 3) — no per-role rewrite.
 * `con_quadrante` narrows to contacts that have both axes set; otherwise the
 * exact `poder`/`interes` values filter the list.
 */
export function buildContactWhere(filters: ContactFeedFilters): Prisma.ContactoWhereInput {
  const where: Prisma.ContactoWhereInput = {
    deleted_at: null,
    cliente: { deleted_at: null },
  };
  if (filters.cliente_id) where.cliente_id = filters.cliente_id;
  if (filters.con_quadrante) {
    where.poder = { not: null };
    where.interes = { not: null };
  } else {
    if (filters.poder !== undefined) where.poder = filters.poder;
    if (filters.interes !== undefined) where.interes = filters.interes;
  }
  return where;
}

/** Parses an optional 1..N query param; "invalid" means out of range/not int. */
function parseAxisParam(raw: string | null, min: number, max: number): number | null | "invalid" {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return "invalid";
  return value;
}

export const GET = withApiErrorHandling(
  "contacts",
  "No pudimos cargar los contactos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const cliente_id = url.searchParams.get("cliente_id")?.trim() || undefined;
    const con_quadrante = url.searchParams.get("con_quadrante") === "true";

    const poder = parseAxisParam(url.searchParams.get("poder"), 1, 5);
    if (poder === "invalid") {
      return apiError("El poder debe estar entre 1 y 5.", 400, "VALIDATION_ERROR");
    }
    const interes = parseAxisParam(url.searchParams.get("interes"), 1, 5);
    if (interes === "invalid") {
      return apiError("El interés debe estar entre 1 y 5.", 400, "VALIDATION_ERROR");
    }

    const rows = await db.contacto.findMany({
      where: buildContactWhere({
        cliente_id,
        poder: poder ?? undefined,
        interes: interes ?? undefined,
        con_quadrante,
      }),
      select: CONTACT_FEED_SELECT,
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({
      contactos: rows.map(({ cliente, owner, ...rest }) => ({
        ...rest,
        cliente_nombre: cliente.nombre,
        owner_nombre: owner?.nombre ?? null,
      })),
    });
  },
);
