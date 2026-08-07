// Shared helpers for the documents repository API (Hito 4 / PRD §6, §8.2).
//
// Permission model (v1, documented in the README):
//   - Any authenticated user can create documents, upload versions, download
//     and list (except restricted categories).
//   - COLABORADOR never sees documents in RESTRICTED_DOC_CATEGORIES: they are
//     excluded from list/get and every download/zip/upload attempt returns
//     403 FORBIDDEN. Full roles (isFullAccess) see everything.
//   - Delete: full roles or the document author (Documento.autor_id).
//
// DocumentoVersion.subido_por_id has no FK to Usuario in the schema (nor does
// DocumentoCliente), so author/uploader names are resolved with batched
// usuario.findMany queries instead of relation selects — same approach the
// comments module uses for its autores.

import type { Prisma, Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { endOfDay, isFullAccess } from "@/lib/api/crm";
import { DOC_CATEGORIES, RESTRICTED_DOC_CATEGORIES } from "@/lib/catalogs";
import { apiError } from "@/lib/api/errors";

/** Light projection for list/detail rows (Documento has no updated_at). */
export const DOCUMENT_BASE_SELECT = {
  id: true,
  titulo: true,
  categoria: true,
  etiquetas: true,
  autor_id: true,
  created_at: true,
} as const;

export type DocumentRow = Prisma.DocumentoGetPayload<{
  select: typeof DOCUMENT_BASE_SELECT;
}>;

/** Projection shared by the version batch queries and the version list. */
export const DOCUMENT_VERSION_SELECT = {
  id: true,
  documento_id: true,
  numero_version: true,
  storage_path: true,
  tamano_bytes: true,
  tipo_archivo: true,
  subido_por_id: true,
  created_at: true,
} as const;

export type DocumentVersionRow = Prisma.DocumentoVersionGetPayload<{
  select: typeof DOCUMENT_VERSION_SELECT;
}>;

/** True when the user may read/download documents of this category. */
export function canReadCategory(usuario: Usuario, categoria: string): boolean {
  return isFullAccess(usuario.rol) || !RESTRICTED_DOC_CATEGORIES.includes(categoria);
}

/** HTTP status/message mapping shared by the 404/403 document gates. */
export function documentAccessError(code: "NOT_FOUND" | "FORBIDDEN") {
  return code === "NOT_FOUND"
    ? apiError("El documento no existe.", 404, "NOT_FOUND")
    : apiError("No tienes permisos sobre este documento.", 403, "FORBIDDEN");
}

/**
 * Read gate for a single document: 404 when missing/deleted, FORBIDDEN when
 * the caller is a COLABORADOR and the category is restricted. Returns the
 * category so the caller can branch on its own permission rules.
 */
export async function loadDocumentForRead(id: string, usuario: Usuario) {
  const documento = await db.documento.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, categoria: true },
  });
  if (!documento) return { ok: false as const, code: "NOT_FOUND" as const };
  if (!canReadCategory(usuario, documento.categoria)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, documento };
}

/**
 * Delete gate: full roles anywhere, COLABORADOR only on their own documents
 * (and never on restricted categories). Same 404/403 semantics as
 * getTaskForWrite / getClientForWrite.
 */
export async function loadDocumentForDelete(id: string, usuario: Usuario) {
  const documento = await db.documento.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, categoria: true, autor_id: true },
  });
  if (!documento) return { ok: false as const, code: "NOT_FOUND" as const };
  if (!canReadCategory(usuario, documento.categoria)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  if (!isFullAccess(usuario.rol) && documento.autor_id !== usuario.id) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  return { ok: true as const, documento };
}

/** Parsed query params for GET /documents, mirrors the clients/tasks ones. */
export type DocumentListFilters = {
  q?: string;
  categoria?: string;
  etiqueta?: string;
  cliente?: string;
  autor?: string;
  desde?: string;
  hasta?: string;
};

/**
 * Parses/validates the list query params (PRD §6.2 "Búsqueda": por nombre,
 * categoría, etiqueta, cliente, autor, rango de fecha).
 */
export function parseDocumentFilters(
  url: URL,
):
  | { ok: true; filters: DocumentListFilters }
  | { ok: false; response: Response } {
  const sp = url.searchParams;

  const categoria = sp.get("categoria") ?? undefined;
  if (categoria && !DOC_CATEGORIES.includes(categoria)) {
    return { ok: false, response: apiError("Categoría no válida.", 400, "VALIDATION_ERROR") };
  }
  const desde = sp.get("desde") ?? undefined;
  const hasta = sp.get("hasta") ?? undefined;
  if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, response: apiError("Fecha 'desde' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, response: apiError("Fecha 'hasta' no válida (YYYY-MM-DD).", 400, "VALIDATION_ERROR") };
  }

  return {
    ok: true,
    filters: {
      q: sp.get("q")?.trim() || undefined,
      categoria,
      etiqueta: sp.get("etiqueta")?.trim() || undefined,
      cliente: sp.get("cliente") ?? undefined,
      autor: sp.get("autor") ?? undefined,
      desde,
      hasta,
    },
  };
}

/**
 * List `where` incluyendo la exclusión de categorías restringidas para
 * COLABORADOR (el filtro de categoría convive con la exclusión, no la pisa).
 */
