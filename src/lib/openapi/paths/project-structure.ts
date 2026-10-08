// OpenAPI path registrations for the S3 technical structure of a project:
// /api/v1/projects/{id}/objectives, activities, deliverables and indicators.
// Registered from the actual route.ts files — same status codes, same field
// names, same auth rules. Never invent behavior the routes do not have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { OBJETIVO_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/objectives/route";
import { OBJETIVO_PATCH_SCHEMA } from "@/app/api/v1/projects/[id]/objectives/[objectiveId]/route";

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
