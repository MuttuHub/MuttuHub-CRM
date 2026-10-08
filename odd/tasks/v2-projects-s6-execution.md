# Muttu Hub v2 — S6 Expenses and validation (RF-20..22, RF-25, RNF-03, RNF-04)

Parent plan: `odd/tasks/v2-projects-sdd.md`, ledger `odd/tasks/v2-projects-execution.md`, verified mapping
`odd/tasks/v2-projects-s6-map.md` (READ IT: tables, SQL, route rules, defaults, risks). Branch: `feat/projects-v2`.

## Objective

Managers and member coordinators register expenses against budget lines (rubros with A > 0) with at least one support; a
different manager validates or rejects them; validated expenses feed E in the financial ficha; validating beyond the
assigned amount is blocked, flagged and notified; third-party IDs and supports are restricted and every support access is logged.

## Decisions (defaults from map section 9; revisit with PO feedback)

1. Notify only active GERENCIA users on overspend (ADM sees the flag in lists/queue).
2. Duplicates: REGISTRADO and VALIDADO in any project, matching normalized id + document number (tipo ignored); never blocks.
3. RECHAZADO may be corrected by the registrant (back to REGISTRADO); VALIDADO is voided by ADM/GER with motivo (ANULADO).
4. The rejector also cannot be the registrant (`gastos_rechazador_ck`).
5. Coordinators who are members may view supports of every expense of their projects (`canViewFinancialSupports`), edit only their own.
6. Registration only in EN_EJECUCION; validate/reject/void in any estado of an existing project.
7. Up to 5 soportes per registration; JSON confirm-mode (sign -> direct upload -> confirm), not multipart.
8. `ejecucion_disponible = fuente.disponible && estado !== "BORRADOR"`.
9. Overspend block COMMITS flag + notifications and answers 409 (returned result, never an exception); lock = row lock on `lineas_presupuestales`.
10. Third-party ID never in audit `valor_nuevo` or the financial-sheet payload.
11. REQ-GAS-06 (A never below validated E) belongs to S8.3b: recorded, not implemented.
12. No route changes project estado. Money as strings/bigint cents (`BigInt(...)`, no bigint literals: ES2017).

## Constraints

- Local only; no push, PR or remote. Every DB command loads `.env.local` (never the default `.env`).
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Delivery strategy `ask-on-risk`; ~400 lines/unit advisory. Native review (RDD) needs per-candidate consent: pending.

## Tasks

Route: delegated writer per round (round 1: U1-U3, round 2: U4-U6).

- [x] **U1** Pure libs `src/lib/proyectos/gastos.ts` (+ fixtures): identification/document normalization, estado machine, redaction, overspend fixtures (3d2384f).
- [x] **U2** Schema + migration `v2_gastos_validacion` (gastos, acceso_soportes, soportes_proyecto.gasto_id) + `prisma/gastos.invariant.test.ts` (089fad3).
- [x] **U3** Registration + duplicates + supports: `lib/api/soportes.ts` extraction, sign/create/list/get/patch routes, audit, OpenAPI (13dae48).
- [ ] **U4** Validation flow + overspend + notifications (migrations for `SOBREGASTO_RUBRO` enum and Notificacion columns, queue route, notifications GET/read-all/panel).
- [ ] **U5** Support download + access log + E seam (`loadGastosValidados`, BORRADOR keeps `ejecucion_disponible:false`).
- [ ] **U6** UI: section, form, actions, validation queue, hooks (+ stubs in list/ficha tests).

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly: proyecto-secuencia invariant, user-menu, upload-dialog, task-dialog, change-password-dialog).

## Progress

- 2026-10-08: document created from the S6 map.

- 2026-10-08: round 1 (U1-U3), one commit each, local DB only (`node --env-file=.env.local ... migrate deploy` for
  `20261010120000_v2_gastos_validacion`, then `npm run db:generate:local`; re-running the SQL through `db execute` succeeded
  (idempotent); `migrate diff --from-config-datasource --to-schema` reported an empty migration, no drift). RED observed per unit
  (U1: unresolved `./gastos` module; U2: 18/18 invariant tests failing with `Cannot read properties of undefined (reading 'create')`
  on the missing Prisma delegate; U3: unresolved `./route` for sign/list/detail plus the failing OpenAPI test), then GREEN.
  Full suite `TZ=America/Bogota npx vitest run`: 220 files / 2216 tests green; `tsc --noEmit` and eslint clean on touched files.
  - U1: `lib/proyectos/gastos.ts` (`normalizarIdentificacion`, `normalizarNumeroDocumento`, `periodoPorDefecto`, `periodoEnProyecto`,
    `datosIncompletos`, `puedeTransicionar`, `esDuplicado`, `redactarGasto`), fixture `__fixtures__/gastos.ts` (Transporte A 24.000.000).
  - U2: models `Gasto`, `AccesoSoporte`, enums `EstadoGasto/TipoSoporteGasto/TipoIdentificacion`, `SoporteProyecto.gasto_id`; CHECKs
    `gastos_monto_positivo_ck`, `gastos_periodo_ck`, `gastos_validador_ck`, `gastos_rechazo_ck`, `gastos_rechazador_ck`,
    `gastos_validado_ck`, `gastos_anulado_ck`; `soportes_proyecto_padre_check` dropped and re-added with the same name including
    `gasto_id`; append-only triggers via `acceso_soportes_inmutable()` (message "acceso_soportes es de solo escritura").
  - U3: `lib/api/soportes.ts` (schemas, messages, `signarSubidaSoporte`, `validarSoporte`; the avance sign/attachments routes and
    OpenAPI now import it, their tests unchanged and green), `lib/api/gastos.ts` (schemas, gates, `resolverLinea`, `resolverPeriodo`,
    `superaAsignado`, `buscarDuplicados`, views, `mascara`), routes `expenses` (GET/POST), `expenses/sign`, `expenses/[expenseId]`
    (GET/PATCH), OpenAPI `paths/project-expenses.ts`.
  - Deviations: (1) `expenses/[id]/attachments` GET/POST (add a support after creation) NOT built in U3: supports are confirmed inside
    POST /expenses; round 2 adds them if the UI needs it (U5/U6). (2) The gasto case for `soportes_proyecto_padre_check` lives in
    `gastos.invariant.test.ts` (not appended to `avances.invariant.test.ts`, which stays green untouched). (3) PATCH requires
    EN_EJECUCION (`gateEjecucionWrite`) and a non-empty body; the 409 estado check precedes body validation. (4) Duplicate alerts hide
    BOTH `proyecto_codigo` and `gasto_id` when the actor cannot read the other project. (5) Audit of the third-party number is the
    mask `***NNN` (last 3 alphanumerics); create audits one CREAR row (entidad `gasto`) with `soportes` count. (6) Create responds with
    `puedeVerSoportes: true` because the write gate already implies it. (7) Native review (RDD) not run: needs per-candidate consent.

## Next step

Round 2: U4 (validation flow, overspend, notifications; enum `SOBREGASTO_RUBRO` in its own migration), U5 (support download + access log
+ E seam; also decide on the attachments add routes), U6 (UI).
