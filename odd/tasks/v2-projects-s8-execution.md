# Muttu Hub v2 — S8 Baseline, modifications and versions (RF-05, RF-26..RF-29; REQ-VER-01..06)

Parent plan: `odd/tasks/v2-projects-sdd.md`, ledger `odd/tasks/v2-projects-execution.md`, verified mapping
`odd/tasks/v2-projects-s8-map.md` (read it: schema, route table, pure-lib signatures, RF-28 rules, per-unit RED detail).
Branch: `feat/projects-v2`.

## Objective

An ADM/GER user approves the baseline (E-25) of a BORRADOR project: the structure and budget are frozen as version 0
and the project becomes EN_EJECUCION in one atomic, audited transaction. Afterwards approved modifications (E-26)
create versions 1..N, and any two versions can be compared (E-27) and read as `base=original`.

## Decisions (defaults from the map section 8; all reversible)

- D1 A-01: a member COORDINADOR may REQUEST a modification; only ADM/GER approve/reject.
- D2 `valor_total'` is derived (Σ A) for ADICION/REDUCCION; `detalle` never carries it. ADICION deltas >= 0,
  REDUCCION <= 0, TRASLADO Σ = 0.
- D3 Past-period lock applies to programming cells only, honors `modificacion_bloquea_periodos_pasados` (default true);
  `periodo < periodoActual` is blocked, the current month is editable.
- D4 Several PENDIENTE requests may coexist; the stale check (`version_base_numero`) is the only arbiter.
- D5 Baseline response 201; modification approval 200; rejection only for PENDIENTE.
- D6 Snapshot omits A=0 lines with no programming, keys by rubro codigo, stores `peso_manual`.
- D7 CRONOGRAMA cannot add/remove activities, deliverables or indicators.
- D8 Close/suspend/cancel (P14) is out of scope; the modification gate is estado EN_EJECUCION only.
- D9 No notifications for modification requests in S8.
- D10 Messages in Spanish as quoted in the map; code and comments in English.
- D11 Takeover boundary unchanged (`1432907`); native review is unavailable in this runtime (see S7 Constraints):
  not run, not disabled, no PASS invented. Independent verification substitutes.

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` (`npm run db:migrate:local`, never plain
  `npx prisma`; `.env` is the remote Supabase).
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Per-unit gates: focused vitest, `tsc`, eslint on touched files; one commit per unit; full suite at the end of each round.
- ~400 authored lines per unit is a planning heuristic only.

## Tasks

Route: delegated writer per round (round 1: U1-U3, round 2: U4-U6).

- [ ] **U1** (S8.1a) Schema + migration `20261011120000_v2_versiones` + `prisma/versiones.invariant.test.ts`:
  immutability trigger `versiones_proyecto_inmutable()` (own function), CHECKs, unique (proyecto_id, numero).
- [ ] **U2** (S8.2a) Pure libs `src/lib/proyectos/versiones.ts` (`buildSnapshot`, `diffSnapshots`, types),
  `linea-base.ts` (`precondicionesLineaBase`), golden fixtures.
- [ ] **U3** (S8.2b) E-25 route + `lockProyecto` + `loadLiveProyecto` + atomic tx + project row lock on the structure
  writers (R1) + OpenAPI + `set-project-estado.ts` warning. UI (dialog, `useApproveBaseline`) is deferred to round 2
  as U3b if it does not fit; see Progress.
- [ ] **U4** (S8.3a) RF-28 libs (`applyModificacion`, `validarModificacion`) + request/list routes + form.
- [ ] **U5** (S8.3b) Approve/reject routes + `aplicarModificacion` tx + UI actions (closes REQ-GAS-06).
- [ ] **U6** (S8.4) Versions API (E-27) + `base=original` in financial-sheet and technical-status + versions section.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; eslint clean on touched files; full vitest
  green under `TZ=America/Bogota` (known load-flakes recorded honestly, re-run alone and against base).
- Baseline approval is the only API way to reach EN_EJECUCION, atomic, audited, v0 frozen and immutable in the DB.

## Progress

- 2026-10-08: document created from the map (committed together). Round 1 (U1-U3) starting.

## Next step

Round 1: U1, then U2, then U3, one commit each.
