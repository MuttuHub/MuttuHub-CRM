# T1 — Análisis profundo del historial local de `feat/projects-v2` (251 commits)

**Repositorio:** `C:\Users\Adrian\Documents\MuttuHub-CRM`
**Rama analizada:** `feat/projects-v2` @ `e2612960192637773b90ee2bfa1002a3188016cb`
**Sujeto:** `git log origin/feat/projects-v2..HEAD` — 251 commits, 2026-10-05 08:32 → 2026-10-13 13:38 (America/Bogota)
**Modo:** sólo lectura sobre git (`log`/`show`/`diff`/`status`/`cherry`/`rev-list`/`reflog`/`ls-tree`/`grep`). No se abrió ningún `.env*`. No se ejecutó prisma/seed/migrate/dev/build.

Verificación de base del alcance:

```
$ git rev-list --count origin/feat/projects-v2..HEAD
251
$ git rev-parse HEAD origin/feat/projects-v2
e2612960192637773b90ee2bfa1002a3188016cb
42b8da08c7038b7e45dad4554e69ec72bbae68ab
$ git merge-base HEAD origin/feat/projects-v2
42b8da08c7038b7e45dad4554e69ec72bbae68ab      # el remoto es ancestro directo => push sería fast-forward
$ git diff --shortstat origin/feat/projects-v2..HEAD
 567 files changed, 84454 insertions(+), 880 deletions(-)
```

---

## 1. Resumen ejecutivo

La rama es un conjunto de features verticales construido en 8 días laborables por un único autor (251/251 commits de `agutierrezreginodev <dev.agutierrezregino@gmail.com>`, 0 merges). Cubre de punta a punta el módulo **v2 de Proyectos** (catálogos → modelo → estructura → ejecución técnica → presupuesto → gastos → plantilla Excel → versiones → tableros/KPIs → rediseño visual v6 → secciones v6 y alineación v7), con 18 migraciones nuevas, 42 archivos nuevos bajo `prisma/` y 26 documentos nuevos de gobernanza en `odd/tasks/`.

Calidad de mensajes alta y consistente (Conventional Commits en 251/251, cuerpo explicativo con el *por qué* en la mayoría). Sin secretos, sin artefactos binarios, sin `TODO`/`FIXME` nuevos, sin `console.log` en `src/`, sin `.only(`/`.skip(` introducidos, sin commits `WIP`/`revert`. Los tres puntos que requieren decisión humana antes de publicar son: **(a)** el alcance de lectura del CRM, que es global por diseño con inconsistencias en sub-recursos, **(b)** la rama **termina a mitad de unidad** (v7 C4 «Relaciones» con backend ya escrito y el ledger sin marcar), y **(c)** el propio plan de entrega declara que **casi nada ha pasado revisión nativa** y que el candidato de rama completa excede el presupuesto de contexto del revisor.

---

## 2. Instantánea cuantitativa (todo medido)

### 2.1 Conteos base

| Métrica | Valor | Comando |
|---|---|---|
| Commits en el rango | **251** | `git rev-list --count origin/feat/projects-v2..HEAD` |
| Merges | **0** | `git rev-list --count --merges ...` |
| Commits no-merge | **251** | `git rev-list --count --no-merges ...` |
| Autores / committers distintos | **1 / 1** | `git shortlog -sn ...` |
| Rango temporal | 2026-10-05 08:32 → 2026-10-13 13:38 | `git log --format="%ad" --date=format:"%Y-%m-%d %H:%M" --reverse` |
| Diff neto del rango | **567 archivos, +84 454 / −880** | `git diff --shortstat origin/feat/projects-v2..HEAD` |
| Suma de numstat por commit (archivo-topes, no diff neto) | 1 332 archivos tocados, +88 988 / −5 414 | `git log --numstat` agregado con bucle en PowerShell |

La diferencia entre +84 454 (diff neto) y +88 988 (suma por commit) es esperada: un mismo archivo se reescribe en varios commits.

### 2.2 Distribución por tipo

| Tipo | Commits | % |
|---|---|---|
| `feat` | **128** | 51,0 % |
| `docs` | **84** | 33,5 % |
| `fix` | **22** | 8,8 % |
| `test` | **14** | 5,6 % |
| `refactor` | **3** | 1,2 % |
| `chore`, `perf` | **0 / 0** | 0 % |
| Mensajes fuera de Conventional Commits | **0** | 0 % |

Un tercio de la rama es documentación: `odd/tasks/*` aportó **+3 648 / −25** líneas en 26 archivos nuevos y `docs/` **+928** líneas en 4 archivos nuevos (`git diff --numstat origin/feat/projects-v2..HEAD -- odd docs`). Esto es el proceso «ODD» del repo (ledger por slice) y es lo que hace legible el arco.

### 2.3 Longitud de asunto

`total_chars=17133`, `n=251` ⇒ **media 68,3 caracteres**, **máximo 126**, **44 commits >80 caracteres**. No hay asuntos vacíos ni de una palabra.

### 2.4 Tamaño por commit (`git log --numstat`)

| Métrica | Valor |
|---|---|
| Commits que tocan **>10 archivos** | **40** |
| Commits que tocan **>50 archivos** | **0** |
| Commits de **1 solo archivo** | **74** |
| Commits sin archivos | **0** |

**Top 10 por número de archivos** (hash │ asunto │ archivos │ + / −):

| # | Commit | Asunto | Arch. | +/− |
|---|---|---|---|---|
| 1 | `4f95cf4` | refactor(proyectos): share the semaforo chip and the section primitives… | 32 | +315 / −241 |
| 2 | `a99bf22` | feat(ui): migrate proyectos surfaces and controls to the v6 vocabulary | 28 | +75 / −75 |
| 3 | `812868e` | feat(projects): add deliverables and result indicators (S3 U3) | 21 | +1877 / −17 |
| 4 | `d1f7bcf` | fix(estructura): lock the project row in every structure writer… | 21 | +288 / −30 |
| 5 | `2aed734` | feat(ejecucion): add avance medios with signed upload… | 20 | +1297 / −4 |
| 6 | `021b560` | feat(ejecucion): add the deliverable avances backend… | 19 | +1502 / −4 |
| 7 | `b38868e` | feat(ejecucion): add indicator measurements and beneficiary records… | 19 | +1651 / −6 |
| 8 | `0fc495d` | feat(gastos): validate, reject and void expenses with the overspend lock… | 19 | +1502 / −2 |
| 9 | `6f0009e` | feat(proyectos): show avance and kpis with accessible progress bars… | 19 | +179 / −71 |
| 10 | `21e36c3` | feat(ui): unify table headers and rows on the v6 primitive | 18 | +262 / −261 |

**Top 6 por churn (adiciones + borrados):**

