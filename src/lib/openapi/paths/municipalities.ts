// OpenAPI path registrations for /api/v1/municipalities/* — municipios catalog
// v2 (REQ-CAT-04). Follows the pattern of
// src/lib/openapi/paths/strategic-lines.ts: read the actual route.ts first, then
// register exactly what it does — same status codes, same field names, same
// auth rules. Never invent behavior the route does not have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { MUNICIPIO_CREATE_SCHEMA } from "@/app/api/v1/municipalities/route";
import { MUNICIPIO_PATCH_SCHEMA } from "@/app/api/v1/municipalities/[id]/route";

const MunicipioSchema = registry.register(
  "Municipio",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    departamento: z.string(),
    codigo_dane: z.string().nullable().openapi({
      description:
        "Código DANE de 5 dígitos. Opcional y único SOLO cuando está presente: varios municipios " +
        "pueden no tener código, pero un código repetido se rechaza con 409.",
    }),
    activo: z.boolean().openapi({ description: "false = suspendido (nunca eliminado)." }),
    fecha_suspension: z.string().datetime().nullable().openapi({
      description: "Momento de la suspensión; se limpia al restaurar el municipio.",
    }),
    orden: z.number().int().openapi({ description: "Orden de presentación en el catálogo." }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);

const MunicipioIdParams = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// GET /api/v1/municipalities
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/municipalities",
  tags: ["Municipalities"],
  summary: "Catálogo de municipios v2",
  description:
    "Cualquier usuario autenticado. Devuelve los municipios activos ordenados por `orden`. Los " +
    "municipios suspendidos (`activo: false`) quedan fuera: nunca se eliminan, solo se suspenden. El " +
    "catálogo no viene sembrado por la migración (no existe un `territorio` heredado que normalizar); " +
    "los municipios demo viven en `prisma/seed.ts`.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      incluir_inactivos: z.enum(["true", "false"]).optional().openapi({
        description:
          "`true` incluye las filas suspendidas. Solo lo respeta ADMINISTRADOR; cualquier otro rol lo ignora y recibe solo las activas.",
      }),
    }),
  },
  responses: {
    200: {
      description: "Los municipios activos del catálogo, ordenados por `orden`.",
      content: {
        "application/json": { schema: z.object({ municipios: z.array(MunicipioSchema) }) },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/municipalities
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/municipalities",
  tags: ["Municipalities"],
  summary: "Crea un municipio (solo ADMINISTRADOR)",
  description:
    "Crea un municipio del catálogo. El `codigo_dane` es opcional; cuando viene debe tener 5 dígitos y " +
    "no puede repetirse, y `(nombre, departamento)` no puede repetirse aunque el código sea distinto. " +
    "El alta se audita en `auditoria_cambios` (accion CREAR) dentro de la misma transacción. Un " +
    "duplicado devuelve 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: MUNICIPIO_CREATE_SCHEMA } } } },
  responses: {
    201: {
      description: "Municipio creado.",
      content: {
        "application/json": { schema: z.object({ municipio: MunicipioSchema }) },
      },
    },
    ...standardErrorResponses([400, 401, 403, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/municipalities/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/municipalities/{id}",
  tags: ["Municipalities"],
  summary: "Edita, suspende o restaura un municipio (solo ADMINISTRADOR)",
  description:
    "Acepta `nombre`, `departamento`, `codigo_dane` (null lo borra) y `activo` (suspender/restaurar). " +
    "Suspender marca `fecha_suspension`; restaurar la limpia. Un `codigo_dane` o un par " +
    "`(nombre, departamento)` ya usado por otro municipio devuelve 409 CONFLICT. El cambio se audita " +
    "en `auditoria_cambios` (antes/después por campo) dentro de la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: MunicipioIdParams,
    body: { content: { "application/json": { schema: MUNICIPIO_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Municipio actualizado.",
      content: {
        "application/json": { schema: z.object({ municipio: MunicipioSchema }) },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/municipalities/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "delete",
  path: "/api/v1/municipalities/{id}",
  tags: ["Municipalities"],
  summary: "Suspende un municipio; nunca lo elimina (solo ADMINISTRADOR)",
  description:
    "Borrado lógico: la fila NO se elimina, se suspende (`activo: false` + `fecha_suspension`). No hay " +
    "hard delete en este módulo. El 409 cuando un proyecto usa el municipio, y el filtrado de " +
    "suspendidos al crear proyectos, llegan con S2.1 junto al modelo `Proyecto`.",
  security: [{ sessionCookie: [] }],
  request: { params: MunicipioIdParams },
  responses: {
    200: {
      description: "Municipio suspendido (la fila sigue existiendo).",
      content: {
        "application/json": { schema: z.object({ municipio: MunicipioSchema }) },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
