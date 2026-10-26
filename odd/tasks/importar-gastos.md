# Importar gastos desde Excel (B8)

Objective: register a project's expenses from one Excel file instead of one by one. Branch `feat/importar-gastos` from
`main` (`8e7c6ab`). Delivery: one PR (`ask-on-risk`, forecast ~900 authored lines). Test runner: `npx vitest run`.

## Specs

- **S1 — File and template.** One `.xlsx` with one row per expense. A downloadable template from the Gastos tab.
  Columns (assumption, mirrors the single-expense form): `Rubro`, `Fecha del documento`, `Tipo de soporte`
  (Factura de proveedor / Cuenta de cobro persona natural / Otro), `Tercero`, `Tipo de identificación` (optional:
  NIT / CC / CE), `Número de identificación` (optional), `Número de documento`, `Descripción`, `Valor (COP)`,
  `Periodo` (optional, `AAAA-MM`; defaults to the month of the document date). Rubros match by normalized name or
  code like B2. Same file guards as B2 (`.xlsx` only, `IMPORT_MAX_BYTES`, zip inspection, never stored). At most
  200 data rows.
- **S2 — Supports come separately.** User, 2026-10-26: "en el excel se subiria el gasto pero el adjunto viene aparte".
  The file carries no support; imported expenses are created as `REGISTRADO` with zero supports. A support can be
  attached afterwards to an existing `REGISTRADO` (or `RECHAZADO`, if editable today) expense from the Gastos tab,
  through the existing upload flow (sign → upload → confirm, or https link), max 5 per expense.
- **S3 — No validation without support.** An expense with zero live supports cannot be validated: the validate
  endpoint answers 409 with a clear message and the UI disables the action with that reason. Single-expense
  creation keeps requiring 1–5 supports (unchanged).
- **S4 — Same rules as a single expense.** Each row goes through the existing rules: `parseValorGasto` (> 0, max 2
  decimals), `resolverLinea` (rubro with assigned value > 0), `resolverPeriodo` (a month of the project), text
  limits of `GASTO_CREATE_SCHEMA`. Same gate as `POST /expenses` (`gateEjecucionWrite`: project `EN_EJECUCION`,
  admin/gerencia or active coordinator member) and the UI shows the import only where "Registrar gasto" shows.
- **S5 — Valid rows import, invalid rows are listed** (v7 plan: "importa filas válidas, rechaza las inválidas con
  motivo"). A validate-only preview lists every row as valid or invalid with its reason (`fila`, `mensaje`);
  confirming imports only the valid rows in one transaction and returns the rejected ones. File-level errors
  (wrong format, missing headers, no rows) reject the whole file.
- **S6 — Duplicates.** Two rows of the same file with the same normalized tercero id + document number: the second
  is invalid ("Duplicado dentro del archivo"). A match against an existing live expense is a non-blocking alert per
  row, using the existing `buscarDuplicados`.
- **S7 — Audit and overspend.** One shared `lote_id` for the whole import (`logChanges`), `registrado_por_id` = the
  importer, `alerta_sobregasto` computed like a single create. No notifications on import.
- **S8 — Docs.** OpenAPI paths, the user guide (`docs/guia-uso-proyectos-v2.md`: remove "no está en esta versión"),
  and the plan row B8.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S4, S6 | delegated (context backstop) | todo | |
| T2 | S5, S7 | delegated | todo | |
| T3 | S2, S3 | delegated | todo | |
| T4 | S1, S5, S8 | delegated | todo | |

## Log

- **L1 (2026-10-26, user):** "Con esto ya claro comienza b8 y e1"
- **L2 (2026-10-26, user, on supports):** "en el excel se subiria el gasto pero el adjunto viene aparte"
- **L3:** Mapping done (B2 as reference: `src/lib/proyectos/presupuesto-po/*`, `budget/import` and `budget/template`
  routes, `presupuesto-import-dialog.tsx`). Single-expense rules live in `src/lib/api/gastos.ts`. Route: one writer
  because the parent context passed the ~150k backstop.
