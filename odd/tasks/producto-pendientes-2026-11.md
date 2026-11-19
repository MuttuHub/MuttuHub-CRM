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
  Open: disabling a rubro with lines or expenses; reports; after the baseline; who may toggle; imports.
- **S2 — V2.** `docs/pendientes.md:28`: «Enlazar las tareas al convertir una oportunidad GANADA. Hoy `Tarea` no tiene
  `proyecto_id`». Done when (`docs/plan-trabajo-restante.md:110`): «Convertir una ganada crea el proyecto y enlaza las
  tareas». Open: a real `Tarea.proyecto_id` or the existing transitive link through `oportunidad.proyecto`; which tasks.
- **S3 — V5.** `docs/pendientes.md:29`: «Mapa de aliados por departamento. Hoy la ruta hace `redirect("/clientes")`».
  Done when (`docs/plan-trabajo-restante.md:113`): «Agregación por departamento con filtros y sin datos inventados».
  Open: PO-14 «Mapa: modelar la relación cliente-departamento o agregar por texto libre» (`Cliente.ubicacion` is free text).
- **S4 — V8.** `docs/pendientes.md:30`: «Reglas de automatización «2 días antes» y «30 días sin contacto» (sin verificar
  en el código)». Done when (`docs/plan-trabajo-restante.md:116`): «Un umbral activo dispara el aviso esperado».
  Verified 2026-11-19: neither rule exists; the daily cron only sends the digest. Open: per-client alert or digest
  category; channel; thresholds; templates (PO-16).
- **S5 — V9.** `docs/pendientes.md:31`: ««Nueva planeación» en la ficha de seguimiento (sin verificar en el código)».
  Done when (`docs/plan-trabajo-restante.md:117`): «La tabla permite editar la planeación de un mes y la curva S refleja
  el cambio». Verified 2026-11-19: partial — T13 «Mover valor» exists on the Presupuesto tab, not on seguimiento.
  Open: PO-10 «Nueva planeación» editable frente al bloqueo de la línea base (S8).
- **S6 — D4.** `docs/pendientes.md:32`: «Semilla con una tarea comercial sobre una oportunidad GANADA sin proyecto».
  `docs/plan-trabajo-restante.md:229-230`: «falta la semilla que demuestre «Pasar a nuevo proyecto» con una tarea
  comercial completada sobre una oportunidad GANADA sin proyecto. `scripts/seed-demo-flujo.ts` siembra 4 oportunidades
  libres y ninguna tarea.» Done when (`docs/plan-accion-requerimientos-v7.md:401`): «El seed de demostración deja al
  menos una tarjeta en esa condición; no es un defecto de código».

## Tasks

| ID | Spec | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S6 D4 | inline | done | RED 8 → GREEN 23/23; local apply + idempotent rerun (see L3) |
| T2 | S4 V8 | inline | blocked: product decisions | — |
| T3 | S5 V9 | inline | blocked: PO-10 | — |
| T4 | S2 V2 | inline | blocked: product decision | — |
| T5 | S1 B6 | inline | blocked: D-B sub-questions | — |
| T6 | S3 V5 | inline | blocked: PO-14 | — |

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
