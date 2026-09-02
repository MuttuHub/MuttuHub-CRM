// OpenAPI path registrations for /api/v1/clients/* (CRM module). Follows the
// pattern in src/lib/openapi/paths/notifications.ts: read the actual route.ts
// first, register exactly what it does — same status codes, same field
// names, same auth/scope rules.
//
// Scope rule enforced across every client-scoped route in this file (see
// src/lib/api/crm.ts): COLABORADOR solo ve/edita clientes donde es
// responsable; el resto de roles (ADMINISTRADOR, GERENCIA, COORDINADOR) ve/
// edita todos. Reads use `loadClientScoped`/an inline scoped `where` and
// return 404 NOT_FOUND for a client outside scope (no existence leak); writes
// use `getClientForWrite`/an inline check and return 403 FORBIDDEN for a
// client that is visible but not owned.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { POST_CLIENT_SCHEMA } from "@/app/api/v1/clients/route";
import { PATCH_CLIENT_SCHEMA } from "@/app/api/v1/clients/[id]/route";
import { CONTACT_SCHEMA } from "@/app/api/v1/clients/[id]/contacts/route";
import { CONTACT_PATCH_SCHEMA } from "@/app/api/v1/clients/[id]/contacts/[contactId]/route";
import { LOG_ENTRY_SCHEMA } from "@/app/api/v1/clients/[id]/log/route";
import { OPORTUNIDAD_SCHEMA } from "@/app/api/v1/clients/[id]/opportunities/route";
import { OPORTUNIDAD_PATCH_SCHEMA } from "@/app/api/v1/clients/[id]/opportunities/[opportunityId]/route";

const SCOPE_NOTE =
  "Alcance: COLABORADOR solo ve/edita clientes donde es responsable; el resto de roles (ADMINISTRADOR, GERENCIA, COORDINADOR) ve/edita todos.";

const TipoClienteSchema = z
  .enum([
    "GOBIERNO_LOCAL",
    "GOBIERNO_NACIONAL",
    "COOPERANTE_MULTILATERAL",
    "EMPRESA_PRIVADA",
    "FUNDACION",
    "ALIADO_ACADEMICO",
    "OTRO",
  ])
  .openapi("TipoCliente");

const EstadoClienteSchema = z
  .enum([
    "PROSPECTO",
    "EN_ACERCAMIENTO",
    "CLIENTE_ACTIVO",
    "EN_PAUSA",
    "STANDBY",
    "INACTIVO",
    "CERRADO",
  ])
  .openapi("EstadoCliente");

const PrioridadClienteSchema = z.enum(["ALTA", "MEDIA", "BAJA"]).openapi("PrioridadCliente");

const RolContactoSchema = z
  .enum(["DECISOR", "TECNICO", "INFLUENCIADOR", "OTRO"])
  .openapi("RolContacto");

const EstadoOportunidadSchema = z
  .enum([
    "DISENANDO_PROPUESTA",
    "PRESENTADA",
    "EN_REVISION",
    "EN_NEGOCIACION",
    "GANADA",
    "PERDIDA",
    "STANDBY",
  ])
  .openapi("EstadoOportunidad");

const NextCompromisoSchema = z
  .object({
    id: z.string().uuid(),
    titulo: z.string(),
    fecha_entrega: z.string().datetime().nullable(),
  })
  .nullable()
  .openapi("NextCompromiso");

/** Shared list-item shape for GET /clients (also the row basis for the xlsx export). */
const ClientListItemSchema = registry.register(
  "ClientListItem",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    empresa: z.string().nullable(),
    tipo_cliente: TipoClienteSchema,
    estado: EstadoClienteSchema,
    prioridad: PrioridadClienteSchema.nullable(),
    ubicacion: z.string().nullable(),
    responsable_id: z.string().uuid(),
    responsable_nombre: z.string(),
    valor_potencial: z.number().openapi({
      description: "Suma de valor_estimado_cop de oportunidades no PERDIDA y no eliminadas.",
    }),
    compromisos_abiertos: z.number().int().openapi({
      description: "Cantidad de tareas del cliente en un estado abierto (no COMPLETADA/CANCELADA).",
    }),
    next_compromiso: NextCompromisoSchema,
    updated_at: z.string().datetime(),
    puede_editar: z.boolean().openapi({
      description:
        "PR 2 + PR 4: false ⇒ el usuario actual no puede modificar este cliente (403 en PATCH/DELETE). " +
        "La UI oculta controles destructivos y deshabilita los campos de edición en función de este flag. " +
        "El servidor es la autoridad: un valor true en el body de la solicitud se ignora.",
    }),
  }),
);

