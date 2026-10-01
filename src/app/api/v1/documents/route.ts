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
// huérfano y se responde 500 (nunca crash). Las tres decisiones de creación
// (categoría válida 400, categoría restringida 403, título duplicado 409 —
// salvo `force` en true — y 500 si el catálogo live no carga) viven en
// guardDocumentCreate, compartido con el sign endpoint y con la rama de
// confirmación; este branch solo valida la forma del formulario.

import { NextResponse } from "next/server";
import type { Usuario } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parsePagination } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";
import { documentStoragePath, isAllowedFileType, isAllowedNameAndMime, MAX_FILE_BYTES, MAX_FILE_MB, STORAGE_BUCKET } from "@/lib/api/files";
import { storedObjectSize } from "@/lib/api/signed-upload";
import { extractForVersion } from "@/lib/api/extract-text";
import {
  buildDocumentWhere,
  DOCUMENT_BASE_SELECT,
  DOCUMENT_VERSION_SELECT,
  guardDocumentCreate,
  loadActiveVersions,
  loadDocCategories,
  loadDocumentClients,
  loadSearchHeadlines,
  loadUserNames,
  MAX_TITULO_LENGTH,
  parseDocumentFilters,
  searchCandidateIds,
  toDocumentItem,
  type DocumentRow,
} from "@/lib/api/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // la extracción de texto agrega trabajo a la subida (plan 4B)

const MAX_ETIQUETAS = 8; // validación v1 del Repositorio
const MAX_ETIQUETA_LENGTH = 40;
const DISALLOWED_TYPE_MESSAGE =
  "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";
const BAD_KEY_MESSAGE = "La ruta del archivo no corresponde a un documento nuevo.";
// The sign endpoint pre-generates the id with crypto.randomUUID(); anything
// else in the key cannot have been issued by us.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Informe final.pdf" -> "Informe final" (título por defecto del documento). */
function tituloFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const core = dot > 0 ? fileName.slice(0, dot) : fileName;
  return core.trim().slice(0, MAX_TITULO_LENGTH);
}

type ConfirmDocumentBody = {
  storage_path?: unknown;
  documento_id?: unknown;
  nombre?: unknown;
  tamano_bytes?: unknown;
  tipo_mime?: unknown;
  titulo?: unknown;
  categoria?: unknown;
  etiquetas?: unknown;
  cliente_id?: unknown;
  force?: unknown;
};

/**
 * Parses the server-chosen key `documentos/{cliente|general}/{id}/v1_{archivo}`
 * into its owning target, or null when the shape is not exactly a new-document
 * v1 key. The confirm branch uses it to DERIVE the id and the cliente from the
 * signed path instead of trusting a client-supplied id (S0.9b).
 */
function documentTargetFromPath(
  storagePath: string,
): { clienteId: string | null; documentoId: string } | null {
  const segments = storagePath.split("/");
  if (segments.length !== 4) return null;
  const [root, clienteFolder, documentoId, fileName] = segments;
  if (root !== "documentos" || !clienteFolder || !documentoId || !fileName) return null;
  if (!fileName.startsWith("v1_")) return null;
  if (!UUID_RE.test(documentoId)) return null;
  const clienteId = clienteFolder === "general" ? null : clienteFolder;
  // NOTE: there is deliberately no `assertKeyBelongsToTarget` call here — a
  // target derived from this same path can never fail it. The REAL enforcement
  // is (a) the exact 4-segment `documentos/{cliente}/{uuid}/v1_…` shape checked
  // above, plus (b) the byte-identical rebuild against
  // `documentStoragePath(clienteId, documentoId, 1, nombre)` in the confirm
  // branch below.
  return { clienteId, documentoId };
}

/**
 * ADR-13 confirm mode for document CREATION (S0.9b item 1): the browser already
 * uploaded a brand-new document straight to Storage with a signed URL for the
 * FINAL key `documentos/{cliente}/{id}/v1_{nombre}`. The server re-derives the
 * id (and the owning cliente) from that key, verifies the object exists and is
 * not larger than declared/MAX_FILE_BYTES, then creates the Documento with the
 * explicit id, its v1 version, the audit entry and the same best-effort text
 * extraction as the multipart branch.
 */
