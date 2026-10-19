# Despliegue y portabilidad

Qué usa hoy Muttu Hub, qué está acoplado a Supabase y qué haría falta para moverlo a **Railway Pro** (o a cualquier
proveedor con Postgres gestionado). Este documento describe el camino; **no** afirma que la migración esté hecha.

---

## 1. Mapa de servicios actual

| Pieza | Hoy | Notas |
|---|---|---|
| Aplicación Next.js | **Vercel** (deploy desde `main`) | Build: `prisma generate && next build`. No aplica migraciones |
| Postgres 17 | **Supabase Cloud** | Pooler de sesión (5432) para migrar, de transacciones (6543) para la app |
| Autenticación | **Supabase Auth** | Cookies SSR con `@supabase/ssr`; admin API para invitar, resetear y sembrar |
| Archivos | **Supabase Storage** | Bucket privado `muttu-docs`; subida y descarga con URLs firmadas |
| Cron | **pg_cron + pg_net** | `muttu-daily-8am` (13:00 UTC) y `muttu-retry-830` (13:30 UTC) → `POST /api/cron/daily` con `CRON_SECRET` |
| Correo | **Resend** | `RESEND_API_KEY` + `EMAIL_FROM` (dominio pendiente de verificar) |
| Respaldos | Dump manual + PITR si el plan lo incluye | Runbook §3.1 y §5.3 |
| CI | **GitHub Actions** | `unit` (migraciones en Postgres desechable + `tsc` + lint + vitest) |

---

## 2. Acoplamientos a Supabase

| Acoplamiento | Dónde vive | Coste de migrar |
|---|---|---|
| **Auth SSR** (cookies, refresh, `requireApiUser`) | `src/lib/supabase/*`, `src/proxy.ts`, middleware | Alto: hay que sustituir el proveedor de identidad y migrar usuarios sin cambiar contraseñas |
| **Admin API** (`auth.admin.listUsers/createUser/deleteUser`) | `prisma/seed.ts`, `scripts/offboard-camarabaq.ts`, invitaciones | Bajo: solo herramientas internas |
| **Storage SDK** (`storage.from(...).createSignedUploadUrl`, `createSignedUrl`, `info`) | `src/lib/api/signed-upload.ts`, `src/lib/api/soportes.ts` | Medio: se sustituye por URLs prefirmadas de S3 (R2, Backblaze B2, Tigris) |
| **`pg_cron` + `pg_net`** | `scripts/cron_setup.sql`, función `public.muttu_cron_daily()` | Bajo: Railway Cron o un programador externo llamando al mismo endpoint |
| **Plantillas de correo** | `supabase/email-templates/*.html` | Bajo: solo aplican al Auth alojado de Supabase |
| **Esquemas `auth`/`storage`** | Solo los usan extensiones de Supabase; el código de la app **no** consulta `auth.users` | Bajo: la app es independiente |
| **RLS** | **No hay RLS en las migraciones**; Prisma accede con un rol privilegiado | Ninguno: no hay políticas que reescribir |

Lo que **sí** es portable sin cambios: todo el dominio (Prisma, rutas, componentes, pruebas), el esquema y las
migraciones, el cron lógico (`/api/cron/daily`), el correo (Resend es independiente del hosting) y el build de Next.

---

## 3. Variables de entorno

| Variable | Obligatoria | Sustituible en Railway |
|---|---|---|
| `DATABASE_URL` | Sí | Sí: Postgres de Railway (URL con SSL) |
| `DIRECT_URL` | Sí (migraciones) | Sí: misma URL o la directa del plugin |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Solo si se mantiene Supabase Auth/Storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Idem |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Alternativa | Idem |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí (servidor) | Idem |
| `SUPABASE_STORAGE_BUCKET` | Sí | Se reemplaza por bucket + credenciales S3 |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sí | Sin cambios |
| `CRON_SECRET` | Sí | Sin cambios |
| `NEXT_PUBLIC_APP_URL` | Sí | Sin cambios (dominio nuevo) |
| `ENABLE_DEV_ROUTES` | No | Nunca en producción |

