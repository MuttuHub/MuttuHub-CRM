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
// (ADMINISTRADOR, GERENCIA, COORDINADOR — canManageAny/canReadRestrictedDocs) has no such
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
    description:
      "PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG, JPEG o PNG. Máx 25 MB " +
      "(configurable vía MAX_FILE_SIZE_MB). Validación por extensión Y MIME: la extensión debe estar en la lista y " +
      "el MIME debe estar permitido o venir vacío/application-octet-stream.",
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

// JSON confirm body para CREAR un documento (ADR-13, S0.9b item 1): el navegador
// ya subió el archivo directo a Storage con un signed URL para el KEY FINAL
// `documentos/{cliente|general}/{id}/v1_{nombre}`, así que confirma solo con
// metadata. El servidor deriva el id y el cliente dueño de `storage_path` (nunca
// confía en un id arbitrario del cliente), verifica que el objeto exista y no
// supere lo declarado, y recién crea el Documento.
const ConfirmCreateDocumentBodySchema = z.object({
  storage_path: z.string().openapi({
    description:
      "Key elegido por el servidor al firmar (POST /api/v1/uploads/sign con kind: \"documento_nuevo\"), " +
      "con la forma documentos/{cliente|general}/{id}/v1_{nombre}. El id del documento y el cliente se " +
      "derivan de esta ruta.",
  }),
  documento_id: z.string().optional().openapi({
    description:
      "Id pre-generado devuelto al firmar. Si se envía, debe coincidir con el id codificado en `storage_path`.",
  }),
  nombre: z.string().openapi({
    description: "Nombre original; valida la extensión y debe reconstruir exactamente la ruta firmada.",
  }),
  tamano_bytes: z.number().int().positive().openapi({
    description: "Tamaño declarado por el cliente; el objeto real en Storage no puede superarlo ni exceder 25 MB.",
  }),
  tipo_mime: z.string().optional(),
  titulo: z.string().max(200).openapi({
    description: "Título del documento; si ya existe uno igual (case-insensitive) responde 409 salvo `force: true`.",
  }),
  categoria: z.string().openapi({
    description: "Debe existir en el catálogo vigente (setting doc_categories).",
  }),
  etiquetas: z.array(z.string()).optional().openapi({
    description: "Máximo 8 etiquetas de 40 caracteres cada una.",
  }),
  cliente_id: z.string().optional().openapi({
    description: "Opcional; si se envía debe coincidir con la carpeta de `storage_path`.",
  }),
  force: z.boolean().optional().openapi({
    description: "true para crear un documento aparte pese a un título duplicado.",
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
    description:
      "PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG, JPEG o PNG. Máx 25 MB " +
      "(configurable vía MAX_FILE_SIZE_MB). Validación por extensión Y MIME: la extensión debe estar en la lista y " +
      "el MIME debe estar permitido o venir vacío/application-octet-stream.",
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

// JSON confirm body (ADR-13, S0.9b): the browser uploaded the bytes straight to
// Storage with a signed URL, so it confirms with metadata only; the server
// verifies the object and inserts the same row.
const ConfirmUploadBodySchema = z.object({
  storage_path: z.string().openapi({
    description:
      "Key elegido por el servidor al firmar (POST /api/v1/uploads/sign). Debe pertenecer exactamente a este recurso.",
  }),
  nombre: z.string().openapi({ description: "Nombre original; usado para validar la extensión." }),
  tamano_bytes: z.number().int().positive().openapi({
    description: "Tamaño declarado por el cliente; el objeto real en Storage no puede superarlo ni exceder 25 MB.",
  }),
  tipo_mime: z.string().optional(),
});

const SignedUploadResponseSchema = registry.register(
  "SignedUploadResponse",
  z.object({
    storage_path: z.string().openapi({ description: "Key elegido server-side." }),
    token: z.string(),
    signed_url: z.string().url(),
    max_bytes: z.number().int(),
    allowed_extensions: z.array(z.string()),
    documento_id: z.string().optional().openapi({
      description:
        "Solo en `kind: \"documento_nuevo\"`: id pre-generado del documento, presente en el key firmado. " +
        "El cliente lo devuelve en el confirm de POST /api/v1/documents.",
    }),
  }),
);

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
  summary: "Crea un documento y sube su versión 1 (multipart/form-data o JSON de confirmación)",
  description:
    "multipart/form-data: flujo transaccional-ish — crea la fila del Documento, sube el archivo a Supabase " +
    "Storage y registra la versión 1; si el upload falla se hace soft delete del documento huérfano y responde " +
    "500 (nunca deja un documento sin versión visible). Alternativa ADR-13: `application/json` con " +
    "`{ storage_path, documento_id?, nombre, tamano_bytes, tipo_mime?, titulo, categoria, etiquetas?, cliente_id?, force? }` " +
    "confirma un documento NUEVO subido directamente a Storage con un signed URL de POST /api/v1/uploads/sign " +
    "(kind: documento_nuevo); la categoría válida, la categoría restringida y el título duplicado ya se rechazaron " +
    "al firmar (antes de subir bytes) y este confirm los revalida como defensa en profundidad junto con la " +
    "derivación del id y el cliente dueño desde `storage_path` y la comprobación de existencia/tamaño del objeto; " +
    "luego crea el Documento con ese id explícito más su versión 1, su auditoría y la misma extracción de texto " +
    "que el modo multipart. Un título duplicado responde 409 CONFLICT (con el documento existente) salvo " +
    "`force: true`. " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": { schema: CreateDocumentFormSchema },
        "application/json": { schema: ConfirmCreateDocumentBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Documento creado con su versión 1.",
      content: { "application/json": { schema: DocumentCreateResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 409, 413, 500]),
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
  summary: "Sube una nueva versión del documento (multipart/form-data o JSON de confirmación)",
  description:
    "La nueva versión es siempre max(numero_version) + 1 y pasa a ser la activa (el botón principal de " +
    "descarga usa la de mayor numero_version). El versionado nunca es automático por detección de nombre de " +
    "archivo. Alternativa ADR-13: `application/json` con `{ storage_path, nombre, tamano_bytes, tipo_mime? }` " +
    "confirma un objeto subido directamente a Storage con un signed URL de POST /api/v1/uploads/sign (el " +
    "servidor verifica que el objeto exista y no supere lo declarado). " +
    RESTRICTED_CATEGORY_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "multipart/form-data": { schema: CreateVersionFormSchema },
        "application/json": { schema: ConfirmUploadBodySchema },
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

// ---------------------------------------------------------------------------
// POST /api/v1/uploads/sign
// ---------------------------------------------------------------------------
// ADR-13 signed direct-to-storage upload. Registered here (the document/version
// module owns the document side of the flow) until a dedicated uploads domain
// file exists: the same endpoint also serves `tarea_adjunto` targets, whose
// confirm mode is documented in paths/tasks.ts.
registry.registerPath({
  method: "post",
  path: "/api/v1/uploads/sign",
  tags: ["Documentos"],
  summary: "Firma una subida directa a Supabase Storage (ADR-13)",
  description:
    "Autenticado. Autoriza al actor sobre el objetivo, valida la política única de subida (25 MB y allowlist: la " +
    "extensión Y el MIME permitido o vacío/octet-stream; 413 FILE_TOO_LARGE / 400 VALIDATION_ERROR antes de emitir " +
    "cualquier URL), elige el KEY en el servidor (nunca lo acepta del cliente) y devuelve un signed upload URL de " +
    "Supabase Storage junto con `max_bytes` y `allowed_extensions`. Para `kind: \"documento_nuevo\"` corre además, " +
    "ANTES de emitir la URL, los mismos gates de creación que el modo multipart de POST /api/v1/documents: categoría " +
    "inexistente → 400, categoría restringida para un COLABORADOR → 403, título duplicado → 409 CONFLICT (salvo " +
    "`force: true`) y cliente desconocido/eliminado → 400 — así una petición rechazada no deja un objeto huérfano en " +
    "Storage. Nunca devuelve la service key, credenciales del bucket ni una URL pública. El navegador sube directo a " +
    "Storage (sin límite de body del hosting) y luego confirma con el modo JSON de la ruta de destino.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            kind: z
              .enum(["documento_version", "tarea_adjunto", "documento_nuevo"])
              .openapi({ description: "Tipo de objetivo para el que se firma el key." }),
            ref_id: z.string().optional().openapi({
              description:
                "Id del documento (documento_version) o de la tarea (tarea_adjunto). Se omite en `documento_nuevo` " +
                "(el servidor pre-genera el id).",
            }),
            nombre: z.string(),
            tamano_bytes: z.number().int().positive(),
            tipo_mime: z.string().optional(),
            cliente_id: z.string().optional().openapi({
              description:
                "Solo `documento_nuevo`: cliente dueño del documento; elige la carpeta `documentos/{cliente}/...` " +
                "del key (sin cliente, `documentos/general/...`). Un cliente desconocido/eliminado → 400.",
            }),
            titulo: z.string().optional().openapi({
              description:
                "Solo `documento_nuevo` (requerido): título del documento. Un título duplicado responde 409 CONFLICT " +
                "(con el documento existente) antes de emitir la URL, salvo `force: true`.",
            }),
            categoria: z.string().optional().openapi({
              description:
                "Solo `documento_nuevo` (requerido): debe existir en el catálogo vigente. Categoría inexistente → 400; " +
                "categoría restringida para un COLABORADOR → 403, ambas antes de emitir la URL.",
            }),
            force: z.boolean().optional().openapi({
              description: "Solo `documento_nuevo`: true para saltar la comprobación de título duplicado.",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "URL firmada lista para subir el archivo directo a Storage.",
      content: { "application/json": { schema: SignedUploadResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 413, 500]),
  },
});
