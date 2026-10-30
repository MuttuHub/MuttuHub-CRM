// GET /api/v1/folders — árbol completo de carpetas activas. Una sola query:
// la escala real son decenas de carpetas (~4 KB), el árbol se arma en memoria.
// Cada nodo lleva su conteo de documentos (hijos directos, no recursivo),
// excluyendo categorías restringidas para COLABORADOR para que el sidebar no
// le filtre cuánto es lo que no puede ver.
// POST /api/v1/folders — crea una carpeta { nombre, parent_id?, cliente_id? }.
// La carpeta es el eje de ORGANIZACIÓN, nunca de permisos: cualquier usuario
// autenticado puede crear; parent_id válido, sin ciclos, profundidad <= 8.
// cliente_id (opcional, A5) la vuelve la carpeta de ese cliente: el cliente
// debe existir dentro del alcance de lectura de clientes (404 si no) y solo
// puede haber una por cliente — el índice único responde 409, nunca 500. Para
// "abrir o crear" la carpeta de un cliente está POST /clients/:id/folder.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { canReadRestrictedDocs } from "@/lib/permissions";
import { loadDocCategories } from "@/lib/api/documents";
import { FOLDER_MAX_DEPTH, validateFolderParent } from "@/lib/api/folders";
import { loadClientScoped } from "@/lib/api/crm";
import { FOLDER_SELECT, isUniqueViolation } from "@/lib/documents/client-folder";

export const dynamic = "force-dynamic";

type CarpetaNode = {
  id: string;
  nombre: string;
  parent_id: string | null;
  cliente_id: string | null;
  created_at: Date;
  hijos: CarpetaNode[];
  documentos_count: number;
};

export const GET = withApiErrorHandling(
  "folders",
  "No pudimos cargar las carpetas. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const [carpetas, conteos, restringidas] = await Promise.all([
      db.carpeta.findMany({
        where: { deleted_at: null },
        orderBy: { nombre: "asc" },
        select: FOLDER_SELECT,
      }),
      db.documento.groupBy({
        by: ["carpeta_id"],
        where: { deleted_at: null, carpeta_id: { not: null } },
        _count: { _all: true },
      }),
      // El conteo por carpeta excluye categorías restringidas para COLABORADOR.
      (async () => {
        const { restringidas } = await loadDocCategories();
        if (restringidas.length === 0 || canReadRestrictedDocs(auth.usuario.rol)) {
          return null;
        }
        const rows = await db.documento.groupBy({
          by: ["carpeta_id"],
          where: {
            deleted_at: null,
            carpeta_id: { not: null },
            categoria: { notIn: restringidas },
          },
          _count: { _all: true },
        });
        return new Map(rows.map((r) => [r.carpeta_id, r._count._all]));
      })(),
    ]);

    const countByFolder = new Map<string, number>();
    for (const row of conteos) {
      if (row.carpeta_id) {
        countByFolder.set(row.carpeta_id, row._count._all);
      }
    }
    if (restringidas) {
      for (const [folderId, count] of restringidas) {
        if (folderId) countByFolder.set(folderId, count);
      }
    }

    const byParent = new Map<string | null, CarpetaNode[]>();
    for (const c of carpetas) {
      const node: CarpetaNode = {
        id: c.id,
        nombre: c.nombre,
        parent_id: c.parent_id,
        cliente_id: c.cliente_id ?? null,
        created_at: c.created_at,
        hijos: [],
        documentos_count: countByFolder.get(c.id) ?? 0,
      };
      const list = byParent.get(c.parent_id) ?? [];
      list.push(node);
      byParent.set(c.parent_id, list);
    }

    const attach = (parentId: string | null): CarpetaNode[] =>
      (byParent.get(parentId) ?? []).map((n) => ({ ...n, hijos: attach(n.id) }));

    return NextResponse.json({ carpetas: attach(null) });
  },
);

export const POST = withApiErrorHandling(
  "folders",
  "No pudimos crear la carpeta. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<{ nombre?: string; parent_id?: string | null; cliente_id?: unknown }>(
      request,
    );
    const nombre = body?.nombre?.trim();
    if (!nombre) {
      return apiError("El nombre de la carpeta es obligatorio.", 400, "VALIDATION_ERROR");
    }
    if (nombre.length > 120) {
      return apiError("El nombre no puede superar los 120 caracteres.", 400, "VALIDATION_ERROR");
    }
    const parentId = body?.parent_id ?? null;
    const rawClienteId = body?.cliente_id;
    if (rawClienteId !== undefined && rawClienteId !== null && typeof rawClienteId !== "string") {
      return apiError("cliente_id debe ser el id de un cliente.", 400, "VALIDATION_ERROR");
    }
    const clienteId = typeof rawClienteId === "string" && rawClienteId.trim() ? rawClienteId.trim() : null;
    if (clienteId !== null && !(await loadClientScoped(clienteId))) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }

    if (parentId !== null) {
      const parent = await db.carpeta.findFirst({
        where: { id: parentId, deleted_at: null },
        select: { id: true },
      });
      if (!parent) {
        return apiError("La carpeta padre no existe.", 404, "NOT_FOUND");
      }
      const tree = await loadParentMap();
      const check = validateFolderParent(tree, "", parentId);
      if (!check.ok) {
        if (check.code === "CYCLE") {
          return apiError("La carpeta no puede contener su propio árbol.", 400, "VALIDATION_ERROR");
        }
        return apiError(`La profundidad máxima es de ${FOLDER_MAX_DEPTH} niveles.`, 400, "VALIDATION_ERROR");
      }
    }

    try {
      const carpeta = await db.carpeta.create({
        data: {
          nombre,
          parent_id: parentId,
          creado_por_id: auth.usuario.id,
          ...(clienteId !== null ? { cliente_id: clienteId } : {}),
        },
        select: FOLDER_SELECT,
      });
      return NextResponse.json({ carpeta }, { status: 201 });
    } catch (err) {
      // carpetas.cliente_id is unique (A5): a second folder for the same
      // client — or a concurrent create — is a conflict the user can act on.
      if (clienteId !== null && isUniqueViolation(err)) {
        return apiError("Este cliente ya tiene una carpeta. Usa la carpeta existente.", 409, "CONFLICT");
      }
      throw err;
    }
  },
);

/** All active folders as a parent_id map (id -> parent_id), for the walk. */
async function loadParentMap(): Promise<Map<string, string | null>> {
  const rows = await db.carpeta.findMany({
    where: { deleted_at: null },
    select: { id: true, parent_id: true },
  });
  return new Map(rows.map((r) => [r.id, r.parent_id]));
}