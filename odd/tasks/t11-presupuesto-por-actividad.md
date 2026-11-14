# T11 — Presupuesto por actividad (S5 del PO 2026-11-10)

Objective: a budget line is activity + rubro + value, in the API, the screen and the 9-sheet template. Branch
`feat/t11-presupuesto-por-actividad` (from `main` at `0e0de6a`, T10 merged). Delivery: `ask-on-risk`. Runner: Vitest.

## Specs

- **S1** «Cada línea del presupuesto es una combinación actividad + rubro + valor. Una actividad puede tener uno o
  varios rubros (por ejemplo, solo Personal, o Formación y Transporte).»
- **S2** «El asignado por rubro y el valor total del proyecto se calculan sumando las líneas; no se digitan.»
- **S3** «Plantilla del proyecto, hoja Presupuesto: columnas Código de actividad, Rubro y Valor; una fila por
  combinación.»
- **S4** «Se elimina de la plantilla la hoja de Programación mensual (ver EV-03).»
- **S5** «Validaciones: la actividad existe, el rubro está activo y no se repite la misma combinación actividad +
  rubro.»
- **S6** Acceptance: «Una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas, y
  esos valores suman en sus rubros.»
- **S7** Acceptance: «Una plantilla con la misma actividad y rubro en dos filas se rechaza con fila y columna.»
- **S2 scope** (user decision, L5): `valor_total` stops being typed **everywhere** in T11: project creation,
  conversion from an opportunity, the project PATCH, the budget screen and the simple PO import. It is always Σ lines.
- **S8** (user decision, L2) Until T13 proposes programming, the web keeps programming editable **line by line**
  (activity + rubro), so an imported project can still balance its programming and get its baseline approved
  (`PROGRAMACION_PENDIENTE`, `CONTROL_PROGRAMACION` stay in force).

Assumptions (agent defaults, not PO text — revisit if wrong):
- A1 Legacy lines (no activity, D9) stay readable and editable; they show as «Sin actividad».
- A2 The template version is bumped; an old-layout template (rubro-only Presupuesto, sheet 8) is rejected with a
  message that names the new layout, because a rubro-only row cannot be placed on an activity.
- A3 Removing a line: deleted when it has no expenses; refused with a message when it has.
- A6 Widened surface for T11.6 (L5): `src/app/api/v1/projects/route.ts`, `src/app/api/v1/projects/[id]/route.ts`,
  `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts`, the new-project stepper and the
  project general form, plus their hooks, OpenAPI and tests. Lane B does not own any of them; if one turns out to be
  shared, stop and tell the user.
- A4 `src/hooks/projects.ts` (budget/programming section) and `src/lib/openapi/paths/project-budget.ts` join the
  edit surface: they carry the API contract and Lane B does not touch them.
- A5 `presupuesto-po/**` (simple PO budget import) is left for last; decided in T11.5.

Checks: `npx vitest run src/lib/api/presupuesto.test.ts src/lib/api/plantilla-import.test.ts src/lib/proyectos/plantilla
"src/app/api/v1/projects/[id]/budget" "src/app/api/v1/projects/[id]/programming" src/components/proyectos/presupuesto
src/components/proyectos/project-presupuesto`, `npx tsc --noEmit` (after `npx prisma generate`), `npm run lint`,
`npx knip`, and the live-DB invariants on the disposable DB (`muttu-t10-db`, never `.env`).

## Tasks

| ID | Specs | What | Route | Status | Commit |
|---|---|---|---|---|---|
| T11.1 | S1 S2 S5 S6 A1 A3 A4 | Budget API by line: GET exposes `lineas[]` (activity, rubro, value) next to `rubros[]`; PUT writes lines; valor_total = Σ lines | inline | done | `b74835e` |
| T11.2 | S8 | Programming API by `linea_id`: write and read cells per line, not per rubro | inline | pending | |
| T11.3 | S3 S4 S5 S7 A2 | Template: Presupuesto sheet (Código de actividad, Rubro, Valor), drop sheet 8, V-11 by combination, activity exists; import writes lines with activity | inline | pending | |
| T11.4 | S1 S6 S8 | Budget screen by activity, and programming screen by line | inline | pending | |
| T11.6 | S2 | `valor_total` = Σ lines everywhere: drop it from creation, opportunity conversion and PATCH (contract change, risk 3) | inline | pending | |
| T11.5 | A5 | Simple PO budget import: adapt or retire | inline | pending | |

Forecast: ~900–1200 authored lines → above 400; chain strategy asked before the second commit.

## Log

- **L1** (2026-11-13, user): «vamos con el plan de hoy para claude» — Lane A of `odd/tasks/plan-2026-11-13-dos-agentes.md`, T11.
- **L2** (2026-11-13, user): asked how to cover programming between removing the sheet (S4) and T13; chose
  «Programar a mano (Recomendado)» → S8.
- **L3** Map (explorer, 2026-11-13): every write path (budget PUT `budget/route.ts:109`, programming PUT
  `programming/route.ts:126`, `plantilla-import.ts` steps 5–6, `presupuesto-po/server.ts:65`) still keys lines by
  rubro. Uniqueness lives in two partial SQL indexes (T10 migration). Outside the surface and user-visible once a
  rubro has two lines: `gasto-form.tsx:157` hides it, `gastos.ts:242` picks an arbitrary line — T14's territory,
  flagged to the user.
- **L4** Step 0 closed: #178, #179, #165, #181 (T10) merged. T10 needed a fix found by the live-DB invariants
  (`fa43596`, new lines from a request lacked `codigo_linea`).
- **L5** (2026-11-13, user): asked how far S2 goes in T11 (valor_total is typed in five places); chose «Todo en
  T11» → S2 scope, T11.6, A6.
- **L6** T11.1 committed `b74835e` (735+/252−). Checks: tsc, knip, eslint clean; vitest budget, presupuesto, presupuesto-po,
  components/proyectos, openapi green (the PO import route needed `compareActividad` to tolerate a missing activity).
  Running count ~990 authored lines > 400 → chain strategy asked before the next commit.
