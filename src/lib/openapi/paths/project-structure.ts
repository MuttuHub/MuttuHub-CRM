// OpenAPI path registrations for the S3 technical structure of a project:
// /api/v1/projects/{id}/objectives, activities, deliverables and indicators.
// Registered from the actual route.ts files — same status codes, same field
// names, same auth rules. Never invent behavior the routes do not have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { OBJETIVO_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/objectives/route";
import { OBJETIVO_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/objectives/[objectiveId]/route";
import { ACTIVIDAD_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/activities/route";
import { ACTIVIDAD_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/activities/[activityId]/route";
import { ENTREGABLE_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/route";
import { ENTREGABLE_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/route";
import { INDICADOR_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/indicators/route";
import { INDICADOR_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/indicators/[indicatorId]/route";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` (`canManageProjects`) y solo mientras el proyecto está en Borrador. El orden de " +
  "las respuestas es 404 (proyecto desconocido o con borrado lógico) -> 403 -> 409 INVALID_STATE -> 400. La " +
  "escritura y sus filas de auditoría comparten una transacción.";

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA o un COORDINADOR integrante activo). " +
  "Un proyecto desconocido responde 404 antes del 403.";

type StructureResource = {
  /** Path segment under /projects/{id}, e.g. "objectives". */
  segment: string;
  /** Name of the id path parameter, e.g. "objectiveId". */
  param: string;
  tag: string;
  singular: string;
  plural: string;
  /** Key of the singular item in the JSON envelope, e.g. "objetivo". */
  itemKey: string;
  listKey: string;
  item: z.ZodType;
  create: z.ZodType;
  patch: z.ZodType;
  createExtra?: string;
  deleteConflict: string;
};

const ProjectIdParams = z.object({ id: z.string().uuid() });

function registerStructureResource(r: StructureResource): void {
  const collection = `/api/v1/projects/{id}/${r.segment}`;
  const member = `${collection}/{${r.param}}`;
  const memberParams = z.object({ id: z.string().uuid(), [r.param]: z.string().uuid() });
  const itemEnvelope = z.object({ [r.itemKey]: r.item });

  registry.registerPath({
    method: "get",
    path: collection,
    tags: ["Projects"],
    summary: `Lista ${r.plural} del proyecto`,
    description: `Solo filas vivas (sin borrado lógico). ${READ_NOTE}`,
    security: [{ sessionCookie: [] }],
    request: { params: ProjectIdParams },
    responses: {
      200: {
        description: `${r.plural} vivos del proyecto.`,
        content: { "application/json": { schema: z.object({ [r.listKey]: z.array(r.item) }) } },
      },
      ...standardErrorResponses([401, 403, 404, 500]),
    },
  });

  registry.registerPath({
    method: "post",
    path: collection,
    tags: ["Projects"],
    summary: `Crea ${r.singular} (solo ADM/GER, Borrador)`,
    description:
      `${WRITE_NOTE} Un código repetido entre filas vivas responde 409 CONFLICT desde el índice único parcial. ` +
      `${r.createExtra ?? ""}`.trim(),
    security: [{ sessionCookie: [] }],
    request: {
      params: ProjectIdParams,
      body: { content: { "application/json": { schema: r.create } } },
    },
    responses: {
      201: { description: "Creado.", content: { "application/json": { schema: itemEnvelope } } },
      ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
    },
  });

  registry.registerPath({
    method: "patch",
    path: member,
    tags: ["Projects"],
    summary: `Edita ${r.singular} (solo ADM/GER, Borrador)`,
    description: `${WRITE_NOTE} Una auditoría \`EDITAR\` por campo cambiado.`,
    security: [{ sessionCookie: [] }],
    request: {
      params: memberParams,
      body: { content: { "application/json": { schema: r.patch } } },
    },
    responses: {
      200: { description: "Actualizado.", content: { "application/json": { schema: itemEnvelope } } },
      ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
    },
  });

  registry.registerPath({
    method: "delete",
    path: member,
    tags: ["Projects"],
    summary: `Elimina ${r.singular} con borrado lógico (solo ADM/GER, Borrador)`,
    description:
      `${WRITE_NOTE} Establece \`deleted_at\` y audita \`EDITAR\` con campo \`deleted_at\`. ${r.deleteConflict}`,
    security: [{ sessionCookie: [] }],
    request: { params: memberParams },
    responses: {
      200: { description: "Eliminado (borrado lógico).", content: { "application/json": { schema: itemEnvelope } } },
      ...standardErrorResponses([401, 403, 404, 409, 500]),
    },
  });
}

const ObjetivoSchema = registry.register(
  "Objetivo",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    codigo: z.string().openapi({ example: "OE1" }),
    descripcion: z.string(),
    orden: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);

registerStructureResource({
  segment: "objectives",
  param: "objectiveId",
  tag: "Projects",
  singular: "un objetivo",
  plural: "los objetivos",
  itemKey: "objetivo",
  listKey: "objetivos",
  item: ObjetivoSchema,
  create: OBJETIVO_CREATE_SCHEMA,
  patch: OBJETIVO_PATCH_SCHEMA,
  createExtra: "Sin `orden`, se agrega al final.",
  deleteConflict: "Responde 409 CONFLICT mientras el objetivo tenga actividades o indicadores vivos.",
});

const ActividadSchema = registry.register(
  "ActividadV2",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    objetivo_id: z.string().uuid(),
    codigo: z.string().openapi({ example: "1.4" }),
    nombre: z.string(),
    semana_inicio: z.number().int().openapi({ example: 3 }),
    semana_fin: z.number().int().openapi({ example: 6 }),
    fecha_inicio: z.string().nullable().openapi({
      description:
        "DERIVADA, nunca almacenada: `fecha_inicio del proyecto + 7(semana_inicio-1)`. null mientras el proyecto no tenga fechas.",
      example: "2026-10-19",
    }),
    fecha_fin: z.string().nullable().openapi({
      description: "DERIVADA: `fecha_inicio del proyecto + 7*semana_fin - 1`; no se recorta a la fecha fin del proyecto.",
      example: "2026-11-15",
    }),
    peso: z.number().openapi({
      description: "Duración en semanas salvo `peso_manual`; entonces el peso escrito.",
      example: 4,
    }),
    peso_manual: z.boolean(),
    responsable_id: z.string().uuid().nullable(),
    fuera_de_duracion: z.boolean().openapi({
      description:
        "true cuando las semanas superan la duración actual del proyecto (el proyecto se acortó después). Solo se marca; no bloquea la edición del proyecto.",
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);

registerStructureResource({
  segment: "activities",
  param: "activityId",
  tag: "Projects",
  singular: "una actividad",
  plural: "las actividades",
  itemKey: "actividad",
  listKey: "actividades",
  item: ActividadSchema,
  create: ACTIVIDAD_CREATE_SCHEMA,
  patch: ACTIVIDAD_PATCH_SCHEMA,
  createExtra:
    "Las semanas deben cumplir `1 <= semana_inicio <= semana_fin <= duración del proyecto` y el objetivo debe ser uno " +
    "vivo del mismo proyecto, o responde 400. Un proyecto sin fechas responde 400. Sin `peso` se usa la duración en " +
    "semanas; un `peso` enviado queda como manual. Las fechas no se aceptan: se derivan de las semanas.",
  deleteConflict:
    "Responde 409 CONFLICT mientras la actividad tenga entregables vivos o registros de beneficiarios no anulados.",
});

const EntregableSchema = registry.register(
  "Entregable",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    actividad_id: z.string().uuid(),
    codigo: z.string().openapi({ example: "1.4-E1" }),
    descripcion: z.string(),
    cantidad_meta: z.string().openapi({
      description: "Decimal(15,2) serializado como string; siempre > 0.",
      example: "100",
    }),
    unidad: z.string().openapi({ example: "prendas" }),
    tipo_medio_exigido: z.string().openapi({
      description: "Texto libre: el tipo de evidencia que exige el entregable.",
      example: "Acta firmada",
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);

registerStructureResource({
  segment: "deliverables",
  param: "deliverableId",
  tag: "Projects",
  singular: "un entregable",
  plural: "los entregables",
  itemKey: "entregable",
  listKey: "entregables",
  item: EntregableSchema,
  create: ENTREGABLE_CREATE_SCHEMA,
  patch: ENTREGABLE_PATCH_SCHEMA,
  createExtra:
    "Exige `cantidad_meta > 0`, `unidad` y `tipo_medio_exigido`. La actividad debe ser una viva del mismo proyecto, " +
    "o responde 400. El código es único por proyecto entre filas vivas.",
  deleteConflict: "Responde 409 CONFLICT mientras el entregable tenga avances no anulados.",
});

const IndicadorSchema = registry.register(
  "Indicador",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    objetivo_id: z.string().uuid(),
    codigo: z.string().openapi({ example: "IND-01" }),
    nombre: z.string(),
    meta: z.string().openapi({ description: "Decimal(15,2) serializado como string; siempre > 0.", example: "50" }),
    unidad: z.string().openapi({ example: "personas" }),
    linea_base: z.string().nullable().openapi({
      description: "Decimal(15,2) como string, opcional y >= 0.",
      example: "5",
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);

registerStructureResource({
  segment: "indicators",
  param: "indicatorId",
  tag: "Projects",
  singular: "un indicador de resultado",
  plural: "los indicadores de resultado",
  itemKey: "indicador",
  listKey: "indicadores",
  item: IndicadorSchema,
  create: INDICADOR_CREATE_SCHEMA,
  patch: INDICADOR_PATCH_SCHEMA,
  createExtra:
    "Exige objetivo, código, nombre, `meta > 0` y `unidad`; `linea_base` es opcional y >= 0. El objetivo debe ser " +
    "uno vivo del mismo proyecto, o responde 400. El código es único por proyecto entre filas vivas.",
  deleteConflict: "Responde 409 CONFLICT mientras el indicador tenga mediciones no anuladas.",
});
