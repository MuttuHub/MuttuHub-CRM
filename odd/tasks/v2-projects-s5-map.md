# S5 mapping — Budget, programming, financial ficha (RF-18, RF-19, RF-23, RF-24)

Verified read-only against code at `80647ae` (2026-10-08). SDD refs: §3.7 BUD, §3.8 FIN, §4.2, §4.8 (E-16/17/18), §4.9, §5.6.

## 1. Exists vs assumed

Exists (verified): `Rubro` model + R01..R15 seeded (`RUBROS_V2`, `prisma/seed.ts`), `PATCH/DELETE /rubros/[id]` (admin; DELETE is
already a hard 409, the SDD's "today soft-deletes" is stale); `Proyecto.valor_total`, `diferencia_valor_oportunidad`,
`programacion_pendiente` (stored bool, written nowhere, PATCH forbids it); `money.ts` (`toCents/fromCents/sumCents/percentTenths/
formatPercent/withinTolerance/toleranceThreshold/formatCOP`, bigint cents, half-up); `weeks.ts` (`Periodo`, `periodOf`,
`projectPeriods`, `todayInBogota`); `semaforo-v2.ts` (`ParametrosV2` = `{valor, confirmado}` per key; `tolerancia` 10, `retraso` 70,
numbers in percent; `colorTecnicoV2`, `ColorSemaforo`); `getSemaforoParametrosV2()` + admin route `settings/semaforo-v2` (S1.4 DONE,
tolerancia/retraso editable); `AUDIT_ENTIDADES_V2` already has `presupuesto`, `programacion`, `gasto`; `logChange(s)/diffFields`;
gates `gateEstructuraWrite/Read`, `gateEjecucionRead` (404->403->409->400); `canViewProjectV2`, `canManageProjects`;
`scripts/migrate-v2/s1-rubros-report.ts` (already queries `lineas_presupuestales lp JOIN rubros r ON r.id = lp.rubro_id`, cols
`proyecto_id`, `rubro_id`; prints zero rows while the table is absent); invariant-test pattern `prisma/avances.invariant.test.ts`.

ABSENT although the SDD/S4 docs imply it: `LineaPresupuestal`, `ProgramacionPeriodo`, any budget/programming/financial-sheet route,
`ficha-financiera.ts`, `colorFinancieroV2`, `alertaRetraso`, `__fixtures__/financiero.ts`, **`Gasto` model/table (S6)** so E has no
source in S5, any budget UI, a `VISUALIZADOR` role (VIS = flag `puede_ver_tablero_gerencial`, pinned `false` in
`projects.ts` until S9.2), base `original` (no versions until S8). `s5-presupuesto.ts` seeding script is NOT needed (nothing to migrate,
greenfield; see GET below). Money lint: none (no eslint rule on float money); convention is by construction (bigint cents in libs,
`Decimal(15,2)` in DB, strings on the wire). **tsconfig target ES2017: no bigint literals (`0n`); use `BigInt(...)` constants.**
Existing routes accept money as JSON `number` (PATCH valor_total, `cantidadNoNegativaField`, `toDecimal2`); new routes should accept
decimal string OR number but convert via `String()` + regex + `toCents` and never do arithmetic on the float.

## 2. Models (one adoptive idempotent migration `20261009120000_v2_presupuesto`, style of `..._v2_entregables_indicadores`)

v1 DDL (git `6e4c6c8`) had `lineas_presupuestales(id, proyecto_id, rubro_id, monto_proyectado_cop NUMERIC(15,2), created_at,
updated_at, deleted_at)` + unique `(proyecto_id, rubro_id)` + unique `(id, proyecto_id)`; prod may still carry v1 tables (rubros did) so use
`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` + `DO $$ ... duplicate_object` blocks.
```
LineaPresupuestal @@map("lineas_presupuestales"): id uuid, proyecto_id, rubro_id, monto_proyectado_cop Decimal(15,2) (A), created_at,
  updated_at. FK proyecto RESTRICT; FK rubro_id -> rubros(id) RESTRICT. @@unique([proyecto_id, rubro_id]) (no duplicates, REQ-BUD-01),
  @@unique([id, proyecto_id]) (FK target for S6 gastos + programacion), @@index([proyecto_id]).
  CHECK lineas_monto_no_negativo_ck: monto_proyectado_cop >= 0. Back-relations: Rubro.lineas, Proyecto.lineas_presupuestales.
ProgramacionPeriodo @@map("programacion_periodo"): id, proyecto_id, linea_id, periodo CHAR(7), valor Decimal(15,2), created_at, updated_at.
  Composite FK (linea_id, proyecto_id) -> lineas_presupuestales(id, proyecto_id) NO ACTION; FK proyecto RESTRICT.
  @@unique([linea_id, periodo]), @@index([proyecto_id, periodo]).
  CHECKs: programacion_periodo_ck periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'; programacion_valor_no_negativo_ck valor >= 0.
```
Soft delete/void: NONE. Lines are never deleted ($0 is the "off" state; the existing "rubros never deleted" policy makes the RESTRICT FK
safe). Do NOT add `deleted_at` (v1 column, if present in prod, stays unused). Programming cells in BORRADOR are written by diff
(upsert changed, delete cells that became 0/omitted); history lives in `auditoria_cambios` and, after S8.1, the v0 snapshot.
`programacion_pendiente`: DERIVE on read (no cell with valor > 0), do not write the stored column (ADR-06); leave the column alone.
Rubro link: `rubro_id` FK; the catalog offers only `activo = true` rubros (R01..R15). Legacy NULL-codigo suspended rubros ("Material POP",
"Operación logística") only appear through pre-existing lines, flagged `heredado_pendiente` (REQ-BUD-05); PUT may edit an existing line of
a suspended rubro (to reassign to $0) but never create one (400).

## 3. API (order 404 -> 403 -> 409 -> 400, `withApiErrorHandling`, `force-dynamic`, OpenAPI file `paths/project-budget.ts` imported in `document.ts`)

New shared `src/lib/api/presupuesto.ts`: `gatePresupuestoWrite` = `gateEstructuraWrite` logic with budget copy (the existing 409 text says
"estructura técnica": do not reuse the message), `gatePresupuestoRead` via `loadProjectScoped` + `canReadProject` (must also return `estado`,
`valor_total`, dates). Lock the project row (`SELECT ... FOR UPDATE`) inside the write tx and re-check `estado = BORRADOR` (baseline S8.2 races).

| Route | Role | Behaviour |
|---|---|---|
| GET `projects/[id]/budget` (E-16, P03) | `canReadProject` (ADM, GER, COORD-M, VIS-flag) | `{estado, rubros:[{rubro_id, codigo, nombre, activo, linea_id|null, asignado:"x.xx", heredado_pendiente}], suma, valor_total, diferencia}`. Active rubros without a line come back virtual with `asignado "0.00"` (no seeding script). Suspended rubros only when a line exists. Order by `rubro.orden`, legacy NULL-codigo last. |
| PUT `projects/[id]/budget` (E-16, P06) | `canManageProjects` + BORRADOR | body `{rubros:[{rubro_id, asignado}]}` must cover EVERY active rubro exactly once (dup/missing/unknown -> 400), `asignado >= 0`, <= 9_999_999_999_999.99. Upserts all lines in ONE tx, audit one `EDITAR`/`CREAR` row per changed line (`entidad "presupuesto"`, `entidad_id` = linea id, `campo "asignado"`, shared lote). Does NOT reject Σ A != valor_total (REQ-BUD-02 allows it in Borrador); returns the same shape as GET. |
| GET/PUT `projects/[id]/programming` (E-17, P03/P06) | same | needs fecha_inicio+fecha_fin else 409 INVALID_STATE; PUT `{filas:[{rubro_id, periodo, valor}]}` (rubro must have a line; periodo in `projectPeriods(inicio, fin)` else 400 "El periodo X está fuera del rango del proyecto."; no duplicate (rubro, periodo)); diff write + audit `programacion` (`campo` = periodo). Returns `{periodos, filas, control_por_rubro:[{rubro_id, asignado, programado, control}], programacion_pendiente}`; control = Σ cells − A, informational (no 400 in BORRADOR). |
| GET `projects/[id]/financial-sheet?corte=AAAA-MM&base=vigente` (E-18, P03) | `canReadProject` | see §4/§5; `base=original` -> 409 INVALID_STATE "La versión original aún no existe." (no snapshots before S8). Aggregates only (no gasto-level data: P04 stays closed for VIS). |

No new baseline route. Gate: nothing in S5 moves a project out of BORRADOR; EN_EJECUCION QA still via `scripts/set-project-estado.ts`.

valor_total = ΣA (N-17) vs REQ-BUD-02: they CONTRADICT as written (if valor_total were derived, "Σ A must equal valor_total" is vacuous).
Reality: S2.1/S2.4 shipped valor_total as USER-ENTERED, editable by PATCH in BORRADOR, and S2.4 recomputes `diferencia_valor_oportunidad`
(= valor_total − `oportunidad.valor_estimado_cop`, only for OPORTUNIDAD projects, only inside PATCH). Default: keep valor_total user-entered;
budget PUT never overwrites it, except when it is `null` (then PUT sets valor_total = Σ A, honouring N-17 as the fallback source, and recomputes
`diferencia_valor_oportunidad` through the existing `diferenciaValor` in the same tx, auditing `proyecto.valor_total`). The UI offers "Igualar valor
total a Σ A" which just calls the existing PATCH (reuses S2.4 recompute + audit, zero new server code). S2.4 alert therefore stays correct: it
tracks valor_total, not Σ A; equality Σ A = valor_total is a baseline precondition (S8.2) via the pure `precondicionesPresupuesto` of U1.

## 4. Pure libs (no db/next imports; bigint cents; `Periodo` = `"AAAA-MM"` string compare is chronological)

`src/lib/proyectos/ficha-financiera.ts` (+ `__fixtures__/financiero.ts`, F-F1; build amounts with `toCents("59500000")`, never `0n`):
- `computeFicha({rubros, corte, toleranciaBp}) -> {corte, rubros: FichaRow[], total: FichaRow}` (SDD §4.9 types).
  Per rubro: `A = asignado`; `P = Σ programacion.valor where periodo <= corte`; `E = Σ gastos.valor where estado === "VALIDADO" && periodo <= corte`
  (REGISTRADO/RECHAZADO/ANULADO and later periods excluded); `D = E − P`; `epTenths = percentTenths(E, P)` (null when P = 0);
  `eaTenths = percentTenths(E, A)` (null when A = 0); `umbralRojo = toleranceThreshold(P, bp)` (integer division, floor); `color = colorFinancieroV2`.
  Total row: A, P, E sums, then the SAME formulas on the sums (A-06, not worst-of).
- `validadoAcumulado(gastos)` (VALIDADO, any period), `excederiaAsignado({asignado, validado, nuevo})` = `validado + nuevo > asignado` (S6 consumes).
- `controlProgramacion(asignado, filas) = Σ valor − asignado`; `precondicionesPresupuesto({valorTotal, lineas:[{A, activo}], programacion, periodosProyecto})`
  -> list of failures: ΣA != valor_total (V-12 copy "La suma del presupuesto ({suma}) no es igual al valor total del proyecto ({total}); diferencia {dif}."),
  per-rubro control != 0 (V-13), no programming (REQ-BUD-04 "Programación pendiente"), line with A > 0 on a suspended rubro (REQ-BUD-05),
  programming period outside `periodosProyecto`. This IS the "programming Σ = A enforced" unit: BORRADOR stays free-form, S8.2 baseline returns these as the 409 `precondiciones`.
`semaforo-v2.ts` additions (import `Cents`, `withinTolerance` from `./money`; no cycle):
- `colorFinancieroV2({A,P,E}, tolBp)`: `E > A -> rojo` first (checking it before `E <= P` also covers drafts where P > A); `E <= P -> verde`;
  `withinTolerance(E,P,bp) -> amarillo`; else rojo. `P = 0 && E > 0` falls to rojo automatically (E*10000 <= 0 is false); `P = 0 && E = 0` verde.
  NOTE the SDD pseudo-code checks `E <= P` before `E > A`; they only differ when P > A (possible only in an unbalanced draft). Default above.
- `toleranciaBp(param: Parametro<number>) = BigInt(Math.round(valor * 100))` (10 -> 1000n). `alertaRetraso({epTenths, colorTecnico}, umbralPct)`:
  `epTenths !== null && epTenths < BigInt(Math.round(umbralPct*10)) && colorTecnico !== "verde"`; never when P = 0 (null). Compare in tenths, no floats.

F-F1 re-derived (ran an exact bigint script, all nine figures and both colors agree with SDD §4.9/REQ-FIN-04; project 2026-10-05 -> 2027-01-29 gives
4 periods 2026-10..2027-01 via `projectPeriods`; tol 1000 bp; corte 2026-11):
| | A | P cum | E cum | D | E/P | E/A | umbral rojo | color |
|---|---|---|---|---|---|---|---|---|
| R01 Personal | 59.500.000 (14.875.000 x4 = A) | 29.750.000 | 12.000.000+15.000.000 = 27.000.000 | -2.750.000 | 908 (90,8) | 454 (45,4) | 32.725.000 | verde (E <= P) |
| R12 Transporte | 24.000.000 (6.000.000 x4 = A) | 12.000.000 | 7.000.000+6.500.000 = 13.500.000 | +1.500.000 | 1125 (112,5) | 563 (56,25 half-up) | 13.200.000 | rojo (E > 13.200.000) |
| Total | 83.500.000 | 41.750.000 | 40.500.000 | -1.250.000 | 970 (97,0) | 485 (48,5) | 45.925.000 | verde |
Extras: REGISTRADO 5.000.000 (R01 2026-11), RECHAZADO 800.000 (R12 2026-10), VALIDADO 3.000.000 (R01 2026-12 > corte) must not move E. G4: R12 E=13.000.000 and
13.200.000,00 amarillo, 13.200.000,01 rojo. G5: corte 2027-01 R12 P=24.000.000, E=24.500.000 -> rojo by E > A. F-F1 ΣA = 83.500.000 != any valor_total in the
fixture: the fixture project must carry valor_total 83.500.000 only if a test also exercises `precondicionesPresupuesto` (F-X1's 177.360.000 is a different budget).

## 5. UI placement and visibility (ficha is a dialog with a stack of sections, no tabs: `project-ficha-dialog.tsx` ~l.202)

New sections: `ProjectPresupuesto` after `ProjectEstructura` (planning: budget table + programming grid) and `ProjectFinanciero` after `ProjectEjecucion`
(before `ProjectHistorial`). Files: `project-presupuesto.tsx`, `presupuesto-programacion.tsx`, `project-financiero.tsx`; reuse `ToneBadge`, `estructura-ui`
(`InlineError`, `VoidControl` N/A), extract `COLOR_META` from `semaforo-tecnico.tsx` for the financial chip. Hooks in `src/hooks/projects.ts` (`useProjectBudget`,
`useUpdateBudget`, `useProjectProgramming`, `useUpdateProgramming`, `useProjectFinancialSheet(id, corte)`) following the S4 pattern; `project-list.test.tsx` mocks
the whole `@/hooks/projects` module (S4 deviation 13): add every new hook to that factory and stub them in `project-ficha-dialog.test.tsx`.
- Edit controls: `canManageProjects(usuario)` AND `proyecto.estado === "BORRADOR"` (COORDINADOR members read only: P06 is ADM/GER). Live "Σ A vs valor total"
  difference computed with `toCents` (client never uses Number on money), "Programación pendiente" badge, per-rubro control column, heredado badge
  "Rubro suspendido pendiente de reasignación".
- Financial ficha: visible to whoever can open the ficha (P03 = `canViewProjectV2`: ADM, GER, COORD-M, VIS flag); COORD-X/COLAB are 403/hidden. Period selector over
  `projectPeriods`, base selector disabled ("Original" after S8). Table rows A/P/E/D/E-P/E-A/umbral/color + total row; chips render API color verbatim (never
  recomputed client side); "No confirmado" badge when `parametros.confirmado` false; alert "Posible retraso: el gasto va por debajo de lo programado y el avance técnico
  está atrasado." P04 exclusions: payload and UI carry NO expense rows, supports or third-party IDs (add an explicit test).
- Until S6: response carries `ejecucion_disponible: false`, E = 0, `color: null`, `alerta_retraso: false`; UI shows A/P/D and the note "El gasto ejecutado se
  mostrará cuando existan gastos validados." (a green chip on E = 0 would mislead).

financial-sheet internals (U4): extract the corte->technical computation of `technical-status/route.ts` into a shared `loadTecnicoStatus(proyectoId, corteIso)`
(route test stays green) so `alerta_retraso` uses the same colour. Monthly corte `AAAA-MM` -> technical date = last day of that month, clipped to `todayInBogota()`;
default corte = `periodOf(today)` clipped into the project periods; corte outside the project periods -> 400. New seam `loadGastosValidados(proyectoId)` in
`src/lib/api/financiera.ts` returning `{disponible:false, gastos:[]}`; S6.1 only replaces its body. `alerta_retraso` is computed on the TOTAL row.

## 6. TDD work units (strict TDD, runner `TZ=America/Bogota npx vitest run <path>`; DB commands `--env-file=.env.local`)

U1 Pure libs (~350): `ficha-financiera.ts`, `financiero.ts` fixture, `colorFinancieroV2`, `alertaRetraso`, `toleranciaBp`, `precondicionesPresupuesto`. RED:
`it("G1 Personal ...")` ... `it("G7 total row ...")` (exact figures above), `it("56,25 rounds up to 56,3")`, truth table for colorFinancieroV2 (E=P verde, P<E<=1.1P amarillo,
boundary 13.200.000,00 amarillo / ,01 rojo, E>A rojo, P=0&E>0 rojo, 0/0 verde), `it("alertaRetraso needs ep<70% and technical amarillo/rojo; null ep never")`,
`it("90,8 % with technical rojo raises no alert")`, `it("precondiciones lists ΣA mismatch, control != 0, pending programming, suspended line with A>0")`, `it("no float: 0.1+0.2 amounts exact")`.
U2 Schema + migration + invariants (~300): Prisma models, `v2_presupuesto` migration, `prisma/presupuesto.invariant.test.ts` (rollback, `./require-local-db` first):
negative A rejected, duplicate (proyecto, rubro) rejected, cross-project programacion FK rejected, bad periodo format rejected, negative valor rejected, RESTRICT on rubro delete.
Also: rubro rename 409 guard in `rubros/[id]/route.ts` ("El rubro tiene datos asociados: no se puede renombrar, solo suspender.") when a line exists (REQ-CAT-02, was deferred to S5);
extend `s1-rubros-report.ts` with `sum(monto_proyectado_cop)` per project (S1.1b; gastos count waits for S6) + test with a fake client (no write tx).
U3 Budget + programming routes (~400): `presupuesto.ts` gates, budget GET/PUT, programming GET/PUT, audit, OpenAPI, valor_total-null fill. RED: GET virtual $0 rows for the 15 active
rubros; PUT must cover every active rubro (missing/dup/unknown 400); negative 400; 403 COORD/VIS/COLAB; 409 non-BORRADOR (copy not "estructura"); Σ != valor_total still 200; one audit row per
changed line with shared lote; suspended line shown `heredado_pendiente`, cannot be created; programming period outside range 400; no dates 409; control = Σ − A; `programacion_pendiente` derived;
valor_total null -> set to Σ A + diferencia recomputed.
U4 Financial sheet (~300): `loadTecnicoStatus` extraction, `financiera.ts` seam, route, OpenAPI. RED: F-F1 end to end over seeded lines/programming with injected gastos (route test mocks the seam):
rows, total, colors, `umbralRojo`; `base=original` 409; corte outside range 400; default corte; 404/403 matrix incl. VIS-flag allowed and COORD-X 403; `ejecucion_disponible false` => no colors; payload has no gasto-level keys.
U5 UI editors (~400): hooks, `project-presupuesto.tsx`, programming grid. RED: one column per project month; live Σ A vs valor_total diff; controls hidden when not manager or not BORRADOR; "Programación pendiente" badge;
heredado badge; "Igualar" button calls PATCH; submit sends strings. U6 UI financial ficha (~350): `project-financiero.tsx`, selector, mount, stubs in list/ficha tests. RED: renders API colors verbatim,
corte selector refetches, "No confirmado", delay alert text, E-not-available note, no expense/support rows rendered.
Order U1 -> U2 -> U3 -> U4 -> U5 -> U6 (U1 can run any time; it has no deps).

## 7. Risks, SDD discrepancies, defaults (so work proceeds unattended)

1. N-17 vs REQ-BUD-02 contradiction: default in §3 (valor_total stays user-entered; null -> ΣA; equality is a baseline precondition). PO may later prefer pure derivation: then drop PATCH `valor_total` in BORRADOR (one-line change + S2 tests).
2. No Gasto table: E cannot be real until S6; default seam + `ejecucion_disponible:false`. F-F1 golden is exercised at the pure-lib level and route level with injected gastos.
3. "Programming Σ = A enforced": default = informational in BORRADOR, hard precondition at baseline (S8.2). Alternative (reject PUT when control != 0) would make editing A and P impossible one at a time.
4. Dates edited after programming exists (PATCH fecha_inicio/fin in BORRADOR) can orphan cells outside the new range: not blocked in S5; `precondicionesPresupuesto` flags it; UI marks "fuera de rango".
5. Prod may still hold v1 `lineas_presupuestales`/`rubros` rows: migration must be adoptive and idempotent; confirm table shape before deploy (local DB was reset, so local can't prove it). Production deploy is out of scope.
6. SDD stale: `s5-presupuesto.ts` script, "DELETE rubro soft-deletes today", `deleted_at` on lines, stored `programacion_pendiente`, `ColorSemaforo` in `src/lib/semaforo.ts`, `ParametrosSemaforoV2` shape (real is `{valor, confirmado}`), `getProjectForStructure` (real: `gateEstructuraWrite`).
7. Corte semantics (monthly corte -> technical date) and "alert on total row" are defaults for PO-P items; retraso 70 % and tolerancia 10 % remain `confirmado:false` placeholders.
8. Rubros with NULL codigo appear only as heredado lines; `FichaRow.codigo` should be `string | null` (SDD says string).
9. tsx cannot run in this shell (win32 esbuild): run scripts with `node --env-file=.env.local` where possible, tests via vitest; known load-flakes: proyecto-secuencia invariant, user-menu, upload-dialog, task-dialog, change-password-dialog.
10. Float traps: tolerancia/retraso are JS numbers; convert to integer bp/tenths before comparing. Percent display must go through `formatPercent`, money through `formatCOP`.

## 8. What S5 unblocks

- S1.1b (rubros report): unblocked after U2 (table exists; the existing query already matches `lineas_presupuestales.proyecto_id/rubro_id`); U2 extends it with amounts; expense counts after S6.
- REQ-CAT-02 deferred scenarios (409 rename with data, "Rubro suspendido pendiente de reasignación" display): done in U2/U5.
- S6: `Gasto.linea_id` composite FK to `lineas_presupuestales(id, proyecto_id)` (unique exists), row lock target for ADR-11 overspend, `validadoAcumulado/excederiaAsignado`, the `loadGastosValidados` seam.
- S8.1/S8.2/S8.3: snapshot reads lines + cells; baseline preconditions = `precondicionesPresupuesto`; modification integrity (traslado/adición) reuses the libs; `base=original` for the ficha.
- S9.1: `avanceFinanciero` (E/A) and `ejecucionVsProgramado` (E/P) reuse `computeFicha` total row. S7: Excel sheets 7/8 map to budget PUT and programming PUT payloads (`Control = Total − Asignado`).

