# Lanzamiento v2 a producción: fin de semana del 2026-10-15 al 2026-10-18

Locator: `odd/tasks/lanzamiento-v2-fin-de-semana.md` · Mirror de Engram: `odd/lanzamiento-v2-fin-de-semana/tasks`

## Objetivo

Publicar en producción el módulo de Proyectos v2 y el avance de los tres documentos de requerimientos, antes del lunes
2026-10-19 y sin romper los datos de producción. Los documentos son RF Detalle Clientes, RF Tablero de Seguimiento y RF
v2 Módulo Proyectos. A esto se suman los pedidos de la reunión con el cliente del 2026-10-14.

## Problema y por qué

- La gerencia pidió el lanzamiento antes del lunes. El criterio es «se corrige con el uso».
- Ese criterio vale para lo funcional, porque se arregla con otro deploy. **No** vale para los datos.
- `feat/projects-v2` está 335 commits (+114k / −7k líneas) por delante de `main`. `main` no se toca desde el 2026-09-30.
- Hay 21 migraciones que producción nunca recibió y que nunca se ensayaron contra datos reales.
- Las migraciones son **aditivas**: tablas nuevas, columnas nulas o con valor por defecto, `ADD VALUE` en un enum y
  renombres de FK. Ninguna borra tablas ni columnas, ni cambia tipos.
- Por eso la estrategia es **primero la base, después el código**. Se migra la base mientras la app vieja sigue
  arriba, y después se despliega el código nuevo.
- Si falla el código, se revierte solo el código, con Instant Rollback de Vercel.
- Si falla la base, se restaura el respaldo.

## Avance de partida (medido el 2026-10-14 y el 2026-10-15)

```
RF v2 Módulo Proyectos       90 %  (solo los 36 RF: 96 %)
RF Tablero y Gestión Social  95 %
RF Detalle Clientes          83 %
v7 total                     65 %  (fuera del compromiso del lunes)
```

## Alcance

- **Entra:**
  - Los huecos de los tres RF que no dependen de decisiones abiertas.
  - Los pedidos de la reunión (M1 a M7).
  - El **rediseño de la ficha del proyecto**: pasa de 11 pestañas a 5, el semáforo se simplifica y se suman ayudas al
    crear un proyecto (carriles U y X).
  - La ruta de lanzamiento completa: ensayo, runbook, respaldo, migración y deploy.
- **Sale del alcance:** el pulido v7 pestaña por pestaña (D1 a D6). Lo reemplaza el rediseño.
- **No entra:** el resto de v7, que incluye kanban y ficha de oportunidad, salud de cartera, mapa, convocatorias y
  propuesta económica. Tampoco entran cerrar, suspender o cancelar proyectos (PO-3) ni la importación de gastos por
  Excel (PO-11).

## Restricciones

- **Esquema congelado.** Solo se admite una migración aditiva de lanzamiento (tarea R3), y solo si M3 o M7 la piden. Su
  dueño es Claude y tiene que estar lista el viernes a las 12:00 para que el ensayo 1 la cubra.
- **Base de datos.** Todo comando de base de datos carga `.env.local` o el archivo del ensayo, nunca `.env`, que apunta a
  Supabase remoto. Los scripts reutilizan la guarda de `scripts/migrate-v2/_guard.ts`.
- **Operaciones remotas.** El dump, `migrate status`, `migrate deploy` en producción, el push y el deploy los ejecuta el
  usuario, o los autoriza de forma explícita una por una.
- **Entrega.** Va un solo merge grande de `feat/projects-v2` a `main` como excepción aceptada por la gerencia (pendiente
  G-1). No se usan PRs encadenados de 400 líneas.
- **Push.** Vercel despliega desde GitHub, así que sin push no hay lanzamiento. Tiene que estar destrabado el viernes.
- **Pruebas.** Los dos agentes no corren la suite completa en paralelo. La corre solo Claude.

## Carriles y aislamiento

| | Claude | DeepSeek |
|---|---|---|
| Rama | `feat/projects-v2`, la de integración | `feat/ficha-ux-finanzas`, creada desde `feat/projects-v2` |
| Carpeta | la carpeta principal del repo | worktree `../MuttuHub-CRM-worktrees/ficha-ux` |
| Base | Supabase local (54322) y el contenedor de ensayo `postgres` (54330) | La misma Supabase local, **solo para navegar** la app. Nunca corre `prisma migrate`, `db push`, `reset` ni seeds |
| Puerto | 3000 | 3001 |
| Superficie exclusiva | Todo lo que no es de DeepSeek. En particular: `project-ficha.tsx`, `src/components/proyectos/ficha/ficha-resumen*`, `ficha/ficha-actividades*`, `ficha/actividades-*`, el resto de `src/components/proyectos/**`, `prisma/**`, `scripts/**`, `src/app/**`, `src/lib/**`, `src/hooks/**`, `src/components/crm/**`, `docs/**`, `odd/tasks/lanzamiento-v2-fin-de-semana.md` | `src/components/proyectos/ficha/ficha-finanzas*`, `ficha/ficha-documentos*`, `ficha/ficha-historial*`, `project-financiero*`, `project-presupuesto*`, `presupuesto-programacion*`, `tacometro*`, `project-gastos*`, `gastos-kpis*`, `gasto-*`, `project-soportes*`, `project-modificaciones*`, `project-versiones*`, `odd/tasks/lanzamiento-v2-deepseek-log.md` |
| No toca | la superficie de DeepSeek | todo lo demás: `package.json`, el lockfile, `src/hooks/**`, `src/lib/**` y la API. Si falta un dato, lo pide |

La integración es **progresiva y en un solo sentido**.

- Cada vez que DeepSeek cierra una tarea (`LISTO PARA INTEGRAR: Xn` en su log), Claude hace
  `git merge --no-ff feat/ficha-ux-finanzas` sobre `feat/projects-v2`. Después corre las pruebas de los archivos tocados
  y `tsc`.
- Los worktrees comparten el repositorio, así que no hace falta push.
- DeepSeek nunca trae la rama de Claude.
- Claude solo hace merge entre sus propias tareas, nunca con un escritor suyo editando.
- Claude monta los componentes de DeepSeek en la ficha cuando U2 deja lista la barra de 5 pestañas.

## Decisiones

