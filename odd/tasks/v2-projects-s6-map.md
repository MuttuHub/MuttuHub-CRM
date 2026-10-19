# S6 map: Expenses and validation (RF-20..22, RF-25, RNF-03, RNF-04)

Read-only mapping, branch feat/projects-v2 @ 8636031. Everything below was checked against code on 2026-10-08.
Runner: `TZ=America/Bogota npx vitest run <path>`; DB commands `--env-file=.env.local` (never `.env`). Local DB is Docker.

## 1. Exists vs assumed

EXISTS (verified):
- `src/lib/permissions.ts`: `canExecuteProject` (manager OR COORDINADOR+es_miembro) = P10 register; `canViewFinancialSupports` (manager OR COORD member;
  the gerencial flag is excluded) = P04; `canValidateExpense(gasto:{registrado_por_id}, actor)` = manager AND registrant != actor = P11;
  `canManageProjects` (ADM/GER) = void P18. No new predicate is needed.
- `AccionAuditoria` has VALIDAR/RECHAZAR/ANULAR/CREAR/EDITAR; `AUDIT_ENTIDADES_V2` already contains `"gasto"`; `logChange(tx, ...)` in `src/lib/api/audit-cambios.ts`;
  trigger function `auditoria_cambios_inmutable()` from migration `v2_auditoria_cambios`.
- `LineaPresupuestal` has `@@unique([id, proyecto_id])` (the FK target for gastos) and `@@unique([proyecto_id, rubro_id])`; amount column is `monto_proyectado_cop`.
- Pure: `ficha-financiera.ts` ALREADY exports `validadoAcumulado(gastos)` and `excederiaAsignado({asignado, validado, nuevo})` (strict `>`); `computeFicha` already filters
  `estado === "VALIDADO" && periodo <= corte`; field names are camelCase (`rubroId`, `asignado`, `programado`, `ejecutado`), NOT the SDD's `rubro_id/A/P/E`.
  `money.ts` (bigint cents, `toCents/fromCents/sumCents/percentTenths`), `weeks.ts` (`periodOf`, `projectPeriods`, `todayInBogota`), fixture `__fixtures__/financiero.ts` (F-F1 with
  REGISTRADO/RECHAZADO/after-corte noise).
- Seam `src/lib/api/financiera.ts`: `GastoAgregable = {rubroId, periodo, valor: Cents, estado}`, `GastosFuente = {disponible, gastos}`; body returns `{disponible:false, gastos:[]}`.
  `financial-sheet/route.ts` consumes it and nulls colors/percentages while `disponible` is false. UI `project-financiero.tsx` shows SIN_GASTOS_NOTE when false.
- S4 patterns to copy: `gateEjecucionWrite` (404->403->409 EN_EJECUCION, message "El proyecto aún no tiene línea base aprobada."), `gateEjecucionVoid` (managers, any estado),
  `gateEjecucionRead` (canReadProject), `MOTIVO_ANULACION_SCHEMA`, `parseEstructuraBody`, `conflict()`, `isUniqueViolation`; supports: `SoporteProyecto`, `proyectoSoportePath`,
  `assertKeyBelongsToTarget({kind:"proyecto_soporte"})`, `storedObjectSize`, `isValidExternalUrl`, `isAllowedNameAndMime`, `MAX_FILE_BYTES`, `createSupabaseAdmin`, 60 s signed download;
  `no-storage-delete.test.ts` guard. `presupuesto.ts`: `RespuestaAbortada`, `parseMonto` (rejects floats/negatives, 2 decimals max), `decimalFromCents`, `MONTO_MAXIMO_CENTS`.
- Hooks `src/hooks/projects.ts` (query-key factory `projectQueryKeys`, `useProjectBudget`, `useProjectFinancialSheet`, `uploadAvanceMedioFile` sign->PUT->confirm).
  `project-list.test.tsx` mocks the WHOLE `@/hooks/projects` module (S4 deviation 13): every new hook must be added to that factory and stubbed in `project-ficha-dialog.test.tsx`.

