# T3 — Seguridad, higiene de entorno y seguridad de datos

**Repositorio:** `C:\Users\Adrian\Documents\MuttuHub-CRM` · **HEAD:** `e261296` · **Fecha:** 2026-10-13
**Alcance:** Next.js 16.3 App Router + Prisma 7 (`@prisma/adapter-pg`) + Supabase · 560 commits, 57 refs
**Modo:** sólo lectura, análisis estático. Ninguna conexión a base de datos, ningún servidor, ningún comando Prisma.
**Redacción:** sólo nombres de variables y rutas. Ningún valor de credencial aparece en este documento.

---

## 0. Método y límites de verificación

| Qué | Herramienta |
|---|---|
| Rastreados / ignorados | `git ls-files`, `git check-ignore -v`, `.gitignore` |
| Historia de secretos | `git log --all --diff-filter=A --name-only -- '*.env*'`; barrido de **contenido** de los 549 árboles únicos de los 560 commits en 57 refs con `git grep -I -l` y patrones que exigen valor real |
| Auditoría de scripts | lectura completa de los 33 archivos de `scripts/**` y 33 de `prisma/`; búsqueda de `new PrismaClient` / `new Pool` / `from "pg"` / `dotenv` / `env-file` |
| Authz | 123 `route.ts` clasificados por **llamada real** al helper (`Select-String -LiteralPath`; `-Path` trata `[id]` como comodín y da falsos negativos) |
| Alcance de lectura | lectura directa de cada `where` + comentarios de cabecera de cada ruta de lectura |
| RLS | `findstr /s /n /c:"ROW LEVEL SECURITY" prisma\migrations\*.sql` → 0 coincidencias (exit 1) sobre 29 migraciones |
| Cookies | lectura de los defaults de `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` |

**Límites:** (a) no se puede leer la configuración del proyecto Cloud (grants de `anon`, `enable_signup`, RLS del dashboard) desde el repo → los hallazgos que dependen de ella van marcados como condicionales con su verificación; (b) `git grep -I` **excluye blobs binarios**; (c) **`git log -S` (pickaxe) es inutilizable aquí**: falla con `fatal: unable to create temp-file: Permission denied` incluso sin coincidencias, por lo que **ninguna conclusión se apoya en `-S`**. El método alternativo se validó con control positivo (`new PrismaClient` → 1963 coincidencias) y negativo.

---

## 1. Auditoría de seguridad de datos — tabla de veredicto exhaustiva

Veredictos: **SAFE** = importa el guard (o no toca BD) y el guard corre antes de construir el cliente · **RISKY** = carga `.env.local` pero sin aserción, o depende de que el llamador recuerde el guard · **CAN-REACH-CLOUD** = carga `.env` (Cloud) o no tiene guard alguno · **N/A** = no resuelve `DATABASE_URL` ni construye cliente.

### 1.1 `prisma/**`

| # | Archivo | Línea que decide | Mecanismo | Veredicto |
|---|---|---|---|---|
| 1 | `prisma/seed.ts` | `:35` `import "./require-local-db";` (primer import) | `loadLocalEnv()` + `assertLocalDatabaseUrl()` **antes** de `:36 import { db }` | **SAFE** |
| 2 | `prisma/require-local-db.ts` | `:14-15` `loadLocalEnv(); assertLocalDatabaseUrl()` | Carga `.env.local`, exige loopback en `DATABASE_URL` **y** `DIRECT_URL` | **SAFE** (el guard) |
| 3 | `prisma/local-env.ts` | `:48-53` `isLocalTarget`; `:67-69` `loadLocalEnv`; `:75` `assertLocalDatabaseUrl` | `new URL()` + `Set` de loopback, fail-closed, sin bypass; nunca carga `.env` (`:10,61-62`) | **SAFE** (librería) |
| 4 | **`prisma.config.ts`** | **`:10` `loadLocalEnv();` — SIN `assertLocalDatabaseUrl()`** | `dotenv` no sobreescribe variables ya presentes (`prisma/local-env.ts:64-65` lo documenta); `:21` `DIRECT_URL ?? DATABASE_URL` | **RISKY** (entrada del CLI Prisma) |
| 5 | `prisma/*.invariant.test.ts` × 24 | `:7` / `:8` / `:11` / `:20` `import "./require-local-db"` como primer import | guard | **SAFE** |
| 6 | `prisma/proyecto-miembros-scope.invariant.test.ts` | `:58-59` `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` | Cliente tras el guard de `:19` | **SAFE** |
| 7 | `prisma/proyecto-miembros-routes.invariant.test.ts` | `:58-59` ídem | Guard en `:17` | **SAFE** |
| 8 | `prisma/proyecto-create-flow.invariant.test.ts` | `:62-63` ídem | Guard en `:15` | **SAFE** |
| 9 | `prisma/plantilla-import.invariant.test.ts` | `:78-79` ídem | Guard en `:28` | **SAFE** |
| 10 | `prisma/schema.prisma`, `prisma/migrations/*.sql` × 29 | — | Sin cliente | N/A |

### 1.2 `scripts/**` (incluye tests y `.bak`)

