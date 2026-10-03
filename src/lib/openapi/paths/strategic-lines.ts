// OpenAPI path registrations for /api/v1/strategic-lines/* — strategic-lines
// catalog v2 (REQ-CAT-03). Follows the pattern of
// src/lib/openapi/paths/rubros.ts: read the actual route.ts first, then
// register exactly what it does — same status codes, same field names, same
// auth rules. Never invent behavior the route does not have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { LINEA_CREATE_SCHEMA } from "@/app/api/v1/strategic-lines/route";
import { LINEA_PATCH_SCHEMA } from "@/app/api/v1/strategic-lines/[id]/route";

const LineaEstrategicaSchema = registry.register(
  "LineaEstrategica",
  z.object({
    id: z.string().uuid(),
    codigo: z.string().openapi({
      description: "LE01..LE08. Inmutable: el trigger `lineas_estrategicas_codigo_inmutable` rechaza un UPDATE que lo cambie.",
    }),
    nombre: z.string(),
    activo: z.boolean().openapi({ description: "false = suspendida (nunca eliminada)." }),
    fecha_suspension: z.string().datetime().nullable().openapi({
      description: "Momento de la suspensión; se limpia al restaurar la línea.",
    }),
    orden: z.number().int().openapi({ description: "Secuencia LE01..LE08." }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);

const LineaIdParams = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// GET /api/v1/strategic-lines
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/strategic-lines",
  tags: ["Strategic lines"],
  summary: "Catálogo de líneas estratégicas v2 (LE01–LE08)",
  description:
    "Cualquier usuario autenticado. Devuelve las líneas activas ordenadas por código. Las líneas " +
    "suspendidas (`activo: false`) quedan fuera: nunca se eliminan, solo se suspenden.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Las líneas estratégicas activas, en orden LE01..LE08.",
      content: {
        "application/json": { schema: z.object({ lineas: z.array(LineaEstrategicaSchema) }) },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/strategic-lines
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/strategic-lines",
  tags: ["Strategic lines"],
  summary: "Crea una línea estratégica (solo ADMINISTRADOR)",
  description:
    "Crea una línea del catálogo con un `codigo` único e inmutable. El alta se audita en " +
    "`auditoria_cambios` (accion CREAR) dentro de la misma transacción. Un código duplicado devuelve " +
    "409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: LINEA_CREATE_SCHEMA } } } },
  responses: {
    201: {
      description: "Línea estratégica creada.",
      content: {
        "application/json": { schema: z.object({ linea: LineaEstrategicaSchema }) },
      },
    },
    ...standardErrorResponses([400, 401, 403, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/strategic-lines/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/strategic-lines/{id}",
  tags: ["Strategic lines"],
  summary: "Renombra o suspende/restaura una línea estratégica (solo ADMINISTRADOR)",
  description:
    "Acepta `nombre` y `activo` (suspender/restaurar). Suspender marca `fecha_suspension`; restaurar la " +
    "limpia. `codigo` es inmutable: enviarlo devuelve 400 VALIDATION_ERROR, defensa en profundidad sobre " +
    "el trigger de la base de datos. El cambio se audita en `auditoria_cambios` (antes/después por campo) " +
    "dentro de la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: LineaIdParams,
    body: { content: { "application/json": { schema: LINEA_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Línea estratégica actualizada.",
      content: {
        "application/json": { schema: z.object({ linea: LineaEstrategicaSchema }) },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/strategic-lines/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "delete",
  path: "/api/v1/strategic-lines/{id}",
  tags: ["Strategic lines"],
  summary: "Suspende una línea estratégica; nunca la elimina (solo ADMINISTRADOR)",
  description:
    "Borrado lógico: la fila NO se elimina, se suspende (`activo: false` + `fecha_suspension`). No hay " +
    "hard delete en este módulo. El 409 cuando la línea tiene datos asociados llega con S2.1, junto al " +
    "modelo `Proyecto`.",
  security: [{ sessionCookie: [] }],
  request: { params: LineaIdParams },
  responses: {
    200: {
      description: "Línea estratégica suspendida (la fila sigue existiendo).",
      content: {
        "application/json": { schema: z.object({ linea: LineaEstrategicaSchema }) },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