DOES NOT EXIST (SDD wrong or silent):
- No `Gasto`, `AccesoSoporte` model/table anywhere (no migration mentions gastos; adoptive style still advisable). `soportes_proyecto` has no `gasto_id`.
- `TipoNotificacion` = COMPROMISO_VENCIDO | TAREA_VENCIDA | POR_VENCER only; `Notificacion` has only `tarea_id` (no `proyecto_id`, `gasto_id`, no unique).
- SDD §4.13 "the existing notifications UI lists them" is FALSE: `GET /api/v1/notifications` is a computed task snapshot (`getAlertBuckets` + `reconcileAlertas`, rows keyed by tarea_id,
  response `{total, vencidos, hoy, proximos3, leidas_ids}`); `read-all` marks only snapshot tarea ids; `notification-panel.tsx` renders only the 3 buckets. Project notifications need
  schema + GET + read-all + panel changes (see 6).
- There is NO generic "create a notification" helper; rows are only created by `reconcileAlertas` (lib/alerts.ts) at read time and by email cron.
- No `VISUALIZADOR` role (RolUsuario = ADM/GER/COORD/COLAB) and the gerencial flag has no column: `UNRESOLVED_GERENCIAL_FLAG = false` pinned in `lib/api/projects.ts`. So "VIS" at route level
  is a COLABORADOR (or non-member COORD); VIS redaction can only be proven with a pure function test using `puede_ver_tablero_gerencial: true`.
- Existing route constants (`MEDIO_ARCHIVO_SCHEMA`, `MEDIO_ENLACE_SCHEMA`, `FILE_TYPE_MESSAGE`, `MEDIO_*_MESSAGE`) live inside the avance attachments route files. Extract before reuse.
- Sign route is bound to an avance (`loadAvanceParaMedio`); expenses need a sign route that exists BEFORE the gasto does.
- SDD signatures `colorFinancieroV2(x, tolBp)`/`ParametrosSemaforoV2` shape differ from real (`{valor, confirmado}`); not needed in S6.
- Download route for avance medios uses `gateEjecucionRead` (canReadProject); it is NOT restricted by `canViewFinancialSupports`. Expense supports need their own gate.

## 2. Models and migration (`20261010120000_v2_gastos_validacion`, adoptive/idempotent like S4/S5: IF NOT EXISTS + `DO $$ ... duplicate_object`)

enums: `EstadoGasto {REGISTRADO VALIDADO RECHAZADO ANULADO}`, `TipoSoporteGasto {FACTURA_PROVEEDOR CUENTA_COBRO_PERSONA_NATURAL OTRO}`, `TipoIdentificacion {NIT CC CE}`,
`TipoNotificacion += SOBREGASTO_RUBRO` (ALTER TYPE ... ADD VALUE IF NOT EXISTS must be its OWN migration or statement-outside-transaction; use a separate migration, see U4).

