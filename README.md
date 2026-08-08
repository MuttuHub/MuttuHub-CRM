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

El esquema (16 tablas, incluye `usuarios`, `accesos`, `cron_logs` y
`settings`) ya trae la migración inicial; se aplica a la BD remota:

```bash
npm run db:migrate
npm run db:generate   # regenera el cliente Prisma si cambia el esquema
```

> Nota (Hito 7): la migración `0003_settings` (tabla `settings` para los
> catálogos configurables) está **pendiente de aplicar** — corre `npm run
> db:migrate` en el próximo deploy. Sin aplicarla todo cae a los defaults.

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
```
POST /api/v1/auth/login                     { email, password } → { usuario, sessionExpiresAt }
POST /api/v1/auth/logout                    204
GET  /api/v1/auth/me                         { usuario } → 401
POST /api/v1/auth/reset-password             { email } → 200 siempre
POST /api/v1/auth/reset-password/confirm     { code?, newPassword }
GET  /api/v1/auth/accesos                   (solo ADMINISTRADOR) bitácora de accesos
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

## Tablero (Hito 3)

Extensiones del motor de tareas para el Kanban (PRD §5). Los endpoints de
subtareas y el reporte **no están en el contrato §8.2** (se agregaron por
§5.2 y §5.4 respectivamente); los adjuntos sí figuran en §8.2.

```
POST /api/v1/tasks/:id/subtasks              { titulo (1-200), completada? } → 201
GET  /api/v1/tasks/:id/subtasks            [{ id, titulo, completada, tarea_id }]
PATCH /api/v1/tasks/:id/subtasks/:subtaskId  { titulo?, completada? }
DELETE /api/v1/tasks/:id/subtasks/:subtaskId → 204 (borrado físico)
POST /api/v1/tasks/:id/attachments         multipart/form-data, campo `file` → 201
GET  /api/v1/tasks/:id/attachments         [{ id, nombre, tamano_bytes, created_at }]
GET  /api/v1/tasks/:id/attachments/:attachmentId/download → 302 a signed URL (60 s)
GET  /api/v1/tasks/report                  ?rango=week|month|quarter|all&responsable=&cliente=
GET  /api/v1/tasks/export                  xlsx (mismos filtros que la lista, máx 500 filas)
```

Convenciones:

- **Permisos:** mismas reglas que la tarea — lectura como el detalle
  (`loadTaskScoped`), escritura como el PATCH (`getTaskForWrite`): roles
  completos en todos lados; `COLABORADOR` solo sus tareas (y las de clientes
  que lidera).
- **Subidas**: campo `file`, ≤ 10 MB (413 `FILE_TOO_LARGE`) y solo
  PDF/DOCX/XLSX/JPG/PNG (400 `VALIDATION_ERROR`; se acepta si la extensión o
  el MIME están en el set). La respuesta trae `download_url` (signed URL 60 s);
  si el signed URL falla, el adjunto sigue creado y se usa el endpoint de
  descarga.
- **Storage**: bucket `SUPABASE_STORAGE_BUCKET` (default `muttu-docs`), path
  `tareas/{tarea_id}/{uuid}_{nombre}` (análogo a la convención
  `/documentos/...` del PRD §6.2, sin el `/` inicial del key). Se usa el
  cliente service role (`src/lib/supabase/admin.ts` — nunca en cliente). Sin
  Supabase configurado los endpoints de adjuntos responden 500
  `INTERNAL_ERROR` con el mismo envelope.
- **Reporte** (PRD §5.4): `tasa_cumplimiento` = `completadas / total_asignadas`
  redondeada; "en curso" = estados abiertos (todo salvo
  `COMPLETADA`/`CANCELADA`); `vencidas` = abiertas con `fecha_entrega` pasada;
  `por_estado` trae los 7 estados del catálogo con ceros. `rango` filtra por
  `updated_at` (week=7, month=30, quarter=90 días; `all` sin filtro).
- **Proxy "a tiempo"**: `Tarea` no tiene `completed_at`, así que el criterio
  es `updated_at <= fecha_entrega` sobre tareas `COMPLETADA` con fecha (en el
  reporte y el criterio documentado del xlsx). Las completadas sin fecha no
  cuentan ni como a tiempo ni como tarde. Si más adelante se agrega
  `completed_at`, este proxy se reemplaza en un solo lugar (reporte).
- **Subtareas**: `DELETE` es borrado físico (el modelo no tiene `deleted_at`
  y el PRD no lo exige para checklist).
- **Etiquetas**: catálogo canónico en `src/lib/catalogs.ts` (`TASK_TAGS`:
  Comercial, Administrativo, Proyecto, Interno), almacenado en crudo en
  `etiquetas` (String[]). Desde el Hito 7 el valor live se edita en el admin
  (`settings` → `task_tags`; ver sección Administración).

## Repositorio de documentos (Hito 4)

Biblioteca con metadatos (no explorador de carpetas) con versionado y
descargas individuales/múltiples (PRD §6–§8.2):

```
GET  /api/v1/documents                    lista con búsqueda y filtros (categoria, etiqueta, cliente, autor, desde, hasta, page, limit máx 100)
POST /api/v1/documents                  multipart form-data: file, titulo?, categoria, etiquetas? (JSON), cliente_id? → 201
GET  /api/v1/documents/:id              detalle completo + versiones + conteos
DELETE /api/v1/documents/:id            soft delete del documento completo → 204
POST /api/v1/documents/:id/versions     multipart form: file → sube la versión max+1 (201)
GET  /api/v1/documents/:id/versions     todas las versiones desc, con subidor
GET  /api/v1/documents/:id/download     descarga la versión activa (302 a signed URL 60 s)
GET  /api/v1/documents/:id/versions/:versionId/download   descarga ESA versión (302)
POST /api/v1/documents/zip              { ids: string[] } (1 a 50) → documentos.zip
```

Modelo de permisos (v1):

- **Subir/descargar/listar:** cualquier usuario autenticado (con la excepción
  de categorías restringidas).
- **Eliminar:** roles completos (`ADMINISTRADOR`/`GERENCIA`/`COORDINADOR`) o el
  autor del documento (`COLABORADOR` solo sus propios documentos).
- **Categorías restringidas** (default `Legal`,
  `Administrativo-financiero` — constantes `RESTRICTED_DOC_CATEGORIES` en
  `src/lib/catalogs.ts`; el valor live por categoría se edita en `settings`
  → `doc_categories`, Hito 7): los `COLABORADOR` no las
  ven (listado/detalle) y sus descargas/zip/devuelven **403 `FORBIDDEN`**; no
  pueden crearlas ni subirles versiones. Los roles completos ven todo.

Convenciones:

- **Subidas**: campo `file`, ≤ 10 MB (413 `FILE_TOO_LARGE`), formatos
  PDF/DOCX/XLSX/JPG/PNG (400 si no; se acepta por extensión o MIME). Las
  etiquetas van como arreglo JSON en el campo `etiquetas` (máx 8, cada una ≤ 40
  chars). El `titulo` es opcional: por defecto usa el nombre del archivo sin
  extensión.
- **Storage**: bucket `SUPABASE_STORAGE_BUCKET` (default `muttu-docs`), key sin
  el "/" inicial según la convención del PRD §6.2:
  `documentos/{cliente_id o "general"}/{documento_id}/v{n}_{nombre-sanitizado}`.
  El nombre del archivo se sanitiza (`src/lib/api/files.ts`): sin separadores
  de path, recortado y máx. 120 caracteres conservando la extensión. Se usa el
  cliente service role (`src/lib/supabase/admin.ts`, solo servidor); sin
  Supabase configurado todas las rutas responden 500 con el envelope estándar.
- **Versiones**: `numero_version = max + 1` (nunca automática por nombre) y la
  versión activa es SIEMPRE la de mayor número (descarga individual, zip y
  `version_activa` de la lista). El soft delete es únicamente del documento
  completo (`deleted_at`): una versión individual jamás se borra (PRD §6.2).
  Sin límite de versiones en v1.
- **Zip** (`POST /documents/zip`): máx. 50 documentos (PRD §8.4). Se baja la
  versión activa de cada uno (signed URL de 60 s + fetch server-side) y se
  empaqueta con nombre `${titulo}_v${n}${ext}`. Si algún archivo falla no se
  aborta la descarga: se salta el archivo y un `README.txt` interno lista los
  fallos.
- **Nombres de autor/subidor**: resueltos con `usuario.findMany` por lotes
  (`src/lib/api/documents.ts`) porque `DocumentoVersion.subido_por_id` y
  `DocumentoCliente` no tienen FK hacia `Usuario` en el schema.
- **Catálogo**: constantes `DOC_CATEGORIES` y `RESTRICTED_DOC_CATEGORIES` en
  `src/lib/catalogs.ts` (defaults de fábrica); desde el Hito 7 el valor live
  se configura desde el admin (`settings` → `doc_categories`, ver sección
  Administración) y el API lo re-lee en cada request.

## Notificaciones y cron (Hito 5)

Motor de alertas compartido (`src/lib/alerts.ts`, PRD §4.4 / §5.3) + panel
interno + correo diario vía `pg_cron` y Resend (PRD §4.4.1). La regla de
alerta es única: tareas sin borrar, con `fecha_entrega` y en estado abierto
(`OPEN_TASK_STATES` — nada de `COMPLETADA`/`CANCELADA`), agrupadas en
**vencidos** (rojo), **vencen hoy** (ámbar) y **próximos 3 días**
(informativo). Timezone: los límites de día son los del reloj local del
servidor (Vercel = UTC) y el cron cubre 8:00 Colombia (13:00 UTC).

### Panel de notificaciones

```
GET   /api/v1/notifications        ?leida=false (solo sin leer)
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

