// OpenAPI path registrations for the project-origin documents of the Documentos tab (DOC1):
// create (file after the signed upload, or an https link), sign, soft-delete and download.
// Registered from the actual route.ts files — same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA, MEDIO_SIGN_SCHEMA } from "@/lib/api/soportes";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` o un `COORDINADOR` integrante activo del proyecto, y solo mientras el proyecto " +
  "está `BORRADOR`, `EN_EJECUCION` o `SUSPENDIDO` (`CERRADO`, `CANCELADO` y `PLANIFICACION` responden 409). " +
  "Orden: 404 -> 403 -> 409 INVALID_STATE -> 400.";

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA, un COORDINADOR integrante activo o el rol con " +
  "`puede_ver_tablero_gerencial`); un proyecto desconocido responde 404 antes del 403. Se puede leer en cualquier estado.";

const ProjectParams = z.object({ id: z.string().uuid() });
const ProjectSupportParams = z.object({ id: z.string().uuid(), supportId: z.string().uuid() });

export const DocumentoProyectoSchema = registry.register(
  "DocumentoProyecto",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    tipo: z.enum(["archivo", "enlace"]),
    tipo_mime: z.string().nullable(),
    tamano_bytes: z.number().int().nullable(),
    origen: z.literal("proyecto"),
    origen_id: z.null(),
    vinculo: z.null(),
    url_externa: z.string().nullable(),
    subido_por_id: z.string().uuid(),
    created_at: z.string(),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/supports",
  tags: ["Projects"],
  summary: "Crea un documento general del proyecto (archivo confirmado o enlace https)",
  description:
    `${WRITE_NOTE} Dos formas de cuerpo: confirmar un archivo ya subido (\`storage_path\`, \`nombre\`, \`tamano_bytes\`, ` +
    "`tipo_mime?`; la clave debe estar bajo `proyectos/{id}/soportes/`, el objeto debe existir y no superar lo " +
    "declarado ni el máximo de la app; se guarda el tamaño real) o enlazar una URL externa (`url_externa` https de " +
    "hasta 2000 caracteres, `nombre`). El mismo objeto no puede respaldar dos documentos (409 CONFLICT). La creación " +
    "se audita en la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: {
      content: {
        "application/json": { schema: z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]) },
      },
    },
  },
  responses: {
    201: {
      description: "Documento creado (la clave de storage nunca se expone).",
      content: { "application/json": { schema: z.object({ soporte: DocumentoProyectoSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/supports/sign",
  tags: ["Projects"],
  summary: "Firma la subida directa de un documento del proyecto (ADR-13)",
  description:
    `${WRITE_NOTE} La política de archivo es la única de la app (PDF, DOCX, XLSX, PPTX, JPG/JPEG, PNG; 413 ` +
    "FILE_TOO_LARGE sobre el máximo). El servidor elige la clave `proyectos/{id}/soportes/{uuid}_{nombre}`; el " +
    "cliente nunca envía una. Después de subir, confirma con POST .../supports. Los objetos nunca se eliminan.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: { content: { "application/json": { schema: MEDIO_SIGN_SCHEMA } } },
  },
  responses: {
    200: {
      description: "URL firmada de subida y límites de la política.",
      content: {
        "application/json": {
          schema: z.object({
            storage_path: z.string(),
            token: z.string(),
            signed_url: z.string(),
            max_bytes: z.number().int(),
            allowed_extensions: z.array(z.string()),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 413, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/projects/{id}/supports/{supportId}",
  tags: ["Projects"],
  summary: "Elimina (baja lógica) un documento general del proyecto",
  description:
    `${WRITE_NOTE} Los gestores eliminan cualquier documento del proyecto; un COORDINADOR integrante solo los que ` +
    "subió (403). Los soportes de avances, indicadores y gastos no se direccionan aquí (404), igual que un documento " +
    "de otro proyecto o ya eliminado. La baja se audita en la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectSupportParams },
  responses: {
    200: {
      description: "Documento eliminado (la fila se conserva con `deleted_at`).",
      content: { "application/json": { schema: z.object({ soporte: z.object({ id: z.string().uuid() }) }) } },
    },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/supports/{supportId}/download",
  tags: ["Projects"],
  summary: "Abre un documento general del proyecto",
  description:
    `${READ_NOTE} Un archivo responde \`{ tipo: "archivo", url, expires_in: 60 }\` con una URL firmada de 60 s; un ` +
    "enlace responde su URL https. Cada emisión queda en `acceso_soportes` (RNF-04) después de firmar; si el " +
    "registro falla, la respuesta es 500 y ninguna URL sale del servidor.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectSupportParams },
  responses: {
    200: {
      description: "URL de apertura (firmada para archivos, directa para enlaces).",
      content: {
        "application/json": {
          schema: z.object({
            tipo: z.enum(["archivo", "enlace"]),
            url: z.string().nullable(),
            expires_in: z.number().int().nullable(),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
