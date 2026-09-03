// OpenAPI path registrations for the "dashboard-admin" domain: the four
// Dashboard aggregate faces (PRD §7), the admin-only Settings/Users/
// Solicitudes de acceso CRUD (PRD §3.3/§3.4/§3.1), the two lightweight
// catalog reads, `/api/v1/nav/counts`, and the header-secret `/api/cron/daily`
// job. See src/lib/openapi/paths/notifications.ts for the reference pattern
// this file follows; none of the 15 routes below use zod for their own
// validation (they hand-roll checks with `apiError`), so every schema here is
// defined fresh to mirror the real response/request shapes read from each
// route.ts — nothing is invented.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

// ─── Shared enums (plain consts, not registered as named components — avoids
// colliding with refs other domain files may register under the same
// singleton registry, e.g. a future clients.ts/tasks.ts "EstadoCliente"). ───

const RolUsuarioSchema = z.enum(["ADMINISTRADOR", "GERENCIA", "COORDINADOR", "COLABORADOR"]);
const TipoClienteSchema = z.enum([
  "GOBIERNO_LOCAL",
  "GOBIERNO_NACIONAL",
  "COOPERANTE_MULTILATERAL",
  "EMPRESA_PRIVADA",
  "FUNDACION",
  "ALIADO_ACADEMICO",
  "OTRO",
]);
const EstadoClienteSchema = z.enum([
  "PROSPECTO",
  "EN_ACERCAMIENTO",
  "CLIENTE_ACTIVO",
  "EN_PAUSA",
  "STANDBY",
  "INACTIVO",
  "CERRADO",
]);
const PrioridadClienteSchema = z.enum(["ALTA", "MEDIA", "BAJA"]);
/** Embudo del pipeline: estados NO finalizados de Oportunidad (GANADA/PERDIDA quedan fuera). */
const EstadoOportunidadEmbudoSchema = z.enum([
  "DISENANDO_PROPUESTA",
  "PRESENTADA",
  "EN_REVISION",
  "EN_NEGOCIACION",
  "STANDBY",
]);
/** Columnas visibles del tablero: CANCELADA queda fuera (solo aparece en reportes). */
const EstadoTareaColumnaSchema = z.enum([
  "POR_HACER",
  "EN_CURSO",
  "EN_REVISION",
  "BLOQUEADA",
  "EN_ESPERA",
  "COMPLETADA",
]);
const OrigenTareaSchema = z.enum(["CRM", "KANBAN", "AMBOS"]);
const ScopeSchema = z.enum(["own", "all"]).openapi({
  description:
    "Alcance de la respuesta: COLABORADOR ve alcance propio (scope: own); el resto ve todo (scope: all).",
});

// ─── Dashboard: filtros comunes (PRD §7.2) ───────────────────────────────

const DASHBOARD_SCOPE_NOTE =
  "Alcance (src/lib/dashboard.ts): COLABORADOR ve alcance propio (scope: own); el resto ve todo (scope: all). " +
  "`responsable_id` solo tiene efecto en scope 'all' — en scope 'own' se ignora en silencio.";

