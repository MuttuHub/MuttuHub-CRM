# Expense IVA and period from the document date (AJ-04, AJ-05)

Objective: split each expense into Subtotal + IVA = Total (the executed amount stays the total) and take its period
from the document date. Branch `feat/gastos-iva-periodo` from `main` (`51c957a`). Delivery: one PR with work-unit
commits (module exception, as B7/B8; forecast ~900 authored lines). Test runner: `npx vitest run`. Mirror: Engram
`odd/gastos-iva-periodo/tasks`. Source: PO document «Ajustes al módulo Proyectos» v1.1 (2026-10-28).

## Specs

- **S1 — AJ-04, «Debe quedar», verbatim.** «Campos: Subtotal, IVA y Total. El Total lo calcula el sistema (Subtotal +
  IVA) y no se digita. El valor ejecutado que consume el presupuesto del rubro es siempre Subtotal + IVA. El IVA se
  muestra aparte solo para información. El IVA puede ser 0 (por ejemplo, en cuentas de cobro de personas naturales no
  responsables de IVA). Plantilla de gastos: columnas obligatorias Subtotal e IVA. Propuesto: si trae columna Total,
  debe ser igual a Subtotal + IVA; si no, error con fila y columna.»
- **S2 — AJ-04, «Se acepta si», verbatim.** «Subtotal $1.000.000 + IVA $190.000: el rubro registra $1.190.000
  ejecutados. Una fila con Subtotal $500.000, IVA $95.000 y Total $600.000 se rechaza.»
- **S3 — Existing expenses (design).** `monto_cop` stays the Total, so every executed-amount aggregate (E, overspend,
  queues, KPIs) is unchanged. The migration adds `subtotal_cop` and `iva_cop`; existing rows get `subtotal = monto_cop`,
  `iva = 0`, so no stored total changes. The database enforces `monto_cop = subtotal_cop + iva_cop`, `iva_cop >= 0` and
  `subtotal_cop > 0`.
- **S4 — Old expense templates (user decision 2026-10-28, L3).** A file with «Valor (COP)» and no «Subtotal»/«IVA» is
  rejected with a clear message asking to download the new template; it is never read as Subtotal with IVA 0.
- **S5 — AJ-05, «Debe quedar», verbatim.** «El periodo se llena solo con el mes de la fecha del documento y cambia si
  cambia la fecha. Se puede editar, solo eligiendo meses del proyecto. Se retira la opción “Mes del documento”. Si se
  edita, el gasto muestra la marca “Periodo modificado” y el cambio queda en auditoría. Si la fecha está fuera de los
  meses del proyecto, el periodo queda vacío y es obligatorio elegirlo.»
- **S6 — AJ-05, «Se acepta si», verbatim.** «Fecha 28/10/2026: el periodo aparece como 2026-10 sin hacer nada. Si se
  elige 2026-12 para un documento de octubre, aparece la marca “Periodo modificado”.» **Assumption:** the mark is
  derived (`periodo` ≠ month of `fecha_documento`), so it needs no column and also shows on existing expenses whose
  period was chosen by hand; changing the date in the form resets the period to the new date's month.
- **S7 — Docs.** OpenAPI for the expense create/edit/view and import, the user guide, the test guide and the plan.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S3 (migration, Prisma schema, invariant test) | delegated (context backstop) | done (migration and invariant tests not run: no DB; `prisma generate` ok) | see git log |
| T2 | S1, S2 (Subtotal/IVA/Total end to end: API create/edit/view, hook types, form, table/detail) | delegated (context backstop) | done | see git log |
| T3 | S1, S2, S4 (import template and parser: Subtotal, IVA, optional Total check, old template rejected) | delegated (context backstop) | done | see git log |
| T4 | S5, S6 (period from the document date: API rule, form autofill, import, «Periodo modificado») | delegated (context backstop) | done | see git log |
| T5 | S7 | delegated (context backstop) | done | see git log |

Route evidence: the units depend on T1, and T2 to T4 share `src/lib/api/gastos.ts`, so there is no parallel-writer
reason; the parent context passed the ~150k backstop in this session, so each unit goes to one bounded writer in
sequence. Risk: item 1 for T1 (migration on money data) and item 3 for T2 (the expense API body changes from `valor` to
`subtotal` + `iva`) → independent verifier at the feature's end.

## Log

- **L1 (2026-10-28, user, verbatim):** «Mi PO me envió un documento quiero que lo revises, y darle prioridad ahora» →
  «"C:\Users\Adrian\Downloads\Hub-proyectos261028.docx"» → order AJ-04 + AJ-05 first: «dale».
- **L2 (2026-10-28):** Map. `Gasto.monto_cop` is the only amount and is summed by `gastos.ts`, `financiera.ts`,
  `kpis-portafolio.ts`, `modificaciones.ts`, `notificaciones-proyecto.ts`, `expense-validations/route.ts` and
  `ficha-financiera.ts`. `periodo` is `Char(7)`, required; the server defaults it with `periodoPorDefecto(fecha)`
  (`src/lib/api/gastos.ts:223`) and the form offers «Mes del documento» (`gasto-form.tsx:197`). No «periodo modificado»
  exists. The import (B8) requires «Valor (COP)» (`gastos-import/parse.ts`). Existing check `gastos_monto_positivo_ck`
  (`prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:68`).
