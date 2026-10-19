# T2 — Arquitectura y modelo de datos

**Repo:** `C:\Users\Adrian\Documents\MuttuHub-CRM` @ HEAD · **Análisis:** 2026-10-13 · **Modo:** sólo lectura (sin DB, sin `prisma generate/migrate/seed`, sin abrir `.env*`).

Todos los números provienen de comandos ejecutados; las limitaciones de medición se declaran.

---

## 1. `prisma/schema.prisma` vs migraciones

### 1.1 Conteos base

| Métrica | Valor | Comando |
|---|---|---|
| `schema.prisma` | **1.255 líneas** | `find /c /v "" prisma\schema.prisma` |
| Modelos | **42** | `findstr /r /c:"^model "` |
| Enums | **21** | `findstr /r /c:"^enum "` |
| Directorios de migración | **32** | `dir /b /ad prisma\migrations` |
| Archivos `migration.sql` | **32** | `dir /b /s ...\migration.sql` |
| Líneas SQL totales | **1.871** | `Get-Content` por archivo |
| Rango temporal | **2026-08-11 → 2026-10-13 (63 días)** | `20260811191233_solicitudes_acceso` → `20261013130000_v2_relaciones` |

`schema.prisma:7-9`: el `datasource` **no declara `url`**, sólo `provider = "postgresql"`. La URL vive en `prisma.config.ts:18-22` = `process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]`, con `loadLocalEnv()` de `prisma/local-env.ts` (nunca `dotenv/config`; comentario en `prisma.config.ts:5-9`: `.env` es la instancia compartida de producción).

### 1.2 Nomenclatura y orden

- **3 semillas secuenciales**: `0001_init`, `0002_adjuntos_tamano_bytes`, `0003_settings` (sin fecha en el nombre).
- **29 con timestamp** `YYYYMMDDHHMMSS_slug`. Desde `20260930181056_v2_auditoria_cambios` el slug lleva prefijo `v2_` → **18 migraciones `v2_*`**, que trazan la construcción del módulo de proyectos v2.

### 1.3 Aditivas vs destructivas

- **30 de 32 aditivas e idempotentes**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, bloques `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$`, `DROP TRIGGER IF EXISTS` antes de recrear.
- **`DROP TABLE` → 0. `DROP COLUMN` → 0.** Ninguna migración borra datos ni columnas.
- **Excepciones verificadas:**
  - `prisma/migrations/20260818155000_auditoria_cursor_indexes/migration.sql:2` → `DROP INDEX "auditoria_created_at_idx";` (reemplazo por índices de cursor; el índice viejo ya no está en el schema → consistente).
  - `prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:145` → `ALTER TABLE "soportes_proyecto" DROP CONSTRAINT IF EXISTS "soportes_proyecto_padre_check";` seguido de re-`ADD` con `num_nonnulls(avance_id, medicion_id, gasto_id) = 1` (mismo nombre a propósito: «the S4 invariant test asserts it»).
  - **4 × `ALTER COLUMN ... SET NOT NULL`** (fallan si hay filas NULL): `20261001185211_v2_rubros_codigo/migration.sql:30`, `20261002120000_v2_lineas_estrategicas`, `20261005120000_v2_municipios`, `20261006120000_v2_proyecto_general`. En `rubros` está mitigado por `UPDATE "rubros" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;` (línea 29).
  - **1 × `ALTER TYPE ... ADD VALUE`**: `prisma/migrations/20261010130000_v2_notificacion_sobregasto_enum/migration.sql` → `ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOBREGASTO_RUBRO';`, deliberadamente sola en su migración porque `ADD VALUE` no puede compartir transacción con su uso (comentario ll. 1-3).
  - **`prisma/migrations/0001_init/migration.sql` NO es idempotente** (`CREATE TYPE`/`CREATE TABLE` sin `IF NOT EXISTS`): es la única migración generada por Prisma sin endurecer. El resto del historial sí lo está.

### 1.4 Objetos que sólo existen en SQL crudo

**Triggers y funciones (5 funciones, 8 triggers):**

| Función | Triggers | Archivo |
|---|---|---|
| `auditoria_cambios_inmutable()` | `auditoria_cambios_no_update_delete`, `auditoria_cambios_no_truncate` | `prisma/migrations/20260930181056_v2_auditoria_cambios/migration.sql` |
| `rubros_codigo_inmutable()` | `rubros_codigo_no_update` | `prisma/migrations/20261001185211_v2_rubros_codigo/migration.sql:54-65` |
| `lineas_estrategicas_codigo_inmutable()` | `lineas_estrategicas_codigo_no_update` | `prisma/migrations/20261002120000_v2_lineas_estrategicas/migration.sql` |
| `acceso_soportes_inmutable()` | `acceso_soportes_no_update_delete`, `acceso_soportes_no_truncate` | `prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:171-184` |
| `versiones_proyecto_inmutable()` | `versiones_proyecto_no_update_delete`, `versiones_proyecto_no_truncate` | `prisma/migrations/20261011120000_v2_versiones/migration.sql` |

Todos refuerzan modelos declarados append-only en el schema: `BitacoraEntrada` (inmutable por diseño, sin `updated_at`), `AuditoriaCambio`, `AccesoSoporte`, `VersionProyecto`.

**CHECK constraints:** **33 apariciones de `CHECK (`**, con nombres explícitos. Los más ricos en `prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:67-117`:
`gastos_monto_positivo_ck`, `gastos_periodo_ck` (regex `^[0-9]{4}-(0[1-9]|1[0-2])$`), `gastos_validador_ck` (validador ≠ registrador — segregación de funciones), `gastos_rechazo_ck`, `gastos_rechazador_ck`, `gastos_validado_ck` (N-15: VALIDADO exige validador + fecha + id de tercero), `gastos_anulado_ck` (`ANULADO` ⇔ tres columnas juntas vía `num_nonnulls(...) IN (0,3)`).
Otros: `soportes_proyecto_padre_check` / `_fuente_check` / `_tamano_check`, `actividades_semanas_check`, `actividades_peso_check`, `entregables_cantidad_meta_check`, `indicadores_meta_check`, `indicadores_linea_base_check`, `avances_entregable_anulado_check`, `mediciones_indicador_valor_check`, `registros_beneficiarios_cantidad_check`, `lineas_monto_no_negativo_ck`, `programacion_periodo_ck`, `tareas_oportunidad_requiere_cliente`.

