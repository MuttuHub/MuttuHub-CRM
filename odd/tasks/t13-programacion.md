# T13 — Programación propuesta y reprogramación (carril A)

Objective: the system proposes each budget line's monthly programming, the Gestor adjusts and confirms it, and after the
baseline moves values between months of one line without approval; modifications and transfers work per line.
Branch: `feat/t13-programacion` (base = `feat/t11-5-retirar-import-po` + merge of `feat/t12-actividad-transversal`).
Delivery: stacked-to-main (T11 L7), one PR per work unit. Tests: Vitest; live-DB invariants against local muttu-hub
(`.env.local`, 127.0.0.1:54322, never `.env`).

## Specs

Verbatim from `odd/tasks/po-2026-11-10-proyectos.md` (S7, S8).

### S1. Programación propuesta (S7)
- «Al importar, el sistema propone la programación mensual de cada línea (actividad + rubro) en proporción a los días que la actividad ocupa en cada mes. El centavo que sobre por redondeo se suma al último mes.»
- «Ejemplo: actividad del 19 de octubre al 15 de noviembre (28 días) con Transporte por $10.000.000: 13 días en octubre y 15 en noviembre, se proponen $4.642.857 y $5.357.143.»
- «En las transversales la propuesta sale pareja por mes, y el Gestor la ajusta.»
- Acceptance: «Al importar la plantilla, todas las líneas tienen una programación propuesta que suma su valor.»

### S2. Pantalla de programación (S7)
- «El Gestor revisa y ajusta en la web, en una pantalla agrupada por actividad (grupos que se pliegan y despliegan) y con arriba los totales por rubro y por mes.»
- Acceptance: «Al editar un mes, el total por rubro y por mes de arriba se actualiza.»

### S3. Confirmación (S7)
- «El Gestor confirma la programación cuando “Falta por programar” queda en $0 en todas las líneas. Después el Gerente aprueba la línea base, como hoy.»
- Acceptance: «No se puede confirmar si alguna línea tiene un valor pendiente por programar.»
- Assumption: any later budget or programming write in BORRADOR clears the confirmation; baseline approval requires it.

### S4. Reprogramación entre meses (S8)
- «El Gestor puede mover valores entre meses de una misma línea sin aprobación, siempre que el total de la línea no cambie.»
- «Cada movimiento queda en auditoría (línea, mes de origen, mes de destino, valor, usuario, fecha).»
- «Solo se pueden mover valores del mes en curso hacia meses futuros, o entre meses futuros. Los meses ya cerrados no se modifican, para no cambiar los semáforos pasados.»
- Acceptance: «El Gestor pasa $2.000.000 de Transporte de noviembre a diciembre en una actividad, sin aprobación, y el total de la línea no cambia.» · «Un cambio que altere el total de la línea no se permite sin traslado aprobado.» · «En noviembre no se puede mover valor desde octubre.»

### S5. Traslados por actividad y rubro (S8)
- «Los traslados entre rubros o entre actividades sí requieren aprobación del Gerente (AJ-09). Con esta evolución, el traslado indica actividad y rubro de origen, y actividad y rubro de destino.»
- Includes the T11 leftovers: the modification engine, its post-state control, `modificacion-form.tsx` and `traslado-form.tsx` work per line, not per rubro.

### S6. Importación simple de estructura (plan 2026-11-14 §6)
- User: «Hazlo de tal manera se cumplan los criterios de aceptacion del documento "C:\Users\Adrian\Downloads\Hub-proyectos261028.docx"». Applies D-A (`importar-estructura-po.md` S6): «modo "solo estructura" que conserva el presupuesto existente». Re-import matches activities by code; budget lines survive.

### S7. Columna «Tipo» en la hoja Actividades de la plantilla (left by T12).

### S8. Borrar una actividad con presupuesto (verifier advisory of T11, L12)
- User (2026-11-14): «si tiene un presupuesto asignado se borra junto con la actividad, le toca hacerlo de cero».
- Deleting an activity (BORRADOR only, as today) deletes its budget lines with their programming; `valor_total` is
  recomputed as the sum of the remaining lines (T11 S2) and the programming confirmation is cleared (S3). A line with
  expenses cannot be deleted (T11 A3): the deletion answers 409 and nothing changes.

## Tasks

| ID | S# | Task | Route | Status | Commit |
|---|---|---|---|---|---|
| T13.1 | S3 | Migration: `proyectos.programacion_confirmada_at`, `programacion_confirmada_por_id` (additive, nullable) | inline | done | #188 `f1789f5` |
| T13.2 | S1 | Pure proposal helper (days per month, cent to last month, transversal even) + template import writes it | inline | done | #188 `f1789f5` |
| T13.3 | S3 | Confirm route; writes clear it; baseline requires it | inline | done | #188 `f1789f5` |
| T13.4 | S2 | Programming screen grouped by activity, rubro × month totals | inline | done | `6089552` |
| T13.5 | S4 | Post-baseline move route (same line, open periods, audit) + UI | inline | pending | |
| T13.6 | S5 | Modification engine, control, forms and traslado by line | inline | pending | |
| T13.7 | S6 | `estructura-po-import.ts` matches activities by code | inline | pending | |
| T13.8 | S7 | Template «Tipo» column | inline | pending | |
| T13.9 | S8 | Deleting an activity deletes its budget lines and programming; valor_total recomputed | inline | done | `4ba1637` |

Route evidence: one agent, sequential units sharing `presupuesto.ts`/`hooks/projects.ts` → no Writer trigger; inline.
Risk: T13.1 item 1 (schema, additive), T13.6 item 3 (modification key format), T13.7 item 1 (re-import deletes rows).

## Log

