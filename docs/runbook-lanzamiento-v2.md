# Runbook de lanzamiento v2 a producción

Locator del plan: `odd/tasks/lanzamiento-v2-fin-de-semana.md` (tarea R8, ejecución en R9).

Este documento lo ejecuta el operador (el usuario) paso a paso, acompañado por Claude en la terminal. Cada paso trae el
comando exacto, lo que se espera ver y qué hacer si falla.

**Marca de verificación.** El ensayo R4 (corrida 2, 2026-10-16, restauración limpia del dump de producción en
PostgreSQL 17) confirmó casi todos los pasos. Los que siguen marcados con `⚠` **no se pudieron verificar**; cada marca
dice por qué y qué hacer. Si algo no coincide el domingo, se detiene y se avisa a Claude: no se improvisa durante el
lanzamiento.

## 0. Reglas que no se negocian

1. **Nunca pegues una URL con contraseña en el chat.** Las URLs se leen de archivos o del `.env` con comandos que no las
   imprimen.
2. **El `.env` de la raíz es PRODUCCIÓN.** `.env.local` es la base local de Docker. `prisma.config.ts` carga siempre
   `.env.local`, y `dotenv` **no pisa** variables ya exportadas. Por eso, para producción hay que **exportar
   `DATABASE_URL` y `DIRECT_URL` en el mismo shell**, y comprobar el host antes de cualquier `migrate`.
3. **Se usa el pooler de sesión (puerto 5432)**, nunca el de transacciones (6543), para migrar.
4. **`node_modules` se instaló desde Windows.** En WSL, `npx` pasa por el interoperador de Windows y **descarta en
   silencio** las variables de entorno exportadas o en línea. Por eso Prisma y `tsx` se ejecutan con `node` directo:
   - Prisma: `node node_modules/prisma/build/index.js …`
   - tsx: `node node_modules/tsx/dist/cli.mjs …`

   En el ensayo, Prisma se ejecutó así en WSL (`status`, `deploy` y `diff`) sin problemas. Los procesos que corren como
   Windows (`next dev`, vitest, o cualquier `npx`) reciben variables solo si se reenvían con `WSLENV`, por ejemplo
   `WSLENV=DATABASE_URL/u:DIRECT_URL/u`. Un `next dev` lanzado con `npx` de Windows solo es accesible desde WSL por la IP
   de la puerta de enlace del host Windows (`ip route`), no por `localhost`. Para el lanzamiento nada de esto aplica: se
   usa `node` directo.
5. **Todos los comandos se ejecutan en la carpeta principal del repositorio**
   (`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM`), en una **sola terminal WSL**, porque las variables exportadas viven
   solo en ese shell. Si cierras la terminal, repite el paso 3.2.
6. **Si algo falla y este documento no dice qué hacer: detente y avisa a Claude.** No uses `migrate resolve`, `db push`
   ni `migrate reset` por tu cuenta.
7. Producción tiene una migración fantasma, `20260918153200_tablero_seguimiento_social`, que no está en el repositorio.
   `migrate status` la va a reportar como «not found locally». **Es esperado, no es un error.**

## 1. Propósito, ventana, roles y criterios

**Propósito.** Publicar el módulo de Proyectos v2 sin dañar los datos de producción. Orden: **primero la base, después el
código**. La base se migra con la app vieja (`main`) todavía arriba, y luego se despliega el código nuevo.

**Ventana.** Domingo 2026-10-18 por la mañana (propuesta). Decisión G-2 **pendiente**; completar al acordarla:

| Campo | Valor |
|---|---|
| Fecha y hora de inicio | ______________________ |
| Hora límite para decidir «seguir o volver atrás» | ______________________ |
| Quién avisa a los usuarios | ______________________ |

**Roles.**

- **Operador (usuario):** ejecuta todos los comandos de producción, hace el merge, mira Vercel y los paneles.
- **Claude:** acompaña, lee los resultados que el operador pegue (sin URLs ni contraseñas), interpreta errores y decide
  contigo si se sigue o se vuelve atrás. No ejecuta nada remoto sin que el operador lo autorice paso a paso.

**Criterios de go / no-go (todos deben cumplirse antes de empezar).**

- [ ] Ensayo R4, corrida 2, **verde**: las 26 migraciones aplican sobre la copia de producción, `migrate diff` vacío,
  invariantes en verde, `s1-rubros` con el mismo resultado que el que se espera en el paso 5.
- [ ] R6b (revisión de entrega) sin hallazgos graves abiertos.
- [ ] Suite completa y `tsc` en verde sobre el commit que se lanza. (El build local está bloqueado por Fortinet por
  Google Fonts; el build real es el de Vercel.)
- [ ] La etiqueta `v2.0.0-rc1` existe sobre ese commit.
- [ ] Checklist T-24h y T-1h (sección 2) completo.
- [ ] G-2 acordada y, si hace falta, usuarios avisados.

**Si falta cualquiera de estos puntos: no-go.** Se reprograma. Una ventana perdida cuesta un día; una migración mala
cuesta datos.

## 2. Checklists previos

### 2.1 T-24h (sábado)

- [ ] **Supabase → Storage:** el bucket `muttu-docs` existe y es **privado** (o el valor de `SUPABASE_STORAGE_BUCKET`).
  Ningún código lo crea.
