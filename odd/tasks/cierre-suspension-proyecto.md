# Close / suspend / cancel a project (B7)

Objective: let management change a project's estado with a motivo and an audit trail, and freeze it accordingly. Branch
`feat/proyecto-cierre-suspension` from `main` (`51c957a`). Delivery: one PR with work-unit commits (`ask-on-risk`,
same as B8; forecast ~800 authored lines). Test runner: `npx vitest run`. Mirror: Engram `odd/cierre-suspension-proyecto/tasks`.

## Specs

- **S1 — PO decision D-C (2026-10-26), verbatim.** «si se suspende queda congelado. Si se cierra puede volver a abrirse,
  quedaria temporalmente solo lectura mientras no deba reactivarse. Solo gerencia y adminsitracion pueden suspender o
  cancelar.»
- **S2 — Who closes and reopens (user decision 2026-10-27).** «Gerencia y admin»: the four actions (suspend, cancel,
  close, reopen) plus reactivate are for ADMINISTRADOR and GERENCIA only (`canManageProjects`). COORDINADOR and
  COLABORADOR get 403, members or not.
- **S3 — Transitions (assumption, derived from S1).** One endpoint `POST /api/v1/projects/:id/estado` with
  `{ accion, motivo }`:
  - `SUSPENDER`: EN_EJECUCION → SUSPENDIDO
  - `REACTIVAR`: SUSPENDIDO → EN_EJECUCION
  - `CERRAR`: EN_EJECUCION → CERRADO
  - `REABRIR`: CERRADO → EN_EJECUCION
  - `CANCELAR`: BORRADOR, EN_EJECUCION or SUSPENDIDO → CANCELADO (terminal: nothing leaves CANCELADO)
  Any other pair answers 409 `INVALID_STATE` and writes nothing. Order: 404 → 403 → 400 (body) → 409 (estado, re-read
  under the row lock).
- **S4 — Motivo and audit (plan B7: «con motivo, auditoría»).** `motivo` is required (trimmed, 1–1000 chars) for every
  accion. The estado write and its audit go in ONE transaction: two `AuditoriaCambio` rows in one lote, `campo: "estado"`
  (`valor_anterior` → `valor_nuevo`) and `campo: "motivo"`, entidad `proyecto`. The project history shows both.
- **S5 — Frozen (from S1: «queda congelado», «solo lectura»).** In SUSPENDIDO, CERRADO and CANCELADO no project write
  is accepted (409 `INVALID_STATE`); reads stay. Today SUSPENDIDO still allows validating/rejecting expenses and
  writing documents, and some writes have no estado check (voids, members); all of them close. The estado endpoint
  itself is the only way out.
- **S6 — UI.** For ADMINISTRADOR/GERENCIA the ficha header offers the actions valid for the current estado; each asks for
  the motivo in a dialog and refreshes the ficha. Other roles see no action. The ficha shows the frozen/read-only estado.
- **S7 — Docs.** OpenAPI for the new endpoint, the permissions matrix (`odd/tasks/permisos-proyectos-por-rol.md`) and the
  test guide (`docs/guia-prueba-proyectos.md`).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S3, S4 | inline | done (RED→GREEN, 24 tests) | see git log (unit 1) |
| T2 | S5 | inline | pending | |
| T3 | S6 | inline | pending | |
| T4 | S7 | inline | pending | |

Route evidence: no Writer trigger (units depend on T1; no parallel work), so the parent writes inline. Risk: item 2
(permissions/guards) for T1 and T2 → independent verifier at the feature's end.

## Log

- **L1 (2026-10-27, user, verbatim):** «hola continua el desarrollo de los pendientes» → «empienza» (B7 after the small fixes).
- **L2 (2026-10-27):** Map: the only estado write today is baseline approve (BORRADOR → EN_EJECUCION,
  `src/lib/api/versiones.ts:188`). Gates are per family; SUSPENDIDO is still allowed by `gateGastoDecision`
  (`validacion-gastos.ts:74`) and `gateSoporteProyectoWrite` (`soportes.ts:178`); `gateEjecucionVoid`, `gateGastoGestion`
  and the members routes check no estado. `AuditoriaCambio` has no motivo column (expense void stores it in JSON).
- **L3 (2026-10-27, user):** close and reopen → «Gerencia y admin (Recomendado)».
