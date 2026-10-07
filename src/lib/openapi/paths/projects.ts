// OpenAPI path registrations for /api/v1/projects/* — v2 projects general
// data (contracts E-02, E-03, E-04, E-06 and E-07) plus the project history
// reader (REQ-AUD-04). Follows the pattern of
// src/lib/openapi/paths/strategic-lines.ts: read the actual route.ts first,
// then register exactly what it does — same status codes, same field names,
// same auth rules. Never invent behavior the route does not have.
//
// The one-step GANADA conversion (E-05) lives in paths/clients.ts with the
// rest of the client-scoped routes. Still out of scope: the value-difference
// alert (S2.4).

import { z } from "zod";
import { AccionAuditoria, EstadoProyecto, OrigenProyecto, RolUsuario } from "@prisma/client";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { PROJECT_CREATE_SCHEMA } from "@/app/api/v1/projects/route";
import { PROJECT_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/route";
import { MIEMBRO_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/members/route";

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

export const ProjectItemV2Schema = registry.register(
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
  "Lee el proyecto quien tiene alcance de portafolio (ADMINISTRADOR/GERENCIA) o, para un COORDINADOR, una " +
  "pertenencia activa al equipo (`ProyectoMiembro`, S2.6). Un COLABORADOR y un COORDINADOR sin pertenencia " +
  "reciben 403 en el detalle y una lista vacía.";

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
// POST /api/v1/projects
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/projects",
  tags: ["Projects"],
  summary: "Crea un proyecto independiente (E-03, solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA` (`canCreateProject`) pueden crear. Crea un proyecto `origen = INDEPENDIENTE` " +
    "(`oportunidad_id` null) en `BORRADOR` con un `codigo` autogenerado `PRY-AAAA-NNN`; la creación, las líneas, " +
    "los municipios y la fila de auditoría `CREAR` van en una sola transacción. `miembro_ids` (S2.6) se acepta: " +
    "cada id debe ser un COORDINADOR activo (400 si no existe, está inactivo o no es COORDINADOR) y el responsable " +
    "siempre entra como integrante, de modo que una entrada que lo nombre se colapsa en su única membresía; el " +
    "equipo inicial se audita como `CREAR proyecto_miembro` en su propio lote, dentro de la misma transacción. " +
    "`codigo`, `estado`, `oportunidad_id`, `deleted_at`, `umbrales_override`, `programacion_pendiente`, " +
    "`diferencia_valor_oportunidad` (S2.4) y `alertas` se rechazan con 400. Las líneas estratégicas y los " +
    "municipios deben existir y estar activos (V-04); uno suspendido responde 400. 404 si el cliente no existe.",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: PROJECT_CREATE_SCHEMA } } } },
  responses: {
    201: {
      description: "Proyecto creado (código autogenerado, estado BORRADOR).",
      content: { "application/json": { schema: z.object({ proyecto: ProjectItemV2Schema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/eligible-opportunities
// ---------------------------------------------------------------------------

const EligibleOpportunitySchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  cliente_id: z.string().uuid(),
  cliente_nombre: z.string(),
  valor_estimado_cop: z
    .string()
    .nullable()
    .openapi({ description: "Decimal(15,2) serializado como string por Prisma/decimal.js." }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/eligible-opportunities",
  tags: ["Projects"],
  summary: "Oportunidades GANADA sin proyecto (E-04, solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA` (`canCreateProject`) pueden leerla. Devuelve las oportunidades " +
    "`estado = GANADA` que no tienen ningún proyecto; `oportunidad_id` está indexado como único sin predicado " +
    "parcial, así que un proyecto con borrado lógico sigue bloqueando la creación y su oportunidad no aparece aquí.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Oportunidades elegibles para crear un proyecto.",
      content: {
        "application/json": {
          schema: z.object({ oportunidades: z.array(EligibleOpportunitySchema) }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 500]),
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
// GET /api/v1/projects/{id}/audit
// ---------------------------------------------------------------------------

/**
 * One row of the append-only change ledger (`auditoria_cambios`). The reader
 * (`src/lib/api/project-audit.ts`) caps the page and orders it newest-first
 * with an `id` tiebreaker, because the two rows of one lote share the
 * transaction's `created_at`.
 */
const ProjectAuditEntrySchema = registry.register(
  "ProjectAuditEntry",
  z.object({
    id: z.string().uuid(),
    created_at: z.string().openapi({
      description: "Instante transaccional en ISO-8601; dos filas de un mismo lote comparten el valor.",
      example: "2026-10-06T20:39:51.751Z",
    }),
    usuario_id: z.string().openapi({
      description: "Sin FK a propósito: el libro sobrevive a un usuario eliminado.",
    }),
    usuario_nombre: z.string().nullable().openapi({
      description: "null cuando el usuario ya no existe; el nombre no se inventa ni el read falla.",
    }),
    accion: z.enum(AccionAuditoria).openapi({ example: "CONVERTIR" }),
    entidad: z.string().openapi({ example: "oportunidad" }),
    entidad_id: z.string(),
    campo: z.string().nullable().openapi({
      description: "Campo cambiado; null en operaciones que auditan la operación completa (CREAR, CONVERTIR).",
    }),
    valor_anterior: z.unknown().openapi({
      description: "JSON de la columna, sin reescribir. null cuando no hay valor previo.",
    }),
    valor_nuevo: z.unknown().openapi({
      description: "JSON de la columna, sin reescribir.",
    }),
    lote_id: z.string().nullable().openapi({
      description: "Agrupa las filas de una misma operación; la conversión (CONVERTIR oportunidad) y la creación (CREAR proyecto) comparten uno.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/audit",
  tags: ["Projects"],
  summary: "Historial de cambios de un proyecto (P02)",
  description:
    "Devuelve el libro de cambios del proyecto, más recientes primero, con un máximo de 100 filas " +
    "(`PROJECT_AUDIT_LIMIT`): el libro es append-only y crece sin cota. El orden es `created_at` descendente con " +
    "`id` como desempate, porque en Postgres `now()` es el instante de la transacción y las filas de un mismo " +
    "`lote_id` pueden compartirlo. Un id desconocido responde 404; un proyecto que existe pero queda fuera del " +
    "alcance del actor responde 403. El nombre del actor se resuelve en una segunda consulta y llega en `null` " +
    `cuando el usuario ya no existe. ${SCOPE_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectIdParams },
  responses: {
    200: {
      description: "Historial del proyecto (máximo 100 filas, más recientes primero).",
      content: {
        "application/json": {
          schema: z.object({ historial: z.array(ProjectAuditEntrySchema) }),
        },
      },
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
    "Fuera de `BORRADOR` responde 409 INVALID_STATE (código compartido del envelope). Las escrituras y las filas de auditoría van en una sola " +
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

// ---------------------------------------------------------------------------
// GET/POST /api/v1/projects/{id}/members, DELETE .../members/{userId}
// ---------------------------------------------------------------------------

const ProjectMemberParams = z.object({ id: z.string().uuid(), userId: z.string() });

/** Una fila de pertenencia al equipo (E-07). */
const ProyectoMiembroSchema = registry.register(
  "ProyectoMiembro",
  z.object({
    id: z.string().uuid(),
    usuario: z.object({
      id: z.string().uuid(),
      nombre: z.string(),
      rol: z.enum(RolUsuario),
    }),
    agregado_por_id: z.string().openapi({
      description:
        "Id del usuario que agregó la fila. Columna de auditoría sin FK a propósito: la fila sobrevive a un usuario eliminado.",
    }),
    created_at: z.string().openapi({ description: "Instante en ISO-8601." }),
    removed_at: z.string().nullable().openapi({
      description:
        "null mientras la pertenencia está activa. El retiro lo establece y nunca borra la fila, así el integrante puede volver a agregarse después.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/members",
  tags: ["Projects"],
  summary: "Integrantes activos del equipo de un proyecto (P02)",
  description:
    "Lista los integrantes con pertenencia activa (`removed_at` null), del más antiguo al más reciente. Puede " +
    `leerla quien puede leer la ficha. Un id desconocido o con borrado lógico responde 404; un proyecto fuera del alcance de lectura del actor responde 403. ${SCOPE_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectIdParams },
  responses: {
    200: {
      description: "Integrantes activos, del más antiguo al más reciente.",
      content: {
        "application/json": { schema: z.object({ miembros: z.array(ProyectoMiembroSchema) }) },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/members",
  tags: ["Projects"],
  summary: "Agrega un COORDINADOR al equipo del proyecto (E-07, solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA` (`canManageProjects`, P07) pueden agregar integrantes. El cuerpo es " +
    "`{ usuario_id }`; el usuario debe existir, estar activo y tener `rol = COORDINADOR`, o responde 400 " +
    "VALIDATION_ERROR. Un usuario que ya es integrante activo responde 409 CONFLICT desde el índice único parcial " +
    "`proyecto_miembros_activo_uq`, no desde una verificación de lectura-y-escritura; un integrante retirado se " +
    "puede agregar de nuevo. Un proyecto desconocido o con borrado lógico responde 404 antes del 403, y la " +
    "escritura y su fila de auditoría `CREAR proyecto_miembro` comparten una transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectIdParams,
    body: { content: { "application/json": { schema: MIEMBRO_CREATE_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Pertenencia creada.",
      content: { "application/json": { schema: z.object({ miembro: ProyectoMiembroSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/projects/{id}/members/{userId}",
  tags: ["Projects"],
  summary: "Retira a un integrante del equipo con borrado lógico (E-07, solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA` (P07). Establece `removed_at` y `removido_por_id`; la fila nunca se elimina " +
    "y el integrante pierde el acceso de lectura de inmediato porque el alcance de lectura solo cuenta " +
    "pertenencias activas. Retirar a un usuario que no es integrante activo responde 404. Un proyecto desconocido " +
    "o con borrado lógico responde 404 antes del 403, y la actualización y sus filas de auditoría " +
    "`EDITAR proyecto_miembro` comparten una transacción.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectMemberParams },
  responses: {
    200: {
      description: "Pertenencia retirada (borrado lógico).",
      content: { "application/json": { schema: z.object({ miembro: ProyectoMiembroSchema }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