- [ ] **Supabase → Database → Cron:** los jobs `muttu-daily-8am` y `muttu-retry-830` están **activos**.
- [ ] El `CRON_SECRET` de Vercel coincide con el que usa la función `public.muttu_cron_daily()` en la base
  (`scripts/cron_setup.sql`). No pegues el secreto en el chat: compáralo en los paneles.
- [ ] **Supabase → Database → Backups:** hay respaldo diario o PITR activo. Anota la hora del último respaldo.
- [ ] **Supabase → Authentication → URL Configuration:** la URL de producción `/auth/confirm` está en la lista de
  redirecciones.
- [ ] **Vercel → Settings → General:** anota la versión de Node. ⚠ Sigue sin verificarse: depende de leer el panel de Vercel
  (lo hace el operador). Confirma que `package.json` y Next soportan esa versión; el build de Vercel lo dirá.
- [ ] **Vercel → Settings → Environment Variables:** `ENABLE_DEV_ROUTES` **no** está en `true` (lo mejor es que no
  exista) en Production. Las 12 variables de `main` siguen siendo las mismas; v2 no agrega ninguna.
- [ ] Vercel conserva el deploy actual de producción (será el destino del Instant Rollback). Anota su identificador.
- [ ] Hay espacio y tiempo: el dump necesita unos minutos y espacio en `~/muttu-backups`.

### 2.2 T-1h (domingo, antes de empezar)

- [ ] Repite 2.1 solo en lo que pueda haber cambiado: respaldo de Supabase, `ENABLE_DEV_ROUTES`, jobs de cron.
- [ ] Nadie más está editando datos críticos. Si hace falta, avisa a los usuarios de la ventana.
- [ ] Terminal WSL abierta en `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM`, con Claude Code en esa misma carpeta.
- [ ] Existe `~/.muttu-prod-url` (URI del **Session pooler** con la contraseña real) con permisos 600. Si no existe, créalo
  como en `odd/tasks/lanzamiento-v2-pendientes-viernes.md` (paso 1 y 2): **en la terminal, no en el chat**.
- [ ] Docker Desktop está arriba (el CLI de Supabase lo usa por dentro para el dump).

## 3. Paso a paso del lanzamiento (R9)

> Marca la hora de cada paso en una nota aparte. Si pasa algo raro, esas horas ayudan a decidir.

### 3.0 Punto de partida: código correcto y árbol limpio

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM
git status -sb
git rev-parse --abbrev-ref HEAD
git describe --tags --exact-match HEAD
```

**Se espera:** árbol limpio, rama `feat/projects-v2` y la etiqueta `v2.0.0-rc1` (o la que se haya acordado como
candidata final).

**Si falla:** hay cambios sin confirmar o la etiqueta no apunta a HEAD. **Detente** y avisa a Claude: no se migra con un
código distinto del ensayado.

### 3.1 Respaldo fresco y verificado

```bash
BACKUP_DIR=~/muttu-backups/$(date +%F-%H%M) && B="$BACKUP_DIR" && mkdir -p "$B" && cd "$B" \
 && U="$(cat ~/.muttu-prod-url)" \
 && supabase db dump --db-url "$U" -f roles.sql --role-only \
 && supabase db dump --db-url "$U" -f schema.sql \
 && supabase db dump --db-url "$U" -f data.sql --use-copy --data-only \
 && chmod 600 roles.sql schema.sql data.sql && chmod 700 "$B" \
 && eza -l --no-user "$B" && echo "BACKUP_DIR=$B" \
 && cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM
```

Anota el valor de `BACKUP_DIR` (lo usarás en la vuelta atrás, paso 5.3, donde se vuelve a definir a mano). Después verifica
contenido (si abriste otro shell, vuelve a definir `B="$BACKUP_DIR"` con esa carpeta):

```bash
for f in roles.sql schema.sql data.sql; do printf '%s  %s bytes\n' "$f" "$(stat -c %s "$B/$f")"; done
rg -c '^CREATE TABLE' "$B/schema.sql"
rg -c '^COPY ' "$B/data.sql"
rg -c 'session_replication_role' "$B/data.sql"
rg -n 'CREATE TABLE.*"?_prisma_migrations' "$B/schema.sql"
sha256sum "$B"/*.sql | tee "$B/SHA256SUMS"
stat -c '%a %n' "$B"/*.sql
```

**Se espera:**

- **3 archivos**, ninguno de tamaño 0; `data.sql` es el más grande. Tamaños comparables al dump del viernes
  (`~/muttu-backups/2026-10-16`; el del viernes tenía 15 usuarios, 21 clientes, 20 oportunidades, 123 tareas).
- `CREATE TABLE` > 0, `COPY` > 0, `session_replication_role` aparece (el dump de datos lo fija en `replica`).
- La tabla `_prisma_migrations` aparece en el esquema.
- Permisos `600`.

**Si falla:**

- Error de red (Fortinet): reintenta una vez; si persiste, avisa a Claude (sin la URL). **No se migra sin respaldo.**
- Algún archivo vacío o sin `COPY`: **no sirve**; borra la carpeta y repite.

### 3.2 Preparar el shell de producción (exports + comprobación de host)

Lee `DIRECT_URL` del `.env` raíz **sin imprimirla**, exporta ambas variables y compara con la URI del dump:

```bash
export DIRECT_URL="$(rg -o '^DIRECT_URL=(.*)' -r '$1' .env | tr -d "\"'")"
export DATABASE_URL="$DIRECT_URL"
HOST_ENV="$(printf '%s' "$DIRECT_URL" | rg -o '@([^:/?]+)' -r '$1')"
PORT_ENV="$(printf '%s' "$DIRECT_URL" | rg -o ':([0-9]+)/' -r '$1' | tail -n1)"
HOST_DUMP="$(cat ~/.muttu-prod-url | rg -o '@([^:/?]+)' -r '$1')"
echo "host(.env)=$HOST_ENV  puerto=$PORT_ENV  host(dump)=$HOST_DUMP"
test "$HOST_ENV" = "$HOST_DUMP" && test "$PORT_ENV" = "5432" && echo "OK: mismo host, pooler de sesión" || echo "STOP: no coincide"
case "$HOST_ENV" in 127.0.0.1|localhost) echo "STOP: es la base local";; esac
node -p "process.platform"
```

**Se espera:**

- Una línea con el host `…pooler.supabase.com`, puerto `5432`, y el mismo host del dump.
- `OK: mismo host, pooler de sesión`.
- `linux` en la última línea (es el `node` de WSL, no el de Windows).

**Si falla:**

- Imprime `STOP` o el host es `127.0.0.1`/`localhost`: **detente.** El `.env` no es el de producción o el puerto es 6543.
  No sigas hasta corregirlo con Claude.
- `node -p process.platform` imprime `win32`: el `node` es el de Windows y las variables podrían perderse. **Detente** y
  avisa a Claude. (En el ensayo, `node node_modules/prisma/build/index.js …` funcionó bajo WSL.)

**Para guardar el host exacto que se usará en `s1-rubros` (paso 3.7):**

```bash
export MIGRATE_V2_ALLOW_REMOTE_HOST="$HOST_ENV"
```

> Mientras esta variable esté exportada, los scripts de `scripts/migrate-v2` aceptan ese host remoto. Debe ser el
> **nombre de host a secas, sin puerto**. Si no coincide con el host de la conexión, la guarda rechaza la ejecución
> **antes de conectarse**. Se **borra** al terminar (sección 6).

### 3.3 `migrate status` antes de migrar (comprobación de host real)

```bash
node node_modules/prisma/build/index.js migrate status
```

**Se espera:**

- Una línea de datasource con el host `…pooler.supabase.com:5432`. **Confirma que es el host de producción** (no
  `127.0.0.1`). Si aparece `127.0.0.1`, **STOP**: las variables se perdieron.
- **37** migraciones encontradas y **26** pendientes (la de adopción `20260930000000_v2_adopt_production_v1_shape`,
  las 23 migraciones v2, la de conciliación `20261016120000_v2_reconcile_adopted_v1_drift` y la de documentos del
  proyecto `20261017120000_v2_soportes_proyecto_origen`). Así debe salir sobre la copia de producción (ensayo R7).
- Una advertencia por `20260918153200_tablero_seguimiento_social`: «applied to the database but missing from the local
  migrations directory» o equivalente. **Es la migración fantasma. Es esperado.**
- Ninguna migración en estado fallido.

**Si falla:**

- Host local o error de conexión: **STOP.** Revisa el paso 3.2.
- Una migración «failed» o «P3009» ya presente antes de empezar: **STOP**, avisa a Claude. No se resuelve a ciegas.
- El número de pendientes no es 26: **STOP**, avisa a Claude (el código no es el ensayado).

### 3.4 `migrate deploy`

Antes de migrar, confirma que el paso 3.1 terminó sin errores y que existe `BACKUP_DIR`.

```bash
node node_modules/prisma/build/index.js migrate deploy
```

**Se espera:** la lista de migraciones aplicadas en orden y, al final, «All migrations have been successfully applied».
Se aplican las **26** de una vez, sin pasos manuales previos.
La adopción `20260930000000_v2_adopt_production_v1_shape` elimina las 6 tablas v1 vacías y los enums v1 (solo si están
**vacías**; si alguna tuviera filas, aborta con un mensaje y no borra nada).

**Si falla (cualquier error): STOP.**

1. **No** ejecutes `migrate resolve`, `migrate deploy` otra vez, `db push` ni `migrate reset`.
2. Prisma deja la migración que falló **parcialmente aplicada** y bloquea nuevos deploys (error **P3009**).
3. Copia el mensaje de error (sin URLs) y pásalo a Claude.
4. Se decide con Claude: lo normal es **restaurar desde el respaldo** (sección 5, rama «Migración falló a medias») y
   mantener la app de `main`, que sigue arriba y no ha sido tocada.

### 3.5 Verificación posterior a la migración

**a) Estado:**

```bash
node node_modules/prisma/build/index.js migrate status
```

**Se espera:** «Database schema is up to date!» (más la advertencia esperada de la migración fantasma).

**b) Diferencia entre el esquema y la base:**

```bash
node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
echo "exit=$?"
```

**Se espera:** `-- This is an empty migration.` y `exit=0`. (Banderas confirmadas para la versión instalada de Prisma.)

- `exit=2` o diferencias listadas: **no avances.** Muestra la salida a Claude (el ensayo R4 esperaba cero diferencias; la
  migración de conciliación existe justo para esto).

**c) Consultas de conteo y forma.** Requiere `psql`. ⚠ Sin verificar: en los ensayos `psql` se corrió **dentro del
contenedor** de Postgres (`docker exec … psql`); que exista en el WSL del operador no se comprobó. Compruébalo antes del
domingo:

```bash
command -v psql || echo "no hay psql"
```

Si no hay `psql`, usa un contenedor desechable con la imagen **local** de Postgres 17 (Docker Desktop ya debe estar
arriba; la red restringida no permite descargar imágenes nuevas, por eso no se usa `postgres:17`). Define estas funciones
en el mismo shell; los comandos de abajo funcionan igual con `pg` en lugar de `psql`. La URL **no** va en los argumentos
(se vería en `ps`/`docker`): viaja por la variable de entorno `PGURL`, y el respaldo se monta solo lectura en `/backup`:

```bash
PGIMG=public.ecr.aws/supabase/postgres:17.6.1.143
export PGURL="$DIRECT_URL"
pg() { docker run --rm -i --network host -e PGURL -v "${BACKUP_DIR:-$PWD}":/backup:ro "$PGIMG" sh -c 'exec psql "$PGURL" "$@"' psql "$@"; }
```

```bash
pg -X -A -t -c "SELECT count(*) FROM rubros;" \
  -c "SELECT count(*) FILTER (WHERE codigo IS NOT NULL), count(*) FILTER (WHERE activo) FROM rubros;" \
  -c "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='EstadoProyecto';" \
  -c "SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='TipoNotificacion';" \
  -c "SELECT to_regclass('public.metas') IS NULL AS metas_v1_eliminada, to_regclass('public.objetivos') IS NOT NULL AS objetivos_v2_existe;" \
  -c "SELECT count(*) FROM pg_type WHERE typtype='e' AND typnamespace='public'::regnamespace;" \
  -c "SELECT to_regtype('public.\"LineaEstrategica\"') IS NULL AS sin_linea, to_regtype('public.\"TipoSoporte\"') IS NULL AS sin_tipo_soporte;" \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='rubros' ORDER BY 1;" \
  -c "SELECT conname FROM pg_constraint WHERE conrelid='public.lineas_presupuestales'::regclass AND contype='c';" \
  -c "SELECT count(*) FROM clientes;" -c "SELECT count(*) FROM oportunidades;" -c "SELECT count(*) FROM tareas;" -c "SELECT count(*) FROM auth.users;"
```

**Se espera:**

- `rubros`: **4** filas en total antes de `s1-rubros`, con la columna `codigo` y **sin** `deleted_at`; índices
  `rubros_pkey` y `rubros_codigo_key`. De las 4 filas:
  - 2 tienen código y están activas: `R01` Personal y `R12` Transporte.
  - 2 quedan suspendidas, con `activo = false` y `codigo` nulo: Material POP y Operación logística.

  Si ves otros números, **detente y avisa a Claude**: producción cambió desde el dump del 2026-10-16.
- Enums: solo los v2, **21** en total, y no existen `LineaEstrategica` ni `TipoSoporte` (`sin_linea = t`,
  `sin_tipo_soporte = t`).
- `EstadoProyecto` es exactamente `PLANIFICACION, BORRADOR, EN_EJECUCION, SUSPENDIDO, CERRADO, CANCELADO`.
- `lineas_presupuestales`: la única restricción CHECK es `lineas_monto_no_negativo_ck` y la tabla **no** tiene
  `deleted_at`.
- `TipoNotificacion` incluye `SOBREGASTO_RUBRO` y `GASTO_RECHAZADO`.
- `metas_v1_eliminada = t` y `objetivos_v2_existe = t`.
- Conteos de `clientes`, `oportunidades`, `tareas` y `auth.users` **iguales** a los de antes de migrar (los mismos que
  muestra el dump; el del viernes: 21, 20, 123, 15, más lo que se haya cargado desde entonces). **Una caída en estos
  conteos es una falla grave: STOP.**

### 3.6 Humo de la app vieja (`main`) sobre la base migrada

La app en producción sigue siendo `main`. Con la base ya migrada, comprueba en el sitio de producción:

- [ ] Inicia sesión con tu usuario administrador.
- [ ] Abre **Clientes** y un cliente con datos.
- [ ] Abre **Oportunidades** (tablero) y una oportunidad.
- [ ] Abre **Tareas** y crea o edita una tarea de prueba (o solo abre una existente, si prefieres no escribir).
- [ ] Abre el panel de **notificaciones** y **Configuración / usuarios**.
- [ ] Ninguna pantalla muestra error 500.

**Si falla:** la app de `main` no tolera el esquema migrado. Aviso inmediato a Claude. Decisión (sección 5, rama «App
rota»): si es una pantalla menor se continúa y se corrige con el deploy nuevo; si es el acceso o los datos, se restaura
el respaldo.

### 3.7 `s1-rubros` en producción

Carga el catálogo de 15 rubros (R01–R15). Pasa por la guarda `scripts/migrate-v2/_guard.ts`, que solo acepta un host
remoto si `MIGRATE_V2_ALLOW_REMOTE_HOST` es **exactamente** ese host, y exige `--expect-hash` en un `--apply` remoto.

**a) Dry-run** (no escribe nada; guarda un informe en la carpeta local de informes, ignorada por git):

```bash
echo "$MIGRATE_V2_ALLOW_REMOTE_HOST"
node node_modules/tsx/dist/cli.mjs scripts/migrate-v2/s1-rubros.ts --dry-run
```

**Se espera:**

- Un encabezado `# Migration dry-run: s1-rubros  (db host: <host>:5432)  plan-hash: <sha>`. **El host debe ser el de
  producción.** Copia el `plan-hash` completo (no lo recortes).
- La tabla de conteos de `rubro`: **crea 13, actualiza 1, omite 1**, igual que en el ensayo. Si los números son
  distintos: **STOP** y avisa a Claude; el estado de producción no es el ensayado.
- Sobre la copia de producción del ensayo el `plan-hash` fue
  `1894d2b931019f4d46e0f0583ac61717c170cd0e823b2b30b55092c49ceb932f` (igual en dos restauraciones). **Se usa siempre el
  hash que imprime el dry-run de producción el domingo**, no este. Si los rubros de producción cambiaron desde el
  2026-10-16 09:20, el hash será distinto: es una señal de **STOP y avisar a Claude**, no de seguir.

**Si falla:**

- `Refusing to run against a non-local database` o `NonLocalDatabaseError`: el host exportado no es **exactamente** el de
  `DIRECT_URL`/`DATABASE_URL`, o `MIGRATE_V2_ALLOW_REMOTE_HOST` no está exportada. Revisa el paso 3.2. No cambies la
  guarda.
- El host mostrado es `127.0.0.1`: las variables se perdieron al pasar por Windows (ver regla 4 y 3.2). Con
  `node …/cli.mjs` directo no ocurre. Si alguna vez se usara `npx`, el reenvío sería
  `WSLENV=DATABASE_URL/u:DIRECT_URL/u:MIGRATE_V2_ALLOW_REMOTE_HOST/u`. ⚠ Ese reenvío con `npx` no se ensayó contra
  producción; no lo uses el domingo.

**b) Aplicar** (solo si el dry-run coincide con el ensayo):

```bash
HASH=PEGA_AQUI_EL_PLAN_HASH_COMPLETO_DEL_DRY_RUN   # el hash completo que imprimió el dry-run de producción
node node_modules/tsx/dist/cli.mjs scripts/migrate-v2/s1-rubros.ts --apply --expect-hash "$HASH"
```

**Se espera:** «Applied N action(s) … lote s1-rubros-AAAAMMDD-HHMMSS». En el ensayo fueron **14 acciones**. **Anota el
`lote`**: lo necesita `--revert`.

**Si falla:** `Plan hash mismatch` significa que la base cambió entre el dry-run y el apply; **no se escribió nada**. Repite
el dry-run y compara. Cualquier otro error: STOP y avisa a Claude.

**c) Verificar:**

```bash
psql "$DIRECT_URL" -X -A -t -c "SELECT count(*) FILTER (WHERE codigo IS NOT NULL AND activo) FROM rubros;"
```

**Se espera:** `15` (R01 a R15 activos). En el ensayo el resultado fue **17 rubros en total, 15 activos**.

### 3.8 Merge `feat/projects-v2` → `main`

Este paso lo hace el operador, solo si los pasos 3.1 a 3.7 salieron bien. La excepción de «un merge grande, sin PRs
encadenados» ya fue aceptada (G-1).

1. Elige la vía según la política del repositorio: **PR** hacia `main` (recomendado: deja registro y corre CI) o merge
   directo.
2. **Merge directo (si se elige):**

   ```bash
   git switch main && git pull --ff-only && git merge --no-ff feat/projects-v2 -m "merge: release v2 projects module"
   git log --oneline -3
   ```

   **Se espera:** merge sin conflictos. **Si hay conflictos:** STOP; `main` no se tocaba desde 2026-09-30, así que un
   conflicto es una sorpresa que Claude debe revisar. No empujes.
3. **El push a `main` dispara el deploy de Vercel.** Antes de empujar, confirma que el paso 3.5 está completo.

   ```bash
   git push origin main
   ```

   **Si falla el push:** el problema conocido es el certificado de Fortinet en WSL. La alternativa documentada es empujar
   desde Git de Windows (`docs/pasos-post-reunion-2026-10-14.md`).

### 3.9 Deploy en Vercel

- En **Vercel → Deployments**, abre el deploy nuevo y espera a que termine el **build** (Next.js corre `prisma generate`
  y `next build`; **el build no ejecuta migraciones**, por eso se hicieron antes).
- **Se espera:** estado «Ready» y producción apuntando al deploy nuevo.
- **Si el build falla:** el sitio sigue sirviendo el deploy anterior (Vercel no promueve un build fallido). Copia el
  error a Claude. Es un problema de código, no de datos; no hay que restaurar nada.
- Verifica que `ENABLE_DEV_ROUTES` no esté en `true` en Production (sección 2).

### 3.10 Humo v2

Recorre la sección 4 completa sobre la URL de producción.

## 4. Checklist de humo v2

**Sin sesión (verificado en el ensayo sobre la copia migrada, servidor de desarrollo).** Respuestas esperadas:
`/login` 200; `/` y `/proyectos` 307 hacia el login; `/api/v1/projects` y `/api/v1/clients` 401; `/api/openapi` 200;
el cron: `GET` 405, `POST` sin secreto 401, `POST` con secreto 200; `/api/v1/dev/reset-token` 404.

**Con sesión: NO se verificó en el ensayo.** Todas las pantallas autenticadas de la lista siguiente se prueban por
primera vez en producción, así que son parte obligatoria del humo posterior al despliegue.

Marca cada punto. Usa dos roles al menos (administrador y un rol no gerencial) para comprobar los permisos.

- [ ] **Login por rol:** administrador, gerencia y un rol de ejecución entran sin error; cada uno ve solo lo suyo.
- [ ] **Portafolio de proyectos:** abre `/proyectos`; la lista carga. Los **filtros** por cliente, línea, municipio y
  responsable funcionan.
- [ ] **Tablero gerencial:** carga sin error; el municipio es solo un filtro (sin semáforo territorial).
- [ ] **Ficha del proyecto con 5 pestañas:** Resumen, Actividades, Finanzas, Documentos e Historial. En el encabezado: los
  semáforos, «Registrar avance», «Registrar gasto» y el menú «Más acciones».
- [ ] **Registrar un gasto** de prueba en un proyecto de prueba (en ejecución).
- [ ] **Registrar un avance** en una actividad.
- [ ] **Validar** un gasto, y **rechazar** otro con motivo. Validar y rechazar exigen proyecto en ejecución o suspendido
  (decisión D1).
- [ ] **Notificación de rechazo:** quien registró el gasto rechazado recibe la notificación «Gasto rechazado» con el
  motivo y el enlace.
- [ ] **Documentos:** abre un soporte; la **URL firmada** descarga el archivo (el bucket `muttu-docs` es privado, así que
  una URL sin firma debe fallar).
- [ ] **Imprimir / PDF:** «Más acciones → Imprimir / PDF → Ctrl+P» muestra solo la hoja, sin el menú lateral.
- [ ] **Crear un proyecto:** empieza por el cliente, muestra su tarjeta y las oportunidades de ese cliente.
- [ ] **Clientes:** ya no aparecen las pestañas Oportunidades y Mapa; el botón «Crear proyecto» está en la ficha del
  cliente.
- [ ] **Catálogo de rubros:** el presupuesto de un proyecto de prueba ofrece los rubros R01–R15.
- [ ] **Ancho angosto (celular o ventana de 390 px):** nada se sale de la pantalla.
- [ ] **Sin errores en Vercel:** en **Vercel → Logs** no hay una ráfaga de errores 500 en los primeros minutos.
- [ ] **Cron diario, al día siguiente:** a las 8:00 (hora Colombia) corre `muttu-daily-8am`; confirma en **Supabase →
  Database → Cron** (historial del job) y en la tabla `cron_logs` que terminó bien, y que llegó el resumen. El reintento
  de las 8:30 solo envía si el de las 8:00 falló.

**Borra o anula los datos de prueba** que hayas creado, o márcalos claramente, para no ensuciar el portafolio.

**Decisión de las 3 horas:** si el humo está verde, se **mantiene**. Si hay un fallo que impide trabajar, se vuelve atrás
según la sección 5.

## 5. Vuelta atrás

### 5.1 Qué es reversible y qué no

| Cambio | ¿Reversible? | Nota |
|---|---|---|
| Código (deploy de Vercel) | **Sí, de inmediato** | Instant Rollback al deploy anterior. La base queda migrada y es compatible con `main` (las migraciones son aditivas) |
| Esquema y datos de `public` | **Sí, con el respaldo** | PITR de Supabase (preferido) o restaurar `public` desde el dump (5.3); se pierde lo escrito después del respaldo |
| Valores añadidos a un enum (`GASTO_RECHAZADO`, etc.) | **No** | PostgreSQL no permite quitar valores de un enum. Quedan; son inocuos para `main` |
| Las 6 tablas v1 vacías y sus enums, eliminados por la migración de adopción | **Solo con el respaldo** | Estaban vacías; no hay datos que perder, pero la forma v1 solo vuelve restaurando |
| Tablas de auditoría (`auditoria_cambios`) y notificaciones, una vez que hay uso | **No se «deshacen»** | Son de solo escritura (append-only); la restauración del respaldo es lo único que las retrotrae |
| `s1-rubros --apply` | **Parcial** | Ver 5.5 |

### 5.2 Árbol de decisión

```
¿En qué paso falló?
│
├─ Antes de migrar (pasos 3.0 a 3.3): no hay nada que deshacer. Se corrige y se reintenta, o se reprograma.
│
├─ migrate deploy falló a medias (3.4)  ──► 5.3  (restaurar respaldo, app de main sigue arriba)
│
├─ La migración terminó pero los conteos o el diff no cuadran (3.5)  ──► STOP, Claude decide;
│       datos faltantes ──► 5.3
│
├─ s1-rubros dejó datos incorrectos (3.7)  ──► 5.5
│
└─ La app nueva falla después del deploy (3.9 / 3.10)
        ├─ Falla de código (pantalla, permiso, build)  ──► 5.4  (revertir Vercel; la base se queda)
        └─ Falla de datos (faltan o están corruptos)  ──► 5.4 y luego 5.3
```

### 5.3 Migración falló a medias, o los datos están mal: restaurar el respaldo

**Primera opción: PITR / restauración de Supabase** desde el panel (Database → Backups), al instante previo al paso 3.4.
Es más segura que restaurar a mano. Apunta la hora exacta del paso 3.1.

**Segunda opción (solo si PITR no sirve): restaurar el dump, solo el esquema `public`.** Las migraciones de v2 únicamente
cambian `public` (y `_prisma_migrations`, que vive ahí). Por eso la vuelta atrás por dump **restaura únicamente `public`**
y deja `auth` y `storage` como están: el `data.sql` trae también los `COPY` de unas 26 tablas de `auth` y 7 de
`storage`, que chocarían con las filas existentes y abortarían la carga a medias. Esos `COPY` se **filtran**.

Dos detalles que el procedimiento respeta, y por qué **no** se hace `DROP SCHEMA public CASCADE`:

- `pg_net` está instalada **dentro** de `public` y varios disparadores de evento de Supabase dependen de ella (y de
  `rls_auto_enable`). Un `DROP SCHEMA … CASCADE` los eliminaría y el dump no los recrea. Se borran solo los objetos de la
  aplicación (tablas, vistas, secuencias, enums y funciones), conservando los de extensiones y las dos funciones que el
  `schema.sql` redefine (`muttu_cron_daily`, `rls_auto_enable`).
- Al conservar el esquema se conservan sus permisos (`USAGE` para `anon`, `authenticated` y `service_role`). Los permisos
  **por defecto** de `public` sí se quitan un momento antes de recrear las tablas (paso 3): producción tiene casi todas
  las tablas solo para `postgres` y `service_role`, y sin ese paso las tablas nuevas nacerían con `ALL` para `anon` y
  `authenticated`. El `schema.sql` aplica después los `GRANT` exactos, las políticas, el RLS y las funciones, y deja los
  permisos por defecto como estaban.

No hace falta restaurar `roles.sql` (la migración no toca roles).

Perdería lo escrito en `public` después del respaldo; el paso 1 guarda una copia de lo actual por si hay que recuperar algo.

```bash
# 0) Variables y funciones. Ajusta BACKUP_DIR a la carpeta del paso 3.1 (AAAA-MM-DD-HHMM) y confirma el host (paso 3.2)
BACKUP_DIR=~/muttu-backups/2026-10-16
PGIMG=public.ecr.aws/supabase/postgres:17.6.1.143
export PGURL="$DIRECT_URL"   # la URL va por entorno, nunca en los argumentos
pg()     { docker run --rm -i --network host -e PGURL -v "$BACKUP_DIR":/backup:ro "$PGIMG" sh -c 'exec psql "$PGURL" "$@"' psql "$@"; }
pgdump() { docker run --rm -i --network host -e PGURL "$PGIMG" sh -c 'exec pg_dump "$PGURL" "$@"' pg_dump "$@"; }
echo "host=$(printf '%s' "$PGURL" | rg -o '@([^:/?]+)' -r '$1')"; eza -l "$BACKUP_DIR"
test -s "$BACKUP_DIR/schema.sql" && test -s "$BACKUP_DIR/data.sql" && echo "OK: respaldo presente" || echo "STOP: falta el respaldo"

# 1) Copia de lo que hay ahora en public (forense; contiene datos reales, queda con permisos 600 junto al respaldo)
( umask 077; pgdump --schema=public > "$BACKUP_DIR/forense-public-$(date +%F-%H%M).sql" ) && eza -l "$BACKUP_DIR"

# 2) SOLO tras confirmarlo con Claude: vaciar los objetos de la aplicación en public (destructivo; conserva extensiones)
pg -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relkind, c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY (c.relkind = 'S')
  LOOP
    EXECUTE format('DROP %s IF EXISTS public.%I CASCADE',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE'
                     WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN
    SELECT t.typname FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e','d')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS firma FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')
      AND p.proname NOT IN ('muttu_cron_daily','rls_auto_enable')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP ROUTINE IF EXISTS %s CASCADE', r.firma);
  END LOOP;
END $$;
SQL

# 3) Esquema (todo public: tablas, enums, índices, RLS, políticas, funciones y GRANT); una sola transacción.
#    Antes se quitan los permisos por defecto de public: si no, las tablas nacen con ALL para anon y authenticated y el
#    dump (que solo suma GRANT) no los quita. El propio schema.sql los restablece al final.
pg -X -v ON_ERROR_STOP=1 \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role" \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role" \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role"
pg -X -v ON_ERROR_STOP=1 --single-transaction -f /backup/schema.sql

# 4) Datos, FILTRADOS: el preámbulo (SET …), los COPY de public y los setval de public. Se descartan auth y storage
awk '
inblk                { if (keep) print; if ($0 == "\\.") inblk = 0; next }
/^COPY /             { seen = 1; inblk = 1; keep = ($0 ~ /^COPY ("public"|public)\./); if (keep) print; next }
!seen                { print; next }
/^SELECT pg_catalog\.setval\(.("public"|public)\./ { print; next }
/^RESET ALL;/        { print }
' "$BACKUP_DIR/data.sql" | pg -X -v ON_ERROR_STOP=1 --single-transaction -f -

# 5) Comprobación: 28 tablas, 12 migraciones (incluida la fantasma) y conteos de antes de migrar
pg -X -A -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" \
  -c "SELECT count(*) FROM _prisma_migrations;" \
  -c "SELECT (SELECT count(*) FROM clientes), (SELECT count(*) FROM oportunidades), (SELECT count(*) FROM tareas), (SELECT count(*) FROM usuarios), (SELECT count(*) FROM rubros), (SELECT count(*) FROM auth.users);"
```

**Se espera:** sin errores en los pasos 2, 3 y 4 (todo corre con `ON_ERROR_STOP=1` y en una transacción: si algo falla,
no queda a medias). El paso 5 imprime `28`, `12` y los conteos del dump (el del viernes: 21 clientes, 20 oportunidades,
123 tareas, 15 usuarios, 4 rubros, 15 `auth.users`). Después, `migrate status` vuelve a mostrar las **26** migraciones
pendientes y la advertencia esperada del fantasma, y las tablas v1 (`proyectos`, `metas`, `actividades`, `gastos`,
`indicadores`, `lineas_presupuestales`, `soportes_proyecto`) vuelven a existir.

**Después:** la app de `main` sigue siendo la de producción; no se hace el merge. Se avisa a los usuarios, y se
reprograma con Claude tras entender la causa.

**Si el esquema `public` restaurado no coincide o hay errores:** no sigas improvisando. Detén, copia el error a Claude y
usa PITR.

**Ensayo (2026-10-16, contenedor local `muttu-rehearsal`, base `rollback_test`):** se restauró el dump del viernes, se
corrió `migrate deploy` (37 migraciones, 43 tablas en `public`) y se añadió una fila marcador en `lineas_estrategicas`
para simular escrituras posteriores al lanzamiento. Luego se ejecutó este procedimiento, tal cual, sin errores. Resultado:
las 28 tablas de `public` con los mismos conteos que antes de migrar (por ejemplo `accesos` 93, `auditoria` 560,
`notificaciones` 583, `clientes` 21, `oportunidades` 20, `tareas` 123, `usuarios` 15, `rubros` 4); `_prisma_migrations`
de vuelta en 12 filas (con la fantasma) y `migrate status` con las 25 pendientes más la advertencia del fantasma; tablas
v1 de vuelta y `lineas_estrategicas` inexistente (la fila marcador desapareció); tipos, índices, restricciones, RLS,
`GRANT` de tablas y funciones, y permisos por defecto idénticos a los de una restauración limpia; `pg_net` y los 6
disparadores de evento intactos; `auth.users` sin cambios (15, mismos ids). En ese ensayo se descubrieron y corrigieron
dos fallos del primer borrador: los permisos por defecto de `public` daban `ALL` a `anon` y `authenticated` en las tablas
recreadas, y `DROP SCHEMA public CASCADE` habría borrado `pg_net`. **Lo que el ensayo no cubre:** que el rol `postgres`
de Supabase sea dueño de `public` (en el ensayo lo era) y el pooler de sesión de producción; por eso la primera opción
sigue siendo PITR y esta se ejecuta solo tras confirmarla con Claude.

### 5.4 La app nueva está rota: revertir Vercel

1. **Vercel → Deployments →** el deploy anterior que anotaste → menú `⋯` → **«Instant Rollback»** (o «Promote to
   Production»).
2. Comprueba que el sitio responde con la app vieja (paso 3.6).
3. **La base se queda migrada.** Es compatible con la app vieja. Si el problema era de código, se corrige y se vuelve a
   lanzar sin tocar la base.
4. Si hubo un merge a `main` y quieres que `main` también vuelva atrás, no hagas `git push --force`. Pídele a Claude un
   `git revert -m 1 <merge>` y empújalo como un commit nuevo.

### 5.5 `s1-rubros`: los datos quedaron incorrectos

Revertir con el lote anotado en el paso 3.7:

```bash
LOTE=PEGA_AQUI_EL_LOTE_ANOTADO   # p. ej. s1-rubros-AAAAMMDD-HHMMSS, el que anotaste en el paso 3.7
node node_modules/tsx/dist/cli.mjs scripts/migrate-v2/s1-rubros.ts --revert "$LOTE"
```

**Límites del `--revert`:** borra **solo los rubros que ese lote creó** (registrados con acción `IMPORTAR` en
`auditoria_cambios`). **No deshace** los cambios de nombre y de orden que el lote hizo sobre rubros ya existentes (el
«actualiza 1»: queda con el nombre y orden nuevos; el valor anterior está en `auditoria_cambios`, `campo = 'nombre'`).
Si algún rubro creado ya lo usa una línea de presupuesto o un gasto, el borrado fallará por la FK: no lo fuerces.
Avisa a Claude. Para retrotraer todo, se usa el respaldo (5.3).

## 6. Después del lanzamiento

- [ ] **Quitar la variable del shell:** `unset MIGRATE_V2_ALLOW_REMOTE_HOST DATABASE_URL DIRECT_URL` y cierra la terminal.
  Comprueba con `env | rg -c 'MIGRATE_V2_ALLOW_REMOTE_HOST|^DIRECT_URL|^DATABASE_URL'` que imprime `0` o nada.
- [ ] **Respaldos:** `~/muttu-backups` contiene **datos reales de clientes**. Se conserva **N días** (decisión del
  usuario: ______ días, sugerido: hasta confirmar que la primera semana de uso es estable) y luego se borra con
  `rm -rf ~/muttu-backups/<carpeta>`. Nunca se sube al repositorio ni se comparte. `~/.muttu-prod-url` también se borra
  cuando ya no se necesite.
- [ ] **Etiqueta:** si todo está bien, crea la etiqueta definitiva (por ejemplo `v2.0.0`) sobre el commit lanzado y empújala.
- [ ] **Monitoreo de las primeras 24 h:**
  - **Vercel → Logs:** errores 500 y tiempos de respuesta, cada pocas horas el primer día.
  - **Supabase → Database → Cron:** `muttu-daily-8am` corrió el lunes a las 8:00 y no necesitó el reintento de las 8:30.
  - **Supabase → Logs:** consultas lentas o errores de conexión (el pooler de transacciones, 6543, es el que usa la app).
  - **Retroalimentación de los usuarios:** un canal único para reportes; Claude los clasifica.
  - Revisa que **nadie** dependa de la ruta eliminada «Oportunidades/Mapa» dentro de Clientes.
- [ ] **Anotar en `odd/tasks/lanzamiento-v2-fin-de-semana.md`** la hora real de cada paso, los resultados y los
  incidentes (R9).
- [ ] Qué se queda fuera del lanzamiento (resto de v7, cierre/suspensión de proyectos, importación de gastos por Excel)
  sigue en el plan para después.
