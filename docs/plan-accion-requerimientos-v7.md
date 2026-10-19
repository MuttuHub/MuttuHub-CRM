# Plan de acción para cerrar los requerimientos del cliente y el prototipo v7

Plan de trabajo en paralelo (varios agentes, un worktree y una rama por carril) para llegar al cierre de (a) los documentos
de requerimientos del cliente y (b) el prototipo v7. Estado de partida: rama `feat/projects-v2`, 2026-10-14.

Este documento **no contradice** `docs/pasos-post-reunion-2026-10-14.md` (la sección C de ese documento es la lista
detallada con evidencia; aquí se reutiliza y se organiza por carriles). Contexto adicional: `odd/tasks/v7-alignment.md`,
`odd/tasks/v7-gap-analysis.md`, `docs/pendientes/pendientes-v7-alignment-2026-10-13.md`, `odd/tasks/v2-projects-sdd.md`.

Tamaños: **S** (horas), **M** (1 a 2 días), **L** (más de 2 días o con decisión externa). Son estimaciones gruesas.

## 1. Resumen: avance actual y meta

Medido hoy por lectura de código (Cumple = 1, Parcial = 0,5, Falta = 0):

```
RF Detalle Clientes                        83 %  ████████████████░░░░
RF Tablero de Seguimiento y Gestión Social 95 %  ███████████████████░
v7 total                                   65 %  █████████████░░░░░░░
  v7 Proyectos                             65 %  █████████████░░░░░░░
  v7 Tablero de tareas                     88 %  ██████████████████░░
  v7 Clientes                              56 %  ███████████░░░░░░░░░
```

**Meta de cierre:**

- Los dos RF del cliente: cada requisito en «Cumple», o con una decisión del PO documentada que lo reemplace.
- v7: todo el alcance acordado en «Cumple». Los opcionales (Convocatorias, propuesta económica) cuentan solo si el PO
  los confirma (decisión PO-13).
- Producción: ruta secuencial del Carril 0 completada (ensayo de migraciones, PRs encadenados, respaldo, `migrate deploy`).

Lo que más mueve cada barra: RF Clientes depende de A1 y D2 más las decisiones PO-6 y PO-7; RF Tablero depende de C5, C7
y C11; v7 Clientes depende de los carriles A (C2) y D (C1b, C6, C7, C8); v7 Proyectos, del carril B.

## 2. Reglas para trabajar en paralelo

Reglas derivadas de las restricciones reales de este repositorio.

### 2.1 Aislamiento por carril

1. **Un worktree y una rama por carril**, bajo un hermano del repositorio en el disco del usuario, nunca en `/tmp`:
   `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/<carril>`.
   ```bash
   cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM
   git worktree add ../MuttuHub-CRM-worktrees/lane-a -b lane/a-comercial feat/projects-v2
   ```
   Ramas: `lane/a-comercial`, `lane/b-ficha-v7`, `lane/c-reglas-tablero`, `lane/d-clientes-v7`. Git no permite tener
   `feat/projects-v2` abierta en dos worktrees: esa rama queda en el árbol principal y es del integrador (el usuario).
2. **`npm install` en cada worktree** (o `npm ci` para respetar el lockfile) y luego `npm run db:generate:local` para el
   cliente de Prisma. `node_modules` no se comparte.
3. **Un índice CodeGraph por worktree**: `gentle-ai codegraph init --cwd <worktree>`. Nunca copiar ni enlazar el
   `.codegraph/` de otro checkout.
4. **Un puerto de servidor de desarrollo por carril**, con `-H 0.0.0.0` como en `docs/guia-demo.md`:

   | Carril | Puerto | Comando |
   |---|---|---|
   | principal (integrador) | 3000 | `npm run dev` |
   | A | 3001 | `npm run dev -- -p 3001 -H 0.0.0.0` |
   | B | 3002 | `npm run dev -- -p 3002 -H 0.0.0.0` |
   | C | 3003 | `npm run dev -- -p 3003 -H 0.0.0.0` |
   | D | 3004 | `npm run dev -- -p 3004 -H 0.0.0.0` |

5. **Una base de datos propia por carril** dentro del mismo Postgres local (`127.0.0.1:54322`). Los tests de invariantes
   (`prisma/*.invariant.test.ts`) escriben filas reales en la base configurada: dos carriles contra la misma base se
   pisan. Bases: `muttu_lane_a`, `muttu_lane_b`, `muttu_lane_c`, `muttu_lane_d`.
   ```bash
   # una vez, desde cualquier carril (el usuario y la clave locales son los de los tests de scripts/)
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c 'CREATE DATABASE muttu_lane_a'
   # en el worktree: .env.local propio (está ignorado por git, hay que crearlo en cada worktree)
   cp ../../MuttuHub-CRM/.env.local .env.local
   sd '127.0.0.1:54322/postgres' '127.0.0.1:54322/muttu_lane_a' .env.local   # DATABASE_URL y DIRECT_URL
   npm run db:migrate:reset:local -- --force      # aplica las migraciones a la base del carril
   npm run db:seed:local
   npm run db:demo:seed-projects:local -- --apply
   npm run db:demo:seed-flujo:local -- --apply
   ```
   - Todo comando que toque datos usa `.env.local` (scripts `db:*:local`, o `node --env-file=.env.local`).
     **Nunca el `.env` de la raíz: es el Supabase remoto de producción.** `prisma.config.ts` carga solo `.env.local` y los
     scripts de seed rechazan destinos no locales; no se debe debilitar esa guarda.
   - El seed usa el Supabase Auth local (`createSupabaseAdmin`, una sola instancia compartida) y busca usuarios por correo
     antes de crearlos (`prisma/seed.ts:127-146`). **Verificar en el primer arranque de cada carril** que el inicio de
     sesión funciona con la base propia; si no, el agente trabaja con tests y `curl` hasta resolverlo.
6. **Los worktrees se crean después de la demo y de restaurar los datos locales** (sección A de
   `docs/pasos-post-reunion-2026-10-14.md`).

### 2.2 Límite de recursos: la suite completa no se corre en paralelo

`vitest.config.ts` documenta que correr **dos suites completas a la vez** en esta máquina (7,6 GiB, `maxWorkers: 4`)
produjo 6 a 7 fallos por contención (`Test timed out`, `pointer-events: none`) en pruebas que pasan aisladas. Reglas:

- Cada agente corre **solo las pruebas de sus archivos** (`TZ=America/Bogota npx vitest run <rutas>`), `npx tsc --noEmit`
  y `npx eslint <archivos>` mientras itera.