| # | Archivo | Línea que decide | Mecanismo | Veredicto |
|---|---|---|---|---|
| 11 | `scripts/backfill-document-text.ts` | `:13` `import "../prisma/require-local-db";` | guard; `:15 db`, `:29 $queryRaw` parametrizado, `:64,70,76` updates | **SAFE** |
| 12 | `scripts/cron_setup.sql` | `:32` `_secret text := '[CRON_SECRET]';` | Placeholder literal, sin credencial real; `:39` lo envía como header | **SAFE** (sustitución manual) |
| 13 | `scripts/import-plantilla-demo.ts` | `:21` `import "../prisma/require-local-db"` | guard; sólo `--apply` escribe (`:24`) | **SAFE** |
| 14 | `scripts/import-plantilla-demo.test.ts` | `:15` `vi.mock("../prisma/require-local-db", () => ({}))` | sin BD real | **SAFE** |
| 15 | **`scripts/offboard-camarabaq.ts`** | **`:16` `import "dotenv/config";`** | **Carga `.env` (Cloud). Sin guard. Sin script npm. `:17` construye `db` (`DATABASE_URL`); con `--apply` (`:23`) ejecuta `:69-80` 9 `updateMany` + `delete` de `usuarios`, y `:83-84` `auth.admin.deleteUser` con service-role** | **CAN-REACH-CLOUD** ⛔ |
| 16 | `scripts/reset-demo.ts` | `:25` `import "../prisma/require-local-db"` | guard; dry-run por defecto (`:305`), sólo `--apply` escribe (`:411`) | **SAFE** |
| 17 | `scripts/reset-demo.test.ts` | `:16` mock del guard | sin BD real | **SAFE** |
| 18 | `scripts/seed-projects-demo.ts` | `:36` guard + `:394` `assertLocalTarget(process.env.DATABASE_URL)` | doble guard (`:114-118`) | **SAFE** |
| 19 | `scripts/seed-projects-demo.test.ts` | `:13` `vi.mock("../prisma/require-local-db", () => ({}))` | sin BD real | **SAFE** |
| 20 | `scripts/seed-proyectos-demo.ts.bak` | `:37` `if (!process.env.DATABASE_URL) loadDotenv({ path: ".env.local" })`; `:65` `assertLocalTarget(process.env.DATABASE_URL)` (`:46-63`) | Guard propio correcto y fail-closed (`:47-49` sin URL → throw; `:52` `new URL()`; `:56-57` comparación de host). Bug: `host === "::1"` (`:56`) nunca matiza porque `URL.hostname` devuelve `[::1]` → **sobre-rechaza** (fail-closed, no bypass); no cubre `0.0.0.0` | **SAFE** (higiene: duplicado obsoleto, **borrar**) |
| 21 | `scripts/set-project-estado.ts` | `:17` `import "../prisma/require-local-db"` | guard; dry-run por defecto (`:76`) | **SAFE** |
| 22 | `scripts/set-project-estado.test.ts` | `:10` mock del guard | sin BD real | **SAFE** |
| 23 | `scripts/migrate-v2/_guard.ts` | `:14` `import "../../prisma/require-local-db"` + `:29-30` `loadLocalEnv(); assertLocalDatabaseUrl(GUARDED_VARS)` | Amplía el guard a `NEXT_PUBLIC_SUPABASE_URL` (`:24`) | **SAFE** (el guard del harness) |
| 24 | `scripts/migrate-v2/_guard.test.ts` + `__fixtures__/guard-probe.ts` | `guard-probe.ts:11` `import "../_guard"` | Prueba que aborta antes de importar el cliente | **SAFE** |
| 25 | `scripts/migrate-v2/_harness.ts` | `:17` `import { connectionTarget } from "../../prisma/local-env"`; `:322` sólo lee `DATABASE_URL` para la etiqueta del reporte | No importa `@/lib/db` (`:9-11`), no construye cliente; escribe reportes en `scripts/migrate-v2/out` | **SAFE** (librería) |
| 26 | `scripts/migrate-v2/_harness.test.ts` | `:254-255` asigna `process.env.DATABASE_URL` a mano | fake client, sin conexión | **SAFE** |
| 27 | `scripts/migrate-v2/bench-dashboard.ts` | `:7` `import "./_guard"` | guard | **SAFE** |
| 28 | `scripts/migrate-v2/bench-stats.ts` | sin imports de BD (percentiles puros) | — | **SAFE** |
| 29 | `scripts/migrate-v2/bench-stats.test.ts` | sin BD | — | **SAFE** |
| 30 | `scripts/migrate-v2/s1-rubros.ts` | `:15` `import "./_guard"` | guard | **SAFE** |
| 31 | `scripts/migrate-v2/s1-rubros.test.ts` | `:10` `vi.mock("./_guard", () => ({}))` | sin BD real | **SAFE** |
| 32 | `scripts/migrate-v2/s1-rubros-report.ts` | `:13` `import "./_guard"` | guard | **SAFE** |
| 33 | `scripts/migrate-v2/s1-rubros-report-plan.ts` | `:70` y `:76` `$queryRawUnsafe` con SQL **constante**, sin interpolar | Planificador puro, **no ejecutable**: lo importa `s1-rubros-report.ts` (`:3-4` lo declara) | **SAFE** |
| 34 | `scripts/migrate-v2/s1-rubros-report-plan.test.ts` | sin BD | — | **SAFE** |
| 35 | `scripts/migrate-v2/storage-orphans.ts` | `:11` `import { describeTarget } from "./_guard"` (dispara el efecto de guard) | guard | **SAFE** |
| 36 | `scripts/migrate-v2/out/*.json|*.md` | — | Reportes generados, ignorados (`.gitignore:71`) | N/A |
| 37 | `scripts/cleanup-seed-cloud.ts`, `DIAGNOSTICO-SEED-CLOUD.md` | **no existen en HEAD** (sí en `d468041`/`f835290`) | El script apuntaba a Cloud **a propósito** (limpieza quirúrgica, dry-run por defecto) | N/A (histórico) |

### 1.3 Archivos fuera de `scripts/` y `prisma/` que construyen cliente

| # | Archivo | Línea que decide | Mecanismo | Veredicto |
|---|---|---|---|---|
| 38 | `src/lib/db.ts` | `:15-17` `new PrismaPg({ connectionString: process.env.DATABASE_URL })` → `:18 new PrismaClient({ adapter })` | Lee `process.env` sin cargar archivo: **la seguridad es del importador** | **NEUTRAL** (guard por el llamador) |
| 39 | `src/lib/supabase/admin.ts` | `:10-12` `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` | Sólo servidor; no resuelve `DATABASE_URL` | N/A |
| 40 | `src/lib/supabase/client.ts` | `:6` `createClient()` con anon key | Cliente de navegador (clave pública por diseño) | N/A |

**No existe ningún otro `new PrismaClient`, `new Pool` ni `import ... from "pg"` en el repositorio** (fuera de los 5 tests de invariantes listados). `@prisma/adapter-pg` es el único constructor de pool.

### 1.4 El incidente documentado y la calidad del guard

`DIAGNOSTICO-SEED-CLOUD.md` no está en HEAD (recuperado de `d468041`): el seed demo (ids fijos `00000000-0000-4000-*`) corrió contra **Supabase Cloud** (`rxwtgvuijaketidnbtoh`) el **2026-09-17 14:37–14:38 UTC**; causa raíz `import "dotenv/config"` en `prisma/seed.ts` cargando `.env`. Contaminación: 12 clientes, 24 contactos, 10 oportunidades, 20 tareas, 14 subtareas, 9 comentarios, 2 adjuntos, 24 bitácora, 8 documentos, 9 versiones, 3 solicitudes, 8 accesos, 4 usuarios de `auth.users`, 11 objetos de storage, 52 notificaciones. Limpieza el 2026-09-22 con `npx tsx scripts/cleanup-seed-cloud.ts --apply`.

**El fix descrito incluía el override `SEED_ALLOW_NON_LOCAL=1`. Ese override YA NO EXISTE**: `grep SEED_ALLOW_NON_LOCAL` → 0 coincidencias en todo el repo.

**¿Se puede burlar el guard actual (`prisma/local-env.ts`)?**

| Vector | Resultado | Evidencia |
|---|---|---|
| `127.0.0.1.evil.com` | ✅ **rechazado** — el hostname completo es `127.0.0.1.evil.com` y `Set.has` es exacto | `:52` |
| `localhost.evil.com` | ✅ rechazado | `:52` |
| IPv6 `[::1]` | ✅ **aceptado correctamente** — `:51` quita corchetes (`replace(/^\[|\]$/g, "")`) antes de comparar con `::1` | `:19,51` |
| Mayúsculas (`LOCALHOST`) | ✅ normalizado | `:51` `.toLowerCase()` |
| Credenciales con `@` en el userinfo | ✅ el parser de URL aísla el hostname | `:30` |
| Cadena *pooled* (`...pooler.supabase.com`) | ✅ rechazada | `:52` |
| Valor ausente o no parseable | ✅ **fail-closed** | `:49-50`, `:81-84` |
| `DIRECT_URL` (no sólo `DATABASE_URL`) | ✅ también verificada | `:17` |
| Variable de entorno / flag / argumento de bypass | ✅ **no existe**: `:72-74` lo declara | `:72-74` |
| `dotenv` no sobreescribe un `DATABASE_URL` ya exportado | ✅ **neutralizado**: no se confía en el valor cargado, se **afirma** loopback → un export de Cloud aborta el script | `:75-102` |
| Contraseña en el mensaje de error | ✅ redactada | `:56-58` |