const DashboardQuerySchema = z.object({
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ description: "Fecha inicial inclusiva (YYYY-MM-DD). Sin ella, cubre todo el histórico." }),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ description: "Fecha final inclusiva (YYYY-MM-DD). Sin ella, cubre todo el histórico." }),
  responsable_id: z.string().uuid().optional().openapi({
    description: "Filtra por responsable. Solo aplica en scope 'all' (ver descripción del endpoint).",
  }),
  tipo_cliente: TipoClienteSchema.optional().openapi({ description: "Filtra por tipo de cliente." }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/pipeline",
  tags: ["Dashboard"],
  summary: "Cara 'Pipeline Comercial' del dashboard",
  description:
    `${DASHBOARD_SCOPE_NOTE} \`desde\`/\`hasta\` filtran por \`Oportunidad.created_at\`. ` +
    "Embudo = estados no finalizados (DISENANDO_PROPUESTA, PRESENTADA, EN_REVISION, EN_NEGOCIACION, STANDBY); " +
    "GANADA/PERDIDA quedan fuera del embudo y de `valor_activo`, pero GANADA alimenta `comparativo.ganado_historico`. " +
    "`comparativo.ratio` = ganado_historico / potencial_activo (0 cuando no hay potencial activo). " +
    "`top_clientes` son los 5 clientes con mayor valor potencial activo.",
  security: [{ sessionCookie: [] }],
  request: { query: DashboardQuerySchema },
  responses: {
    200: {
      description: "Snapshot del pipeline en el alcance y rango solicitados.",
      content: {
        "application/json": {
          schema: registry.register(
            "DashboardPipelineResponse",
            z.object({
              scope: ScopeSchema,
              total_activas: z.number().int(),
              valor_activo: z.number(),
              embudo: z.array(z.object({ estado: EstadoOportunidadEmbudoSchema, count: z.number().int() })),
              top_clientes: z.array(
                z.object({
                  cliente_id: z.string().uuid(),
                  nombre: z.string(),
                  valor_potencial: z.number(),
                }),
              ),
              comparativo: z.object({
                potencial_activo: z.number(),
                ganado_historico: z.number(),
                ratio: z.number(),
              }),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/tasks",
  tags: ["Dashboard"],
  summary: "Cara 'Gestión de Tareas' del dashboard",
  description:
    `${DASHBOARD_SCOPE_NOTE} \`desde\`/\`hasta\` filtran por \`Tarea.fecha_entrega\` (solo tareas sin borrar). ` +
    "'Cumplida (a tiempo)' = COMPLETADA con updated_at <= fecha_entrega (una COMPLETADA sin fecha_entrega cuenta " +
    "como completada pero no como cumplida). `vencidas` = tareas abiertas con fecha_entrega antes de hoy — " +
    "SIEMPRE calculado sobre 'ahora', independiente del rango desde/hasta (misma regla del motor de alertas); " +
    "la lista devuelve máximo 20, ordenada ascendente por fecha_entrega. `por_columna` excluye CANCELADA " +
    "(oculta en el tablero, solo visible en reportes).",
  security: [{ sessionCookie: [] }],
  request: { query: DashboardQuerySchema },
  responses: {
    200: {
      description: "Estado del tablero, cumplimiento por persona y tareas vencidas en el alcance solicitado.",
      content: {
        "application/json": {
          schema: registry.register(
            "DashboardTasksResponse",
            z.object({
              scope: ScopeSchema,
              por_columna: z.array(
                z.object({ estado: EstadoTareaColumnaSchema, label: z.string(), count: z.number().int() }),
              ),
              cumplimiento_por_persona: z.array(
                z.object({
                  responsable_id: z.string().uuid(),
                  nombre: z.string(),
                  total: z.number().int(),
                  completadas: z.number().int(),
                  cumplidas: z.number().int(),
                  porc: z.number().int().openapi({ description: "Porcentaje redondeado de cumplidas/total." }),
                }),
              ),
              vencidas: z.object({
                count: z.number().int(),
                lista: z.array(
                  z.object({
                    id: z.string().uuid(),
                    titulo: z.string(),
                    responsable_nombre: z.string(),
                    fecha_entrega: z.string().datetime().nullable(),
                    cliente_nombre: z.string().nullable(),
                  }),
                ).openapi({ description: "Máximo 20 filas, ordenadas ascendente por fecha_entrega." }),
              }),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/clients-activity",
  tags: ["Dashboard"],
  summary: "Cara 'Actividad de Clientes' del dashboard",
  description:
    `${DASHBOARD_SCOPE_NOTE} \`desde\`/\`hasta\` filtran las gestiones (BitacoraEntrada.created_at) y las tareas ` +
    "contadas en `actividad_por_responsable` (Tarea.created_at); no alteran la distribución estructural. " +
    "`dias_sin_gestion` (query, entero 1-90, default 14; fuera de rango → 400 VALIDATION_ERROR) define el corte: " +
    "un cliente sin ninguna BitacoraEntrada también califica como 'sin gestión'. La lista `sin_gestion` devuelve " +
    "máximo 25 filas ordenadas de la gestión más antigua a la más reciente (sin gestión = más urgente, va primero). " +
    "`distribucion` se calcula sobre TODO el alcance, no solo sobre `sin_gestion`.",
  security: [{ sessionCookie: [] }],
  request: {
    query: DashboardQuerySchema.extend({
      dias_sin_gestion: z.coerce.number().int().min(1).max(90).optional().openapi({
        description: "Días sin BitacoraEntrada para considerar un cliente 'sin gestión'. Default 14, rango 1-90.",
      }),
    }),
  },
  responses: {
    200: {
      description: "Clientes sin gestión reciente, distribución estructural y actividad por responsable.",
      content: {
        "application/json": {
          schema: registry.register(
            "DashboardClientsActivityResponse",
            z.object({
              scope: ScopeSchema,
              sin_gestion: z.object({
                dias: z.number().int(),
                clientes: z.array(
                  z.object({
                    cliente_id: z.string().uuid(),
                    nombre: z.string(),
                    tipo: TipoClienteSchema,
                    estado: EstadoClienteSchema,
                    prioridad: PrioridadClienteSchema,
                    responsable_nombre: z.string(),
                    ultima_gestion: z.string().datetime().nullable().openapi({
                      description: "Fecha de la última BitacoraEntrada, o null si nunca fue gestionado.",
                    }),
                  }),
                ),
              }),
              distribucion: z.object({
                por_tipo: z.array(z.object({ tipo: z.string(), count: z.number().int() })),
                por_estado: z.array(z.object({ estado: z.string(), count: z.number().int() })),
                por_prioridad: z.array(z.object({ prioridad: z.string(), count: z.number().int() })),
              }),
              actividad_por_responsable: z.array(
                z.object({
                  responsable_id: z.string().uuid(),
                  nombre: z.string(),
                  gestiones: z.number().int(),
                  tareas_count: z.number().int(),
                }),
              ),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/my-summary",
  tags: ["Dashboard"],
  summary: "Cara 'Mi resumen' del dashboard",
  description:
    "SIEMPRE scope 'own' (los datos de quien llama), sea cual sea su rol — `responsable_id` no aplica aquí y, " +
    "si se envía, se ignora en silencio. `desde`/`hasta` filtran Tarea.fecha_entrega; `tipo_cliente` filtra vía " +
    "cliente. `vencidas` = activas con fecha_entrega antes de hoy; `hoy` = fecha_entrega dentro de [hoy, mañana) " +
    "(mismo bucket del motor de alertas, enlaza con la campana de notificaciones). `compromisos_pendientes` = " +
    "tareas propias abiertas con origen CRM o AMBOS; `vencidos` es su subconjunto vencido. `clientes_asignados` " +
    "son los clientes sin borrar donde el usuario actual es responsable.",
  security: [{ sessionCookie: [] }],
  request: { query: DashboardQuerySchema },
  responses: {
    200: {
      description: "Resumen personal del usuario autenticado.",
      content: {
        "application/json": {
          schema: registry.register(
            "DashboardMySummaryResponse",
            z.object({
              scope: z.literal("own"),
              activas: z.object({
                count: z.number().int(),
                items: z.array(
                  z.object({
                    id: z.string().uuid(),
                    titulo: z.string(),
                    estado: z.string(),
                    fecha_entrega: z.string().datetime().nullable(),
                    origen: OrigenTareaSchema,
                  }),
                ),
              }),
              vencidas: z.object({
                count: z.number().int(),
                items: z.array(
                  z.object({
                    id: z.string().uuid(),
                    titulo: z.string(),
                    estado: z.string(),
                    fecha_entrega: z.string().datetime().nullable(),
                    origen: OrigenTareaSchema,
                  }),
                ),
              }),
              hoy: z.object({ count: z.number().int() }),
              compromisos_pendientes: z.object({ count: z.number().int(), vencidos: z.number().int() }),
              clientes_asignados: z.object({
                count: z.number().int(),
                items: z.array(
                  z.object({
                    cliente_id: z.string().uuid(),
                    nombre: z.string(),
                    estado: EstadoClienteSchema,
                    prioridad: PrioridadClienteSchema,
                  }),
                ),
              }),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ─── Catálogos de lectura libre (cualquier usuario autenticado) ─────────

registry.registerPath({
  method: "get",
  path: "/api/v1/catalogs/settings",
  tags: ["Administración"],
  summary: "Snapshot de catálogos configurables para selects (etiquetas de tarea, categorías de documento)",
  description:
    "Lectura sin privilegios de admin del mismo snapshot { task_tags, doc_categories } que expone " +
    "GET /api/v1/settings — a diferencia de ese endpoint (solo ADMINISTRADOR y hace ensure de defaults), " +
    "cualquier usuario autenticado puede leer aquí para alimentar los selects del tablero y del repositorio. " +
    "Sin fila en `settings`, cada clave cae al default de src/lib/catalogs.ts.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Catálogos configurables vigentes.",
      content: {
        "application/json": {
          schema: registry.register(
            "CatalogsSettingsResponse",
            z.object({
              task_tags: z.array(z.string()),
              doc_categories: z.array(z.object({ nombre: z.string(), restringida: z.boolean() })),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/catalogs/users",
  tags: ["Administración"],
  summary: "Catálogo mínimo de usuarios activos para selects de 'responsable'",
  description:
    "Proyección mínima (id + nombre) de usuarios activos, sin correos ni roles. Cualquier usuario autenticado " +
    "puede leerlo; llena un hueco que el PRD no define como directorio dedicado.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Usuarios activos, ordenados por nombre.",
      content: {
        "application/json": {
          schema: registry.register(
            "CatalogsUsersResponse",
            z.object({ users: z.array(z.object({ id: z.string().uuid(), nombre: z.string() })) }),
          ),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

// ─── Settings admin (PRD §3.3, Hito 7) — Solo ADMINISTRADOR ─────────────

const SettingsSnapshotSchema = registry.register(
  "SettingsSnapshot",
  z.object({
    task_tags: z.array(z.string()),
    doc_categories: z.array(z.object({ nombre: z.string(), restringida: z.boolean() })),
  }),
);

const SettingsUpdateBodySchema = z.object({
  task_tags: z
    .array(z.string())
    .optional()
    .openapi({ description: "1-30 etiquetas únicas, máx. 40 caracteres cada una." }),
  doc_categories: z
    .array(z.object({ nombre: z.string(), restringida: z.boolean() }))
    .optional()
    .openapi({
      description: "1-30 categorías únicas (sin distinguir mayúsculas), máx. 80 caracteres cada `nombre`.",
    }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/settings",
  tags: ["Administración"],
  summary: "Lee el snapshot de catálogos configurables, garantizando los defaults",
  description:
    "Solo ADMINISTRADOR. A diferencia de GET /api/v1/catalogs/settings, este GET además ejecuta " +
    "`ensureDefaultSettings()` para materializar filas por defecto si no existen aún.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: { description: "Snapshot vigente de catálogos.", content: { "application/json": { schema: SettingsSnapshotSchema } } },
    ...standardErrorResponses([401, 403, 500]),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/settings",
  tags: ["Administración"],
  summary: "Actualiza uno o ambos catálogos configurables",
  description:
    "Solo ADMINISTRADOR. Debe enviarse `task_tags` y/o `doc_categories` (al menos uno; body vacío → 400 " +
    "VALIDATION_ERROR). Cada arreglo se recorta/normaliza y valida (no vacío, sin duplicados, límites de " +
    "cantidad y longitud — ver el schema del body). Responde siempre el snapshot fresco tras guardar.",
  security: [{ sessionCookie: [] }],
  request: {
    body: { content: { "application/json": { schema: SettingsUpdateBodySchema } } },
  },
  responses: {
    200: { description: "Snapshot actualizado.", content: { "application/json": { schema: SettingsSnapshotSchema } } },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

// ─── Users admin (PRD §3.3/§3.4) — Solo ADMINISTRADOR ───────────────────

const UsuarioAdminSchema = registry.register(
  "UsuarioAdmin",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    email: z.string().email(),
    rol: RolUsuarioSchema,
    activo: z.boolean(),
    created_at: z.string().datetime(),
  }),
);

const CreateUsuarioBodySchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  rol: RolUsuarioSchema,
  password: z.string().min(8).optional().openapi({
    description: "Obligatoria (mín. 8 caracteres, letras y números) salvo que `invite: true`.",
  }),
  invite: z.boolean().optional().openapi({
    description:
      "Default en la UI. Si es true, crea el usuario de Auth vía inviteUserByEmail (sin password: el usuario " +
      "define su propia contraseña al redimir el correo de invitación). Si es false/ausente, requiere `password` " +
      "y crea el usuario ya confirmado (createUser).",
  }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/users",
  tags: ["Administración"],
  summary: "Lista todos los usuarios de la plataforma",
  description: "Solo ADMINISTRADOR. Ordenado por fecha de creación descendente.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Todos los usuarios.",
      content: { "application/json": { schema: z.object({ usuarios: z.array(UsuarioAdminSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/users",
  tags: ["Administración"],
  summary: "Crea un nuevo usuario (Supabase Auth + fila Usuario)",
  description:
    "Solo ADMINISTRADOR. Decisión de diseño clave: el id de la fila `Usuario` es el mismo uuid del usuario de " +
    "Supabase Auth (mapeo 1:1 para integridad referencial). Primero crea el usuario de Auth con el service role " +
    "(inviteUserByEmail si `invite: true`, createUser + email_confirm si no), luego crea la fila Usuario con ese " +
    "mismo id; si el paso de Prisma falla, se revierte (`deleteUser`) el usuario de Auth recién creado para no " +
    "dejar una cuenta huérfana. Un correo ya registrado responde 409 CONFLICT (chequeo local best-effort + " +
    "detección del error de Supabase como respaldo).",
  security: [{ sessionCookie: [] }],
  request: { body: { content: { "application/json": { schema: CreateUsuarioBodySchema } } } },
  responses: {
    201: {
      description: "Usuario creado.",
      content: { "application/json": { schema: z.object({ usuario: UsuarioAdminSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 409, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/users/{id}",
  tags: ["Administración"],
  summary: "Actualiza rol, estado activo y/o nombre de un usuario",
  description:
    "Solo ADMINISTRADOR. Debe enviarse al menos un campo (body vacío → 400 VALIDATION_ERROR). Dos guardas de " +
    "seguridad, ambas devuelven 400 VALIDATION_ERROR: (A) un admin no puede cambiarse su propio rol ni " +
    "desactivarse a sí mismo (el propio `nombre` sí puede); (B) si el cambio dejaría al Hub sin ningún " +
    "ADMINISTRADOR activo (degradar o desactivar al último admin activo), la operación se rechaza.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            rol: RolUsuarioSchema.optional(),
            activo: z.boolean().optional(),
            nombre: z.string().min(1).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Usuario actualizado.",
      content: { "application/json": { schema: z.object({ usuario: UsuarioAdminSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/users/{id}/deactivate",
  tags: ["Administración"],
  summary: "Desactiva un usuario (baja lógica, nunca hard delete)",
  description:
    "Solo ADMINISTRADOR. `activo = false`; el usuario conserva todo su historial. Mismas dos guardas que PATCH " +
    "/api/v1/users/{id} (ambas 400 VALIDATION_ERROR): un admin no puede desactivarse a sí mismo, y no puede " +
    "desactivarse al último ADMINISTRADOR activo del Hub.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Usuario desactivado.",
      content: { "application/json": { schema: z.object({ usuario: UsuarioAdminSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ─── Solicitudes de acceso (PRD §3.1) — Solo ADMINISTRADOR ──────────────

const SolicitudAccesoSchema = registry.register(
  "SolicitudAcceso",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    email: z.string().email(),
    cargo: z.string().nullable(),
    origen: z.enum(["form", "google"]),
    estado: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA"]),
    revisado_por: z.string().uuid().nullable(),
    revisado_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/solicitudes-acceso",
  tags: ["Administración"],
  summary: "Lista la cola de solicitudes de acceso público",
  description:
    "Solo ADMINISTRADOR. Ordenadas de más reciente a más antigua; el frontend separa localmente PENDIENTE del " +
    "historial (APROBADA/RECHAZADA).",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Todas las solicitudes.",
      content: { "application/json": { schema: z.object({ solicitudes: z.array(SolicitudAccesoSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/solicitudes-acceso/{id}/aprobar",
  tags: ["Administración"],
  summary: "Aprueba una solicitud de acceso: crea el usuario de Auth (o vincula el existente) + la fila Usuario",
  description:
    "Solo ADMINISTRADOR. Requiere `rol` en el body (rol final asignado al nuevo usuario). El flujo real difiere " +
    "según `origen` de la solicitud: (1) `origen: 'form'` — crea el usuario de Supabase Auth vía " +
    "inviteUserByEmail (sin password, el usuario la define al redimir el correo) y luego crea la fila Usuario " +
    "con ese id. (2) `origen: 'google'` — el usuario de Auth YA existe (creado por el callback de OAuth, " +
    "`auth_id` registrado en la solicitud); aquí solo se crea la fila Usuario con id = auth_id, sin invitación. " +
    "`auth_id` funciona además como checkpoint de idempotencia: apenas el invite tiene éxito se guarda ANTES de " +
    "tocar la fila Usuario, así que un reintento tras una falla posterior nunca vuelve a invitar el mismo correo " +
    "— reutiliza el id ya checkpointeado. La creación de Usuario y el marcado APROBADA van juntos en una sola " +
    "transacción (o pasan los dos o ninguno). El usuario de Auth solo se revierte (`deleteUser`) si falla la " +
    "escritura del checkpoint (nada quedó registrado todavía); una vez checkpointeado, nunca se revierte — un " +
    "reintento solo rehace la transacción de base de datos. Una solicitud ya revisada responde 409 CONFLICT; un " +
    "correo ya registrado en Auth (modo form) también responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: z.object({ rol: RolUsuarioSchema }) } } },
  },
  responses: {
    200: {
      description: "Solicitud aprobada.",
      content: {
        "application/json": {
          schema: z.object({
            solicitud: z.object({
              id: z.string().uuid(),
              estado: z.literal("APROBADA"),
              revisado_por: z.string().uuid(),
              revisado_at: z.string().datetime(),
            }),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/solicitudes-acceso/{id}/rechazar",
  tags: ["Administración"],
  summary: "Rechaza una solicitud de acceso",
  description:
    "Solo ADMINISTRADOR. Marca la solicitud RECHAZADA con `revisado_por`/`revisado_at`. Decisión de diseño: " +
    "cuando `origen: 'google'` el usuario de Auth creado por el callback de OAuth NO se elimina — quien la " +
    "solicitó puede reintentar con Google más adelante (el callback reabre la solicitud), y borrar el usuario " +
    "de Auth aquí rompería cualquier flujo de invitación futuro. Una solicitud ya revisada responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Solicitud rechazada.",
      content: {
        "application/json": {
          schema: z.object({
            solicitud: z.object({
              id: z.string().uuid(),
              estado: z.literal("RECHAZADA"),
              revisado_por: z.string().uuid(),
              revisado_at: z.string().datetime(),
            }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

// ─── Nav counts ──────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/v1/nav/counts",
  tags: ["Administración"],
  summary: "Contadores agregados de la barra de navegación lateral",
  description:
    "Mismo alcance que el dashboard (src/lib/dashboard.ts): COLABORADOR ve alcance propio (scope: own) para " +
    "`clientes` (clientes donde es responsable) y `tablero` (tareas abiertas propias); el resto de roles ve " +
    "todo (scope: all). `documentos` es siempre un conteo plano y global (el repositorio de documentos no tiene " +
    "scope por usuario), sin importar el rol.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Contadores para los badges de la barra lateral.",
      content: {
        "application/json": {
          schema: registry.register(
            "NavCountsResponse",
            z.object({
              clientes: z.number().int(),
              tablero: z.number().int().openapi({ description: "Tareas abiertas en el alcance del usuario." }),
              documentos: z.number().int().openapi({ description: "Conteo global, sin scope por usuario." }),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

// ─── Cron diario (PRD §4.4.1) — header secret, NO sesión, NO /api/v1 ────

registry.registerComponent("securitySchemes", "cronSecret", {
  type: "apiKey",
  in: "header",
  name: "x-cron-secret",
  description:
    "Secreto compartido comparado contra la variable de entorno CRON_SECRET. Este endpoint no usa la cookie de " +
    "sesión y no vive bajo /api/v1 — no está pensado para ser llamado por usuarios finales ni por el frontend, " +
    "solo por pg_cron (scripts/cron_setup.sql), a las 8:00 y 8:30 hora Colombia.",
});

registry.registerPath({
  method: "post",
  path: "/api/cron/daily",
  tags: ["Cron"],
  summary: "Job diario de notificaciones por correo (no destinado a usuarios finales)",
  description:
    "Autenticación por header `x-cron-secret` (NO cookie de sesión) contra CRON_SECRET; un secreto ausente o " +
    "incorrecto responde 401 UNAUTHORIZED. Idempotente por día calendario: si la corrida del día ya cerró " +
    "OK en `cron_logs`, el reintento (pensado para la corrida de las 8:30, backup de la de las 8:00) responde " +
    "200 con `already_sent_today: true` sin reenviar nada. Por cada usuario activo (ADMINISTRADOR excluido) " +
    "calcula sus buckets de alertas con el motor compartido (scope 'own' para COLABORADOR, 'all' para el " +
    "resto) — si no hay alertas en ninguna categoría, no se envía correo ('no-mail-if-empty', contado en " +
    "`skipped_empty`). Si RESEND_API_KEY no está configurada, la corrida completa se salta y responde 200 con " +
    "`note` explicando el SKIPPED_NO_CONFIG (no se trata como error). Cada corrida queda registrada en la tabla " +
    "`cron_logs` (OK / ERROR / SKIPPED_NO_CONFIG). Los fallos internos (envío de correo, excepciones) se " +
    "capturan y se responden igualmente como 200 con `ok: false`, nunca como 500 — el estado real vive en el " +
    "cuerpo de la respuesta y en `cron_logs`.",
  security: [{ cronSecret: [] }],
  responses: {
    200: {
      description: "Resumen de la corrida (revisar `ok`, `skipped_empty`, `already_sent_today` y `note`).",
      content: {
        "application/json": {
          schema: registry.register(
            "CronDailyResponse",
            z.object({
              ok: z.boolean(),
              processed: z.number().int().openapi({ description: "Usuarios con alertas a los que se intentó enviar correo." }),
              sent: z.number().int().openapi({ description: "Correos entregados a Resend sin error." }),
              failed: z.number().int().openapi({ description: "Usuarios con alertas cuyo envío falló." }),
              skipped_empty: z.number().int().openapi({ description: "Usuarios sin alertas (no-mail-if-empty)." }),
              already_sent_today: z.boolean(),
              note: z.string().optional(),
            }),
          ),
        },
      },
    },
    ...standardErrorResponses([401]),
  },
});