| ID | Pregunta | Estado | Respuesta | Bloquea |
|---|---|---|---|---|
| PO-1 | Semaforización territorial | ✅ 2026-10-15 | Quitarla. El municipio queda solo como filtro (RF v2, REQ-DSH-04) | F1 |
| PO-2 | PDF en el lanzamiento o solo Excel | ✅ 2026-10-15 | El PDF sale de la impresión del navegador: una vista imprimible de la ficha que el usuario guarda como PDF. No hay motor en el servidor. `formato=pdf` de la API sigue sin soporte | F13 |
| PO-4 | ¿Se admiten proyectos de un día (inicio = fin)? | ✅ 2026-10-15 | No. Inicio estrictamente anterior al fin (V-03), igual que en la importación | F4 |
| PO-5 | ¿`valor_total > 0` desde la creación? | ✅ 2026-10-15 | Sí. Es obligatorio y > 0 al crear (REQ-ORG-04) | F5 |
| M1 | Crear desde cliente: ¿por defecto «independiente» u ocultar el camino por oportunidad? | ✅ 2026-10-15 | Siempre se elige primero el cliente. Después se puede elegir, de forma opcional, una oportunidad de ese cliente (la FK compuesta ya lo garantiza). La conversión desde una oportunidad ganada se mantiene | F8 |
| M2 | ¿Qué datos del cliente muestra la tarjeta al seleccionarlo? | ✅ 2026-10-15 | Una tarjeta de solo lectura con NIT, sector, ciudad, contacto principal y conteo de oportunidades y proyectos. Debajo, la lista de oportunidades del cliente para elegir una (opcional, M1). Tamaño M | F8 |
| M3 | ¿El proyecto lleva descripción en el lanzamiento? Requiere migración aditiva | ✅ 2026-10-15 | Sí, opcional: columna `descripcion` nula, se captura al crear y se edita en la ficha | F9, R3 |
| M4 | «Primero clientes, luego oportunidades»: ¿orden de menú (ya se cumple) o flujo? ¿Se ocultan las pestañas vacías de Clientes? | ✅ 2026-10-15 | El orden del menú ya se cumple. Se ocultan las pestañas vacías, que son solo Oportunidades y Mapa (`ClientesSectionPlaceholder`) | F10 |
| M5 | Beneficiarios «solo cantidad»: ¿la meta, los atendidos o ambos? ¿Se quita el historial por actividad? | ✅ 2026-10-15 | Beneficiarios deja de ser sección. Queda un solo número editable, «Beneficiarios», en los datos generales. Desaparecen el registro de atendidos y el KPI atendidos/meta | F14 (D5 y F2 cancelados) |
| M6 | «Observado» → «Pendiente por revisión»: ¿renombrar solo la etiqueta? | ✅ 2026-10-15 | Solo la etiqueta, en el filtro, el KPI y la alerta. Se mantiene el criterio (sobregasto o datos incompletos) | F11 |
| M7 | Notificar el rechazo de un gasto: ¿con el motivo? ¿también al anular? Requiere migración aditiva (enum) | ✅ 2026-10-15 | Solo al rechazar, con el motivo en el mensaje y enlace al gasto. Nuevo `GASTO_RECHAZADO`; las notificaciones de proyecto se abren a quien registró el gasto | F12, R3 |
| UX-1 | Rediseño de la ficha | ✅ 2026-10-15 | Mapa de 5 pestañas aprobado: Resumen, Actividades, Finanzas, Documentos e Historial. El semáforo vive solo en el encabezado; Resumen explica la causa. La ficha la usan el ejecutor y gerencia por igual: abre en Resumen, con «Registrar avance» y «Registrar gasto» en el encabezado | U2–U8, X2–X6 |
| UX-2 | Ayudas al crear un proyecto | ✅ 2026-10-15 | Pistas contextuales en cada paso y en cada campo no obvio del stepper, y en la carga por Excel | U7 |
| UX-3 | Editar los datos generales después de crear el proyecto | ✅ 2026-10-15 | Botón «Editar datos generales» en Resumen, para quien gestiona el proyecto. En borrador: nombre, descripción, fechas, valor, responsable, beneficiarios, líneas y municipios. En ejecución: solo descripción y beneficiarios; fechas y valor siguen por Modificaciones, porque cambian la línea base. El usuario delegó la decisión en la recomendación de Claude | F15 |
| G-1 | La gerencia acepta un merge grande sin PRs encadenados | ✅ 2026-10-15 | La gerencia delegó la decisión en el usuario. El merge a `main` se hace solo si la revisión de Claude sale sin hallazgos graves. La revisión tiene tres capas: suite completa, `tsc` y build en verde; el ensayo de migraciones R4/R7; y una revisión dirigida a permisos por rol, migraciones y datos, dinero, y borrado o anulación (R6b) | R6, R6b, R9 |
| G-2 | Ventana de lanzamiento (propuesta: domingo 2026-10-18 en la mañana) | ✅ 2026-10-17 | Domingo 2026-10-18, antes de la medianoche. Con ese margen entra la subida de documentos generales del proyecto (DOC1) antes del rc1 | R9 |
| P1 | Feeds `GET /contacts` e `/interactions`: ¿globales o acotados? | ✅ 2026-10-16 | Acotados: los roles que no son ADMINISTRADOR ni GERENCIA ven solo los clientes de los que son responsables, igual que `loadClientScoped` en la ficha del cliente | R6d |
| P2 | Sub-puntaje «proyectos» de `clients/health` para roles sin lectura del portafolio | ✅ 2026-10-16 | Se oculta (`proyectos: null`) y el puntaje total se calcula sin esa parte para quien no tiene `canReadProjectList` | R6d |
| D1 | Validar, rechazar y anular gastos según el estado del proyecto | ✅ 2026-10-16 | Validar y rechazar exigen EN_EJECUCION o SUSPENDIDO. Anular se permite en cualquier estado, con motivo y auditoría | R6d |

## Tareas

Ruta: **I** = inline, **D** = delegada (un escritor acotado). Todas las tareas de código siguen el ciclo test-first
(RED → GREEN) cuando hay una prueba ejecutable.

### Carril R: lanzamiento (Claude)

- [x] **R1** Base en verde sobre `feat/projects-v2`: `npx tsc --noEmit`, `TZ=America/Bogota npx vitest run` y
  `npm run build`. Ruta D (ejecución). Aceptación: los tres en verde, con el resultado anotado aquí.
  - Corrida 1 (2026-10-15, sobre `8be1e13`):
    - `tsc`: exit 0.
    - `vitest`: 320/348 archivos y 3523/3718 pruebas pasan. Las 28 suites que fallan son todas
      `prisma/*.invariant.test.ts`, por «Can't reach database server at 127.0.0.1:54322»: Docker Desktop está apagado y
      `docker` no existe en WSL.
    - `build`: falla por `next/font`, que no puede descargar Google Fonts. Es el bloqueo de red de Fortinet.

    **Pendiente:** levantar Docker y repetir las invariantes, y luego decidir si se alojan las fuentes localmente (R1b).
  - Corrida 2 de las invariantes (2026-10-15, con Docker arriba): 24/29 archivos pasan.
    - Las 4 suites con timeout (`estructura`, `plantilla-import`, `municipios-migration`, `rubros-migration`) pasan
      41/41 cuando se corren en secuencia (`--no-file-parallelism`). Era carga del entorno.
    - Falla real: `proyecto-create-flow` (7 pruebas) responde 400 «El valor total es obligatorio.». Sus datos de prueba
      no traen `valor_total` desde F5. Se corrige en R1c.
  - Red: `git ls-remote` y `git push --dry-run` funcionan desde la red actual. `origin/feat/projects-v2` está en
    `42b8da0`.
  - Corrida 3 (2026-10-16, sobre `fa99572`, con todo lo del viernes integrado): **verde**.
    - `vitest` sin `prisma`: 334 archivos y 3858/3858 pruebas.
    - Invariantes `prisma` en secuencia contra 54322: 31 archivos y 228/228.
    - `tsc` y `eslint --quiet` en exit 0.
    - `build` sigue bloqueado en local por Fortinet; el build real es el de Vercel.
- [x] **R1c** Ajustar los datos de prueba de las invariantes a F4/F5 (`valor_total > 0`, inicio < fin) y correr todas
  las invariantes en secuencia. Ruta D.
  - Evidencia: commit `547392b`. Se agregó `valor_total: 1000000` a 6 payloads de `proyecto-create-flow`; el caso de
    conversión con valor en la oportunidad quedó intacto. `prisma` en secuencia: 29 archivos, 210/210 pruebas; `tsc` y
    `eslint` limpios. Ninguna prueba cambió de intención.
- [x] **R2** Worktree y rama de DeepSeek, y su prompt listo para pegar (`odd/tasks/lanzamiento-v2-deepseek-prompt.md`).
  Ruta I.
- [x] **R3** Migración aditiva de lanzamiento. Contiene `Proyecto.descripcion String?` si M3 la aprueba, y
  `TipoNotificacion.GASTO_RECHAZADO` en una migración aparte si M7 la aprueba, porque `ADD VALUE` no comparte
  transacción. Ruta D. Plazo: viernes 12:00.
  Evidencia: `b7d8ab7`. Dos migraciones aditivas e idempotentes aplicadas a la base local (127.0.0.1:54322): `20261014120000_v2_proyecto_descripcion` (`ADD COLUMN IF NOT EXISTS "descripcion" TEXT`) y `20261014130000_v2_notificacion_gasto_rechazado_enum` (`ADD VALUE IF NOT EXISTS 'GASTO_RECHAZADO'`, sola en su migración). `migrate diff` sin diferencias; invariantes de prisma: 30 archivos, 214 pruebas en verde.
