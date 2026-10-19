# S8 map — Baseline, modifications, versions (RF-05, RF-26..RF-29; REQ-VER-01..06)

Read-only recon on `feat/projects-v2` @ 38b7cd2. Everything below was checked against code, not the SDD.

## 1. Exists vs assumed

| Item | Reality (verified) |
|---|---|
| `VersionProyecto`, `SolicitudModificacion`, enums `TipoVersion/TipoModificacion/EstadoSolicitud`, table triggers | **Do NOT exist** (`rg` over schema/migrations/src: zero hits). Last migration `20261010130100_v2_notificaciones_proyecto`. Whole S8 is greenfield. |
| `Proyecto.estado` enum | `PLANIFICACION BORRADOR EN_EJECUCION SUSPENDIDO CERRADO CANCELADO` exist. **No route changes estado.** `PATCH /projects/:id` refuses `estado` (400) and any non-BORRADOR edit (409). Only `scripts/set-project-estado.ts` (local QA, audits via logChange) moves it. |
| `AccionAuditoria` APROBAR, SOLICITAR; `AUDIT_ENTIDADES_V2` has `version`, `solicitud`; labels in `project-display.ts` | Exist (no work). |
| Perms `canApproveBaseline` / `canApproveModification` (`permissions.ts:170-177`) | Exist, both = `canManageProjects` (ADM/GER). No `canRequestModification`; P12 = `canExecuteProject` (manager OR COORDINADOR member). |
| `precondicionesPresupuesto` (`ficha-financiera.ts:129`) | Exists: SUMA_DISTINTA_VALOR_TOTAL, PROGRAMACION_PENDIENTE, CONTROL_PROGRAMACION, RUBRO_SUSPENDIDO_CON_ASIGNADO, PERIODO_FUERA_DE_RANGO. Does NOT cover objectives/activities/deliverables/valor_total>0/fechas/beneficiarios_meta. |
| `lockProyectoBorrador` (`api/presupuesto.ts:83`) | Exists; locks `proyectos` row FOR UPDATE and 409s with the *edit-budget* copy and only if BORRADOR. Unusable as-is for approval (wrong message, wrong estado for modifications): add `lockProyecto(tx,id)` returning `{estado, valor_total, fecha_inicio, fecha_fin, beneficiarios_meta}`. |
| Row-lock coverage | Locked: budget PUT, programming PUT, S7 import (via `lockProyectoBorrador`), line row + gasto in `validarEnTransaccion`. **NOT locked**: objectives/activities/deliverables/indicators writers and project PATCH (`gateEstructuraWrite` reads estado outside the tx; SDD S2.1b residual (iii) names this). Approval racing a structure edit can snapshot a half-written structure. See risk R1. |
| `base=original` | `financial-sheet` already parses `base`: `original` -> 409 `BASE_ORIGINAL_MESSAGE` "La versión original aún no existe.", else 400 `BASE_INVALIDA_MESSAGE`; echoes `base:"vigente"`. `technical-status` **ignores `base` entirely** (always echoes "vigente"). UI selector `project-financiero.tsx:86-96` is hard-disabled. |
| `modificacion_bloquea_periodos_pasados` | Exists in `semaforo-v2.ts` (`PARAMETRO_KEYS`, default `{valor:true, confirmado:false}`), settings route and admin UI (`umbrales-section.tsx`). Read via `getSemaforoParametrosV2()` (`@/lib/settings`). |
| REQ-GAS-06 | Not implemented (S6 recorded it as S8.3b). `validarEnTransaccion` locks the *line* row then the gasto and compares `excederiaAsignado`. A is only editable in BORRADOR today. |
| SDD claim "same trigger function attached to versiones_proyecto and acceso_soportes" (§4.12) | **Wrong**: `acceso_soportes` has its OWN function `acceso_soportes_inmutable()` (migration `20261010120000`, comment says why). Follow that pattern: new `versiones_proyecto_inmutable()`. |
| `ApiErrorCode` has INVALID_STATE, OVERSPEND_BLOCKED; `apiError(msg,status,code,extra)` | Exist; `extra` supports `{precondiciones}` / `{reglas}` without new code. |
| P14 close/suspend/cancel; REQ-ORG-08 read-only CERRADO/CANCELADO | **No slice implements it** (SDD only lists P14 in the matrix). S8 state machine is only BORRADOR -> EN_EJECUCION. |
| Frontend | Ficha = one dialog (`project-ficha-dialog.tsx`) stacking sections: Team, Estructura, Presupuesto, Ejecucion, Financiero, Gastos, Historial. **No tabs component**; SDD's "Versiones tab" = a new `<ProjectVersiones>` section. Hooks in one file `src/hooks/projects.ts` (`projectQueryKeys`). |

