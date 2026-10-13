// OpenAPI path registrations for /api/v1/interactions (v7 alignment C3a).
// Read-only feed over the immutable BitacoraEntrada rows: creation stays on
// POST /api/v1/clients/{id}/log, so only GET is registered here.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { TipoInteraccionSchema } from "@/lib/openapi/paths/clients";

const SCOPE_NOTE =
  "Alcance: COLABORADOR solo ve las interacciones de los clientes donde es responsable; el resto de roles (ADMINISTRADOR, GERENCIA, COORDINADOR) ve las de todos.";

const InteraccionFeedItemSchema = z.object({
  id: z.string().uuid(),
  cliente_id: z.string().uuid(),
  cliente_nombre: z.string(),
  oportunidad_id: z.string().uuid().nullable(),
  oportunidad_nombre: z.string().nullable(),
  autor_id: z.string().uuid(),
  autor_nombre: z.string(),
  texto: z.string(),
  tipo: TipoInteraccionSchema,
  proximo_paso: z.string().nullable(),
  created_at: z.string().datetime(),
});

// ── GET /api/v1/interactions — cross-client feed ─────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/interactions",
  tags: ["Interacciones"],
  summary: "Feed transversal de interacciones (bitácora) con contexto de cliente y oportunidad",
  description:
    `${SCOPE_NOTE} Lectura global de las entradas de bitácora, ordenadas por fecha descendente. ` +
    "Las entradas son inmutables por diseño (sin updated_at/deleted_at): este recurso es solo de " +
    "lectura — la creación vive en POST /api/v1/clients/{id}/log.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      cliente_id: z.string().uuid().optional().openapi({ description: "Filtra por cliente." }),
      tipo: TipoInteraccionSchema.optional().openapi({ description: "Filtra por tipo de interacción." }),
    }),
  },
  responses: {
    200: {
      description: "Interacciones visibles para el usuario actual, con su cliente y oportunidad.",
      content: {
        "application/json": {
          schema: z.object({ interacciones: z.array(InteraccionFeedItemSchema) }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});