- [x] **R4** Ensayo 1. Pasos:
  1. Restaurar el dump de producción en el contenedor `postgres` de 54330.
  2. Correr `prisma migrate status`, que debe coincidir con `main`.
  3. Correr `prisma migrate deploy` y los invariantes.
  4. Correr `s1-rubros --dry-run`.
  5. Comprobar que la app de `main` funciona sobre la base migrada.
  6. Restaurar el dump una segunda vez, para probar que el respaldo sirve.

  Ruta D. Depende de que el usuario entregue el dump. Aceptación: todo termina sin error. Si no, es **no-go** hasta
  corregirlo.
  - Corrida 1 (2026-10-16, dump de producción de las 09:20, contenedor `muttu-rehearsal`, `supabase/postgres:17.6.1.143`
    en 54330): **NO-GO**.
    - Restauración: `public` y `auth.users` completos. El dump tiene 15 usuarios, 21 clientes, 20 oportunidades, 123
      tareas y 4 rubros. Hubo que filtrar algunas tablas de `auth.*` y `storage.*`, porque las imágenes locales de
      gotrue y storage son más viejas que producción.
    - Las 7 tablas v1 de proyectos existen con **0 filas**: `proyectos`, `metas`, `actividades`, `gastos`,
      `indicadores`, `lineas_presupuestales` y `soportes_proyecto`. También existen los enums v1. `rubros` tiene 4
      filas activas y ninguna línea ni gasto las referencia.
    - `_prisma_migrations` tiene la migración fantasma `20260918153200_tablero_seguimiento_social`, que no está en el
      repo. Ya renombró las FK `bitacora_entradas_oportunidad_id_cliente_id_fkey` y
      `tareas_oportunidad_id_cliente_id_fkey`.
    - Falla 1: `20260930181056_v2_auditoria_cambios`, porque el `RENAME CONSTRAINT bitacora_oportunidad_cliente_fkey`
      no existe. Prisma deja la migración a medias y hay que hacer `migrate resolve`.
    - Falla 2, con la anterior sorteada: `20261008121000_v2_actividades`, porque `objetivo_id` no existe.
      `CREATE TABLE IF NOT EXISTS` no hace nada sobre la tabla v1. Lo mismo pasa en `20261008122000` y
      `20261008140000`.
    - Experimento D-10 en una copia aparte: con el DROP de las tablas v1 vacías y de sus enums, y las FK devueltas a su
      nombre viejo, **las 23 migraciones aplican**.
    - Después del deploy, `migrate diff` no queda vacío: sobran `rubros_nombre_key` y `deleted_at` en `rubros` y
      `lineas_presupuestales`.
    - Invariantes con `s1-rubros --apply` en la copia: 213/215. Las dos fallas son ese drift:
      - `rubros_nombre_key`;
      - el check `lineas_monto_no_negativo` en lugar de `lineas_monto_no_negativo_ck`.
    - `s1-rubros --dry-run`: crea 13, actualiza 1 y omite 1. **Hace falta en producción**, y `_guard.ts` no lo permite.
    - El humo de la app no se verificó: `node_modules` está instalado desde Windows y `npx` ignora el env en línea.
    - La segunda restauración salió idéntica: el respaldo sirve.
- [x] **R4b** Hacer que las migraciones apliquen sobre la forma real de producción, sin editar migraciones ya aplicadas.
  Ruta D (writer). Hay que:
  1. Agregar una migración previa a `20260930181056` con guardas:
     - si existen las FK con nombre del fantasma, devolverlas al nombre que espera v2;
     - si una tabla de proyectos tiene la forma v1 (por ejemplo `actividades.meta_id`), hacer el DROP de las tablas v1
       y de sus enums **solo si están vacías**; si no, `RAISE EXCEPTION`;
     - en una base v2 no debe hacer nada.
  2. Agregar una migración final que concilie el drift: `rubros_nombre_key`, los `deleted_at` y el nombre del check.
  3. Dar a `s1-rubros` una vía explícita a producción: host exacto declarado y `--expect-hash`.
  4. Repetir R4 desde una restauración limpia, con `migrate diff` vacío y las invariantes en verde.

  Evidencia (2026-10-16): cuatro commits.
  - `a27e35d`: migración previa con guardas. Devuelve las FK solo si `20260930181056` no está aplicada. Borra las 6
    tablas v1, cada una detectada por una columna propia de v1, sin CASCADE, y lanza un error si alguna tiene filas.
    `EstadoProyecto` se borra solo si le falta BORRADOR.
  - `5f03f3d`: migración de conciliación, para `rubros_nombre_key`, los `deleted_at` y el doble CHECK de montos.
  - `89cddc0`: invariante `prisma/v1-production-shape.invariant.test.ts` con 13 casos, en un esquema desechable con
    rollback.
  - `51058ff`: `_guard.ts` acepta un host remoto solo si `MIGRATE_V2_ALLOW_REMOTE_HOST` es exacto, y un `--apply`
    remoto exige `--expect-hash`.

  Resultados en la base local:
  - `migrate deploy` aplicó las dos migraciones sin cambios.
  - `migrate status` está al día.
  - `migrate diff` está vacío.
  - `prisma` en secuencia: 228/228. `scripts/migrate-v2`: 37/37.

  Corrida 2 de R4 (2026-10-16, restauración limpia del dump de las 09:20, migraciones de `51058ff`): **GO**.
  - `migrate status`: 25 pendientes; el fantasma aparece como «not found locally».
  - `migrate deploy` **sin pasos manuales**: las 25 aplicadas.
  - `migrate diff --exit-code` vacío y status al día.
  - Solo hay enums v2. `rubros` no tiene `rubros_nombre_key` ni `deleted_at`, y `lineas_presupuestales` tiene un único
    CHECK `_ck`.
  - `s1-rubros`: el dry-run crea 13, actualiza 1 y omite 1, con hash `1894d2b9…932f`, idéntico al de la corrida 1. El
    apply con `--expect-hash` hizo 14 acciones y dejó 17 rubros, 15 activos.
  - La guarda rechaza un host remoto distinto antes de conectarse.
  - Invariantes contra la copia: 228/228.
  - Humo sin sesión, en `next dev` 3005 contra la copia: login 200, rutas protegidas 307/401, cron con secreto 200 y
    sin secreto 401, rutas dev 404.
  - **No verificado:** páginas con sesión iniciada, porque falta un Auth local enlazado. Queda para el humo del
    navegador y R7.
- [x] **R5** Checklist de infraestructura: variables de entorno nuevas de v2, buckets de Storage, cron y alcance de las
  variables en Vercel. Ruta D. Resultado (2026-10-15, explorador de solo lectura sobre `main..HEAD`):
  - **Variables:** son las mismas 12 en `main` y en HEAD; no hay ninguna nueva. `ENABLE_DEV_ROUTES` no debe estar en
    `true` en producción. `DIRECT_URL` tiene que estar disponible donde se corra `migrate deploy`.
  - **Storage:** sigue un solo bucket privado, `muttu-docs` (o el valor de `SUPABASE_STORAGE_BUCKET`), siempre con URL
    firmada. Ningún código lo crea, así que tiene que existir.
  - **Cron:** no hay `vercel.json`. El resumen diario corre por `pg_cron` (`scripts/cron_setup.sql`) contra
    `/api/cron/daily` con el encabezado `x-cron-secret`, sin cambios. Ahora respeta el ajuste
    `automatizaciones.resumen_diario`. Hay que confirmar después del deploy que sigue enviando.
  - **Base:** 23 migraciones. Las que no son puramente aditivas:
    - `v2_rubros_codigo` suspende (`activo=false`) los rubros heredados sin código.
    - `lineas`, `municipios` y `proyecto_general` hacen un backfill de `updated_at` y luego `SET NOT NULL`.
    - Se renombran 2 FK y se hace un `DROP CONSTRAINT IF EXISTS`.

    No hay DROP TABLE, DROP COLUMN ni cambios de tipo.
  - **Scripts de datos:** la guarda de `scripts/migrate-v2/_guard.ts` impide correrlos contra producción. Hay que
    decidir en R4 si `s1-rubros` hace falta en producción y por qué vía.
  - **Por confirmar en los paneles:**
    - el bucket `muttu-docs` existe y es privado;
    - los jobs de `pg_cron` están activos en producción y su `CRON_SECRET` coincide con el de Vercel;
    - la versión de Node en Vercel;
    - la URL de producción `/auth/confirm` está en la lista de redirecciones de Supabase Auth;
    - hay un respaldo o PITR antes de migrar.
- [ ] **R6** Integración del sábado a las 12:00. Pasos:
  1. Merge de `feat/ficha-v7-polish`.
  2. Suite, `tsc` y build.
  3. Etiqueta `v2.0.0-rc1`.

  Ruta I.
- [x] **R6b** Revisión de entrega (G-1). Es una revisión dirigida de `main..feat/projects-v2` sobre permisos por rol y
  alcance, migraciones y datos, dinero (gastos, presupuesto y validación) y operaciones de borrado o anulación. Se usan
  revisores frescos en paralelo. Un hallazgo grave bloquea el merge hasta corregirlo. Ruta D.
  - Corrida 1 (2026-10-16, sobre `ab60d3c`): 4 revisores de solo lectura en paralelo.
    - **Borrados y anulaciones:** nada grave. Todos los borrados nuevos son lógicos y auditados, no hay `Cascade` y la
      importación de Excel es transaccional y rechaza si hay historia. Hay dos bajas:
      - los conteos de hijos van fuera del lock en los DELETE de estructura;
      - `gateEjecucionVoid` no mira el estado del proyecto.
    - **Permisos:** nada grave. Hay dos medias que son decisión de producto:
      - P1: `GET /contacts` e `/interactions` son globales, mientras que los sub-recursos por cliente están acotados al
        responsable;
      - P2: `clients/health` deja inferir el semáforo de proyectos sin `canReadProjectList`.
      Hay una baja que se corrige: `users/[id]:79` usa `Boolean(body.puede_ver_tablero_gerencial)`, y con eso `"false"`
      vale `true`.
    - **Dinero:** un **grave** de baja probabilidad.
      - `validarEnTransaccion` (`validacion-gastos.ts:55-76`) bajo lock solo vuelve a leer `estado`. Monto, línea y
        tercero vienen del gate, así que un PATCH concurrente del registrante evade el bloqueo de sobregasto.
      - Hay además una media: validar y rechazar funcionan en cualquier estado del proyecto. Es la decisión D1 de abajo.
      - Y bajas: alerta de sobregasto vieja tras una Modificación; `gasto-form` interpreta montos distinto que
        `parseMontoInput`; el PATCH en BORRADOR acepta `valor_total` 0 o null, cosa que la línea base atrapa.
    - **Migraciones:** un **grave por confirmar en R4**. Producción tendría 8 tablas v1 (`proyectos`, `actividades`,
      `gastos`, `indicadores`, `soportes_proyecto`…) que chocan con migraciones v2 `CREATE TABLE IF NOT EXISTS` más
      índices sobre columnas inexistentes: `20261008121000`, `20261008122000`, `20261008140000` y `20261010120000`
      abortarían. El arreglo candidato es D-10, el DROP de v1 antes del deploy, y se prueba en R4. Hay además dos
      medias:
      - un `prisma.config.ts` que carga `.env.local` puede desviar un deploy (va al runbook);
      - `_guard.ts` no permite `s1-rubros` en producción.
