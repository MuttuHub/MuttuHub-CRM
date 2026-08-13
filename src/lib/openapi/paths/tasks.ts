// OpenAPI path registrations for /api/v1/tasks/* — CRM + Kanban tasks. Follows
// the pattern established in src/lib/openapi/paths/notifications.ts: read the
// actual route.ts first, then register exactly what it does (same status
// codes, same field names, same auth/scope rules).
//
// Scope model (src/lib/api/crm.ts):
//   - READ (loadTaskScoped, used by GET detail/comments/attachments/subtasks):
//     COLABORADOR only sees tasks where they are the responsable. The linked
//     client's responsable does NOT widen read scope.
//   - WRITE (getTaskForWrite, used by PATCH/DELETE/status/POST
//     comments/attachments/subtasks and the attachment download redirect):
//     COLABORADOR can act when they are the task's responsable OR the
//     responsable of the task's linked client. Full roles (ADMINISTRADOR,
//     GERENCIA, COORDINADOR) read/write everything either way.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { TASK_SCHEMA } from "@/app/api/v1/tasks/route";
import { TASK_PATCH_SCHEMA } from "@/app/api/v1/tasks/[id]/route";
import { STATUS_SCHEMA } from "@/app/api/v1/tasks/[id]/status/route";
import { COMMENT_SCHEMA } from "@/app/api/v1/tasks/[id]/comments/route";
import { SUBTASK_SCHEMA } from "@/app/api/v1/tasks/[id]/subtasks/route";
import { SUBTASK_PATCH_SCHEMA } from "@/app/api/v1/tasks/[id]/subtasks/[subtaskId]/route";

const READ_SCOPE_NOTE =
  "Alcance de lectura: COLABORADOR solo ve tareas donde es responsable; el resto de roles ve todas. " +
  "(A diferencia de las rutas de escritura, aquí el responsable del cliente vinculado NO amplía el alcance.)";
const WRITE_SCOPE_NOTE =
  "Alcance de escritura: COLABORADOR solo edita tareas donde es responsable (o del cliente vinculado, si aplica); " +
  "el resto de roles edita todas.";
const BLOQUEO_NOTE =
  "Regla BLOQUEADA: si `estado` (o el estado resultante) es 'BLOQUEADA', `motivo_bloqueo` es obligatorio " +
  "(400 VALIDATION_ERROR sin él). Al salir de BLOQUEADA hacia cualquier otro estado, el motivo guardado se " +
  "limpia siempre en el servidor, sin importar lo que envíe el cliente.";

// ---------------------------------------------------------------------------
// Shared component schemas
// ---------------------------------------------------------------------------

const EstadoTareaSchema = z
  .enum(["POR_HACER", "EN_CURSO", "EN_REVISION", "COMPLETADA", "BLOQUEADA", "EN_ESPERA", "CANCELADA"])
  .openapi("EstadoTarea");
const OrigenTareaSchema = z.enum(["CRM", "KANBAN", "AMBOS"]).openapi("OrigenTarea");
const PrioridadTareaSchema = z.enum(["ALTA", "MEDIA", "BAJA"]).openapi("PrioridadTarea");

