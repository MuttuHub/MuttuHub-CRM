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

- [x] **U1** (S8.1a) Schema + migration `20261011120000_v2_versiones` + `prisma/versiones.invariant.test.ts`:
  immutability trigger `versiones_proyecto_inmutable()` (own function), CHECKs, unique (proyecto_id, numero). (b66dd75)
- [x] **U2** (S8.2a) Pure libs `src/lib/proyectos/versiones.ts` (`buildSnapshot`, `diffSnapshots`, types),
  `linea-base.ts` (`precondicionesLineaBase`), fixtures `__fixtures__/versiones.ts` (`liveF_V1`, `liveMini`). (07e6db0)
- [x] **U3** (S8.2b) E-25 route + `lockProyecto` + `loadLiveProyecto` + atomic tx + project row lock on the structure
  writers (R1) + OpenAPI + `set-project-estado.ts` warning + approval dialog and `useApproveBaseline`.
  R1 locks (d1f7bcf), route/writer/OpenAPI/script (f42588c), UI (b30c6e1).
- [x] **U4** (S8.3) Modification requests, approval and rejection (round 2 re-scoped the map's U4+U5 into one unit):
  pure RF-28 libs `proyectos/modificaciones.ts` (`applyModificacion`, `validarModificacion`) (87c742f); request/list
  routes + OpenAPI (4b52ed4); approve/reject routes + atomic `aplicarModificacion` writer with REQ-GAS-06 under the line
  locks + live-DB invariants + OpenAPI (ef26992).
- [x] **U5** (S8.4a) E-27 versions list/detail/compare routes (static `compare` folder), `base=original|vigente` real in
  financial-sheet and technical-status (`tecnico.ts` structure override from the v0 snapshot). (6a91733)
- [x] **U6** (S8.4b) UI: hooks and the Base selector in the financial and technical sections (4fa441c); versions list +
  v0 vs vigente comparison section (2e7ed11); request form, pending queue with Aprobar/Rechazar, ficha mounting and the
  project-list / ficha-dialog stubs (5a5d30d). Race-test hardening (test commit after).

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; eslint clean on touched files; full vitest
  green under `TZ=America/Bogota` (known load-flakes recorded honestly, re-run alone and against base).
- Baseline approval is the only API way to reach EN_EJECUCION, atomic, audited, v0 frozen and immutable in the DB.

## Progress

- 2026-10-08: document created from the map (committed together, 903995a). Round 1 (U1-U3) starting.

- 2026-10-08 (round 1, U1-U3, one bounded writer, local DB only via `node --env-file=.env.local`):
  - U1 (b66dd75). RED: 14/14 failing (tables absent). Migration applied with `migrate deploy` (first attempt failed: the
    `migrate diff` banner leaked into the SQL; removed, `migrate resolve --rolled-back`, redeployed); `generate` ran;
    `migrate diff --from-config-datasource --to-schema` = "No difference detected". GREEN 14/14 (trigger update/delete/
    truncate, `tipo_numero_ck`, `solicitud_ck`, unique, RECHAZADA comment, decision, version_base, detalle array).
  - U2 (07e6db0). RED: missing modules. GREEN: 11 + 12 tests. `PrecondicionCodigo` gained the six REQ-VER-01 codes.
    Decision: `LiveProyecto` keeps `rubro_codigo` nullable and `buildSnapshot` throws on a coded-less funded line;
    `precondicionesLineaBase` skips PERIODO_FUERA_DE_RANGO when the dates are invalid (SIN_FECHAS already says it).
  - R1 (d1f7bcf). RED: 26 new lock tests failing (13 routes x 2: locks FOR UPDATE before writing; 409 and no write when
    estado changed). GREEN: `lockProyectoBorrador(tx, id, stateMessage)` first statement of the 13 structure/PATCH
    transactions. `RespuestaAbortada` moved to `api/errors.ts` (re-exported from `presupuesto.ts`) and answered by
    `withApiErrorHandling`, so no route needed its own catch.
  - U3 (f42588c). RED: route (7) and invariant (missing modules); document + script tests failing. GREEN: route 7,
    live-DB `prisma/linea-base.invariant.test.ts` 7 (v0 + estado + audit lote in one tx; rollback via SAVEPOINT with an
    injected failure after the version insert; second approval 409; incomplete project lists every precondition and
    writes nothing; writers closed after approval; two-connection lock tests), document 15, script 7. Sabotage check:
    removing `FOR UPDATE` from `lockProyecto` turned the two-connection test RED, restored GREEN.
  - U3 UI (b30c6e1). RED: component missing / ficha test failing. GREEN: `baseline-approval.test.tsx` 7 + ficha 18.
    Button only for `canApproveBaseline` on BORRADOR; the 409 `precondiciones` list renders inline, no toast.
  - Gates: `tsc --noEmit` clean; eslint clean on touched files; **full suite 251 files / 2572 tests green** under
    `TZ=America/Bogota`. (One earlier run showed `plantilla-import.test.ts` zip-bomb failing under load; it passed alone
    both with and without the round-1 changes: a load flake.)
  - Deviations: (1) the "concurrent approval x2 yields exactly one v0" live test is NOT done as written: a committed
    approval could never be cleaned (`versiones_proyecto` and `auditoria_cambios` are append-only). Replaced by the
    serial second-approval 409 plus two-connection tests where an uncommitted approval (or `lockProyecto` alone) makes a
    structure writer wait and the writer proceeds after rollback (the fixture is a committed BORRADOR project deleted in
    `finally`); the unique `(proyecto_id, numero)` stays the DB backstop. (2) `lockProyecto` filters `deleted_at IS NULL`.
    (3) The baseline route returns `201`; the writer takes an optional `loteId`.
  - Native review: unavailable in this runtime (see D11); not run, not disabled. Independent verifier pending.

- 2026-10-09 (round 2, U4-U6, one bounded writer, local DB only):
  - U4a (87c742f). RED: module missing. GREEN: 19 pure tests (golden TRASLADO / ADICION / REDUCCION, REQ-GAS-06,
    past-period lock on/off, weeks, dates, allowed elements, stale `antes`, add-a-rubro, manual weight kept).
    New codes beyond the map: `ELEMENTO_INEXISTENTE`, `FECHAS_INVALIDAS`, `VALOR_INVALIDO`, `DETALLE_DUPLICADO`,
    `DETALLE_VACIO`. The libs live in `proyectos/modificaciones.ts` (not `versiones.ts`, which stays the snapshot model).
  - U4b (4b52ed4). RED: route module missing (11 tests). GREEN 11 route tests + 5 helper tests + OpenAPI. The helper test
    and the OpenAPI registration were written together with the code (no separate RED run).
  - U4c (ef26992). RED (observed): live-DB invariants 9/9 failing (`aplicarModificacion is not a function`). GREEN 9/9:
    version N + changes + audit lote in one tx; snapshot equals `buildSnapshot(applyModificacion(live))` for ADICION
    (new rubro), CRONOGRAMA, ENTREGABLES; stale base 409; decided 409; reject records the comment and changes no data;
    A below validated E -> 400 `reglas` and nothing written; overspend-blocked gasto validates after an ADICION;
    SAVEPOINT rollback after the version insert; two-connection test (an approval that has already read E holds the line
    locks and a validation waits). Sabotage: removing the explicit line `FOR UPDATE` turned the race test RED, restored
    GREEN (the pause is injected right after the E read, since the later line UPDATEs would lock anyway). Approve/reject
    route tests (13) were observed RED by removing the route files. Lock order: project, then lines by id.
    `aplicarModificacion` lives in `api/modificaciones.ts` (not `api/versiones.ts`) to avoid an import cycle.
  - U5 (6a91733). RED: 3 new route test files (module missing) and 5 failing tests in the ficha routes. GREEN: versions 10,
    financial-sheet base=original 3 (+1 changed), technical-status base 4. `resolverBase` + `loadSnapshot*` in
    `api/versiones.ts`; the original uses the v0 dates for the corte periods and the weeks; the delay alert still reads the
    vigente technical color (documented in the route header).
  - U6 (4fa441c, 2e7ed11, 5a5d30d). RED each time (module/hook missing). GREEN: hooks 6, ficha selectors (financiero +3,
    semaforo +2, ejecucion +1), versions section 5, form 9 + builder 6, queue 12, ficha-dialog +2, project-list +1.
    The modification matrix of allowed fields is exported once (`CAMPOS_PERMITIDOS`) and reused by the form builder.
  - Gates: `tsc --noEmit` clean; eslint clean on touched files; **full suite 265 files / 2693 tests green** under
    `TZ=America/Bogota` (no flake in this run).
  - Deviations: (1) U4/U5 of the map were merged into one unit (round 2 scope); (2) libs/writer file locations as above;
    (3) the first race-test run, failing for a missing function, left a committed fixture (1 project, 2 users, 3 rubros
    marked `sdd-invariant-modificaciones`) because `await listo` hung; it was deleted by hand and the test now races
    `listo` against the approving transaction so a failure cannot hang; (4) the request form offers only rubros with a
    code and no way to add activities or deliverables (D7); (5) the commits of U4c and 5a5d30d exceed ~400 lines, mostly
    tests (advisory only).
  - Native review: unavailable in this runtime (D11); not run, not disabled. Independent verifier pending.

## Next step

Independent verification of S8 (no native review available): read the three round-2 diffs against REQ-VER-02..06 and
RF-26..RF-29, re-run `TZ=America/Bogota npx vitest run` and the three live-DB invariant files, and confirm the manual QA
path (approve a baseline, request a traslado as a member COORDINADOR, approve it as GERENCIA, compare v0 vs vigente, read
the ficha with `base=original`). Open items for the PO: D9 (notifications for requests), P14 close/suspend/cancel (no
slice owns it), the unconfirmed `modificacion_bloquea_periodos_pasados` parameter. Then S8 can be closed in
`odd/tasks/v2-projects-execution.md`.
