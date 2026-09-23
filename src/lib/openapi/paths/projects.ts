// OpenAPI path registrations for the Proyecto module
// (tablero-seguimiento-social, Fases 2b/3/4): the top-level project CRUD that
// backs `/proyectos`, the "Crear proyecto" CTA and the Resumen del proyecto.
// See src/lib/openapi/paths/notifications.ts for the reference pattern this
// file follows: read the actual route.ts first, then register exactly what it
// does — same status codes, same field names, same auth/scope rules.
//
// Alcance (src/lib/api/projects.ts): `canViewManagementDashboard` ve todos los
// proyectos no borrados; el resto solo los suyos (`responsable_id`). Escritura
// gateada por `canCreateProject` (crear) y `canManageProject` (editar/eliminar,
// con el eje `responsable_id`). Las sub-rutas (goals/activities/indicators/
// attachments/budget/expenses) no se documentan en este batch.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const LineaEstrategicaSchema = z.enum([
  "EMPLEABILIDAD",
  "EMPRENDIMIENTO",
  "PRODUCTIVIDAD",
  "CULTURAL",
  "SOCIAL",
  "CIVICO_POLITICO",
  "METODO_MUTTU",
  "AMBIENTAL",
]);

const EstadoProyectoSchema = z.enum([
  "PLANIFICACION",
  "EN_EJECUCION",
  "SUSPENDIDO",
  "CERRADO",
  "CANCELADO",
]);

const ProjectItemSchema = registry.register(
  "ProjectItem",
  z.object({
    id: z.string().uuid(),
    codigo: z.string(),
    nombre: z.string(),
    cliente_id: z.string().uuid(),
    cliente_nombre: z.string(),
    oportunidad_id: z.string().uuid().nullable(),
    territorio: z.string(),
    linea_estrategica: LineaEstrategicaSchema,
    fecha_inicio: z.string().datetime(),
    fecha_fin: z.string().datetime(),
    estado: EstadoProyectoSchema,
    beneficiarios_meta: z.number().int(),
    responsable_id: z.string().uuid(),
    responsable_nombre: z.string(),
    puede_editar_proyecto: z.boolean().openapi({
      description: "Precalculado por el servidor con `canManageProject` — la UI no lo recalcula.",
    }),
    umbrales_override: z.unknown().openapi({
      description: "JSON opcional del proyecto (merge sobre `Setting['semaforo_umbrales']`). Presente en el listado.",
    }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);

const ProjectCreateSchema = z.object({
  codigo: z.string().trim().min(1).max(60),
  nombre: z.string().trim().min(1).max(200),
  cliente_id: z.string().min(1),
  territorio: z.string().trim().min(1).max(160),
  linea_estrategica: LineaEstrategicaSchema,
  fecha_inicio: z.string().openapi({ description: "Fecha válida (YYYY-MM-DD)." }),
  fecha_fin: z.string().openapi({ description: "Fecha válida (YYYY-MM-DD)." }),
  beneficiarios_meta: z.number().int().min(0).optional(),
  responsable_id: z.string().min(1).optional().openapi({
    description: "Por defecto, el usuario que crea.",
  }),
});

const ProjectPatchSchema = z
  .object({
    codigo: z.string().trim().min(1).max(60),
    nombre: z.string().trim().min(1).max(200),
    territorio: z.string().trim().min(1).max(160),
    linea_estrategica: LineaEstrategicaSchema,
    fecha_inicio: z.string(),
    fecha_fin: z.string(),
    beneficiarios_meta: z.number().int().min(0),
    responsable_id: z.string().min(1),
  })
  .partial();

registry.registerPath({
  method: "get",
  path: "/api/v1/projects",
  tags: ["Proyectos"],
  summary: "Lista los proyectos visibles para el usuario",
  description:
    "Alcance: `canViewManagementDashboard` ve todos los proyectos no borrados; el resto solo donde es " +
    "`responsable_id`. `oportunidad_id?` filtra por oportunidad (lo usa el CTA 'Crear proyecto' para " +
    "mostrar el enlace al proyecto existente).",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      oportunidad_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: "Proyectos visibles ordenados por `created_at` descendente.",
      content: { "application/json": { schema: z.object({ proyectos: z.array(ProjectItemSchema) }) } },
    },
    ...standardErrorResponses([401, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects",
  tags: ["Proyectos"],
  summary: "Crea un proyecto",
  description:
    "Gateado por `canCreateProject` (ADMINISTRADOR/GERENCIA/COORDINADOR). Nunca acepta `oportunidad_id` ni " +
    "`cliente_id` inconsistentes: el `cliente_id` debe existir y el `responsable_id` debe estar activo.",
  security: [{ sessionCookie: [] }],
  request: {
    body: { content: { "application/json": { schema: ProjectCreateSchema } } },
  },
  responses: {
    201: {
      description: "Proyecto creado (una fila de auditoría `entidad: proyecto`, acción `crear`).",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}",
  tags: ["Proyectos"],
  summary: "Detalle de un proyecto",
  description: "Gateado por `canViewProject` (gestión, o el propio `responsable_id`).",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Proyecto solicitado.",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemSchema }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/projects/{id}",
  tags: ["Proyectos"],
  summary: "Actualiza un proyecto",
  description:
    "Gateado por `canManageProject` (gestión, o el propio `responsable_id`). Requiere al menos un campo. " +
    "No permite cambiar `cliente_id` ni `oportunidad_id`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: ProjectPatchSchema } } },
  },
  responses: {
    200: {
      description: "Proyecto actualizado (auditoría `editar`).",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/projects/{id}",
  tags: ["Proyectos"],
  summary: "Elimina (soft-delete) un proyecto",
  description:
    "Gateado por `canManageProject`. Marca `deleted_at`; no borra físicamente ni sus sub-recursos (auditoría `eliminar`).",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Proyecto eliminado (sin cuerpo)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