- [x] **R6c** Corregir los hallazgos de R6b que no necesitan decisión:
  - el grave de validación de gastos (releer el gasto bajo lock);
  - `Boolean()` en `users/[id]`;
  - `gasto-form` con `parseMontoInput`;
  - `.gt(0)` en el PATCH de `valor_total`.

  Ruta D (writer con test-first).
  Evidencia: `7362e23`, `f8a181b`, `f8a871b` y `5ddfaf4`. Cada commit tiene su RED observado. `projects`, `users` y la
  invariante `modificaciones`: 604/604 en secuencia. `tsc` y `eslint` limpios. El control del padre sobre `validate` y
  `gasto-form` dio 36/36.
- [x] **R6d** Aplicar las decisiones P1, P2 y D1. Se escribe después de R6c, que es el mismo escritor, para no tener dos
  escritores a la vez. Ruta D (test-first).
  Evidencia: `283c5e9` (P1, `clienteFeedScope`), `709e4e2` (P2, `proyectos: null` y se omite `loadKpisPortafolio`) y
  `6bc9595` (D1, `gateGastoDecision` con 409 y una nueva verificación `FOR SHARE` dentro de la transacción; anular
  sigue libre). Se integró con el merge `b133b62`. 1020/1020 pruebas pasan; `tsc` y `eslint` limpios.
- [x] **R6e** Dos ajustes tras R6d:
  - P1 refinado por el usuario el 2026-10-16: los feeds usan la misma regla que `loadClientScoped`
    (`isFullAccess`), así que COORDINADOR ve todo y COLABORADOR solo lo suyo.
  - La cola `expense-validations` y `nav/counts` filtran por proyectos EN_EJECUCION o SUSPENDIDO.

  Ruta D (test-first).
  Evidencia: tres commits.
  - `5c03c54`: un solo helper, `clientReadScope`, sobre `isFullAccess`, para `loadClientScoped` y para los feeds.
  - `0fa3a28`: la cola solo muestra gastos de proyectos EN_EJECUCION o SUSPENDIDO, reusando
    `ESTADOS_PROYECTO_VALIDACION`.
  - `8ffabe4`: limpia un import.

  Resultados: 405/405 pruebas y `tsc` y `eslint` limpios. `nav/counts` no cuenta la cola, así que no se tocó.
- [ ] **R7** Ensayo 2 con el código final, más el humo de la app sobre la copia. Ruta D.
- [x] **R8** Runbook de lanzamiento, checklist de humo y plan de vuelta atrás (`docs/runbook-lanzamiento-v2.md`). Ruta D. Evidencia: `864f9e0` (borrador) + `6b0100c` y el commit de rubros, con los datos de la corrida 2 de R4. Quedan 5 ⚠: Node en Vercel, `psql` en el WSL del operador, `WSLENV` contra producción (no se usa), restaurar sobre producción (preferir PITR o el panel) y `psql -f` con docker en la vuelta atrás.
- [ ] **R9** Lanzamiento, que ejecuta el usuario. Pasos:
  1. Respaldo verificado.
  2. `migrate deploy`.
  3. Humo de la app vieja.
  4. `s1-rubros --dry-run`, y después `s1-rubros --apply --expect-hash`.
  5. Merge a `main`.
  6. Deploy en Vercel.
  7. Humo.

  Ruta I, acompañado.

### Carril F: requerimientos y reunión (Claude)

- [x] **F1** Quitar la semaforización territorial del tablero gerencial (REQ-DSH-04, PO-1). El municipio queda solo como
  filtro. Archivo: `project-dashboard.tsx`. Tamaño S.
  Evidencia: `7e15028` (+ `095bb3a` guarda responsive). RED previo en `project-dashboard.test.tsx`; se quitó también la lista que solo alimentaba la sección. API del portafolio sin campo territorial. Ruta D (inline).
- [x] ~~**F2** Tarjeta «Beneficiarios atendidos / meta» en el tablero gerencial (C5).~~ Cancelada por M5: ya no se
  miden atendidos.
- [x] **F3** Filtros del portafolio por cliente, línea, municipio y responsable (RF-31). La API ya los acepta
  (`src/app/api/v1/projects/route.ts:61-65`). Archivo: `project-list.tsx`. Tamaño S.
- [x] **F4** V-03 estricto: inicio < fin (C1). Depende de PO-4. Tamaño S.
  Evidencia: `d03a56c`. Validador compartido `src/lib/proyectos/rango-fechas.ts` (API crear y convertir, PATCH, modificaciones, formulario). Verificación: vitest src/components/proyectos, api/v1/{projects,dashboard,clients}, lib/{proyectos,api,openapi} 1958/1959 (el fallo era responsive-guards, corregido en `095bb3a`), `tsc --noEmit` y eslint sin errores.
- [x] **F5** `valor_total > 0` al crear (C2). Depende de PO-5. Tamaño S.
  Evidencia: `d1a6ef6`. `valor_total` obligatorio y > 0 solo en `PROJECT_CREATE_SCHEMA` y en el formulario; la conversión (E-05) conserva su prefill desde la oportunidad en el servidor, pero el formulario exige > 0. Pregunta abierta: ¿exigir también > 0 en la ruta E-05 cuando la oportunidad no trae valor?
  Seguimiento: resuelta en `e7c8df5`. La ruta E-05 responde 400 («El valor total debe ser mayor que cero.») cuando el valor final, del cuerpo o del prefill, es nulo o <= 0; se quitó su comprobación `fin < inicio` por redundante (el esquema compartido ya exige inicio < fin).
- [x] **F6** Fecha de primer contacto en formato legible (D2). Tamaño S.
- [x] **F7** El DTO de la tarea lleva el id y el código del proyecto, para enlazar al proyecto exacto (D3). Tamaño S.
  Evidencia: `87526b5`. `TASK_SELECT` trae `oportunidad.proyecto { id, codigo, deleted_at }` en la misma consulta; el DTO expone `proyecto: { id, codigo } | null` (null si no hay proyecto o está eliminado), en el tipo del hook (opcional, por los fixtures), OpenAPI y `cardAction`: la tarjeta convertida enlaza a `/proyectos/<id>` con «✓ Proyecto <código> · abrir ficha» (sin proyecto, vuelve a `/proyectos`). El acceso lo decide `GET /projects/{id}`: la ficha responde 403 «No tienes acceso a este proyecto» o 404; el enlace puede mostrar el código aunque el usuario no sea miembro. Toca fuera de la superficie prevista: `lib/api/crm.ts` (donde vive `TASK_SELECT`), `hooks/crm.ts` y `kanban-board.tsx` (`CardActionView` tenía el `href` fijo).
- [x] **F8** Crear proyecto desde un cliente (M1, M2). Cambios:
  - El formulario pide primero el cliente. Ya no hay selector de origen; el origen se deduce de si se eligió una
    oportunidad (`project-create-form.tsx:141,339-426`).
  - Al elegir el cliente aparece una tarjeta de solo lectura (NIT, sector, ciudad, contacto principal, conteo de
    oportunidades y proyectos) y, debajo, la lista de oportunidades del cliente para elegir una de forma opcional.
  - La conversión desde una oportunidad ganada (`?oportunidad=`) sigue funcionando y llega con el cliente y la
    oportunidad ya seleccionados.
  - La ficha del cliente lleva un botón «Crear proyecto» que abre `?cliente=<id>` con el cliente preseleccionado.

  Tamaño M.
  Evidencia: `2c7e198`. Formulario cliente primero (sin selector de origen; origen derivado, mismos endpoints), tarjeta de solo lectura (`ClienteResumen`), oportunidades elegibles del cliente filtradas en el cliente con `useEligibleOpportunities`, `?cliente=` y `?oportunidad=`, botón «Crear proyecto» en la ficha para quien `canCreateProject`. Vitest de proyectos, crm, ui y app: 91 archivos, 895 pruebas en verde; tsc y eslint limpios; detector de Impeccable sin hallazgos. Pregunta abierta: el modelo `Cliente` no tiene NIT ni sector y el DTO no trae conteo de proyectos; la tarjeta muestra tipo de cliente en lugar de sector y omite NIT y proyectos (no se añadió API).
