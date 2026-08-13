// OpenAPI path registrations for the "auth" domain (/api/v1/auth/* plus the
// dev-only /api/v1/dev/reset-token helper). See
// src/lib/openapi/paths/notifications.ts for the reference pattern this file
// follows. None of these routes export a named Zod schema of their own (they
// validate with ad-hoc checks — isValidEmail/isValidPassword/parseJsonBody —
// not a `.safeParse()` against a `z.object(...)` const), so every schema
// below is defined fresh here for documentation purposes only; it never
// touches the routes' actual runtime validation.

import { z } from "zod";
import { ErrorEnvelopeSchema, registry, standardErrorResponses } from "@/lib/openapi/registry";

const RolUsuarioSchema = z
  .enum(["ADMINISTRADOR", "GERENCIA", "COORDINADOR", "COLABORADOR"])
  .openapi("RolUsuario");

const EstadoSolicitudAccesoSchema = z
  .enum(["PENDIENTE", "APROBADA", "RECHAZADA"])
  .openapi("EstadoSolicitudAcceso");

// ---------------------------------------------------------------------------
// GET /api/v1/auth/accesos
// ---------------------------------------------------------------------------

const AccesoItemSchema = registry.register(
  "AccesoItem",
  z.object({
    id: z.string().uuid(),
    created_at: z.string().datetime(),
    ip: z.string().nullable(),
    user_agent: z.string().nullable(),
    usuario: z.object({
      email: z.string().email(),
      nombre: z.string(),
    }),
  }),
);