const TaskItemSchema = registry.register(
  "TaskItem",
  z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    descripcion: z.string().nullable(),
    responsable_id: z.string().uuid(),
    responsable_nombre: z.string(),
    cliente_id: z.string().uuid().nullable(),
    cliente_nombre: z.string().nullable(),
    estado: EstadoTareaSchema,
    origen: OrigenTareaSchema,
    prioridad: PrioridadTareaSchema.nullable(),
    fecha_entrega: z.string().datetime().nullable(),
    etiquetas: z.array(z.string()),
    motivo_bloqueo: z.string().nullable(),
    comentarios_count: z.number().int(),
    subtotal: z.number().int().openapi({ description: "Total de subtareas de la tarjeta." }),
    subtotal_hechas: z
      .number()
      .int()
      .optional()
      .openapi({ description: "Subtareas completadas; solo presente cuando el endpoint agrega el conteo (list/detail)." }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);

const TaskCommentSchema = registry.register(
  "TaskComment",
  z.object({
    id: z.string().uuid(),
    autor_id: z.string().uuid(),
    texto: z.string(),
    created_at: z.string().datetime(),
    autor_nombre: z.string(),
  }),
);

const TaskDetailSchema = registry.register(
  "TaskDetail",
  z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    descripcion: z.string().nullable(),
    responsable_id: z.string().uuid(),
    responsable_nombre: z.string(),
    cliente_id: z.string().uuid().nullable(),
    cliente_nombre: z.string().nullable(),
    estado: EstadoTareaSchema,
    origen: OrigenTareaSchema,
    prioridad: PrioridadTareaSchema.nullable(),
    fecha_entrega: z.string().datetime().nullable(),
    etiquetas: z.array(z.string()),
    motivo_bloqueo: z.string().nullable(),
    comentarios_count: z.number().int(),
    subtotal: z.number().int(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    comentarios: z.array(TaskCommentSchema).openapi({ description: "Hilo completo, orden ascendente." }),
  }),
);

const TaskAttachmentSchema = registry.register(
  "TaskAttachment",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    tamano_bytes: z.number().int(),
    created_at: z.string().datetime(),
  }),
);

const TaskAttachmentCreatedSchema = registry.register(
  "TaskAttachmentCreated",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    tamano_bytes: z.number().int(),
    created_at: z.string().datetime(),
    download_url: z
      .string()
      .url()
      .nullable()
      .openapi({
        description:
          "Signed URL de Supabase Storage (60 s). BUG FIX: antes se devolvía el objeto { signedUrl, path } " +
          "completo bajo este campo en vez de la URL; ahora es siempre un string plano (o null si la firma falló).",
      }),
  }),
);

const SubtaskSchema = registry.register(
  "Subtask",
  z.object({
    id: z.string().uuid(),
    titulo: z.string(),
    completada: z.boolean(),
    tarea_id: z.string().uuid(),
  }),
);

const TaskReportPersonaSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  asignadas: z.number().int(),
  en_curso: z.number().int(),
  vencidas: z.number().int(),
  completadas: z.number().int(),
  a_tiempo: z.number().int(),
  tarde: z.number().int(),
});

const TaskReportSchema = registry.register(
  "TaskReport",
  z.object({
    rango: z.enum(["week", "month", "quarter", "all"]),
    resumen: z.object({
      total_asignadas: z.number().int(),
      vencidas_activas: z.number().int(),
      completadas: z.number().int(),
      tasa_cumplimiento: z.number().int().openapi({ description: "completadas / asignadas * 100, redondeado." }),
      a_tiempo: z.number().int(),
      tarde: z.number().int(),
    }),
    por_persona: z.array(TaskReportPersonaSchema),
    por_estado: z.array(z.object({ estado: EstadoTareaSchema, cantidad: z.number().int() })),
    por_cliente: z.array(z.object({ id: z.string().uuid(), nombre: z.string(), cantidad: z.number().int() })),
  }),
);

// Shared list/export/report query params (parseTaskFilters in
// src/app/api/v1/tasks/route.ts). `responsable` is accepted but silently
// ignored for COLABORADOR — their scope is forced downstream regardless.
const TaskFilterQueryFields = {
  q: z.string().optional().openapi({ description: "Búsqueda de texto libre en título, descripción o nombre del cliente." }),
  estado: EstadoTareaSchema.optional(),
  origen: OrigenTareaSchema.optional(),
  responsable: z
    .string()
    .optional()
    .openapi({ description: "Ignorado para COLABORADOR: su alcance ya está forzado a sí mismo." }),
  cliente: z.string().optional(),
  vencidas: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Si es 'true', filtra tareas vencidas (fecha_entrega < ahora) en estado abierto. Cualquier otro valor se trata como 'false'." }),
};

const TaskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().openapi({ description: "Página (>= 1). Default 1." }),
  limit: z.coerce.number().int().min(1).max(100).optional().openapi({ description: "Tamaño de página (1-100). Default 25." }),
  ...TaskFilterQueryFields,
});

const TaskExportQuerySchema = z.object({ ...TaskFilterQueryFields });

const TaskReportQuerySchema = z.object({
  rango: z
    .enum(["week", "month", "quarter", "all"])
    .optional()
    .openapi({ description: "Ventana sobre updated_at: week=7d, month=30d (default), quarter=90d, all=sin límite." }),
  ...TaskFilterQueryFields,
});

const TaskIdParams = z.object({ id: z.string().uuid() });
const TaskAttachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });
const TaskSubtaskParams = z.object({ id: z.string().uuid(), subtaskId: z.string().uuid() });

// ---------------------------------------------------------------------------
// GET/POST /api/v1/tasks
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks",
  tags: ["Tareas"],
  summary: "Lista de tareas (CRM + Kanban) con búsqueda, filtros y paginación",
  description:
    "COLABORADOR solo ve tareas donde es responsable (filtro forzado por servidor, el param `responsable` se " +
    "ignora para este rol); el resto de roles ve todas. Incluye el conteo de subtareas completadas por tarjeta " +
    "en una sola query agregada.",
  security: [{ sessionCookie: [] }],
  request: { query: TaskListQuerySchema },
  responses: {
    200: {
      description: "Página de tareas.",
      content: {
        "application/json": {
          schema: z.object({
            page: z.number().int(),
            limit: z.number().int(),
            total: z.number().int(),
            items: z.array(TaskItemSchema),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/tasks",
  tags: ["Tareas"],
  summary: "Crea una tarea",
  description:
    "COLABORADOR: el `responsable_id` enviado se ignora y se fuerza a la propia sesión (no puede crear tareas " +
    "para otra persona); el resto de roles puede asignar cualquier responsable activo. " +
    BLOQUEO_NOTE,
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: TASK_SCHEMA } } } },
  responses: {
    201: {
      description: "Tarea creada.",
      content: { "application/json": { schema: z.object({ task: TaskItemSchema }) } },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET/PATCH/DELETE /api/v1/tasks/{id}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/{id}",
  tags: ["Tareas"],
  summary: "Detalle de una tarea, con su hilo de comentarios completo",
  description: READ_SCOPE_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: TaskIdParams },
  responses: {
    200: {
      description: "Tarea con comentarios (orden ascendente).",
      content: { "application/json": { schema: z.object({ task: TaskDetailSchema }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/tasks/{id}",
  tags: ["Tareas"],
  summary: "Actualiza campos de una tarea (parcial)",
  description: `${WRITE_SCOPE_NOTE} ${BLOQUEO_NOTE} Envía al menos un campo (400 si el cuerpo llega vacío).`,
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskIdParams,
    body: { content: { "application/json": { schema: TASK_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Tarea actualizada.",
      content: { "application/json": { schema: z.object({ task: TaskItemSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/tasks/{id}",
  tags: ["Tareas"],
  summary: "Elimina (soft delete) una tarea",
  description: `${WRITE_SCOPE_NOTE} Marca \`deleted_at\`; no borra la fila.`,
  security: [{ sessionCookie: [] }],
  request: { params: TaskIdParams },
  responses: {
    204: { description: "Tarea eliminada. Sin cuerpo." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/tasks/{id}/status
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/tasks/{id}/status",
  tags: ["Tareas"],
  summary: "Mueve una tarea a otro estado (drag & drop del Kanban)",
  description: `${WRITE_SCOPE_NOTE} ${BLOQUEO_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskIdParams,
    body: { content: { "application/json": { schema: STATUS_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Tarea con el nuevo estado.",
      content: { "application/json": { schema: z.object({ task: TaskItemSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET/POST /api/v1/tasks/{id}/comments
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/{id}/comments",
  tags: ["Tareas"],
  summary: "Hilo de comentarios de una tarea (orden ascendente)",
  description:
    `${READ_SCOPE_NOTE} BUG FIX reciente: esta ruta antes solo tenía POST y devolvía 405 ante cualquier GET — ` +
    "src/hooks/kanban.ts's useComments() siempre llamó GET, así que cada apertura del diálogo de tarea fallaba. " +
    "Ahora devuelve el hilo completo con el nombre del autor ya resuelto (join en memoria, sin N+1).",
  security: [{ sessionCookie: [] }],
  request: { params: TaskIdParams },
  responses: {
    200: {
      description: "Comentarios de la tarea.",
      content: { "application/json": { schema: z.object({ comentarios: z.array(TaskCommentSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/tasks/{id}/comments",
  tags: ["Tareas"],
  summary: "Agrega un comentario al hilo de la tarea",
  description:
    `${WRITE_SCOPE_NOTE} El autor siempre es el usuario de la sesión — nunca un campo que envíe el cliente. ` +
    "El hilo es inmutable por diseño (ComentarioTarea no tiene updated_at ni deleted_at): no existen PATCH/DELETE.",
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskIdParams,
    body: { content: { "application/json": { schema: COMMENT_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Comentario creado.",
      content: { "application/json": { schema: z.object({ comentario: TaskCommentSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET/POST /api/v1/tasks/{id}/attachments
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/{id}/attachments",
  tags: ["Tareas"],
  summary: "Lista los adjuntos de una tarea",
  description: READ_SCOPE_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: TaskIdParams },
  responses: {
    200: {
      description: "Adjuntos de la tarea (más reciente primero).",
      content: { "application/json": { schema: z.object({ adjuntos: z.array(TaskAttachmentSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/tasks/{id}/attachments",
  tags: ["Tareas"],
  summary: "Sube un adjunto a la tarea (multipart/form-data)",
  description:
    `${WRITE_SCOPE_NOTE} Límite 10 MB (413 FILE_TOO_LARGE por encima); solo se aceptan PDF, Word (.docx), ` +
    "Excel (.xlsx), JPG o PNG — validado por extensión O por MIME (400 VALIDATION_ERROR si ninguno matchea; " +
    "algunos clientes como curl mandan application/octet-stream aunque el archivo sea válido). Se sube al bucket " +
    "de Supabase Storage con el cliente de service role; sin credenciales de Supabase configuradas, 500 " +
    "INTERNAL_ERROR (el storage no puede funcionar sin ellas). `download_url` en la respuesta es un signed URL " +
    "de 60 s (string plano; ver nota en TaskAttachmentCreated).",
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskIdParams,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ file: z.string().openapi({ format: "binary", description: "Campo de formulario 'file'." }) }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Adjunto creado.",
      content: { "application/json": { schema: z.object({ adjunto: TaskAttachmentCreatedSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 413, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/{id}/attachments/{attachmentId}/download
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/{id}/attachments/{attachmentId}/download",
  tags: ["Tareas"],
  summary: "Redirige a un signed URL de descarga del adjunto",
  description:
    `${WRITE_SCOPE_NOTE} (Aunque es una descarga por GET, el control de acceso reutiliza getTaskForWrite, el ` +
    "mismo alcance que el PATCH de la tarea — no el de lectura.) Responde 302 con `Location` apuntando a un " +
    "signed URL de Supabase Storage válido por 60 s, en vez de un cuerpo JSON. El adjunto debe pertenecer a la " +
    "tarea del path (404 si no). Fallos de storage devuelven un envelope 500, nunca un crash.",
  security: [{ sessionCookie: [] }],
  request: { params: TaskAttachmentParams },
  responses: {
    302: { description: "Redirección al signed URL del archivo en Supabase Storage (60 s de validez)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET/POST /api/v1/tasks/{id}/subtasks
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/{id}/subtasks",
  tags: ["Tareas"],
  summary: "Checklist de subtareas de una tarjeta",
  description: `${READ_SCOPE_NOTE} Lista plana, sin paginar. No forma parte del contrato §8.2 (agregada en §5.2).`,
  security: [{ sessionCookie: [] }],
  request: { params: TaskIdParams },
  responses: {
    200: {
      description: "Subtareas de la tarea.",
      content: { "application/json": { schema: z.object({ subtareas: z.array(SubtaskSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/tasks/{id}/subtasks",
  tags: ["Tareas"],
  summary: "Crea un ítem de checklist en la tarea",
  description: WRITE_SCOPE_NOTE,
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskIdParams,
    body: { content: { "application/json": { schema: SUBTASK_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Subtarea creada.",
      content: { "application/json": { schema: z.object({ subtarea: SubtaskSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// PATCH/DELETE /api/v1/tasks/{id}/subtasks/{subtaskId}
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/tasks/{id}/subtasks/{subtaskId}",
  tags: ["Tareas"],
  summary: "Edita el título y/o el estado de una subtarea",
  description: `${WRITE_SCOPE_NOTE} Envía al menos un campo (400 si el cuerpo llega vacío). 404 si la subtarea no pertenece a la tarea del path.`,
  security: [{ sessionCookie: [] }],
  request: {
    params: TaskSubtaskParams,
    body: { content: { "application/json": { schema: SUBTASK_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Subtarea actualizada.",
      content: { "application/json": { schema: z.object({ subtarea: SubtaskSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/tasks/{id}/subtasks/{subtaskId}",
  tags: ["Tareas"],
  summary: "Elimina un ítem de checklist",
  description:
    `${WRITE_SCOPE_NOTE} Hard delete: Subtarea no tiene deleted_at en el esquema y el PRD no exige soft delete ` +
    "para checklist items. 404 si la subtarea no pertenece a la tarea del path.",
  security: [{ sessionCookie: [] }],
  request: { params: TaskSubtaskParams },
  responses: {
    204: { description: "Subtarea eliminada. Sin cuerpo." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/export
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/export",
  tags: ["Tareas"],
  summary: "Exporta las tareas filtradas a un .xlsx",
  description:
    "Mismos filtros y alcance de roles que GET /tasks (parseTaskFilters + buildTaskWhere): COLABORADOR solo " +
    "exporta sus propias tareas; el resto de roles exporta todo el conjunto filtrado. Cap de EXPORT_MAX_ROWS = " +
    "500 filas (las primeras 500 del conjunto filtrado, orden updated_at desc) — no hay paginación en este " +
    "endpoint. Columnas en español; subtareas como 'completadas/total'.",
  security: [{ sessionCookie: [] }],
  request: { query: TaskExportQuerySchema },
  responses: {
    200: {
      description: "Archivo .xlsx (hasta 500 filas).",
      content: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/report
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/tasks/report",
  tags: ["Tareas"],
  summary: "Reporte de equipo: resumen, por persona, por estado y por cliente",
  description:
    "No forma parte del contrato §8.2 (agregado para el hito Kanban, §5.4). Mismos filtros y alcance de roles " +
    "que GET /tasks; COLABORADOR solo ve su propio desempeño (una sola fila en `por_persona`, la suya). " +
    "`rango` acota por `updated_at` (week=7d, month=30d default, quarter=90d, all=sin límite). Proxy documentado: " +
    "Tarea no tiene `completed_at`, así que 'a tiempo/tarde' usa `updated_at <= fecha_entrega` para tareas " +
    "COMPLETADA con fecha de entrega (las completadas sin fecha no cuentan en ninguno de los dos).",
  security: [{ sessionCookie: [] }],
  request: { query: TaskReportQuerySchema },
  responses: {
    200: {
      description: "Reporte agregado.",
      content: { "application/json": { schema: TaskReportSchema } },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});