| Commit | Asunto | Arch. | +/− |
|---|---|---|---|
| `13dae48` | feat(gastos): register expenses with supports, duplicate and early-overspend alerts | 14 | +2013 / −138 |
| `0edca6d` | feat(proyectos): render the project ficha on its own page | 5 | **+1164 / −986** |
| `4f568e1` | feat(projects): add technical structure section to the project ficha (S3 U4) | 12 | +2137 / −2 |
| `1601b93` | feat(ejecucion): add avance, medicion and beneficiario forms with write gating | 12 | +1952 / −54 |
| `3a42837` | feat(projects): create projects from won opportunities in one audited step (S2.3) | 13 | +1924 / −49 |
| `4762eb8` | feat(catalogs): add the administrable municipios catalog (S1.3) | 13 | +1890 / −7 |

### 2.5 Mezcla de asuntos por commit (prefijos de primer nivel del árbol)

Histograma de «áreas» distintas tocadas por commit (`prisma/`, `src/lib`, `src/app`, `src/components`, `src/hooks`, `odd`, `docs`, `scripts`, `e2e`, …):

| Áreas por commit | Commits |
|---|---|
| 1 | **157** |
| 3 | 46 |
| 5 | 32 |
| 7 | 14 |
| 9 | 2 |
| **Total** | **251** |

No hay commits con 2, 4, 6 u 8 áreas: la forma del repo es una **rebanada vertical canónica** por unidad (esquema/migración + lib pura + ruta + componente + test + OpenAPI + doc). Los **48 commits con ≥5 áreas** (32 + 14 + 2) son los «todo-en-uno»; los dos peores con 9 áreas son `01a69e5` (ficha + historial auditado) y `d540ffd` (S2.6 T4, equipo creado con el proyecto). Es un problema de *revisión y revert selectivo*, no de corrección: no se pueden revertir sin arrastrar la mitad de un slice.

### 2.6 Composición del diff por extensión

`ts=333`, `tsx=182`, `md=30`, `sql=18`, `prisma=1`, `json=1`, `css=1`, `(sin ext)=1` (suma 567).

---

## 3. Narrativa del arco (qué entregaron realmente los 251 commits)

La rama ejecuta el plan ODD del propio repo (`odd/tasks/v2-projects-sdd.md`, `odd/tasks/v2-projects-execution.md`) y luego pivota dos veces: **v6 (rediseño visual)** y **v7 (alineación con prototipo)**.