- **L3 (2026-10-28, user):** on my recommendations for the open questions: «dale» — old templates rejected (S4); AJ-01
  decisions recorded separately (Engram `po/ajustes-proyectos-261028`).
- **Local DB:** Docker Postgres is not reachable from WSL in this session, so the migration and `prisma/*.invariant`
  tests cannot run here; they must run against `.env.local` before merge.
- **L4 (T1):** Migration `20261028120000_v2_gastos_subtotal_iva` (idempotent: columns, guarded backfill, three named
  CHECKs) and Prisma `subtotal_cop`/`iva_cop`. Invariant tests added to `prisma/gastos.invariant.test.ts`; they need
  Docker Postgres and were not run here. `subtotal_cop` is required in Prisma, so every other `gasto.create` caller must
  now pass it: `src/app/.../expenses/route.ts` (T2), `gastos-import/server.ts` (T3), and outside this feature's surface
  `scripts/seed-projects-demo.ts`, `scripts/migrate-v2/bench-dashboard.ts` and the invariant fixtures in
  `prisma/{modificaciones,notificaciones-proyecto,plantilla-import}.invariant.test.ts`.
- **L5 (T2):** API create/edit take `subtotal` + `iva` (both required on create; on edit each defaults to the stored value)
  and no longer take `valor`; the server writes `subtotal_cop`, `iva_cop`, `monto_cop = subtotal + iva` through
  `evaluarMontosGasto`. View keeps `valor` (Total) and adds `subtotal`, `iva`; audit records `subtotal`, `iva`, `valor`.
  Form: Subtotal, IVA (starts at 0, must be typed: empty is an error, assumption) and a read-only Total; table/card show
  `IVA $ x` under the Total. The import keeps its single amount column as an interim Subtotal with IVA 0 until T3.
- **L6 (T3):** Import template columns are now Subtotal, IVA, Total (optional), Periodo. **Assumption:** an empty IVA cell
  is a row error («IVA»: Ingresa el IVA (puede ser 0).), 0 must be written; the S1 «El IVA puede ser 0» is honoured by
  accepting a written 0, and the same rule applies in the form (IVA starts at 0, cleared is an error). Row errors name the
  column («Subtotal», «IVA», «Total») and the dialog prefixes the Excel row. A header row with «Valor (COP)» (or «Valor»,
  «Monto») and no «Subtotal» yields the single file error `PLANTILLA_ANTERIOR_MESSAGE`, before any missing-columns message.
- **L7 (T4):** `evaluarPeriodo` answers «La fecha del documento está fuera de los meses del proyecto: elige el periodo.» only
  when no `periodo` was sent and the document month is outside the project (create, edit with a new date, import row);
  an explicit period outside the project keeps «El periodo debe corresponder a un mes del proyecto.». The view carries the
  derived `periodo_modificado`; the table/card show «Periodo modificado» (title «Periodo AAAA-MM»). The form always sends
  `periodo`, prefills it from the date, resets it when the date changes and leaves it empty and required (error «Elige el
  periodo...») when the month is not a project month. Period edits were already audited per field by the edit route
  (`campo: "periodo"`); a test pins it. Route and parse tests for T4 passed on first run because `evaluarPeriodo` was
  covered RED at the lib level (`src/lib/api/gastos.test.ts`) before the implementation.
- **L8 (T5):** OpenAPI (`Gasto` view: `subtotal`, `iva`, `periodo_modificado`, `valor` = Total; create/patch bodies come from the
  schemas; import columns and the old-template message), user guide and test guide updated. The plan
  (`docs/plan-trabajo-restante.md`) has no row for the AJ items and no obvious place for them, so it was left unchanged.
- **L9 (2026-10-28):** Parent fixed the five `gasto.create` callers outside the writer's surface (`572a5e8`: demo seed,
  dashboard bench, three invariant fixtures get `subtotal_cop = monto_cop`, `iva_cop = 0`); `tsc` clean.
  Feature-end independent verifier (items 1 and 3): S1–S7 PASS, no blockers. Confirmed by reading: idempotent
  migration with the backfill before NOT NULL; every executed-amount aggregate byte-identical to `51c957a`; the old
  `valor` body answers 400 (`.strict()` schemas), never silently ignored; partial PATCH merges stored values; the S2
  examples and the old-template message are pinned. Advisories: deploy the migration together with the new build
  (`subtotal_cop` has no DB default, so an old build's inserts fail after it); history shows `subtotal`/`iva` with the
  generic label; the migration and `prisma/*.invariant` still have to run against `.env.local` before merge.
- **L10 (2026-10-28):** Full `src` + `scripts` suite: 360 files, 4213 tests passed. Native review (granted by the user,
  lenses risk, readability, reliability) was created, but its bound STATUS hit `operation_timeout` twice and stopped
  with `manual_action_required` (a Gentle AI defect, not a code finding). With the user's consent («Reportar y
  continuar») an occurrence comment was added to the canonical issue Gentleman-Programming/gentle-ai#5422, and the
  provider's decline was run once for this candidate (`declined_this_candidate`). No native review receipt exists for
  this branch; the independent verifier (L9) is the review of record. Next: user decides push and PR.