**Veredicto: el guard es sólido, no se encontró ningún bypass.** Los dos problemas son de **cobertura**, no de calidad: (a) sólo protege a quien lo importa; (b) `prisma.config.ts:10` carga sin afirmar.

### 1.5 `package.json` — qué scripts quedan sin protección

| Script | Definición | Veredicto |
|---|---|---|
| `db:generate:local` | `:15` `node --env-file=.env.local … prisma generate` | **SAFE** |
| `db:migrate:local` | `:16` `--env-file=.env.local … migrate dev` | **SAFE** |
| `db:migrate:status:local` | `:17` | **SAFE** |
| `db:migrate:reset:local` | `:18` (destructivo) | **SAFE** (forzado local) |
| `db:push:local` | `:19` | **SAFE** |
| `db:seed:local` | `:20` `--env-file=.env.local … db seed` → `prisma.config.ts:16` `tsx prisma/seed.ts` → guard `seed.ts:35` | **SAFE** (doble) |
| `db:demo:reset:local` | `:21` `tsx scripts/reset-demo.ts` | **SAFE** (guard interno) |
| `db:demo:seed-projects:local` | `:22` `tsx scripts/seed-projects-demo.ts` | **SAFE** (guard interno) |
| `docs:backfill` | `:23` `tsx scripts/backfill-document-text.ts` | **SAFE** (guard interno) |
| **`db:generate`** | `:10` `prisma generate` | **RISKY** (resuelve por `prisma.config.ts` sin aserción) |
| **`db:migrate`** | `:11` `prisma migrate dev` | **RISKY** — aplica/reinicia migraciones; sin aserción |
| **`db:studio`** | `:12` `prisma studio` | **RISKY** — GUI de escritura sobre el host resuelto |
| **`db:push`** | `:13` `prisma db push` | **RISKY** — altera el esquema sin migración registrada |
| **`db:seed`** | `:14` `prisma db seed` | **RISKY en el arranque**, salvado por `prisma/seed.ts:35` antes de la primera escritura |
| `test` / `test:watch` / `test:coverage` | `:24-26` | **SAFE** — los `*.invariant.test.ts` importan `require-local-db` |

**Brecha:** los cinco `db:*` sin sufijo (`package.json:10-14`) dependen sólo de `prisma.config.ts:10`, que carga `.env.local` **sin verificar el destino**. Como `dotenv` no sobreescribe (`prisma/local-env.ts:64-65`), un `DATABASE_URL`/`DIRECT_URL` presente en el shell, en CI o en Vercel gana silenciosamente. **Remediación de una línea:** `assertLocalDatabaseUrl()` después de `loadLocalEnv()` en `prisma.config.ts`.

### 1.6 Veredicto de seguridad de datos

> **¿Se puede todavía escribir en Cloud? Sí, desde un único archivo: `scripts/offboard-camarabaq.ts` (línea 16), con `--apply` (líneas 23, 69-84).**
> Vía indirecta: `db:migrate`, `db:push`, `db:studio`, `db:seed`, `db:generate` si el entorno ya trae `DATABASE_URL`/`DIRECT_URL` de Cloud (`prisma.config.ts:10` no verifica). El seed está protegido por `prisma/seed.ts:35`.
> Los otros 34 archivos de datos/scripts y 24 tests de invariantes importan el guard antes de construir el cliente.

---

## 2. Secretos e historia de git

### 2.1 Rastreado vs. ignorado

| Archivo | Estado | Evidencia |
|---|---|---|
| `.env.example` | **Rastreado**, sólo placeholders | `git ls-files`; `.env.example:2,5-24` |
| `.env` | **NO rastreado**, ignorado | `git check-ignore -v .env` → `.gitignore:40:.env*` |
| `.env.local` | **NO rastreado**, ignorado | `git check-ignore -v .env.local` → `.gitignore:40:.env*` |
| `.env.felipe` | **NO rastreado**, ignorado | `git check-ignore -v .env.felipe` → `.gitignore:40:.env*` |
| `*.pem` | ignorado | `.gitignore:31` |