**Índices parciales / por expresión (8 objetos; Prisma no puede expresarlos):**
`actividades_codigo_activo_uq`, `entregables_codigo_activo_uq`, `indicadores_codigo_activo_uq`, `objetivos_codigo_activo_uq`, `proyecto_lineas_principal_uq`, `proyecto_miembros_activo_uq`, `solicitudes_acceso_email_pendiente_key` (`... ON "solicitudes_acceso" ("email") WHERE "estado" = 'PENDIENTE'`, en `20260903000000_solicitudes_acceso_email_pendiente_unique/migration.sql`), y el GIN por expresión:

```sql
-- prisma/migrations/20260902190000_fase2_documentos_esquema/migration.sql:30-33
CREATE INDEX documento_versiones_contenido_fts_idx ON documento_versiones
  USING GIN (to_tsvector('spanish', coalesce(contenido_texto, '')));
```
El comentario advierte que la query debe repetir la expresión byte a byte o el planner lo ignora.

**Secuencias para códigos generados (`PRY-AAAA-NNN`): NO hay `CREATE SEQUENCE` (0 apariciones).** El correlativo usa una **tabla contador** `proyecto_secuencias(anio PK, ultimo)` (`prisma/migrations/20261007120000_v2_proyecto_secuencias/migration.sql`) más un `upsert` en `src/lib/api/project-code.ts`: el row-lock sobre `anio` serializa creaciones concurrentes. La migración **no siembra filas**: la primera asignación inicializa el contador desde el máximo código ya presente en `proyectos` para ese año (comentario ll. 8-11).

**RLS: cero.** `findstr /s /i /c:"ROW LEVEL SECURITY" /c:"CREATE POLICY"` sobre `prisma/*.sql` y `supabase/*.sql` → **0 coincidencias**. `supabase/` contiene sólo `config.toml`, `email-templates/` (6 HTML), `snippets/`, `.branches/`, `.temp/` — **no existe `supabase/migrations/`**: el esquema vive exclusivamente en `prisma/migrations/`. La autorización es 100 % de aplicación (ver T3 §3).

### 1.5 Drift: método y resultado

Se extrajeron del schema los 42 `@@map`, las columnas escalares y los nombres de índice/unique/PK derivados de las convenciones de Prisma; se compararon contra el texto acumulado de los 32 `migration.sql` (**81.231 caracteres**).

| Comprobación | Resultado |
|---|---|
| Tablas del schema presentes en migraciones | **42/42** — 0 faltantes, 0 sobrantes |
| Columnas escalares sin `"nombre"` en migraciones | **0**. Las únicas ausencias son campos de **relación** (`cliente`, `tareas_asignadas`, …), que no son columnas |
| Nombres de índice/unique/PK del schema presentes | **73/73**. Una variante de la verificación dio 4 «faltantes», las 4 explicadas: 3 PKs compuestas que el regex no capturó (`documentos_clientes_pkey`, `proyecto_lineas_pkey`, `proyecto_municipios_pkey`, confirmadas con `findstr /c:"_pkey"`) y 1 falso positivo: `proyecto_secuencias_id_proyecto_id_key`, que proviene de un **comentario** en `prisma/schema.prisma:818` dentro del doc-block de `Objetivo`, no de un `@@unique` real |
| Objetos de índice en migraciones sin contraparte en el schema | **8** (7 parciales + 1 GIN por expresión) |

**Veredicto: no hay drift estructural.** El esquema acumulado por las migraciones coincide con `schema.prisma` en tablas, columnas y nombres de restricciones. El drift es de otra naturaleza:

> **`schema.prisma` no es la verdad completa de la base.** 8 índices, 5 funciones y 8 triggers existen sólo en SQL crudo. Cualquier `prisma migrate dev` / `prisma migrate diff` futuro los verá como drift del entorno y propondrá `DROP INDEX`, borrando las garantías de «un solo principal», «un solo miembro activo», «código único entre vivos», la inmutabilidad de la auditoría y el índice que sostiene el buscador de documentos. La única defensa es que 30 de 32 migraciones son adoptivas y escritas a mano. No hay test ni guard que detecte este drift.

**Drift de documentación (real, menor):** `src/lib/openapi/registry.ts:1-4` afirma que el registry se puebla desde «every `src/app/api/**/*.openapi.ts` registration file». `dir /b /s src\*.openapi.ts` → **0 archivos**. Los registros viven en `src/lib/openapi/paths/*.ts` (24 archivos), importados por side-effect en `src/lib/openapi/document.ts:9-32`.

**Observación de esquema (no drift, pero relevante):** `prisma/schema.prisma:472` declara `@@unique([usuario_id, tipo, gasto_id])` con dos columnas nullable. Postgres trata los NULL como distintos, así que esa unique **no deduplica notificaciones de tarea** — sólo las de proyecto. El comentario (ll. 460-461) lo declara intencional para las filas de proyecto, pero deja las de tarea sin restricción.

**Índices ausentes en columnas de filtrado:** no hay `@@index` sobre `clientes.responsable_id`, `tareas.responsable_id`, `tareas.cliente_id`, `tareas.estado`, `tareas.fecha_entrega`, ni `documento_versiones.subido_por_id` — que son exactamente las columnas de los `where` de los listados (Kanban, CRM, scoping por responsable).

### 1.6 Inventario de modelos (42)

`Usuario`, `Cliente`, `Contacto`, `Oportunidad`, `Tarea`, `BitacoraEntrada`, `Carpeta`, `Documento`, `DocumentoVersion`, `DocumentoCliente`, `ComentarioTarea`, `Subtarea`, `AdjuntoTarea`, `Notificacion`, `Acceso`, `Auditoria`, `CronLog`, `SolicitudAcceso`, `Setting`, `AuditoriaCambio`, `Rubro`, `LineaEstrategicaCatalogo`, `Municipio`, `Proyecto`, `ProyectoLinea`, `ProyectoMunicipio`, `ProyectoMiembro`, `ProyectoSecuencia`, `Objetivo`, `Actividad`, `Entregable`, `AvanceEntregable`, `SoporteProyecto`, `Indicador`, `MedicionIndicador`, `RegistroBeneficiario`, `LineaPresupuestal`, `ProgramacionPeriodo`, `Gasto`, `AccesoSoporte`, `VersionProyecto`, `SolicitudModificacion`.

