// OpenAPI registrations for /api/v1/settings/semaforo-v2 — parámetros del
// semáforo v2. Mirrors route.ts: same statuses, same body shape, same auth.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { SEMAFORO_V2_PATCH_SCHEMA } from "@/app/api/v1/settings/semaforo-v2/route";

const NumericParametro = z.object({ valor: z.number(), confirmado: z.boolean() });
const BooleanParametro = z.object({ valor: z.boolean(), confirmado: z.boolean() });

const ParametrosSchema = registry.register(
  "SemaforoParametrosV2",
  z.object({
    umbral1: NumericParametro.openapi({ description: "Puntos porcentuales; menor que `umbral2`." }),
    umbral2: NumericParametro.openapi({ description: "Puntos porcentuales." }),
    tolerancia: NumericParametro.openapi({ description: "Porcentaje 0–100." }),
    retraso: NumericParametro.openapi({ description: "Porcentaje 0–100." }),
    avance_requiere_medio: BooleanParametro,
    modificacion_bloquea_periodos_pasados: BooleanParametro,
  }),
);

const ParametrosResponse = z.object({ parametros: ParametrosSchema });

registry.registerPath({
  method: "get",
  path: "/api/v1/settings/semaforo-v2",
  tags: ["Settings"],
  summary: "Parámetros del semáforo v2",
  description:
    "Cualquier usuario autenticado. Sin fila guardada o con datos mal formados responde los valores " +
    "por defecto (placeholders: ninguno está `confirmado` hasta que un administrador lo confirma).",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Parámetros vigentes.",
      content: { "application/json": { schema: ParametrosResponse } },
    },
    ...standardErrorResponses([401, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/settings/semaforo-v2",
  tags: ["Settings"],
  summary: "Actualiza parámetros del semáforo v2 (solo ADMINISTRADOR)",
  description:
    "Actualización parcial: `{ <parametro>: { valor?, confirmado? } }`. `confirmado` solo cambia cuando se " +
    "envía explícitamente. Porcentajes entre 0 y 100; `umbral1` < `umbral2`. Cada campo que cambia se audita " +
    "en `auditoria_cambios` (accion CAMBIAR_PARAMETRO, entidad `parametro`) dentro de la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: SEMAFORO_V2_PATCH_SCHEMA } } } },
  responses: {
    200: {
      description: "Parámetros tras el cambio.",
      content: { "application/json": { schema: ParametrosResponse } },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});
