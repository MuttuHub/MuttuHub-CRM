// OpenAPI path registrations for /api/v1/documents/* — Repositorio de
// Documentos (PRD §6.2). See src/lib/openapi/paths/notifications.ts for the
// reference pattern this file follows: read the actual route.ts first, then
// register exactly what it does — same status codes, same field names, same
// auth/scope rules. Never invent behavior the route doesn't have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

// Literal restricted-category scope rule (src/lib/api/documents.ts
// `canReadCategory`): COLABORADOR is excluded from restricted categories
// (default catalog: Legal, Administrativo-financiero; configurable live via
// the `doc_categories` setting, see /api/v1/settings); every other role
// (ADMINISTRADOR, GERENCIA, COORDINADOR — isFullAccess) has no such
// restriction.
const RESTRICTED_CATEGORY_NOTE =
  "COLABORADOR no puede leer/descargar/subir documentos en categorías restringidas " +
  "(por defecto Legal y Administrativo-financiero, catálogo configurable vía /api/v1/settings); " +
  "el resto de roles no tiene esta restricción.";

const DocumentoClienteSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
});

const VersionActivaSchema = z
  .object({
    version_id: z.string().uuid(),
    numero_version: z.number().int(),
    tamano_bytes: z.number().int().nullable(),
    tipo_archivo: z.string().nullable(),
    created_at: z.string().datetime(),
    subido_por_id: z.string().uuid(),
    subido_por_nombre: z.string(),
  })
  .nullable();

// Shared shape (src/lib/api/documents.ts `toDocumentItem`) reused by the list
// item, the create (201) response and the detail response.
const DocumentItemShape = {
  id: z.string().uuid(),
  titulo: z.string(),
  categoria: z.string(),
  etiquetas: z.array(z.string()),
  autor_id: z.string().uuid(),
  autor_nombre: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().openapi({
    description: "El Documento no tiene updated_at propio: es created_at de su versión activa (o null sin versiones).",
  }),
  cliente_ids: z.array(z.string().uuid()),
  clientes: z.array(DocumentoClienteSchema),
  version_activa: VersionActivaSchema,
};

const DocumentItemSchema = registry.register("DocumentItem", z.object(DocumentItemShape));

// Historial de versiones (DOCUMENT_VERSION_SELECT + subido_por_nombre
// resuelto por lote) — usado por GET /:id (campo `versiones`) y por
// GET /:id/versions.
const DocumentVersionSchema = registry.register(
  "DocumentVersion",
  z.object({
    id: z.string().uuid(),
    documento_id: z.string().uuid(),
    numero_version: z.number().int(),
    storage_path: z.string(),
    tamano_bytes: z.number().int().nullable(),
    tipo_archivo: z.string().nullable(),
    subido_por_id: z.string().uuid(),
    created_at: z.string().datetime(),
    subido_por_nombre: z.string(),
  }),
);

const DocumentListResponseSchema = registry.register(
  "DocumentListResponse",
  z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    items: z.array(DocumentItemSchema),
  }),
);

const DocumentDetailResponseSchema = registry.register(
  "DocumentDetailResponse",
  z.object({
    documento: z.object({
      ...DocumentItemShape,
      versiones: z.array(DocumentVersionSchema),
      versiones_count: z.number().int(),
    }),
  }),
);

const DocumentCreateResponseSchema = registry.register(
  "DocumentCreateResponse",
  z.object({
    ...DocumentItemShape,
    version: z.number().int().openapi({ description: "numero_version de la v1 recién creada (siempre 1)." }),
  }),
);

const DocumentVersionsListResponseSchema = registry.register(
  "DocumentVersionsListResponse",
  z.object({ versiones: z.array(DocumentVersionSchema) }),
);

const DocumentVersionCreateResponseSchema = registry.register(
  "DocumentVersionCreateResponse",
  z.object({
    version: z.number().int(),
    id: z.string().uuid(),
    numero_version: z.number().int(),
    tamano_bytes: z.number().int().nullable(),
    tipo_archivo: z.string().nullable(),
    created_at: z.string().datetime(),
    subido_por_id: z.string().uuid(),
    subido_por_nombre: z.string(),
  }),
);