**Enums (21):** `RolUsuario`, `EstadoCliente`, `TipoCliente`, `PrioridadCliente`, `RolContacto`, `EstadoOportunidad`, `FaseOportunidad`, `TipoInteraccion`, `EstadoTarea`, `OrigenTarea`, `PrioridadTarea`, `TipoNotificacion`, `EstadoProyecto`, `OrigenProyecto`, `AccionAuditoria`, `EstadoGasto`, `TipoSoporteGasto`, `TipoIdentificacion`, `TipoVersion`, `TipoModificacion`, `EstadoSolicitud`.

**Patrones transversales (verificados leyendo el archivo completo):**
- **Soft delete** por `deleted_at`: `Cliente`, `Contacto`, `Oportunidad`, `Tarea`, `Carpeta`, `Documento`, `Proyecto`, `Objetivo`, `Actividad`, `Entregable`, `Indicador`, `SoporteProyecto`.
- **Append-only real** (no soft delete), reforzado con triggers: `BitacoraEntrada`, `AuditoriaCambio`, `AccesoSoporte`, `VersionProyecto`.
- **FKs compuestas «mismo proyecto»**: `@@unique([id, proyecto_id])` en `Objetivo`, `Actividad`, `Entregable`, `AvanceEntregable`, `Indicador`, `MedicionIndicador`, `RegistroBeneficiario`, `LineaPresupuestal`, `Gasto`; Prisma exige `onDelete/onUpdate: NoAction` porque dos relaciones comparten escalar (documentado en `schema.prisma:290-299`). El hueco de `MATCH SIMPLE` lo cierra un CHECK en SQL crudo.
- **Punteros de auditoría sin FK** (sobreviven al actor): `AuditoriaCambio.usuario_id`, `ProyectoMiembro.agregado_por_id/removido_por_id`, `AvanceEntregable.registrado_por_id/anulado_por_id`, `Gasto.*_por_id`, `AccesoSoporte.usuario_id`, `VersionProyecto.aprobado_por_id`, `Setting.updated_by`, `SolicitudAcceso.revisado_por`.
- **Tres ejes de autorización ortogonales al rol**: `gestiona_oportunidades` (comercial), `puede_ver_tablero_gerencial` (lectura gerencial, sólo lectura), `ProyectoMiembro.removed_at` (membresía con soft-revoke y PK subrogada, porque el par se repite en el tiempo).
- `Oportunidad.proyectos_relacionados` está marcado `@deprecated` (`schema.prisma:241-243`) pero **no se elimina**: «kept additive, not dropped».

### 1.7 Tests de invariantes del schema

**27 archivos `prisma/*.invariant.test.ts`, 6.480 líneas, 192 casos `it()`.**

Mecanismo leído en `prisma/invariant.test.ts` y `prisma/proyecto-migration.invariant.test.ts`: importan `./require-local-db`, que carga `.env.local` y llama `assertLocalDatabaseUrl()` (`prisma/require-local-db.ts:14-15`), abortando si la URL no es loopback. Los fixtures se crean dentro de una transacción Prisma **siempre revertida** vía la clase centinela `IntentionalRollback` (`invariant.test.ts:32-48`). `proyecto-migration.invariant.test.ts:66-70` va más lejos: crea un **schema Postgres desechable** (`proyecto_mig_inv_<uuid>`), ejecuta el `migration.sql` **real** con `readFileSync` e introspecciona el catálogo para comparar definiciones exactas de índice.

**Qué garantizan:** que CHECKs/índices/triggers existen y se comportan como se afirma, contra Postgres real. Ejemplo: `invariant.test.ts:56-89` prueba que `tareas_oportunidad_requiere_cliente` rechaza `oportunidad_id` set + `cliente_id` NULL — el hueco de `MATCH SIMPLE` que la FK compuesta deja abierto.