- La **suite completa se serializa** con un candado: `flock ~/.muttu-suite.lock env TZ=America/Bogota npx vitest run`.
  Se corre tras cada merge a `feat/projects-v2` y antes de pedir revisión de cada corte.
- No más de 2 o 3 servidores de desarrollo activos a la vez; se levantan solo cuando el agente necesita el navegador.

### 2.3 Propiedad de `prisma/schema.prisma` y las migraciones

**Un solo dueño: Carril A.** Los demás carriles no editan `prisma/schema.prisma` ni `prisma/migrations/`. Si necesitan un
cambio de esquema, lo piden al integrador, que lo reenvía al carril A con: tabla, columnas, nulabilidad, motivo y tarea
que lo bloquea. Para no frenar a nadie, A publica **primero un corte solo de migración** (esquema + migración + prueba
de invariante, sin UI) y lo integra el mismo día; los demás carriles hacen `rebase` sobre ese corte.

- Marcas de tiempo: la última migración es `20261013130000_v2_relaciones`; A numera las nuevas en orden estricto y nunca
  reordena una ya integrada.
- Las migraciones deben ser aditivas (columnas nulables o con valor por defecto): son las que se ensayan en el Carril 0.
- **Congelamiento de migraciones:** antes del ensayo contra la copia de producción (L0-5), A declara el conjunto final;
  cualquier migración posterior repite el ensayo.

### 2.4 Archivos compartidos (puntos calientes) y su dueño

Verificados con rutas existentes. «Dueño» = único carril que edita el archivo; los demás piden el cambio o crean **archivos
nuevos** y el dueño los integra.