## 2. Models and migration (`20261011120000_v2_versiones`, run via `npm run db:migrate:local`)

Storage: **JSON snapshot in `versiones_proyecto.snapshot`** (not normalized copies), `{schema:1,...}`, keyed by business codes (codes are stable after baseline because structure writers are BORRADOR-gated). `vigente` = live tables.

```prisma
enum TipoVersion { LINEA_BASE MODIFICACION }
enum TipoModificacion { TRASLADO ADICION REDUCCION REPROGRAMACION CRONOGRAMA ENTREGABLES }
enum EstadoSolicitud { PENDIENTE APROBADA RECHAZADA }
model VersionProyecto { id, proyecto_id, numero Int, tipo TipoVersion, solicitud_id String? @unique,
  aprobado_por_id String (no FK, like other audit pointers), aprobado_at DateTime @default(now()), snapshot Json,
  proyecto Proyecto @relation, solicitud SolicitudModificacion? ; @@unique([proyecto_id,numero]) @@index([proyecto_id]) @@map("versiones_proyecto") }
model SolicitudModificacion { id, proyecto_id, tipo, motivo, detalle Json, version_base_numero Int, estado @default(PENDIENTE),
  solicitado_por_id, solicitado_at, decidido_por_id?, decidido_at?, comentario_decision?; @@index([proyecto_id, estado]) @@map("solicitudes_modificacion") }
```
`Proyecto` gains `versiones VersionProyecto[]`, `solicitudes SolicitudModificacion[]`.

SQL in the migration (Prisma cannot express): 
- `versiones_proyecto_inmutable()` + `BEFORE UPDATE OR DELETE ... FOR EACH ROW` and `BEFORE TRUNCATE ... FOR EACH STATEMENT` triggers (copy `acceso_soportes` block; DROP TRIGGER IF EXISTS first).
- CHECK `versiones_proyecto_tipo_numero_ck` `(tipo='LINEA_BASE') = (numero = 0)`; CHECK `versiones_proyecto_solicitud_ck` `(tipo='MODIFICACION') = (solicitud_id IS NOT NULL)`; `numero >= 0`.
- `solicitudes_modificacion`: CHECK `rechazo_comentario_ck` (`estado <> 'RECHAZADA' OR length(trim(comentario_decision))>0`), CHECK `decision_ck` (`estado='PENDIENTE' OR (decidido_por_id IS NOT NULL AND decidido_at IS NOT NULL)`), CHECK `version_base_numero >= 0`, `jsonb_typeof(detalle)='array'`. Partial unique index is NOT wanted (several PENDIENTE requests allowed; stale check handles conflicts). Optional trigger: no DELETE on solicitudes.
- FK `proyecto_id` RESTRICT. Reset-demo only hard-deletes BORRADOR projects, which can never have versions/requests: no change needed.

## 3. API, state machine, messages (order everywhere: 404 -> 403 -> 409 -> 400)