- **L1** (2026-11-14, user): «que hace falta en tu carril?» → lane A in `odd/tasks/plan-2026-11-14-dos-agentes.md` §2.
- **L2** (2026-11-14, user) on a lane-A migration for the confirmation: «si, pero ya sabes probar contra muttu-hub
  local». Schema rule amended: lane A owns this one additive migration on `Proyecto`; lane B keeps `Gasto`/reparto.
- **L3** Code map (explorer): writes are BORRADOR-only (`gatePresupuestoWrite`, `lockProyectoBorrador`); `lockProyecto`
  has no state check (S4). Dates via `activityDates` (`weeks.ts:82`), clamp to project end; cent split `repartir`
  (`traslado-simple.ts:44`). Import insertion point: after step 5 of `importarPlantilla`. The modification engine is
  keyed `rubro|periodo` (`modificaciones.ts:204,222,281`), PERIODO_PASADO slices the first `|` (breaks with line keys),
  `aplicarModificacion` maps rubro → one line (`api/modificaciones.ts:321`). Screen is a flat table, no groups/totals.
- **L4** T13.1 `728dc88`: migration `20261114180000_t13_programacion_confirmada` (two nullable columns + FK to usuarios).
  Local muttu-hub took 4 pending migrations (T10 ×2, T12, T13) cleanly; 63 project invariants green. Advisory: the DB
  has `lineas_presupuestales_actividad_id_idx` (from T10's migration) that the schema doesn't declare — pre-existing drift.
- **L5** T13.2 `54338f9`. Assumption 1: the PO example is in whole pesos, so each month gets whole pesos and the remainder
  (pesos and cents) goes to the last month. Assumption 2: on re-import a line whose cells already sum its value keeps
  them (the Gestor's web adjustment survives); any other line is re-proposed. The template has no activity type yet, so
  every line is proposed by days until T13.8. Checks: 181 unit tests, plantilla-import invariant 11/11 on muttu-hub.
- **L6** T11 PRs opened against main (stacked, merge in order): #183 → #184 → #185 → #186 → #187; T12 is #182.
- **L7** (2026-11-14, user: «listo dale, vamos con los merge en el orden recomendado») T11 and T12 merged to main:
  #183 `18a44db`, #184 `1e371fe`, #185 `27500f2` (+ empty `eaf0a4a` from a retried merge after a GitHub 504), #186
  `d4793fe`, #187 `4e98711`, #182 `220d544`. CI fixes on the way: slice 1 `bg-white` → `bg-input-bg` (design-guards);
  slice 3 demo seed programs each line before the baseline (it aborted with PROGRAMACION_PENDIENTE) and the e2e PO
  fixture rebuilt in the 2026.2 layout; slice 4 e2e expects the derived $ 0. Force-push was denied, so each later slice
  took main by merge (squash keeps main linear). T13 rebased onto `220d544`: T13.1 `243e47d`, T13.2 `0da52bf`; tsc
  clean, 215 unit tests and invariants plantilla-import + presupuesto (21) green on muttu-hub.
- **L8** T13.3 `461ff29` (584+/23−, 22 files). Confirm route, clear on budget PUT / programming PUT / template import
  (IMPORTAR in the import lote), PROGRAMACION_SIN_CONFIRMAR baseline precondition, `programacion_confirmada` in the view,
  «Confirmar programación» button (enabled only for a saved, fully programmed grid) and «Programación confirmada»
  badge; demo seed confirms project B before its baseline. Decisions: who confirms = who may write the programming
  (gatePresupuestoWrite); the help text under the grid now explains the confirmation (two tests pinned the old copy).
  Checks: live invariants linea-base + plantilla-import (22) on muttu-hub; 3058 unit tests in the touched suites; CI
  seed order on an empty DB (ci_t13); tsc, eslint, knip clean. Risk: item 1 (T13.1 migration) and item 3 (the baseline
  now requires a confirmation every existing BORRADOR project lacks).
- **L9** (2026-11-14, user: «Deja el proyecto listo en un estado final para que comiencen los dos») #188 merged
  `f1789f5` (T13.1–T13.3 + lane B prompt). First CI run failed: `prisma/modificaciones.invariant.test.ts` approved a
  baseline without the T13 confirmation; fixed in its fixture (`263253d`) after running all 34 invariants file by file
  on muttu-hub. Lesson: a baseline or schema change runs every `prisma/*.test.ts`, as CI does. Lane B (deepseek) started
  on `feat/t14-gasto-por-actividad` from `220d544`; its step 0 merges main (with #188) before its migration. The main
  worktree is on `docs/t14-prompt-carril-b` (another session's prompt branch): left untouched. Next: T13.4 on
  `feat/t13-4-pantalla-programacion`.
- **L10** (2026-11-14, user, on T13.7's open question): «si tiene un presupuesto asignado se borra junto con la
  actividad, le toca hacerlo de cero» → S8, task T13.9.
- **L11** T13.9 `4ba1637`: `borrarPresupuestoDeActividad` + shared `fijarValorTotal` (budget PUT reuses it);
  dialog warns. Checks: live linea-base 14, presupuesto, plantilla-import, modificaciones, estructura; 2138 unit tests;
  tsc/eslint/knip clean. Lane B migration `20261115120000_t14_gasto_reparto` reviewed and APPROVED
  (`odd/tasks/t14-revision-migracion.md`, `45ba544`): six points verified on a seeded disposable DB. Cross-lane debt:
  once T14.2-B writes multi-line repartos, the three «line has expenses» checks of lane A (budget PUT A3,
  plantilla-import, borrarPresupuestoDeActividad) must count `gastos_reparto` — lane A does it when lane B reaches main.
