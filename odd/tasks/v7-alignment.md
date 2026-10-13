# v7 alignment: Tablero, Proyectos, Clientes (feature `v7-alignment`)

Engram mirror topic: `odd/v7-alignment/tasks`. Created 2026-10-13. Branch: `feat/projects-v2`. Prototype: `Muttu Hub v7.dc.html`.
Gap analysis: `odd/tasks/v7-gap-analysis.md` (v7 differs from v6 only by a light/dark theme system; no new screens, no in-app guides).

## Objective
Make Tablero, Proyectos and Clientes look like the v7 prototype (same or very close design) without breaking the backend contract. Clientes gets the
sections aliados, oportunidades, interacciones, relaciones, salud, mapa and automatizaciones, with CRUD for each and one user guide per section.

## Mode (user asked why it is slow; parent decision, 2026-10-13)
Lighter mode: tests for logic and backend (migrations, routes) only; UI verified by screenshots (light/dark, 1440/390); one native review per section.

## Units (sequential, single writer)
- [ ] T1 Tablero v7 (pills Todas/Prospección/Ejecución/Mías, 7th virtual "Nuevo proyecto" column from `Oportunidad.proyecto`, "Avanzar →" button)
- [ ] P1 Proyectos: finish F2 responsive work left uncommitted, ficha tabs regroup to the v7 10 tabs, "Ficha de seguimiento" table
- [ ] P2 Proyectos: "Nuevo proyecto" as a page (stepper)
- [ ] C1 Clientes tab shell + routes, Aliados master/detail
- [ ] C2 Oportunidades (global API, 7-stage kanban, ficha; stage mapping decision pending)
- [ ] C3 Interacciones (migration tipo + próximo paso, feed, dialog)
- [ ] C4 Relaciones (migration poder/interés, quadrant map)
- [ ] C5 Salud, C6 Mapa, C7 Automatizaciones (Setting-based), C8 guides (one per section)
- [ ] Optional: Convocatorias, propuesta económica

## Open product decisions (defaults will be taken and flagged)
Salud score formula; opportunity stage mapping to v7 states; Mapa data source (no departamento link on Cliente); Automatizaciones scope.