- [x] **F9** Descripción del proyecto (M3). Toca el esquema (R3), el zod de creación, `PROJECT_SELECT_V2`, el DTO, el
  formulario, la ficha y OpenAPI. Depende de M3. Tamaño M.
  Evidencia: `07b0a8d`. `descripcion` opcional (recortada, máx. 2000, vacía = null) en creación, conversión y PATCH (auditada), en `PROJECT_SELECT_V2`, DTO y OpenAPI; textarea con ayuda en el formulario de creación; párrafo en Resumen › Datos generales (oculto si es null). Sin diálogo de edición (pendiente de decisión de producto). `ProjectListRow.descripcion` es opcional en el tipo para no tocar los fixtures ajenos.
- [x] **F10** Ocultar las pestañas Oportunidades y Mapa de Clientes (M4). Se quitan de `CLIENTES_SECTIONS`
  (`clientes-subnav.tsx:23-31`) y sus rutas redirigen a `/clientes`. Tamaño S.
- [x] **F11** Renombrar «Observado» en `atencion.ts:39` («Gasto observado» → «Gasto pendiente por revisión»). Las
  etiquetas de `project-gastos.tsx` y `gastos-kpis.tsx` pasan a X1 (DeepSeek). Tamaño S.
  Evidencia: `518f48b`. `ATENCION_TITULO.gasto_observado` renombrado, claves intactas; `atencion.test.ts` y `requiere-atencion.test.tsx` en verde.
- [x] **F12** Notificar a `registrado_por_id` cuando se rechaza un gasto (M7). Toca la ruta `reject`,
  `notificaciones-proyecto.ts`, la lectura de notificaciones para roles no gerenciales, `notification-panel.tsx` y
  OpenAPI. Depende de M7 y R3. Tamaño M.
  Evidencia: `04b5976`. `notificarGastoRechazado` (upsert por usuario/tipo/gasto, reactiva como no leída) dentro de la transacción de `reject`; sin notificación si quien rechaza es el autor. Lectura y read-all: GERENCIA ve SOBREGASTO_RUBRO y GASTO_RECHAZADO, el resto solo sus GASTO_RECHAZADO; el mensaje (tercero, documento, valor, motivo) se arma al leer desde el gasto, porque `notificaciones` no guarda texto. Panel con título «Gasto rechazado», motivo y enlace a `/proyectos/<id>`; OpenAPI con el enum. Vitest (proyectos, clients, notifications, lib/api, openapi, shell): 149 archivos, 1611 pruebas; prisma `--no-file-parallelism`: 30 archivos, 214 pruebas; tsc y eslint limpios. Pregunta abierta: al corregir el gasto se borra `motivo_rechazo`, así que la notificación vieja queda solo con el título.
- [x] **F13** PDF por impresión del navegador (RF-32, PO-2). Cambios:
  - Una vista imprimible de la ficha del proyecto y de su resumen financiero, con hoja de estilos `@media print`.
  - Respeta el rol, igual que la ficha.
  - Lleva un botón «Imprimir / Guardar PDF».
  - Toma como referencia la `print-ficha.tsx` que ya existe para clientes.

  Ruta nueva bajo `src/app/(app)/proyectos/[id]/` (superficie de Claude). Tamaño M.
  Evidencia: `4591c5e`. Ruta `/proyectos/[id]/imprimir` con `ProjectPrintSheet` (`components/proyectos/print/`): encabezado (código, nombre, cliente, estado, responsable, fechas, valor, descripción, beneficiarios, fecha de generación), estado técnico con la frase de causa, actividades por objetivo con % plan y % real, y resumen financiero por rubro (asignado, programado, ejecutado) con total. Mismas consultas que la ficha, así que el 403/404 de la API sale como mensaje legible y sin hoja. Botón «Imprimir / Guardar PDF» (`window.print`, `print-hide`) y ítem «Imprimir / PDF» en «Más acciones» que abre la ruta en una pestaña nueva. Al imprimir, `@media print` oculta el shell y deja la hoja (siempre clara). Un borrador imprime solo el encabezado. Sin verificar en un navegador real (chrome-devtools no conectó): la regla de impresión se probó solo por inspección.
- [x] **F14** Beneficiarios como un solo número (M5). Cambios:
  - Quitar la pestaña Beneficiarios de la ficha (`project-ficha.tsx:127,205`) y su registro
    (`ejecucion-beneficiarios.tsx`).
  - Reutilizar `Proyecto.beneficiarios_meta` como el campo «Beneficiarios», editable en los datos generales. No requiere
    migración. La tabla `RegistroBeneficiario` se conserva sin uso y sin borrar datos.
  - Ajustar los KPI que comparan atendidos contra la meta (`resumen-kpis.tsx:162`, `portafolio-kpis.tsx:86`, el tablero
    y el agregado de la API).
  - Verificar si la línea base congela `beneficiarios_meta`. Si lo congela, se pregunta al PO si debe seguir editable.

  Se pasa del carril D al F porque toca la API y los agregados. Tamaño M.
  Evidencia: `097d830`. Se quitan el registro plegado de la ficha, `ProjectBeneficiarios`, `ejecucion-beneficiarios.tsx` y su prueba, y el montaje en `ProjectEjecucion`; la tarjeta «Beneficiarios vs meta» del panel de indicadores; la columna «Beneficiarios vs meta (%)» de los dos Excel (la ficha lista «Beneficiarios» en Proyecto y el portafolio una columna «Beneficiarios» con el número). El agregado del portafolio pasa a `beneficiarios: { total }` = Σ `beneficiarios_meta` de los proyectos medibles (OpenAPI, hook, tablero y tarjeta «Suma de los proyectos»). El KPI por proyecto (`kpis.beneficiarios`) y las rutas `/beneficiaries` quedan en el contrato sin uso en la interfaz; los hooks de registrar y anular beneficiarios quedan sin llamadas. Línea base: SÍ congela `beneficiarios_meta` (`versiones.ts:69`, comparación `versiones.ts:176`) y la aprobación exige meta > 0 (`linea-base.ts:40`, «La meta de beneficiarios debe ser mayor que cero.»). Sin cambios de semántica. Pendiente de producto: si el número debe seguir editable tras aprobar la línea base, y si el mensaje de aprobación debe decir «Beneficiarios» en lugar de «meta». Sin diálogo de edición (pendiente).

### Carril D: pulido v7 por pestaña (cancelado)

D1 a D6 se cancelan por UX-1, porque pulían pestañas que se fusionan. D1 (formato de miles en Presupuesto) se absorbe en
X4. D3, D4 y D6 se descartan: el rediseño simplifica esas vistas en vez de sumarles KPI.

### Carril U: rediseño de la ficha, parte 1 (Claude)

Mapa aprobado (UX-1):

| Pestaña | Junta | Contenido |
|---|---|---|
| Resumen | Resumen, Equipo y Beneficiarios | Cada semáforo con una frase de causa, la lista «Requiere atención» con enlaces de acción, 3 KPI (no 6), los datos generales (con descripción y beneficiarios) y el equipo |
| Actividades | Metas, Cronograma, Gantt y Seguimiento | Una lista de objetivos y actividades con 3 vistas: Lista (con avance y «Registrar avance»), Gantt y Tablero (kanban derivado). En borrador abre con «Cargar desde Excel» como acción principal |
| Finanzas | Financiero, Presupuesto y Legalización | Selector: Resumen · Gastos · Presupuesto (DeepSeek) |
| Documentos | Soportes y adjuntos de gastos | Una sola lista (DeepSeek) |
| Historial | Cambios | Modificaciones · Versiones · Auditoría (DeepSeek) |

- [x] **U1** Extraer `ProjectHistorial` a `project-historial.tsx`, para que X6 lo componga. Ruta I. Evidencia:
  `fe8b992`. `tsc` limpio y `project-ficha` con 38/38 pruebas en verde.
- [x] **U2** Encabezado. Cambios:
  - Los semáforos viven solo aquí, como chips que llevan a la pestaña correspondiente.
  - Acciones principales según rol y estado: «Registrar avance» y «Registrar gasto».
  - Menú `⋯` con Exportar Excel, Imprimir/PDF (F13) y Aprobar línea base (en borrador).
  - Barra de 5 pestañas.

  Ruta D. Evidencia: `d6e73d1`. Vitest `project-ficha`, `ficha` y `project-ejecucion` con 58/58 en verde (RED previo: 27
  fallos), `tsc` y `eslint` limpios, detector de Impeccable sin hallazgos. Pendiente (F13): Imprimir/PDF en el menú
  `⋯`, hoy solo tiene Exportar a Excel.