State machine: `BORRADOR --E-25--> EN_EJECUCION` (v0 written in the same tx). Modifications live only in EN_EJECUCION; solicitud `PENDIENTE -> APROBADA|RECHAZADA` (terminal). SUSPENDIDO/CERRADO/CANCELADO: out of S8 (no SDD task; modification gate = estado EN_EJECUCION so they are rejected 409).

| Route | Who | Behavior |
|---|---|---|
| POST `/projects/:id/baseline/approve` (E-25) | `canApproveBaseline` | 409 INVALID_STATE "El proyecto ya tiene línea base aprobada." if EN_EJECUCION; "Solo se puede aprobar la línea base de un proyecto en Borrador." otherwise. In ONE tx: `lockProyecto`, re-read structure/budget under the lock, `precondicionesLineaBase` -> 409 INVALID_STATE "La línea base no se puede aprobar: hay precondiciones sin cumplir." + `{precondiciones:[{codigo,mensaje,rubroId?,...}]}` (all failures, not first). Else insert v0 (`LINEA_BASE`, solicitud null), `estado=EN_EJECUCION`, `logChanges` (lote): APROBAR `version` + EDITAR `proyecto.estado`. 201 `{version:{id,numero:0,aprobado_at}, proyecto:{id,estado}}`. |
| GET `/projects/:id/modifications` | `canReadProject` | list newest first, with state, requester/approver ids. |
| POST `/projects/:id/modifications` (E-26) | `canExecuteProject` (ADM/GER, or COORDINADOR member; A-01) | needs EN_EJECUCION **and** a v0 row (else 409 "El proyecto no tiene línea base aprobada." — covers `set-project-estado` QA projects). Zod strict `{tipo, motivo (trim, 1..1000), detalle[]}`; elements allowed per tipo (400 "El elemento «x» no se permite en una modificación de tipo y."); `antes` must equal current live value (400 "El valor actual de «clave» cambió; recarga e inténtalo de nuevo."); RF-28 rules dry-run -> 400 `{reglas}`. Stores `version_base_numero = max(numero)`. Audit SOLICITAR `solicitud`. 201 `{solicitud}`. |
| POST `.../modifications/:mid/approve` | `canApproveModification` | 404 solicitud of that project; 409 "La solicitud ya fue decidida."; tx below. 200 `{version:{numero:N}, solicitud}`. |
| POST `.../modifications/:mid/reject` `{comentario}` | `canApproveModification` | comentario required (400 "El comentario es obligatorio al rechazar."); changes no domain data; audit RECHAZAR `solicitud`. |
| GET `/versions`, `/versions/:n`, `/versions/compare?from=0&to=vigente` (E-27) | `canReadProject` | list `{numero,tipo,aprobado_at,aprobado_por_id/nombre,motivo(from solicitud)}`; snapshot; `{diferencias}`. `compare` must be declared as its own static route folder (`versions/compare/route.ts`) so it is not shadowed by `[n]`. `to=vigente` builds a snapshot from live tables. 404 "La versión no existe."; 400 "Versión no válida." for non-integer/unknown token. |

Approval tx (E-26): `lockProyecto` (EN_EJECUCION else 409) -> `max(numero) = version_base_numero` else 409 "La solicitud se basa en una versión anterior; vuelve a crearla." -> `SELECT ... FROM lineas_presupuestales WHERE proyecto_id=? ORDER BY id FOR UPDATE` -> E per rubro = SUM VALIDADO under those locks -> `validarModificacion` (400 `{reglas}`) -> apply by diff (update/create line, upsert/delete programming cells with the S5 diff pattern, update activities via `resolvePeso`, entregables, indicadores, proyecto valor_total/fechas) -> re-read live -> `buildSnapshot` -> insert v(N) -> solicitud APROBADA -> `logChanges` one `lote_id`: APROBAR `solicitud`, APROBAR `version`, one EDITAR per changed field. Lock order project -> lines(id order); `validarEnTransaccion` takes only line -> gasto, so no cycle. Throw `RespuestaAbortada` for the 4xx exits (rollback); no overspend-style "commit then 409" needed here.

