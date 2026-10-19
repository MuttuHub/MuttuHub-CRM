// GET /api/v1/documents — listado del Repositorio (PRD §6.2) con búsqueda
// (q sobre titulo, etiquetas, categoria, nombre de cliente y de autor),
// filtros (categoria, etiqueta, cliente, autor, desde/hasta) y paginación
// (page >= 1, limit 25 máx 100). Nunca trae filas borradas (deleted_at) y los
// COLABORADOR no ven las categorías restringidas del setting live
// `doc_categories` (fallback RESTRICTED_DOC_CATEGORIES; también aplicado al
// count).
// POST /api/v1/documents — multipart/form-data (file, titulo?, categoria,
// etiquetas? JSON, cliente_id?, force?) crea el Documento + sube la versión v1
// a Supabase Storage. Flujo transaccional-ish: fila primero, upload después,
// versión al final; si el upload falla se hace soft delete del documento
// huérfano y se responde 500 (nunca crash). Si ya existe un documento con el
// mismo título (case-insensitive) y `force` no viene en true, responde 409
// CONFLICT con el documento existente en vez de crear un duplicado — el
// diálogo de subida ofrece entonces "nueva versión" o "documento aparte".

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parsePagination } from "@/lib/api/crm";
import { canReadRestrictedDocs } from "@/lib/permissions";
import { logAudit } from "@/lib/api/audit";
import { documentStoragePath, isAllowedFileType, MAX_FILE_BYTES, STORAGE_BUCKET } from "@/lib/api/files";
import { extractForVersion } from "@/lib/api/extract-text";
import {
  buildDocumentWhere,
  DOCUMENT_BASE_SELECT,
  DOCUMENT_VERSION_SELECT,
  loadActiveVersions,
  loadDocCategories,
  loadDocumentClients,
  loadSearchHeadlines,
  loadUserNames,
  parseDocumentFilters,
  searchCandidateIds,
  toDocumentItem,
  type DocumentRow,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // la extracción de texto agrega trabajo a la subida (plan 4B)

const MAX_ETIQUETAS = 8; // validación v1 del Repositorio
const MAX_ETIQUETA_LENGTH = 40;
const MAX_TITULO_LENGTH = 200;

/** "Informe final.pdf" -> "Informe final" (título por defecto del documento). */
function tituloFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const core = dot > 0 ? fileName.slice(0, dot) : fileName;
  return core.trim().slice(0, MAX_TITULO_LENGTH);
}

type UploadedFile = {
  file: File;
  titulo: string;
  categoria: string;
  etiquetas: string[];
  clienteId: string | null;
  force: boolean;
};

/**
 * Shared multipart + file validation for POST /documents and
 * POST /documents/:id/versions (mismas reglas que los adjuntos de tarea).
 * `categorias` es el catálogo en vivo (setting doc_categories); se ignora
 * cuando no se requiere validar la categoría. Returns a typed error response
 * when the form is invalid.
 */
export async function parseUploadForm(
  request: Request,
  { requiereCategoria, categorias }: { requiereCategoria: boolean; categorias: string[] },
): Promise<{ ok: true; data: UploadedFile } | { ok: false; response: Response }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR") };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: apiError("Adjunta un archivo en el campo 'file'.", 400, "VALIDATION_ERROR") };
  }
  // Extensión O MIME en el set permitido: clientes (p.ej. curl) mandan
  // application/octet-stream incluso para archivos válidos.
  if (!isAllowedFileType(file)) {
    return {
      ok: false,
      response: apiError("Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG o PNG.", 400, "VALIDATION_ERROR"),
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, response: apiError("El archivo supera el límite de 10 MB.", 413, "FILE_TOO_LARGE") };
  }

  const rawTitulo = form.get("titulo");
  const titulo =
    typeof rawTitulo === "string" && rawTitulo.trim()
      ? rawTitulo.trim().slice(0, MAX_TITULO_LENGTH)
      : tituloFromFileName(file.name);

  const categoriaRaw = form.get("categoria");
  const categoria = typeof categoriaRaw === "string" ? categoriaRaw : "";
  if (requiereCategoria && !categorias.includes(categoria)) {
    return { ok: false, response: apiError("Categoría no válida.", 400, "VALIDATION_ERROR") };
  }

  let etiquetas: string[] = [];
  const rawEtiquetas = form.get("etiquetas");
  if (typeof rawEtiquetas === "string" && rawEtiquetas.trim()) {
    try {
      const parsed = JSON.parse(rawEtiquetas);
      if (!Array.isArray(parsed)) throw new Error("no array");
      etiquetas = parsed
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => e.slice(0, MAX_ETIQUETA_LENGTH));
      if (etiquetas.length > MAX_ETIQUETAS) {
        return {
          ok: false,
          response: apiError(`Demasiadas etiquetas (máximo ${MAX_ETIQUETAS}).`, 400, "VALIDATION_ERROR"),
        };
      }
    } catch {
      return {
        ok: false,
        response: apiError("Las etiquetas deben ser un arreglo JSON de strings.", 400, "VALIDATION_ERROR"),
      };
    }
  }

  const rawClienteId = form.get("cliente_id");
  const clienteId = typeof rawClienteId === "string" && rawClienteId.trim() ? rawClienteId.trim() : null;

  // Solo relevante para POST /documents (QA audit #4): el diálogo lo manda
  // en true cuando el usuario ya decidió crear un documento aparte pese a la
  // advertencia de nombre duplicado. La versión nueva (POST /:id/versions)
  // lo ignora.
  const force = form.get("force") === "true";

  return { ok: true, data: { titulo, categoria, etiquetas, clienteId, file, force } };
}

