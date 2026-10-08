// OpenAPI path registrations for the S4 technical execution of a project:
// avances of a deliverable (and, in later units, medios, measurements,
// beneficiaries and the technical status). Registered from the actual route.ts
// files — same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { AVANCE_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route";
import { MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA } from "@/app/api/v1/projects/[id]/progress/[progressId]/attachments/route";
import { MEDIO_SIGN_SCHEMA } from "@/app/api/v1/projects/[id]/progress/[progressId]/attachments/sign/route";
import { MOTIVO_ANULACION_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/[progressId]/void/route";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` o un `COORDINADOR` integrante activo del proyecto, y solo mientras el proyecto " +
  "está `EN_EJECUCION` (ninguna ruta lo pasa a ese estado en S4). Orden: 404 -> 403 -> 409 INVALID_STATE -> 400.";

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA o un COORDINADOR integrante activo); " +
  "un proyecto desconocido responde 404 antes del 403. Se puede leer en cualquier estado.";

const ProjectDeliverableParams = z.object({ id: z.string().uuid(), deliverableId: z.string().uuid() });

export const AvanceSchema = registry.register(
  "Avance",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    entregable_id: z.string().uuid(),
    fecha: z.string().openapi({ example: "2026-10-06", description: "Fecha calendario; nunca posterior a hoy (Bogotá)." }),
    cantidad: z.string().openapi({ description: "Decimal(15,2) como string; siempre > 0.", example: "2" }),
    observacion: z.string().nullable(),
    justificacion_exceso: z.string().nullable(),
    registrado_por_id: z.string().uuid(),
    created_at: z.string(),
    anulado_at: z.string().nullable(),
    anulado_por_id: z.string().uuid().nullable(),
    motivo_anulacion: z.string().nullable(),
    medios: z.number().int().openapi({ description: "Medios vivos adjuntos al avance." }),
    cuenta: z.boolean().openapi({
      description:
        "true cuando el avance suma al entregable: no está anulado y, si el parámetro `avance_requiere_medio` lo exige, tiene al menos un medio vivo.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress",
  tags: ["Projects"],
  summary: "Lista los avances de un entregable",
  description: `Incluye los avances anulados (se listan, nunca se cuentan), del más antiguo al más reciente. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectDeliverableParams },
  responses: {
    200: {
      description: "Avances del entregable, su meta y el estado del proyecto.",
      content: {
        "application/json": {
          schema: z.object({ estado: z.string(), meta: z.string(), avances: z.array(AvanceSchema) }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress",
  tags: ["Projects"],
  summary: "Registra un avance de un entregable",
  description:
    `${WRITE_NOTE} La fecha no puede ser posterior a hoy (400). La suma de avances no anulados no puede superar la ` +
    "meta sin `justificacion_exceso` (400); la verificación y el insert comparten una transacción con bloqueo de fila " +
    "sobre el entregable. Audita `CREAR avance` en la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectDeliverableParams,
    body: { content: { "application/json": { schema: AVANCE_CREATE_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Avance registrado.",
      content: { "application/json": { schema: z.object({ avance: AvanceSchema, cuenta: z.boolean() }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress/{progressId}/void",
  tags: ["Projects"],
  summary: "Anula un avance (solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA`, en cualquier estado del proyecto. Exige `motivo` (1..500). La fila se conserva, " +
    "queda fuera de todo cálculo y se audita con `ANULAR`. Un avance ya anulado responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectDeliverableParams.extend({ progressId: z.string().uuid() }),
    body: { content: { "application/json": { schema: MOTIVO_ANULACION_SCHEMA } } },
  },
  responses: {
    200: { description: "Avance anulado.", content: { "application/json": { schema: z.object({ avance: AvanceSchema }) } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// Medios de verificación of an avance (S4 U3)
// ---------------------------------------------------------------------------

export const MedioSchema = registry.register(
  "MedioProyecto",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    avance_id: z.string().uuid().nullable(),
    nombre: z.string(),
    tipo: z.enum(["archivo", "enlace"]),
    url_externa: z.string().nullable().openapi({ description: "Solo para `tipo: enlace`; siempre https." }),
    tipo_mime: z.string().nullable(),
    tamano_bytes: z.number().int().nullable().openapi({ description: "Tamaño real leído de storage." }),
    subido_por_id: z.string().uuid(),
    created_at: z.string(),
  }),
);

const AvanceMedioParams = z.object({ id: z.string().uuid(), progressId: z.string().uuid() });

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments",
  tags: ["Projects"],
  summary: "Lista los medios vivos de un avance",
  description: `Nunca expone la clave de storage: la descarga va por su ruta firmada. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: AvanceMedioParams },
  responses: {
    200: {
      description: "Medios vivos del avance.",
      content: { "application/json": { schema: z.object({ medios: z.array(MedioSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments/sign",
  tags: ["Projects"],
  summary: "Firma la subida directa de un archivo de soporte (ADR-13)",
  description:
    `${WRITE_NOTE} El avance no puede estar anulado (409). La política de archivo es la única de la app (PDF, DOCX, XLSX, ` +
    "PPTX, JPG/JPEG, PNG; 413 FILE_TOO_LARGE sobre el máximo). El servidor elige la clave " +
    "`proyectos/{id}/soportes/{uuid}_{nombre}`; el cliente nunca envía una. Después de subir, confirma con POST " +
    ".../attachments. Los objetos nunca se eliminan de storage.",
  security: [{ sessionCookie: [] }],
  request: {
    params: AvanceMedioParams,
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
  method: "post",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments",
  tags: ["Projects"],
  summary: "Adjunta un medio a un avance (archivo confirmado o enlace https)",
  description:
    `${WRITE_NOTE} Dos formas de cuerpo: confirmar un archivo ya subido (\`storage_path\`, \`nombre\`, \`tamano_bytes\`, ` +
    "`tipo_mime?`; la clave debe estar bajo `proyectos/{id}/soportes/`, el objeto debe existir y no superar lo " +
    "declarado ni el máximo de la app; se guarda el tamaño real) o enlazar una URL externa (`url_externa` https de " +
    "hasta 2000 caracteres, `nombre`). Un avance anulado responde 409; el mismo objeto no puede respaldar dos medios " +
    "(409). Con un medio vivo el avance `cuenta`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: AvanceMedioParams,
    body: {
      content: {
        "application/json": { schema: z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]) },
      },
    },
  },
  responses: {
    201: {
      description: "Medio adjunto.",
      content: { "application/json": { schema: z.object({ medio: MedioSchema, cuenta: z.boolean() }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments/{attachmentId}/download",
  tags: ["Projects"],
  summary: "Descarga de un medio (URL firmada de 60 s o enlace https)",
  description: READ_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: AvanceMedioParams.extend({ attachmentId: z.string().uuid() }) },
  responses: {
    200: {
      description: "URL de descarga.",
      content: {
        "application/json": {
          schema: z.object({
            tipo: z.enum(["archivo", "enlace"]),
            url: z.string(),
            expires_in: z.number().int().nullable().openapi({ description: "60 para un archivo; null para un enlace." }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