- [x] **U3** Resumen. Cambios:
  - Frase de causa por semáforo, a partir de los datos de `kpis` y `attention` que ya existen. No requiere API nueva.
  - 3 KPI: avance técnico (real contra plan), ejecución financiera (ejecutado contra programado) y beneficiarios.
  - Datos generales y equipo, con edición en un diálogo.
  - Se elimina el panel de KPI duplicado de Cambios.

  Ruta D. Evidencia: nuevo `ficha/ficha-resumen.tsx` (salud técnica y financiera con una frase de causa, «Requiere atención» con enlaces «Ver actividades»/«Ver finanzas», «Próximos pasos» en borrador, datos generales, equipo y registro de beneficiarios plegado). Se elimina `resumen-kpis.tsx` y su prueba. Vitest `src/components/proyectos` y `api/v1/clients` 780/780, `tsc` y eslint limpios, detector de Impeccable sin hallazgos. Pendiente: la edición de datos generales en un diálogo no se hizo (queda para F14, que hace editable «Beneficiarios»). El texto vacío de «Requiere atención» pasa a «Nada pendiente por ahora.».
- [x] **U4** Actividades. Una sola estructura con el selector Lista · Gantt · Tablero.
  - En borrador: edición de objetivos, actividades, entregables e indicadores, más la carga por Excel.
  - En ejecución: avance por actividad e indicadores.
  - Los selectores de línea base y de corte quedan en «Opciones avanzadas», con vigente y hoy por defecto.

  Ruta D. Evidencia: `54007e9`. Nuevo `ficha/ficha-actividades.tsx` con Lista · Gantt · Tablero (solo la vista activa se monta; sin Tablero en borrador). Lista en ejecución: `ProjectEjecucion lista` sin panel del semáforo, actividades agrupadas por meta con plan, real, semáforo, días y soporte, «Opciones avanzadas» plegado (base y curva S) e «Indicadores» plegado. `ProjectCronograma` sale de la ficha pero el archivo se queda (lo usa el paso de creación). Vitest `src/components/proyectos` y `src/lib/proyectos` 1028/1028 (RED previo en los módulos nuevos), `tsc`, eslint y detector de Impeccable limpios. Pendiente: el selector de corte no existe en la UI actual (solo base); queda el corte de hoy como texto.
- [x] **U5** Vista Tablero, de solo lectura. Columnas Por iniciar, En curso, Atrasada y Terminada, derivadas de
  `progreso`, `programado`, `color` y las fechas de `technical-status`. Al hacer clic en una tarjeta se abre «Registrar
  avance». No requiere migración ni toca el modelo `Tarea`. Ruta D. Evidencia: `470697d`. Regla pura `columnaTablero`/`vencidaSinTerminar` en `lib/proyectos/estado-actividad.ts` (8 pruebas con límites; `progreso` es porcentaje 0..100) reutilizada por `atencion.ts`. Cambio de diseño: al hacer clic en una tarjeta se pasa a la Lista y se enfoca la fila de la actividad (no se abre el formulario), porque el formulario vive por entregable.
- [x] **U6** Excel visible:
  - En borrador sin estructura, el estado vacío ofrece «Cargar desde Excel» como acción principal y «Crear a mano» como
    secundaria.
  - Con estructura, el botón queda en la barra de Actividades.

  Ruta D. Evidencia: `e5f7e5e`. `ProjectEstructura` abre con «Cargar desde Excel» (primaria) y «Crear a mano» en borrador vacío para ADM/GER; otros roles ven una explicación corta; sin fechas lo dice y bloquea la descarga. `ImportDialog` acepta `open`/`onOpenChange`/`ocultarControles` y ofrece «Descargar plantilla» como primer paso. 7 pruebas nuevas, con RED previo.
- [x] **U7** Ayudas al crear un proyecto (UX-2):
  - Una pista breve por paso del stepper (qué se pide y por qué).
  - Ayudas en los campos no obvios: línea estratégica principal, municipios, valor, fechas, peso de la actividad,
    programación y línea base.
  - Una guía de la plantilla Excel.

  Usa un componente de ayuda reutilizable y accesible. Ruta D.
  Evidencia: `b489f40` (componente `HelpHint` e importación Excel) y `2c7e198` (pistas por paso, ayudas de campo y de peso, programación y línea base en el stepper). Pruebas de `HelpHint`: nombre accesible, clic, teclado y Escape. Las ayudas de peso y programación viven en el título del paso (3 y 4) porque sus editores pertenecen a otra unidad.
- [x] **U8** Integración. Pasos:
  1. Montar `FichaFinanzas`, `FichaDocumentos` y `FichaHistorial`.
  2. Quitar las pestañas viejas.
  3. Actualizar `project-ficha.test.tsx`.
  4. Pasar el detector de Impeccable sobre lo cambiado.

  Ruta I.

  Evidencia: `0c8e6fe` (Finanzas) y `8e61954` (Documentos e Historial). La ficha tiene 108/108 pruebas en verde, `tsc` y `eslint` limpios, y el detector de Impeccable devolvió `[]`.

### Carril X: rediseño de la ficha, parte 2 (DeepSeek)

El prompt completo está en `odd/tasks/lanzamiento-v2-deepseek-prompt.md`.

- [x] **X1** Renombrar la etiqueta «Observado» a «Pendiente por revisión» en `project-gastos.tsx:51` y
  `gastos-kpis.tsx:100`, con sus pruebas (M6). Tamaño S. Evidencia: `91d8dcb`, integrado en `56df1e3`.
- [x] **X2** `FichaFinanzas`, con selector Resumen · Gastos · Presupuesto. Compone `ProjectFinanciero`, `ProjectGastos` y
  `ProjectPresupuesto`. Tamaño M. Evidencia: `0842272`, integrado en `c10234e` y montado en `0c8e6fe`.
- [x] **X3** Finanzas simplificadas. Cambios:
  - El tacómetro pasa a una barra de ejecutado, programado y asignado.
  - Los selectores de corte y base quedan en «Opciones avanzadas».
  - Se quita la fila de KPI duplicada de gastos. Evidencia: `1e2fb26`, integrado en `15bd5c3`.

  Tamaño M.
- [x] **X4** Formato de miles en los campos de dinero de Presupuesto y meses legibles (antes D1). Tamaño S. Evidencia: `e30b403`, integrado en `345987b`.
- [x] **X5** `FichaDocumentos`: soportes de actividades más adjuntos de gastos en una sola lista. No requiere API nueva.
  Tamaño S-M. Evidencia: `5da32bf`, integrado en `345987b` y montado en `8e61954`.
- [x] **X6** `FichaHistorial`, con selector Modificaciones · Versiones · Auditoría. Compone `ProjectModificaciones`,
  `ProjectVersiones` y `ProjectHistorial`. Tamaño S. Evidencia: `a81a4ba`, integrado en `345987b` y montado en `8e61954`.

### Carril F (continuación)

- [x] **F15** «Editar datos generales» (UX-3). Un diálogo en Resumen que usa el PATCH existente.
  - En borrador se pueden editar todos los datos generales.
  - En ejecución solo la descripción y los beneficiarios. Habilitar eso en el PATCH requiere ampliar su regla, que hoy
    solo acepta borrador, únicamente para esos dos campos y con auditoría.
  - Fechas y valor muestran un enlace a «Solicitar modificación».
  - Va después de F14, porque los dos tocan `ficha-resumen.tsx`. Ruta D.
  - Hecho. El PATCH acepta en EN_EJECUCION solo `descripcion` y `beneficiarios_meta` (> 0, no se vacía); lo demás da 409
    `INVALID_STATE`. El estado se vuelve a comprobar bajo el bloqueo de fila. Versiones y modificaciones no tenían ninguna
    comprobación «vivo contra snapshot» sobre los beneficiarios, así que no hubo cambio de lógica: lo guarda una invariante
    (v0 conserva 50, v1 congela 80). `diffSnapshots` solo es informativo. Solo ADM/GER ven el botón.
    Evidencia: `ed9dd88` (servidor), `767644b` (guía y comentario), `f98c7c0` (diálogo). Vitest proyectos, API y lib:
    174 archivos, 2138 pruebas; prisma: 30 archivos, 215 pruebas; tsc y eslint limpios.

### Carril Y: lote 2 de DeepSeek

El prompt está en `odd/tasks/lanzamiento-v2-deepseek-prompt-2.md`. DeepSeek trabaja en la rama `feat/deepseek-lote-2`,
creada desde `feat/projects-v2` después de integrar X6. Estas tareas reemplazan F3, F6 y F10 del carril F.

