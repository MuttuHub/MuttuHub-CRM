# Plan de trabajo — Supabase: pendientes para mañana

> Contexto: hoy se provisionó el proyecto remoto `rxwtgvuijaketidnbtoh.supabase.co` con el MCP:
> schema Prisma completo (16 tablas + 10 enums + FKs), historial `_prisma_migrations` sincronizado
> (3 migraciones con sus checksums), bucket privado `muttu-docs` (10 MB) y RLS activo en todas
> las tablas. **Todo lo que sigue requiere las credenciales del dashboard de Supabase.**

---

## Assistant ruta: verificar que no haya pendientes previos a las migrations

- [x] Verificar que las tablas del schema (16) + `_prisma_migrations` sigan aplicadas en el remoto (control con MCP `list_tables`) — **verificado 2026-08-09: 16 tablas + RLS + 3 migraciones**

## 1. Credenciales y entorno local (.env)

- [x] Crear `.env` copiando `.env.example`
- [x] `DATABASE_URL` — Supabase → Project Settings → Database → Connection string (use **Direct connection**, rol `postgres`; incluir password)
- [x] `DIRECT_URL` — mismo valor de conexión directa
- [x] `NEXT_PUBLIC_SUPABASE_URL=https://rxwtgvuijaketidnbtoh.supabase.co` (ya fijada)
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — obtenida vía MCP (`get_publishable_keys`), ya en `.env`
- [x] `SUPABASE_SERVICE_ROLE_KEY` — Dashboard → Settings → API → `service_role` (solo existe en el dashboard, no la expone el MCP)
- [x] `NEXTAUTH_SECRET` (generado con openssl) y `NEXT_PUBLIC_APP_URL`
- [x] Verificar que `.env` quede fuera del control de versiones (`.gitignore` — ya lo cubre: `.env*` con `!.env.example`)

## 2. Sincronización de Prisma con la base remota

- [x] `npm run db:generate`
- [x] `npx prisma migrate status` → **"Database schema is up to date"** (3 migraciones aplicadas)
  - [x] Fix conexión: host directo `db.*` resuelve solo IPv6 → usar pooler `aws-1-us-west-2.pooler.supabase.com` (5432 session para CLI en `prisma.config.ts`, 6543 transaction para runtime en `DATABASE_URL`). Prisma 7 no acepta `directUrl` en schema/config.
- [x] Prueba de escritura real: insert/read/delete de usuario de prueba vía Prisma Client (`PrismaPg` adapter) — confirmado en remoto

## 3. Arranque y smoke test de la app

- [x] `npm run dev` sin errores de conexión en consola (Next.js 16.3.0, Turbopack, ready en 720ms)
- [x] Login con el flujo real (Supabase Auth) — **admin@muttu.co entra y carga el dashboard** (verificado por el usuario 2026-08-09)
- [ ] Verificar que las 4 caras del dashboard cargan datos reales (no fallback demo)
- [x] Test de documentos: subir PDF en el Repositorio → **verificado 2026-08-09 por el usuario: sube y descarga OK**
- [x] Test de adjuntos: subir archivo a una tarea del Kanban → **verificado 2026-08-09 por el usuario: sube y descarga OK**
- [x] Confirmar en el dashboard de Supabase (Storage → `muttu-docs`) que los objetos listan correctamente — **verificado vía MCP 2026-08-09: 1 PDF en `documentos/general/…/v1_…pdf` (3.19 MB) + 1 adjunto en `tareas/<tarea_id>/…pdf`; filas en `documento_versiones` y `adjuntos_tareas` con `storage_path` mapeados**

## 4. Cron de notificaciones diarias (PRD §4.4.1)

