# Producto — pendientes 6 a 11 (docs/pendientes.md §2)

Objective: build the six product items of `docs/pendientes.md` §2. Branch `feat/producto-pendientes` (from `main` 97b8af3c).
Delivery: ask-on-risk, one work-unit commit per item. Test runner: Vitest (`npx vitest run`); live-DB invariants with
`node --env-file=.env.local node_modules/vitest/vitest.mjs run prisma --no-file-parallelism` against local `muttu-hub`.

## Specs

- **S1 — B6.** `docs/pendientes.md:27`: «Rubros editables por proyecto: deshabilitar los que no aplican. D-B ya está
  decidida; requiere migración». D-B (`docs/plan-trabajo-restante.md:168`), decided 2026-10-26: «Los 15 rubros están
  bien, deben ser editables y modificables por si depronto para un proyecto no aplican, se puedan deseleccionar o
  inhabilitar para ese proyecto en concreto». «Sin rubros propios». Done when (`:64`): «El presupuesto de un proyecto
  oculta rubros deshabilitados […] sin afectar a otros proyectos» (the «acepta uno propio» half is void per D-B).
  Decision (L7): «Bloquear» — a rubro can be disabled for a project only while its lines there are at $0 and it has
  no expenses in that project; otherwise the action explains why not. Nothing disappears from reports or the financial
  sheet. Allowed in BORRADOR and in execution (no amount changes). Assumption (not asked): who may toggle follows the
  existing budget-edit permission; imports and new expenses reject a disabled rubro with a clear message.
- **S2 — V2.** `docs/pendientes.md:28`: «Enlazar las tareas al convertir una oportunidad GANADA. Hoy `Tarea` no tiene
  `proyecto_id`». Done when (`docs/plan-trabajo-restante.md:110`): «Convertir una ganada crea el proyecto y enlaza las
  tareas». Decision (L6): «Campo proyecto_id» — a migration adds `Tarea.proyecto_id`; converting links the
  opportunity's open and completed tasks; tasks created later in the project can carry it; tasks of opportunities
  already converted are backfilled.
- **S3 — V5.** `docs/pendientes.md:29`: «Mapa de aliados por departamento. Hoy la ruta hace `redirect("/clientes")`».
  Done when (`docs/plan-trabajo-restante.md:113`): «Agregación por departamento con filtros y sin datos inventados».
  PO-14 decision (L8): «Campo departamento» — a migration adds a departamento to the client, picked from the official
  list already in the municipios catalog; the form asks for it; the map counts only clients that have it and shows
  the rest apart as «sin departamento», never guessed from `Cliente.ubicacion`.
- **S4 — V8.** `docs/pendientes.md:30`: «Reglas de automatización «2 días antes» y «30 días sin contacto» (sin verificar
  en el código)». Done when (`docs/plan-trabajo-restante.md:116`): «Un umbral activo dispara el aviso esperado».
  `docs/plan-accion-requerimientos-v7.md:404`: «recordar compromisos 2 días antes, alertar 30 días sin contacto»;
  «Reglas con umbral configurable en `Setting` (clave `automatizaciones`)». Verified 2026-11-19: neither rule exists.
  Channel decision (L4): «Las 3 mencionadas» — each rule notifies through (a) a new section of the existing daily
  digest, (b) its own e-mail queued in the outbox with an idempotency key, and (c) an in-app notification.
  Assumption (not asked): each rule and its day threshold are configurable in Automatizaciones (default 2 and 30, on).
  Templates and provider (PO-16) stay out of scope.
- **S5 — V9.** `docs/pendientes.md:31`: ««Nueva planeación» en la ficha de seguimiento (sin verificar en el código)».
  Done when (`docs/plan-trabajo-restante.md:117`): «La tabla permite editar la planeación de un mes y la curva S refleja
  el cambio». Verified 2026-11-19: partial — T13 «Mover valor» exists on the Presupuesto tab, not on seguimiento.
  PO-10 decision (L5): «Mover sin cambiar total» — the seguimiento view gets a monthly table where a month's plan is
  edited under the T13 rule (redistribute between months of the same line, line total unchanged), through the
  existing `POST /programming/move`; no migration.
