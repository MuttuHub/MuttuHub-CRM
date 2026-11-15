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
import { CIERRE_GASTOS_SCHEMA, REAPERTURA_GASTOS_SCHEMA } from "@/lib/api/cierre-gastos";

const WRITE_NOTE =
  "Administración, Gerencia o un integrante del equipo (`canEditProjectData`), y solo mientras el proyecto está en Borrador. El orden de " +
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
    objetivo_id: z.string().uuid().nullable().openapi({
      description:
        "null en las actividades transversales: «en las transversales el objetivo va vacío» (S6). En las normales es " +
        "siempre un objetivo vivo del mismo proyecto.",
    }),
    tipo: z.enum(["NORMAL", "TRANSVERSAL"]).openapi({
      description:
        "Tipo de actividad (S6). Una `TRANSVERSAL` agrupa el trabajo que no es de un solo objetivo, «Gestión del " +
        "proyecto», no lleva objetivo ni entregables y queda fuera del avance técnico, la curva S técnica y el " +
        "cumplimiento del cronograma; sí cuenta en presupuesto, programación, registro de gastos y vistas financieras.",
      example: "NORMAL",
    }),
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
      description:
        "DERIVADO, nunca almacenado ni editable (AJ-02): `semana_fin - semana_inicio + 1`.",
      example: 4,
    }),
    responsable_id: z.string().uuid().nullable(),
    fuera_de_duracion: z.boolean().openapi({
      description:
        "true cuando las semanas superan la duración actual del proyecto (el proyecto se acortó después). Solo se marca; no bloquea la edición del proyecto.",
    }),
    gastos_cerrados: z.boolean().openapi({
      description:
        "S11/T14.5 (EV-07): true cuando el Gestor cerró los gastos de la actividad. Cerrada, no admite gastos nuevos y muestra ahorro o sobreejecución; se reabre con un motivo, que queda en auditoría.",
      example: false,
    }),
    gastos_cerrados_at: z.string().nullable().openapi({
      description: "Instante del cierre; null mientras los gastos están abiertos.",
    }),
    gastos_cerrados_nota: z.string().nullable().openapi({
      description:
        "Nota obligatoria del cierre: explica la diferencia (por qué no se va a gastar el resto). null mientras están abiertos.",
    }),
    gastos_cerrados_por: z.string().nullable().openapi({
      description:
        "Usuario que cerró los gastos, como id sin relación: el cierre sobrevive a un usuario borrado, igual que en la auditoría.",
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
    "vivo del mismo proyecto, o responde 400. Un proyecto sin fechas responde 400. El peso no se envía ni se edita " +
    "(AJ-02): es siempre la duración en semanas, y enviar `peso` responde 400 como campo desconocido. Las fechas no se " +
    "aceptan: se derivan de las semanas. `tipo` es opcional y por defecto `NORMAL`; una `NORMAL` exige `objetivo_id`, " +
    "y una `TRANSVERSAL` no lleva objetivo (`objetivo_id` ausente o `null`), o responde 400 en ambos casos. El `tipo` " +
    "también se edita por PATCH, y el cambio mantiene el par coherente en la misma escritura: pasar a `TRANSVERSAL` " +
    "vacía el objetivo y volver a `NORMAL` exige enviar uno.",
  deleteConflict:
    "Responde 409 CONFLICT mientras la actividad tenga entregables vivos o registros de beneficiarios no anulados.",
});

/**
 * S11/T14.5 (EV-07): what the closure endpoints answer and what the financial screen reads (5-B). The state is a
 * boolean plus the note, the instant and the actor; the ahorro or the sobreejecución are NOT here — they are
 * derived from the executed amount by the financial sheet, never stored by the closure.
 */
const ActividadGastosSchema = registry.register(
  "ActividadGastos",
  z.object({
    id: z.string().uuid(),
    gastos_cerrados: z.boolean().openapi({
      description: "true cuando el Gestor cerró los gastos de la actividad; desde entonces no admite gastos nuevos.",
    }),
    gastos_cerrados_at: z.string().nullable().openapi({ example: "2026-11-16T15:00:00.000Z" }),
    gastos_cerrados_nota: z.string().nullable().openapi({
      description: "La nota obligatoria del cierre, máx. 1000 caracteres: explica la diferencia entre lo asignado y lo ejecutado.",
    }),
    gastos_cerrados_por: z.string().nullable().openapi({
      description:
        "Usuario que cerró. Escalar suelto y sin relación, igual que `usuario_id` en la auditoría, para que el cierre " +
        "sobreviva a un usuario borrado.",
    }),
  }),
);

const ActividadParams = z.object({ id: z.string().uuid(), activityId: z.string().uuid() });
const ActividadGastosEnvelope = z.object({ actividad: ActividadGastosSchema });
const CIERRE_GATE_NOTE =
  "Mismo gate que registrar un gasto: ADMINISTRADOR/GERENCIA o un integrante del equipo con `canExecuteProject`, y el " +
  "proyecto en `EN_EJECUCION` (404 -> 403 -> 409 INVALID_STATE -> 400). La escritura y sus filas de auditoría comparten " +
  "una transacción.";

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/activities/{activityId}/close-expenses",
  tags: ["Projects"],
  summary: "Cierra los gastos de la actividad (Gestor)",
  description:
    `${CIERRE_GATE_NOTE} S11/EV-07: el cuerpo exige una \`nota\` no vacía de hasta 1000 caracteres que explica la ` +
    `diferencia; la actividad pasa a mostrar ahorro o sobreejecución con esa nota y sus líneas dejan de admitir gastos ` +
    `nuevos (409 INVALID_STATE con el motivo y cómo deshacerlo). Audita \`EDITAR\` sobre \`actividad\` con ` +
    `\`gastos_cerrados_at\`, \`gastos_cerrados_nota\` y \`gastos_cerrados_por\`. Cerrar una actividad ya cerrada responde ` +
    `409 CONFLICT, nunca un éxito silencioso.`,
  security: [{ sessionCookie: [] }],
  request: {
    params: ActividadParams,
    body: { content: { "application/json": { schema: CIERRE_GASTOS_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Gastos cerrados; devuelve el estado de cierre de la actividad.",
      content: { "application/json": { schema: ActividadGastosEnvelope } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/activities/{activityId}/reopen-expenses",
  tags: ["Projects"],
  summary: "Reabre los gastos de la actividad (Gestor)",
  description:
    `${CIERRE_GATE_NOTE} S11 (propuesta aceptada en D4): el cuerpo exige un \`motivo\` no vacío de hasta 1000 ` +
    "caracteres; las tres columnas del cierre vuelven a `null` (la actividad muestra saldo otra vez y sus líneas " +
    "aceptan gastos) y el motivo queda en la auditoría como `motivo_reapertura`, en el mismo lote que los tres campos " +
    "limpiados. Reabrir una actividad cuyos gastos están abiertos responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ActividadParams,
    body: { content: { "application/json": { schema: REAPERTURA_GASTOS_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Gastos reabiertos; devuelve el estado abierto de la actividad.",
      content: { "application/json": { schema: ActividadGastosEnvelope } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
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