| Fase | Slices / unidades | Commits clave | Qué entregó |
|---|---|---|---|
| **F0. Catálogo base y modelo** (05–06 oct) | S1.3, S2.1a/b, S2.2, S2.3 | `4762eb8`, `9ddc68a`, `e59bbd4`, `6617a4f`, `afa4c27`, `3a42837` | Catálogo administrable de municipios; modelo `Proyecto` con líneas estratégicas y municipios; API de proyecto + reglas puras de datos generales; códigos autogenerados `PRY-AAAA-NNN` (tabla de secuencias); creación de proyecto desde oportunidad **GANADA** en un solo paso auditado. `6617a4f` corrige 500→400 ante body escalar JSON. |
| **F1. UI mínima y demo** (06 oct) | S2.5, demo reset, e2e narrado | `3e94c11`, `885401f`, `5ee8d36`, `8d260b9`, `b2a2fcd`, `01a69e5` | Lista read-only en `/proyectos`, diálogo de creación con paso «origen»; **reset de demo con guardia**; spec e2e narrado del camino de creación; ficha read-only e historial auditado en la ficha. |
| **F2. Membresía y estructura** (07–08 oct) | S2.6 T1–T5, S2.4, S2.7, S3 U1–U4/U2a/U2b/U3/U6b | `20a2923`, `6d9652b`, `7faf6f7`, `643375a`, `d540ffd`, `574cea3`, `fb8bad3`, `ffb3a84`, `fbaa1a0`, `812868e`, `4f568e1`, `53632e7` | `proyecto_miembros` y **lectura de proyectos acotada por membresía activa** (`7faf6f7`); rutas de equipo; equipo creado con el proyecto; sección de equipo en la ficha; objetivos, actividades **por semana**, entregables e indicadores de resultado; sección de estructura técnica y Gantt semanal. `20a2923` arregla el desfase de un día UTC-5 en `input type=date` (toca `prisma/seed.ts`). |
| **F3. Admin y parámetros** (08 oct) | E1, E2, D1, D2 | `e535518`, `170fcb0`, `8723ef1`, `a7e640c` | Los admins pueden **listar** rubros/líneas/municipios suspendidos vía `?incluir_inactivos=true` (sólo `ADMINISTRADOR`); sección de catálogos v2; parámetros de semáforo v2 auditados + formulario. |
| **F4. Ejecución técnica** (08 oct) | S4 U1–U7 | `bd775f7`, `021b560`, `2aed734`, `b38868e`, `42f777c`, `a42c45e`, `1601b93` | Libs puras de avance y semáforo técnico; avances de entregable + herramienta local de estado; **medios de avance con subida y descarga firmadas**; mediciones de indicador y beneficiarios con guardas de anulación/borrado; endpoint de estado técnico con contrato de semáforo; sección de ejecución read-only y formularios con *write gating*. |
| **F5. Presupuesto y ficha financiera** (08 oct) | S5 U1–U6 | `6e39cde`, `dbe8f91`, `7673e50`, `63d3938`, `9371645`, `318c915` | Libs financieras con fixture dorado `F-F1`; tablas de línea presupuestal y programación mensual con **invariantes en BD, guarda de renombrado de rubro y montos de informe**; rutas con auditoría y OpenAPI; ficha financiera con estado técnico compartido y costura de gastos; editores en la ficha. |
| **F6. Gastos** (08 oct) | S6 U1–U6 | `3d2384f`, `089fad3`, `13dae48`, `0fc495d`, `cca878b`, `015eada`, `3a90878` | Reglas puras de gasto (normalización de identificación y documento); esquema con checks, padre `gasto` de soportes y **bitácora de accesos append-only**; registro con alertas de duplicado y sobregasto temprano; validar/rechazar/anular con **bloqueo por sobregasto** (409 `OVERSPEND_BLOCKED`) y notificaciones; descarga de soportes con bitácora y «feed E»; sección Gastos con formulario y cola de validación. |
| **F7. Plantilla Excel** (08 oct) | S7 U1–U7 | `ae2881d`, `bf7bcd6`, `6f8b6a3`, `90d7776`, `5b9b9bb`, `4b6c565`, `b68d0da`, `eb96b31`, `ed4dd96`, `3a05c6c` | Columnas, generador y fixture `CedeTextil`; parser con *round-trip*; validadores v01–v07 y plan de importación; `4b6c565` corrige celdas no finitas/hojas gigantes y cierra la hoja de proyecto; rutas de descarga e importación con **escritor atómico**; diálogo + OpenAPI; script piloto local; `3a05c6c` demuestra la atomicidad contra la transacción real. |
| **F8. Versiones y modificaciones** (08 oct, noche) | S8 U1–U6 | `b66dd75`, `07e6db0`, `d1f7bcf`, `f42588c`, `b30c6e1`, `87c742f`, `4b52ed4`, `ef26992`, `6a91733`, `4fa441c`, `2e7ed11`, `5a5d30d`, `45e8f9a` | Tablas de versión y solicitud de modificación con **trigger de inmutabilidad**; libs de snapshot/diff/precondición de línea base; **`d1f7bcf` bloquea la fila del proyecto (`FOR UPDATE`) en todos los escritores de estructura**; aprobación de línea base con escritor atómico v0; reglas RF-28; rutas de solicitud/aprobación/rechazo y comparación v0 vs vigente; UI de versiones, cola de solicitudes y selector `base=original`. |
| **F9. Tableros, KPIs y exportes** (09 oct) | S9 U1–U6 | `03c45be`, `f853583`, `2d8f64a`, `671b8e5`, `60a1c06`, `8046fca`, `6df4b13`, `8cab543`, `f02c717`, `81f0fcd`, `23cb5a9`, `e6b0616`, `8d1c544`, `6ff6bab` | Lib pura de KPIs; **bandera `puede_ver_tablero_gerencial` en `usuarios`** y su resolución en el actor de proyecto; cargador de KPI de portafolio por lotes con tests de paridad y de número de llamadas; lectura de `base=original` congelada; rutas de tablero de portafolio y KPIs por proyecto + *bench* local; libros Excel con guarda de fórmulas; hooks, descargas y panel de KPIs; tablero de portafolio. Dos `refactor` mueven el cálculo financiero y la lectura de portafolio a libs compartidas. |
| **F10. Rediseño visual v6** (09–11 oct) | S10 WU0–WU5, S13 U1–U7 | `951f0da`, `4f95cf4`, `f5d4767`, `6f0009e`, `2a44ff5`, `c67ea5d`, `bbfc700`, `7948b40`, `6fb8b0d`, `fcc97ce`, `cd48a1b`, `d3f1ac8`, `57b6aad`, `7b19b54`, `16fdd6b`, `21e36c3`, `982b120`, `196a601`, `7837acf`, `8d3ccbd`, `e2ef1f7`, `eb2ab86`, `8f1c6e4`, `c9f4444`, `4efdd0d`, `6ec9b62`, `a9ac5d1`, `a99bf22`, `67409b6`, `22c7d29`, `0461101`, `dc07a72`, `189c524`, `2ec2da1`, `9e017d1` | Primitivas `StatusChip`/`KpiTile`/`ProgressBar`/`EmptyState`/`PageHeader`; ficha en pestañas perezosas; formularios en *bottom sheet* <md con controles de 44 px; listas y tablero como tarjetas en móvil; tests de accesibilidad, contraste y paleta; adopción de **tokens v6** (tomados de la rama `v6`), tarjetas/diálogos/hojas/select/tablas/pestañas, radio 12, paleta clara derivada, **manual de marca v2** y tema claro por defecto, sidebar v6 con raíl, y migración de superficies/controles de CRM, dashboard, kanban, documentos, reportes, admin, shell y **páginas de auth**, con guardas de test contra radios y tamaños hard-codeados. |
| **F11. Secciones v6 de Proyectos** (11–12 oct) | S14 P1–P9 + F2/F3 | `789b8ff`, `e63ce6a`, `84c469e`, `e117910`, `dd5ad0f`, `8e3b34b`, `bec2c55`, `72c5d4b`, `d5a80f5`, `9a899e2`, `199609a`, `948ab9f`, `ac2f5ad`, `fa0b882`, `31bd560`, `96b8a1f`, `ea9934d`, `09ff0b0`, `991ce9c`, `733eafb`, `c800e40`, `8777db0`, `e2f661d`, `1c3f9ca` | Agregados de portafolio (atrasadas, beneficiarios, línea estratégica); fila de KPIs de portafolio; barras de avance técnico/financiero en la lista; 6 tarjetas de KPI en el Resumen; ledger de gastos filtrable con KPIs de soportes; ficha partida en 8 pestañas con cronograma semanal; **lista de atención derivada del servidor**; enriquecimiento del estado técnico con roll-ups de objetivo; vistas de Cronograma y Metas e indicadores; **curva S** (matemática pura + endpoint + pestaña Avance con tabla mensual); gauge de presupuesto y barras por rubro; radar + tablero gerencial. `fa0b882` corrige el agrupado del cronograma y `1c3f9ca` pinta la barra de entregables con el valor del servidor. |
| **F12. Correcciones de gráficos F1 y alineación v7** (13 oct) | F1, F2, F3, v7 T1/P1/C1a/C3a/C3b/C4a | `ecff2a9`, `ca68b78`, `02a15e8`, `6de46a1`, `862dd9c`, `b62fa8c`, `12d8866`, `a20bcdc`, `3ba7c9a`, `8dd426c`, `80c26fa`, `bbaffb6`, `3fe9f5b`, `91b8c1f`, `da333a3`, `c0666ef`, `71716d9`, `e261296` | Correcciones de gauge/radar/curva S detectadas con capturas (`F1`); tablero alineado a la vista «Tareas» de v7; ficha reagrupada a las pestañas v7 + pestaña **Soportes** + ajustes de 390 px; **shell de sub-navegación de Clientes (C1a)**; **Interacciones (C3)**: tipo de interacción + `proximo_paso` en bitácora, feed cross-cliente y diálogo; **Relaciones (C4a)**: backend de cuadrante poder/interés. |

Fechas y volumen por día (`git log --format="%ad" --date=format:"%Y-%m-%d"`):

| Día | Commits |
|---|---|
| 2026-10-05 | 11 |
| 2026-10-06 | 8 |
| 2026-10-07 | 9 |
| 2026-10-08 | **83** |
| 2026-10-09 | **59** |
| 2026-10-10 | **0** (sin commits) |
| 2026-10-11 | 45 |
| 2026-10-12 | 14 |
| 2026-10-13 | 22 |

---

## 4. Subconjunto riesgoso (diffs leídos)

### 4.1 Esquema, migraciones e invariantes

**`b66dd75` — S8 U1: versiones + trigger de inmutabilidad** (`prisma/migrations/20261011120000_v2_versiones/migration.sql`, 93 líneas; 3 archivos, +414)
Crea `versiones_proyecto` y `solicitudes_modificacion` con checks que Prisma no puede expresar (`(tipo='LINEA_BASE') = (numero=0)`, `(tipo='MODIFICACION') = (solicitud_id IS NOT NULL)`, `jsonb_typeof(detalle)='array'`, rechazo con comentario obligatorio, decisión con decididor y fecha). Añade `versiones_proyecto_inmutable()` con triggers `BEFORE UPDATE OR DELETE` (fila) y `BEFORE TRUNCATE` (sentencia). **Importa:** `ON DELETE RESTRICT` desde `versiones_proyecto` hacia `proyectos` significa que un proyecto con versiones no se puede borrar nunca a nivel BD; y el trigger de truncado puede romper resets/restauraciones que usen `TRUNCATE`. No es destructivo, pero es rígido por diseño.

