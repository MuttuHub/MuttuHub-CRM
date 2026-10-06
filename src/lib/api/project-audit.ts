/**
 * Reader of the append-only change ledger for one project (REQ-AUD-04). It
 * mirrors the split `src/lib/api/projects.ts` uses for the projects API: the
 * query and the row -> DTO mapper live here, and the route only gates access
 * and wraps the result — so the SQL shape is unit-testable without a request.
 *
 * Two decisions this file owns, both documented because the columns invite the
 * wrong shortcut:
 *
 * 1. Ordering. `created_at` defaults to `now()`, which in Postgres is the
 *    *transaction* timestamp, not the statement's. The E-05 conversion writes
 *    both of a lote's rows (CONVERTIR oportunidad + CREAR proyecto) through one
 *    `logChanges` call, so the two rows carry the SAME instant. Ordering by
 *    `created_at` alone is therefore ambiguous (and would let a page boundary
 *    skip or repeat a row). The read adds `id` as a stable tiebreaker — the
 *    same composite order the v1 audit endpoint already uses
 *    (`src/app/api/v1/auditoria/route.ts`).
 *
 * 2. Bounded read. The ledger is append-only and grows forever, so the reader
 *    caps the page at `PROJECT_AUDIT_LIMIT` rows, newest first. The cap is part
 *    of the OpenAPI description, never a silent truncation.
 *
 * Actor names cannot come from a relation: `usuario_id` has no FK on purpose,
 * so the ledger survives a deleted user. The name is resolved in a SECOND
 * query over `usuario` by the distinct ids; an id with no surviving row maps to
 * `usuario_nombre: null` — no fabricated name and no crash.
 */

import type { AccionAuditoria, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Bounded page size: the ledger is append-only, so a read must never be unbounded. */
export const PROJECT_AUDIT_LIMIT = 100;

/** Columns the reader exposes; the route adds nothing on top of them. */
export const PROJECT_AUDIT_SELECT = {
  id: true,
  created_at: true,
  usuario_id: true,
  accion: true,
  entidad: true,
  entidad_id: true,
  campo: true,
  valor_anterior: true,
  valor_nuevo: true,
  lote_id: true,
} as const;

export type ProjectAuditRow = Prisma.AuditoriaCambioGetPayload<{
  select: typeof PROJECT_AUDIT_SELECT;
}>;

/**
 * Row -> JSON. `created_at` is the only reshaped value: the driver's `Date`
 * becomes an ISO string so the client never re-parses a driver object. The JSON
 * columns (`valor_anterior`/`valor_nuevo`) are handed back exactly as stored —
 * the ledger's payloads are not this reader's to reshape.
 */
export type ProjectAuditEntry = {
  id: string;
  created_at: string;
  usuario_id: string;
  usuario_nombre: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  lote_id: string | null;
};

/**
 * Deterministic order, newest first. The explicit `as const` keeps the literals
 * narrow so the array stays assignable to Prisma's order-by input.
 */
export const PROJECT_AUDIT_ORDER_BY = [
  { created_at: "desc" as const },
  { id: "desc" as const },
];

/** `where` of the history read: the project the caller may read. */
export function projectAuditWhere(proyectoId: string): Prisma.AuditoriaCambioWhereInput {
  return { proyecto_id: proyectoId };
}

export function toProjectAuditEntry(
  row: ProjectAuditRow,
  usuarioNombre: string | null,
): ProjectAuditEntry {
  return {
    id: row.id,
    created_at: row.created_at.toISOString(),
    usuario_id: row.usuario_id,
    usuario_nombre: usuarioNombre,
    accion: row.accion,
    entidad: row.entidad,
    entidad_id: row.entidad_id,
    campo: row.campo,
    valor_anterior: row.valor_anterior,
    valor_nuevo: row.valor_nuevo,
    lote_id: row.lote_id,
  };
}

/**
 * Names of the distinct actors of `rows`, in one second query. The map simply
 * omits any id that no longer has a `usuario` row, which is what makes the
 * "no fabricated name" fallback possible at the mapper's call site.
 */
export async function resolveProjectAuditActors(
  rows: readonly Pick<ProjectAuditRow, "usuario_id">[],
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.usuario_id))];
  if (ids.length === 0) return new Map();

  const usuarios = await db.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true },
  });
  return new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
}

/** Newest-first, capped history of one project with actor names resolved. */
export async function listProjectAudit(proyectoId: string): Promise<ProjectAuditEntry[]> {
  const rows = await db.auditoriaCambio.findMany({
    where: projectAuditWhere(proyectoId),
    orderBy: PROJECT_AUDIT_ORDER_BY,
    take: PROJECT_AUDIT_LIMIT,
    select: PROJECT_AUDIT_SELECT,
  });

  const actores = await resolveProjectAuditActors(rows);
  return rows.map((row) => toProjectAuditEntry(row, actores.get(row.usuario_id) ?? null));
}
