# Muttu Hub

Plataforma integral de **Muttu Innovación Social**: aliados y clientes,
tablero de tareas Kanban, repositorio documental con versionado, reportes y
dashboard. Stack: **Next.js 16 (App Router) + Supabase (Auth / Postgres) +
Prisma**.

## Puesta en marcha

### 1. Requisitos

- Node.js 20+ y npm.
- Un proyecto de Supabase (el plan gratuito alcanza para v1).

### 2. Variables de entorno

```bash
cp .env.example .env
```

Completa las variables de Supabase (las encuentras en el panel del proyecto):

| Variable | Desde dónde |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Supabase → Settings → Connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (anon key, pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (**solo servidor**, nunca expongas) |
| `NEXT_PUBLIC_APP_URL` | URL de la app (dev: `http://localhost:3000`) |

> Las consultas de runtime usan `DATABASE_URL` con el driver adapter de Prisma
> (`@prisma/adapter-pg`); `DIRECT_URL` queda disponible para migraciones con
> pooler (PRD §8.4).

### 3. Configuración de Supabase Auth

1. **Authentication → Providers → Email:** activa el proveedor de Email.
2. **Authentication → Settings → Session duration:** fija el JWT en **14400
   segundos (4 horas)**, la duración de sesión de la plataforma (PRD §3.1).
   Mantiene el JWT en sintonía con el banner de cierre del cliente (3h50m/4h).
3. El reset de contraseña redirige a
   `${NEXT_PUBLIC_APP_URL}/auth/reset-password/confirm` (configurado en el código).

### 4. Base de datos (Prisma)

El esquema (15 tablas, incluye `usuarios`, `accesos` y `cron_logs`) ya trae la
migración inicial; se aplica a la BD remota:

```bash
npm run db:migrate
npm run db:generate   # regenera el cliente Prisma si cambia el esquema
```

La tabla `accesos` (bitácora de accesos, PRD §3.3) se crea con la migración y
se alimenta automáticamente en cada login.

### 5. Primer administrador

Supabase no permite registro público, así que el primer usuario se crea una
vez con la service role key:

```bash
node - <<'EOF'
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

(async () => {
  const email = "admin@muttu.co";
  const { data: authUser, error } = await supabase.auth.admin.createUser({
    email,
    password: "ClaveSegura123",
    email_confirm: true,
  });
  if (error) throw error;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });
  await db.usuario.create({
    data: {
      id: authUser.user.id,
      email,
      nombre: "Administrador",
      rol: "ADMINISTRADOR",
    },
  });
  console.log("Primer admin creado:", email);
})().catch((e) => { console.error(e); process.exit(1); });
EOF
```

### 6. Correr la app

```bash
npm run dev    # http://localhost:3000
npm run build  # build de producción
npm run lint   # ESLint
```

## Autenticación y sesión

- **Login:** la página `(auth)/login` envía `POST /api/v1/auth/login`; el
  servidor firma la sesión con Supabase (`signInWithPassword`), valida
  `Usuario.activo` y responde `{ usuario, sessionExpiresAt }`. La app guarda
  `sessionDeadlineAt` en el `localStorage`.
- **Protección de rutas:** `src/proxy.ts` (el middleware de Next.js 16) bloquea
  todo salvo `/login`, `/auth/reset-password` y las partes públicas de
  `/api/v1/auth/*`; cada ruta de API responde su propio `401/403` JSON. Las
  páginas revalidan con `requireUser` / `requireRole` en `src/lib/supabase/server.ts`.
- **4 horas, sin renovación:** el banner `session-banner.tsx` avisa a las
  3h50m *"Tu sesión se cerrará en 10 minutos. Guarda tu trabajo."* (no
  descartable) y a las 4h cierra la sesión y redirige a `/login?expired=1`
  con *"Tu sesión expiró"*.
- **Usuario desactivado:** la sesión activa continúa hasta vencer; el próximo
  login rechaza con 403 `INACTIVE` (*"Tu cuenta está inactiva. Contacta al
  administrador."*).
- **Recuperación de contraseña:** el correo con enlace de un solo uso (1h) lo
  envía `POST /api/v1/auth/reset-password` (siempre 200, sin enumerar cuentas).
  La página de confirmación usa el flujo directo de Supabase
  (`exchangeCodeForSession` + `updateUser`) y la ruta
  `/api/v1/auth/reset-password/confirm` como fallback.

> El JWT expira a las 4h solo si el dashboard de Supabase está con 14400 s; el
> banner usa `sessionDeadlineAt` para alinear el aviso con la expiración del JWT.

## Identidad auth ↔ usuario (decisión de diseño)

El `id` de la fila `Usuario` de la app **es el mismo UUID del usuario de Supabase
Auth** (relación 1:1). Al crear un usuario, el admin primero crea el auth user
con `supabase.auth.admin.createUser` (service role key) y luego
`prisma.usuario.create` con ese mismo `id`; esto conserva la integridad
referencial entre Auth y la tabla `usuarios`. Documentado también en
`src/app/api/v1/users/route.ts`.

## Modo dev sin configurar

Si `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_ANON_KEY` faltan en el
entorno, la app corre en **modo demo sin configuración**: el proxy deja pasar
todas las rutas (para que la UI quede visible) y la página de login muestra la
tarjeta *"Plataforma no configurada"*. Las rutas de API responden
`{ "error", "code" }` con 500 en lugar de fallar.

## API v1

Base `/api/v1`, sesión por cookie, respuestas en JSON. Los errores siguen
siempre el envelope `{ "error": "string", "code": "string" }` (PRD §8.2):

| HTTP | Código | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Campo inválido o faltante |
| 401 | `UNAUTHORIZED` | Sin sesión o token expirado |
| 403 | `FORBIDDEN` / `INACTIVE` | Sin permisos / cuenta inactiva |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 409 | `CONFLICT` | Email ya registrado |
| 500 | `INTERNAL_ERROR` | Error no controlado |

### Auth

```
POST /api/v1/auth/login                     { email, password } → { usuario, sessionExpiresAt }
POST /api/v1/auth/logout                    204
GET  /api/v1/auth/me                         { usuario } → 401
POST /api/v1/auth/reset-password             { email } → 200 siempre
POST /api/v1/auth/reset-password/confirm     { code?, newPassword }
```

### Usuarios *(solo ADMINISTRADOR)*

- `GET   /api/v1/users` → `{ usuarios }` (`id`, `nombre`, `email`, `rol`, `activo`, `created_at`)
- `POST  /api/v1/users` `{ nombre, email, rol, password }` → crea el auth user y
  la fila `Usuario`; contraseña ≥ 8 caracteres con letras y números; `409
  CONFLICT` si el email ya existe.
- `PATCH /api/v1/users/:id` `{ rol?, activo?, nombre? }`
- `POST  /api/v1/users/:id/deactivate` → soft delete (`activo = false`); nunca
  elimina (PRD §3.4).

### CRM (Hito 2)

Base `/api/v1`, sesión por cookie, errores `{ error, code }` (PRD §8.2):

```
GET  /api/v1/clients                   lista con búsqueda, filtros y paginación
POST /api/v1/clients                   crear cliente
GET  /api/v1/clients/export            xlsx clientes.xlsx (mismo filtrado que la lista)
GET  /api/v1/clients/:id               detalle + conteos + valor potencial
PATCH/DELETE /api/v1/clients/:id       actualizar parcial / borrado lógico
GET  /api/v1/clients/:id/contacts      | POST crear contacto
PATCH/DELETE /api/v1/clients/:id/contacts/:contactId
GET  /api/v1/clients/:id/opportunities | POST crear oportunidad
PATCH/DELETE /api/v1/clients/:id/opportunities/:opportunityId
GET  /api/v1/clients/:id/log           | POST nota de bitácora (inmutable)
GET  /api/v1/tasks                     lista CRM + Kanban con filtros (q, cliente, responsable, estado, origen, vencidas)
POST /api/v1/tasks                     crear tarea (responsable obligatorio)
GET  /api/v1/tasks/:id                 detalle con hilo de comentarios
PATCH/DELETE /api/v1/tasks/:id         actualizar parcial / borrado lógico
PATCH /api/v1/tasks/:id/status         cambio de estado (motivo al bloquear)
POST /api/v1/tasks/:id/comments        comentario (hilo inmutable)
GET  /api/v1/catalogs/users            usuarios activos (id, nombre) para selects
```

Modelo de permisos (v1 pragmático, sin tabla de equipos aún):

- `ADMINISTRADOR`, `GERENCIA` y `COORDINADOR` leen y escriben sobre todo.
- `COLABORADOR` solo lee/edita sus propios clientes y tareas; al crear, el
  responsable se fuerza a él mismo.
- `COLABORADOR` también puede editar tareas de clientes que él lidera.

El export `GET /api/v1/clients/export` genera `clientes.xlsx` (valor en COP,
etiquetas en español) con el mismo filtrado y alcance de roles que la lista;
está limitado a las primeras **500 filas** del conjunto filtrado (PRD §8.4).

Notas de diseño: la bitácora del cliente (`/log`) y los comentarios de tarea
son **inmutables** — solo se agregan, nunca se editan ni eliminan (el esquema
no tiene `updated_at` ni `deleted_at` para esos modelos).

## Scripts

```bash
npm run dev            # dev server
npm run build          # build de producción
npm run start          # producción local
npm run lint           # ESLint
npm run db:generate    # genera el cliente Prisma
npm run db:migrate     # aplica migraciones
npm run db:studio      # inspectar la BD
```