export const GET = withApiErrorHandling(
  "documents",
  "No pudimos cargar los documentos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const pagination = parsePagination(url.searchParams, 100);
    if (!pagination.ok) return pagination.response;

    const { categorias } = await loadDocCategories();
    const parsed = parseDocumentFilters(url, categorias);
    if (!parsed.ok) return parsed.response;
    const { filters } = parsed;

    let rows: DocumentRow[];
    let total: number;
    // Búsqueda FTS (plan Fase 2, 4B): cuando hay q, el query crudo resuelve
    // los ids candidatos (metadatos + contenido vía el índice GIN) y la UI
    // marca "Coincide en el contenido". El buildDocumentWhere con q (OR
    // por metadatos) queda como respaldo cuando el query crudo no es la vía.
    let matchById: Map<string, "metadatos" | "contenido"> = new Map();
    let headlines: Map<string, string> = new Map();

    if (filters.q) {
      const candidates = await searchCandidateIds(filters.q, auth.usuario);
      matchById = new Map(candidates.map((c) => [c.id, c.match]));
      const candidateIds = candidates.map((c) => c.id);
      // Paginación sobre los ids candidatos (sin OR de metadatos: el query
      // crudo ya filtró).
      rows = candidateIds.length
        ? await db.documento.findMany({
            where: { id: { in: candidateIds }, deleted_at: null },
            select: DOCUMENT_BASE_SELECT,
            orderBy: { created_at: "desc" },
            skip: (pagination.page - 1) * pagination.limit,
            take: pagination.limit,
          })
        : [];
      total = candidateIds.length;
      // ts_headline SOLO para los ≤25 de la página (nunca para todos los
      // candidatos): un término que matchea 800 docs no re-parsea 800 textos.
      headlines = await loadSearchHeadlines(
        filters.q,
        rows.filter((r) => matchById.get(r.id) === "contenido").map((r) => r.id),
      );
    } else {
      const where = await buildDocumentWhere(filters, auth.usuario);
      [rows, total] = await Promise.all([
        db.documento.findMany({
          where,
          select: DOCUMENT_BASE_SELECT,
          orderBy: { created_at: "desc" },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        db.documento.count({ where }),
      ]);
    }

    const docIds = rows.map((r) => r.id);
    // Enrichment por lotes: una consulta de versiones activas + una de clientes,
    // y luego una única consulta de nombres para autores Y subidores de la
    // versión activa.
    const [activeVersions, clientsByDoc] = await Promise.all([
      loadActiveVersions(docIds),
      loadDocumentClients(docIds),
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
        match: matchById.get(r.id) ?? undefined,
        snippet: headlines.get(r.id) ?? undefined,
      })),
    });
  },
);

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  // Storage necesita credenciales de Supabase sí o sí: sin ellas no hay upload.
  if (!isSupabaseConfigured()) {
    return apiError(
      "Plataforma no configurada. Revisa las variables de entorno.",
      500,
      "INTERNAL_ERROR",
    );
  }

  // Catálogo en vivo (setting doc_categories; fallback constantes) para
  // validar la categoría y las restringidas de COLABORADOR.
  let docCategories: { categorias: string[]; restringidas: string[] };
  try {
    docCategories = await loadDocCategories();
  } catch (err) {
    console.error("[documents] settings load failed:", err);
    return apiError("No pudimos cargar los catálogos. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }

  const form = await parseUploadForm(request, {
    requiereCategoria: true,
    categorias: docCategories.categorias,
  });
  if (!form.ok) return form.response;
  const { file, titulo, categoria, etiquetas, clienteId, force } = form.data;

  // Categorías restringidas: los COLABORADOR no pueden ni crearlas (PRD §6.2).
  if (!canReadRestrictedDocs(auth.usuario.rol) && docCategories.restringidas.includes(categoria)) {
    return apiError("No tienes permisos para documentos de esa categoría.", 403, "FORBIDDEN");
  }

  try {
    // QA audit #4: antes solo existía el versionado manual (POST
    // /:id/versions, iniciado por el usuario desde la ficha); subir con un
    // título repetido creaba un documento duplicado independiente sin
    // preguntar nada. Si no es un versionado explícito (force), avisamos y
    // dejamos que el diálogo decida entre "nueva versión" o "documento
    // aparte". Corrido dentro del try (antes estaba afuera: un error de DB
    // acá tiraba un 500 crudo en vez del envelope {error, code} esperado) y
    // excluyendo categorías restringidas para un COLABORADOR — si no, el
    // 409 filtraba la existencia/id de un documento en una categoría que ese
    // rol ni siquiera puede listar.
    if (!force) {
      const existing = await db.documento.findFirst({
        where: {
          titulo: { equals: titulo, mode: "insensitive" },
          deleted_at: null,
          ...(canReadRestrictedDocs(auth.usuario.rol)
            ? {}
            : { categoria: { notIn: [...docCategories.restringidas] } }),
        },
        select: { id: true, titulo: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `Ya existe un documento llamado "${existing.titulo}".`,
            code: "CONFLICT",
            documento: existing,
          },
          { status: 409 },
        );
      }
    }

    if (clienteId) {
      const cliente = await db.cliente.findFirst({
        where: { id: clienteId, deleted_at: null },
        select: { id: true },
      });
      if (!cliente) {
        return apiError("El cliente no existe o fue eliminado.", 400, "VALIDATION_ERROR");
      }
    }

    // 1) Fila del documento primero (autor = sesión, nunca del cliente).
    const documento = await db.documento.create({
      data: { titulo, categoria, etiquetas, autor_id: auth.usuario.id },
      select: DOCUMENT_BASE_SELECT,
    });
    if (clienteId) {
      await db.documentoCliente.create({
        data: { documento_id: documento.id, cliente_id: clienteId },
      });
    }

    // 2) Upload de la v1 al bucket muttu-docs (cliente service-role, key sin "/").
    const storagePath = documentStoragePath(clienteId, documento.id, 1, file.name);
    const supabase = createSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      // Mejor esfuerzo: el documento huérfano desaparece del listado (soft
      // delete) y el usuario reintenta con un nuevo POST.
      console.error("[documents] upload failed:", uploadError);
      await db.documento.update({
        where: { id: documento.id },
        data: { deleted_at: new Date() },
      });
      return apiError("No pudimos subir el archivo. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
    }

    // 3) Registro de la versión 1.
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const version = await db.documentoVersion.create({
      data: {
        documento_id: documento.id,
        numero_version: 1,
        storage_path: storagePath,
        tamano_bytes: file.size,
        tipo_archivo: file.type || "application/octet-stream",
        subido_por_id: auth.usuario.id,
      },
      select: DOCUMENT_VERSION_SELECT,
    });

    // 4) Extracción inline del texto (plan Fase 2, 4B). Después del commit de
    // la versión y nunca lanza: un fallo acá deja texto_estado="error" (que el
    // backfill reintentará) y el documento sigue buscable por metadatos. Con
    // timeout para no secar la subida y dentro de su propio try/catch.
    try {
      const extracted = await extractForVersion(fileBytes, file.name, file.type);
      await db.documentoVersion.update({
        where: { id: version.id },
        data: extracted,
      });
    } catch (err) {
      console.error("[documents] text extraction failed:", err);
    }

    const activeVersions = new Map([[documento.id, version]]);
    const userNames = new Map([[auth.usuario.id, auth.usuario.nombre]]);
    const clientsByDoc = await loadDocumentClients([documento.id]);

    await logAudit({
      entidad: "documento",
      entidad_id: documento.id,
      accion: "crear",
      usuario_id: auth.usuario.id,
      cambios: { titulo, categoria, etiquetas, cliente_id: clienteId, nombre_archivo: file.name },
    });

    return NextResponse.json(
      {
        ...toDocumentItem(documento, activeVersions, userNames, clientsByDoc),
        version: version.numero_version,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[documents] create failed:", err);
    return apiError("No pudimos guardar el documento. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}