// OpenAPI path registrations for /api/v1/projects/* — v2 projects general
// data (contracts E-02 and E-06). Follows the pattern of
// src/lib/openapi/paths/strategic-lines.ts: read the actual route.ts first,
// then register exactly what it does — same status codes, same field names,
// same auth rules. Never invent behavior the route does not have.
//
// Out of scope here by design: the POST (E-03), the eligible-opportunities and
// opportunity-conversion endpoints (E-05/E-06), members (S2.6) and the
// value-difference alert (S2.4).

import { z } from "zod";
import { EstadoProyecto, OrigenProyecto } from "@prisma/client";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { PROJECT_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/route";

const ProjectLineaSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string().openapi({ example: "LE01" }),
  nombre: z.string().openapi({ example: "Empleabilidad" }),
  principal: z.boolean().openapi({
    description: "Exactamente una línea por proyecto; lo impone `validarLineas` y el índice parcial `proyecto_lineas_principal_uq`.",
  }),
});

const ProjectMunicipioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().openapi({ example: "Medellín" }),
  departamento: z.string().openapi({ example: "Antioquia" }),
});

const ProjectItemV2Schema = registry.register(
  "ProjectItemV2",
  z.object({
    id: z.string().uuid(),
    codigo: z.string().openapi({ example: "PRY-2026-001" }),
    nombre: z.string(),
    estado: z.enum(EstadoProyecto),
    origen: z.enum(OrigenProyecto).nullable(),
    cliente: z.object({ id: z.string().uuid(), nombre: z.string() }),
    responsable: z.object({ id: z.string().uuid(), nombre: z.string() }).nullable(),
    fecha_inicio: z
      .string()
      .nullable()
      .openapi({ description: "Columna `@db.Date`: fecha calendario YYYY-MM-DD.", example: "2026-10-05" }),
    fecha_fin: z
      .string()
      .nullable()
      .openapi({ description: "Columna `@db.Date`: fecha calendario YYYY-MM-DD.", example: "2027-01-29" }),
    duracion_semanas: z.number().int().nullable().openapi({
      description: "Calculada en lectura con la fórmula RF-07: ceil((fecha_fin − fecha_inicio + 1) / 7). null mientras falte una fecha.",
      example: 17,
    }),
    valor_total: z
      .string()
      .nullable()
      .openapi({ description: "Decimal(15,2) serializado como string por Prisma/decimal.js.", example: "245450000" }),
    diferencia_valor_oportunidad: z
      .string()
      .nullable()
      .openapi({ description: "Decimal(15,2) serializado como string. La alerta DIFERENCIA_VALOR llega con S2.4.", example: "50000" }),
    beneficiarios_meta: z.number().int().nullable(),
    lineas: z.array(ProjectLineaSchema),
    municipios: z.array(ProjectMunicipioSchema),
  }),
);

const ProjectIdParams = z.object({ id: z.string().uuid() });

const ProjectStateConflictSchema = registry.register(
  "ProjectStateConflict",
  z.object({
    error: z.string().openapi({
      example: "Solo se pueden editar los datos generales de un proyecto en Borrador.",
    }),
    code: z.literal("INVALID_STATE"),
  }),
);

/** Shared query string of E-02. */
const ProjectListQuery = z.object({
  estado: z.enum(EstadoProyecto).optional(),
  cliente_id: z.string().uuid().optional(),
  linea_id: z.string().uuid().optional(),
  municipio_id: z.string().uuid().optional(),
  responsable_id: z.string().uuid().optional(),
});

const SCOPE_NOTE =
  "Lee el proyecto quien tiene alcance de portafolio (ADMINISTRADOR/GERENCIA, más el flag gerencial cuando su " +
  "loader exista). El alcance por pertenencia al equipo (`ProyectoMiembro`) llega con S2.6; mientras tanto un " +
  "COORDINADOR no resuelve pertenencia y recibe 403 en el detalle y una lista vacía.";

// ---------------------------------------------------------------------------
// GET /api/v1/projects
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/projects",
  tags: ["Projects"],
  summary: "Lista de proyectos v2 con filtros (P01)",
  description:
    `Cualquier usuario autenticado puede llamar al endpoint; la lista queda acotada por el alcance de lectura. ${SCOPE_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { query: ProjectListQuery },
  responses: {
    200: {
      description: "Proyectos visibles para el actor, ordenados por código.",
      content: {
        "application/json": { schema: z.object({ proyectos: z.array(ProjectItemV2Schema) }) },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}",
  tags: ["Projects"],
  summary: "Ficha general de un proyecto (P02)",
  description:
    `Devuelve un ` + "`ProjectItemV2`" + `. Un id desconocido responde 404; un proyecto que existe pero queda ` +
    `fuera del alcance del actor responde 403 (la existencia ya es pública por los enlaces). ${SCOPE_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectIdParams },
  responses: {
    200: {
      description: "La ficha general del proyecto.",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemV2Schema }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/projects/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/projects/{id}",
  tags: ["Projects"],
  summary: "Edita los datos generales de un proyecto en Borrador (P06, solo ADM/GER)",
  description:
    "Acepta `nombre`, `origen`, `fecha_inicio`, `fecha_fin`, `valor_total`, `beneficiarios_meta`, `responsable_id`, " +
    "`lineas` (reemplazo N..N, 1..n con exactamente una principal) y `municipio_ids` (reemplazo N..N). " +
    "Fuera de `BORRADOR` responde 409 INVALID_STATE. Las escrituras y las filas de auditoría van en una sola " +
    "transacción: una por campo cambiado, por línea y por municipio cambiados. `codigo`, `estado`, `miembro_ids` " +
    "(S2.6) y `diferencia_valor_oportunidad` (S2.4) se rechazan con 400, y la respuesta no incluye `alertas`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectIdParams,
    body: { content: { "application/json": { schema: PROJECT_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Proyecto actualizado.",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemV2Schema }) } },
    },
    409: {
      description: "El proyecto ya no está en Borrador (INVALID_STATE).",
      content: { "application/json": { schema: ProjectStateConflictSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});
