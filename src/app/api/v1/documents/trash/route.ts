// GET /api/v1/documents/trash — Papelera (S8): documentos con soft delete
// (deleted_at), ordenados por fecha de eliminación desc, con la misma
// paginación (page >= 1, limit 25 máx 100) y el mismo item que el listado,
// más `deleted_at` y `eliminado_por_nombre` (autor de la última fila de
// Auditoria documento/eliminar; null si no hay). Solo ADMINISTRADOR, GERENCIA
// y COORDINADOR (los roles que pueden escribir cualquier documento). La regla
// de categorías restringidas es la del listado (buildDocumentWhere).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { parsePagination } from "@/lib/api/crm";
import {
  buildDocumentWhere,
  DOCUMENT_BASE_SELECT,
  loadActiveVersions,
  loadDeletedByNames,
  loadDocumentClients,
  loadUserNames,
  toDocumentItem,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

const TRASH_SELECT = { ...DOCUMENT_BASE_SELECT, deleted_at: true } as const;

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos cargar la papelera. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR", "GERENCIA", "COORDINADOR"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const pagination = parsePagination(url.searchParams, 100);
    if (!pagination.ok) return pagination.response;

    // Same visibility rule as the list (restricted categories), but over the
    // deleted rows instead of the live ones.
    const where = { ...(await buildDocumentWhere({}, auth.usuario)), deleted_at: { not: null } };
    const [rows, total] = await Promise.all([
      db.documento.findMany({
        where,
        select: TRASH_SELECT,
        orderBy: { deleted_at: "desc" },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      db.documento.count({ where }),
    ]);

    const docIds = rows.map((r) => r.id);
    const [activeVersions, clientsByDoc, deletedBy] = await Promise.all([
      loadActiveVersions(docIds),
      loadDocumentClients(docIds),
      loadDeletedByNames(docIds),
    ]);
    const userNames = await loadUserNames([
      ...new Set([
        ...rows.map((r) => r.autor_id),
        ...[...activeVersions.values()].map((v) => v.subido_por_id),
      ]),
    ]);

    return NextResponse.json({
      page: pagination.page,
      limit: pagination.limit,
      total,
      items: rows.map((r) => ({
        ...toDocumentItem(r, activeVersions, userNames, clientsByDoc),
        // The where guarantees deleted_at is set on every row.
        deleted_at: r.deleted_at!.toISOString(),
        eliminado_por_nombre: deletedBy.get(r.id) ?? null,
      })),
    });
  },
);
