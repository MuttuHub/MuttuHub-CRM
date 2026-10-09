// OpenAPI path registration for the S8 modification requests (E-26, RF-26..RF-28). Registered from the
// actual route files: same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const ProjectParams = z.object({ id: z.string().uuid() });

const DetalleItemSchema = registry.register(
  "DetalleModificacion",
  z.object({
    elemento: z.enum(["presupuesto", "programacion", "proyecto", "actividad", "entregable", "indicador"]),
    clave: z.string().openapi({
      example: "R12",
      description:
        "Clave de negocio: código de rubro (`presupuesto`), `R12|AAAA-MM` (`programacion`), `proyecto`, o el código " +
        "de la actividad, entregable o indicador.",
    }),
    campo: z.string().optional().openapi({
      example: "asignado",
      description:
        "`asignado` (presupuesto), `valor` (programacion), `fecha_inicio`/`fecha_fin` (proyecto), " +
        "`semana_inicio`/`semana_fin` (actividad), `cantidad_meta`/`descripcion`/`unidad` (entregable), " +
        "`meta`/`nombre`/`unidad` (indicador). Por defecto `asignado` o `valor`.",
    }),
    antes: z.string().openapi({ description: "Valor que el solicitante vio; debe coincidir con el vigente." }),
    despues: z.string().openapi({ description: "Valor propuesto." }),
  }),
);

const Persona = z.object({ id: z.string().uuid(), nombre: z.string().nullable() });

export const SolicitudModificacionSchema = registry.register(
  "SolicitudModificacion",
  z.object({
    id: z.string().uuid(),
    tipo: z.enum(["TRASLADO", "ADICION", "REDUCCION", "REPROGRAMACION", "CRONOGRAMA", "ENTREGABLES"]),
    motivo: z.string(),
    detalle: z.array(DetalleItemSchema),
    version_base_numero: z.number().int(),
    estado: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA"]),
    solicitado_por: Persona,
    solicitado_at: z.string().datetime(),
    decidido_por: Persona.nullable(),
    decidido_at: z.string().datetime().nullable(),
    comentario_decision: z.string().nullable(),
    version_numero: z.number().int().nullable().openapi({ description: "Versión creada por la aprobación." }),
  }),
);

const ReglaSchema = registry.register(
  "ReglaModificacion",
  z.object({
    codigo: z.string().openapi({
      example: "A_MENOR_QUE_EJECUTADO",
      description:
        "TRASLADO_CAMBIA_TOTAL, ADICION_NO_AUMENTA, REDUCCION_NO_DISMINUYE, A_MENOR_QUE_EJECUTADO, PERIODO_PASADO, " +
        "PROGRAMACION_DESCUADRADA, PERIODO_FUERA_DE_RANGO, ELEMENTO_NO_PERMITIDO, ELEMENTO_INEXISTENTE, " +
        "ANTES_DESACTUALIZADO, SEMANAS_INVALIDAS, FECHAS_INVALIDAS, VALOR_INVALIDO, DETALLE_DUPLICADO, DETALLE_VACIO.",
    }),
    mensaje: z.string(),
    clave: z.string().optional(),
  }),
);

const ReglasError = z.object({
  error: z.string(),
  code: z.literal("VALIDATION_ERROR"),
  reglas: z.array(ReglaSchema).optional().openapi({ description: "Todas las reglas incumplidas, no solo la primera." }),
});

const SolicitudBody = registry.register(
  "SolicitudModificacionBody",
  z.object({
    tipo: z.enum(["TRASLADO", "ADICION", "REDUCCION", "REPROGRAMACION", "CRONOGRAMA", "ENTREGABLES"]),
    motivo: z.string().min(1).max(1000),
    detalle: z.array(DetalleItemSchema).min(1).max(500),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/modifications",
  tags: ["Projects"],
  summary: "Lista las solicitudes de modificación del proyecto, la más reciente primero",
  description: "Cualquiera que pueda leer el proyecto (404 -> 403).",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: {
      description: "Solicitudes.",
      content: { "application/json": { schema: z.object({ solicitudes: z.array(SolicitudModificacionSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/modifications",
  tags: ["Projects"],
  summary: "Solicita una modificación del proyecto (traslado, adición, reducción, reprogramación, cronograma o entregables)",
  description:
    "`ADMINISTRADOR`/`GERENCIA`, o un `COORDINADOR` miembro activo del proyecto. Solo con el proyecto en `EN_EJECUCION` " +
    "y con línea base aprobada (404 -> 403 -> 409 -> 400). El detalle se valida contra el proyecto vigente con las mismas " +
    "reglas de la aprobación (RF-28): el traslado no cambia el total, la adición aumenta y la reducción disminuye, el " +
    "asignado nunca queda por debajo de lo ya ejecutado y, según el parámetro `modificacion_bloquea_periodos_pasados`, " +
    "los periodos transcurridos no se reprograman. El valor total de una adición o reducción se deriva (suma de A): no " +
    "viaja en el detalle. La solicitud queda `PENDIENTE` contra la versión vigente.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams, body: { required: true, content: { "application/json": { schema: SolicitudBody } } } },
  responses: {
    201: { description: "Solicitud registrada.", content: { "application/json": { schema: z.object({ solicitud: SolicitudModificacionSchema }) } } },
    400: { description: "Cuerpo inválido o reglas incumplidas (`reglas`).", content: { "application/json": { schema: ReglasError } } },
    409: { description: "El proyecto no está en ejecución o no tiene línea base aprobada." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
