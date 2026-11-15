# T14 integration — review fixes and cross-lane debt

Objective: land lane B's T14 (`feat/t14-gasto-por-actividad`, rebased linear as `t14-lineal`) in `main` as chained PRs,
after fixing the review findings and the cross-lane debt. Branch: `t14-lineal`. Delivery: `auto-chain`
(`stacked-to-main`, as T11/T13). Runner: Vitest (`npx vitest run <file>`; live-DB invariants against `.env.local`).

## Specs

- **S1** (plan §14, row 5) «Revisar el diff de T14 y abrir sus PRs encadenados a `main`» — terminado cuando «PRs con CI
  verde y mergeados». Merge stays a human decision.
- **S2** (plan §14, row 6) «el ejecutado (`loadEjecutadoPorLinea`) y los cuatro chequeos «la línea tiene gastos» (PUT de
  presupuesto, plantilla, borrar actividad, importación de estructura) cuentan `gastos_reparto`» — terminado cuando
  «invariante en vivo con una factura repartida en dos líneas».
- **S3** Review finding 1: a split invoice corrected down to one line saves (today 400 «Unrecognized key»).
- **S4** Review finding 2: two rows of one invoice on the same line are rejected, so the per-row overspend check
  cannot be bypassed.
- **S5** Review finding 3: the «Código de actividad» column is text in the template, and a numeric or date cell is
  rejected instead of resolving to the wrong activity.
- **S6** Review finding 4: a change of distribution leaves an EDITAR audit row.
- **S7** (lane B L47, open product decision) «Total» means the document total, in the first row of a multi-row invoice.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| I1 | S3 | inline | done | `a8771ee` |
| I2 | S4 | inline | done | `79ef0be` |
| I3 | S5 | inline | done | `1d93e94` |
| I4 | S6 | inline | done | `34e69dc` |
| I5 | S2 | inline | done | `b7c0d49` |
| I6 | S7 | inline | done: approved, help text in the import dialog | (next commit) |
| I7 | S1 | inline | PRs open, waiting for the human merge | #196–#204 |

## Log

- **L1** (2026-11-15) User: «dale en automatico» — run the session plan of `docs/plan-trabajo-restante.md` §14.
- **L2** Lane B closed T14 (`90e23bf`); S11 (slice 5) is out of scope by the user's earlier decision. Rebased linear on
  `origin/main` 248d96d with no conflicts and an identical tree. Checks on that tree: tsc 0, eslint 0, knip 0,
  5139 unit tests green.
- **L3** Independent review (read-only): no blockers; four should-fix (S3–S6), L47 advisory (S7), row order and
  `resolverLinea` without `orderBy` advisories, and the exact cross-lane list: `budget/route.ts:138`,
  `presupuesto.ts:574`, `estructura-po-import.ts:131`, `plantilla-import.ts:639` (a line holding only a non-first split
  row passes the count and the `deleteMany` hits the NO ACTION FK → 500 instead of 409), and
  `modificaciones.ts:160` `loadEjecutadoPorLinea` (full amount on the header line).
- **L4** I1: RED observed (PATCH body had no `repartos`); a split invoice corrected to one line now sends a
  one-row distribution. I2: the API rejects a repeated line («Cada línea (actividad y rubro) puede aparecer una sola
  vez en la distribución de la factura.»); the import instead joins rows of one document on the same line into one
  row with their sum (decision: two items of the same rubro on one invoice are normal in a spreadsheet; RED observed
  against the base parser). I3: template column «Código de actividad» is text (`@`); a number or date cell is rejected
  with «escríbelo como texto (por ejemplo 1.10); Excel lo convirtió en número o fecha.». I4: audit field `reparto`
  (`linea_id=valor; …`, null for a one-line invoice so ordinary edits add no row), label «Distribución»; the demo
  seed now writes the one-row distribution (closes lane B debt L49.1 for that seed).
- **L5** I5: shared `lineasTienenGastos` (`src/lib/api/lineas-con-gastos.ts`) asks `gastos` and `gastos_reparto`;
  used by the budget PUT, activity delete, structure import and template import. `loadEjecutadoPorLinea` counts row
  by row, header only for a gasto without rows. Live RED on muttu-hub local (FK error instead of 409; 1.000.000 on
  the header line), then GREEN: 12/12 in `prisma/gasto-reparto.invariant.test.ts`. Lane B debt L49 (4), the stale
  writers comment in `financiera.ts`, refreshed. Still open: L49 (5) the import preview does not show `actividad`.
- **L6** Full battery on `t14-lineal` after I1–I5: tsc 0, eslint 0, knip 0, 5150 unit tests (414 files) and 280
  live-DB invariants (37 files) green on muttu-hub local.
- **L7** Chain opened, stacked to main, merge in order: #196 T14.1, #197 T14.2-A (migration), #198 T14.4-A,
  #199 T14.4-B, #200 T14.2-B1, #201 T14.2-B2, #202 T14.3, #203 review fixes + S10 debts, #204 cross-lane debt.
  Unit CI green on #196 and #204; e2e failed on both in `ficha-ejecucion.spec.ts` «Registrar avance…»: a date bomb
  (seed activity 1.4 became overdue on 2026-11-15, its deliverables open by themselves). Fixed apart in #205
  (test only, CI green) — merge it first; then each chain branch takes main and its e2e reruns.
- **L8** (2026-11-15) User on L47: «dale apruebalo, con tal que cumpla los criterios de aceptacion, terminemos esos
  pendientes ya». «Total» = document total, in the first row of a multi-row invoice, as lane B built it; the import
  dialog now says so («su «Total» es el de la factura completa y va en la primera fila»).