**`089fad3` — S6 U2: esquema de gastos** (`.../20261010120000_v2_gastos_validacion/migration.sql`, 184 líneas; 3 archivos, +608)
Migración «adoptiva e idempotente» (`IF NOT EXISTS` / bloques `duplicate_object`). Crea `gastos` con **7 CHECK de negocio** (`monto_cop > 0`, formato de periodo `^[0-9]{4}-(0[1-9]|1[0-2])$`, validador ≠ registrador, rechazo con motivo y rechazador, rechazador ≠ registrador, `VALIDADO` exige validador + fecha + tercero identificado, coherencia de anulación) y FK compuesta `(linea_id, proyecto_id)`. Añade `gasto_id` a `soportes_proyecto`, reescribe el check de padre y crea `acceso_soportes` con su propia función/triggers inmutables. **Riesgo real:** las dos últimas operaciones son **DDL sobre tablas existentes** (`ALTER TABLE ... DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT ... CHECK (num_nonnulls(...) = 1)`, y `ALTER TABLE ... ADD COLUMN`); en Postgres un `ADD CONSTRAINT CHECK` toma lock `ACCESS EXCLUSIVE` y hace *full scan*. Aceptable si `soportes_proyecto` es pequeña, pero debe ejecutarse en ventana controlada verificando el tamaño antes del deploy.

**`0fc495d` — S6 U4: sobregasto, dos migraciones acopladas por orden** (19 archivos, +1502)
`20261010130000_v2_notificacion_sobregasto_enum` contiene **una sola sentencia** `ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOBREGASTO_RUBRO'`; `20261010130100_v2_notificaciones_proyecto` añade columnas, FKs e índice único. El propio comentario explica que `ADD VALUE` no puede compartir transacción con su uso. **Riesgo:** son dos migraciones que **deben aplicarse en orden y nunca por separado**; el plan de entrega lo señala explícitamente como riesgo de la unidad U6. La validación de gastos corre en una transacción que **bloquea la fila de la línea presupuestal, relee el gasto bajo lock y devuelve un resultado bloqueado (nunca lanza)**, de modo que la alerta y las notificaciones commitean mientras la ruta responde `409 OVERSPEND_BLOCKED`.

**`dbe8f91` — S5 U2: presupuesto con invariantes y guarda de renombrado** (8 archivos, +1417/−0)
Tablas de línea presupuestal y programación mensual con invariantes en BD, guarda ante renombrado de rubro y montos de informe. Sin migración destructiva.

**`671b8e5` — S9 U2: bandera gerencial** (10 archivos, +190/−5; migración de 2 líneas)
`ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "puede_ver_tablero_gerencial" BOOLEAN NOT NULL DEFAULT false` — aditiva e idempotente, «nadie gana ni pierde acceso al migrar». Pero el diff de `src/lib/api/projects.ts` sustituye `const UNRESOLVED_GERENCIAL_FLAG = false` por `usuario.puede_ver_tablero_gerencial`: **un `COLABORADOR` con la bandera activa pasa a leer el portafolio completo y cualquier proyecto** (`projectListWhere` pasa de `{deleted_at:null, id:{in:[]}}` a `{deleted_at:null}`). Sólo `ADMINISTRADOR` puede asignarla y los tests confirman que no abre ninguna puerta de escritura, ejecución, aprobación, validación de gasto ni soportes financieros. Es una ampliación de lectura *deliberada y comprobada*, pero es una capacidad de «leer todo» concedida por un booleano.

**`3fe9f5b` y `71716d9` — migraciones v7 (interacciones y relaciones)**
Ambas adoptivas, idempotentes y nulables; ninguna toca datos existentes (`tipo` con `DEFAULT 'OTRO'`, resto nullable). `71716d9` añade a `contactos` `poder`/`interes` (1..5) y `fuerza_relacion` (1..3) **validados sólo en la capa API** (400 fuera de rango) y `owner_id` con FK `ON DELETE SET NULL`. Un check en BD sería más robusto, pero el rango se cubre con test de invariante.

**Orden de migraciones:** `migraciones_nuevas=18`, y el orden de carpetas es **estrictamente monotónico** en el orden de commit (verificado comparando el nombre de carpeta en secuencia: `ORDEN MONOTONO: OK`). Listado completo (commit · carpeta):

```
4762eb8 · 20261005120000_v2_municipios
9ddc68a · 20261006120000_v2_proyecto_general
afa4c27 · 20261007120000_v2_proyecto_secuencias
6d9652b · 20261007130000_v2_proyecto_miembros
fb8bad3 · 20261008120000_v2_objetivos
ffb3a84 · 20261008121000_v2_actividades
812868e · 20261008122000_v2_entregables_indicadores
021b560 · 20261008130000_v2_avances
2aed734 · 20261008140000_v2_soportes_medios
b38868e · 20261008150000_v2_mediciones_beneficiarios
dbe8f91 · 20261009120000_v2_presupuesto
089fad3 · 20261010120000_v2_gastos_validacion
0fc495d · 20261010130000_v2_notificacion_sobregasto_enum
0fc495d · 20261010130100_v2_notificaciones_proyecto
b66dd75 · 20261011120000_v2_versiones
671b8e5 · 20261012120000_v2_gerencial_flag
3fe9f5b · 20261013120000_v2_interacciones
71716d9 · 20261013130000_v2_relaciones
```

**Anomalía de nomenclatura:** las carpetas usan la *fecha planificada del slice*, no la del commit. `20261012120000_v2_gerencial_flag` se commiteó el **2026-10-09** (3 días «en el futuro»); `20261011120000_v2_versiones` y `20261010120000_v2_gastos_validacion` el 2026-10-08. El orden sigue siendo correcto, pero si otra rama elige el mismo prefijo habrá colisión de carpeta.

### 4.2 Autorización