- Alcance (PRD §4.4.1): `COLABORADOR` → solo sus tareas; `COORDINADOR` /
  `GERENCIA` / `ADMINISTRADOR` → todas.
- Cada item del GET trae `notificacion_id` (la fila de la tabla
  `notificaciones` del snapshot). La reconciliación crea la fila con
  `leida=false` si no existía para esa `(usuario_id, tarea_id)` y **conserva
  `leida`** si la fila ya existía (nunca resetea la decisión del usuario;
  las filas de alertas que salieron del snapshot quedan como historial).
  `read-all` marca las filas del snapshot visible (no toca historial viejo).

### Cron diario (8:00 → 13:00 UTC)

1. Configura las envs en Vercel: `CRON_SECRET` (nuevo, Hito 5),
   `RESEND_API_KEY` y `EMAIL_FROM` (PRD §8.4).
2. En Supabase SQL editor, ejecuta `scripts/cron_setup.sql` reemplazando
   `[CRON_SECRET]` por el mismo valor de la env.
3. Prueba manual:

   ```bash
   curl -X POST -H "x-cron-secret: TU_SECRETO" \
     https://muttu-hub.vercel.app/api/cron/daily
   ```

- **Reglas**: `ADMINISTRADOR` no recibe correo; si un usuario no tiene nada
  en ninguna categoría no se le envía (no-mail-if-empty). La respuesta es
  `{ ok, processed, sent, failed, skipped_empty, already_sent_today }`.