- **S6 — D4.** `docs/pendientes.md:32`: «Semilla con una tarea comercial sobre una oportunidad GANADA sin proyecto».
  `docs/plan-trabajo-restante.md:229-230`: «falta la semilla que demuestre «Pasar a nuevo proyecto» con una tarea
  comercial completada sobre una oportunidad GANADA sin proyecto. `scripts/seed-demo-flujo.ts` siembra 4 oportunidades
  libres y ninguna tarea.» Done when (`docs/plan-accion-requerimientos-v7.md:401`): «El seed de demostración deja al
  menos una tarjeta en esa condición; no es un defecto de código».

## Tasks

| ID | Spec | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S6 D4 | inline | done | RED 8 → GREEN 23/23; local apply + idempotent rerun (see L3) |
| T2 | S4 V8 | delegated (context backstop) | in progress | — |
| T3 | S5 V9 | delegated (context backstop) | done | RED 6 → GREEN 94/94 (parent rerun 94/94) |
| T4 | S2 V2 | delegated | queued: waits for T2 (shared prisma/schema.prisma) | — |
| T5 | S1 B6 | delegated | queued: after T4 (shared prisma/schema.prisma) | — |
| T6 | S3 V5 | delegated | queued: after T5 (shared prisma/schema.prisma) | — |

## Log

- **L1** (2026-11-19, user): «Empecemos todo lo de producto, 6 7 8 9 10 11»
- **L2** (2026-11-19): read-only map of the six items (explorer). Only D4 has no open product decision; V8 and V9 were
  verified in code (V8 missing, V9 partial). The B6 row at `plan-trabajo-restante.md:64` says «deshabilitar y agregar»,
  but D-B says «Sin rubros propios», and D-B is the later decision. Next: T1, then the open decisions one at a time.
- **L3** (2026-11-19): T1 done. `scripts/seed-demo-flujo.ts` adds one completed CRM task (id namespace `d005`) on the
  free GANADA «Escuela de formación técnica en confección»; `checkDemoFlujoData` now fails without such a task. The test
  feeds the task to the board's own `cardAction` and gets «Pasar a nuevo proyecto →». Applied on local `muttu-hub`: 1
  task created, constraint accepted, second run «already seeded». Pre-existing quirk left alone: on a top-up the
  summary says «0 GANADA opportunities left free» (it counts only the plan's rows).
- **L4** (2026-11-19, user, V8 channel question «Dentro del resumen / Un correo por aviso / Notificación en la app»):
  «Las 3 mencionadas». `TipoNotificacion` already has `POR_VENCER`; «sin contacto» needs a new value → migration.
  T2 delegated to one bounded writer (long-session context backstop).
- **L5** (2026-11-19, user, V9 question «Mover sin cambiar total / Editar libremente / Serie paralela»): «Mover sin
  cambiar total (Recomendado)». Closes PO-10 for V9.
- **L6** (2026-11-19, user, V2 question «Campo proyecto_id / Enlace indirecto»): «Campo proyecto_id (Recomendado)».
  T4 starts after T2 because both edit `prisma/schema.prisma`.
- **L7** (2026-11-19, user, B6 question «Bloquear / Ocultar y conservar / Solo en BORRADOR»): «Bloquear (Recomendado)».
- **L8** (2026-11-19, user, V5 question «Campo departamento / Por dónde ejecuta / Leer el texto libre»): «Campo
  departamento (Recomendado)». Closes PO-14. All product decisions for S1–S6 are now taken; T4, T5 and T6 run one
  after another because each edits `prisma/schema.prisma`.
- **L9** (2026-11-19): T3 done by a bounded writer. «Nueva planeación» table (read-only cells, line totals) plus the
  shared T13 «Mover valor entre meses» form, extracted to `src/components/proyectos/ficha/seguimiento/mover-valor.tsx`
  and reused by the Presupuesto tab. A move POSTs `/programming/move`, and `useRefreshPresupuesto` now also invalidates
  `["projects","curve",id]` so the S-curve refetches. Form only for `canWrite` in EN_EJECUCION. In the live ficha the
  table sits with the curve inside the collapsed «Opciones avanzadas» (ficha-actividades mounts the Lista mode).
  Open for the PO: whether it should be visible without expanding.
