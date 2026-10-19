// OpenAPI path registrations for /api/v1/notifications/* — reference
// implementation for the other domain files (auth, clients, tasks,
// documents, dashboard-admin): read the actual route.ts first, then
// register exactly what it does — same status codes, same field names,
// same auth/scope rules. Never invent behavior the route doesn't have.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const OrigenTareaSchema = z.enum(["CRM", "KANBAN", "AMBOS"]).openapi("OrigenTarea");

const AlertItemSchema = registry.register(
  "AlertItem",
  z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    estado: z.string(),
    fecha_entrega: z.string().datetime(),
    origen: OrigenTareaSchema,
    responsable_id: z.string().uuid(),
    responsable_nombre: z.string(),
    cliente_id: z.string().uuid().nullable(),
    cliente_nombre: z.string().nullable(),
    notificacion_id: z.string().uuid().nullable().openapi({
      description: "Fila de la tabla notificaciones para este alert; null si la reconciliación falló.",
    }),
  }),
);

const NotificationsSnapshotSchema = registry.register(
  "NotificationsSnapshot",
  z.object({
    total: z.number().int(),
    vencidos: z.array(AlertItemSchema),
    hoy: z.array(AlertItemSchema),
    proximos3: z.array(AlertItemSchema),
    leidas_ids: z.array(z.string().uuid()),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/notifications",
  tags: ["Notificaciones"],
  summary: "Panel de alertas (vencidas, hoy, próximos 3 días)",
  description:
    "Alcance: COLABORADOR ve solo sus propias tareas; el resto de roles ve todas. " +
    "El motor de alertas (src/lib/alerts.ts) es la misma fuente que usa el panel de la campana, el resumen del dashboard y el cron diario.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      leida: z
        .enum(["false"])
        .optional()
        .openapi({ description: "Si es 'false', devuelve solo las alertas sin leer (badge de la campana)." }),
    }),
  },
  responses: {
    200: {
      description: "Snapshot de alertas del usuario actual.",
      content: { "application/json": { schema: NotificationsSnapshotSchema } },
    },
    ...standardErrorResponses([401, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/notifications/read-all",
  tags: ["Notificaciones"],
  summary: "Marca como leídas todas las alertas visibles del snapshot actual",
  description:
    "Solo afecta las tarea_id incluidas en el snapshot en este momento — una tarea que ya salió del snapshot (completada/borrada) no se toca.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Cantidad de filas marcadas como leídas.",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), updated: z.number().int() }),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

const NotificacionLeidaSchema = z.object({
  notificacion: z.object({ id: z.string().uuid(), leida: z.boolean() }),
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/notifications/{id}/read",
  tags: ["Notificaciones"],
  summary: "Marca una notificación propia como leída",
  description: "Idempotente: repetir sobre una ya leída devuelve 200 sin cambios. 404 si es de otro usuario (no filtra información ajena).",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Notificación marcada como leída.", content: { "application/json": { schema: NotificacionLeidaSchema } } },
    ...standardErrorResponses([401, 404, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/notifications/{id}/read",
  tags: ["Notificaciones"],
  summary: "Deshace el estado leído de una notificación propia (undo de 'marcar todas')",
  description: "Idempotente: repetir sobre una ya no-leída devuelve 200 sin cambios. 404 si es de otro usuario.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: "Notificación marcada como no leída.", content: { "application/json": { schema: NotificacionLeidaSchema } } },
    ...standardErrorResponses([401, 404, 500]),
  },
});