- [x] **Y1** (F3) Filtros del portafolio: cliente, línea, municipio y responsable.
- [x] **Y2** (F6) Fecha de primer contacto en formato legible.
- [x] **Y3** (F10) Ocultar las pestañas Oportunidades y Mapa de Clientes, y redirigir sus rutas a `/clientes`.

Evidencia (2026-10-16): commits `b427419`, `3684d33` y `af231df`, integrados con el merge `--no-ff` de
`feat/deepseek-lote-2`. Verificación delegada sobre el merge:
- `vitest` de `src/components/proyectos`, `src/components/crm` y `src/test`: 919 de 920 pruebas pasan.
- `tsc`: exit 0.
- `eslint` de los 10 archivos de código: sin avisos.

La única falla, `src/test/selected-state-contrast.test.ts` («project-create-dialog: the selected origin pill…»), viene
de antes del merge. `79029fd` movió el formulario fuera de `project-create-dialog.tsx` y el regex de la guarda ya no
encuentra nada. Se corrige en R1d.

- [x] **R1d** Guarda `selected-state-contrast`: la píldora de origen ya no existe desde F8 (el origen lo decide la oportunidad elegida), así que el caso ahora exige que `project-create-form.tsx` no use `text-rose-700` fijo. 5/5 pruebas en verde. Ruta I.

### Carril Z: lote 3 de DeepSeek (revisión de solo lectura)

El prompt está en `odd/tasks/lanzamiento-v2-deepseek-prompt-3.md`. DeepSeek trabaja en la rama `feat/deepseek-revision`,
creada desde `feat/projects-v2`, y solo escribe su log. Revisa lo que R6b no cubre: textos, accesibilidad, estados de
carga, vacío y error, ancho de 390 px y calidad de las pruebas. Claude integra el log y tría los hallazgos antes del
congelamiento.

- [x] **Z1** Textos de la interfaz.
- [x] **Z2** Accesibilidad.
- [x] **Z3** Estados de carga, vacío y error, y formatos.
- [x] **Z4** Ancho angosto (390 px).
- [x] **Z5** Calidad de las pruebas nuevas.

Evidencia: commits `e4380db` a `31b4018`, integrados en el merge `838ee26`. Solo cambió el log de DeepSeek. Hay 53
hallazgos: 1 alta, 25 medias y 27 bajas.

La alta: con `puede_editar === false`, `client-sheet.tsx:559` muestra «—» en todos los campos de texto de la pestaña
General, porque usa `formatFecha`. Parece venir de Y2.

- [x] **ZF** Verificar y corregir las altas y medias de Z1–Z5, más las bajas triviales, en el worktree
  `fix/z-review-findings`. El hallazgo de `salud-vista` espera a R6d. Ruta D (test-first).
  Evidencia: 7 commits, de `f977b92` a `5ffe207`, integrados con el merge `fa99572`. De las 26 altas y medias:
  - 17 quedaron corregidas, incluida la alta: la pestaña General en solo lectura ya muestra los valores.
  - 2 quedaron parciales: Z2-1 y Z3-5.
  - Ninguna fue falso positivo.

  Verificación:
  - RED observado en 26 pruebas.
  - Los 16 archivos de prueba que cambiaron pasan 311/311.
  - `tsc` y `eslint` limpios.
  - Hubo dos ajustes de aserciones fuera de la superficie, en `client-sheet-write-gate.test.tsx` y
    `project-create-form.test.tsx`. La prueba vieja pasaba gracias al bug.

  **Pendientes después del lanzamiento:**
  - Decisiones de producto sobre nombres, que cruzan `nav.ts`, kanban y otras zonas:
    - Z1-3: Aliados o Clientes;
    - Z1-4: Tarea o compromiso;
    - Z1-5: Metas u objetivos.
  - Z3-8: paginación, que necesita `take`/`skip` en la API.
  - Z5-5: `salud-vista.test`.
  - Las mitades fuera de la superficie de Z1-1, Z2-1, Z3-5 y Z5-3.
  - Las bajas: Z1-6 a Z1-13, Z2-6 a Z2-10, Z3-9 a Z3-12, Z4-3 a Z4-6, y Z5-7, Z5-8, Z5-9 y Z5-11.

### Carril W: lote 4 de DeepSeek (revisión de solo lectura de migraciones y runbook)

El prompt está en `odd/tasks/lanzamiento-v2-deepseek-prompt-4.md`. Se integró con el merge `f0e6138`.

- [x] **W1** Las dos migraciones nuevas: 3 hallazgos.
  - La media es un **falso positivo**, verificado por Claude. El `RAISE` y los `DROP` están en el mismo bloque `DO`
    (`20260930000000…/migration.sql:71-120`), que es una sola sentencia, así que un `RAISE` deshace los `DROP` del
    bloque. Solo queda aplicado el renombre de FK del bloque anterior (P3009, sin pérdida de datos), y solo si las
    tablas v1 reciben filas antes del lanzamiento.
  - Las dos bajas son pruebas faltantes: la rama del enum en uso y algunas ramas del `RAISE`. Quedan como seguimiento.
- [x] **W2** El runbook leído como operador: 6 hallazgos, confirmados.
  - Alta: §5.3 restaura sobre producción, pero solo vacía `public`, y los `COPY` de `auth` (26) y `storage` (7)
    chocan.
  - Media: `psql` no existe en WSL y la función con docker no monta archivos y usa `postgres:17`, que no está local.
  - Bajas: `BACKUP_DIR` sin asignar, dos placeholders `<…>` que fallan en `bash -n`, y la contraseña visible en el
    argv de docker.
- [x] **R8b** Rehacer §5.3, la vuelta atrás con el dump: restaurar solo `public` y dejar `auth` y `storage` intactos.
  Además:
  - un `psql` con la imagen local `supabase/postgres:17.6.1.143`, el directorio montado en solo lectura y la URL por
    el entorno;
  - asignar `BACKUP_DIR` y quitar los placeholders;
  - **ensayar la restauración encima** de una copia migrada en `muttu-rehearsal`.

  Ruta D.

  Evidencia: `8387ea3`. Ensayo sobre `rollback_test`: dump completo, `migrate deploy` y una fila marcador, y luego §5.3
  copiada literal.
  - Sin errores, con `ON_ERROR_STOP` y en una transacción.
  - Las 28 tablas de `public` coinciden con los conteos previos.
  - `_prisma_migrations` vuelve a 12 filas.
  - Se recuperan las tablas v1 y desaparece la fila marcador.
  - Esquema, permisos y RLS quedan idénticos a una restauración limpia.
  - `auth.users` sigue en 15, y `pg_net` y los event triggers quedan intactos.
  - Las 19 piezas de bash pasan `bash -n`.

  El ensayo corrigió dos errores del primer borrador: el `DROP SCHEMA public CASCADE` borraba `pg_net`, y los
  privilegios por defecto daban acceso de más a `anon` y `authenticated`.

## Calendario

| Día | Claude | DeepSeek | Usuario |
|---|---|---|---|
| Jueves 15 | U1 ✅, R2, R1, U2, F1, F4, F5, F11 | X1, X2, X6 | Destrabar el push, conseguir G-1 y sacar el dump de producción |
| Viernes 16 | R3 (12:00), R4, R5, U3, U4, U5, F14, F8, F3, F10 | X3, X4, X5 | Probar en el navegador |
| Sábado 17 | U6, U7, F9, F12, F13, F6, F7 → U8 (integración) → **congelamiento a las 12:00** → R6, R7, R8 | Solo correcciones que Claude le marque | Probar la versión candidata |
| Domingo 18 | R9 acompañado, después monitoreo | Margen para correcciones de UI | Ventana de lanzamiento (G-2) y decisión de mantener o revertir |

## Vuelta atrás

| Falla | Acción |
|---|---|
| El código nuevo falla | Instant Rollback de Vercel al deploy anterior. La base se queda, porque es compatible |
| Falla `migrate deploy` | Restaurar el dump de R9 paso 1 y mantener la app de `main` |
| El import de rubros sale mal | `s1-rubros --revert <lote>` |

## Pronóstico de entrega

- Carril F: unas 1.200 líneas.
- Carril D: unas 800 líneas.
- Estrategia: un merge grande como excepción (G-1). Lo que quede de v7 se divide después en PRs de unas 400 líneas.

## Progreso y evidencia

- 2026-10-15: plan creado. PO-1 resuelto (quitar). El mapeo de la reunión confirmó varias cosas:
  - Crear proyectos sin oportunidad ya funciona de punta a punta.
  - «Observado» es una etiqueta derivada (`esObservado`), no un estado del enum.
  - `Proyecto` no tiene descripción.
  - El rechazo de un gasto no notifica a nadie.
