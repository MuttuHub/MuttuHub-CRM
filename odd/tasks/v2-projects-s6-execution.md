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

- [ ] **U1** Pure libs `src/lib/proyectos/gastos.ts` (+ fixtures): identification/document normalization, estado machine, redaction, overspend fixtures.
- [ ] **U2** Schema + migration `v2_gastos_validacion` (gastos, acceso_soportes, soportes_proyecto.gasto_id) + `prisma/gastos.invariant.test.ts`.
- [ ] **U3** Registration + duplicates + supports: `lib/api/soportes.ts` extraction, sign/create/list/get/patch routes, audit, OpenAPI.
- [ ] **U4** Validation flow + overspend + notifications (migrations for `SOBREGASTO_RUBRO` enum and Notificacion columns, queue route, notifications GET/read-all/panel).
- [ ] **U5** Support download + access log + E seam (`loadGastosValidados`, BORRADOR keeps `ejecucion_disponible:false`).
- [ ] **U6** UI: section, form, actions, validation queue, hooks (+ stubs in list/ficha tests).

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly: proyecto-secuencia invariant, user-menu, upload-dialog, task-dialog, change-password-dialog).

## Progress

- 2026-10-08: document created from the S6 map.

## Next step

Round 1: U1, U2, U3.
