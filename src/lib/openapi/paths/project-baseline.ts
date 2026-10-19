// OpenAPI path registration for the S8 baseline approval (E-25, RF-05, REQ-VER-01). Registered from
// the actual route file: same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const ProjectParams = z.object({ id: z.string().uuid() });

const PrecondicionSchema = registry.register(
  "PrecondicionLineaBase",
  z.object({
    codigo: z.string().openapi({
      example: "SIN_OBJETIVOS",
      description:
        "SUMA_DISTINTA_VALOR_TOTAL, PROGRAMACION_PENDIENTE, CONTROL_PROGRAMACION, RUBRO_SUSPENDIDO_CON_ASIGNADO, " +
        "PERIODO_FUERA_DE_RANGO, SIN_VALOR_TOTAL, SIN_FECHAS, SIN_OBJETIVOS, OBJETIVO_SIN_ACTIVIDADES, " +
        "ACTIVIDAD_SIN_ENTREGABLES, META_BENEFICIARIOS_INVALIDA.",
    }),
    mensaje: z.string(),
    rubroId: z.string().uuid().optional(),
  }),
);

const BaselineResultSchema = registry.register(
  "AprobacionLineaBase",
  z.object({
    version: z.object({
      id: z.string().uuid(),
      numero: z.literal(0),
      aprobado_at: z.string().datetime(),
    }),
    proyecto: z.object({ id: z.string().uuid(), estado: z.literal("EN_EJECUCION") }),
  }),
);

const BaselineConflictSchema = z.object({
  error: z.string(),
  code: z.literal("INVALID_STATE"),
  precondiciones: z.array(PrecondicionSchema).optional().openapi({
    description: "Presente cuando faltan requisitos: se devuelven todos, no solo el primero.",
  }),
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/baseline/approve",
  tags: ["Projects"],
  summary: "Aprueba la línea base: congela la versión 0 y pasa el proyecto a En ejecución",
  description:
    "Única vía de la API para llegar a `EN_EJECUCION`. Solo `ADMINISTRADOR`/`GERENCIA`, solo desde `BORRADOR` " +
    "(404 -> 403 -> 409). En una sola transacción, con el proyecto bloqueado: verifica las precondiciones " +
    "(valor total, fechas, meta de beneficiarios, objetivos con actividades y entregables, presupuesto igual al valor " +
    "total, programación cuadrada), guarda la versión 0 (inmutable), cambia el estado y registra la auditoría `APROBAR`. " +
    "Sin cuerpo. Tras la aprobación, la estructura y el presupuesto dejan de ser editables.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    201: { description: "Línea base aprobada.", content: { "application/json": { schema: BaselineResultSchema } } },
    409: {
      description:
        "El proyecto ya tiene línea base, no está en Borrador o no cumple las precondiciones (`precondiciones`).",
      content: { "application/json": { schema: BaselineConflictSchema } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