**Límites verificados:**
- Sólo **4 de 27** leen el SQL real de la migración (`lineas-migration`, `municipios-migration`, `proyecto-migration`, `rubros-migration`).
- **7 de 27** introspeccionan catálogos (`pg_indexes`, `pg_constraint`, `pg_trigger`, `information_schema`, `pg_proc`, `pg_enum`, `to_regclass`).
- Los otros **20** prueban comportamiento a través del cliente Prisma.
- **Punto débil concreto:** `prisma/invariant.test.ts:138-150` **copia a mano** el `UPDATE` semántico de la migración D3 en vez de ejecutar el archivo («Exact copy of the migration's D3 seed UPDATE»). Si el SQL de la migración cambia, el test sigue verde.
- **Los 27 requieren base viva:** 28 de los 29 archivos `prisma/*.test.ts` importan `require-local-db` (sólo `prisma/local-env.test.ts` no). `vitest.config.ts` **no excluye `prisma/**`** (sólo `e2e/**`, línea 28), así que forman parte de `npm test` y **fallan si el Supabase/Docker local no está levantado**.

---

## 2. Layering: veredicto

### 2.1 El patrón y si se sostiene

```
src/app/api/v1/**/route.ts     handler: auth → gate → Zod → delegar → JSON
        │
src/lib/api/*.ts (36 no-test)  capa IO/servicio: gates, loaders, transacciones, auditoría
        │
src/lib/proyectos/*.ts (27)    reglas de dominio PURAS: cálculo, semáforos, curva, dinero
src/lib/*.ts (10)              dominio puro + infraestructura (permissions, nav, utils…)
        │
src/lib/openapi/paths/*.ts     spec; los schemas de REQUEST se importan del route
src/hooks/*.ts (8)             TanStack Query: DTOs + keys + invalidación
src/components/**/*.tsx (209)  UI (116 archivos con "use client")
src/store/*.ts (3)             Zustand: clients-view, filters, sidebar
```

**Evidencia de que la separación es real:** se comprobó que **los 27 módulos de producción de `src/lib/proyectos/` no importan `@/lib/db`, `@/lib/supabase`, `next/server`, `node:fs` ni leen `process.env`** — 0 coincidencias. Son puros y testeables en aislamiento. Los 59 archivos se descomponen en 41 de raíz + 10 de `plantilla/` + 8 de `__fixtures__/`; 25 son tests → 34 no-test, de los cuales 7 son datos de fixture → **27 módulos puros**. `src/lib/permissions.ts` (187 líneas) también es puro: sólo `import type { RolUsuario }` (tipo, no runtime).

Del lado IO, `src/lib/api` tiene 36 archivos no-test; **24 importan `@/lib/db` o `@prisma/client`** y 12 no (`errors.ts`, `export-http.ts`, `extract-text.ts`, `files.ts`, `folders.ts`, `handler.ts`, `http.ts`, `kpis-http.ts`, `kpis-proyecto.ts`, `mediciones.ts`, `signed-upload.ts`, `soportes.ts`). La frontera puro/IO es nítida y verificable.

**¿Handler delgado de verdad? Sí, con matices medibles.** Los 121 `route.ts` de `api/v1` suman **15.559 líneas**, promedio **129**; **30 están bajo 60 líneas**; 17 superan 200 y 6 superan 300.

**El matiz importa:** no toda la lógica de negocio vive en los módulos puros. En `src/app/api/v1/projects/[id]/budget/route.ts:94-187` el `PUT` contiene, **dentro de la transacción**, reglas reales: que el presupuesto cubra exactamente una vez cada rubro activo (ll. 111-122), que un rubro suspendido sin línea se rechace (ll. 114-116), el diff de líneas contra lo existente (ll. 127-150), y la regla N-17 de tomar `valor_total` de la suma **sólo si era NULL** (ll. 157-182), recalculando `diferencia_valor_oportunidad` con `diferenciaValor` del módulo puro.

**Veredicto:** el patrón «módulo puro + handler delgado + hook React Query + componente» **existe y se respeta en el cálculo** (semáforos, curva S, KPIs, dinero en centavos, semanas, plantilla Excel son 100 % puros), pero **la orquestación transaccional con invariantes de estado vive en los handlers**. Es un híbrido: dominio puro para las fórmulas, handler con reglas para las transiciones. El costo es que esas reglas sólo se testean por HTTP (23 `route.test.ts`) y no como funciones puras.

### 2.2 Permisos por request

**Helpers (`src/lib/supabase/server.ts`):** `requireApiUser()` (ll. 117-147) → 401 `UNAUTHORIZED` sin sesión, 500 `INTERNAL_ERROR` si Supabase está configurado pero la DB no; `requireApiRole(roles)` (ll. 154-170) delega en `requireApiUser` y añade 403 `FORBIDDEN`; `requireUser()`/`requireRole()` redirigen páginas.

**`src/lib/permissions.ts` es puro y ejemplar** (ll. 1-7 declaran que no debe importar `@/lib/db` ni `next/server`). Define `canManageAny`, `canEditClient`, `canEditTask`, `hasCommercialAccess`, `canManageOpportunity`, `canManageProjects`, `canCreateProject`, `canManageProject`, `canExecuteProject`, `canViewProjectV2`, `canViewFinancialSupports`, `canValidateExpense` (segregación de funciones: el registrador nunca valida), `canApproveBaseline`, `canApproveModification`, `canViewPortfolio`. El comentario ll. 147-155 documenta la excepción deliberada: la bandera gerencial **no** da acceso a soportes financieros.

**Medición de aplicación:**
- `requireApiUser`: **613 apariciones** en `src/app/api/v1/*.ts`; **101 de los 121 `route.ts`** lo contienen literalmente.
- `requireApiRole`: **109 apariciones**, en **15 archivos de producción**.
- Los **20 `route.ts` sin `requireApiUser` literal**, verificados uno por uno: **11 usan `requireApiRole`**, que internamente sí llama a `requireApiUser` (`auditoria`, `auth/accesos`, `municipalities/[id]`, `settings`, `solicitudes-acceso`, `solicitudes-acceso/[id]/aprobar`, `solicitudes-acceso/[id]/rechazar`, `strategic-lines/[id]`, `users`, `users/[id]`, `users/[id]/deactivate`); **1 usa `getSessionUser`** (`auth/me`); **8 son públicos por diseño** con justificación en el archivo (`auth/login`, `auth/logout`, `auth/reset-password`, `auth/reset-password/confirm`, `auth/solicitud-acceso`, `auth/reinvite`, `dev/invite-token`, `dev/reset-token`). Los dos `dev/*` se bloquean si `process.env.NODE_ENV === "production"` (`dev/invite-token/route.ts:18`, `dev/reset-token/route.ts:25`); `auth/reinvite/route.ts:3-7` es público para la pantalla «Enlace no válido» y no enumera cuentas.
- **2 handlers no usan el wrapper**: `src/app/api/openapi/route.ts:12` y `src/app/api/v1/auth/me/route.ts:8`, ambos `export async function GET` en vez de `export const GET = withApiErrorHandling(...)`. Sobre **168 handlers de verbo** (`export const GET` 77, `POST` 50, `PATCH` 22, `DELETE` 16, `PUT` 3) y **166** `= withApiErrorHandling(` → cobertura **98,8 %**.
- **Orden de gates homogéneo y declarado:** `404 → 403 (→ 409 estado) → 400 body`, verificado en `src/lib/api/presupuesto.ts:41-70` (`gatePresupuestoWrite`, `gatePresupuestoRead`) y replicado en `src/lib/api/projects.ts` vía `loadProjectScoped` (scoping con `es_miembro`). El punto débil es que el *ordering* es convención replicada por archivo, no un helper único que lo imponga.

**Riesgo asociado:** el rate limiter de `src/app/api/v1/auth/reinvite/route.ts:22` es un `Map` **en memoria de proceso** (`const rateLimit = new Map<...>`): en serverless/multi-instancia no limita globalmente. Ese endpoint usa `SUPABASE_SERVICE_ROLE_KEY` contra GoTrue (ll. 73-92).

### 2.3 OpenAPI: generado desde Zod, con un límite preciso

**Sí es generado** con `@asteasolutions/zod-to-openapi`:
- `src/lib/openapi/registry.ts`: instancia única del `OpenAPIRegistry`, `extendZodWithOpenApi(z)` exactamente una vez (ll. 11-16), `ErrorEnvelopeSchema` con el enum literal de 10 códigos que **coincide exactamente** con `ApiErrorCode` de `src/lib/api/errors.ts:9-19`, y `securitySchemes.sessionCookie` (cookie `sb-access-token`, ll. 45-51).
- `src/lib/openapi/document.ts` ensambla el documento 3.1 e importa los **24** `paths/*.ts` por side-effect.
- `src/app/api/openapi/route.ts` lo sirve; `src/components/api-docs/api-docs-viewer.tsx` lo renderiza con `swagger-ui-react` + su CSS.

**Anclaje a los handlers (punto fuerte):** `findstr /s /c:"@/app/api" src\lib\openapi\paths\*.ts` → **38 imports** de schemas Zod exportados por los propios `route.ts`. Ejemplo en `src/lib/openapi/paths/project-budget.ts:7-8`:
```ts
import { BUDGET_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/budget/route";
import { PROGRAMMING_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/programming/route";
```
y en el route, `export const BUDGET_PUT_SCHEMA` (`route.ts:38-50`). Se contaron **38 exports `*_SCHEMA`** en `src/app/api/v1`. **Los cuerpos de request no pueden driftear**: son el mismo objeto Zod en runtime y en spec.

**Dónde SÍ puede driftear:**
1. **Respuestas**: los schemas de respuesta están **re-declarados a mano** en los `paths/*.ts` (p. ej. `BudgetViewSchema`, `ProgrammingViewSchema`, `FinancialSheetSchema`, `FichaRowSchema` en `project-budget.ts:20-156`) en vez de derivarse del tipo de retorno del handler.
2. **Códigos de estado**: declarados a mano por operación vía `standardErrorResponses([...])` (`registry.ts:58-78`). Nada los compara con los `apiError(..., código)` del handler.
3. **Rutas documentadas vs existentes**: 121 `route.ts` en `api/v1` frente a 24 archivos de dominio que registran un subconjunto. Ningún test compara el conjunto de paths del spec contra el árbol de `src/app/api/v1`.

`src/lib/openapi/document.test.ts` (389 líneas) sí protege el ensamblado: verifica que los side-effect imports no se pierdan y aserta, por endpoint, métodos y **conjuntos de códigos de estado** (`expect(codes(budget?.put)).toEqual(expect.arrayContaining(["200","400","403","404","409"]))`). Es un guardrail de la *forma del spec*, no de la *equivalencia con el handler*.

### 2.4 Duplicación deliberada de contratos

El contrato de respuesta se declara tres veces: el `select`/JSON del handler, el schema Zod del spec (respuestas, a mano) y el DTO del hook. `src/hooks/projects.ts:3-5` explica el porqué: **no importa `ProjectItemV2` de `src/lib/api/projects.ts` porque ese módulo arrastra `@/lib/db` y `next/server` y no puede entrar al bundle del cliente**. Es duplicación intencionada para mantener la frontera servidor/cliente; el costo es que un cambio de forma de respuesta debe replicarse a mano en el DTO y en el spec.

---

## 3. Métricas de salud del código

### 3.1 Conteos por capa

| Capa | Archivos | Detalle |
|---|---|---|
| `src/` total (`.ts`/`.tsx`) | **701** | **130.882 líneas** |
| `src/app/` | **462** | 124 `route.ts`, 27 `page.tsx`, 5 `layout.tsx` |
| `src/app/api/v1/` | **121 `route.ts`** | de 240 archivos totales bajo `api/v1` |
| `src/lib/api/` | **59** `.ts` | 23 son tests → **36 no-test** |
| `src/lib/proyectos/` | **59** | 41 raíz + 10 `plantilla/` + 8 `__fixtures__/`; 25 tests → **27 módulos puros** |
| `src/lib/openapi/` | **27** | **24** en `paths/` + `registry.ts` + `document.ts` + `document.test.ts` |
| `src/lib/` (total `.ts`) | **172** | + `src/lib/{api,auth,format,mock,openapi,proyectos,supabase}` |
| `src/hooks/` | **20** | 11 tests → **8 no-test** (`admin`, `crm`, `dashboard`, `documents`, `kanban`, `nav`, `projects`, `use-theme`) |
| `src/store/` | **6** | 3 tests → **3** (`clients-view`, `filters`, `sidebar`) |
| `src/components/` | **217** | 209 `.tsx` + 8 `.ts`; **44** en `ui/` |
| `src/components/` por subdir | — | `proyectos` 83, `ui` 44, `crm` 23, `dashboard` 15, `shell` 12, `admin` 10, `kanban` 9, `documents` 8, `auth` 2, `api-docs` 1, `reportes` 1, `shared` 1 |
| Tests en `src/` | **292** | |
| Archivos con `"use client"` | **116** | |

**Top 15 archivos más largos:**

| Líneas | Archivo |
|---|---|
| 2.221 | `src/hooks/projects.ts` |
| 1.689 | `src/components/crm/client-sheet.tsx` |
| 1.357 | `src/components/crm/client-list.tsx` |
| 1.175 | `src/lib/proyectos/plantilla/validate.ts` |
| 1.042 | `src/components/kanban/kanban-board.tsx` |
| 1.013 | `src/components/documents/repository-list.tsx` |
| 978 | `src/app/api/v1/documents/route.test.ts` |
| 942 | `src/hooks/crm.ts` |
| 854 | `src/components/kanban/task-dialog.tsx` |
| 846 | `src/components/proyectos/project-list.test.tsx` |
| 839 | `src/components/crm/entity-dialogs.tsx` |
| 801 | `src/components/proyectos/project-ficha.test.tsx` |
| 783 | `src/lib/openapi/paths/clients.ts` |
| 782 | `src/lib/openapi/paths/dashboard-admin.ts` |
| 769 | `src/app/api/v1/tasks/[id]/attachments/route.test.ts` |

| Distribución | Valor |
|---|---|
| Archivos > 300 líneas | **108** |
| **Archivos > 500 líneas** | **41** |
| `route.ts` > 200 líneas | 17 (6 > 300) |

**Top 6 handlers por tamaño:** `documents/route.ts` 627 · `clients/route.ts` 383 · `tasks/route.ts` 355 · `projects/[id]/route.ts` 353 · `tasks/[id]/attachments/route.ts` 344 · `projects/route.ts` 329.

**Archivo más profundo por capa:** `projects.ts` está triplicado a propósito — `src/hooks/projects.ts` (2.221, el mayor del repo), `src/lib/api/projects.ts` (545), `src/lib/openapi/paths/projects.ts`.

### 3.2 Higiene de tipos

| Marcador | Conteo |
|---|---|
| `: any` en posición de tipo | **0** |
| `as any` | **0** |
| `@ts-ignore` | **0** |
| `@ts-expect-error` | **0** |
| `any[]` / `<any>` | **0** |
| `as unknown as` | **45** |
| `satisfies` | **9** |
| `eslint-disable` | **10** |
| `dangerouslySetInnerHTML` | **4** (1 real: `src/app/layout.tsx:56`, script anti-FOUC) |
| `TODO` literal | **16**, de los cuales **1 es un TODO real** |
| `FIXME` / `HACK` | **0 / 0** |

Dos conteos que engañan y hay que precisar:
- **`findstr /c:": any"` da 7 coincidencias y las 7 son prosa**, no anotaciones: `tasks/route.ts:59` («any role can filter by any responsable»), `handler.ts:18` (comentario que explica *por qué* se usa `unknown[]` y no `any[]`), `tacometro.tsx:59`, etc. Confirmado con regex `:\s*any\b|<\s*any\s*>|any\[\]|as any` sobre `src/**/*.{ts,tsx}` (verificado de forma independiente por el Lead con el mismo resultado: 4 coincidencias, todas comentarios). **No hay un solo `any` en el código.**
- **`TODO` da 16 porque «TODO» es palabra española** («TODO el alcance», y `TODOS` como valor de filtro en `project-gastos.tsx:43,46,56,100`). El único TODO accionable es `src/lib/supabase/server.ts:149`: `TODO(Hito 7)` — los permisos granulares por módulo del PRD §3.3.2 quedaron fuera del alcance v1; los gates son por rol completo.

Los 10 `eslint-disable`: 6 × `@next/next/no-img-element` (avatares/logo: `sidebar.tsx:76,80,82`, `acceso-page.tsx:411`, `auth/confirm/page.tsx:487`, `auth/reset-password/page.tsx:55`, `auth/reset-password/confirm/page.tsx:221`) y 3 × `@typescript-eslint/no-unused-vars` (`clients/route.ts:87`, `cron/daily/route.ts:26`, `tasks/route.ts:137`), todos con justificación inline.

### 3.3 Duplicación de nombres de módulo (convención, no accidente)

`route.ts` ×124, `page.tsx` ×27, `layout.tsx` ×5 son convenciones de framework. Con nombre propio: `curva.ts`, `gastos.ts`, `documents.ts`, `projects.ts`, `versiones.ts` ×3 cada uno; `admin.ts`, `atencion.ts`, `crm.ts`, `dashboard.ts`, `modificaciones.ts`, `nav.ts`, `tecnico.ts`, `weeks.ts`, `shared.tsx` ×2. El patrón sistemático es **`src/lib/proyectos/X.ts` (puro) ↔ `src/lib/api/X.ts` (IO) ↔ `src/hooks/X.ts` (React Query) ↔ `src/lib/openapi/paths/X.ts` (spec)**. Es legible, pero exige disciplina al buscar por nombre de archivo.

### 3.4 Código/configuración muerta

- `.env.example` declara `NEXTAUTH_SECRET` y `ANTHROPIC_API_KEY`: **0 referencias en `src/`**; `next-auth` no está en `package.json`. Variables muertas.
- `.env.example` declara `DIRECT_URL`: **1 referencia** (`prisma.config.ts:21`), correcto por diseño (pooler de sesión para migraciones).
- Residuos en el árbol: `scripts/seed-proyectos-demo.ts.bak`, `.next-stale-1790784370/`.
- `prisma/schema.prisma:241-243` marca `Oportunidad.proyectos_relacionados` como `@deprecated` pero la columna sigue existiendo y ninguna migración la elimina.

---

## 4. Realidad del stack: declarado vs importado

**Método:** se extrajeron **todos los especificadores de import desnudos** de `src/**/*.{ts,tsx}` (4.065 líneas con `from "`, **1.337** especificadores no relativos, lista única) y se contrastaron con `package.json`.

**Especificadores realmente importados (conjunto completo):**
`@asteasolutions/zod-to-openapi`, `@base-ui/react/{avatar,button,checkbox,dialog,input,menu,merge-props,popover,select,separator,tabs,tooltip,use-render}`, `@dnd-kit/{core,sortable,utilities}`, `@prisma/adapter-pg`, `@prisma/client`, `@supabase/ssr`, `@supabase/supabase-js`, `@tanstack/react-query`, `@testing-library/{react,user-event}`, `class-variance-authority`, `clsx`, `exceljs`, `jszip`, `lucide-react`, `next` (+ `next/font/google`, `next/headers`, `next/link`, `next/navigation`, `next/server`), `react`, `sonner`, `swagger-ui-react`, `tailwind-merge`, `unpdf`, `vitest`, `zod`, `zustand` (+ `zustand/middleware`), y builtins `crypto`, `node:crypto`, `node:fs`, `node:path`, `node:url`.

**Usado pero NO declarado: ninguno.** Todos los especificadores resuelven a una dependencia/devDependency declarada o a un builtin de Node.

**Declarado pero no importado desde `src/`:**

| Dependencia | Imports en `src/` | Veredicto |
|---|---|---|
| `shadcn` (^4.16.2) | **0** | **Herramienta de scaffolding declarada como dependency de runtime.** No hay script `shadcn` en `package.json`. Debería ser devDependency, o eliminarse si los 44 componentes de `src/components/ui` ya están versionados. |
| `pg` (^8.22.0) | **0** directos | Sólo transitiva de `@prisma/adapter-pg`. `src/lib/db.ts:15-17` pasa `connectionString` a `new PrismaPg(...)`; el driver la resuelve por dentro. Declararla es defendible (peer real), pero no se importa en ningún sitio. |
| `react-dom` (19.2.8) | **0** | No se importa directamente (Next lo gestiona). Normal en App Router. |
| `tw-animate-css` | **0** en TS, **1** en CSS | `src/app/globals.css:1` → `@import "tw-animate-css";`. Correctamente declarada; un primer conteo de 0 era falso negativo por mirar sólo TS. |

**Volumen de uso (apariciones de línea en `src/**/*.{ts,tsx}`):** `@prisma/client` 247 · `zod` 117 · `exceljs` 103 · `lucide-react` 84 · `@tanstack/react-query` 55 · `sonner` 47 · `jszip` 16 · `@base-ui/react` 14 · `zustand` 7 · `@prisma/adapter-pg` 5 · `@supabase/ssr` 5 · `@supabase/supabase-js` 3 · `class-variance-authority` 3 · `unpdf` 3 · `@asteasolutions/zod-to-openapi` 2 · `swagger-ui-react` 2 · `clsx` 2 · `@dnd-kit/sortable` 2 · `@dnd-kit/core` 1 · `@dnd-kit/utilities` 1 · `tailwind-merge` 1.

**Notas sobre las dependencias «raras»:**
- **`@base-ui/react` vs `src/components/ui` (44 archivos):** Base UI es el **primitivo real, no Radix**. Los 14 imports aparecen en 14 archivos de `src/components/ui` (`avatar`, `button`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `popover`, `select`, `separator`, `sheet`, `tabs`, `tooltip`, `badge`, y `label`/`table`/`password-input` con `"use client"`). **No existe ninguna dependencia `@radix-ui/*`.** La migración shadcn→Base UI está completada; `components.json` lo confirma (`"style": "base-nova"`, `rsc: true`, `iconLibrary: "lucide"`, alias `@/components/ui`).
- **`swagger-ui-react`:** uso real y acotado — `src/components/api-docs/api-docs-viewer.tsx` importa componente y CSS; `src/app/api-docs/page.tsx` lo monta; `src/app/api/openapi/route.ts` sirve el JSON. `@types/swagger-ui-react` en devDependencies. Componente cliente pesado, se paga sólo en `/api-docs`.
- **`unpdf`:** sólo en `src/lib/api/extract-text.ts` (texto de PDF para el FTS). Encaja con los 2 `export const maxDuration = 30` (`documents/route.ts:48`, `documents/[id]/versions/route.ts:44`), ambos comentados «la extracción de texto agrega trabajo a la subida».
- **`exceljs`** (103): import/export XLSX en `src/lib/proyectos/plantilla/{generate,parse,validate}.ts`, `src/lib/proyectos/export-xlsx.ts`, `src/lib/api/extract-text.ts` y 4 routes de export (`clients/export`, `tasks/export`, `projects/[id]/export`, `dashboard/portfolio/export`).
- **`jszip`:** `src/lib/api/extract-text.ts`, `src/lib/api/plantilla-import.ts`, `src/app/api/v1/documents/zip/route.ts`.

**Runtime y configuración de segmento:** `export const dynamic = "force-dynamic"` → **130 apariciones** en `src/app` (el API nunca se cachea estáticamente). `export const runtime` → **0** (ninguna ruta Edge; todo Node, necesario para `pg`, `exceljs`, `unpdf`, `node:fs`). `revalidate` → 0. `maxDuration` → 2. `next.config.ts` (18 líneas) sólo define `allowedDevOrigins: ["10.*.*.*","172.*.*.*","192.168.*.*"]`, con comentario que documenta el historial de IPs fijas rotas en Next.js 16 (commits 9ff2730, bd97f62). `src/proxy.ts` (93 líneas) materializa el rename de Next.js 16 `middleware` → `proxy`: guarda de sesión + refresh de cookie, y **excluye `/api` del matcher** (`proxy.ts:88-92`) a propósito porque las rutas API responden 401/403 JSON ellas mismas.

---

## 5. Topología

### 5.1 `src/app` — 462 archivos, 27 páginas, 5 layouts, 124 `route.ts`

| Ruta | Contenido |
|---|---|
| `(app)/` | 15 páginas + `layout.tsx`: `/`, `administracion`, `administracion/solicitudes`, `clientes`, `clientes/{automatizaciones,interacciones,mapa,oportunidades,relaciones,salud}`, `documentos`, `proyectos`, `proyectos/[id]`, `reportes`, `tablero`. `clientes/layout.tsx` es un sub-layout. |
| `(auth)/` | 1 página: `login` + `layout.tsx` |
| `auth/` | 3 páginas (`confirm`, `reset-password`, `reset-password/confirm`) + `layout.tsx`, y **`auth/callback/route.ts`** (OAuth handback, fuera de `/api`) |
| `print/` | **7 páginas de impresión sin `route.ts`**: `clientes`, `clientes/[id]`, `dashboard/{clients-activity,my-summary,pipeline,tasks}`, `reportes/tareas`, apoyadas en `components/**/print-*.tsx` |
| `api-docs/` | 1 página: visor Swagger UI sobre `/api/openapi` |
| `api/` | 124 `route.ts`: **121 en `v1`** + `api/openapi/route.ts` + `api/cron/daily/route.ts` |

### 5.2 API `v1` por dominio (121 `route.ts`, 168 handlers)

| Dominio | `route.ts` | Endpoints clave (verbos) |
|---|---|---|
| **projects** | **48** | `GET/POST /projects`; `GET/PATCH/DELETE /projects/{id}`; `GET /projects/eligible-opportunities`; estructura: `objectives`, `activities`, `deliverables(+progress)`, `indicators(+measurements)`; ejecución: `budget`, `programming`, `expenses(+validate/reject/void/sign)`, `supports`, `beneficiaries`, `technical-status`, `financial-sheet`, `curve`, `kpis`, `attention`; gobierno: `members`, `modifications(+approve/reject)`, `baseline/approve`, `versions(+compare)`, `audit`, `template`, `import`, `export` |
| **clients** | **11** | `GET/POST /clients`; `GET/PATCH/DELETE /clients/{id}`; `export`; `{id}/contacts(+{contactId})`; `{id}/log`; `{id}/opportunities(+{opportunityId})`, `.../convert`, `.../project`, `.../tasks` |
| **tasks** | **11** | `GET/POST /tasks`; `GET/PATCH/DELETE /tasks/{id}`; `{id}/status`, `{id}/comments`, `{id}/subtasks(+{subtaskId})`, `{id}/attachments(+from-document, +download)`; `export`, `report` |
| **auth** | **9** | `POST login`, `POST logout`, `GET me`, `POST change-password`, `POST reset-password(+confirm)`, `GET accesos`, `POST reinvite`, `POST solicitud-acceso` |
| **dashboard** | **6** | `GET pipeline`, `GET tasks`, `GET clients-activity`, `GET my-summary`, `GET portfolio(+export)` |
| **documents** | **6** | `GET/POST /documents`; `GET/PATCH/DELETE /documents/{id}`; `{id}/download`; `{id}/versions(+{versionId}/download)`; `GET /documents/zip` |
| **users** | **3** | `GET/POST /users`; `GET/PATCH/DELETE /users/{id}`; `POST /users/{id}/deactivate` (rol ADMINISTRADOR) |
| **solicitudes-acceso** | **3** | `GET /solicitudes-acceso`; `POST /{id}/aprobar`; `POST /{id}/rechazar` |
| **notifications** | **3** | `GET /notifications`; `POST /read-all`; `POST /{id}/read` |
| **catalogs** | **2** | `GET/PATCH /catalogs/settings`; `GET /catalogs/users` |
| **dev** | **2** | `POST /dev/invite-token`, `POST /dev/reset-token` (bloqueados si `NODE_ENV === "production"`) |
| **folders** | **2** | `GET/POST /folders`; `GET/PATCH/DELETE /folders/{id}` |
| **municipalities** | **2** | `GET/POST /municipalities`; `PATCH/DELETE /municipalities/{id}` (escritura con `requireApiRole`) |
| **rubros** | **2** | `GET /rubros`; `PATCH/DELETE /rubros/{id}` (trigger de inmutabilidad de `codigo`) |
| **settings** | **2** | `GET/PATCH /settings`; `GET/PATCH /settings/semaforo-v2` |
| **strategic-lines** | **2** | `GET/POST /strategic-lines`; `PATCH/DELETE /{id}` |
| **auditoria** | **1** | `GET /auditoria` (paginación por cursor sobre `@@index([created_at, id])`) |
| **contacts** | **1** | `GET /contacts` (feed global con cuadrante poder×interés) |
| **cron** | **1** | `GET/POST /v1/cron/daily` (header `x-cron-secret` / `CRON_SECRET`) |
| **expense-validations** | **1** | `GET /expense-validations` (cola de validación cross-proyecto) |
| **interactions** | **1** | `GET /interactions` (feed de bitácora, tipo + próximo paso) |
| **nav** | **1** | `GET /nav/counts` (contadores de sidebar) |
| **uploads** | **1** | `POST /uploads/sign` (firma de subida a Supabase Storage) |

`projects` concentra el **39,7 %** de los `route.ts` (48/121): el módulo v2 es el centro de gravedad del sistema.

---

## 6. Los 3 mayores riesgos arquitectónicos

**R1 — `schema.prisma` no es la verdad de la base; `prisma migrate dev` es una vía destructiva latente.**
8 índices (7 parciales + 1 GIN por expresión), 5 funciones plpgsql y 8 triggers existen sólo en SQL crudo (§1.4). Prisma no los modela ni los conoce: cualquier `prisma migrate dev` / `migrate diff` futuro los verá como drift y propondrá `DROP INDEX`, borrando las garantías de «un solo principal», «un solo miembro activo», «código único entre vivos», la inmutabilidad de la auditoría y el índice que sostiene el buscador de documentos. La única defensa actual es que 30 de 32 migraciones son adoptivas escritas a mano y que `prisma.config.ts` carga `.env.local` en vez de `.env`. No hay test ni guard que detecte el drift.
*Evidencia:* `prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:171-184`, `20261011120000_v2_versiones/migration.sql`, `20260902190000_fase2_documentos_esquema/migration.sql:30-33`, `prisma/schema.prisma:739-742,768-782`.

**R2 — Toda la autorización vive en la aplicación; la base no tiene RLS y el acceso es con credencial directa.**
`ROW LEVEL SECURITY` / `CREATE POLICY` → **0 coincidencias** en `prisma/` y `supabase/`; no existe `supabase/migrations/`. `.env.example` configura `DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres` y `src/lib/db.ts:15-17` construye `PrismaPg` con `process.env.DATABASE_URL`: **el mismo usuario privilegiado que bypassea RLS sirve todas las requests**, y `NEXT_PUBLIC_SUPABASE_ANON_KEY` se usa únicamente para autenticar (cookie `sb-access-token`). La cobertura de gates en la aplicación es buena (98,8 % de handlers envueltos; 101/121 routes con `requireApiUser` literal y los 20 restantes explicados uno por uno en §2.2), pero **una sola ruta nueva que olvide el gate expone datos de negocio sin ninguna red de seguridad en la base**. El `TODO(Hito 7)` de `src/lib/supabase/server.ts:149` reconoce que los permisos granulares por módulo del PRD §3.3.2 quedaron fuera de alcance. Ver T3 §3 para la implicación de PostgREST/anon key.

**R3 — Duplicación deliberada de contratos HTTP entre servidor y cliente, sin verificación automática.**
El contrato de respuesta se declara tres veces: `select`/JSON del handler, schema Zod del spec (`src/lib/openapi/paths/*.ts`, respuestas escritas a mano) y DTO del hook (`src/hooks/projects.ts:41-55` y sus 2.221 líneas), que **no** importa los tipos de `src/lib/api/projects.ts` para no arrastrar `@/lib/db` al bundle del cliente (`src/hooks/projects.ts:3-5`). Los 38 schemas de **request** sí están anclados (importados del route), pero los de respuesta y los códigos de estado no. `src/lib/openapi/document.test.ts` valida la forma del spec, no su equivalencia con el handler. Un cambio de campo en un handler no rompe ni el spec ni el hook: el fallo aparece en runtime, en la UI.

---

## 7. Resumen ejecutivo

1. **Modelo de datos sólido y sin drift estructural:** 42 modelos, 21 enums, 32 migraciones (1.871 líneas SQL, 2026-08-11 → 2026-10-13) reproducen exactamente tablas, columnas y nombres de restricciones del schema; 0 `DROP TABLE`, 0 `DROP COLUMN`.
2. **El drift real es el inverso:** 8 índices, 5 funciones y 8 triggers viven sólo en SQL crudo porque Prisma no los expresa, y `prisma migrate dev` los borraría — riesgo nº1.
3. **Layering híbrido pero honesto:** los 27 módulos de producción de `src/lib/proyectos` son 100 % puros (0 imports de db/next/supabase/fs); la orquestación transaccional con invariantes de estado sí vive en los handlers (promedio 129 líneas, 30 bajo 60).
4. **Permisos consistentes** (`permissions.ts` puro, 166/168 handlers con `withApiErrorHandling`, 101/121 con `requireApiUser` y los 20 restantes justificados uno por uno), pero **sin RLS en Postgres**: la base no es red de seguridad.
5. **Higiene de tipos excepcional y verificada:** 0 `any`, 0 `as any`, 0 `@ts-ignore`, 0 `@ts-expect-error` (45 `as unknown as`, concentrados en tests y en `Prisma.InputJsonValue`); 1 solo TODO real; los puntos débiles son 41 archivos >500 líneas y un `shadcn` declarado como dependency de runtime sin uso.