- **Idempotencia**: el reintento de las 8:30 (`muttu-retry-830`) solo
  re-envía si la corrida de las 8:00 no cerró `OK` en `cron_logs`; una
  segunda llamada al endpoint con una corrida `OK` del día responde
  `already_sent_today: true` sin re-enviar.
- **Registro**: cada corrida escribe una fila en `cron_logs`
  (`daily-notifications`, estado `OK` / `ERROR` / `SKIPPED_NO_CONFIG`,
  detalle ≤ 400 chars). Sin `RESEND_API_KEY` la corrida responde 200 con
  `SKIPPED_NO_CONFIG` (graceful, sin crash). Retención 30 días (PRD §8.4).
- **Proxy**: `/api/cron/*` no pasa por el proxy (el matcher de
  `src/proxy.ts` excluye todo `/api`), así que autentica solo por header
  `x-cron-secret`; `/api/v1/notifications*` sigue con la sesión de siempre.
- **Falla de BD**: el registro en `cron_logs` es best-effort; una falla no
  aborta la corrida y el reintento de las 8:30 lo decide desde `cron_logs`.

## Dashboard (Hito 6)

El home (`/`) es ahora el dashboard con las 4 "caras" del PRD §7.1:

```
GET /api/v1/dashboard/pipeline          → { scope, total_activas, valor_activo, embudo, top_clientes, comparativo }
GET /api/v1/dashboard/tasks             → { scope, por_columna, cumplimiento_por_persona, vencidas }
GET /api/v1/dashboard/clients-activity  → { scope, sin_gestion, distribucion, actividad_por_responsable }
GET /api/v1/dashboard/my-summary        → { scope: "own", activas, vencidas, hoy, compromisos_pendientes, clientes_asignados }
```