- **Superficie de auth tocada en el rango: sólo una página.** `git diff --name-status origin/feat/projects-v2..HEAD -- src/lib/supabase src/middleware.ts middleware.ts src/lib/auth "src/app/(auth)" src/app/api/auth` devuelve exactamente `M src/app/(auth)/login/page.tsx` (commit `22c7d29`, migración a tokens v6: **estilo, no lógica**). **No hay cambios de sesión, middleware, cookies ni proveedores.** Hallazgo tranquilizador.
- **`91b8c1f` — fix(crm): leer el feed de interacciones globalmente** (2 archivos, +13/−26). Siete minutos después de `3fe9f5b` (que lo construyó **con** scoping), este commit elimina el filtro por rol de `buildInteractionWhere`: se borra el import de `isFullAccess` y el `...(isFullAccess(usuario.rol) ? {} : { responsable_id: usuario.id })`. Resultado: **cualquier usuario autenticado ve las interacciones de todos los clientes** (sólo se ocultan clientes con soft-delete). El mensaje lo justifica como espejo de las lecturas globales del listado de clientes (PR 3, anterior a esta rama). Es coherente, pero es un cambio de autorización con justificación de consistencia, no de requisito.
- **`e535518` — catálogos suspendidos**: el gate es correcto y explícito. `src/lib/api/incluir-inactivos.ts` sólo devuelve `true` si `rol === "ADMINISTRADOR"`; cualquier otro rol recibe silenciosamente sólo activos.
- **`7faf6f7` — S2.6 T2**: acota los caminos de lectura de proyecto por membresía activa. Es el contrapeso del punto anterior y la base sobre la que `671b8e5` reabre lectura.

### 4.3 Scripts de datos (semilla, demo, pilotos)

| Script | Guardia |
|---|---|
| `scripts/reset-demo.ts` | `import "../prisma/require-local-db"` **como primer import** (comentado como obligatorio: los módulos ES evalúan en orden y así se carga `.env.local` antes de que `@/lib/db` construya el cliente). Dry-run por defecto; sólo `--apply` escribe. Nunca toca `auditoria_cambios`. |
| `scripts/seed-projects-demo.ts` | `import "../prisma/require-local-db"` + `assertLocalTarget(process.env.DATABASE_URL)` como segunda línea (`NonLocalDatabaseError`, «Refusing to run: DATABASE_URL points to … not to a loopback database»). |
| `scripts/set-project-estado.ts` | `import "../prisma/require-local-db"` como primer import. |
| `scripts/import-plantilla-demo.ts` | `import "../prisma/require-local-db"` como primer import; hay un test que **afirma el literal del primer import** (`expect(primerImport).toBe('import "../prisma/require-local-db"')`). |
| `scripts/migrate-v2/_guard.ts` | Encadena `require-local-db`. |

Esto es exactamente la mitigación pedida en `CLAUDE.md` tras el incidente de seed contra Supabase Cloud. **`prisma/require-local-db.ts` y `prisma/local-env.ts` no se modificaron en el rango**: la guardia es preexistente y se respetó.

Dos correcciones posteriores sobre la misma ruta sugieren que el guion de demo se estabilizó a golpes: `1250829` («delete project members and child rows in the demo reset», +42/−22 en el script) y `d897051` («detect a partial demo seed instead of reporting it as complete», +33/−16). `reset-demo.ts` creció hasta **448 líneas** con planificador puro testeable, lista ordenada de 12 tablas hijas (`DEMO_CHILD_TABLES`) y borrado *hard* justificado porque `proyectos.oportunidad_id` es `@unique` sin índice parcial.

### 4.4 Concurrencia y estado (los `fix` que revelan inestabilidad)

**`d1f7bcf` — fix(estructura): bloquear la fila del proyecto en cada escritor** (21 archivos, +288/−30). Es el commit más revelador de la rama:
- Añade `lockProyectoBorrador(tx, id, mensaje)` (`SELECT "estado", "valor_total"::text FROM "proyectos" WHERE "id" = $1 FOR UPDATE`) **antes** de cada escritura en 6 grupos de rutas (actividades, entregables, indicadores, objetivos, PATCH de proyecto) y en sus 12 archivos de test.
- Mueve `RespuestaAbortada` desde `src/lib/api/presupuesto.ts` a `src/lib/api/errors.ts` para que `withApiErrorHandling` la capture (`if (err instanceof RespuestaAbortada) return err.response`). **Antes de este commit, si el lock abortaba en una ruta que no fuera de presupuesto, el handler habría devuelto 500 en vez de 409**: la clase de error existía pero el manejador global no la conocía.
- Lectura: la invariante «no se puede editar estructura si el proyecto ya no está en BORRADOR» **no estaba protegida** hasta que S8 introdujo la aprobación de línea base. El `fix` es correcto y bien testeado (los tests verifican el orden de invocación del lock y el 409 sin escritura), pero confirma que ~20 rutas convivieron con una condición de carrera.

**`45e8f9a` — test(versiones): surface an early failure of the approving transaction in the race test** (solo tests): el test de carrera se ajustó porque la transacción aprobadora fallaba antes de lo esperado.

**`fa0b882`, `1c3f9ca`, `ca68b78`, `02a15e8`, `6de46a1`, `862dd9c`, `4b6c565`** — siete correcciones de cálculo/render (agrupado del cronograma «independientemente del orden de semanas»; barra de entregables usando el valor del servidor y recorte de días transcurridos; bandas del gauge con *small arc flag*; radar con <3 ejes que cae a barras; curva técnica planificada evaluada en el mes de corte; separación del hub del gauge; celdas no finitas/hojas gigantes en la plantilla). Ninguna es un fallo de datos; todas son correcciones de presentación o de borde detectadas después con capturas (`ecff2a9` «screenshot verification and the fix plan»).

### 4.5 Borrados y refactor grande

**`0edca6d` + `cdb2543` — la ficha pasa a página propia.** `0edca6d` (5 archivos, +1164/−986) crea `src/app/(app)/proyectos/[id]/page.tsx` y `src/components/proyectos/project-ficha.tsx` (+474) con su test (+654), y **vacía** `project-ficha-dialog.tsx` (415→~0) y su test (587→~0). `cdb2543` completa el cambio y **borra** ambos archivos del diálogo. Migración limpia con reemplazo funcional, no una pérdida.

**`4f95cf4`** (32 archivos, +315/−241) y **`a99bf22`** (28 archivos, +75/−75) son refactorizaciones de vocabulario visual; el primero mueve el chip de semáforo y las primitivas de sección a componentes compartidos, el segundo reemplaza clases de superficie. Churn alto pero mecánico.

---

## 5. Borrados, renombrados y reescrituras

```
$ git log --format="COMMIT %h %s" --diff-filter=D --name-only --no-renames origin/feat/projects-v2..HEAD
COMMIT cdb2543 feat(proyectos): open the project ficha in a new tab from the list and the tablero
src/components/proyectos/project-ficha-dialog.test.tsx
src/components/proyectos/project-ficha-dialog.tsx

$ git log --diff-filter=R --name-status -M origin/feat/projects-v2..HEAD
(vacío: 0 renombrados en el rango)
```

Sólo **2 archivos borrados en 251 commits**, ambos reemplazados por `project-ficha.tsx` + la página propia. No hay borrados accidentales ni eliminaciones de documentación.

**Reescritura de historia:** el rango analizado **no fue reescrito** (251 commits lineales, 0 merges, `git cherry` contra `origin/feat/projects-v2` da **251 `+` y 0 `−`**, es decir ninguno es equivalente a algo ya publicado). Sí hay evidencia de una reescritura **anterior al rango**:

