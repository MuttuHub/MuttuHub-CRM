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
| T2 | S4 V8 | delegated (context backstop) | done, verifier PASS (2e975883) | RED → GREEN 477/477; parent rerun 98/98; invariant 1/1 |
| T3 | S5 V9 | delegated (context backstop) | done | RED 6 → GREEN 94/94 (parent rerun 94/94) |
| T4 | S2 V2 | delegated | done, verifier PASS after 1 correction (01cfa6fc, cf7e5738, fde3361e) | RED → GREEN 392 tests; invariant 6/6; parent rerun 115/115 |
| T5 | S1 B6 | delegated | done, verifier PASS after 1 correction (2f816d3a + reset fix) | RED → GREEN 719 + 403 tests; invariants 14/14; parent rerun 201/201 |
| T6 | S3 V5 | delegated | done, verifier pending (Risk 1, 3) | RED → GREEN 210 + 86 tests; invariant 4/4; parent rerun 40/40 |

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
- **L10** (2026-11-19): T2 first pass back from the writer, all green, two migrations applied locally
  (`20261119120000_v8_sin_contacto_enum`, `20261119120100_v8_notificacion_cliente` adding `Notificacion.cliente_id`).
  Gap: channel (c) rows were created but not visible in the bell (SIN_CONTACTO not listed; POR_VENCER hidden when
  `dias_por_vencer` < N). Sent back with extended surfaces (bell route and panel, `hooks/crm.ts`, OpenAPI).
- **L11** (2026-11-19, user, V8 «sin contacto» audience question «Solo activos / Dejarlo como está / Solo excluir
  cerrados»): «Solo activos (Recomendado)» — the rule skips INACTIVO and CERRADO clients, and a client with no
  bitácora entry counts from its creation date. The clients-list definition stays unchanged.
- **L12** (2026-11-19): T2 follow-up back. Bell lists SIN_CONTACTO («<Cliente> lleva N días sin contacto», only active
  clients, closed once a newer contact exists) and rule-1 reminders beyond the bell's fixed 3-day window, both through
  read/unread and read-all. `hooks/crm.ts` and OpenAPI updated. Rule 2 skips INACTIVO/CERRADO and counts a client with
  no entry from `created_at` (key by that date). Committed as one unit; independent verifier runs on the commit.
- **L13** (2026-11-19): independent verifier on 2e975883: PASS, no blockers (416 tests on a detached worktree; migrate
  diff from the old schema reproduces the committed SQL). Advisories kept open: (a) SIN_CONTACTO rows stay in the bell
  after rule 2 is switched off or its threshold raised; (b) a responsable change leaves the old user's row and gives the
  new one no e-mail for the current stretch; (c) with rule 1 at 2 and `dias_por_vencer` at 3 a task shows twice in one
  digest; (d) first production run queues one e-mail per active client already 30+ days without contact (outbox drains
  200 per run); (e) no test for skipping ADMINISTRADOR or inactive responsables; (f) baseline: `reconcileAlertas` has no
  unique key per (usuario, tarea).
- **L14** (2026-11-19): T4 done by a bounded writer. Migration `20261119130000_v2_tarea_proyecto`: nullable
  `tareas.proyecto_id`, `proyectos @@unique([id, oportunidad_id])`, plain FK plus composite FK
  `(proyecto_id, oportunidad_id) → proyectos(id, oportunidad_id)` (MATCH SIMPLE, the D1 pattern), and a backfill of
  tasks of already-converted opportunities. Only `.../project/route.ts` creates the project; it links the opportunity's
  live non-CANCELADA tasks in its transaction. Tasks POST/PATCH accept `proyecto_id` (400 missing/deleted or
  mismatched, 403 not visible); opportunity-task POST joins the opportunity's live project. DTO exposes `proyecto_id`
  and resolves `proyecto` direct-first. Assumption: CANCELADA tasks are not linked. Parent fixed the two leftovers
  (OpenAPI omit of `proyecto_id` on the opportunity-task body; `TaskItem.proyecto_id` in `hooks/crm.ts`).
- **L15** (2026-11-19): independent verifier on 01cfa6fc: 1 blocker — `scripts/reset-demo.ts` hard-deleted a converted
  demo project without clearing `tareas.proyecto_id` (FK NO ACTION), so a rehearsal reset failed. Fixed in cf7e5738
  (unlink before delete). Advisories A1–A3 (PATCH moving a task between opportunities answered 400; link/unlink left the
  project stale) fixed in fde3361e: the project follows the opportunity. Recheck limited to those: B1 closed, A1–A3 OK
  (208 tests on a scratch worktree). Remaining advisory: a task linked straight to a project with no opportunity loses
  that project when an opportunity is set or cleared. Also f1d346e0 drops 5 unused V8 exports so `lint:dead` passes.
- **L16** (2026-11-19): T5 done by a bounded writer (two passes). Migration `20261119140000_b6_rubros_deshabilitados`
  (table `proyecto_rubros_deshabilitados`, PK (proyecto_id, rubro_id), FKs RESTRICT). `PUT /projects/[id]/rubros/[rubroId]`
  `{ habilitado }`: 403 without budget-edit permission, 409 outside BORRADOR/EN_EJECUCION, 409 CONFLICT with money or
  expenses (message names the amount), audited, under the project row lock. One rule, `rechazoPorRubroDeshabilitado`,
  used by the budget PUT, the template validator V-11 (dry run and apply), and the template apply re-check; new
  expenses, expense corrections, expense import and modification requests refuse a disabled rubro with the same
  message. Budget view hides it and lists `rubros_deshabilitados`. UI: «Rubros del proyecto» on Presupuesto. About
  1,040 changed lines: one behaviour across seven entry points, kept together so none accepts money on a disabled rubro.

- **L17** (2026-11-19): independent verifier on 2f816d3a: 1 blocker — `proyecto_rubros_deshabilitados` (FK RESTRICT) was
  not in reset-demo's `DEMO_CHILD_TABLES`, so resetting a BORRADOR demo project with a disabled rubro failed (same class
  as L15). Fixed: the table joins the list, and a new test reads `prisma/schema.prisma` and fails on any non-cascading
  FK to Proyecto that the reset neither empties nor excludes with a reason (RED named exactly this table). Advisories
  kept open: A1 expense creation does not take the project lock, so a three-way race (approval to $0, toggle, late
  expense commit) can land an expense on a disabled rubro — the underlying race exists at the baseline; A2/A3
  programming cells (BORRADOR PUT, programming items of modification requests) are not checked against disabled rubros
  (not money; the S8.2 baseline gate still blocks); A4 a template re-import may delete a disabled rubro's hidden $0
  lines (harmless).
- **L18** (2026-11-19): T6 done by a bounded writer. Migration `20261119150000_v5_cliente_departamento`: nullable
  `clientes.departamento` plus trigger `clientes_departamento_en_catalogo` refusing a value with no row in `municipios`
  (no FK possible: `municipios.departamento` is not unique; no second list to drift). API 400 «El departamento no está
  en el catálogo oficial de departamentos.». `GET /clients/map` reuses the list's filters and visibility; one tile per
  catalogue departamento, clients without one apart as «sin departamento», `ubicacion` never read. `GET /departamentos`.
  `/clientes/mapa` tile grid + panel; Mapa back in the subnav; form select; demo seed fills departamento (only where
  NULL, idempotent). Parent added the map refresh on client create/update/delete. Open: the select is empty while the
  municipios catalogue is empty (production depends on it being loaded); a catalogue rename does not propagate.