| Archivo o grupo | Quién lo necesita | Dueño | Regla |
|---|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/**` | A (propuesta económica, columnas RF-C04), C (P14), D (Mapa) | **A** | Ver 2.3 |
| `src/hooks/projects.ts` (2221 líneas) | B, C, A | **B** | C y A crean hooks nuevos en `src/hooks/projects-reglas.ts` y `src/hooks/opportunities.ts`; B no los reescribe |
| `src/hooks/crm.ts` (1063 líneas) | D, A | **D** | A usa `src/hooks/opportunities.ts` (nuevo) y `src/lib/api/opportunities.ts` (nuevo) |
| `src/lib/api/crm.ts` (DTO de tarea, líneas 379-409) | D, A | **D** | A no lo toca |
| `src/lib/api/projects.ts` | A (DTO de origen, hunk 40-100), C (alcance de lectura, `:369-380`), B (chips) | **C** | Hunks disjuntos; A y B piden cambios fuera de su hunk a C |
| `src/app/api/v1/projects/route.ts` | C (V-03, valor > 0) | **C** | Único editor |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts` | A (RF-C04), C (V-03 `:90`, valor > 0) | **A** | C entrega un validador compartido nuevo (`src/lib/proyectos/validacion-creacion.ts`) y A lo aplica en esta ruta |
| `src/lib/permissions.ts` | C (permiso de P14), A | **C** | A y D piden |
| `src/lib/openapi/paths/*.ts` | cada dominio | el carril del dominio | Un archivo por dominio: `projects.ts` (B/C), `clients.ts` y `tasks.ts` (D), archivo nuevo de oportunidades (A) |
| `src/lib/openapi/registry.ts`, `document.ts`, `document.test.ts` | todos al registrar rutas nuevas | **A** | Los demás piden el registro; es una línea por ruta |
| `src/components/proyectos/project-ficha.tsx` | B (chips, pestañas), C (botones de P14), A (origen) | **B** | C y A entregan componentes nuevos; B los monta con una línea |
| `src/components/proyectos/project-dashboard.tsx` | C (beneficiarios, territorial) | **C** | B no lo toca |
| `src/lib/proyectos/semaforo-v2.ts`, `src/components/admin/umbrales-section.tsx` | C (parámetros), B (lectura) | **C** | B solo lee |
| `src/components/proyectos/*-guards.test.ts` (design, a11y, responsive, surface, control, table) y `src/test/**` | todos deben pasarlas | **D** (solo para extenderlas a `src/components/crm`, decisión pendiente 2 del 2026-10-13) | Nadie más las edita ni las relaja |
| `src/components/crm/clientes-section-placeholder.tsx` | A (Oportunidades), D (Mapa) | **D** | A deja de usarlo al reemplazar su página; D lo elimina al final |
| `src/components/crm/client-sheet.tsx`, `client-list.tsx` | D (C1b, fecha), A (solo lectura) | **D** | A no los toca |
| `src/components/crm/entity-dialogs.tsx` (convertir en proyecto) | A | **A** | D no lo toca |
| `src/components/proyectos/presupuesto-ui.tsx` y pasos de `nuevo-proyecto/` | B (formato de miles) | **B** | El formato se hace una vez y lo usan la pestaña y el paso 4 |

### 2.5 Cadencia de integración y calidad

- Cada carril hace `rebase` sobre `feat/projects-v2` **al menos una vez al día** y entrega cortes pequeños.
- El integrador (el usuario) fusiona cada corte en `feat/projects-v2` y corre la suite completa (con el candado) tras cada
  merge. Si falla, el carril responsable lo corrige antes de que se integre otro corte.
- Cortes de **unas 400 líneas modificadas** como máximo (heurística, no tope duro); pruebas y documentación van con el
  comportamiento. Revisión humana de cada corte.
- Commits convencionales (`feat:`, `fix:`, `docs:`, `test:`), **sin `Co-Authored-By` ni atribución de IA**.
- Ningún agente hace push, abre PR ni fusiona: son decisiones del usuario.
- Los tests nuevos siguen la política del proyecto: primero la prueba que falla cuando hay una prueba determinista
  ejecutable y un resultado esperado claro.
- Todo texto de interfaz y de código en inglés o en el idioma que ya use el archivo que se extiende.

## 3. Carriles

Reparto por **disjunción de archivos**, no por tamaño: cada carril tiene su propio conjunto de componentes, rutas y
pruebas; el esquema vive solo en A. Resultado de la verificación de archivos: los únicos cruces reales están en la
tabla 2.4.

| Carril | Tema | Tareas | Dueño de archivos compartidos |
|---|---|---|---|
| 0 | Ruta a producción (secuencial, no paralela) | 8 | Rama `feat/projects-v2`, Vercel, Supabase |
| A | Oportunidades y comercial | 9 | `prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/openapi/registry.ts`, `document.ts`, ruta `.../project/route.ts`, `entity-dialogs.tsx` |
| B | Ficha de proyecto v7 | 10 | `src/hooks/projects.ts`, `project-ficha.tsx`, `presupuesto-ui.tsx` |
| C | Reglas y tablero gerencial | 12 | `src/lib/api/projects.ts`, `src/lib/permissions.ts`, `project-dashboard.tsx`, `semaforo-v2.ts`, `src/app/api/v1/projects/route.ts` |
| D | Clientes v7 y tarjeta del tablero | 9 | `src/hooks/crm.ts`, `src/lib/api/crm.ts`, `client-sheet.tsx`, `client-list.tsx`, guardas de diseño |

### 3.0 Carril 0: ruta a producción (secuencial)

Un solo responsable (el usuario, con un agente de apoyo). No se paraleliza porque cada paso depende del anterior y
requiere credenciales o decisiones del usuario. Fuente: sección B de `docs/pasos-post-reunion-2026-10-14.md`.

| ID | Tarea | Fuente | Archivos o sistema | Migración | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|---|---|---|
| L0-1 | Destrabar el push: instalar la CA raíz de Fortinet en WSL o empujar desde Git de Windows | pasos-post-reunion A.2 | `/usr/local/share/ca-certificates/`, remoto GitHub | no | decisión del usuario de publicar (PO-17) | S | `git push` de `feat/projects-v2` es fast-forward y termina sin error de TLS |
| L0-2 | Suite completa + `tsc` + `next build` sobre el árbol integrado | pasos-post-reunion A.3 | árbol principal | no | ninguna | S | `TZ=America/Bogota npx vitest run`, `npx tsc --noEmit` y `npm run build` en verde; resultado registrado en `odd/tasks/demo-proyectos-2026-10-14.md` |
| L0-3 | Crear el ambiente de pruebas (base + variables Preview) | B.1 y B.2 | Vercel (12 variables solo `Production`), Supabase | no | PO-17 (proveedor) y credenciales | L | Un Preview recibe `DATABASE_URL` y abre sin tocar producción |
| L0-4 | Estrategia de PRs encadenados | B.5 | rama `feat/projects-v2` (333 commits por delante de `main`) | no | PO-17 | M | Plan de cortes de unas 400 líneas acordado, con la base y el orden de cada PR (skill `chained-pr`) |
| L0-5 | Aplicar las migraciones (hoy 18, más las que añada A) en el ambiente de pruebas y ensayar contra una copia de datos de producción | B.3 y B.4 | `prisma/migrations/**` | las existentes y nuevas | L0-3, congelamiento de A, copia de producción | L | `prisma migrate deploy` termina sin error sobre la copia y los invariantes de datos adoptados pasan |
| L0-6 | Revisión y merge de los PRs encadenados | B.5 | GitHub | no | L0-4, L0-2 | L | Todos los PRs aprobados por revisión humana |
| L0-7 | Respaldo de producción | B.6 | Supabase | no | credenciales, ventana acordada | S | Respaldo verificado y restaurable |
| L0-8 | `prisma migrate deploy` en producción, merge a `main`, despliegue | B.7 y B.8 | producción | las del conjunto congelado | L0-5, L0-6, L0-7 y decisión explícita del usuario | M | Producción aplicada, humo posterior en verde |

### 3.A Carril A: Oportunidades y comercial (dueño de migraciones)

**Por qué un carril:** todo lo que cruza Oportunidad, Proyecto y esquema se concentra aquí; evita que tres carriles toquen
el esquema y la ruta de conversión.

| ID | Tarea | Fuente | Archivos que toca | Migración | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|---|---|---|
| A1 | **RF-C04:** al convertir, el proyecto hereda `problema_detectado`, `solucion_propuesta`, `servicios_interes` y `fecha_envio_propuesta` (hoy solo `cliente_id`, `nombre` y `valor_total`) | RF Detalle Clientes RF-C04; ruta `:158-193` | `prisma/schema.prisma` (columnas nulables en `Proyecto`), `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts`, `src/lib/api/projects.ts` (solo el serializador), `src/lib/openapi/paths/projects.ts` | **Sí** (4 columnas nulables en `Proyecto`; hoy solo existen en `Oportunidad`, `prisma/schema.prisma:222`) | PO-9 (copiar o leer por relación) | M | Un proyecto creado desde una oportunidad guarda los 4 campos; prueba de invariante y prueba de ruta; el OpenAPI los publica. Si PO-9 elige leer por relación, no hay migración y solo se expone el DTO |
| A2 | Mostrar la oportunidad de origen en la ficha del proyecto (componente nuevo `src/components/proyectos/origen-oportunidad.tsx`) | RF-C04 | archivo nuevo; B lo monta en `project-ficha.tsx` | no | A1 | S | La ficha muestra enlace, nombre y valor de la oportunidad de origen y los 4 campos heredados |
| A3 | Unificar los pasos coexistentes `convert` y `project` (decidir cuál sobrevive y retirar o delegar el otro) | RF-C04; `.../opportunities/[opportunityId]/convert/route.ts` y `.../project/route.ts` | ambas rutas, `src/components/crm/entity-dialogs.tsx`, `src/hooks/opportunities.ts` (nuevo) | no | PO-9; A1 | M | Un solo camino de conversión documentado; la ruta retirada responde de forma compatible y sus pruebas se actualizan |
| A4 | **C2a:** API global `GET /api/v1/opportunities` con totales y KPI | v7 C2; gap-analysis A (Oportunidades) | `src/app/api/v1/opportunities/route.ts` (nuevo, hoy no existe), `src/lib/api/opportunities.ts` (nuevo), `src/lib/openapi/paths/` (archivo nuevo), `registry.ts` | no | ninguna | M | Lista entre clientes con filtros, suma por etapa y conteo de tareas; respeta el alcance por rol (`canManageOpportunity`, `hasCommercialAccess`) |
| A5 | **C2b:** kanban de 7 etapas con el mapeo decidido: EN_REVISION «Revisión TDR», DISENANDO_PROPUESTA «En formulación», PRESENTADA «Enviada · seguimiento», EN_NEGOCIACION «En negociación», GANADA «Aceptada», PERDIDA «Rechazada», STANDBY «En espera» | v7 C2 | `src/app/(app)/clientes/oportunidades/page.tsx` (reemplaza el marcador), `src/components/crm/oportunidades-kanban.tsx` (nuevo), `src/hooks/opportunities.ts` | **no** (mapeo de etiquetas) | A4 | L | Las 7 columnas con total en COP; mover de etapa respeta permisos; no cambia el enum de la base |
| A6 | **C2c:** ficha de oportunidad (selector de estado, convertir, ciclo de vida, pestaña de tareas) | v7 C2 | `src/app/(app)/clientes/oportunidades/[id]/page.tsx` (nuevo), componentes nuevos en `src/components/crm/` | no | A4, A3 | M | Ficha navegable desde el kanban; «Convertir en proyecto» solo habilitado en «Aceptada» |
| A7 | **Propuesta económica (modelo):** líneas, imprevistos, overhead y rubros de la propuesta | v7 gap A; pasos-post-reunion C.3 | `prisma/schema.prisma`, `prisma/migrations/**`, `prisma/*.invariant.test.ts` (nuevo) | **Sí** | PO-13 | L | Modelo y migración con prueba de invariante; sin UI todavía |
| A8 | **Propuesta económica (UI) y herencia al convertir:** pestaña en la ficha y copia de las líneas presupuestales al proyecto | v7 gap A; C.3 | `src/components/crm/` (nuevos), ruta `.../project/route.ts` | no (usa A7) | A7, A1, A6 | L | Al convertir, las líneas de la propuesta aparecen como líneas presupuestales del proyecto |
| A9 | **Convocatorias (opcional):** modelo, CRUD, página y acción «Crear oportunidad» | v7 (8.ª pestaña) | `prisma/schema.prisma`, rutas y página nuevas | **Sí** | PO-13 | M | Solo si el PO lo confirma |

#### Brief para el agente del Carril A

```markdown
## Rol
Eres el agente del Carril A (Oportunidades y comercial) de MuttuHub-CRM. Trabajas solo en tu worktree
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/lane-a`, rama `lane/a-comercial`, base `feat/projects-v2`.
Base de datos propia: `muttu_lane_a` (tu `.env.local`). Puerto de desarrollo: 3001.

## Tareas
A1 a A9 de docs/plan-accion-requerimientos-v7.md, en ese orden, solo las que no estén bloqueadas por una decisión.
Primero publica el corte de solo migración (esquema + migración + invariante) y avisa al integrador.

## Skills to load before work
(ruta exacta de cada SKILL.md aplicable según .atl/skill-registry.md: work-unit-commits, chained-pr)

## Allowed edit surfaces
prisma/schema.prisma
prisma/migrations/**
prisma/*.invariant.test.ts
src/app/api/v1/opportunities/**
src/app/api/v1/clients/[id]/opportunities/**
src/app/(app)/clientes/oportunidades/**
src/components/crm/oportunidades-*.tsx
src/components/crm/entity-dialogs.tsx
src/components/crm/entity-dialogs.test.tsx
src/components/proyectos/origen-oportunidad.tsx
src/hooks/opportunities.ts
src/lib/api/opportunities.ts
src/lib/api/projects.ts
src/lib/openapi/**

## Fuera de tu superficie (pídelo al integrador)
src/hooks/crm.ts, src/lib/api/crm.ts, src/hooks/projects.ts, src/components/proyectos/project-ficha.tsx,
src/lib/permissions.ts, src/components/crm/client-sheet.tsx, client-list.tsx, guardas. En `src/lib/api/projects.ts` solo
el serializador (líneas ~40-100); el alcance de lectura (~360-400) es del Carril C.

## Verification
TZ=America/Bogota npx vitest run <tus archivos de prueba>
npx tsc --noEmit
npx eslint <archivos modificados>
Suite completa solo con candado y solo si el integrador lo pide: flock ~/.muttu-suite.lock env TZ=America/Bogota npx vitest run

## Safety
- Nunca `.env`; todo comando de datos con `.env.local` (scripts `db:*:local`). No debilites las guardas anti-producción.
- Migraciones solo aditivas (columnas nulables o con valor por defecto); nunca edites una migración ya integrada.
- Commits convencionales, sin Co-Authored-By ni atribución. No hagas push, PR ni merge.
- Cortes de unas 400 líneas (heurística). Pruebas y docs junto al comportamiento. Primero la prueba que falla.
- Si necesitas algo de otro carril, no lo edites: descríbelo en tu informe final (archivo, cambio, motivo).

## Key Learnings
Cierra tu respuesta final con un bloque `## Key Learnings` de 1 a 5 ítems.
```

### 3.B Carril B: Ficha de proyecto v7

**Por qué un carril:** todo vive en `src/components/proyectos/` y en los hooks de proyecto; sin migraciones (el modelo
`SoporteProyecto` ya admite `url_externa`, `prisma/schema.prisma:949-957`).

| ID | Tarea | Fuente | Archivos que toca | Migración | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|---|---|---|
| B1 | **Presupuesto:** formato de miles en los campos de dinero y meses legibles (compartido con el paso 4 del stepper) | v7 Proyectos; gap C | `src/components/proyectos/presupuesto-ui.tsx`, `project-presupuesto.tsx`, `presupuesto-programacion.tsx`, `nuevo-proyecto/paso-revision.tsx` | no | ninguna | S | Los campos muestran `1.234.567`; el valor enviado sigue siendo numérico; el paso 4 usa el mismo componente |
| B2 | **Encabezado de la ficha:** chips de línea estratégica y territorio | v7 Proyectos | `src/components/proyectos/project-ficha.tsx`, `src/hooks/projects.ts` | no | ninguna (si el DTO no trae los campos, se piden a C) | S | Chips visibles junto al estado y los semáforos |
| B3 | **Cronograma:** 4 KPI, leyenda de umbrales (editables en Administración), columnas «Días», «Al corte» y chip de soporte | v7 Proyectos; pasos-post-reunion C.2 | `src/components/proyectos/project-cronograma.tsx` (+ prueba) | no | ninguna | M | Los 4 KPI y la leyenda reflejan `semaforo-v2`; la tabla muestra las columnas nuevas |
| B4 | **Gantt:** relleno del avance real sobre la barra planeada y línea de «Corte» | v7 Proyectos | `src/components/proyectos/estructura-gantt.tsx` | no | ninguna | M | El relleno real es proporcional al avance; la línea de corte marca la fecha de corte |
| B5 | **Beneficiarios:** KPI y desglose «Por grupo poblacional» | v7 Proyectos | `src/components/proyectos/ejecucion-beneficiarios.tsx` | no | ninguna | S | KPI y barras por grupo coinciden con el registro |
| B6 | **Soportes:** formulario de vínculo (vincular a, URL de Drive) | v7 Proyectos; `project-soportes.tsx`, `GET /projects/:id/supports` | `src/components/proyectos/project-soportes.tsx`, `src/app/api/v1/projects/[id]/supports/**` (POST), `src/hooks/projects.ts`, `src/lib/openapi/paths/projects.ts` | no (usa `SoporteProyecto.url_externa`) | PO-12 | M | Se crea un vínculo válido (URL externa, exactamente una fuente), se audita y aparece en la lista |
| B7 | **Financiero:** alertas del semáforo financiero y nota de «rubros sin asignación» | v7 Proyectos | `src/components/proyectos/project-financiero.tsx` | no | ninguna | S | La nota cuenta los rubros sin asignación; las alertas salen del semáforo financiero |
| B8 | **Legalización:** «Importar Excel» de gastos | v7 Proyectos | `src/components/proyectos/project-gastos.tsx`, ruta nueva bajo `src/app/api/v1/projects/[id]/expenses/`, lógica nueva en `src/lib/api/` | no | PO-11 (plantilla y validaciones) | M | Importa filas válidas, rechaza las inválidas con motivo, audita y respeta el rol |
| B9 | Montar los componentes que entregan A y C en la ficha (origen de oportunidad, botones de cerrar/suspender/cancelar) | RF-C04; P14 | `src/components/proyectos/project-ficha.tsx` | no | A2, C8 | S | Una línea por componente; prueba de la ficha actualizada |
| B10 | **«Nueva planeación» editable** en la ficha de seguimiento | v7; pasos-post-reunion C.2 | `src/components/proyectos/curve-s-chart.tsx` y la pestaña de avance, endpoint de programación | posible | PO-10 (choca con el bloqueo S8) | L | Según la decisión; si se rechaza, queda documentado y la tabla de solo lectura se mantiene |

#### Brief para el agente del Carril B

```markdown
## Rol
Eres el agente del Carril B (Ficha de proyecto v7). Worktree
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/lane-b`, rama `lane/b-ficha-v7`, base `feat/projects-v2`.
Base de datos `muttu_lane_b`, puerto 3002.

## Tareas
B1 a B9 de docs/plan-accion-requerimientos-v7.md (B10 solo si el PO decide). Sin migraciones.

## Skills to load before work
(rutas exactas desde .atl/skill-registry.md: work-unit-commits, ui/design aplicables)

## Allowed edit surfaces
src/components/proyectos/project-ficha.tsx
src/components/proyectos/project-cronograma.tsx
src/components/proyectos/estructura-gantt.tsx
src/components/proyectos/ejecucion-beneficiarios.tsx
src/components/proyectos/project-soportes.tsx
src/components/proyectos/project-financiero.tsx
src/components/proyectos/project-gastos.tsx
src/components/proyectos/project-presupuesto.tsx
src/components/proyectos/presupuesto-ui.tsx
src/components/proyectos/presupuesto-programacion.tsx
src/components/proyectos/nuevo-proyecto/paso-revision.tsx
src/components/proyectos/*.test.tsx
src/hooks/projects.ts
src/app/api/v1/projects/[id]/supports/**
src/app/api/v1/projects/[id]/expenses/**
src/lib/openapi/paths/projects.ts

## Fuera de tu superficie
prisma/**, src/lib/api/projects.ts, src/lib/permissions.ts, project-dashboard.tsx, semaforo-v2.ts, guardas
(`src/components/proyectos/*-guards.test.ts`, `src/test/**`). Tu UI nueva debe pasar las 6 guardas sin relajarlas.

## Verification
TZ=America/Bogota npx vitest run src/components/proyectos src/hooks/projects
npx tsc --noEmit
npx eslint <archivos modificados>
Suite completa solo con candado: flock ~/.muttu-suite.lock env TZ=America/Bogota npx vitest run

## Safety
Las mismas reglas de seguridad del brief del Carril A (sin `.env`, comandos de datos con `.env.local`, sin push, sin
Co-Authored-By, cortes de unas 400 líneas, pedir al integrador lo que esté fuera de tu superficie).

## Key Learnings
Cierra tu respuesta final con un bloque `## Key Learnings` de 1 a 5 ítems.
```

### 3.C Carril C: Reglas de negocio y tablero gerencial

**Por qué un carril:** reglas del RF v2.0 y del RF Tablero que viven en rutas, permisos y el tablero; cada una es corta y
requiere una decisión del PO previa, así que conviene tratarlas como un lote.

| ID | Tarea | Fuente | Archivos que toca | Migración | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|---|---|---|
| C1 | **V-03:** rechazar también `fin = inicio` (inicio estrictamente anterior a fin) y exponer un validador compartido | V-03, supuesto A-18 | `src/app/api/v1/projects/route.ts:230`, `src/lib/proyectos/validacion-creacion.ts` (nuevo). A aplica el validador en la ruta de oportunidad (`:90`) | no | PO-4 | S | `fin = inicio` responde 400 con mensaje claro; prueba de ruta |
| C2 | **REQ-ORG-04:** `valor_total > 0` desde la creación (hoy solo se bloquea al aprobar la línea base) | REQ-ORG-04; SDD `:2794` | `src/app/api/v1/projects/route.ts`, el mismo validador | no | PO-5 | S | Crear con 0 u omitido responde 400; la línea base sigue validando en S8.1 |
| C3 | **RNF-C02:** lectura del ejecutor limitada a proyectos activos; decidir el caso COLABORADOR | RNF-C02, supuesto A-12 | `src/lib/api/projects.ts:369-380`, `src/lib/permissions.ts`, `prisma/proyecto-miembros-scope.invariant.test.ts` | no | PO-6 | S | Un ejecutor no ve proyectos cerrados o suspendidos donde fue miembro; el caso COLABORADOR sigue la decisión |
| C4 | **REQ-NFR-04:** atomicidad del registro de acceso a soportes (hoy se inserta después de firmar la URL; falla cerrada con 500) y verificar la cobertura de otros tipos de soporte | REQ-NFR-04 / RNF-04 | `src/app/api/v1/projects/[id]/expenses/[expenseId]/attachments/[attachmentId]/download/route.ts:63`, rutas de otros soportes, `prisma/*.invariant.test.ts` | no | PO-14b (basta falla cerrada o se exige transacción) | S | Cada entrega de URL de soporte deja un registro de acceso o no se entrega; cobertura de todos los tipos verificada y documentada |
| C5 | **Tarjeta «Beneficiarios atendidos / meta»** en el tablero gerencial (datos en `agregado.beneficiarios`) | RF Tablero | `src/components/proyectos/project-dashboard.tsx`, prueba | no | ninguna | S | La tarjeta muestra atendidos, meta y porcentaje con el agregado existente |
| C6 | **REQ-DSH-04:** semaforización territorial: quitar o mantener (los documentos chocan: Tablero docx 2026-09-04 la apoya para Visualizador; RF v2.0 2026-09-28 pide eliminarla) | REQ-DSH-04 (SDD `:733`) | `src/components/proyectos/project-dashboard.tsx:551`, consulta `por_territorio` | no | PO-1 | S (si se quita) | La decisión queda aplicada y registrada; el municipio queda como filtro |
| C7 | **Semáforo:** parámetros hoy todos `confirmado:false` | RF Tablero | `src/lib/proyectos/semaforo-v2.ts:34-39`, `src/components/admin/umbrales-section.tsx` | no | PO-8 (valores) y acción de un administrador | S | Los parámetros que el PO confirma quedan en `confirmado:true` (por la pantalla de Administración o por defecto) |
| C8 | **P14 / REQ-ORG-08:** cerrar, suspender y cancelar proyecto (endpoint, reglas, permiso, botones) | P14 | `src/app/api/v1/projects/[id]/estado/route.ts` (nuevo), `src/lib/permissions.ts`, `src/hooks/projects-reglas.ts` (nuevo), `src/components/proyectos/proyecto-estado-acciones.tsx` (nuevo). Existe `scripts/set-project-estado.ts` como script operativo | posible (motivo/fecha de cierre): se pide a A | PO-3 | M | Transiciones válidas por rol y estado, auditadas, con motivo; botones montados por B (B9) |
| C9 | **Exportar a PDF:** ficha del proyecto y ficha financiera, por rol y auditado | REQ-DSH-03 (RF-32), D-08 | `src/app/api/v1/projects/[id]/export/route.ts:6` (hoy `formato=pdf` responde 400), `src/lib/api/export-http.ts`, `src/lib/api/financial-sheet.ts` | no | PO-2 (motor, N-23; riesgo R-15 con serverless) | L | `formato=pdf` entrega el PDF según rol y deja registro de auditoría |
| C10 | **S1.1b:** verificar la reasignación de rubros suspendidos | S1.1b (N-13) | `scripts/migrate-v2/s1-rubros-report.ts` (solo lectura) | no | acción manual sobre datos reales | S | Informe ejecutado y resultado registrado |
| C11 | **RNF-02:** rendimiento con volumen real | RF Tablero | `scripts/migrate-v2/bench-dashboard.ts` | no | L0-3 (staging) | M | Medición con volumen real registrada contra el criterio del RNF |
| C12 | **RNF-C01:** confirmar con el PO qué es el «panel general» (N-19) | RF Detalle Clientes | solo documento | no | PO-7 | S | Respuesta del PO registrada en el SDD |

#### Brief para el agente del Carril C

```markdown
## Rol
Eres el agente del Carril C (Reglas y tablero gerencial). Worktree
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/lane-c`, rama `lane/c-reglas-tablero`, base `feat/projects-v2`.
Base de datos `muttu_lane_c`, puerto 3003.

## Tareas
C1 a C12 de docs/plan-accion-requerimientos-v7.md; cada tarea espera su decisión del PO (PO-n). No inventes la decisión:
si falta, informa y pasa a la siguiente.

## Skills to load before work
(rutas exactas desde .atl/skill-registry.md)

## Allowed edit surfaces
src/app/api/v1/projects/route.ts
src/app/api/v1/projects/route.test.ts
src/app/api/v1/projects/[id]/estado/**
src/app/api/v1/projects/[id]/export/**
src/app/api/v1/projects/[id]/expenses/**/attachments/**
src/lib/api/projects.ts
src/lib/api/financial-sheet.ts
src/lib/api/export-http.ts
src/lib/permissions.ts
src/lib/permissions.test.ts
src/lib/proyectos/semaforo-v2.ts
src/lib/proyectos/validacion-creacion.ts
src/lib/proyectos/validacion-creacion.test.ts
src/hooks/projects-reglas.ts
src/components/proyectos/project-dashboard.tsx
src/components/proyectos/proyecto-estado-acciones.tsx
src/components/admin/umbrales-section.tsx
prisma/proyecto-miembros-scope.invariant.test.ts
src/lib/openapi/paths/projects.ts

## Fuera de tu superficie
prisma/schema.prisma y migraciones (pídelas al integrador para el Carril A), src/hooks/projects.ts, project-ficha.tsx
(B monta tu componente con una línea), la ruta `.../opportunities/[opportunityId]/project/route.ts` (A aplica tu validador).

## Verification
TZ=America/Bogota npx vitest run <tus archivos> prisma/proyecto-miembros-scope.invariant.test.ts
npx tsc --noEmit
npx eslint <archivos modificados>
Suite completa solo con candado: flock ~/.muttu-suite.lock env TZ=America/Bogota npx vitest run

## Safety
Las mismas reglas de seguridad del brief del Carril A. Nada de PDF con dependencias que no funcionen en serverless sin
aprobación (riesgo R-15).

## Key Learnings
Cierra tu respuesta final con un bloque `## Key Learnings` de 1 a 5 ítems.
```

### 3.D Carril D: Clientes v7 y tarjeta del tablero

**Por qué un carril:** concentra `src/components/crm`, `src/hooks/crm.ts`, el DTO de tarea del tablero y el cron; las
decisiones de producto de esta sección son independientes de las de Proyectos.

| ID | Tarea | Fuente | Archivos que toca | Migración | Depende de | Tamaño | Aceptación |
|---|---|---|---|---|---|---|---|
| D1 | **C1b Aliados maestro/detalle:** lista + ficha con conteo de oportunidades y proyectos y puntaje de salud por fila | v7 gap A; pendientes C1b | `src/components/crm/client-list.tsx`, `client-sheet.tsx`, `src/app/(app)/clientes/page.tsx`, `src/lib/api/crm.ts`, `src/hooks/crm.ts`, `src/lib/clientes/salud.ts` | no | ninguna | M | Layout maestro/detalle con los 3 contadores por fila; las vistas existentes siguen funcionando |
| D2 | **Fecha de primer contacto** con formato legible (hoy se muestra cruda, ISO) | RF Detalle Clientes | hoja del cliente: localizar la vista de solo lectura (el input está en `src/components/crm/client-form.tsx:418`; `formatFechaDia` en `src/hooks/crm.ts:1019`) | no | ninguna | S | La fecha se ve como día legible en UTC, como en `print-ficha.tsx:177` |
| D3 | **Tablero:** el DTO de la tarea incluye id y código del proyecto para enlazar al proyecto exacto | v7 Tablero | `src/lib/api/crm.ts:379-409`, `src/hooks/crm.ts:202`, `src/lib/openapi/paths/tasks.ts`, `src/components/kanban/task-card.tsx`, `board-logic.ts` | no | ninguna | S | La tarjeta convertida enlaza a `/proyectos/<id>` y muestra el código |
| D4 | **«Pasar a nuevo proyecto →»:** que la condición de datos se pueda demostrar (tarea comercial completada de una oportunidad ganada sin proyecto) | v7 Tablero; `board-logic.ts:112` | `scripts/seed-demo-flujo.ts` y su prueba | no | ninguna | S | El seed de demostración deja al menos una tarjeta en esa condición; no es un defecto de código |
| D5 | **C5b Salud:** verificación visual (claro y oscuro, 1440 y 390 px) | pendientes 2026-10-13 | `src/components/crm/salud-vista.tsx` (solo si se halla un defecto) | no | un navegador disponible | S | Capturas adjuntas al registro; defectos corregidos |
| D6 | **C6 Mapa:** cobertura por departamento | v7; pendientes | `src/app/(app)/clientes/mapa/**`, `src/components/crm/` (nuevo), `src/lib/api/` | **posible** (relación cliente-departamento): se pide a A | PO-14 | M | Según la decisión: agregado por el texto libre de `Cliente.ubicacion` o por relación |
| D7 | **C7 reglas adicionales:** recordar compromisos 2 días antes, alertar 30 días sin contacto, plantillas de correo y envío | v7 Automatizaciones | `src/app/api/cron/daily/**`, `src/lib/settings.ts`, `src/components/crm/automatizaciones-vista.tsx`, `src/lib/email.ts` | posible (plantillas) | PO-16 (proveedor y plantillas) | L | Reglas con umbral configurable en `Setting` (clave `automatizaciones`); plantillas y envío solo con proveedor decidido |
| D8 | **C8 Guías por sección** | pendientes C8 | según PO-15: panel in-app o `docs/` | no | PO-15 | M | Una guía por sección en la forma decidida |
| D9 | Extender las guardas `design` y `a11y` a `src/components/crm` | pendientes 2026-10-13, decisión 2 | `src/components/proyectos/design-guards.test.ts`, `a11y-guards.test.tsx` | no | ok del usuario (amplía alcance) | S | Las guardas escanean también `src/components/crm`; lo existente pasa o se corrige |

#### Brief para el agente del Carril D

```markdown
## Rol
Eres el agente del Carril D (Clientes v7 y tarjeta del tablero). Worktree
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/lane-d`, rama `lane/d-clientes-v7`, base `feat/projects-v2`.
Base de datos `muttu_lane_d`, puerto 3004.

## Tareas
D1 a D9 de docs/plan-accion-requerimientos-v7.md. D6, D7, D8 y D9 esperan decisión (PO-14, PO-16, PO-15, ok del usuario).

## Skills to load before work
(rutas exactas desde .atl/skill-registry.md)

## Allowed edit surfaces
src/components/crm/**
src/app/(app)/clientes/page.tsx
src/app/(app)/clientes/mapa/**
src/app/(app)/clientes/layout.tsx
src/hooks/crm.ts
src/lib/api/crm.ts
src/lib/clientes/**
src/lib/settings.ts
src/lib/email.ts
src/app/api/cron/daily/**
src/components/kanban/task-card.tsx
src/components/kanban/board-logic.ts
src/components/kanban/*.test.tsx
src/components/kanban/board-logic.test.ts
src/lib/openapi/paths/clients.ts
src/lib/openapi/paths/tasks.ts
scripts/seed-demo-flujo.ts
scripts/seed-demo-flujo.test.ts
src/components/proyectos/design-guards.test.ts
src/components/proyectos/a11y-guards.test.tsx

## Fuera de tu superficie
prisma/** (pídelo a A), `src/app/(app)/clientes/oportunidades/**` y `entity-dialogs.tsx` (Carril A), hooks y componentes de proyecto.

## Verification
TZ=America/Bogota npx vitest run src/components/crm src/components/kanban src/hooks/crm
npx tsc --noEmit
npx eslint <archivos modificados>
Suite completa solo con candado: flock ~/.muttu-suite.lock env TZ=America/Bogota npx vitest run

## Safety
Las mismas reglas de seguridad del brief del Carril A. Los scripts de datos reutilizan la guarda anti-producción de
`prisma/seed.ts` y cargan `.env.local`.

## Key Learnings
Cierra tu respuesta final con un bloque `## Key Learnings` de 1 a 5 ítems.
```

### 3.E Cruces detectados entre carriles (resumen)

1. `.../opportunities/[opportunityId]/project/route.ts`: A (herencia RF-C04) y C (V-03, valor > 0). Resuelto con un validador
   compartido que escribe C y aplica A, y con A como único editor de la ruta.
2. `src/lib/api/projects.ts`: A (serializador `:40-100`), C (alcance `:369-380`), B (chips). Dueño C; hunks disjuntos.
3. `project-ficha.tsx`: B (chips y pestañas), A (origen), C (botones de P14). Dueño B; los demás entregan componentes.
4. `src/hooks/projects.ts` y `src/hooks/crm.ts`: archivos grandes. Los carriles ajenos crean hooks en archivos nuevos.
5. Esquema: A, C (P14), D (Mapa) lo necesitan. Un solo dueño (A) y un corte previo solo de migración.
6. `src/lib/openapi/registry.ts` y `document.ts`: toda ruta nueva requiere registro. Dueño A.
7. Guardas de diseño y a11y: todos las pasan; solo D las edita.
8. `clientes-section-placeholder.tsx`: lo reemplaza A (Oportunidades) y lo usa D (Mapa). Dueño D, que lo elimina al final.

## 4. Decisiones del PO y del usuario que bloquean

Programarlas **primero**: sin ellas, las tareas listadas no pueden cerrarse. Origen: sección D de
`docs/pasos-post-reunion-2026-10-14.md` más los puntos detectados al planificar.

| ID | Decisión | Quién | Bloquea |
|---|---|---|---|
| PO-1 | Semaforización territorial: ¿se quita (RF v2.0) o se mantiene (Tablero docx 2026-09-04 y prototipo)? REQ-DSH-04 | PO | C6 |
| PO-2 | Motor de PDF y plazo (D-08, N-23; riesgo R-15) | PO | C9 |
| PO-3 | Reglas de cerrar, suspender y cancelar (qué pasa con gastos y avances abiertos) | PO | C8, B9 |
| PO-4 | ¿Se admiten proyectos de un día (inicio = fin)? V-03 / A-18 | PO | C1 |
| PO-5 | ¿`valor_total > 0` desde la creación o basta al aprobar la línea base? REQ-ORG-04 | PO | C2 |
| PO-6 | Alcance de lectura del ejecutor solo en proyectos activos y trato del rol COLABORADOR (A-12) | PO | C3 |
| PO-7 | Qué es el «panel general» (RNF-C01, N-19) | PO | C12 |
| PO-8 | Valores de los parámetros del semáforo (hoy todos `confirmado:false`) y quién los confirma en Administración | PO | C7 |
| PO-9 | Herencia de RF-C04: copiar los 4 campos al proyecto (migración) o leerlos por relación; y cuál de los pasos `convert` o `project` sobrevive | PO y equipo técnico | A1, A3, A2 |
| PO-10 | «Nueva planeación» editable frente al bloqueo de la línea base (S8) | PO | B10 |
| PO-11 | Plantilla y reglas de validación de la importación de gastos | PO | B8 |
| PO-12 | Modelo de vínculo de Soportes (vincular a qué entidad) | PO | B6 |
| PO-13 | Alcance de Convocatorias y de la propuesta económica | PO | A7, A8, A9 |
| PO-14 | Mapa: modelar la relación cliente-departamento o agregar por texto libre | PO | D6 |
| PO-14b | Basta la falla cerrada actual del registro de soportes o se exige transacción (REQ-NFR-04) | PO | C4 (alcance) |
| PO-15 | Guías por sección: panel in-app o documento del repositorio | PO | D8 |
| PO-16 | Proveedor de correo y plantillas (C7) | PO y usuario | D7 (plantillas y envío) |
| PO-17 | Proveedor del ambiente de pruebas, estrategia de PRs encadenados (pila contra `main` o rama de integración), publicar (push, PR, merge) y ventana de `migrate deploy` | usuario | L0-1, L0-3, L0-4, L0-8, C11 |

El ok del usuario para extender las guardas (D9) se pide aparte; amplía alcance.

## 5. Orden y calendario sugerido (relativo)

Sin fechas: cada oleada empieza cuando se cumple su condición.

**Oleada 1: arrancar ya, sin decisiones** (en paralelo, un agente por carril, máximo 3 servidores de desarrollo activos)

- Carril 0: L0-1 y L0-2 (S + S). Pedir PO-17 al usuario.
- Reunión con el PO para PO-1 a PO-9 (S, solo reuniones).
- A: A4 y A5 (M + L), sin migración. A6 (M) después de A4.
- B: B1, B2, B5, B7 (S cada una) y luego B3 y B4 (M cada una).
- C: C5 (S), C4 verificación (S), C10 (S) y C12 como pregunta al PO.
- D: D2, D3, D4, D5 (S cada una) y D1 (M).

**Oleada 2: tras las decisiones del PO**

- A: A1 y A3 (PO-9), luego A2 (S). Primero el corte solo de migración.
- C: C1, C2, C3, C6, C7 (S cada una) y C8 (M) con PO-1 a PO-8.
- B: B6 (PO-12), B8 (PO-11), B9 tras A2 y C8.
- D: D6 (PO-14), D8 (PO-15), D9 (ok del usuario).
- Carril 0: L0-3 (ambiente de pruebas) y L0-4 (plan de PRs); **congelamiento de migraciones** al final de esta oleada.

**Oleada 3: tras el ambiente de pruebas o con alcance grande**

- C9 (PDF, L) y C11 (rendimiento, M, necesita volumen real).
- A7, A8 (L cada una) y A9 (M), solo si PO-13 los incluye.
- B10 (L), solo si PO-10 lo habilita.
- D7 (L), cuando haya proveedor de correo.
- Carril 0: L0-5 a L0-8 en estricto orden secuencial, con revisión humana de cada PR.

Con 4 agentes, la oleada 1 se compone sobre todo de tareas S y M; la ruta crítica a producción es el Carril 0, no los
carriles de desarrollo.

## 6. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Dos agentes editan el mismo archivo | Tabla 2.4 con un dueño por archivo; componentes nuevos que el dueño monta; hunks disjuntos |
| Dos carriles escriben en la misma base y se pisan los invariantes | Una base por carril (`muttu_lane_*`) con su propio `.env.local`; nunca `.env` |
| La suite completa falla por contención de memoria | Un solo `vitest` completo a la vez con `flock`; los agentes corren pruebas focalizadas |
| Una migración choca o se reordena | A es el único dueño, orden de marcas estricto, corte solo de migración integrado el mismo día |
| Migraciones nuevas sin ensayo en datos reales | Congelamiento antes de L0-5; toda migración posterior repite el ensayo |
| Se toca producción por error (el `.env` raíz es el Supabase remoto) | `prisma.config.ts` y los scripts solo cargan `.env.local` y rechazan destinos no locales; los worktrees no llevan `.env` |
| Login del carril no funciona con su base propia (Auth local compartido) | Verificación en el primer arranque; el seed reutiliza usuarios por correo; si falla, trabajar con tests y `curl` |
| Documentos del cliente en conflicto (territorial) | PO-1 se resuelve antes de C6; el plan no asume una respuesta |
| PDF no funciona en serverless (R-15) | C9 en la oleada 3, con prueba de despliegue en el ambiente de pruebas |
| Rama 333 commits por delante de `main` sin módulo de Proyectos | Carril 0: cortes encadenados de unas 400 líneas y plan acordado antes de revisar |
| Push bloqueado por la inspección TLS de Fortinet | L0-1 al inicio; hasta entonces todo es local |
| Verificación visual no disponible en algunos entornos | Los agentes sin navegador dejan el checklist visual (claro/oscuro, 1440 y 390 px); D5 y la revisión humana lo cierran |
| La revisión nativa por recibos no corre desde algunos entornos | Verificación del padre (suite + `tsc` + eslint + guardas) como registro, como ya se decidió el 2026-10-13 |
| Deriva de alcance (opcionales entran sin decisión) | A7 a A9, B10 y D7 solo con PO-13, PO-10 y PO-16 |

## 7. Fuentes

- Documentos del PO en `~/Downloads`: `Requerimientos_Funcionales_v2_Modulo_Proyectos.docx` (RF v2.0, 2026-09-28),
  `Requerimientos Funcionales - Detalle Clientes.docx`, `Requerimientos Funcionales - Tablero de Seguimiento y Gestión Social.docx`
  (2026-09-04) y `Estructura_Detalle_Tecnico_y_Financiero.docx`. Las copias de trabajo también están en
  `~/Downloads/Web app views creation/uploads/`.
- `odd/tasks/v2-projects-sdd.md`: SDD derivado del RF, con los identificadores REQ, V, P, D y N usados arriba.
- Prototipo v7: `~/Downloads/Web app views creation/Muttu Hub v7.dc.html`. Es diseño, **no** requisito.
- `docs/Muttu_Hub_PRD_v2.md` **no** cubre Proyectos; no sirve como fuente de requisitos de este módulo.
- Contexto y evidencia: `docs/pasos-post-reunion-2026-10-14.md`, `odd/tasks/v7-alignment.md`,
  `odd/tasks/v7-gap-analysis.md`, `docs/pendientes/pendientes-v7-alignment-2026-10-13.md`, auditoría en `docs/analisis/`.