---

## 4. Opciones de destino

### Opción A — App en Railway, Supabase se queda

La más barata y de menor riesgo: Railway corre Next.js (`next build` + `next start`) y Supabase sigue dando Auth,
Storage y Postgres. Solo cambia el hosting de la app y el dominio. **Un día de trabajo.**

### Opción B — Stack completo en Railway

| Necesidad | Opción en Railway |
|---|---|
| App | Servicio Node 24 con `npm ci && npm run build` y `npm run start` (o Dockerfile) |
| Postgres | Plugin Postgres de Railway (respaldos del plan Pro) |
| Archivos | Bucket S3-compatible externo (Cloudflare R2, Backblaze B2, Tigris) con URLs prefirmadas |
| Auth | Servicio propio (Better Auth o Auth.js) sobre el Postgres de Railway, o Supabase Auth autoalojado |
| Cron | Railway Cron (`0 13 * * *` y `30 13 * * *` UTC) llamando a `/api/cron/daily` |
| Correo | Resend (sin cambios) |
| Migraciones | `prisma migrate deploy` como paso previo al deploy (job manual o *pre-deploy command*) |

**Trabajo estimado:** 1–2 semanas, con la migración de identidad como ruta crítica.

---

## 5. Plan de migración (Opción B)

1. **Congelar** escrituras (ventana) y tomar un dump verificado, como en el runbook §3.1.
2. **Postgres:** crear la instancia, `prisma migrate deploy` sobre una copia y verificar con `migrate diff` vacío y los
   conteos de `clientes`, `oportunidades`, `tareas`, `proyectos` y `_prisma_migrations`.
3. **Archivos:** copiar los objetos del bucket `muttu-docs` al bucket S3 y reescribir las claves si cambia el prefijo.
4. **Storage:** implementar un adaptador con URLs prefirmadas detrás de la interfaz actual (`signed-upload`, `soportes`).
5. **Auth:** exportar usuarios (correo + hash si el proveedor nuevo lo permite) o forzar un restablecimiento de
   contraseña masivo; cambiar `requireApiUser`, el middleware y las pantallas de login, invitación y recuperación.
6. **Cron:** crear los jobs en Railway con el mismo `CRON_SECRET` y verificar `cron_logs`.
7. **Dominio y TLS:** apuntar el dominio, actualizar `NEXT_PUBLIC_APP_URL` y las redirect URLs.
8. **Humo:** login por rol, portafolio, ficha, subir y abrir un documento, registrar gasto y validarlo, cron del día
   siguiente.
9. **Vuelta atrás:** mantener el entorno anterior una semana con el dump congelado.

---

## 6. Pulido que abarata la migración

Estas mejoras no cambian comportamiento y reducen el coste del paso 4 y 5:

- Aislar Storage detrás de una interfaz (`put`, `signUpload`, `signDownload`, `stat`) con una implementación Supabase y
  otra S3.
- Aislar Auth detrás de una interfaz (`getUser`, `requireUser`, `invite`, `resetPassword`) en lugar de llamar a
  `supabase.auth` desde las rutas.
- No consultar jamás `auth.users` desde la app (hoy no se hace: solo herramientas internas).
- Sacar el cron a configuración (URL y secreto) para poder apuntarlo a cualquier programador.
- Añadir un `Dockerfile` y un endpoint `/api/health` (comprobación de base y versión) para cualquier plataforma.
- Documentar las migraciones como paso obligatorio de despliegue, no como algo que hace el build.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Migrar Auth sin perder acceso | Probar con un usuario de cada rol en un entorno de staging antes de la ventana |
| Storage con claves distintas | Copiar objetos manteniendo la ruta relativa y verificar descargas firmadas |
| Cron silencioso | Comparar `cron_logs` del día siguiente y alertar si no hay fila |
| Respaldos del nuevo proveedor | Confirmar PITR/backups en el plan Pro y **probar una restauración** |
| Coste y latencia | Medir antes de decidir; la Opción A evita casi todo el riesgo |