- 2026-10-15: el usuario respondió, en nombre del PO, PO-2, PO-4, PO-5 y M1 a M7. Cambios en el plan:
  - D5 y F2 quedan cancelados por M5.
  - Se agrega F14.
  - F13 baja de L a M, porque el PDF sale de la impresión del navegador.
  - Corrección: Clientes tiene solo 2 pestañas vacías (Oportunidades y Mapa), no 6.
  - R3 queda con dos migraciones aditivas: `descripcion` y `GASTO_RECHAZADO`.

- 2026-10-15: el usuario encontró la experiencia difícil en la demo y pidió simplificarla. El inventario de la ficha
  mostró:
  - 11 pestañas.
  - Las mismas actividades en 4 pestañas.
  - El semáforo técnico y el financiero repetidos 3 veces cada uno.
  - 2 juegos de KPI duplicados.
  - El Excel (9 hojas: objetivos, actividades, entregables, indicadores, presupuesto y programación) escondido en Metas,
    solo en borrador y solo para ADM/GER.

  Cambios en el plan:
  - Se aprueba UX-1 (5 pestañas) y UX-2 (ayudas).
  - D1–D6 se cancelan.
  - Se agregan los carriles U (Claude) y X (DeepSeek).
  - Las etiquetas de F11 en gastos pasan a X1.
  - Kanban: `Actividad` no tiene estado propio, así que el tablero se deriva de `technical-status`. Las `Tarea` del CRM
    no tienen vínculo con proyectos.
  - El rediseño no requiere migración.

- 2026-10-15: revisión del carril X. Hallazgos corregidos:
  - Monto (bloqueante y mayor): el campo cambiaba el valor al borrar (`1.234` pasaba a 1,23) y leía un tercer decimal
    como miles. Ahora el punto es siempre separador de miles, la coma es el único decimal y un texto ambiguo se rechaza
    con «usa coma para los decimales» en vez de reinterpretarse; el campo muestra lo escrito mientras tiene el foco y
    agrupa miles al salir (también corrige el salto del cursor). Aplica a la programación y a la asignación. Commit `6899a86`.
  - Gastos: una línea de resumen con los conteos del servidor sustituye a los KPI quitados. Ficha financiera: chip
    «Base original · Corte …» con «Restablecer»; meses legibles en el selector de corte (`mesLegible` pasa a
    `project-display.ts`); leyenda de tolerancia con el parámetro del servidor; barra y frase comparan E contra P.
    «Abrir» se deshabilita sin archivo ni enlace. Commit `34075a1`.
  - API y lib: `url_externa` ya se validaba (solo https, mediante `validarSoporte`); se agregó la prueba de la ruta de
    gastos. El mensaje de aprobación ahora dice «El número de beneficiarios debe ser mayor que cero.». Commit `9873764`.
  - Limpieza: se eliminan `MoneyInput` y `ProjectSoportes` (`formatoSoporte` pasa a `soportes-format.ts`) y el comentario
    obsoleto de `project-ficha.tsx`; la guarda de `responsive-guards.test.ts` sobre los KPI de gastos se adapta a la línea
    de resumen. Commit `7b6c5f3`.

## Siguiente paso

**Sábado 2026-10-17:**
- **Usuario, antes de las 12:00:**
  - el recorrido en el navegador con `odd/tasks/prueba-manual-proyectos-v2.md`;
  - el checklist de paneles de `lanzamiento-v2-pendientes-viernes.md` §3, que incluye `EMAIL_FROM` y PITR;
  - la decisión G-2 (la ventana);
  - autorizar el push de la rama.
- **Claude:** triar los hallazgos del recorrido, y luego R6 (congelamiento y `v2.0.0-rc1`; el paso «merge de
  `feat/ficha-v7-polish`» ya no aplica porque el carril D se canceló) y R7 (ensayo 2 con el rc1, idealmente con un
  dump nuevo).

## Después del lanzamiento: importar las plantillas de la PO

La PO envió `proyecto.xlsx` (hojas Modelo0/Ejemplo0 para objetivo, indicador y meta, y Modelo1/Ejemplo1 para
objetivo, actividad, entregable y semanas de inicio y fin) y `presupuesto.xlsx` (rubro y valor), con una nota de voz.

Análisis del 2026-10-16:
- **El modelo de v2 ya soporta todo**, sin cambios de esquema:
  - N indicadores por objetivo;
  - una actividad con N entregables;
  - semanas enteras, que se corresponden con `semana_inicio` y `semana_fin`;
  - los 15 rubros, iguales al catálogo R01–R15.
- **El importador actual no acepta el formato.** Las hojas y los encabezados son otros, y faltan códigos, cantidad,
  unidad y medio.

Decisiones (usuario, como vocero de la PO, 2026-10-17):

| ID | Decisión |
|---|---|
| T1 | La plantilla del proyecto agrega columnas separadas para **cantidad**, **unidad** y **medio de verificación** de cada entregable; no se interpreta texto libre |
| T2 | **Una fila por entregable**. Las filas con la misma actividad, dentro del mismo objetivo, se agrupan en una actividad con N entregables |
| T3 | Los indicadores llevan una columna **«Unidad»** junto a «Resultados (meta)» |
| T4 | El presupuesto trae solo **rubro y valor**. La programación mensual se hace en la pantalla. Los rubros se emparejan por nombre normalizado, sin tildes ni mayúsculas |
| T5 | Los datos del proyecto (cliente, fechas, valor total) se cargan en el stepper; el Excel solo trae la estructura y el presupuesto |
| T6 | Los códigos (O1, A1.1, E1.1.1, IND-01) los **genera el sistema** |

Plan: un adaptador del formato de la PO al formato interno que reuse `importarPlantilla`, su validación y su vista previa
(`dry_run`). Primero el de presupuesto (tamaño S) y después el de proyecto (tamaño M). También hay que preparar las
plantillas actualizadas con las columnas nuevas para la PO. Va en su propio documento de feature cuando arranque.

**Hallazgo (2026-10-17, prueba manual del usuario):** la importación exige el paquete completo. V-12
(`validate.ts:945-969`) es un **error**: el presupuesto debe sumar exactamente el `valor_total`. V-13 exige además la
programación mensual. Por eso **no se pueden cargar solo metas y actividades** en un proyecto nuevo sin presupuesto,
que es justo el flujo que pide la PO: primero la estructura, después el presupuesto. Para el adaptador hay que decidir
si la importación de estructura deja de exigir presupuesto, por ejemplo con un modo «solo estructura» que conserve el
presupuesto existente.

## Después del lanzamiento: rubros editables por proyecto

Es un pedido de la PO del 2026-10-17. El usuario decidió dejarlo para después del lanzamiento. Dentro de un proyecto se
quiere:
- **deshabilitar** los rubros que no se usan;
- **agregar rubros personalizados**.

Hoy el catálogo R01–R15 es global y fijo, sin alta (`src/components/admin/catalogos-v2-section.tsx:6`). El
administrador solo puede renombrar o suspender rubros, y eso afecta a todos los proyectos. Dentro de un proyecto, un
rubro sin uso queda en $0 y se sigue mostrando.

El cambio requiere una migración, porque el rubro tendría que poder pertenecer a un proyecto, y toca presupuesto,
modificaciones, importación, reportes y `s1-rubros`. Va junto al adaptador de plantillas.

Preguntas para la PO:
1. ¿El rubro personalizado existe solo en su proyecto o se suma al catálogo general?
2. En los reportes de varios proyectos, ¿cómo se agrupan los rubros personalizados?
3. ¿Qué pasa al deshabilitar en un proyecto un rubro que ya tiene gastos: se bloquea o solo se oculta?

Hay un paso intermedio sin migración: que la vista de presupuesto oculte los rubros en $0, con un interruptor.

## Después del lanzamiento: subir documentos generales del proyecto

Hallazgo del recorrido manual del 2026-10-17; el usuario decidió dejarlo para después del lanzamiento.

La pestaña Documentos (`ficha-documentos.tsx`) junta los soportes de avances, mediciones y gastos, y además tiene un
grupo «Proyecto» para documentos generales: contrato, convenio, acta de inicio. El servidor ya soporta subirlos (el
tipo `proyecto_soporte` en `src/lib/api/signed-upload.ts:19` y `src/lib/api/soportes.ts`), pero **ninguna pantalla lo
usa**. Hoy ese grupo siempre queda vacío.

Falta un botón «Subir documento» en la pestaña Documentos, con el permiso adecuado, sobre la API existente. No hace
falta migración.

Resultados del recorrido del 2026-10-17:
- La importación de la plantilla de la PO en PRY-2026-005 funcionó: objetivos, Gantt y cronograma.
- `/administracion` ya no muestra la pantalla negra.