```
$ git reflog --date=iso -n 400   (entradas no-commit)
5f4e4a8 HEAD@{2026-09-30 16:46:04}: rebase (finish): returning to refs/heads/feat/projects-v2
6bee83f HEAD@{2026-09-30 16:45:56}: rebase (start): checkout main
...
789b8ff HEAD@{2026-10-11 16:15:50}: reset: moving to HEAD
7948b40 HEAD@{2026-10-09 14:47:13}: reset: moving to HEAD
7948b40 HEAD@{2026-10-09 14:47:09}: reset: moving to 7948b409f5b2a11e54e7bca3f2a04debeb0dac04
07e6db0 HEAD@{2026-10-08 21:23:14}: reset: moving to HEAD
1f8650b HEAD@{2026-10-08 08:10:37}: reset: moving to HEAD
$ git reflog show backup/pre-rebase-feat-projects-v2-20260930
97e08be ...@{2026-09-30 13:54:55}: branch: Created from feat/projects-v2
```

Lectura: el 2026-09-30 (fuera del rango) la rama se **rebaseó sobre `main`**, con rama de respaldo `backup/pre-rebase-feat-projects-v2-20260930` creada 3 horas antes. Dentro del rango hay cuatro `reset` **a HEAD** (no-ops: `789b8ff` ya era HEAD en 2026-10-11 16:13, `7948b40` ya era HEAD en 2026-10-09 14:44) y un `reset: moving to 7948b40` que apunta al commit inmediatamente anterior de la propia rama. `ORIG_HEAD` = `789b8ff` (54 commits por detrás de HEAD). **Conclusión: ningún commit de los 251 se perdió por reset**, pero se usó `reset` sobre la rama cinco veces, así que conviene comprobar el árbol de trabajo antes de publicar (`git status` limpio ⇒ no hay cambios sin commitear que se hayan quedado fuera).

---

## 6. Divergencia y riesgo de push

**Qué se publicaría exactamente**
- `git rev-parse HEAD` = `e2612960192637773b90ee2bfa1002a3188016cb`.
- `git merge-base HEAD origin/feat/projects-v2` = `42b8da0` = **tip del remoto** ⇒ el push sería **fast-forward puro**, sin force y sin reescribir lo publicado.
- `git diff --shortstat origin/feat/projects-v2..HEAD` = 567 archivos, +84 454 / −880.
- `git cherry -v origin/feat/projects-v2 HEAD` = **251 `+` / 0 `−`** ⇒ ninguno de los 251 ya existe arriba con otro id.
- `git rev-list --count origin/main..HEAD` = **291**; `git rev-list --count HEAD..origin/main` = **0** ⇒ HEAD contiene todo `origin/main` (en el snapshot local).
- `git merge-base HEAD origin/main` = `6bee83f` = tip de `origin/main` y de `main` local.
- `git diff --shortstat origin/main...HEAD` = 613 archivos, +97 474 / −1 015.
- `git cherry -v origin/main HEAD` = **291 `+` / 0 `−`**.
- `git cherry -v origin/main origin/feat/projects-v2` = **40 `+` / 0 `−`** ⇒ ya hay 40 commits publicados en `feat/projects-v2` que tampoco están en `main`.

**Consecuencia:** empujar `feat/projects-v2` publica **251 commits de golpe**; sumados a los 40 ya publicados, quedan **291 commits sin mergear a `main`**. No hay conflicto con `main` *según el snapshot local* y no hay trabajo equivalente ya en el remoto bajo otro id.

**El snapshot remoto está viejo (riesgo principal)**
- `git log -1 --format="%h %ci %s" origin/main` = `6bee83f` · 2026-09-30 13:39:41 −0500 · `fix(auditoria): allow 'oportunidad' in the entidad filter (#68)`.
- `.git/refs/remotes/origin/main` mtime **30/09/2026 13:39:49**; `.git/FETCH_HEAD` mtime **01/10/2026 13:28:15** ⇒ **12 días de antigüedad**.
- Por tanto «HEAD contiene `origin/main`, `HEAD..origin/main = 0`» sólo vale para ese snapshot. **Antes de decidir el push: `git fetch origin` y repetir `git rev-list --count HEAD..origin/main` y `git merge-base`.** Si aterrizó un PR que toque `prisma/schema.prisma`, `src/lib/openapi/document.ts`/`registry.ts` o `project-ficha*`, el merge-base cambia y el fast-forward deja de serlo.

