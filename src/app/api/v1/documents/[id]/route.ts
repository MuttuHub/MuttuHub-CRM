// GET /api/v1/documents/:id — detalle completo del documento: campos base,
// clientes, autor (nombres resueltos por lote), la versión activa y el
// historial completo de versiones (desc). 404 si no existe/borrado; 403 cuando
// la categoría es restringida y el usuario es COLABORADOR.
// DELETE /api/v1/documents/:id — soft delete (deleted_at) del documento
// completo; las versiones conservan el historial pero el documento desaparece
// de todos los listados (PRD §6.2: nunca se borra una versión individual).
// Permiso: roles completos o el autor del documento.
// PATCH /api/v1/documents/:id — edición de metadatos (plan Fase 2, 4C):
// { titulo?, categoria?, etiquetas?, carpeta_id?, cliente_ids? }. Gate
// loadDocumentForWrite (full roles o autor, y nunca sobre categoría
// restringida) + regla propia: la categoría ENTRANTE tampoco puede ser
// restringida para un COLABORADOR (una escritura cuyo resultado no puede
// leer). cliente_ids es reemplazo completo dentro de $transaction.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { canReadRestrictedDocs } from "@/lib/permissions";
import {
  DOCUMENT_BASE_SELECT,
  DOCUMENT_VERSION_SELECT,
  documentAccessError,
  loadActiveVersions,
  loadDocCategories,
  loadDocumentClients,
  loadDocumentForDelete,
  loadDocumentForRead,
  loadDocumentForWrite,
  loadUserNames,
  toDocumentItem,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos cargar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForRead(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    const [documento, versiones, clientsByDoc, activeVersions] = await Promise.all([
      db.documento.findFirst({
        where: { id, deleted_at: null },
        select: DOCUMENT_BASE_SELECT,
      }),
      db.documentoVersion.findMany({
        where: { documento_id: id },
        orderBy: { numero_version: "desc" },
        select: DOCUMENT_VERSION_SELECT,
      }),
      loadDocumentClients([id]),
      loadActiveVersions([id]),
    ]);
    if (!documento) {
      return apiError("El documento no existe.", 404, "NOT_FOUND");
    }

    const userNames = await loadUserNames([
      ...new Set([documento.autor_id, ...versiones.map((v) => v.subido_por_id)]),
    ]);

    const versionesConNombre = versiones.map((v) => ({
      ...v,
      subido_por_nombre: userNames.get(v.subido_por_id) ?? "—",
    }));

    return NextResponse.json({
      documento: {
        ...toDocumentItem(documento, activeVersions, userNames, clientsByDoc),
        versiones: versionesConNombre,
        versiones_count: versiones.length,
      },
    });
  },
);

export const DELETE = withApiErrorHandling(
  "documents",
  "No pudimos eliminar el documento. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const access = await loadDocumentForDelete(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    await db.documento.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await logAudit({
      entidad: "documento",
      entidad_id: id,
      accion: "eliminar",
      usuario_id: auth.usuario.id,
    });
    return new NextResponse(null, { status: 204 });
  },
);

const MAX_ETIQUETAS = 8; // misma validación que el POST de subida
const MAX_ETIQUETA_LENGTH = 40;
const MAX_TITULO_LENGTH = 200;