async function confirmSignedDocument(
  request: Request,
  usuario: Usuario,
): Promise<Response> {
  const body = await parseJsonBody<ConfirmDocumentBody>(request);
  const storagePath = body?.storage_path;
  const nombre = body?.nombre;
  const tamanoBytes = body?.tamano_bytes;
  const tipoMime = typeof body?.tipo_mime === "string" ? body.tipo_mime : null;
  const tituloRaw = body?.titulo;
  const categoriaRaw = body?.categoria;
  if (
    typeof storagePath !== "string" ||
    typeof nombre !== "string" ||
    !nombre.trim() ||
    typeof tamanoBytes !== "number" ||
    !Number.isInteger(tamanoBytes) ||
    tamanoBytes <= 0 ||
    typeof tituloRaw !== "string" ||
    !tituloRaw.trim() ||
    typeof categoriaRaw !== "string" ||
    !categoriaRaw.trim()
  ) {
    return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
  }
  if (!isAllowedNameAndMime(nombre, tipoMime)) {
    return apiError(DISALLOWED_TYPE_MESSAGE, 400, "VALIDATION_ERROR");
  }
  if (tamanoBytes > MAX_FILE_BYTES) {
    return apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE");
  }

  // Derive id and cliente from the server-chosen key; never trust a client id.
  const target = documentTargetFromPath(storagePath);
  if (!target) return apiError(BAD_KEY_MESSAGE, 400, "VALIDATION_ERROR");
  const { clienteId, documentoId } = target;
  if (typeof body?.documento_id === "string" && body.documento_id !== documentoId) {
    return apiError(BAD_KEY_MESSAGE, 400, "VALIDATION_ERROR");
  }
  const rawClienteId =
    typeof body?.cliente_id === "string" && body.cliente_id.trim() ? body.cliente_id.trim() : null;
  if (rawClienteId !== null && rawClienteId !== clienteId) {
    return apiError(BAD_KEY_MESSAGE, 400, "VALIDATION_ERROR");
  }
  // The key was signed for THIS name: rebuilding it from the payload must be
  // byte-identical, otherwise the payload disagrees with the path.
  if (storagePath !== documentStoragePath(clienteId, documentoId, 1, nombre)) {
    return apiError(BAD_KEY_MESSAGE, 400, "VALIDATION_ERROR");
  }

  const supabase = createSupabaseAdmin();
  // Correction C2: `storedObjectSize` can THROW (storage/network failure) and
  // POST is a bare export, so an escaped error would surface as a framework 500
  // instead of the {error, code} envelope. Fail closed with the envelope: no row
  // is created when the object cannot be confirmed.
  let realSize: number | null;
  try {
    realSize = await storedObjectSize(supabase, STORAGE_BUCKET, storagePath);
  } catch (err) {
    console.error("[documents] storage info failed:", err);
    return apiError(
      "El archivo no está disponible o supera el tamaño declarado.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (realSize === null || realSize > tamanoBytes || realSize > MAX_FILE_BYTES) {
    return apiError(
      "El archivo no está disponible o supera el tamaño declarado.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const categoria = categoriaRaw.trim();
  let etiquetas: string[] = [];
  if (body?.etiquetas !== undefined) {
    if (!Array.isArray(body.etiquetas)) {
      return apiError("Las etiquetas deben ser un arreglo JSON de strings.", 400, "VALIDATION_ERROR");
    }
    etiquetas = body.etiquetas
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => e.slice(0, MAX_ETIQUETA_LENGTH));
    if (etiquetas.length > MAX_ETIQUETAS) {
      return apiError(`Demasiadas etiquetas (máximo ${MAX_ETIQUETAS}).`, 400, "VALIDATION_ERROR");
    }
  }

  try {
    // Defence in depth: the sign endpoint already ran the create gates before
    // issuing the URL, but the sign→confirm race is unavoidable, so the confirm
    // re-runs them through the SAME shared helper (correction B1) instead of a
    // second copy of the QA-audit-#4 logic.
    const gate = await guardDocumentCreate({
      usuario,
      titulo: tituloRaw,
      categoria: categoriaRaw,
      force: body?.force === true,
    });
    if (!gate.ok) return gate.response;
    const titulo = gate.titulo;

    if (clienteId) {
      const cliente = await db.cliente.findFirst({
        where: { id: clienteId, deleted_at: null },
        select: { id: true },
      });
      if (!cliente) {
        return apiError("El cliente no existe o fue eliminado.", 400, "VALIDATION_ERROR");
      }
    }

    // R3-1: the three inserts are ONE atomic transaction. They used to be three
    // independent awaits, so an error after the first left a Documento row with
    // no version (half-created document). Every key is known up front — the id
    // comes from the signed storage_path and the version references that same id
    // — so the operations can be batched and Postgres commits every one of them
    // or none. The operations are built in order: documento first, then the v1
    // version, then the optional cliente link.
    // Explicit id: the one the sign endpoint pre-generated and encoded in the
    // key (validated above), never a value the client could choose freely.
    const documentoOp = db.documento.create({
      data: { id: documentoId, titulo, categoria, etiquetas, autor_id: usuario.id },
      select: DOCUMENT_BASE_SELECT,
    });
    const versionOp = db.documentoVersion.create({
      data: {
        documento_id: documentoId,
        numero_version: 1,
        storage_path: storagePath,
        tamano_bytes: realSize,
        tipo_archivo: tipoMime ?? "application/octet-stream",
        subido_por_id: usuario.id,
      },
      select: DOCUMENT_VERSION_SELECT,
    });
    const clienteOp = clienteId
      ? db.documentoCliente.create({
          data: { documento_id: documentoId, cliente_id: clienteId },
        })
      : null;

    const [documento, version] = await db.$transaction([
      documentoOp,
      versionOp,
      ...(clienteOp ? [clienteOp] : []),
    ]);

    // Same best-effort inline extraction as the multipart branch: the bytes
    // come back from Storage (never from the function request body).
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(storagePath);
      if (downloadError || !blob) throw downloadError ?? new Error("download failed");
      const extracted = await extractForVersion(
        new Uint8Array(await blob.arrayBuffer()),
        nombre,
        tipoMime ?? undefined,
      );
      await db.documentoVersion.update({ where: { id: version.id }, data: extracted });
    } catch (err) {
      console.error("[documents] confirm text extraction failed:", err);
    }

    const activeVersions = new Map([[documento.id, version]]);
    const userNames = new Map([[usuario.id, usuario.nombre]]);
    const clientsByDoc = await loadDocumentClients([documento.id]);

    await logAudit({
      entidad: "documento",
      entidad_id: documento.id,
      accion: "crear",
      usuario_id: usuario.id,
      cambios: { titulo, categoria, etiquetas, cliente_id: clienteId, nombre_archivo: nombre },
    });

    return NextResponse.json(
      {
        ...toDocumentItem(documento, activeVersions, userNames, clientsByDoc),
        version: version.numero_version,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[documents] confirm create failed:", err);
    return apiError("No pudimos guardar el documento. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
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
  // Extensión permitida Y MIME permitido o vacío (política única, S0.9a):
  // clientes (p.ej. curl) mandan application/octet-stream incluso para
  // archivos válidos.
  if (!isAllowedFileType(file)) {
    return {
      ok: false,
      response: apiError("Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.", 400, "VALIDATION_ERROR"),
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, response: apiError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`, 413, "FILE_TOO_LARGE") };
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

  // ADR-13 confirm mode (JSON metadata) vs the multipart path (bytes).
  if ((request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return confirmSignedDocument(request, auth.usuario);
  }

  // H1: this branch validates the form SHAPE only (parseUploadForm with
  // requiereCategoria: false, exactly like POST /documents/:id/versions). Every
  // create gate — categoria validity, restricted-category authorization and the
  // duplicate-title conflict — lives in guardDocumentCreate, so the QA-audit-#4
  // logic has a single home and the call sites cannot drift.
  const form = await parseUploadForm(request, {
    requiereCategoria: false,
    categorias: [],
  });
  if (!form.ok) return form.response;
  const { file, titulo: tituloRaw, categoria: categoriaRaw, etiquetas, clienteId, force } =
    form.data;

  try {
    // The three create gates in one call: 400 invalid categoria, 403 restricted
    // categoria for this actor, 409 duplicate title (unless `force`), 500 when
    // the live catalog cannot be loaded. Inside the try so a DB failure in the
    // duplicate lookup still answers the {error, code} envelope instead of a raw
    // framework 500. The guard normalizes the categoria it validates, so the
    // route normalizes it first and persists exactly what was validated — a
    // padded value can never reach the row outside the live catalog.
    const categoria = categoriaRaw.trim();
    const gate = await guardDocumentCreate({
      usuario: auth.usuario,
      titulo: tituloRaw,
      categoria,
      force,
    });
    if (!gate.ok) return gate.response;
    const titulo = gate.titulo;

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