**El repo ya planificó su entrega (y advierte de su tamaño)** — `83d748c` añade `odd/tasks/v2-projects-delivery-chain.md` (74 líneas):
- Estrategia decidida por el usuario el 2026-10-09: **«Feature Branch Chain»** (PR tracker en borrador sobre rama de integración; hijo #1 apunta al tracker y cada hijo posterior a su padre). «Push, PR creation and merge remain the user's decisions.»
- Estado verificado **el 2026-10-09**: 188 commits sobre el punto de rama `6bee83f`, 470 archivos, +82 825/−291, 19 carpetas de migración nuevas, 70 commits `docs(odd)` (7 262 líneas netas en `odd/tasks/`). Hoy: 291 commits sobre `6bee83f` (≈+55 % en 4 días) y 18 migraciones nuevas dentro del rango.
- Veredicto textual: **«The 400-line budget CANNOT be met: almost every commit is 400 to 2,000 lines, a literal split is about 150 PRs.»** Propone 21 unidades (≈45 PRs) y exige `size:exception` del mantenedor por unidad >400 líneas.
- Fixups a aplastar declarados: `959ca33`, `cf8b837`, `6617a4f`, `986cf3b`, `6f8b6a3`, `4b6c565`, `45e8f9a`, `f853583`, `8046fca`, `a269f2c`, `1250829`, `d897051` (varios dentro del rango).
- Hot-spots de conflicto declarados (conteos al 2026-10-09): `prisma/schema.prisma` (14 commits), `src/lib/openapi/document.ts` (14), `registry.ts` (16), `project-ficha-dialog.tsx` (13 + test de 604 líneas), `docs/guia-prueba-proyectos.md` (7), `scripts/` (14).
- **Estado de revisión:** «Native review is per candidate …, never the whole branch. Reviewed and acknowledged so far: the S11 slice `f370050..18c5adf` … Everything else is unreviewed; the whole-branch candidate fails with `lens_context_budget_exceeded`.» La checklist final deja sin marcar «Maintainer decision on `size:exception`» y «Integration branch + tracker PR».

---

## 7. Banderas rojas (todas con evidencia) y limpieza verificada

**R1 — La rama termina a mitad de unidad.** `odd/tasks/v7-alignment.md:20` dice `- [ ] C4 Relaciones (migration poder/interés, quadrant map)`, pero `71716d9` (14 archivos, +799) ya implementa migración, invariantes, POST/PATCH por cliente y un `GET /api/v1/contacts` global + hooks; el último commit de la rama, `e261296`, sólo retoca la descripción OpenAPI del feed de interacciones. No hay UI ni registro ODD de C4. Pendientes además `P2`, `C1b`, `C2`, `C5`-`C8` en el mismo doc.

**R2 — RECLASIFICADA: inconsistencia del modelo de lectura, no escalada accidental.** `3fe9f5b` (11:22) crea el feed con scoping por rol; `91b8c1f` (11:29, +13/−26) borra el import de `isFullAccess` y deja `{ cliente: { deleted_at: null } }`. Es **alineación deliberada y documentada**: `src/app/api/v1/interactions/route.ts:6-8` declara que la lectura global espeja la del listado de clientes, que ya era global desde el refactor «PR 3 / close-phase-1» (`src/app/api/v1/clients/route.ts:5`, `src/lib/permissions.read.test.ts`). El hallazgo válido: **toda la superficie de lectura de CRM (clientes, contactos, interacciones) es global por diseño y no aplica confidencialidad por `COLABORADOR`, mientras que la lectura de proyectos sí está acotada por membresía** (`7faf6f7`). Inconsistencia a decidir antes del push — ver T3 §4.5 para el mapa exacto y los sub-recursos que sí siguen acotados.

**R3 — Capacidad de lectura global concedida por un booleano.** `671b8e5`: `UNRESOLVED_GERENCIAL_FLAG = false` → `usuario.puede_ver_tablero_gerencial`; `projectListWhere` pasa de `{deleted_at:null, id:{in:[]}}` a `{deleted_at:null}` para un `COLABORADOR` con la bandera. Migración `20261012120000_v2_gerencial_flag`. Mitigado: tests confirman que escritura, ejecución, aprobación, validación de gasto y soportes financieros siguen cerrados; sólo `ADMINISTRADOR` puede asignarla.

**R4 — Condición de carrera preexistente en ~20 rutas de escritura de estructura.** `d1f7bcf` (21 archivos, +288/−30) añade `lockProyectoBorrador` (`SELECT "estado","valor_total"::text FROM "proyectos" WHERE "id"=$1 FOR UPDATE`) en 6 grupos de rutas (actividades, entregables, indicadores, objetivos, PATCH de proyecto) y mueve `RespuestaAbortada` de `src/lib/api/presupuesto.ts` a `src/lib/api/errors.ts` porque `src/lib/api/handler.ts` no la reconocía ⇒ antes de ese commit el lock abortado en rutas no-presupuestarias habría dado **500 en vez de 409**.

**R5 — DDL con lock exclusivo y migraciones acopladas por orden.** `089fad3`: `ALTER TABLE "soportes_proyecto" DROP CONSTRAINT IF EXISTS … / ADD CONSTRAINT … CHECK (num_nonnulls(...) = 1)` sobre tabla existente (`ACCESS EXCLUSIVE` + full scan); la migración añade 7 CHECK a `gastos` y crea `acceso_soportes` con triggers inmutables. `0fc495d`: `ALTER TYPE "TipoNotificacion" ADD VALUE` aislado en `20261010130000_v2_notificacion_sobregasto_enum` porque no puede compartir transacción con su uso, con `20261010130100_v2_notificaciones_proyecto` dependiente (el propio plan marca que `…130000` debe preceder a `…130100`).

**R6 — Nombres de migración con fecha futura al commit.** `20261012120000_v2_gerencial_flag` commiteada en `671b8e5` (2026-10-09, +3 días); `20261011120000_v2_versiones` en `b66dd75` (2026-10-08, +3 días); `20261010120000_v2_gastos_validacion` en `089fad3` (2026-10-08, +2 días). Orden de aplicación monotónico (verificado: `ORDEN MONOTONO: OK`), pero riesgo de colisión de prefijo con otra rama.

**R7 — Se publicaría sin revisión independiente.** `odd/tasks/v2-projects-delivery-chain.md` (83d748c): 1 de 21 unidades revisadas y «the whole-branch candidate fails with `lens_context_budget_exceeded`».

**R8 — Snapshot remoto 12 días viejo.** `.git/refs/remotes/origin/main` mtime 2026-09-30 13:39:49; `.git/FETCH_HEAD` mtime 2026-10-01 13:28:15; `git log -1 origin/main` = `6bee83f` (2026-09-30).

**R9 — 48 commits mezclan ≥5 áreas** (histograma: 1→157, 3→46, 5→32, 7→14, 9→2). Los peores con 9: `01a69e5` (ficha + historial auditado) y `d540ffd` (S2.6 T4). Revertir cualquiera no es selectivo.

**R10 — Cadencia (matizada tras medir huecos intra-día).** 83 commits el 2026-10-08 y 59 el 2026-10-09; commits a `2026-10-09 01:43–02:52` y `2026-10-11 23:08–23:42`; hueco único de **152 838 s (42 h 27 min)** entre `6f32ced` (09 oct 16:05) y `16fdd6b` (11 oct 10:32), coherente con el 2026-10-10 sin commits. **Veredicto: humano, no scripted** — identidad única `agutierrezreginodev <dev.agutierrezregino@gmail.com>` como autor y committer en 251/251; **0** trailers `Generated with`, **0** `Co-Authored-By`, **0** menciones a IA; 73 709 caracteres de cuerpo (≈294/commit). El 2026-10-08 va de 08:11 a 16:38 y de 20:52 a 22:54 (hueco de 4 h 14 min), media de 646 s entre commits y sólo 6 huecos <60 s; el 2026-10-13 (22 commits) va de 08:24 a 11:51 y 13:29 a 13:38 con sólo 2 huecos <60 s (mínimo 10 s entre `ca68b78` y `02a15e8`, dos fixes con contenido propio). El único bloque denso es la madrugada del 2026-10-09 (01:43–02:16, S9: 15 commits, 11 huecos <60 s, mínimo 4 s), consistente con sesión larga asistida pero con diffs y cuerpos distintos por commit.

**R11 — Cinco `reset` sobre la rama (todos no-op).** Reflog: `2026-10-11 16:15:50 reset: moving to HEAD`; `2026-10-09 14:47:13 reset: moving to HEAD`; `2026-10-09 14:47:09 reset: moving to 7948b40…`; `2026-10-08 21:23:14 reset: moving to HEAD`; `2026-10-08 08:10:37 reset: moving to HEAD`. Ningún commit perdido; `ORIG_HEAD` = `789b8ff` (54 commits por detrás de HEAD). Rebase real **anterior al rango**: `2026-09-30 16:45:56 rebase (start): checkout main` → `16:46:04 rebase (finish)`, con respaldo `backup/pre-rebase-feat-projects-v2-20260930` creado 2026-09-30 13:54:55. Los 251 commits del rango **no fueron reescritos** (lineales, 0 merges, cherry 251 `+` / 0 `−`).

**R12 — La rama superó en ~55 % el tamaño que su propio plan ya consideraba inmanejable.** El plan midió 188 commits / 470 archivos el 2026-10-09; hoy el rango hacia `origin/main` es 291 commits / 613 archivos / +97 474.

**Limpieza verificada (no son banderas):**
- **Secretos / `.env`: ninguno.** `git log --name-status … -- "*.env" "*.env.*" ".env*"` vacío. `git ls-files` sólo lista `.env.example` (preexistente, no tocado en el rango) y `prisma/local-env.{ts,test.ts}`, `prisma/require-local-db.ts`. No se abrió ningún `.env`.
- **Artefactos grandes: ninguno >150 KB** entre los añadidos (`git ls-tree -r -l HEAD` cruzado con `git diff --name-only --diff-filter=A`).
- **`TODO`/`FIXME`/`HACK`/`XXX` nuevos: cero marcadores.** El diff de `git grep -E "TODO|FIXME"` HEAD vs base añade 9 coincidencias, todas la palabra española «TODO/TODOS» (`TODOS` como filtro en `src/components/proyectos/project-gastos.tsx:43,46,56,100`; `TODOS_LOS_ESTADOS` en `src/lib/api/gastos.ts:50,415`; «BORRA TODO» en `docs/pasos-siguientes.md:96`; `src/hooks/projects.ts:456`; `src/components/proyectos/ejecucion-avance-form.tsx:48`). El único `TODO(Hito 7)` real (`src/lib/supabase/server.ts:149`) ya estaba en la base. `-S"FIXME"` y `-S"HACK"` vacíos.
- **`console.log` de depuración: cero en `src/`** (`git grep console.log HEAD -- src` vacío). Los 6 commits que introducen `console.log` lo hacen sólo en scripts CLI (`4762eb8`, `021b560`, `5ee8d36`, `18c5adf`, `ed4dd96`, `8cab543`).
- **Tests desactivados: ninguno introducido.** `-S".only("`, `-S"it.skip"`, `-S"describe.skip"`, `-S"test.skip"` vacíos; el único `.skip(` de HEAD está en `e2e/change-password.spec.ts:17`, archivo **no tocado en el rango**.
- **`WIP`/`revert`: cero** (`--grep="revert" --grep="WIP" -i` vacío).
- **Timestamps: sin commits no monotónicos y sin `%at` consecutivos repetidos (0).** Huecos explicados por el fin de semana.
- **Commits vacíos: 0.** **Borrados no reemplazados: 0.**

---

## 8. Lo que está bien (preservar al rebanar)

1. **Conventional Commits 251/251** con cuerpo que explica el *por qué*, referencia al slice (`S2.6 T1`, `v7 C3a`) y, en los fixes, el síntoma observado: es lo que permite reconstruir el arco sin leer diffs.
2. **Gobernanza versionada**: 26 documentos nuevos en `odd/tasks/` (+3 648/−25) y 4 en `docs/` (+928), incluido el plan de entrega con conteos verificados del propio repo y estado de revisión honesto.
3. **Cimientos de seguridad de datos**: guardia anti-producción como PRIMER import en todo script de datos nuevo (`scripts/reset-demo.ts`, `scripts/seed-projects-demo.ts`, `scripts/set-project-estado.ts`, `scripts/import-plantilla-demo.ts`, con test que afirma el literal del primer import); `acceso_soportes` y `versiones_proyecto` append-only por trigger; checks de negocio a nivel BD que Prisma no puede expresar (7 en la migración de `gastos`, 7 en la de `versiones`). `prisma/require-local-db.ts` y `prisma/local-env.ts` **no se modificaron** en el rango.
4. **Migraciones adoptivas e idempotentes**: `IF NOT EXISTS`, bloques `duplicate_object`, `ADD COLUMN IF NOT EXISTS`; sin `DROP TABLE`/`DROP COLUMN` ni backfills destructivos. Ninguna migración del rango pierde datos.
5. **Tests de invariante contra la base viva**: 42 archivos nuevos bajo `prisma/` (p. ej. `prisma/versiones.invariant.test.ts`, `prisma/gastos.invariant.test.ts`, `prisma/relaciones.invariant.test.ts`) y `3a05c6c` demuestra la atomicidad de la importación contra la transacción real.
6. **Sin cambios de autenticación**: la única superficie de auth tocada es el estilo de la página de login (`22c7d29`, `M src/app/(auth)/login/page.tsx`).

---

## 9. Anexo — comandos ejecutados (todos de sólo lectura)

`git rev-list --count [--merges|--no-merges|--grep="^feat"] origin/feat/projects-v2..HEAD` · `git log --format="%h|%ad|%an|%s" --date=format:"%Y-%m-%d %H:%M" --reverse` · bucles `foreach` sobre `git log --format="%s"` (media/máx/>80) y sobre `git log --format="%at|%ct|%h|%s" --reverse` (monotonicidad, huecos intra-día) · `git log --reverse --format="@@%h|%s" --numstat` parseado en PowerShell (archivos, +/−, áreas por commit) · `git shortlog -sn` y `git log --format="%cn" | Group-Object` · `git branch -a --format=…` · `git rev-parse` / `git merge-base` / `git rev-list --count` en ambos sentidos · `git diff --shortstat|--name-status|--numstat … [-- rutas]` · `git cherry -v` en los tres pares de refs · `git log --diff-filter=D --name-only --no-renames` y `--diff-filter=R --name-status -M` · `git show <hash>` y `git show <hash>:<ruta>` sobre ~20 commits de alto riesgo (~8 migraciones SQL completas y ~12 diffs de `src/`) · `git grep -n -I -E "TODO|FIXME|console\.log|\.only\(|\.skip\("` en `HEAD` y en la base · `git log -S…` para TODO/FIXME/HACK/console.log/debugger/.only(/it.skip/describe.skip/test.skip/WIP/revert · `git reflog --date=iso -n 400` y `git reflog show backup/pre-rebase-feat-projects-v2-20260930` · `git log -1 --format="%h %ci %s"` sobre `origin/main`, `origin/feat/projects-v2`, `main`, `ORIG_HEAD` · `git config --get-regexp "^remote\."`, `git stash list`, `git tag --list`, `git ls-files` · `Get-Item` sobre `.git/FETCH_HEAD` y refs remotas/locales.

Limitaciones respetadas: PowerShell en `ConstrainedLanguage` (sin `Select-Object`/`Sort-Object`/`Measure-Object`/`[math]::`), por lo que todos los agregados se calcularon con bucles `foreach` y comparaciones; sandbox de archivos en modo sólo-lectura, por lo que la escritura del informe fue denegada y el contenido se entregó por el buzón al Lead, que lo persistió en esta ruta.
