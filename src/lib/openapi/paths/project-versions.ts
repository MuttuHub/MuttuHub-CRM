// OpenAPI path registration for the S8 version reads (E-27, RF-29, REQ-VER-02/03). Registered from
// the actual route files: same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const ProjectParams = z.object({ id: z.string().uuid() });

const VersionResumenSchema = registry.register(
  "VersionProyecto",
  z.object({
    numero: z.number().int().min(0).openapi({ description: "0 es la línea base; cada modificación aprobada suma uno." }),
    tipo: z.enum(["LINEA_BASE", "MODIFICACION"]),
    aprobado_at: z.string().datetime(),
    aprobado_por: z.object({ id: z.string().uuid(), nombre: z.string().nullable() }),
    motivo: z.string().nullable().openapi({ description: "Motivo de la solicitud aprobada; null en la línea base." }),
    solicitud_id: z.string().uuid().nullable(),
  }),
);

const DiferenciaSchema = registry.register(
  "DiferenciaVersion",
  z.object({
    elemento: z.enum(["proyecto", "presupuesto", "programacion", "actividad", "entregable", "indicador"]),
    clave: z.string(),
    campo: z.string().openapi({ description: "`existencia` cuando el elemento aparece o desaparece." }),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/versions",
  tags: ["Projects"],
  summary: "Lista las versiones del proyecto (línea base y modificaciones aprobadas)",
  description: "Quien pueda leer el proyecto (404 -> 403). Solo metadatos: el contenido se lee por versión.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: { description: "Versiones, la más reciente primero.", content: { "application/json": { schema: z.object({ versiones: z.array(VersionResumenSchema) }) } } },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/versions/{numero}",
  tags: ["Projects"],
  summary: "Lee una versión con su contenido congelado",
  description:
    "Quien pueda leer el proyecto. El `snapshot` (esquema 1) trae proyecto, presupuesto, programación, actividades, " +
    "entregables e indicadores tal como estaban al aprobarse; es inmutable. 400 si el número no es un entero, 404 si no existe.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid(), numero: z.string().openapi({ example: "0" }) }) },
  responses: {
    200: {
      description: "La versión.",
      content: { "application/json": { schema: z.object({ version: VersionResumenSchema.extend({ snapshot: z.record(z.string(), z.unknown()) }) }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/versions/compare",
  tags: ["Projects"],
  summary: "Compara dos versiones (por defecto la original contra la vigente)",
  description:
    "Quien pueda leer el proyecto. `from` y `to` son un número de versión o `vigente` (se arma con las tablas vivas); " +
    "por defecto `from=0` y `to=vigente`. Responde las diferencias ordenadas por elemento y clave. 400 si un token no es " +
    "válido, 404 si una versión no existe.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    query: z.object({
      from: z.string().optional().openapi({ example: "0" }),
      to: z.string().optional().openapi({ example: "vigente" }),
    }),
  },
  responses: {
    200: {
      description: "Diferencias.",
      content: { "application/json": { schema: z.object({ desde: z.string(), hasta: z.string(), diferencias: z.array(DiferenciaSchema) }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});