export const PATCH = withApiErrorHandling(
  "documents",
  "No pudimos actualizar el documento. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<{
      titulo?: string;
      categoria?: string;
      etiquetas?: string[];
      carpeta_id?: string | null;
      cliente_ids?: string[];
    }>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    if (Object.keys(body).length === 0) {
      return apiError("Envía al menos un campo para actualizar.", 400, "VALIDATION_ERROR");
    }

    const access = await loadDocumentForWrite(id, auth.usuario);
    if (!access.ok) return documentAccessError(access.code);

    const { categorias, restringidas } = await loadDocCategories();

    const data: { titulo?: string; categoria?: string; etiquetas?: string[]; carpeta_id?: string | null } = {};

    if (body.titulo !== undefined) {
      const titulo = body.titulo.trim();
      if (!titulo) {
        return apiError("El título es obligatorio.", 400, "VALIDATION_ERROR");
      }
      if (titulo.length > MAX_TITULO_LENGTH) {
        return apiError(`El título no puede superar los ${MAX_TITULO_LENGTH} caracteres.`, 400, "VALIDATION_ERROR");
      }
      data.titulo = titulo;
    }

    if (body.categoria !== undefined) {
      if (!categorias.includes(body.categoria)) {
        return apiError("Categoría no válida.", 400, "VALIDATION_ERROR");
      }
      // Regla propia del PATCH: mover a una categoría restringida es una
      // escritura cuyo resultado el COLABORADOR no podría leer.
      if (!canReadRestrictedDocs(auth.usuario.rol) && restringidas.includes(body.categoria)) {
        return apiError("No tienes permisos para documentos de esa categoría.", 403, "FORBIDDEN");
      }
      data.categoria = body.categoria;
    }

    if (body.etiquetas !== undefined) {
      if (!Array.isArray(body.etiquetas)) {
        return apiError("Las etiquetas deben ser un arreglo de strings.", 400, "VALIDATION_ERROR");
      }
      const etiquetas = body.etiquetas
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => e.slice(0, MAX_ETIQUETA_LENGTH));
      if (etiquetas.length > MAX_ETIQUETAS) {
        return apiError(`Demasiadas etiquetas (máximo ${MAX_ETIQUETAS}).`, 400, "VALIDATION_ERROR");
      }
      data.etiquetas = etiquetas;
    }

    if (body.carpeta_id !== undefined) {
      const carpetaId = body.carpeta_id;
      if (carpetaId !== null) {
        const carpeta = await db.carpeta.findFirst({
          where: { id: carpetaId, deleted_at: null },
          select: { id: true },
        });
        if (!carpeta) {
          return apiError("La carpeta no existe.", 404, "NOT_FOUND");
        }
      }
      data.carpeta_id = carpetaId;
    }

    let clienteIds: string[] | undefined;
    if (body.cliente_ids !== undefined) {
      if (!Array.isArray(body.cliente_ids)) {
        return apiError("cliente_ids debe ser un arreglo de ids.", 400, "VALIDATION_ERROR");
      }
      const ids = [...new Set(body.cliente_ids)];
      if (ids.length > 0) {
        const found = await db.cliente.findMany({
          where: { id: { in: ids }, deleted_at: null },
          select: { id: true },
        });
        if (found.length !== ids.length) {
          return apiError("Alguno de los clientes no existe o fue eliminado.", 400, "VALIDATION_ERROR");
        }
      }
      clienteIds = ids;
    }

    // cliente_ids es reemplazo completo dentro de $transaction (delete + create).
    if (clienteIds !== undefined) {
      await db.$transaction([
        db.documentoCliente.deleteMany({ where: { documento_id: id } }),
        ...clienteIds.map((cliente_id) =>
          db.documentoCliente.create({ data: { documento_id: id, cliente_id } }),
        ),
      ]);
    }

    if (Object.keys(data).length > 0) {
      await db.documento.update({ where: { id }, data });
    }

    await logAudit({
      entidad: "documento",
      entidad_id: id,
      accion: "editar",
      usuario_id: auth.usuario.id,
      cambios: body,
    });

    const [documento, versiones, clientsByDoc, activeVersions] = await Promise.all([
      db.documento.findFirst({
        where: { id, deleted_at: null },
        select: DOCUMENT_BASE_SELECT,
      }),
      db.documentoVersion.findMany({
        where: { documento_id: id },
        orderBy: { numero_version: "desc" },
        select: DOCUMENT_VERSION_SELECT,
      }),
      loadDocumentClients([id]),
      loadActiveVersions([id]),
    ]);
    if (!documento) {
      return apiError("El documento no existe.", 404, "NOT_FOUND");
    }
    const userNames = await loadUserNames([
      ...new Set([documento.autor_id, ...versiones.map((v) => v.subido_por_id)]),
    ]);
    const versionesConNombre = versiones.map((v) => ({
      ...v,
      subido_por_nombre: userNames.get(v.subido_por_id) ?? "—",
    }));

    return NextResponse.json({
      documento: {
        ...toDocumentItem(documento, activeVersions, userNames, clientsByDoc),
        versiones: versionesConNombre,
        versiones_count: versiones.length,
      },
    });
  },
);