## 4. Pure libs (framework/DB-free, like `ficha-financiera.ts`)

`src/lib/proyectos/versiones.ts`
```ts
export type SnapshotV1 = { schema: 1;
  proyecto: { valor_total: string; fecha_inicio: string; fecha_fin: string; beneficiarios_meta: number | null };
  presupuesto: { rubro_codigo: string; rubro_nombre: string; asignado: string }[];            // sorted by rubro_codigo
  programacion: { rubro_codigo: string; periodo: string; valor: string }[];                    // sorted rubro_codigo, periodo
  actividades: { codigo; objetivo_codigo; nombre; semana_inicio: number; semana_fin: number; peso: string; peso_manual: boolean }[];
  entregables: { codigo; actividad_codigo; descripcion; cantidad_meta: string; unidad: string }[];
  indicadores: { codigo; objetivo_codigo; nombre; meta: string; unidad; linea_base: string | null }[] }
export type LiveProyecto = SnapshotV1 minus `schema` (plain strings/numbers; the loader `loadLiveProyecto(tx,id)` in `src/lib/api/versiones.ts` does Decimal->string, drops soft-deleted rows, drops A=0 lines with no programming)
export function buildSnapshot(live: LiveProyecto): SnapshotV1                // deterministic order, money normalized via toCents/fromCents; throws if A>0 with null rubro codigo
export type Diferencia = { elemento: "proyecto"|"presupuesto"|"programacion"|"actividad"|"entregable"|"indicador"; clave: string; campo: string; desde: string|null; hasta: string|null }
export function diffSnapshots(a: SnapshotV1, b: SnapshotV1): Diferencia[]   // ordered (elemento, clave, campo); add/remove -> campo "existencia"
export type DetalleItem = { elemento; clave: string; campo?: string; antes: string; despues: string }
export type ErrorRegla = { codigo: "TRASLADO_CAMBIA_TOTAL"|"ADICION_NO_AUMENTA"|"REDUCCION_NO_DISMINUYE"|"A_MENOR_QUE_EJECUTADO"|"PERIODO_PASADO"|"PROGRAMACION_DESCUADRADA"|"PERIODO_FUERA_DE_RANGO"|"ELEMENTO_NO_PERMITIDO"|"ANTES_DESACTUALIZADO"|"SEMANAS_INVALIDAS"; mensaje: string; clave?: string }
export function applyModificacion(live: LiveProyecto, s: { tipo: TipoModificacion; detalle: DetalleItem[] }): LiveProyecto
export function validarModificacion(live: LiveProyecto, s: {tipo; detalle}, ejecutado: ReadonlyMap<string /*rubro_codigo*/, Cents>, periodoActual: Periodo, params: { bloqueaPeriodosPasados: boolean }): ErrorRegla[]
```
`src/lib/proyectos/linea-base.ts`: `precondicionesLineaBase(input): PrecondicionFalla[]` — composes `precondicionesPresupuesto` and adds codes (extend `PrecondicionCodigo`): `SIN_VALOR_TOTAL` (null/<=0), `SIN_FECHAS`, `SIN_OBJETIVOS`, `OBJETIVO_SIN_ACTIVIDADES`, `ACTIVIDAD_SIN_ENTREGABLES`, `META_BENEFICIARIOS_INVALIDA` (null or <=0). Messages Spanish, e.g. "El objetivo OE1 no tiene actividades.".

