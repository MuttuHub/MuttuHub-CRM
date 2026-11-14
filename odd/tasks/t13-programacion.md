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

## Tasks

| ID | S# | Task | Route | Status | Commit |
|---|---|---|---|---|---|
| T13.1 | S3 | Migration: `proyectos.programacion_confirmada_at`, `programacion_confirmada_por_id` (additive, nullable) | inline | done | `728dc88` |
| T13.2 | S1 | Pure proposal helper (days per month, cent to last month, transversal even) + template import writes it | inline | done | `54338f9` |
| T13.3 | S3 | Confirm route; writes clear it; baseline requires it | inline | pending | |
| T13.4 | S2 | Programming screen grouped by activity, rubro × month totals | inline | pending | |
| T13.5 | S4 | Post-baseline move route (same line, open periods, audit) + UI | inline | pending | |
| T13.6 | S5 | Modification engine, control, forms and traslado by line | inline | pending | |
| T13.7 | S6 | `estructura-po-import.ts` matches activities by code | inline | pending | |
| T13.8 | S7 | Template «Tipo» column | inline | pending | |

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