- **Caras**: Pipeline comercial, Gestión de tareas, Actividad de clientes y
  Mi resumen. Cada una consume su endpoint con `useQuery` (las queries se
  refetchean al cambiar los filtros, la key los incluye).
- **Filtros comunes (§7.2)**: rango por presets (Todo / 30 días / 90 días —
  el rango custom queda como TODO), responsable (`/api/v1/catalogs/users`) y
  tipo de cliente; en Actividad de clientes además el chip de días sin
  gestión (7/14/30/60 → `dias_sin_gestion`). En scope "own" el filtro de
  responsable se ignora en el servidor (documentado en `src/lib/dashboard.ts`).
- **Exportación (§7.3)**: botón "Generar reporte" por cara → abre
  `/print/dashboard/{cara}?{filtros}`, página imprimible fuera del shell que
  re-descarga el mismo endpoint y se auto-imprime (patrón de
  `print/clientes`). Las páginas de impresión usan la utilidad `.print-hide`
  (definida en `globals.css` bajo `@media print`).
- **Alcance por rol**: `COLABORADOR` ve solo sus datos (scope "own"), el
  resto de roles ve la plataforma completa; cada respuesta trae `scope`.
- **Modo dev sin configurar**: las caras muestran la tarjeta "Plataforma no
  conectada" con reintento; solo cuando el API responde el envelope "Plataforma
  no configurada" (sin `.env`), se renderiza debajo la vista de demostración
  del Hito 1 (datos de `src/lib/mock/demo.ts`), nunca con datos reales.

## Administración (Hito 7)

Backend admin (PRD §3.3): catálogos configurables y bitácora de accesos.

```
GET  /api/v1/settings                (solo ADMINISTRADOR) → { task_tags, doc_categories }
PUT  /api/v1/settings                (solo ADMINISTRADOR) { task_tags?, doc_categories? }
GET  /api/v1/catalogs/settings       (cualquier usuario autenticado) → mismo snapshot
GET  /api/v1/auth/accesos            (solo ADMINISTRADOR) ?limit&before → bitácora
```

- **Catálogos configurables**: `task_tags` (array de strings) y
  `doc_categories` (`[{ nombre, restringida }]`). El valor vive en la tabla
  `settings` (migración `0003_settings`, pendiente por `db:migrate`); sin
  fila, cada clave cae a las constantes de `src/lib/catalogs.ts`. Validación
  del PUT: 1 a 30 ítems, únicos (las categorías sin distinguir mayúsculas),
  ≤ 40 caracteres por etiqueta y ≤ 80 por categoría, y siempre se conserva al
  menos una etiqueta/categoría. Responde 400 `VALIDATION_ERROR` con mensajes
  en español; solo se actualizan las claves enviadas y la respuesta es
  siempre el snapshot fresco.
- **Enforcement en vivo**: listado, detalle, subida, descarga y zip de
  documentos re-leen `doc_categories` en cada request
  (`src/lib/api/documents.ts` → `loadDocCategories`): las categorías
  restringidas del admin siguen excluidas para `COLABORADOR` (403/listado
  filtrado) sin tocar código. Las tareas dejan `TASK_TAGS` como catálogo de
  sugerencia (sin validación forzada en el create/update de tarea, igual que
  v1).
- **`/api/v1/catalogs/settings`**: DECISIÓN DE DISEÑO — los selects de la
  UI (tablero, repositorio) consumen el catálogo sin privilegios de admin, así
  que este endpoint replica el snapshot del GET de settings con gate de rol
  solo-lectura (`requireApiUser`, sin escrituras ni ensure de defaults).
- **Bitácora de accesos**: cada login exitoso escribe una fila en `accesos`
  (ip + user-agent best-effort; el login jamás falla por el log). El GET del
  admin pagina por keyset sobre `created_at` desc: `?limit=` (default 20,
  máx 100) y `?before=` (ISO del último `created_at` de la página anterior,
  con `next_before` en la respuesta; null al final).
- **Permisos granulares por módulo (§3.3.2)**: fuera del alcance de v1 — los
  gates siguen siendo por rol completo (TODO documentado en
  `src/lib/supabase/server.ts`).

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