RF-28 rules (`validarModificacion` validates `applyModificacion(live)`): all types: `antes` = live value; no A below E per rubro (REQ-GAS-06, "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado (…)"); post-state must pass `precondicionesPresupuesto` (Σ P = A per rubro, in range) for TRASLADO/ADICION/REDUCCION; TRASLADO Σ deltaA = 0 (valor_total unchanged); ADICION every deltaA >= 0 and Σ > 0, REDUCCION every <= 0 and Σ < 0, `valor_total' = valor_total + Σ deltas` (derived, not in detalle); programming cells with `periodo < periodoActual` cannot change when `bloqueaPeriodosPasados` (all tipos touching programacion, incl. the programming adjustment that accompanies A changes); CRONOGRAMA: 1 <= inicio <= fin <= duration weeks of the (possibly new) dates, programming periods stay in range.

Golden fixtures: `src/lib/proyectos/__fixtures__/versiones.ts` (a LiveProyecto modelled on the S7 F-X1 import plan: R01/R12 lines, 4 months, 1/4/7 structure with weights 1/1/1/4; the sheet in `__fixtures__` already has this shape). Cases: (a) baseline snapshot byte-stable (`JSON.stringify` equals a frozen literal — proves ordering); (b) TRASLADO R12 -1.000.000 / R13 +1.000.000 -> diff has 2 presupuesto rows + the matching programacion rows, valor_total unchanged; (c) ADICION +5.000.000 -> valor_total +5.000.000; (d) REDUCCION below E (`ejecutado` R12=23.500.000, A 24.000.000 -> 23.000.000) -> `A_MENOR_QUE_EJECUTADO`; (e) past-period cell change with param true -> `PERIODO_PASADO`, with false -> ok; (f) non-manual activity weeks change -> peso recomputed (`resolvePeso`), manual peso kept; (g) identical snapshots -> `[]`.

## 5. base=original / vigente and REQ-GAS-06

- Both endpoints validate `base ∈ {vigente, original}` (400 `BASE_INVALIDA_MESSAGE` for others; technical-status must add this validation) and echo the resolved `base`.
- `financial-sheet` base=original: read v0 snapshot (`numero=0`; 409 `BASE_ORIGINAL_MESSAGE` if none) and build `FichaRubroInput` from `snapshot.presupuesto/programacion` (A and P from v0) with E from live `loadGastosValidados` mapped by rubro. v0 rubros missing in vigente (or vice-versa) get zero rows. Same `computeFicha`; `alerta_retraso` unchanged (uses technical vigente color — document).
- `technical-status` base=original: refactor `loadTecnicoStatus` (`api/tecnico.ts`) to accept an optional `estructura` override; build `ActividadTecnicaInput[]` from `snapshot.actividades/entregables` (weeks, `peso` string, `cantidad_meta`), map live avances to entregable by **codigo** (live entregables id->codigo; codes are frozen after baseline). Weights: use snapshot `peso`/`peso_manual` with `pesoEfectivo` semantics. Dates still derive from `fecha_inicio` of **v0**.
- UI: enable the Base select in `project-financiero.tsx` once v0 exists (project estado != BORRADOR); `useProjectFinancialSheet(id, corte, base)` and `useProjectTechnicalStatus(id, base)` (add `base` to `projectQueryKeys`).
- REQ-GAS-06 is enforced in two places: `validarModificacion` (pure, takes `ejecutado`) AND inside the approval tx with E computed under the line locks (so a concurrent validation cannot slip between check and apply). Live-DB test: validate a gasto in a second tx while approval waits on the line lock. Unblock path (REQ-GAS-05): after an approved TRASLADO/ADICION raising A, re-validating the blocked gasto succeeds (`validarEnTransaccion` already clears `alerta_sobregasto` on success).

## 6. UI (ficha dialog sections; API decides, components never recompute)

