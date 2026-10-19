# Muttu Hub

![Next.js](https://img.shields.io/badge/Next.js%2016-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres%20%2B%20Storage-3FCF8E?logo=supabase&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma%207-2D3748?logo=prisma&logoColor=white)
![Tests](https://img.shields.io/badge/tests-4136%20unit%20%2B%2029%20e2e-22c55e)
![Estado](https://img.shields.io/badge/estado-v2%20en%20producci%C3%B3n-0ea5e9)

Plataforma de **Muttu Innovación Social** para gestionar aliados y clientes, el ciclo comercial, el tablero de tareas, el
repositorio documental y el **módulo de Proyectos v2** (estructura, presupuesto, ejecución y gastos con línea base).

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript estricto · Prisma 7 con `@prisma/adapter-pg` · Supabase (Auth,
Postgres y Storage) · TanStack Query 5 · Tailwind CSS 4 · Base UI + shadcn · Zod 4 · vitest + Playwright.

---

## Estado actual

| | |
|---|---|
| **Producción** | `main` desplegada en Vercel sobre Supabase Cloud |
| **Versión** | v2 del módulo de Proyectos en producción desde 2026-10-19 |
| **Permisos** | Matriz por rol del 2026-10-19 vigente (ver abajo) |
| **Pruebas** | 4136 pruebas en 370 archivos (vitest) · 29 e2e (Playwright) · `tsc` limpio · eslint sin errores |
| **Migraciones** | `prisma/migrations`, aplicadas con `migrate deploy` |
| **Base de datos** | 43 tablas en `public`, 21 enums, 38 migraciones aplicadas; sin RLS en migraciones (el acceso pasa por Prisma) |

---

## Módulos

| Módulo | Qué hace |
|---|---|
| **Login y sesión** | Supabase Auth con cookies SSR, sesión de 4 h, recuperación e invitación por correo |
| **CRM** | Clientes (ficha con General, contactos, oportunidades e historial), oportunidades, interacciones, relaciones, salud de cartera |
| **Tablero** | Kanban de tareas con etiquetas, subtareas, comentarios y adjuntos |
| **Proyectos v2** | Portafolio + Tablero gerencial + ficha de 5 pestañas (Resumen, Actividades, Finanzas, Documentos, Historial), línea base versionada, gastos con validación, presupuesto y programación mensual |
| **Documentos** | Repositorio con categorías restringidas, URL firmada y descarga |
| **Dashboard** | Cuatro caras (pipeline, tareas, actividad de clientes, mi resumen) con export a Excel |
| **Notificaciones** | Panel in-app y resumen diario por correo (pg_cron 08:00 Colombia, reintento 08:30) |
| **Administración** | Usuarios y roles, catálogos v2 (rubros, líneas, municipios), umbrales del semáforo, bitácoras de acceso y auditoría |

### Permisos del módulo de Proyectos

| Acción | Administrador | Gerencia | Coordinador | Colaborador |
|---|---|---|---|---|
| Ver portafolio, Tablero y proyectos | Todo | Todo | Solo sus proyectos | Solo sus proyectos |
| Crear proyecto | Sí | Sí | Sí | Sí |
| Editar datos, estructura y presupuesto | Sí | Sí | Si es integrante | Si es integrante |
| Avances, gastos, documentos, solicitar modificación | Sí | Sí | Si es integrante | Si es integrante |
| Aprobar línea base, validar gastos, aprobar modificaciones | Sí | Sí | No | No |

Reglas que no se negocian: nadie valida su propio gasto; en ejecución solo se editan `descripcion` y
`beneficiarios_meta` (lo demás es una modificación); la bandera `puede_ver_tablero_gerencial` **solo** da lectura.
Detalle completo en `docs/guia-uso-proyectos-v2.md`.

---

## Puesta en marcha local

**Requisitos:** Node 24, npm, Docker Desktop y Supabase CLI.

```bash
# 1. Dependencias
npm ci

# 2. Configuración local (nunca uses .env: es PRODUCCIÓN)
cp .env.example .env.local        # ajusta las claves de tu Supabase local
supabase start                    # levanta Postgres, Auth, Storage y Studio en Docker

# 3. Base de datos
npm run db:migrate:local          # aplica prisma/migrations
npm run db:seed:local             # datos demo (usuarios @demo.muttuhub.local, clave MuttuDemo2026!)
npm run db:demo:seed-projects:local -- --apply   # proyectos 001 (en ejecución) y 002 (borrador)

# 4. Aplicación
npm run dev                       # http://localhost:3000
```

Todos los scripts `*:local` cargan `.env.local` y se niegan a correr contra una base no local. `prisma.config.ts`
**nunca** carga `.env`.

### Variables de entorno

| Variable | Para qué | Dónde |
|---|---|---|
| `DATABASE_URL` | Conexión de la app (pooler de transacciones, puerto 6543 en Supabase Cloud) | Vercel + local |
| `DIRECT_URL` | Migraciones (pooler de sesión, 5432) | Vercel + local |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Vercel + local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente de navegador | Vercel + local |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Alternativa nueva de Supabase para el cliente | Vercel + local |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage firmado, invitaciones y tareas administrativas (solo servidor) | Vercel |
| `SUPABASE_STORAGE_BUCKET` | Bucket privado de documentos (`muttu-docs`) | Vercel |
| `RESEND_API_KEY` | Correo transaccional y resumen diario | Vercel |
| `EMAIL_FROM` | Remitente verificado en Resend | Vercel |
| `CRON_SECRET` | Header `x-cron-secret` que valida `POST /api/cron/daily` | Vercel + Supabase (`cron_setup.sql`) |
| `NEXT_PUBLIC_APP_URL` | Enlaces absolutos en correos | Vercel |
| `ENABLE_DEV_ROUTES` | Rutas de desarrollo; **nunca** en Production | Local |

---

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js en desarrollo, build de producción y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` / `test:watch` / `test:coverage` | vitest |
| `db:migrate:local`, `db:migrate:status:local`, `db:migrate:reset:local` | Migraciones contra `.env.local` |
| `db:seed:local`, `db:demo:seed-projects:local`, `db:demo:seed-flujo:local`, `db:demo:reset:local` | Datos demo locales |
| `docs:backfill` | Rellena el texto extraído de documentos existentes |
| `db:generate`, `db:migrate`, `db:seed` | Comandos Prisma directos (leen `DIRECT_URL`) |

---

## Pruebas

```bash
# Unitarias y de componente (370 archivos)
npm test

# Tipos y lint
npx tsc --noEmit && npm run lint
```

**E2E (Playwright).** La suite vive en `e2e/` y la de Proyectos en `e2e/proyectos-v2/` (29 pruebas con
`playwright.verify.config.ts`). Necesita el servidor arriba y la base demo sembrada. Corre siempre contra un **build de
producción**: el `next dev` se degrada tras unos minutos y provoca timeouts falsos.

```bash
npm run build && npm run start        # en una terminal
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --config playwright.verify.config.ts
```

---

## Despliegue

- **Aplicación:** Vercel, deploy automático desde `main`. El build corre `prisma generate && next build`; **no** aplica
  migraciones.
- **Base de datos, Auth y Storage:** Supabase Cloud. El bucket es privado y se sirve con URLs firmadas.
- **Cron:** `pg_cron` + `pg_net` en Supabase llaman a `POST /api/cron/daily` a las 08:00 y 08:30 (Colombia) con
  `CRON_SECRET` (`scripts/cron_setup.sql`).
- **Migraciones a producción:** se aplican **antes** del deploy del código, con respaldo verificado y `migrate diff`
  vacío. Procedimiento completo en `docs/runbook-lanzamiento-v2.md` (histórico, ejecutado el 2026-10-19).

Servicios, variables y qué cambiaría en otro proveedor (Railway Pro y similares):
**`docs/despliegue-y-portabilidad.md`**.

---

## Documentación

El índice con el estado de cada documento está en **`docs/README.md`**. Los tres documentos que mandan hoy:

| Documento | Para qué |
|---|---|
| `docs/guia-uso-proyectos-v2.md` (+ `.html`, `.pdf`) | Guía de usuario del módulo de Proyectos, con el anexo de validación de la PO |
| `docs/despliegue-y-portabilidad.md` | Servicios, variables y plan de migración |
| `docs/pendientes-v7.md` | Lo que queda abierto de v7 y del lanzamiento |

---

## Convenciones del repositorio

- **Commits:** Conventional Commits (`feat`, `fix`, `test`, `docs`, `chore`), sin atribución.
- **Ramas:** trabajo en `feat/*`, `fix/*` o `test/*`; `main` despliega.
- **Features grandes:** documento en `odd/tasks/<feature>.md` con `## Specs` (numeradas `S#`), `## Tasks` y `## Log`.
- **Idioma:** artefactos técnicos (código, tests, commits, docs del repo) en inglés; UI y documentos para usuarios en
  español.
- **Reglas de oro:** `.env` es producción y `.env.local` es local; nunca se pega una URL con contraseña en el chat; los
  scripts locales se niegan a correr contra una base remota.

---

## Limitaciones conocidas

Correo diario con `sent=0` hasta verificar el dominio en Resend; el defecto D1 (mensaje de «sin acceso» tarda ~11 s por
los reintentos de react-query); y el resto de pendientes de producto en `docs/pendientes-v7.md`.