/** Full record shape returned by POST /clients and PATCH /clients/:id. */
const ClienteFullSchema = registry.register(
  "Cliente",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    empresa: z.string().nullable(),
    tipo_cliente: TipoClienteSchema,
    estado: EstadoClienteSchema,
    prioridad: PrioridadClienteSchema.nullable(),
    ubicacion: z.string().nullable(),
    responsable_id: z.string().uuid(),
    updated_at: z.string().datetime(),
    responsable: z.object({ nombre: z.string() }),
    tamano_org: z.string().nullable(),
    canal_contacto_inicial: z.string().nullable(),
    fecha_primer_contacto: z.string().datetime().nullable(),
    prioridades_identificadas: z.string().nullable(),
    riesgos_barreras: z.string().nullable(),
    resumen_relacion: z.string().nullable(),
    created_at: z.string().datetime(),
    responsable_nombre: z.string(),
  }),
);

/** GET /clients/:id adds counts + the same enrichment fields as the list. */
const ClienteDetailSchema = registry.register(
  "ClienteDetail",
  ClienteFullSchema.extend({
    contactos_count: z.number().int(),
    oportunidades_count: z.number().int(),
    bitacora_count: z.number().int(),
    tareas_abiertas_count: z.number().int().openapi({
      description: "Tareas del cliente en un estado abierto (no COMPLETADA/CANCELADA).",
    }),
    compromisos_abiertos: z.number().int(),
    valor_potencial: z.number(),
    next_compromiso: NextCompromisoSchema,
    puede_editar: z.boolean().openapi({
      description: "PR 2 + PR 4: mismo flag que la lista; ver ClientListItem.puede_editar.",
    }),
  }),
);

const ContactoSchema = registry.register(
  "Contacto",
  z.object({
    id: z.string().uuid(),
    cliente_id: z.string().uuid(),
    nombre: z.string(),
    cargo: z.string().nullable(),
    correo: z.string().nullable(),
    telefono: z.string().nullable(),
    rol_decision: RolContactoSchema.nullable(),
    notas: z.string().nullable(),
    created_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  }),
);

const OportunidadSchema = registry.register(
  "Oportunidad",
  z.object({
    id: z.string().uuid(),
    cliente_id: z.string().uuid(),
    nombre: z.string(),
    problema_detectado: z.string().nullable(),
    solucion_propuesta: z.string().nullable(),
    servicios_interes: z.string().nullable(),
    valor_estimado_cop: z
      .string()
      .nullable()
      .openapi({ description: "Decimal(15,2) serializado como string por Prisma/decimal.js.", example: "5000000.00" }),
    estado: EstadoOportunidadSchema,
    fecha_ultima_gestion: z.string().datetime().nullable(),
    proyectos_relacionados: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  }),
);

const BitacoraEntradaSchema = registry.register(
  "BitacoraEntrada",
  z.object({
    id: z.string().uuid(),
    autor_id: z.string().uuid(),
    autor_nombre: z.string(),
    texto: z.string(),
    created_at: z.string().datetime(),
  }),
);