```
.gitignore:39-41
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

Conjuntos locales **correctamente ignorados**: `supabase/.gitignore:2-3` ignora `.branches` y `.temp`; en disco existen `supabase/.temp/start-secrets/**` pero `git ls-files supabase` sólo devuelve `supabase/.gitignore`, `supabase/config.toml` y las 6 plantillas de email. `testsprite_tests/tmp/*` está ignorado (`.gitignore:62`) salvo `test_results.json` (`.gitignore:63`), que sí se rastrea y quedó cubierto por el barrido de §2.2 sin hallazgos.

### 2.2 Archivos presentes en disco y NO en git (nombres de variable y presencia, sin valores)

| Archivo | Variables presentes | Nota |
|---|---|---|
| `.env` | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — **todas con valor no vacío** | Apunta al proyecto **Cloud** (compartido/producción); la anon key tiene forma de JWT real |
| `.env.local` | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Docker local (`127.0.0.1:54322`) |
| `.env.felipe` | `VERCEL_OIDC_TOKEN` (valor presente, ~1.2 KB) | **La única credencial con forma real fuera de git**; ignorada, pero en claro en el working tree → rotar/mover a gestor de secretos |
| `supabase/.temp/start-secrets/**` | secretos del stack local | ignorado |

`ENABLE_DEV_ROUTES` **no está definida** en ninguno de los cuatro archivos (relevante para §6.1).

### 2.3 ¿Existe algún VALOR de credencial real en la historia de git? **NO**

1. `git log --all --diff-filter=A --name-only -- '*.env*'` → **un solo commit**, `e6d9f15`, y **un solo archivo**: `.env.example`. Ningún `.env`, `.env.local` ni `.env.felipe` fue añadido jamás en 560 commits / 57 refs.
2. Barrido de **contenido** de los 549 árboles únicos (`git log --all --pretty=format:%T | Sort-Object -Unique`) con patrones que exigen valor real:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   BEGIN [A-Z ]*PRIVATE KEY
postgresql://[^:@/ ]+:[^@/ ]+@         sk-ant-api
re_[A-Za-z0-9]{24,}                    whsec_
SUPABASE_SERVICE_ROLE_KEY=[A-Za-z0-9]  NEXTAUTH_SECRET=.
CRON_SECRET=.                           ANTHROPIC_API_KEY=sk
```
Resultado: **1 ruta única → `.env.example`**, y sólo por sus marcadores (`[PASSWORD]` en `:2`, `CRON_SECRET=  # …` en `:24`). Cero JWT, cero PEM, cero `service_role` con valor, cero clave de Resend/Anthropic.
3. Los commits que tocan la *variable* `SUPABASE_SERVICE_ROLE_KEY` (`7a5e29f`, `d468041`, `f835290`) lo hacen en código/docs, no en un archivo de entorno — verificado leyendo su contenido.

Archivos rastreados que contienen sólo **nombres** de variables: `src/lib/supabase/admin.ts:12`, `src/app/api/v1/auth/reinvite/route.ts:74`, `src/app/api/v1/dev/reset-token/route.ts:47`, `src/app/api/v1/dev/invite-token/route.ts:40`, `prisma/seed.ts:28`, `.env.example:5-6,9,13,17,24`.

### 2.4 Exposición secundaria (no credencial)

`HANDOFF-contexto-sesion.md:9,60` y el doc histórico `DIAGNOSTICO-SEED-CLOUD.md` nombran el **project ref** `rxwtgvuijaketidnbtoh` y su región. No es credencial (el ref es público por diseño en Supabase), pero facilita el direccionamiento una vez obtenida la anon key. Sensibilidad: informativa.

---

## 3. RLS: **confirmado que no protege nada** (y por qué)

**(a) Este repositorio no habilita RLS en ninguna tabla.** `findstr /s /n /c:"ROW LEVEL SECURITY" prisma\migrations\*.sql` → **0 coincidencias** (exit 1) sobre 29 migraciones; tampoco existe ningún `POLICY`. Todas las tablas de negocio se crearon vía migraciones Prisma en el esquema `public`.

**(b) La app se conecta como el propietario ⇒ RLS no aplicaría aunque se habilitara.** Confirmado en `src/lib/db.ts:15-18`:
```
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
return new PrismaClient({ adapter });
```
`@prisma/adapter-pg` abre las conexiones con las credenciales de la cadena; `.env.example:2` muestra el usuario `postgres`, propietario de las tablas de `public`. En PostgreSQL **el propietario omite RLS** salvo `ALTER TABLE … FORCE ROW LEVEL SECURITY` (que tampoco existe). Conclusión: **RLS no aplica al tráfico de la aplicación** — ni hoy, ni si se habilitara sin `FORCE`. No es un defecto del adapter: es la consecuencia de usar una cadena de propietario.

**(c) La implicación que sí importa está FUERA de la app.** La anon key es **pública** por diseño (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, usada en `src/lib/supabase/client.ts:6`) y `supabase/config.toml:13` declara `schemas = ["public", "graphql_public"]`, es decir PostgREST expone `public`. Con RLS deshabilitada y **si** el proyecto Cloud conserva los privilegios por defecto de Supabase para `anon`/`authenticated`, `https://<ref>.supabase.co/rest/v1/<tabla>` devolvería filas **sin pasar por ninguna ruta de la app, sin sesión y sin ninguno de los predicados de `src/lib/permissions.ts`**. `supabase/config.toml:176` trae además `enable_signup = true` en local: si Cloud también lo permite, cualquiera puede crearse un usuario `authenticated`.

**Verificación pendiente (1 petición; no se ejecutó: el entorno es de sólo lectura y no se hacen llamadas contra BD/servicios):**
```bash
curl -s -H "apikey: $ANON" "https://<ref>.supabase.co/rest/v1/clientes?select=id&limit=1"
```
`[]` o `401/403` ⇒ endurecido. Un array con datos ⇒ **CRÍTICO**.
**Remediación:** habilitar RLS con políticas denegatorias por defecto, o `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` + `ALTER DEFAULT PRIVILEGES … REVOKE` en Cloud. **Severidad ALTA/CRÍTICA, condicional a la configuración del proyecto.**

**(d) Service-role key:** nunca desde el cliente. Sólo en módulos de servidor, con la advertencia explícita en `src/lib/supabase/admin.ts:1-3` ("a client component leaks the SUPABASE_SERVICE_ROLE_KEY — never do it"), usada en `auth/change-password/route.ts:24,61-82`, `users/route.ts:112-127`, `reinvite/route.ts:74-92`, `dev/*`. Un test lo vigila: `uploads/sign/route.test.ts:217` exige que la respuesta no contenga la clave.

---

## 4. Autorización — hallazgos por severidad

### 4.1 Helpers

| Helper | Ubicación | Comportamiento |
|---|---|---|
| `getSessionUser` | `src/lib/supabase/server.ts:59` | `supabase.auth.getUser()` (valida el JWT, no confía en la cookie) + `db.usuario.findUnique` (`:71`) |
| `requireUser` / `requireRole` | `:84` / `:96` | Gates de **página** (redirect) |
| `requireApiUser` | `:117` | Gate de API: 401 / 500 |
| `requireApiRole` | `:154` | `requireApiUser` + `rol` ⇒ 403 |
| Predicados puros | `src/lib/permissions.ts` | `canManageAny:18`, `canEditClient:28`, `canEditTask:36`, `hasCommercialAccess:52`, `canManageProject:113`, `canExecuteProject:129`, `canViewProjectV2:139`, `canViewFinancialSupports:153`, `canValidateExpense:163`, `canViewPortfolio:185` |
| Carga con scope | `crm.ts:31 loadClientScoped`, `:47 getClientForWrite`, `:63 loadTaskScoped`; `projects.ts:184 loadProjectScoped`, `:162 canReadProject` | El scope se resuelve en la consulta |

### 4.2 Cobertura: 113 de 123 `route.ts`

| | Nº | Rutas |
|---|---|---|
| Llaman a `requireApiUser` / `requireApiRole` / `getSessionUser` | **113** | toda la superficie de negocio, incluidas las ~90 con `[id]` |
| **No** llaman a ningún helper | **10** | `auth/login`, `auth/logout`, `auth/reset-password`, `auth/reset-password/confirm`, `auth/reinvite`, `auth/solicitud-acceso`, `dev/invite-token`, `dev/reset-token`, `openapi`, `api/cron/daily` |

Las 10 son intencionalmente públicas o con autenticación propia, verificadas una por una: `api/cron/daily` (fuera de `v1`) se autentica con el header `x-cron-secret` contra `CRON_SECRET` (`src/app/api/cron/daily/route.ts:44-46`); `auth/login:40`, `reset-password:35`, `reset-password/confirm:52-84`, `solicitud-acceso`, `reinvite:72-97` son flujos previos a la sesión; `dev/*` tienen doble puerta (§6.1); `openapi` es la spec (§4.6). **No hay rutas de negocio sin guard.**

### 4.3 Escalada de privilegios: sin hallazgos

- `users/route.ts:42,57` `requireApiRole(["ADMINISTRADOR"])`; `:87` valida `rol in ROLE_LABELS` antes de usarlo.
- El esquema del PATCH de proyecto (`projects/[id]/route.ts:57-127`) **no** acepta `rol`, `gestiona_oportunidades` ni `puede_ver_tablero_gerencial`.
- `es_miembro` se resuelve **desde la base** en la misma consulta (`projects.ts:196-208`) y el tipo lo exige (`projects.ts:145-150`); `projects.ts:171-183` documenta que un flag del request nunca se confía.
- Flags comerciales/gerenciales leídos de la fila `Usuario` (`permissions.ts:82`, `projects.ts:145-155`).
- Deuda declarada: `src/lib/supabase/server.ts:149-151` reconoce que los permisos granulares por módulo (PRD §3.3.2) quedaron **fuera del alcance v1** (sólo gates por rol completo).

### 4.4 IDOR

| Familia | Resolución | Veredicto |
|---|---|---|
| `projects/[id]/**` (~60 rutas) | `loadProjectScoped` + `canReadProject` / `canManageProject` / `canExecuteProject` (`projects/[id]/route.ts:141,148`; `projects/[id]/kpis/route.ts:34-36`; `projects/[id]/export/route.ts:45-47`) | **OK** (404 antes de 403; membresía desde BD) |
| `tasks/[id]/**` | `loadTaskScoped` (`tasks/[id]/route.ts:58`, `comments/route.ts:42`, `subtasks/route.ts:38`, `attachments/route.ts:232`) + `getTaskForWrite` | **OK** |
| `clients/[id]/contacts`, `clients/[id]/log` | `loadClientScoped` (`contacts/route.ts:81`, `log/route.ts:52`) | **OK** (pero ver §4.5) |
| `notifications/[id]/read` | `findFirst({ where: { id, usuario_id: auth.usuario.id } })` (`:28`, `:53`) ⇒ 404 para filas ajenas | **OK** |
| `documents/[id]/**`, `folders/[id]`, `rubros/[id]`, `strategic-lines/[id]`, `municipalities/[id]`, `users/[id]` | helper o `requireApiRole` de admin | **OK** en lo muestreado |
| `uploads/sign` (nueva **versión** de documento) | `loadDocumentForRead` (`:146`) — gate de **lectura** para una **escritura** | ⚠️ **BAJO-MEDIO**: quien puede leer un documento puede añadirle una versión (`:156`) |

No se encontró ningún `findUnique({ where: { id } })` sin scope sobre una entidad de negocio. **La escalada por rol enviado por el cliente no existe; el IDOR clásico tampoco.**

### 4.5 Mapa exacto de alcance de lectura (corregido tras verificación cruzada)

**Corrección:** `src/app/api/v1/clients/[id]/route.ts:8` dice literalmente *"PR 3 (close-phase-1): the GET read scope is now GLOBAL — every role can read any client by id"*, y el handler lo confirma en `:79-83` con `findFirst({ where: { id, deleted_at: null } })` — **sin filtro de `responsable_id`**. Una afirmación anterior (detalle scoped) era falsa; el Lead lo verificó leyendo el archivo. **El CRM es global de forma uniforme en lista y detalle.**

| Recurso | Alcance real | Evidencia |
|---|---|---|
| Clientes — **lista** | **GLOBAL** | `clients/route.ts:73-76` (comentario "Reads are global (PR 3)") + `:90` `{ deleted_at: null }` |
| Clientes — **detalle** | **GLOBAL** | `clients/[id]/route.ts:8-10` (comentario) + `:79-83` (`findFirst` sin scope) |
| Clientes — **export xlsx** | **GLOBAL** | reusa `buildClientWhere` (`clients/export/route.ts`) |
| Cliente — **contactos (sub-recurso)** | **SCOPED por `responsable_id`** | `clients/[id]/contacts/route.ts:81` → `crm.ts:31-40` |
| Cliente — **bitácora (sub-recurso)** | **SCOPED por `responsable_id`** | `clients/[id]/log/route.ts:52` → `crm.ts:31-40` |
| Contactos — **feed** | **GLOBAL** (sin filtro de scope) | `contacts/route.ts:95-104` + `buildContactWhere` `:60-64` |
| Interacciones — **feed** | **GLOBAL** | `interactions/route.ts:47-54`; comentario `:6-8` "every signed-in role sees every client's interactions" |
| Tareas — **lista/export/reporte** | **GLOBAL** | `tasks/route.ts:126` ("No per-role scope: reading tasks is global") + `:138-141` |
| Tareas — **detalle** | **SCOPED por `responsable_id`** | `tasks/[id]/route.ts:58` → `crm.ts:63-70` |
| Tarea — **comentarios/subtareas/adjuntos** | **SCOPED** | `tasks/[id]/comments/route.ts:42`, `subtasks/route.ts:38`, `attachments/route.ts:232` |
| Documentos — **lista/búsqueda/zip** | **GLOBAL + puerta de confidencialidad** (único control por rol a nivel de fila) | `documents.ts:306-319`: `notIn: restringidas` salvo `canReadRestrictedDocs` |
| Proyectos — **portafolio/detalle/subrecursos** | **SCOPED por rol + flag gerencial + membresía** | `permissions.ts:139-145,185`; `projects.ts:184-210` |

**Hallazgo 3 (reescrito) — severidad MEDIA.**
El CRM es **global por diseño y de forma uniforme** en lista y detalle de clientes, en feed de contactos, en feed de interacciones y en lista de tareas (documentado como decisión "PR 3" en `clients/route.ts:73-76` y `tasks/route.ts:126`). Por tanto **no es una fuga que contradiga el diseño**, sino:

1. **Política (riesgo principal):** un COLABORADOR lee **todo** el CRM — nombres/empresas y campos sensibles de todos los clientes (`riesgos_barreras`, `resumen_relacion` vía `crm.ts:28 CLIENT_FULL_SELECT`), todos los contactos con su cuadrante poder/interés, y **todo el texto de la bitácora incluido `proximo_paso`** (`interactions/route.ts:29-41`), sin paginación (`:73` `orderBy` sin `take`). Es una decisión deliberada de máximo privilegio de lectura sin control compensatorio.
2. **Defecto real de consistencia (el que justifica la severidad):** el **mismo registro** es alcanzable en unos caminos y bloqueado en otros, sin lógica que lo explique:
   - `GET /api/v1/clients/:id` → **200 global** (`clients/[id]/route.ts:79-83`), pero `GET /api/v1/clients/:id/contacts` y `.../log` → **404** para un COLABORADOR no responsable (`clients/[id]/contacts/route.ts:81`, `clients/[id]/log/route.ts:52`), **aunque el mismo contenido está disponible globalmente** en `/contacts` (`contacts/route.ts:95-104`) e `/interactions` (`interactions/route.ts:47-54`).
   - `GET /api/v1/tasks` → **200 global** (`tasks/route.ts:126`), pero `GET /api/v1/tasks/:id` → **404** para el mismo COLABORADOR (`tasks/[id]/route.ts:58`).
3. **Documentación obsoleta:** `crm.ts:5-8` ("COLABORADOR: reads only clients/tasks where they are the responsable") y `crm.ts:26-30` (`loadClientScoped` "inside the caller's scope") describen el modelo **anterior** a PR 3; hoy el detalle de cliente y la lista de tareas son globales. Comentario desactualizado en el archivo que define el modelo de permisos.
4. **Escritura sí está scoped**, así que no hay escalada de escritura: PATCH/DELETE de cliente usan `canEditClient`/`canManageAny` (`clients/[id]/route.ts:9-10,109`), y el detalle devuelve `puede_editar` server-authoritative (`:109`).

**Recomendación:** (a) decidir explícitamente el eje de lectura y aplicarlo a los **sub-recursos** (que hoy aplican `loadClientScoped`/`loadTaskScoped`) para eliminar el 404 incoherente; (b) si la lectura global es requisito funcional, excluir `texto`/`proximo_paso` de la bitácora para COLABORADOR, paginar `/interactions` y `/contacts`, y corregir `crm.ts:5-8,26-30`; (c) revisar `clients/route.ts:106`, que busca dentro de `bitacora.texto` (la búsqueda también revela contenido de interacciones).

### 4.6 Otros

- `/api/openapi` es **público** (`openapi/route.ts:12-13`) mientras la página que lo consume es ADMIN (`api-docs/page.tsx:18`) → inventario completo de endpoints/parámetros sin sesión. **BAJO** (el comentario `:2-5` lo justifica).

---

## 5. Validación de entrada, inyección, subidas y descargas

### 5.1 Zod

| Cobertura | Nº | Mecanismo |
|---|---|---|
| Zod **inline** en la ruta | **25** | `safeParse`/`z.object`, p. ej. `clients/route.ts:64-71`, `projects/route.ts:136`, `projects/[id]/route.ts:57-127`, `documents/zip/route.ts:34-39` |
| Zod vía helper compartido | **22** | `parseEstructuraBody(request, OBJETIVO_CREATE_SCHEMA)` (`projects/[id]/objectives/route.ts:78`) y equivalentes en budget, programming, activities, deliverables, indicators, measurements, expenses, beneficiaries |
| `parseJsonBody` + comprobaciones explícitas | resto | p. ej. `uploads/sign/route.ts:72-127` (tipo por campo, `Number.isInteger`, límites), `auth/*` |

**Ninguna ruta mutante escribe un cuerpo sin validar**; los cuerpos `parseJsonBody<unknown>` siempre pasan por `SCHEMA.safeParse` después (`documents/zip/route.ts:62-67`). Query params con helpers dedicados (`contacts/route.ts:68-93`).

### 5.2 SQL crudo: **sin inyección**

Todos los `$queryRaw`/`$executeRaw` de `src/**` son **tagged templates parametrizados**, nunca concatenación:

| Archivo:línea | Nota |
|---|---|
| `src/lib/api/documents.ts:371`, `:419` | `Prisma.sql` con `${q}`; lista `IN` vía `Prisma.join(restringidas)` (`:368`) — parametrizada |
| `src/lib/api/modificaciones.ts:459` | `FOR UPDATE` con `${input.proyectoId}` |
| `src/lib/api/presupuesto.ts:85`, `:112` | parametrizados |
| `src/lib/api/project-code.ts:49` | parametrizado |
| `src/lib/api/validacion-gastos.ts:64`, `:69`, `:73` | parametrizados |
| `src/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route.ts:130` | `FOR UPDATE` parametrizado |

El **único** `$queryRawUnsafe` del repo está en `scripts/migrate-v2/s1-rubros-report-plan.ts:70,76` con **SQL constante y sin interpolar entrada**. No existe ningún `$executeRawUnsafe`.

### 5.3 Subidas (`uploads/sign`)

- **La clave la elige el servidor, nunca el cliente**: `:144` (tarea), `:156` (nueva versión), `:187` (documento nuevo); declarado en `:8,12`.
- **Allowlist de extensión + MIME** antes de emitir la URL: `:122` → `files.ts:105-109` contra `ALLOWED_FILE_EXTENSIONS` (`files.ts:43`).
- **Límite de tamaño**: `:125-127` contra `MAX_FILE_BYTES` (`files.ts:35`; 25 MB, `files.ts:15,30`).
- **Autorización del destino antes de firmar**: `:136` `getTaskForWrite`, `:146` `loadDocumentForRead`, `:169` `guardDocumentCreate`; el comentario `:163-168` explica que las puertas de creación corren antes de emitir la URL para no dejar objetos huérfanos.
- **Anti path-traversal**: `sanitizeFileName` (`files.ts:72`) en las tres convenciones (`signed-upload.ts:38,51`; `files.ts:154`), y `assertKeyBelongsToTarget` (`signed-upload.ts:65-77`) que compara **segmento a segmento** (no `startsWith`) y rechaza `""`, `"."`, `".."` y rutas absolutas (`:69-76`), cubriendo explícitamente `tareas/{id}evil/…`.
- `:194-197` devuelve 500 sin filtrar credenciales ni URL pública.

**Residual:** el gate de lectura para firmar una versión nueva (§4.4).

### 5.4 Descargas y export ZIP

| Control | Evidencia | Veredicto |
|---|---|---|
| URL firmada de **60 s** | `documents/[id]/download/route.ts:50`; `documents/zip/route.ts:110` | ✅ |
| 302 al signed URL, sin pasar bytes por la función | `documents/[id]/download/route.ts:55` | ✅ |
| Categoría restringida **antes** de firmar | `documents/[id]/download/route.ts:27-28`; `zip/route.ts:80-84` | ✅ |
| La ruta no acepta rutas del cliente (`storage_path` sale de la fila) | `documents/[id]/download/route.ts:38-42` | ✅ sin traversal |
| Scope de categorías sí aplica en la búsqueda SQL | `documents.ts:365-369`; camino `filters.q` en `documents/route.ts:429` | ✅ |
| Nombres dentro del ZIP saneados | `zip/route.ts:42-44` | ✅ sin zip-slip |
| **Sin tope agregado de bytes** | `zip/route.ts:32,38` (50 docs) × 25 MB ⇒ hasta ~1.25 GB en memoria (`:115-120`) | ⚠️ **MEDIO-BAJO (DoS)** |
| `fetch(signedUrl, { redirect: "follow" })` | `zip/route.ts:113` | Sin SSRF (URL generada por el servidor) |

**Rutas de impresión:** no hay ninguna bajo `src/app/api`; `/print/*` son páginas HTML SSR con el gate de sesión de `src/proxy.ts:69` y sin endpoint de datos propio.

---

## 6. Flujos de autenticación

### 6.1 Endpoints de desarrollo — **bien cerrados**

| Endpoint | Puerta | Evidencia |
|---|---|---|
| `dev/reset-token` | `NODE_ENV === "production"` → 404 **Y** `ENABLE_DEV_ROUTES !== "true"` → 404 (deben pasar ambas) | `dev/reset-token/route.ts:24-29` |
| `dev/invite-token` | Idéntica | `dev/invite-token/route.ts:17-22` |

`ENABLE_DEV_ROUTES` **no está definida en `.env`, `.env.local`, `.env.example` ni `.env.felipe`** ⇒ apagados por defecto. El comentario `reset-token/route.ts:6-14` reconoce que `NODE_ENV` por sí solo no basta y exige un opt-in separado. **Correcto.**
**Residual MEDIO (condicional):** `dev/reset-token/route.ts:118-123` devuelve `accessToken` **y** `refreshToken` de **cualquier cuenta**, sin auth propia y **sin rate limiting**; si el flag se activa en un despliegue alcanzable (preview de Vercel, túnel) es **toma de cuenta total**. Restringir a `NODE_ENV === "development"` + loopback, o excluir del bundle.

### 6.2 Tokens en URLs

| Hallazgo | Evidencia | Severidad |
|---|---|---|
| La página de confirmación acepta `access_token`/`refresh_token` por **query o hash** | `auth/confirm/page.tsx:145-150,188-192` | MEDIO-BAJO |
| Los limpia con `history.replaceState` **después** de usarlos | `:194-204` | Mitigación parcial: ya pasaron por historial/`Referer`/logs |
| `reset-password/confirm` acepta `accessToken` + `refreshToken` en el **cuerpo** y con ellos cambia la contraseña | `reset-password/confirm/route.ts:66-84` | BAJO-MEDIO: sirve con cualquier sesión (no exige que sea de recuperación) y sin rate limit; al menos no van en la URL |
| El enlace de invitación se devuelve en el **cuerpo** | `users/route.ts:173` | BAJO (sólo ADMIN) |

### 6.3 Rate limiting / bloqueo

| Endpoint | Protección | Evidencia |
|---|---|---|
| `auth/login` | **NINGUNA** en la app (sólo los límites de GoTrue) | `auth/login/route.ts:40-48` |
| `auth/reset-password` | **NINGUNA** | `reset-password/route.ts:35` |
| `auth/reset-password/confirm` | **NINGUNA** | `confirm/route.ts` |
| `auth/reinvite` | Map en memoria, 3/hora/email | `reinvite/route.ts:19-43,56-62` |
| `auth/solicitud-acceso` | Map en memoria, 3/hora/email | `solicitud-acceso/route.ts:28-58,91-97` |
| `dev/reset-token` | **NINGUNA** | `reset-token/route.ts` |

Los propios comentarios lo admiten: `solicitud-acceso/route.ts:9-12` — *"no está compartido entre instancias serverless y se reinicia en cada cold start; sólo eleva el listón"*. **MEDIO** en `login` (credential stuffing) y `reset-password` (spam/token bombing).

### 6.4 Enumeración de cuentas

| Ruta | Comportamiento | Veredicto |
|---|---|---|
| `auth/login:46-47` | Mensaje idéntico ante credenciales erróneas | ✅ no enumera |
| `auth/reinvite:99-103` | Mensaje genérico siempre | ✅ |
| `auth/reset-password:49-52` | Mensaje genérico | ✅ |
| **`auth/solicitud-acceso:107-117`** | **409 "Este correo ya tiene acceso al Hub. Inicia sesión."** | ⚠️ **BAJO-MEDIO: enumera cuentas** |

### 6.5 Redirecciones abiertas — **2 vectores** (el primero **verificado por el Lead**)

**(a) `?next=` sin validar (MEDIO, confirmado).**
```
src/proxy.ts:72                          url.searchParams.set("next", pathname + search);
src/app/(auth)/login/page.tsx:37         const next = searchParams.get("next") ?? "/";
src/components/auth/acceso-page.tsx:189  router.push(next);
```
`next` llega del atacante y se usa **sin validación**: `grep` de `startsWith("/")` / `isSafeRedirect` / `new URL(next` en todo `src/` → **0 coincidencias**. Con `https://<app>/login?next=https://sitio-malicioso.tld`, tras el login el navegador sale al sitio del atacante. **Remediación:** aceptar sólo rutas relativas (`startsWith("/") && !startsWith("//")`), en `proxy.ts` y como defensa en profundidad en `acceso-page.tsx:189`.

**(b) `Origin` reflejado en el `redirectTo` del correo de recuperación (MEDIO-BAJO).** `auth/reset-password/route.ts:33`:
```
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? "http://localhost:3000";
… redirectTo: `${appUrl}/auth/reset-password/confirm?next=/login`
```
Sin `NEXT_PUBLIC_APP_URL`, la cabecera `Origin` (del atacante) fija el origen del enlace ⇒ *host header injection*. `.env.example:10` la define (mitiga en producción), pero el fallback es frágil: eliminar el fallback y fallar si falta la variable.

### 6.6 Cookies de sesión

La app **nunca** fija `httpOnly`/`secure`/`sameSite`: delega en `@supabase/ssr` (`src/lib/supabase/server.ts:33-42`, `src/proxy.ts:50-58`). Defaults de la librería (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`):
```
{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 60 * 60 }
```
- **`httpOnly: false` ⇒ el JWT de sesión es legible por JavaScript**: cualquier XSS se convierte en robo de sesión. Es *en parte* inevitable (`src/lib/supabase/client.ts:6` debe leer la sesión), pero debe asumirse y compensarse con CSP estricta.
- **No se establece `secure`** ⇒ la cookie puede viajar por HTTP si el sitio es alcanzable por HTTP (secuestro por downgrade). Fijar `secure: true` explícitamente.
- **`sameSite: "lax"`** ⇒ mitiga CSRF en POST/PATCH/DELETE cross-site; todas las mutaciones son POST/PATCH (verificado). Aceptable.
- **`maxAge` 400 días** frente a la sesión documentada de 4 h (`src/lib/auth/types.ts:19-22`): el límite real lo pone la expiración del JWT en Supabase (14400 s, `supabase/server.ts:2-3`); conviene que el `maxAge` no exceda el del token.

### 6.7 Otros

- **IP de auditoría desde cabecera no confiable:** `auth/login/route.ts:83` y `auth/callback/route.ts:90` guardan `x-forwarded-for` tal cual en `accesos.ip` ⇒ bitácora de accesos falsificable. **BAJO.**
- **`/auth/callback`** (`auth/callback/route.ts`) cubre los cuatro casos (registrado / inactivo `:74-83` / sin cuenta → `solicitud_acceso` `:100-134` / error) y cierra la sesión del solicitante (`:139`). Sin hallazgos.
- **`auth/change-password`** (`:63-77`) reautentica con la contraseña actual usando el cliente de service-role sin persistir sesión (decisión documentada en `:10-19`). Sin hallazgos.

---

## 7. Nota de dependencias

| Dependencia | Versión (`package.json`) | Superficie y riesgo |
|---|---|---|
| `swagger-ui-react` | `:50` `^5.32.13` | Renderiza el spec en `/api-docs`, tras `requireRole(["ADMINISTRADOR"])` (`api-docs/page.tsx:18`) y con documento **local** (`api-docs-viewer.tsx:11` → `/api/openapi`), sin `$ref` remotos. Las vulnerabilidades históricas de XSS en la renderización quedan acotadas por el gate. `@types/swagger-ui-react` es dev (`:66`). Nota: la página queda visible en "modo no configurado" (`api-docs/page.tsx:20-22`), situación que no se da en producción |
| `unpdf` | `:53` `^1.8.1` | **Mayor superficie**: parsea PDFs **subidos por el usuario** en el servidor (`src/lib/api/extract-text.ts`, consumido por `backfill-document-text.ts:61` y el índice de búsqueda). No hay timeout ni presupuesto de CPU/memoria (sólo el tope de 25 MB, `files.ts:35`) ⇒ un PDF malicioso puede agotar la función. Añadir timeout |
| `exceljs` | `:41` `^4.4.0` | Parsea la plantilla XLSX del usuario (`projects/[id]/import/route.ts`). Un XLSX es un ZIP: **bomba de descompresión**; `IMPORT_MAX_BYTES` acota lo comprimido, no lo expandido. MEDIO. Tope de celdas/ratio |
| `jszip` | `:42` `^3.10.1` | Sólo **construye** el ZIP (`documents/zip/route.ts:11`); sin zip-slip (nombres generados y saneados, `:42-44`). El riesgo es el consumo de memoria agregado (§5.4) |
| `@prisma/adapter-pg` + `pg` | `:34` `^7.9.1`, `:45` `^8.22.0` | Construye el pool desde `DATABASE_URL` (`src/lib/db.ts:15`) con credenciales de **propietario** ⇒ RLS inaplicable (§3). Es el vector de mayor impacto de esta lista |
| `next` / `react` / `react-dom` | `:44,46,47` exactas (`16.3.0`, `19.2.8`) | Fijadas sin rango: sin "pin accidental" preocupante, pero tampoco parches automáticos |
| `dotenv` | `:69` (devDependency) | Se importa en **tiempo de ejecución** por `prisma/local-env.ts:12` y por los scripts `tsx`/CLI. Funciona hoy, pero si un script se empaqueta para el runtime de producción faltará el módulo. **BAJO / higiene** |
| Sin uso / muerta | — | No hay `next-auth` pese a `NEXTAUTH_SECRET` en `.env.example:9` (la auth es Supabase) — variable muerta a eliminar. No hay `dangerouslySetInnerHTML` en el camino de búsqueda: `documents.ts:409-412` documenta que `ts_headline` se parte y se pinta con `<mark>` |

---

## 8. Hallazgos priorizados

| # | Sev. | Hallazgo | Evidencia | Acción |
|---|---|---|---|---|
| 1 | **ALTA/CRÍTICA** (condicional) | Sin RLS en las 29 migraciones + PostgREST expone `public` + anon key pública ⇒ posible lectura de todas las tablas por `/rest/v1` sin pasar por la app | 0 × `ROW LEVEL SECURITY` en `prisma/migrations/*.sql`; `supabase/config.toml:13`; `src/lib/supabase/client.ts:6` | Verificar con 1 `curl`; habilitar RLS + políticas denegatorias o revocar grants a `anon`/`authenticated` |
| 2 | **ALTA** | `scripts/offboard-camarabaq.ts` puede escribir/borrar en **producción** | `:16` `import "dotenv/config"`, `:23`, `:69-84` (verificado por el Lead leyendo el archivo) | Cambiar `:16` por `import "../prisma/require-local-db"` o eliminar el archivo |
| 3 | **MEDIA** | CRM **global por diseño y uniforme** en clientes (lista `clients/route.ts:90` **y detalle `clients/[id]/route.ts:79-83`**), contactos (`contacts/route.ts:95-104`) e interacciones (`interactions/route.ts:47-54`) y lista de tareas (`tasks/route.ts:126`), con **inconsistencia real** en sub-recursos (404 en `clients/[id]/contacts:81`, `clients/[id]/log:52`, `tasks/[id]:58` pese a los feeds globales) y comentarios obsoletos (`crm.ts:5-8,26-30`) | citas a la izquierda | Decidir el eje de lectura y aplicarlo a los sub-recursos; excluir `texto`/`proximo_paso` para COLABORADOR; paginar feeds; corregir `crm.ts` |
| 4 | **MEDIA** | Redirección abierta por `?next=` sin validar | `proxy.ts:72` → `login/page.tsx:37` → `acceso-page.tsx:189` | Validar ruta relativa |
| 5 | **MEDIA** | Cookie de sesión sin `httpOnly` ni `secure` | defaults de `@supabase/ssr` (`constants.js:4-11`); `server.ts:33-42`; `proxy.ts:50-58` | `secure: true`, `maxAge` corto, CSP |
| 6 | **MEDIA** | `login`, `reset-password` y `dev/reset-token` sin rate limiting ni bloqueo | `login/route.ts:40-48`; `reset-password/route.ts:35`; `reset-token/route.ts` | Límite durable por IP+email |
| 7 | **MEDIA** | Guard del CLI Prisma incompleto: carga sin verificar; `db:migrate`/`db:push`/`db:studio`/`db:seed`/`db:generate` sin sufijo | `prisma.config.ts:10,21`; `package.json:10-14` | `assertLocalDatabaseUrl()` en `prisma.config.ts` |
| 8 | **MEDIA** | `dev/reset-token` entrega sesión completa de cualquier email si el flag se activa | `reset-token/route.ts:118-123` | Restringir a desarrollo/loopback |
| 9 | **MEDIA-BAJA** | Export ZIP sin tope agregado de bytes (~1.25 GB) | `documents/zip/route.ts:32,38,115-120` | Tope de bytes totales |
| 10 | **MEDIA-BAJA** | `Origin` reflejado en el `redirectTo` de recuperación | `reset-password/route.ts:33` | Eliminar el fallback |
| 11 | **BAJO-MEDIO** | `solicitud-acceso` enumera cuentas (409) | `solicitud-acceso/route.ts:107-117` | Respuesta genérica |
| 12 | **BAJO-MEDIO** | Se firma una **escritura** (nueva versión de documento) con gate de **lectura** | `uploads/sign/route.ts:146` | Gate de escritura |
| 13 | **BAJO** | Tokens en query/hash de `/auth/confirm` antes de limpiarse; `accessToken`+`refreshToken` aceptados en `reset-password/confirm` | `confirm/page.tsx:145-150,188-204`; `reset-password/confirm/route.ts:66-84` | Preferir sólo `code`/`token_hash` |
| 14 | **BAJO** | `/api/openapi` público mientras la UI es de admin | `openapi/route.ts:12`; `api-docs/page.tsx:18` | Decidir y alinear |
| 15 | **BAJO** | `x-forwarded-for` sin validar en la bitácora; búsqueda de clientes explora `bitacora.texto` | `login/route.ts:83`; `callback/route.ts:90`; `clients/route.ts:106` | Validar IP; acotar el OR |
| 16 | **Higiene** | `scripts/seed-proyectos-demo.ts.bak` obsoleto; `.env.felipe` con `VERCEL_OIDC_TOKEN` en claro; `NEXTAUTH_SECRET` muerta en `.env.example:9`; `dotenv` como devDependency | citas | Borrar el `.bak`, rotar el token OIDC, limpiar el ejemplo |

---

## 9. Resumen ejecutivo

1. **Cloud sigue siendo alcanzable desde exactamente un archivo**: `scripts/offboard-camarabaq.ts:16` (`import "dotenv/config"`), sin guard, sin script npm y con `--apply` ejecutando 9 `updateMany`, un `delete` y un `deleteUser` de Supabase Auth (§1.2, §1.6). Verificado por el Lead leyendo el archivo.
2. **El guard anti-producción es sólido** —URL parseada, fail-closed, sin `SEED_ALLOW_NON_LOCAL`, rechaza `127.0.0.1.evil.com`, `localhost.evil.com` y poolers, y maneja IPv6 `[::1]`— pero su **cobertura es incompleta**: `prisma.config.ts:10` carga sin verificar (verificado por el Lead), así que `db:migrate`/`db:push`/`db:studio`/`db:seed`/`db:generate` (`package.json:10-14`) pueden apuntar a Cloud (§1.4-1.5).
3. **Higiene de secretos limpia**: ningún valor de credencial fue jamás commiteado (549 árboles únicos / 560 commits / 57 refs con control positivo); sólo `.env.example` con placeholders, y `.env`, `.env.local`, `.env.felipe` ignorados por `.gitignore:40` (§2).
4. **La autorización es sólo de aplicación**: sin escalada por rol del cliente ni IDOR clásico, pero RLS no existe en ninguna migración y la app conecta como propietario (`src/lib/db.ts:15`), de modo que RLS no protege nada y la anon key pública deja PostgREST sobre `public`; y el CRM es global por diseño (lista **y detalle** de cliente, contactos, interacciones, lista de tareas) con sub-recursos todavía scoped (§3, §4).
5. **Sin inyección SQL** (todo `$queryRaw` parametrizado; el único `$queryRawUnsafe` es SQL constante) con Zod en 25 rutas inline + 22 vía helper y subidas/descargas bien diseñadas (clave del servidor, allowlist MIME, URLs firmadas de 60 s); los riesgos de autenticación restantes son la redirección abierta por `?next=` (`acceso-page.tsx:189`, verificada por el Lead), la cookie sin `httpOnly`/`secure` y la ausencia de rate limiting en `login`/`reset-password` (§5, §6).
