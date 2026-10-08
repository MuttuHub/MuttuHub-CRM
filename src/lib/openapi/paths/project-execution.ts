// OpenAPI path registrations for the S4 technical execution of a project:
// avances of a deliverable (and, in later units, medios, measurements,
// beneficiaries and the technical status). Registered from the actual route.ts
// files — same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { AVANCE_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route";
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