- [x] Definir `CRON_SECRET` (generado, ya en `.env` local)
- [x] Agregar `CRON_SECRET` al `.env` local y a Vercel — **HECHO: 12 env vars cargadas en Production (Encrypted) 2026-08-09**
- [x] Editar `scripts/cron_setup.sql`: `[CRON_SECRET]` reemplazado por el valor real (endpoint queda `https://muttu-hub.vercel.app`)
- [x] Ejecutar `scripts/cron_setup.sql` — **aplicado 2026-08-09 vía session pooler: jobs `muttu-daily-8am` (jobid 1) y `muttu-retry-830` (jobid 2) creados**
- [x] Verificar jobs en Dashboard → Database → Cron — **verificado por query a `cron.job` vía conexión directa**
- [x] Prueba manual con POST `/api/cron/daily` + header `x-cron-secret` → **HTTP 200, `cron_logs` con `estado=OK processed=0 sent=0 skipped_empty=0 failed=0`; header inválido → 401**

## 5. Seguridad / cierre

- [x] Confirmar que `anon` no puede leer tablas de negocio: `curl` al REST con la anon key → **42501 permission denied en usuarios/documentos/clientes (más estricto que RLS: sin grants para anon)**
- [x] Confirmar bucket `muttu-docs` privado — **`public: false`, `file_size_limit` 10485760 (10 MB); anon no puede listar ni descargar objetos** — los downloads solo por signed URL
- [x] Crear usuario administrador inicial — **HECHO: `admin@muttu.co` (2026-08-09, service role, rol ADMINISTRADOR)**
- [ ] Documentar credenciales secretas en un gestor (las anon/publishable son públicas por diseño)

## 6. Deploy y TestSprite (E2E autónomo con IA)

> **Deploy HECHO 2026-08-09:** producción en `https://muttu-hub.vercel.app` (proyecto Vercel `muttu1/muttu-hub`, repo GitHub `MuttuHub/MuttuHub-CRM`, 12 env vars). Fix en el camino: Vercel instala `@prisma/client` sin tipos → `build: prisma generate && next build`. Smoke test OK: `/login` 200, `/` 307 a login, cron 200 (idempotencia) / 401 con secret inválido.

> Nota: la integración Git de Vercel falló al linkear (`Failed to connect MuttuHub/MuttuHub-CRM`) — los deploys se hacen por CLI (`npx vercel --prod`). Investigar si se quiere integración automática.

- [ ] Crear cuenta en TestSprite (plan free: 150 créditos/mes alcanza para probar) y obtener API key
- [ ] Conectar el MCP server de TestSprite a opencode/IDE (todos los planes lo incluyen)
- [x] Crear proyecto con URL desplegada — **`https://muttu-hub.vercel.app` ya está en producción**
- [ ] Subir el PRD (`docs/Muttu_Hub_PRD_v2.md`) para el feature map → TestSprite planea casos según intención de negocio
- [ ] Cargar credenciales de la cuenta de prueba (login real con `admin@muttu.co` o una cuenta de test) en el proyecto
- [ ] Revisar el plan generado (seleccionar/descartar casos) antes de la primera corrida
- [ ] Correr los tests generados (UI + API) y clasificar fallas: bug real vs. fragilidad vs. entorno
- [ ] Evaluar el free tier en este proyecto; decidir si hace falta Starter ($19/mes) o Standard ($69/mes) según volumen
- [ ] Complementar con unit/component tests locales (Vitest + Testing Library) para el día a día — TestSprite no los reemplaza
- [ ] (Opcional) GitHub Action de TestSprite como gate en PRs

## 7. Notas / pendientes abiertos

- `list_branches` del MCP falla por permisos del token (`Project reference is missing`) — solo afecta branches de desarrollo; si se usaran en el futuro hay que re-autorizar el MCP.
- El MCP no expone `service_role` ni el password de postgres: **imposible automatizar el `.env` completo sin el dashboard** (por eso esto queda de sesión para el usuario).

---

**Criterio de done:** la app corre localmente con datos reales en Supabase, los archivos suben/descargan por storage, el cron envía el resumen diario y TestSprite tiene su primera corrida E2E contra la app deployada.