export function buildDocumentWhere(
  filters: DocumentListFilters,
  usuario: Usuario,
): Prisma.DocumentoWhereInput {
  const where: Prisma.DocumentoWhereInput = { deleted_at: null };
  if (!isFullAccess(usuario.rol)) {
    where.categoria = {
      notIn: [...RESTRICTED_DOC_CATEGORIES],
      ...(filters.categoria ? { equals: filters.categoria } : {}),
    };
  } else if (filters.categoria) {
    where.categoria = filters.categoria;
  }
  if (filters.etiqueta) where.etiquetas = { has: filters.etiqueta };
  if (filters.cliente) where.clientes = { some: { cliente_id: filters.cliente } };
  if (filters.autor) where.autor_id = filters.autor;
  if (filters.desde || filters.hasta) {
    const rango: Prisma.DateTimeFilter = {};
    if (filters.desde) rango.gte = new Date(filters.desde);
    if (filters.hasta) rango.lte = endOfDay(new Date(filters.hasta));
    where.created_at = rango;
  }
  const q = filters.q;
  if (q) {
    where.OR = [
      { titulo: { contains: q, mode: "insensitive" } },
      { categoria: { contains: q, mode: "insensitive" } },
      { etiquetas: { has: q } },
      { autor: { nombre: { contains: q, mode: "insensitive" } } },
      { clientes: { some: { cliente: { nombre: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  return where;
}

/**
 * One batch query for the active (max numero_version) version of each
 * document: groupBy for the max per document + fetch of exactly those rows
 * (the @@unique([documento_id, numero_version]) makes the pair unique).
 */
export async function loadActiveVersions(
  documentoIds: string[],
): Promise<Map<string, DocumentVersionRow>> {
  if (documentoIds.length === 0) return new Map();
  const grouped = await db.documentoVersion.groupBy({
    by: ["documento_id"],
    where: { documento_id: { in: documentoIds } },
    _max: { numero_version: true },
  });
  const pairs = grouped
    .map((g) => ({ documento_id: g.documento_id, numero_version: g._max.numero_version }))
    .filter((p): p is { documento_id: string; numero_version: number } => p.numero_version !== null);
  const versions = await db.documentoVersion.findMany({
    where: {
      OR: pairs.map((p) => ({
        documento_id: p.documento_id,
        numero_version: p.numero_version,
      })),
    },
    select: DOCUMENT_VERSION_SELECT,
  });
  return new Map(versions.map((v) => [v.documento_id, v]));
}

/** Batched nombre lookup for authors/uploaders (no FK on these models). */
export async function loadUserNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await db.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true },
  });
  return new Map(users.map((u) => [u.id, u.nombre]));
}

/** Batched minimal client list per document, via DocumentoCliente. */
export async function loadDocumentClients(
  documentoIds: string[],
): Promise<Map<string, { id: string; nombre: string }[]>> {
  if (documentoIds.length === 0) return new Map();
  const links = await db.documentoCliente.findMany({
    where: { documento_id: { in: documentoIds } },
    select: { documento_id: true, cliente: { select: { id: true, nombre: true } } },
  });
  const byDoc = new Map<string, { id: string; nombre: string }[]>();
  for (const link of links) {
    const list = byDoc.get(link.documento_id) ?? [];
    list.push({ id: link.cliente.id, nombre: link.cliente.nombre });
    byDoc.set(link.documento_id, list);
  }
  return byDoc;
}

/**
 * Carpeta de storage para NUEVAS versiones: solo cuando el documento tiene un
 * único cliente vinculado se usa su id como carpeta; con varios (o ninguno) se
 * usa "general" (la convención de path del PRD §6.2 asume un cliente por
 * documento). El POST de creación conoce su cliente_id de primera mano.
 */
export async function documentClientFolderForVersions(documentoId: string): Promise<string | null> {
  const links = await db.documentoCliente.findMany({
    where: { documento_id: documentoId },
    select: { cliente_id: true },
    take: 2,
  });
  return links.length === 1 ? links[0].cliente_id : null;
}

export type DocumentListItem = {
  id: string;
  titulo: string;
  categoria: string;
  etiquetas: string[];
  autor_id: string;
  autor_nombre: string;
  created_at: Date;
  /** Sin updated_at en el schema: la "actualización" es la versión activa. */
  updated_at: Date | null;
  cliente_ids: string[];
  clientes: { id: string; nombre: string }[];
  version_activa: {
    version_id: string;
    numero_version: number;
    tamano_bytes: number | null;
    tipo_archivo: string | null;
    created_at: Date;
    subido_por_id: string;
    subido_por_nombre: string;
  } | null;
};

/** Row + batch enrichments -> the JSON item shape shared by list/detail/create. */
export function toDocumentItem(
  doc: DocumentRow,
  activeVersions: Map<string, DocumentVersionRow>,
  userNames: Map<string, string>,
  clientsByDoc: Map<string, { id: string; nombre: string }[]>,
): DocumentListItem {
  const active = activeVersions.get(doc.id) ?? null;
  const clientes = clientsByDoc.get(doc.id) ?? [];
  return {
    id: doc.id,
    titulo: doc.titulo,
    categoria: doc.categoria,
    etiquetas: doc.etiquetas,
    autor_id: doc.autor_id,
    autor_nombre: userNames.get(doc.autor_id) ?? "—",
    created_at: doc.created_at,
    updated_at: active?.created_at ?? null,
    cliente_ids: clientes.map((c) => c.id),
    clientes,
    version_activa: active
      ? {
          version_id: active.id,
          numero_version: active.numero_version,
          tamano_bytes: active.tamano_bytes,
          tipo_archivo: active.tipo_archivo,
          created_at: active.created_at,
          subido_por_id: active.subido_por_id,
          subido_por_nombre: userNames.get(active.subido_por_id) ?? "—",
        }
      : null,
  };
}