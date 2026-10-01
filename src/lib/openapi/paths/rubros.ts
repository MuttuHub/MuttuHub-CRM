// OpenAPI path registrations for /api/v1/rubros/* — catálogo único de rubros v2
// (REQ-CAT-01, REQ-CAT-02). Follows the pattern of
// src/lib/openapi/paths/notifications.ts: read the actual route.ts first, then
// register exactly what it does — same status codes, same field names, same
// auth rules. Never invent behavior the route does not have.

import { z } from "zod";
import { registry, standardErrorResponses, ErrorEnvelopeSchema } from "@/lib/openapi/registry";
import { RUBRO_PATCH_SCHEMA } from "@/app/api/v1/rubros/[id]/route";

const RubroSchema = registry.register(
  "Rubro",
  z.object({
    id: z.string().uuid(),
    codigo: z.string().nullable().openapi({
      description: "R01..R15. Inmutable: el trigger `rubros_codigo_inmutable` rechaza un UPDATE que lo cambie.",
    }),
    nombre: z.string(),
    activo: z.boolean().openapi({ description: "false = suspendido (nunca eliminado)." }),
    orden: z.number().int().openapi({ description: "Secuencia R01..R15." }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);

const RubroIdParams = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// GET /api/v1/rubros
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/rubros",
  tags: ["Rubros"],
  summary: "Catálogo único de rubros v2 (R01–R15)",
  description:
    "Cualquier usuario autenticado. Devuelve exactamente los 15 rubros activos con código, ordenados por " +
    "código. Las filas sin código (las v1 \"Material POP\" y \"Operación logística\") quedan fuera: están " +
    "suspendidas y nunca se ofrecen a un proyecto.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Los 15 rubros activos del catálogo, en orden R01..R15.",
      content: {
        "application/json": { schema: z.object({ rubros: z.array(RubroSchema) }) },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/rubros/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/rubros/{id}",
  tags: ["Rubros"],
  summary: "Renombra o suspende/restaura un rubro (solo ADMINISTRADOR)",
  description:
    "Acepta `nombre` y `activo` (suspender/restaurar). `codigo` es inmutable: enviarlo devuelve 400 " +
    "VALIDATION_ERROR, defensa en profundidad sobre el trigger de la base de datos. El cambio se audita en " +
    "`auditoria_cambios` (antes/después por campo) dentro de la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: RubroIdParams,
    body: { content: { "application/json": { schema: RUBRO_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Rubro actualizado.",
      content: {
        "application/json": { schema: z.object({ rubro: RubroSchema }) },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/rubros/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "delete",
  path: "/api/v1/rubros/{id}",
  tags: ["Rubros"],
  summary: "Un rubro nunca se elimina (siempre 409)",
  description:
    "No hay soft delete ni hard delete: la respuesta es siempre 409 CONFLICT. Para retirar un rubro del " +
    "catálogo, suspéndelo con PATCH { activo: false }.",
  security: [{ sessionCookie: [] }],
  request: { params: RubroIdParams },
  responses: {
    409: {
      description: "Un rubro no se elimina nunca; solo se puede suspender.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
    ...standardErrorResponses([401, 500]),
  },
});