// Multipart body de POST /documents — refleja parseUploadForm
// (src/app/api/v1/documents/route.ts): `file` es el único campo
// verdaderamente obligatorio; `categoria` es obligatoria solo en esta ruta
// (requiereCategoria: true).
const CreateDocumentFormSchema = z.object({
  file: z.string().openapi({
    format: "binary",
    description: "PDF, Word (.docx), Excel (.xlsx), JPG o PNG (por extensión O por MIME). Máx 10 MB.",
  }),
  titulo: z.string().max(200).optional().openapi({
    description: "Si se omite, se usa el nombre del archivo sin extensión (recortado a 200 caracteres).",
  }),
  categoria: z.string().openapi({
    description: "Debe existir en el catálogo vigente (setting doc_categories, ver GET /api/v1/settings).",
  }),
  etiquetas: z.string().optional().openapi({
    description: "JSON array de strings, como texto. Máx 8 etiquetas de 40 caracteres cada una.",
  }),
  cliente_id: z.string().optional().openapi({
    description: "Id de un cliente existente y no eliminado; vincula el documento a ese cliente.",
  }),
});

// Multipart body de POST /documents/:id/versions — usa el MISMO
// parseUploadForm compartido (requiereCategoria: false, categorias: []), así
// que técnicamente acepta los mismos campos, pero el handler solo lee `file`:
// una nueva versión nunca cambia título/categoría/etiquetas/cliente del
// documento (esos campos, si se envían, se ignoran).
const CreateVersionFormSchema = z.object({
  file: z.string().openapi({
    format: "binary",
    description: "PDF, Word (.docx), Excel (.xlsx), JPG o PNG (por extensión O por MIME). Máx 10 MB.",
  }),
  titulo: z.string().optional().openapi({
    description: "Aceptado por el parser compartido pero ignorado por esta ruta.",
  }),
  categoria: z.string().optional().openapi({
    description: "Aceptado por el parser compartido pero ignorado por esta ruta.",
  }),
  etiquetas: z.string().optional().openapi({
    description: "Aceptado por el parser compartido pero ignorado por esta ruta.",
  }),
  cliente_id: z.string().optional().openapi({
    description: "Aceptado por el parser compartido pero ignorado por esta ruta.",
  }),
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/documents",
  tags: ["Documentos"],
  summary: "Lista el Repositorio de Documentos con búsqueda, filtros y paginación",
  description:
    "Búsqueda (q) sobre título, etiquetas, categoría, nombre de cliente y de autor; filtros por categoría, " +
    "etiqueta, cliente, autor y rango de fechas (desde/hasta). Nunca incluye documentos borrados (deleted_at). " +
    RESTRICTED_CATEGORY_NOTE +
    " En este listado la restricción se aplica excluyendo silenciosamente esas filas (y su conteo) — no hay 403.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      q: z.string().optional(),
      categoria: z.string().optional().openapi({ description: "Debe existir en el catálogo vigente (doc_categories)." }),
      etiqueta: z.string().optional(),
      cliente: z.string().uuid().optional(),
      autor: z.string().uuid().optional(),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ description: "YYYY-MM-DD." }),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ description: "YYYY-MM-DD." }),
      page: z.number().int().min(1).optional().openapi({ description: "Por defecto 1." }),
      limit: z.number().int().min(1).max(100).optional().openapi({ description: "Por defecto 25, máximo 100." }),
    }),
  },
  responses: {
    200: {
      description: "Página de documentos visibles para el usuario actual.",
      content: { "application/json": { schema: DocumentListResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/documents
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/documents",
  tags: ["Documentos"],
  summary: "Crea un documento y sube su versión 1 (multipart/form-data)",
  description:
    "Flujo transaccional-ish: crea la fila del Documento, sube el archivo a Supabase Storage y registra la " +
    "versión 1; si el upload falla se hace soft delete del documento huérfano y responde 500 (nunca deja un " +
    "documento sin versión visible). " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": { schema: CreateDocumentFormSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Documento creado con su versión 1.",
      content: { "application/json": { schema: DocumentCreateResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 413, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/{id}
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/documents/{id}",
  tags: ["Documentos"],
  summary: "Detalle de un documento: campos base, clientes, versión activa e historial completo de versiones",
  description: RESTRICTED_CATEGORY_NOTE + " 404 si no existe o está borrado.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Documento con su historial de versiones (desc).",
      content: { "application/json": { schema: DocumentDetailResponseSchema } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/documents/{id}
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "delete",
  path: "/api/v1/documents/{id}",
  tags: ["Documentos"],
  summary: "Elimina (soft delete) un documento completo",
  description:
    "Soft delete (deleted_at): el documento desaparece de todos los listados pero las versiones conservan el " +
    "historial — nunca se borra una versión individual. Permiso: roles completos (ADMINISTRADOR, GERENCIA, " +
    "COORDINADOR) en cualquier documento, o el autor del documento. " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Documento eliminado (soft delete)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/{id}/download
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/documents/{id}/download",
  tags: ["Documentos"],
  summary: "Descarga la versión activa (mayor numero_version) del documento",
  description:
    "Responde con un 302 redirect a un signed URL de Supabase Storage válido por 60 segundos. El check de " +
    "categoría restringida corre ANTES de generar cualquier signed URL. " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    302: {
      description: "Redirect al signed URL (60 s) de la versión activa en Supabase Storage.",
      headers: z.object({ Location: z.string().url() }),
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/{id}/versions
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/documents/{id}/versions",
  tags: ["Documentos"],
  summary: "Lista el historial de versiones de un documento (orden descendente)",
  description: RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Todas las versiones del documento, de la más nueva a la más antigua.",
      content: { "application/json": { schema: DocumentVersionsListResponseSchema } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/documents/{id}/versions
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/documents/{id}/versions",
  tags: ["Documentos"],
  summary: "Sube una nueva versión del documento (multipart/form-data)",
  description:
    "La nueva versión es siempre max(numero_version) + 1 y pasa a ser la activa (el botón principal de " +
    "descarga usa la de mayor numero_version). El versionado nunca es automático por detección de nombre de " +
    "archivo. " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "multipart/form-data": { schema: CreateVersionFormSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Versión creada (pasa a ser la activa).",
      content: { "application/json": { schema: DocumentVersionCreateResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 413, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/{id}/versions/{versionId}/download
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/documents/{id}/versions/{versionId}/download",
  tags: ["Documentos"],
  summary: "Descarga una versión específica (no necesariamente la activa)",
  description:
    "Solo descarga: las versiones anteriores no se editan ni eliminan. Responde con un 302 redirect a un " +
    "signed URL de Supabase Storage válido por 60 segundos; el check de categoría restringida corre ANTES de " +
    "generar cualquier signed URL. La versión debe pertenecer al documento del path o responde 404. " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }),
  },
  responses: {
    302: {
      description: "Redirect al signed URL (60 s) de la versión solicitada en Supabase Storage.",
      headers: z.object({ Location: z.string().url() }),
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/documents/zip
// ---------------------------------------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/documents/zip",
  tags: ["Documentos"],
  summary: "Descarga múltiple: empaqueta en un .zip la versión activa de varios documentos",
  description:
    "Body JSON { ids: string[] }, mínimo 1 y máximo 50 documentos (400 VALIDATION_ERROR si se excede). " +
    "Gate todo-o-nada: si CUALQUIERA de los documentos seleccionados es de categoría restringida para un " +
    "COLABORADOR, responde 403 ANTES de generar ningún signed URL (no se descarga nada). " +
    RESTRICTED_CATEGORY_NOTE +
    " Por archivo es best-effort: si un documento no tiene versión activa o falla el signed URL/fetch de esa " +
    "versión, ese archivo se OMITE del zip (no falla toda la descarga) y su motivo se agrega como una línea a " +
    "un README.txt incluido dentro del propio .zip junto a los demás archivos obtenidos con éxito.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            ids: z
              .array(z.string().min(1))
              .min(1, "Selecciona al menos un documento.")
              .max(50, "Máximo 50 documentos por descarga.")
              .openapi({ description: "Ids de Documento a incluir (duplicados se deduplican)." }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description:
        "Archivo documentos.zip con la versión activa de cada documento incluido " +
        "(más un README.txt si algún archivo individual falló).",
      content: { "application/zip": { schema: { type: "string", format: "binary" } } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});
