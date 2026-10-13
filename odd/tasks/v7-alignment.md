# v7 alignment: Tablero, Proyectos, Clientes (feature `v7-alignment`)

Engram mirror topic: `odd/v7-alignment/tasks`. Created 2026-10-13. Branch: `feat/projects-v2`. Prototype: `Muttu Hub v7.dc.html`.
Gap analysis: `odd/tasks/v7-gap-analysis.md` (v7 differs from v6 only by a light/dark theme system; no new screens, no in-app guides).

## Objective
Make Tablero, Proyectos and Clientes look like the v7 prototype (same or very close design) without breaking the backend contract. Clientes gets the
sections aliados, oportunidades, interacciones, relaciones, salud, mapa and automatizaciones, with CRUD for each and one user guide per section.

## Mode (user asked why it is slow; parent decision, 2026-10-13)
Lighter mode: tests for logic and backend (migrations, routes) only; UI verified by screenshots (light/dark, 1440/390); one native review per section.

## Units (sequential, single writer)
- [x] T1 Tablero v7 — done in b62fa8c, parent-verified (tsc 0, kanban tests green, screenshots light/dark); deferred: expose project id/code on the task DTO so the converted card links to the exact project. (pills Todas/Prospección/Ejecución/Mías, 7th virtual "Nuevo proyecto" column from `Oportunidad.proyecto`, "Avanzar →" button)
- [x] P1 Proyectos: ficha regrouped to the v7 tabs (11 = the 10 of v7 + Cambios), new read-only Soportes tab with `GET /projects/:id/supports`, "Ficha de seguimiento" variant (S-curve + side cards + avance por meta), Indicadores/Beneficiarios split out, Equipo to its own tab; F2 responsive and F3 copy/polish closed. Commits: `a20bcdc` (F2), `3ba7c9a` (tests), `8dd426c` (regroup + Soportes + F3 copy). Pending product decision: the editable "Nueva planeación" monthly input of the v7 prototype conflicts with the S8 baseline lock (programming is frozen after approval); the tab already shows the read-only monthly table via the S-curve.
- [ ] P2 Proyectos: "Nuevo proyecto" as a page (stepper)
- [x] C1a Clientes sub-navigation shell + routes (`80c26fa`; header titles `bbaffb6`): 7 sections (Aliados, Oportunidades, Interacciones, Relaciones, Salud, Mapa, Automatizaciones), Aliados renders the existing `ClientList` unchanged, the other six show an honest placeholder. [ ] C1b Aliados master/detail re-skin (pending; the current list stays as the Aliados tab meanwhile).
- [ ] C2 Oportunidades (global API, 7-stage kanban, ficha; stage mapping decision pending)
- [x] C3 Interacciones: migration `tipo` (`TipoInteraccion` enum) + `proximo_paso` (`3fe9f5b`, scope fix `91b8c1f`), cross-client read-only feed `GET /api/v1/interactions` + `Registrar interacción` dialog + BitacoraTab update (`da333a3`). The feed reads globally, like the client list (PR 3).
- [ ] C4 Relaciones (migration poder/interés, quadrant map)
- [ ] C5 Salud, C6 Mapa, C7 Automatizaciones (Setting-based), C8 guides (one per section)
- [ ] Optional: Convocatorias, propuesta económica

## Open product decisions (defaults will be taken and flagged)
Salud score formula; opportunity stage mapping to v7 states; Mapa data source (no departamento link on Cliente); Automatizaciones scope; the editable "Nueva planeación" monthly input of the v7 Ficha de seguimiento (conflicts with the S8 baseline lock).

## Progress
- 2026-10-13: T1 Tablero v7 done (`b62fa8c`, docs `12d8866`).
- 2026-10-13: **C3 done** (`3fe9f5b` backend + `91b8c1f` scope fix + `da333a3` UI). `BitacoraEntrada` gained `tipo` (REUNION/CORREO/LLAMADA/VISITA/OTRO, default OTRO) and `proximo_paso`, with an adoptive migration + live-DB invariant test; the per-client log accepts/returns them; a new global read-only `GET /api/v1/interactions` (filters cliente_id/tipo, global reads like the client list) backs the `/clientes/interacciones` feed; the `Registrar interacción` dialog posts through the per-client log; the client-sheet Bitácora shows the tipo chip and próximo paso. Parent verification: full suite **328 files / 3456 tests green**, `tsc` 0, guards green. Screenshot pass pending (no browser in this runtime).
- 2026-10-13: **C1a done** (`80c26fa`, header titles `bbaffb6`). The `/clientes` section got the v7 sub-navigation: a `clientes/layout.tsx` with a link strip (7 sections, `aria-current`), one route per section, Aliados rendering the existing `ClientList` untouched, and an honest `EmptyState` placeholder for the other six. Additive only: `client-list.tsx`/`client-sheet.tsx` and the CRM data layer were not touched; their tests stay green. Parent verification: full suite **324 files / 3427 tests green**, `tsc` 0, guards green. Pending: C1b Aliados master/detail.
- 2026-10-13: **P1 done** (`8dd426c`). The ficha moved from 8 to 11 tabs; `ProjectIndicadores`/`ProjectBeneficiarios` extracted; `ProjectKpisPanel` gained `soloExportar` and moved to Cambios; the new `project-soportes.tsx` + `GET /projects/:id/supports` list every live soporte (metadata only; downloads keep each origin's signed route; expense supports stay filtered by RNF-03); `ProjectTeam` left Resumen for its own tab; the cronograma and the objective roll-ups only paint a semáforo when the project is measurable. Tests aligned in `3ba7c9a`. Parent verification: full suite **323 files / 3411 tests green**, `tsc` 0, guards green. Remaining: the editable monthly input (product decision); the optional P2 (Nuevo proyecto stepper) and the Clientes units C1-C8.