```
model Gasto  @@map("gastos")
  id uuid; proyecto_id; linea_id  (composite FK [linea_id, proyecto_id] -> lineas_presupuestales(id, proyecto_id) NoAction)
  fecha_documento Date; periodo Char(7); tipo_soporte TipoSoporteGasto; tercero_nombre; tercero_tipo_id TipoIdentificacion?; tercero_numero_id String?;
  tercero_id_norm String?; numero_documento String; numero_documento_norm String   (norms written by the app from the pure lib; used only for RF-21 lookup)
  descripcion; monto_cop Decimal(15,2); estado EstadoGasto @default(REGISTRADO); alerta_sobregasto Boolean @default(false)
  registrado_por_id; created_at; updated_at
  validado_por_id?; validado_at?; rechazado_por_id?; rechazado_at?; motivo_rechazo?; anulado_por_id?; anulado_at?; motivo_anulacion?   (actor ids: no FK, like S4)
  @@unique([id, proyecto_id])  @@index([proyecto_id, estado, periodo])  @@index([linea_id, estado])  @@index([tercero_id_norm, numero_documento_norm])  @@index([estado, created_at])
```
`datos_incompletos` is DERIVED (tercero_tipo_id or tercero_numero_id null), never stored (same choice as S5's derived `programacion_pendiente`).
CHECKs (names are what invariant tests assert): `gastos_monto_positivo_ck` (monto_cop > 0); `gastos_periodo_ck` (`^[0-9]{4}-(0[1-9]|1[0-2])$`);
`gastos_validador_ck` (validado_por_id IS NULL OR validado_por_id <> registrado_por_id); `gastos_rechazo_ck` (estado <> 'RECHAZADO' OR (motivo_rechazo IS NOT NULL AND rechazado_por_id IS NOT NULL));
`gastos_validado_ck` (estado <> 'VALIDADO' OR (validado_por_id IS NOT NULL AND validado_at IS NOT NULL AND tercero_tipo_id IS NOT NULL AND tercero_numero_id IS NOT NULL)) (DB-level N-15);
`gastos_anulado_ck` ((estado = 'ANULADO') = (anulado_at IS NOT NULL) AND num_nonnulls(anulado_at, anulado_por_id, motivo_anulacion) IN (0,3)). Rejection also rejects `rechazado_por_id = registrado_por_id`
(`gastos_rechazador_ck`) to mirror segregation (default; PO silent).
Void convention: same as S4 (row kept, `anulado_*`), plus `estado = ANULADO`; ANULADO only from VALIDADO (REGISTRADO is rejected instead; RECHAZADO is final unless the registrant corrects it).
Estado machine: REGISTRADO -> VALIDADO | RECHAZADO; RECHAZADO -> REGISTRADO (registrant PATCH, clears motivo/rechazado_*; audit EDITAR); VALIDADO -> ANULADO (ADM/GER, motivo); VALIDADO immutable otherwise.

`soportes_proyecto` change (same migration, after gastos table): `ADD COLUMN IF NOT EXISTS gasto_id TEXT`; index; composite FK `(gasto_id, proyecto_id) -> gastos(id, proyecto_id)` NO ACTION;
`DROP CONSTRAINT IF EXISTS soportes_proyecto_padre_check` then re-add with the SAME NAME as `CHECK (num_nonnulls(avance_id, medicion_id, gasto_id) = 1)` (keeps
`prisma/avances.invariant.test.ts:178` green; add a gasto case there). Prisma: `SoporteProyecto.gasto Gasto? @relation(fields:[gasto_id, proyecto_id], ...)`, `Gasto.soportes SoporteProyecto[]`, update the schema comment.
Support-per-expense completeness (>= 1 live soporte) is service-level inside the create transaction (a deferred constraint trigger is over-engineering).

`AccesoSoporte` (`acceso_soportes`): `id, soporte_id (FK soportes_proyecto RESTRICT), proyecto_id, usuario_id (no FK), created_at`; `@@index([proyecto_id, created_at])`, `@@index([soporte_id])`.
Append-only: triggers BEFORE UPDATE/DELETE row + BEFORE TRUNCATE statement. Recommend its own function `acceso_soportes_inmutable()` (the audit one raises a message naming auditoria_cambios).
`Notificacion` (U4 migration): `proyecto_id String?`, `gasto_id String?`, `@@unique([usuario_id, tipo, gasto_id])` (NULL gasto_id rows never collide, so task rows are untouched), relation to Gasto optional.
Back-relations on `Proyecto.gastos`, `LineaPresupuestal.gastos`.

## 3. API (all `src/app/api/v1/projects/[id]/expenses/...`; order 404 -> 403 -> 409 -> 400 as in S4/S5; Spanish messages; `withApiErrorHandling("projects", ...)`)
Deviation from SDD E-20: JSON body with confirm-mode `soportes[]` (sign -> direct upload -> confirm), not multipart (Vercel 4.5 MB body limit, ADR-13; same as S4).

| Route | Who / gate | Rules |
|---|---|---|
| POST `expenses/sign` | `gateEjecucionWrite` | shared sign logic extracted from the avance sign route (400 type, 413 FILE_TOO_LARGE, server picks key `proyectos/{id}/soportes/...`) |
| POST `expenses` | `gateEjecucionWrite` (ADM/GER, COORD-M, EN_EJECUCION; COLAB/non-member 403; BORRADOR/SUSPENDIDO/CERRADO 409) | body `{rubro_id, fecha_documento, periodo?, tipo_soporte, tercero_nombre, tercero_tipo_id?, tercero_numero_id?, numero_documento, descripcion, valor, soportes:[archivo\|enlace] (1..5)}`; 400 if no linea for rubro or A = 0 ("Solo puedes registrar gastos en rubros con valor asignado."), valor <= 0/float (`parseMonto`), periodo outside `projectPeriods` (default `periodOf(fecha_documento)`), no soporte ("Adjunta al menos un soporte (archivo o enlace)."), bad file/key. One transaction: gasto + soportes (storage_path unique -> 409) + audit CREAR. 201 `{gasto, alertas}`; estado always REGISTRADO |
| GET `expenses` | `canViewProjectV2` (any estado) | `{gastos, totales}`; `tercero_numero_id` and `soportes` omitted unless `canViewFinancialSupports`; sorted created_at desc; totals by estado |
| GET/PATCH `expenses/[expenseId]` | GET same as list; PATCH registrant only (+ gateEjecucionWrite) | PATCH only REGISTRADO/RECHAZADO (else 409 "Un gasto validado no se puede editar."); RECHAZADO -> REGISTRADO; re-resolves linea and recomputes norms/flags; audit with `diffFields` |
| POST `.../validate` | `canManageProjects` then `canValidateExpense` | 403 self "No puedes validar un gasto que tú registraste."; 404; 409 INVALID_STATE if not REGISTRADO; 409 datos incompletos ("Completa el tipo y número de identificación del tercero antes de validar."); then the overspend transaction below |
| POST `.../reject` `{motivo}` | same 403s | 400 empty motivo; 409 if not REGISTRADO; audit RECHAZAR |
| POST `.../void` `{motivo}` | `gateEjecucionVoid` (managers, any estado) | only VALIDADO (else 409); audit ANULAR; leaves E automatically (loader filters VALIDADO) |
| GET/POST `.../attachments`, POST `.../attachments/sign`? NO: reuse `expenses/sign` | financial-support gate (`canViewFinancialSupports`) for GET; `gateEjecucionWrite` + registrant-or-manager for POST (only while REGISTRADO/RECHAZADO) | confirm/link, same validation helper as S4 |
| GET `.../attachments/[aid]/download` | financial-support gate | 60 s signed URL or link; writes `acceso_soportes` (see 5) |
| GET `/api/v1/expense-validations?estado=REGISTRADO&limit=50` | `canManageProjects` else 403 | cross-project queue `{gastos:[{..., proyecto_id, proyecto_codigo, rubro, registrado_por_nombre, propio, datos_incompletos, alerta_sobregasto}]}`, oldest first; excludes deleted projects; estado whitelist else 400 |

Overspend (ADR-11) inside `POST validate`, after the cheap guards: `db.$transaction`: (1) `SELECT monto_proyectado_cop::text FROM lineas_presupuestales WHERE id = ${linea_id} FOR UPDATE` (the lock target S5 reserved);
(2) re-read the gasto `FOR UPDATE`/guard `estado = 'REGISTRADO'` (409 if a racer won); (3) `SELECT COALESCE(SUM(monto_cop),0)::text FROM gastos WHERE linea_id = ${linea_id} AND estado = 'VALIDADO'` (all periods);
(4) `excederiaAsignado({asignado, validado, nuevo})` TRUE -> in the SAME tx set `alerta_sobregasto = true`, `notificacion.createMany({skipDuplicates:true})` for every active GERENCIA user, audit, and RETURN `{blocked:true}`
(do NOT throw `RespuestaAbortada`: that rolls back the flag/notifications); the handler answers 409 `OVERSPEND_BLOCKED` with the SDD copy after commit. FALSE -> `updateMany where estado REGISTRADO` to VALIDADO, `alerta_sobregasto=false`, audit VALIDAR.
Second blocked attempt: 409 again, `skipDuplicates` + unique `[usuario_id,tipo,gasto_id]` keep exactly one row per GERENCIA user. Unblock path: when A is raised (S8.3b traslado/adicion; until then the test updates
`monto_proyectado_cop` directly because `gatePresupuestoWrite` only allows BORRADOR) the same call succeeds and clears the flag. Equality is allowed (strict `>`).
Early warning at registration: same predicate against current validated total, sets `alerta_sobregasto`, returns `alertas:[{tipo:"SOBREGASTO"}]`, NO notification, never blocks.
Duplicates (RF-21): after create, look up `gastos` with same `tercero_id_norm` AND `numero_documento_norm` (both non-null), `estado IN (REGISTRADO, VALIDADO)`, excluding the new row, ANY project; 201 + `alertas:[{tipo:"DUPLICADO", gasto_id, proyecto_codigo | null, mensaje}]`.
Code revealed only if the actor can see that project (managers: all; COORD: membership; else null -> "(en otro proyecto)"). Never blocks; no unique index (it would block).
Also: OpenAPI `src/lib/openapi/paths/project-expenses.ts`; `S1.1b` rubros report can now count gastos (S5 deferred it); rubro rename guard may also check gastos (already blocked by lines).

## 4. Pure libs (`src/lib/proyectos/gastos.ts` + test; fixtures `__fixtures__/gastos.ts`)
- `normalizarIdentificacion(tipo, numero): string | null`: trim, uppercase, remove spaces/dots/underscores; NIT with a trailing `-D` check digit drops `-D` (`"900.123.456-7"` and `" 900 123 456 - 7 "` and `"900123456"` all -> `"900123456"`); CC/CE keep alphanumerics only
  (`"1.020.304.050"` -> `"1020304050"`, `"ce-123456"` -> `"CE123456"`); empty/blank -> null. Key for lookup = `norm` only (tipo included in the comparison? default: compare norm only, since NIT vs CC digits rarely collide; flag as decision).
- `normalizarNumeroDocumento(n)`: uppercase, remove whitespace and `- . _ /`; do NOT strip leading zeros (`"FE-0123"` == `"fe 0123"`, != `"FE-123"`).
- `periodoPorDefecto(fecha)` = `periodOf`; `periodoEnProyecto(periodo, periodos)`; `datosIncompletos({tercero_tipo_id, tercero_numero_id})`; `puedeTransicionar(estado, accion)` (table above); `esDuplicado(a, b)`.
- `redactarGasto(view, {puedeVerSoportes})` drops `tercero_numero_id`/`tercero_id_norm`/`soportes` (this is the P04/RNF-03 unit test with a flag-true actor).
- Overspend: reuse `excederiaAsignado`/`validadoAcumulado` from `ficha-financiera.ts` (do not re-implement). Fixtures: Transporte A 24.000.000, validated 23.500.000: new 1.000.000 -> true; new 500.000 -> false (24.000.000 not > A);
  after A = 25.000.000 -> false; REGISTRADO/RECHAZADO/ANULADO rows never count in `validadoAcumulado`.
- Feeding E: replace `loadGastosValidados` body only:
  `const rows = await db.gasto.findMany({ where:{proyecto_id, estado:"VALIDADO"}, select:{periodo, monto_cop, linea:{select:{rubro_id}}} })` -> `{disponible:true, gastos: rows.map(r => ({rubroId: r.linea.rubro_id, periodo: r.periodo, valor: toCents(r.monto_cop), estado:"VALIDADO"}))}`.
  `computeFicha` then yields E (`periodo <= corte`) and colors via `colorFinancieroV2` unchanged; golden F-F1 stays green (route test mocks the seam). Remove the `eslint-disable` for the unused param.
  Product risk: with `disponible: true` always, a BORRADOR project shows a green chip on E = 0 (S5 map warned). Default: in `financial-sheet/route.ts` compute `ejecucion_disponible = fuente.disponible && estado !== "BORRADOR"` (+1 test).
  Seam test: live DB invariant that a REGISTRADO/RECHAZADO/ANULADO expense does not appear and a validated one does, plus a unit test of the mapping with a mocked `db.gasto.findMany`.

## 5. Supports: upload, download, access log, exclusion
- Upload: `expenses/sign` returns `{storage_path, token, signed_url, max_bytes, allowed_extensions}`; the browser PUTs, then POST expenses (or `.../attachments`) confirms with `{storage_path, nombre, tamano_bytes, tipo_mime?}` or `{url_externa, nombre}`.
  Reuse `assertKeyBelongsToTarget({kind:"proyecto_soporte", proyectoId})`, `storedObjectSize` (real size stored), `STORAGE_PATH_INDEX` -> 409 duplicate object. Extract `src/lib/api/soportes.ts` (schemas, messages, `validarSoporte(proyectoId, input)` returning data or a Response)
  and make both the avance route and the new routes import it (S4 tests stay green). Never delete from storage; no delete route for gasto soportes (void the expense instead); guard test stays green.
- Download: `GET .../expenses/[eid]/attachments/[aid]/download`: gate = `loadProjectScoped` -> 404; `canViewFinancialSupports(projectReadActor(usuario, es_miembro))` else 403 (ADM/GER/COORD-M only; COLAB, non-member COORD, and any gerencial-flag VIS are 403).
  Find soporte `{id, gasto_id: eid, proyecto_id: id, deleted_at: null}` 404. Sign (60 s) first, THEN `acceso_soportes.create({soporte_id, proyecto_id, usuario_id})`; if the insert fails return 500 and no URL (fail closed). Log link soportes too (a consultation either way).
  Test: one row per issuance (two downloads -> 2 rows), zero rows on 403/404, 500 and no URL when the insert throws. Live DB: UPDATE/DELETE/TRUNCATE on `acceso_soportes` rejected.
- RNF-03: avance medios stay under the S4 gate (VIS keeps seeing verification media); only expense supports + third-party IDs are restricted. Add explicit tests that list/detail payloads for a non-supports actor carry no `tercero_numero_id`/`soportes`.

## 6. Notifications (what to reuse, what to build; U4)
No creator helper exists, so S6 adds `src/lib/api/notificaciones-proyecto.ts`: `notificarSobregasto(tx, {gastoId, proyectoId})` = `tx.usuario.findMany({where:{rol:"GERENCIA", activo:true}})` + `tx.notificacion.createMany({data, skipDuplicates:true})`
(`tipo SOBREGASTO_RUBRO`, `proyecto_id`, `gasto_id`, `tarea_id` null). Reads: extend `buildSnapshot` additively with `proyectos: [{notificacion_id, tipo, mensaje:"Gasto supera el asignado del rubro", proyecto_id, proyecto_codigo, gasto_id, leida, created_at}]`
for the actor's own rows (only GERENCIA gets them); do NOT touch existing keys. `total` stays task-only OR add `proyectos` unread count to the bell badge (default: add, so the alert is visible). `read-all` also `updateMany` the actor's unread project rows;
`[id]/read` already works by row id. Panel (`notification-panel.tsx`) gets a "PROYECTOS" group with a link to the project (`/proyectos` + ficha open by id; check how list deep-links; otherwise plain text + code). Update `notification-panel.test.tsx` and `notifications/route.test.ts`.
`reconcileAlertas` only touches rows by `tarea_id in (...)` so project rows are safe from it. Audit and flag writes are in the same tx as the notifications.

## 7. UI (ficha is a dialog with stacked sections; no tabs)
- New `ProjectGastos` section mounted after `ProjectFinanciero`, before `ProjectHistorial` in `project-ficha-dialog.tsx` (~l.205). Files: `project-gastos.tsx` (list + totals by estado + state chips + red "Supera el asignado" flag), `gasto-form.tsx` (rubro select
  from `useProjectBudget` lines with A > 0, fecha_documento max today, periodo select over `projectPeriods` defaulting to the document month, tipo_soporte, tercero nombre/tipo/numero, numero_documento, descripcion, valor as STRING never Number, soportes: file and/or https link, at least one; shows returned
  `alertas` banners: "Ya existe un gasto con el mismo NIT/cédula y número de documento (proyecto PRY-...)" / "(en otro proyecto)" and the early overspend warning), `gasto-acciones.tsx` (Validar / Rechazar with motivo / Anular with motivo, Ver soporte).
  Reuse `estructura-ui` (`InlineError`, `VoidControl`, `parseNumber`), `ToneBadge`, `formatCOP`; extend the sign/upload helper in `hooks/projects.ts` (`uploadAvanceMedioFile` -> generic `uploadSoporteFile(projectId, signPath, file)`).
- Visibility: section visible when `canReadProject` (list; third-party ID and supports shown only if manager or COORD member); register button = `canManageProjects OR (COORDINADOR AND active member)` AND `estado === EN_EJECUCION` (same gating as `project-ejecucion.tsx`, via `useProjectMembers`);
  Validar/Rechazar = manager AND `registrado_por_id !== usuario.id` AND REGISTRADO (the API is the authority; the row says "Tú lo registraste" instead of the buttons); Anular = manager on VALIDADO; Editar = registrant on REGISTRADO/RECHAZADO.
- Validation queue (E-22): `expense-validation-queue.tsx` mounted on `src/app/(app)/proyectos/page.tsx`/`project-list.tsx` above the table for managers only (cross-project; row: proyecto_codigo, rubro, tercero, valor, flags, Validar/Rechazar; own rows disabled). New hooks: `useProjectExpenses`, `useCreateExpense`, `useUpdateExpense`, `useValidateExpense`, `useRejectExpense`,
  `useVoidExpense`, `useExpenseValidationQueue`, `downloadExpenseSoporte`; invalidate `financialSheet` + `expenses` + queue on validate/void. Add all to the `project-list.test.tsx` factory and ficha-dialog stubs.
- `project-financiero.tsx`: update the header comment and keep the SIN_GASTOS_NOTE branch (still used for BORRADOR).

## 8. TDD work units (strict TDD; order matters; commit per unit, feature branch, no AI attribution lines per user rule)
U1 Pure libs (~250 incl. fixtures). RED: `normalizarIdentificacion` cases above (NIT dotted/check digit/spaces, CC, CE, blank -> null); `normalizarNumeroDocumento` FE-0123; `puedeTransicionar` table; `periodoPorDefecto`; `redactarGasto` hides ID and soportes for a flag actor;
  overspend fixtures with the existing `excederiaAsignado` (23.5M+1M > 24M, 24M not > 24M, ANULADO ignored). No DB.
U2 Schema + migration + invariants (~300). RED (live DB, rollback, `./require-local-db` first, new `prisma/gastos.invariant.test.ts`): `monto_cop = 0` rejected; bad periodo; `validado_por_id = registrado_por_id` rejected (gastos_validador_ck); RECHAZADO without motivo rejected;
  VALIDADO without third-party id rejected; ANULADO/anulado_* mismatch rejected; cross-project linea FK rejected; soporte with gasto_id AND avance_id rejected; soporte with gasto_id only accepted; cross-project gasto_id on soporte rejected; existing padre_check test still green.
U3 Registration + duplicate + supports (~400). RED: 201 with all RF-20 fields and one soporte; 400 no soporte, A = 0 rubro, periodo outside project, valor <= 0/float, unknown tipo_soporte, key of another project; default periodo = document month; 403 COLAB/non-member COORD; 409 BORRADOR/SUSPENDIDO; estado REGISTRADO;
  early-warning flag, no notification, no block; DUPLICADO alert (same norm+doc in another project, code hidden when the actor cannot read it, REGISTRADO/VALIDADO count, RECHAZADO/ANULADO do not); sign route 413; list omits `tercero_numero_id`/`soportes` for a non-supports actor; PATCH own REGISTRADO ok, other user's 403, VALIDADO 409,
  RECHAZADO -> REGISTRADO. Extract `lib/api/soportes.ts` (avance route tests stay green); AUDIT CREAR/EDITAR rows; OpenAPI.
U4 Validation flow + overspend + notifications (~400; split into U4a validate/reject/void/queue and U4b overspend+notifications if over budget). RED: GER validates another user's expense (VALIDADO, audit VALIDAR); registrant GER cannot (403, row untouched); COORD/COLAB 403; reject needs motivo; datos incompletos 409; non-REGISTRADO 409;
  void only VALIDADO by manager; queue ADM/GER only, cross-project, oldest first, `propio`; overspend: 409 OVERSPEND_BLOCKED, expense stays REGISTRADO, flagged, 1 notification per active GERENCIA (inactive skipped), second attempt no duplicates, after A raised same call 200 and flag cleared,
  equality passes; live DB: two concurrent validations cannot jointly exceed A (lock SQL pinned like `presupuesto.invariant.test.ts`), `Notificacion` unique `[usuario_id,tipo,gasto_id]` allows many NULL gasto_id rows; `notifications` GET returns the `proyectos` group and `read-all` marks it; panel renders it.
U5 Support access + log + E seam (~350). RED: download 200 ADM/GER/COORD-M, 403 non-member COORD/COLAB, 404 foreign project's soporte, one `acceso_soportes` row per issuance, none on denial, 500 without URL if the log insert fails, link soporte also logged; live DB UPDATE/DELETE/TRUNCATE rejected;
  `loadGastosValidados` returns only VALIDADO mapped to `rubroId`; financial-sheet BORRADOR keeps `ejecucion_disponible:false`; avance medio download unaffected for non-supports actors; no-storage-delete guard green.
U6 UI (~400; split U6a list+form+hooks, U6b actions+queue if needed). RED: section hidden/readable matrix; register button only for manager/COORD-M in EN_EJECUCION; form needs one soporte, sends valor as string, shows DUPLICADO and early-warning banners; list shows state chips, red flag, no ID/supports for non-supports actor; Validar/Rechazar hidden on own row,
  reject needs motivo; Anular manager-only; queue renders only for managers and disables own rows; hooks added to `project-list.test.tsx` factory.

## 9. Risks, SDD discrepancies, defaults (so work proceeds unattended)
1. SDD stale/wrong: notifications "UI already lists them"; multipart E-20; `rubro_id/A/P/E` names; VIS column (no role, flag unresolved); S5 helpers already exist (`validadoAcumulado`, `excederiaAsignado`); `ANULADO` in the SDD enum vs S4 void-by-timestamp (default: both, linked by CHECK).
2. Enum `ADD VALUE` cannot run in the same transaction as its use: put `SOBREGASTO_RUBRO` in its own migration file before the notification columns (Prisma wraps each migration in a transaction; `ADD VALUE IF NOT EXISTS` alone in a migration is fine).
3. Registration only in EN_EJECUCION (P10) means local manual QA needs `scripts/set-project-estado.ts` (S4) and tsx cannot run in this shell (use `node --env-file=.env.local`); seed lines with A > 0 are needed (budget PUT in BORRADOR first).
4. Overspend block must COMMIT the flag and notifications while answering 409: use a returned flag, never an exception. The A-raise path has no route until S8.3b; tests use direct updates. REQ-GAS-06 (A never below validated E) is an S8.3b rule: record it, do not implement it here.
5. Defaults needing PO confirmation (documented, not blocking): (a) notify only active GERENCIA, not ADM (SDD text; ADM sees the flag in lists/queue); (b) duplicate scope = REGISTRADO and VALIDADO in any project, matching on normalized id + document number (tipo ignored); (c) RECHAZADO may be corrected by the registrant (A-07), VALIDADO void by ADM/GER (A-08);
   (d) rejector also cannot be the registrant; (e) COORD-M may view supports of every expense of their projects (P04 "own" read as project membership) but edit only their own expenses; (f) registration only EN_EJECUCION, validate/reject/void in any estado of an existing project; (g) up to 5 soportes per registration; (h) `ejecucion_disponible` false for BORRADOR.
6. Third-party ID is personal data (RNF-04): never in audit `valor_nuevo` (log only masked last 3 digits or a boolean) and never in the financial-sheet payload; add a test asserting `auditoria_cambios` rows for gasto carry no `tercero_numero_id`.
7. Native review (RDD) candidates are per work-unit commit; DB-affecting units (U2, U4, U5) are medium/high risk by assessment; ask consent per candidate as in S4/S5. Money: strings/bigint only (`parseMonto`), never `Number`.
8. Known load-flakes (from S5): proyecto-secuencia invariant, user-menu, upload-dialog, task-dialog, change-password-dialog: rerun before blaming S6.