- **Aprobar línea base** button in the Resumen header area, visible iff `canManageProjects(rol)` && estado BORRADOR (client gate = comfort; API decides). Dialog: lists `precondiciones` returned by the 409 inline (same pattern as `import-dialog`), confirm text "Al aprobar, la estructura y el presupuesto quedan congelados (versión 0) y el proyecto pasa a En ejecución." Hook `useApproveBaseline` invalidates project, budget, structure, financialSheet, technicalStatus, versions keys; no toast on 409.
- **Solicitar modificación**: new `project-modificaciones.tsx` (list + form), visible iff estado EN_EJECUCION and (manager || COORDINADOR member). Form: tipo select -> element rows (rubro/periodo/actividad/entregable/indicador, antes prefilled read-only from live, despues input), motivo textarea. Approve/Reject buttons only for ADM/GER on PENDIENTE; reject asks comentario. COORDINADOR sees the list read-only + own requests. VISUALIZADOR with `puede_ver_tablero_gerencial` (read axis) may see versions list/compare (aggregates only; no supports involved).
- **Versiones**: `project-versiones.tsx` section: table (v, tipo chip, fecha, aprobador, motivo) + comparison view (selects from/to defaulting 0 -> vigente, table of `Diferencia` grouped by elemento, money formatted with `formatCOP`). Hidden/empty state "La línea base aún no está aprobada." in BORRADOR.
- Estado chip already renders EN_EJECUCION via `project-display.ts`. `scripts/set-project-estado.ts`: print a warning when moving to EN_EJECUCION a project with no v0 (it would 409 modifications and base=original); keep the script.

## 7. Work units (TDD, strict; each <= ~400 lines, one commit, tests+docs inside)

1. **S8.1a schema + migration + invariants** (~260). RED (live DB, `prisma/versiones.invariant.test.ts`, `runAndRollback`/`captureError` harness from `gastos.invariant.test.ts`): `versiones_proyecto rejects UPDATE`, `...rejects DELETE`, `...rejects TRUNCATE`, `rejects numero 0 with tipo MODIFICACION` (tipo_numero_ck), `MODIFICACION requires solicitud_id`, `unique (proyecto_id,numero)`, `rejects RECHAZADA without comentario_decision`, `rejects a decided request without decidido_por_id`. Also an adoption-style test that the migration SQL is idempotent only if the repo pattern requires (copy `rubros-migration.invariant.test.ts` if used for new tables: not required, tables are new).
2. **S8.2a pure libs** (~380): `versiones.ts` (`buildSnapshot`, `diffSnapshots`, types), `linea-base.ts`, fixtures. RED: `buildSnapshot contains exactly the est §7.1 elements and no execution data`, ordering/frozen JSON, `diffSnapshots lists changed budget, programming, weeks, weights, quantities and add/remove`, `identical snapshots -> []`, one `it` per precondition code of REQ-VER-01 incl. "lists every failed precondition at once".
3. **S8.2b E-25 route + loader + atomic tx + dialog** (~400): `lockProyecto`, `loadLiveProyecto`, route + test (403 COORDINADOR, 409 estado, 409 precondiciones, 201), OpenAPI `paths/project-baseline.ts` + document test, `useApproveBaseline`, approval dialog/button + ficha wiring. RED live-DB (`prisma/linea-base.invariant.test.ts`): `creates v0, sets EN_EJECUCION and audits APROBAR in one tx` (rollback on injected failure after the version insert leaves BORRADOR and no v0), `second approval returns 409`, `post-approval structure/budget/PATCH writes return 409`, `concurrent approval x2 yields exactly one v0`.
4. **S8.3a RF-28 libs + request route + form** (~400): `applyModificacion`, `validarModificacion`, golden cases (b)-(f), POST/GET modifications, request form + hook. RED: `traslado keeps valor_total`, `adición/reducción change valor_total by Σ deltas`, `rejects leaving A below validated E`, `rejects reprogramming elapsed periods when the rule is on (and allows when off)`, `rejects elements not allowed for the tipo`, `member COORDINADOR can request, non-member and VISUALIZADOR cannot`, `request needs v0`, `audits SOLICITAR`.
5. **S8.3b approve/reject + apply tx + UI actions** (~400): routes, `aplicarModificacion(tx,...)` in `api/versiones.ts`, approve/reject buttons. RED live-DB: `approval creates version N and applies changes atomically`, `snapshot after apply equals buildSnapshot(applyModificacion(live))` (property check), `stale version_base_numero -> 409`, `already decided -> 409`, `rejection requires comentario and changes no data`, `a validation racing the approval cannot leave A below E`, `unblocks a previously OVERSPEND_BLOCKED gasto`, audit lote contains one EDITAR per changed field.
6. **S8.4 versions API + base=original + versions section** (~400): E-27 routes, `base` handling in both endpoints (+ `tecnico.ts` override), enable the selector, `project-versiones.tsx` with comparison. RED: `lists versions with date, requester, approver and motivo`, `compares v0 vs vigente`, `compare static route not shadowed by [n]`, `financial-sheet base=original uses v0 A and P with live E`, `technical-status base=original uses v0 weeks and weights`, `technical-status rejects an unknown base with 400`, component tests for the dialog/section role visibility.