const AccesosPageSchema = registry.register(
  "AccesosPage",
  z.object({
    accesos: z.array(AccesoItemSchema),
    next_before: z
      .string()
      .datetime()
      .nullable()
      .openapi({ description: "created_at (ISO 8601) del último item de esta página; úsalo como ?before= para la siguiente. null si no hay más." }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/auth/accesos",
  tags: ["Auth"],
  summary: "Bitácora de accesos (solo ADMINISTRADOR)",
  description:
    "Requiere el rol ADMINISTRADOR (requireApiRole). Paginación por keyset sobre created_at desc — pasa " +
    "el next_before de una página como ?before= para pedir la siguiente. Cada login exitoso escribe una " +
    "fila best-effort (ver POST /api/v1/auth/login), así que la bitácora puede tener huecos si esa escritura falló.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      limit: z
        .string()
        .regex(/^\d+$/)
        .optional()
        .openapi({ description: "Máximo de resultados (default 20, tope 100).", example: "20" }),
      before: z
        .string()
        .datetime()
        .optional()
        .openapi({ description: "Siguiente página: el created_at (ISO 8601) del último item de la página anterior." }),
    }),
  },
  responses: {
    200: {
      description: "Página de la bitácora de accesos, más reciente primero.",
      content: { "application/json": { schema: AccesosPageSchema } },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------

const LoginBodySchema = z.object({
  email: z.string().email().openapi({ example: "usuario@empresa.com" }),
  password: z.string().min(1),
});

const LoginResponseSchema = z.object({
  usuario: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    email: z.string().email(),
    rol: RolUsuarioSchema,
  }),
  sessionExpiresAt: z
    .string()
    .datetime()
    .openapi({ description: "Deadline absoluto de la sesión (4h desde el login)." }),
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Auth"],
  summary: "Inicia sesión con correo y contraseña",
  description:
    "Público (sin sesión previa). Un login exitoso registra una fila best-effort en la bitácora de accesos " +
    "(GET /api/v1/auth/accesos). El mismo mensaje 401 cubre correo inexistente y contraseña incorrecta — nunca " +
    "revela si la cuenta existe.",
  request: { body: { content: { "application/json": { schema: LoginBodySchema } } } },
  responses: {
    200: {
      description: "Sesión iniciada; el cliente recibe la cookie de sesión de Supabase.",
      content: { "application/json": { schema: LoginResponseSchema } },
    },
    ...standardErrorResponses([400, 401, 500]),
    403: {
      description: "La cuenta existe pero está inactiva (INACTIVE); la sesión recién creada se revoca de inmediato.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["Auth"],
  summary: "Cierra la sesión actual",
  description:
    "Idempotente y sin cuerpo: responde 204 incluso sin sesión activa o con Supabase sin configurar, para que " +
    "el cliente siempre pueda limpiar su estado local.",
  responses: {
    204: { description: "Sesión cerrada (o ya no existía)." },
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------

const UsuarioSesionSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nombre: z.string(),
  rol: RolUsuarioSchema,
  activo: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/auth/me",
  tags: ["Auth"],
  summary: "Perfil de la sesión actual",
  description:
    "usuario es null cuando Supabase confirma una sesión válida pero la base de datos está inaccesible en ese " +
    "momento (lookup best-effort).",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Perfil del usuario autenticado.",
      content: { "application/json": { schema: z.object({ usuario: UsuarioSesionSchema.nullable() }) } },
    },
    ...standardErrorResponses([401]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/reset-password
// ---------------------------------------------------------------------------

const ResetPasswordBodySchema = z.object({
  email: z.string().email().openapi({ example: "usuario@empresa.com" }),
});

const OkMessageSchema = z.object({ ok: z.literal(true), message: z.string() });

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/reset-password",
  tags: ["Auth"],
  summary: "Solicita un correo de recuperación de contraseña",
  description:
    "Público (sin sesión). Con un correo bien formado siempre responde 200 con el mismo mensaje genérico, " +
    "exista o no la cuenta — nunca revela si el correo está registrado (previene enumeración de usuarios).",
  request: { body: { content: { "application/json": { schema: ResetPasswordBodySchema } } } },
  responses: {
    200: {
      description: "Solicitud procesada; el mensaje no confirma si el correo existe.",
      content: { "application/json": { schema: OkMessageSchema } },
    },
    ...standardErrorResponses([400, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/reset-password/confirm
// ---------------------------------------------------------------------------

// Real branching accepts EXACTLY one of two session sources plus newPassword
// (or neither, if a session is already established via cookies):
//   1) { code, newPassword }                       — PKCE code from the email link
//   2) { accessToken, refreshToken, newPassword }   — pre-verified recovery session
//      (used by the dev/reset-token helper, no email link needed)
// zod-to-openapi does not render a conditional/exclusive union usefully for a
// request body here, so per the task's fallback guidance the schema stays a
// single loose object (all fields optional except newPassword) and the two
// accepted shapes are spelled out in the description instead.
const ResetPasswordConfirmBodySchema = z.object({
  code: z.string().optional().openapi({ description: "Código PKCE de recuperación recibido en el enlace del correo." }),
  accessToken: z
    .string()
    .optional()
    .openapi({ description: "Access token de una sesión de recuperación ya verificada (usado por el flujo dev/reset-token)." }),
  refreshToken: z.string().optional().openapi({ description: "Refresh token acompañando a accessToken." }),
  newPassword: z
    .string()
    .min(8)
    .openapi({ description: "Mínimo 8 caracteres, con letras y números." }),
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/reset-password/confirm",
  tags: ["Auth"],
  summary: "Confirma la nueva contraseña tras un enlace de recuperación",
  description:
    "Público (sin sesión previa) — fallback delgado para cuando el flujo directo en el cliente " +
    "(exchangeCodeForSession + updateUser) no puede completarse. Acepta newPassword junto con EXACTAMENTE una " +
    "de estas dos formas de identificar la sesión de recuperación (o ninguna, si ya hay una sesión establecida " +
    "por cookies): (1) { code } — código PKCE del enlace de email, o (2) { accessToken, refreshToken } — una " +
    "sesión de recuperación ya verificada (usada por GET /api/v1/dev/reset-token). El esquema se documenta como " +
    "un solo objeto con todos los campos opcionales salvo newPassword porque no representa bien una unión " +
    "condicional real.",
  request: { body: { content: { "application/json": { schema: ResetPasswordConfirmBodySchema } } } },
  responses: {
    200: {
      description: "Contraseña actualizada.",
      content: { "application/json": { schema: OkMessageSchema } },
    },
    ...standardErrorResponses([400, 500]),
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/solicitud-acceso
// ---------------------------------------------------------------------------

const SolicitudAccesoBodySchema = z.object({
  nombre: z.string().min(1).openapi({ example: "Ana Torres" }),
  email: z.string().email().openapi({ example: "ana.torres@empresa.com" }),
  cargo: z.string().max(120).optional(),
});

const SolicitudAccesoResumenSchema = z.object({
  id: z.string().uuid(),
  estado: EstadoSolicitudAccesoSchema,
  created_at: z.string().datetime(),
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/solicitud-acceso",
  tags: ["Auth"],
  summary: "Solicita acceso al Hub",
  description:
    "Público (sin sesión) — cualquiera con nombre y correo puede enviar una solicitud; no existe registro " +
    "público con contraseña, la aprobación es manual y el usuario elige su contraseña al canjear la invitación " +
    "enviada tras la aprobación. Antispam best-effort: 409 si ya hay una solicitud PENDIENTE para ese correo, " +
    "409 si el correo ya tiene cuenta (debe iniciar sesión), y un límite de 3 solicitudes/correo/hora en memoria " +
    "(no persiste entre instancias serverless ni reinicios).",
  request: { body: { content: { "application/json": { schema: SolicitudAccesoBodySchema } } } },
  responses: {
    201: {
      description: "Solicitud registrada.",
      content: { "application/json": { schema: z.object({ solicitud: SolicitudAccesoResumenSchema }) } },
    },
    ...standardErrorResponses([400, 409, 500]),
    429: {
      description: "Límite de solicitudes por correo excedido (código CONFLICT, best-effort, en memoria).",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/dev/reset-token
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/dev/reset-token",
  tags: ["Auth", "Dev"],
  summary: "[SOLO DEV/TEST — deshabilitado por defecto] Emite una sesión de recuperación para cualquier correo",
  description:
    "PELIGROSO — no confundir con un endpoint normal: sin ninguna autenticación propia, emite una sesión " +
    "completa de recuperación de contraseña (accessToken + refreshToken) para CUALQUIER cuenta dado solo su " +
    "email. Si llegara a ser alcanzable equivale a takeover total de esa cuenta. Deshabilitado por defecto en " +
    "TODO entorno (incluido producción): responde 404 salvo que se cumplan AMBAS condiciones — " +
    "NODE_ENV !== 'production' Y ENABLE_DEV_ROUTES=true (opt-in explícito que nada activa por sí solo). Existe " +
    "únicamente para pruebas locales (TestSprite TC006) y smoke tests manuales; nunca debe habilitarse en un " +
    "entorno públicamente alcanzable.",
  request: {
    query: z.object({
      email: z.string().email().openapi({ description: "Correo de la cuenta para la que se emitirá la sesión de recuperación." }),
    }),
  },
  responses: {
    200: {
      description: "Sesión de recuperación emitida (sin enviar ningún correo).",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            email: z.string().email(),
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 404, 500]),
    502: {
      description: "Falló la llamada a la Auth API de Supabase (generate_link o verify) al emitir/canjear el enlace (INTERNAL_ERROR).",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});