// ── GET /api/v1/clients — list ──────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients",
  tags: ["Clientes"],
  summary: "Lista de clientes con búsqueda, filtros y paginación",
  description: `${SCOPE_NOTE} Cuando COLABORADOR envía el filtro "responsable", el servidor lo fuerza a su propio id (no se filtran clientes ajenos por este parámetro).`,
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: "Búsqueda por nombre, empresa, nombre de contacto o texto de bitácora." }),
      tipo: TipoClienteSchema.optional(),
      estado: EstadoClienteSchema.optional(),
      prioridad: PrioridadClienteSchema.optional(),
      responsable: z.string().uuid().optional().openapi({ description: "Filtra por responsable_id." }),
      desde: z
        .string()
        .optional()
        .openapi({ description: "Fecha de primer contacto, formato YYYY-MM-DD (inclusive).", example: "2026-01-01" }),
      hasta: z
        .string()
        .optional()
        .openapi({ description: "Fecha de primer contacto, formato YYYY-MM-DD (inclusive, fin de día).", example: "2026-12-31" }),
      valorMin: z.coerce.number().min(0).optional().openapi({ description: "Filtra por valor_potencial mínimo." }),
      valorMax: z.coerce.number().min(0).optional().openapi({ description: "Filtra por valor_potencial máximo." }),
      page: z.coerce.number().int().min(1).optional().openapi({ description: "Página, 1-indexada. Default 1." }),
      limit: z.coerce.number().int().min(1).max(200).optional().openapi({ description: "Tamaño de página, 1-200. Default 25." }),
    }),
  },
  responses: {
    200: {
      description: "Página de clientes visibles para el usuario actual.",
      content: {
        "application/json": {
          schema: z.object({
            page: z.number().int(),
            limit: z.number().int(),
            total: z.number().int(),
            items: z.array(ClientListItemSchema),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ── POST /api/v1/clients — create ───────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/clients",
  tags: ["Clientes"],
  summary: "Crea un cliente",
  description:
    "Formulario mínimo: nombre, tipo_cliente, responsable_id; estado por defecto PROSPECTO. " +
    "COLABORADOR solo puede crear clientes de los que él mismo será responsable — el servidor fuerza responsable_id a su propio id sin importar lo enviado en el body.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: { "application/json": { schema: POST_CLIENT_SCHEMA } },
    },
  },
  responses: {
    201: {
      description: "Cliente creado.",
      content: { "application/json": { schema: z.object({ cliente: ClienteFullSchema }) } },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ── GET /api/v1/clients/{id} ─────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients/{id}",
  tags: ["Clientes"],
  summary: "Detalle de un cliente",
  description: `${SCOPE_NOTE} Un cliente fuera de alcance responde 404 (no se filtra su existencia).`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Cliente con conteos y métricas agregadas.",
      content: { "application/json": { schema: z.object({ cliente: ClienteDetailSchema }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

// ── PATCH /api/v1/clients/{id} ───────────────────────────────────────────
registry.registerPath({
  method: "patch",
  path: "/api/v1/clients/{id}",
  tags: ["Clientes"],
  summary: "Actualiza campos de un cliente",
  description:
    `${SCOPE_NOTE} Escritura además requiere ser el responsable si el rol no es de acceso total; un cliente visible pero no editable responde 403. ` +
    "Body parcial: cualquier subconjunto no vacío de campos es válido, incluyendo enviar SOLO responsable_id (corregido: antes un body con únicamente responsable_id era rechazado con 400 por error). " +
    "COLABORADOR no puede reasignar responsable_id a otra persona — solo puede confirmarse a sí mismo; intentarlo con otro id responde 403.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { "application/json": { schema: PATCH_CLIENT_SCHEMA } },
    },
  },
  responses: {
    200: {
      description: "Cliente actualizado.",
      content: { "application/json": { schema: z.object({ cliente: ClienteFullSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── DELETE /api/v1/clients/{id} ──────────────────────────────────────────
registry.registerPath({
  method: "delete",
  path: "/api/v1/clients/{id}",
  tags: ["Clientes"],
  summary: "Elimina (soft delete) un cliente",
  description: `${SCOPE_NOTE} Escritura además requiere ser el responsable si el rol no es de acceso total; un cliente visible pero no editable responde 403. Marca deleted_at, no borra la fila.`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Cliente eliminado (sin contenido)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ── GET /api/v1/clients/export ───────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients/export",
  tags: ["Clientes"],
  summary: "Exporta los clientes visibles a un archivo .xlsx",
  description:
    `${SCOPE_NOTE} Usa exactamente los mismos filtros y el mismo alcance por rol que GET /api/v1/clients. ` +
    "El archivo se limita a las primeras 500 filas del conjunto filtrado (EXPORT_MAX_ROWS), aplicado después de calcular valor_potencial (no es un LIMIT de base de datos).",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: "Búsqueda por nombre, empresa, nombre de contacto o texto de bitácora." }),
      tipo: TipoClienteSchema.optional(),
      estado: EstadoClienteSchema.optional(),
      prioridad: PrioridadClienteSchema.optional(),
      responsable: z.string().uuid().optional().openapi({ description: "Filtra por responsable_id." }),
      desde: z
        .string()
        .optional()
        .openapi({ description: "Fecha de primer contacto, formato YYYY-MM-DD (inclusive).", example: "2026-01-01" }),
      hasta: z
        .string()
        .optional()
        .openapi({ description: "Fecha de primer contacto, formato YYYY-MM-DD (inclusive, fin de día).", example: "2026-12-31" }),
      valorMin: z.coerce.number().min(0).optional().openapi({ description: "Filtra por valor_potencial mínimo." }),
      valorMax: z.coerce.number().min(0).optional().openapi({ description: "Filtra por valor_potencial máximo." }),
    }),
  },
  responses: {
    200: {
      description: "Archivo clientes.xlsx (hoja \"Clientes\": nombre, empresa, tipo, estado, prioridad, ubicación, responsable, valor potencial, compromisos abiertos, próximo compromiso).",
      content: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
          schema: { type: "string", format: "binary" },
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});

// ── GET /api/v1/clients/{id}/contacts ────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients/{id}/contacts",
  tags: ["Clientes"],
  summary: "Lista los contactos de un cliente",
  description: `${SCOPE_NOTE} Lectura escopada como el cliente (no paginada); un cliente fuera de alcance responde 404.`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Contactos activos del cliente.",
      content: { "application/json": { schema: z.object({ contactos: z.array(ContactoSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

// ── POST /api/v1/clients/{id}/contacts ───────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/clients/{id}/contacts",
  tags: ["Clientes"],
  summary: "Crea un contacto para un cliente",
  description: `${SCOPE_NOTE} Escritura además requiere ser el responsable si el rol no es de acceso total; un cliente visible pero no editable responde 403; un cliente inexistente responde 404.`,
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: CONTACT_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Contacto creado.",
      content: { "application/json": { schema: z.object({ contacto: ContactoSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── PATCH /api/v1/clients/{id}/contacts/{contactId} ──────────────────────
registry.registerPath({
  method: "patch",
  path: "/api/v1/clients/{id}/contacts/{contactId}",
  tags: ["Clientes"],
  summary: "Actualiza un contacto de un cliente",
  description:
    `${SCOPE_NOTE} Escritura requiere permiso de escritura sobre el cliente (403 si es de otro responsable); 404 si el cliente no existe o si el contacto no existe/no pertenece a ese cliente. ` +
    "Body parcial pero no vacío (al menos un campo).",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), contactId: z.string().uuid() }),
    body: { content: { "application/json": { schema: CONTACT_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Contacto actualizado.",
      content: { "application/json": { schema: z.object({ contacto: ContactoSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── DELETE /api/v1/clients/{id}/contacts/{contactId} ─────────────────────
registry.registerPath({
  method: "delete",
  path: "/api/v1/clients/{id}/contacts/{contactId}",
  tags: ["Clientes"],
  summary: "Elimina (soft delete) un contacto de un cliente",
  description: `${SCOPE_NOTE} Escritura requiere permiso de escritura sobre el cliente (403 si es de otro responsable); 404 si el cliente no existe o si el contacto no existe/no pertenece a ese cliente.`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid(), contactId: z.string().uuid() }) },
  responses: {
    204: { description: "Contacto eliminado (sin contenido)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ── GET /api/v1/clients/{id}/log — bitácora ──────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients/{id}/log",
  tags: ["Clientes"],
  summary: "Lista la bitácora de gestión de un cliente",
  description:
    `${SCOPE_NOTE} Lectura escopada como el cliente; un cliente fuera de alcance responde 404. ` +
    "Las entradas son inmutables por diseño (sin updated_at/deleted_at) — no existen PATCH ni DELETE para este recurso, solo GET/POST.",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Entradas de bitácora ordenadas por fecha ascendente.",
      content: { "application/json": { schema: z.object({ entradas: z.array(BitacoraEntradaSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

// ── POST /api/v1/clients/{id}/log ────────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/clients/{id}/log",
  tags: ["Clientes"],
  summary: "Agrega una entrada a la bitácora de gestión de un cliente",
  description:
    `${SCOPE_NOTE} Escritura además requiere ser el responsable si el rol no es de acceso total; un cliente visible pero no editable responde 403; un cliente inexistente responde 404. ` +
    "autor_id siempre es el usuario de la sesión — nunca un campo enviado por el cliente.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: LOG_ENTRY_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Entrada de bitácora creada.",
      content: { "application/json": { schema: z.object({ entrada: BitacoraEntradaSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── GET /api/v1/clients/{id}/opportunities ───────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/clients/{id}/opportunities",
  tags: ["Clientes"],
  summary: "Lista las oportunidades de un cliente",
  description: `${SCOPE_NOTE} Lectura escopada como el cliente (no paginada); un cliente fuera de alcance responde 404.`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "Oportunidades activas del cliente.",
      content: { "application/json": { schema: z.object({ oportunidades: z.array(OportunidadSchema) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});

// ── POST /api/v1/clients/{id}/opportunities ──────────────────────────────
registry.registerPath({
  method: "post",
  path: "/api/v1/clients/{id}/opportunities",
  tags: ["Clientes"],
  summary: "Crea una oportunidad para un cliente",
  description:
    `${SCOPE_NOTE} Escritura además requiere ser el responsable si el rol no es de acceso total; un cliente visible pero no editable responde 403; un cliente inexistente responde 404. ` +
    "estado por defecto DISENANDO_PROPUESTA si no se envía. valor_estimado_cop alimenta el módulo financiero del dashboard.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: OPORTUNIDAD_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Oportunidad creada.",
      content: { "application/json": { schema: z.object({ oportunidad: OportunidadSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── PATCH /api/v1/clients/{id}/opportunities/{opportunityId} ────────────
registry.registerPath({
  method: "patch",
  path: "/api/v1/clients/{id}/opportunities/{opportunityId}",
  tags: ["Clientes"],
  summary: "Actualiza una oportunidad de un cliente",
  description:
    `${SCOPE_NOTE} Escritura requiere permiso de escritura sobre el cliente (403 si es de otro responsable); 404 si el cliente no existe o si la oportunidad no existe/no pertenece a ese cliente. ` +
    "Body parcial pero no vacío (al menos un campo).",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), opportunityId: z.string().uuid() }),
    body: { content: { "application/json": { schema: OPORTUNIDAD_PATCH_SCHEMA } } },
  },
  responses: {
    200: {
      description: "Oportunidad actualizada.",
      content: { "application/json": { schema: z.object({ oportunidad: OportunidadSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});

// ── DELETE /api/v1/clients/{id}/opportunities/{opportunityId} ───────────
registry.registerPath({
  method: "delete",
  path: "/api/v1/clients/{id}/opportunities/{opportunityId}",
  tags: ["Clientes"],
  summary: "Elimina (soft delete) una oportunidad de un cliente",
  description: `${SCOPE_NOTE} Escritura requiere permiso de escritura sobre el cliente (403 si es de otro responsable); 404 si el cliente no existe o si la oportunidad no existe/no pertenece a ese cliente.`,
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid(), opportunityId: z.string().uuid() }) },
  responses: {
    204: { description: "Oportunidad eliminada (sin contenido)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
