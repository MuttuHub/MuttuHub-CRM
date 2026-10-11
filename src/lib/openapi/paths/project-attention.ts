// OpenAPI registration of the S14 per-project "Requiere atención" endpoint. Registered from the real
// route file: same filters, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const CORTE = z.string().openapi({ example: "2026-03-15", description: "Fecha calendario AAAA-MM-DD (por defecto hoy en Bogotá)." });

const AtencionItemSchema = registry.register(
  "AtencionItem",
  z.object({
    tipo: z.enum([
      "alerta_retraso",
      "rubro_sobreejecucion",
      "actividad_atrasada",
      "avance_sin_soporte",
      "indicador_bajo_meta",
      "gasto_observado",
    ]),
    titulo: z.string().openapi({ description: "Título en español, propiedad del servidor." }),
    detalle: z.string().openapi({ description: "Detalle en español, propiedad del servidor." }),
    rubro_id: z.string().optional(),
    actividad_id: z.string().optional(),
    avance_id: z.string().optional(),
    indicador_id: z.string().optional(),
    gasto_id: z.string().optional(),
  }),
);

const AtencionSchema = registry.register(
  "AtencionProyecto",
  z.object({
    corte: CORTE,
    medible: z.boolean().openapi({ description: "false para BORRADOR, PLANIFICACION o CANCELADO: la lista viene vacía." }),
    items: z.array(AtencionItemSchema).openapi({
      description:
        "Rubros sobreejecutados (E > A), actividades vencidas y bajo 100 % (D3), avances sin soporte, indicadores bajo meta, " +
        "la alerta de retraso financiero y los gastos observados (D5).",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/attention",
  tags: ["Projects"],
  summary: "Lista de lo que requiere atención en un proyecto",
  description:
    "Derivada en el servidor: rubros con ejecutado sobre lo asignado, actividades vencidas al corte con avance < 100 % (D3), " +
    "avances sin soporte, indicadores cuyo último valor no alcanza la meta, la alerta de retraso financiero y los gastos " +
    "REGISTRADO observados (D5). El servidor es dueño del texto y de las referencias; el cliente solo pinta (D11). Lee quien " +
    "puede leer la ficha del proyecto, en cualquier estado (404 -> 403 -> 409 sin fechas -> 400 corte inválido); un proyecto no " +
    "medible responde 200 con `medible: false` y una lista vacía.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ corte: CORTE.optional() }),
  },
  responses: {
    200: { description: "Lista de lo que requiere atención.", content: { "application/json": { schema: AtencionSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});
