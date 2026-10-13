// OpenAPI registrations for /api/v1/settings/automatizaciones — v7 alignment
// C7a. Mirrors route.ts: same statuses, same body shape, same auth
// (ADMINISTRADOR on both verbs).

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { AUTOMATIZACIONES_PUT_SCHEMA } from "@/app/api/v1/settings/automatizaciones/route";

const CategoriasSchema = z.object({
  vencidos: z.boolean(),
  hoy: z.boolean(),
  proximos: z.boolean(),
});

const AutomatizacionesSchema = registry.register(
  "Automatizaciones",
  z.object({
    resumen_diario: z
      .boolean()
      .openapi({ description: "Si es false, el cron diario no envía el resumen." }),
    dias_por_vencer: z
      .number()
      .int()
      .openapi({ description: "Días de la ventana del bucket «próximos» (1–30)." }),
    categorias: CategoriasSchema.openapi({
      description: "Categorías del resumen que se incluyen.",
    }),
  }),
);

const AutomatizacionesResponse = z.object({ automatizaciones: AutomatizacionesSchema });

registry.registerPath({
  method: "get",
  path: "/api/v1/settings/automatizaciones",
  tags: ["Settings"],
  summary: "Automatizaciones del seguimiento diario (solo ADMINISTRADOR)",
  description:
    "Configuración del resumen diario que manda el cron: si está activo, con qué ventana de " +
    "«próximos» y qué categorías. Sin fila guardada o con datos mal formados responde los defaults.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Automatizaciones vigentes.",
      content: { "application/json": { schema: AutomatizacionesResponse } },
    },
    ...standardErrorResponses([401, 403, 500]),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/settings/automatizaciones",
  tags: ["Settings"],
  summary: "Actualiza las automatizaciones (solo ADMINISTRADOR)",
  description:
    "Actualización parcial: cualquier subconjunto de `resumen_diario`, `dias_por_vencer` " +
    "(entero 1–30) y `categorias` se fusiona sobre el valor vigente. Devuelve el valor resultante.",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: AUTOMATIZACIONES_PUT_SCHEMA } } } },
  responses: {
    200: {
      description: "Automatizaciones tras el cambio.",
      content: { "application/json": { schema: AutomatizacionesResponse } },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});