## 8. Risks, SDD discrepancies, decisions (defaults so work proceeds unattended)

R1 **Structure writers do not lock the project row** (gate outside tx). Default: in U3, extract `lockProyectoBorrador` into the objectives/activities/deliverables/indicators writers' transactions and project PATCH (about 8 routes, +1 line each + 1 test per route family), so approval's FOR UPDATE serializes against them. If that is too wide, minimum is a live-DB test proving approval + budget/programming/import serialize, and document structure writers as a residual. Recommend doing it (cheap, closes the SDD residual).
R2 SDD §4.12 trigger sharing is wrong (see §1). R3 SDD E-25 says `{version:{numero:0}, proyecto}`; we return 201 (creates a resource). R4 REQ-VER-04 "A request created against version k..." works with `max(numero)`; requests need v0, so `set-project-estado` EN_EJECUCION projects without v0 are unusable for modifications (warn in script; QA should approve the baseline through E-25 now). R5 P14 close/suspend/cancel has no task: not in S8 (flag to user, suggest S9/S10 follow-up). R6 deferred REQ-GAS-06 closes in U5. R7 `compare` route ordering vs `[n]`. R8 Performance: snapshot is built from ~tens of rows; no concern. R9 `RespuestaAbortada` is exported from `api/presupuesto.ts`; reuse, do not duplicate.

Defaults (product decisions, all reversible):
- D1 A-01 stays as written: member COORDINADOR may REQUEST, only ADM/GER approve/reject (matrix P12/P13).
- D2 `valor_total'` is derived (Σ A) for ADICION/REDUCCION; `detalle` never carries it. ADICION deltas >= 0, REDUCCION <= 0, TRASLADO Σ = 0.
- D3 Past-period lock applies to programacion cells only (not CRONOGRAMA weeks) and honors `modificacion_bloquea_periodos_pasados` (default true, "no confirmado"); current month is editable (`periodo < periodoActual` blocked), `periodoActual = periodOf(todayInBogota())`.
- D4 Multiple PENDIENTE requests may coexist; the stale check (`version_base_numero`) is the only arbiter. No expiration.
- D5 Baseline response 201; modification approval 200. Rejection allowed only for PENDIENTE.
- D6 Snapshot omits A=0 lines with no programming; keys by rubro codigo; stores `peso_manual` so a restore is faithful.
- D7 CRONOGRAMA cannot add/remove activities, deliverables or indicators (structure stays frozen; the SDD list of types has no such type).
- D8 Cierre/suspensión is out of scope; modification gate = estado EN_EJECUCION only.
- D9 Notifications for requests (to GERENCIA) are NOT in S8 (SDD defines only SOBREGASTO_RUBRO); list view is the inbox. Revisit with the PO.
- D10 Messages in Spanish as quoted above; code/comments English.

Commands for the writer: `TZ=America/Bogota npx vitest run <path>`, `npx tsc --noEmit`, `npm run db:migrate:local` (never plain `npx prisma`; `.env` is the remote Supabase).
