# S4 mapping — Technical execution and semáforo (RF-12..RF-17)

Verified read-only mapping against code at `6b23a86` (2026-10-08). Source for the S4 feature doc.
SDD refs: §3.5 EXE, §3.6 TEC, §4.2, §4.8, §4.9, §5.5.

## 1. Exists vs assumed

Absent although the SDD says otherwise: `soportes_proyecto`/`AccesoSoporte`; `isValidExternalUrl`; project
attachments and upload-url routes; Documentos mirror for projects; `getProjectForExecution`/`gateEjecucionWrite`;
`ColorSemaforo`/`colorTecnicoV2`/`src/lib/semaforo.ts`; UI primitives `StatusChip`/`KpiTile`/`ProgressBar` (only
`Badge` exists); `cronograma-tab.tsx`. `Entregable` lacks `@@unique([id, proyecto_id])`. `Actividad.estado` is not
stored (derived, S3 decision 6). **No route moves a project BORRADOR -> EN_EJECUCION** (PATCH rejects `estado`;
only baseline approval E-25/S8.2 does, and it needs S5+S8).
Real `ParametrosV2` shape: `{valor, confirmado}` per key `umbral1, umbral2, tolerancia, retraso,
avance_requiere_medio, modificacion_bloquea_periodos_pasados`; `parseParametrosV2`, `getSemaforoParametrosV2()`
(src/lib/settings.ts).
Reusable: `todayInBogota/toDayNumber/daysBetweenInclusive/activityDates/IsoDate` (weeks.ts), `pesoEfectivo`
(actividad.ts), `logChange(s)`, `parseEstructuraBody`, `toDecimal2`, `cantidadPositivaField`, `isUniqueViolation`,
`conflict`, `loadProjectScoped`, `canReadProject`, `canExecuteProject`, `canManageProjects`, `INVALID_STATE`,
`AUDIT_ENTIDADES_V2` (has `avance`, `medicion`; add `beneficiarios`), `AccionAuditoria.ANULAR`, signed-upload infra
(`/api/v1/uploads/sign`, `signed-upload.ts`, `files.ts`), invariant-test pattern `prisma/estructura.invariant.test.ts`
(imports `./require-local-db` first, rollback), S3 routes and hooks, ficha mount point
`project-ficha-dialog.tsx` (stack of sections, no tabs).

## 2. Models (3 adoptive idempotent migrations, SQL style of `20261008122000_v2_entregables_indicadores`)

Conventions: uuid text id; `proyecto_id` denormalised on every child; composite FK `(parent_id, proyecto_id)` to the
parent's `(id, proyecto_id)` NO ACTION; partial unique indexes and CHECKs in SQL inside `DO $$ ... duplicate_object`
blocks; `Decimal(15,2)`; audit via `logChange` in the same transaction; audit-pointer columns plain (no FK).

`v2_avances`: add unique index `entregables_id_proyecto_id_key` on entregables(id, proyecto_id) and the Prisma
`@@unique`. Table `avances_entregable`: id, proyecto_id, entregable_id, fecha DATE, cantidad Decimal(15,2) CHECK >0,
observacion?, justificacion_exceso?, registrado_por_id, created_at, anulado_at?, anulado_por_id?, motivo_anulacion?;
CHECK `(anulado_at IS NULL) = (motivo_anulacion IS NULL)`; composite FK to entregables; unique (id, proyecto_id);
indexes (entregable_id, fecha) and (proyecto_id). Void, never delete (no deleted_at). Back-relations on Entregable
and Proyecto.
`v2_soportes_medios`: `soportes_proyecto`: id, proyecto_id, avance_id?, medicion_id?, nombre, storage_path?,
url_externa?, tipo_mime?, tamano_bytes?, subido_por_id, created_at, deleted_at?; composite FKs
(avance_id, proyecto_id) and (medicion_id, proyecto_id); CHECK exactly one parent
(`num_nonnulls(avance_id, medicion_id) = 1`); CHECK exactly one source (`num_nonnulls(storage_path, url_externa) = 1`);
indexes on avance_id and medicion_id. `gasto_id` and `AccesoSoporte` belong to S6.
`v2_mediciones_beneficiarios`: `mediciones_indicador` (indicador_id composite FK to indicadores(id, proyecto_id),
fecha, valor Decimal(15,2) CHECK >=0, observacion?, registrado_por_id, created_at, void columns as avances);
`registros_beneficiarios` (fecha, cantidad INT CHECK >0, actividad_id? composite FK to actividades(id, proyecto_id),
observacion?, registrado_por_id, created_at, void columns). No `migrado`/`sintetico_migracion` columns (no backfill).
Void rule REQ-EXE-07: voided rows are excluded from every calculation, listed in the ficha, audited with ANULAR.
Extend S3 delete guards: deliverable with live avances, indicator with live measurements, activity with live
beneficiarios -> 409.

## 3. API (withApiErrorHandling, requireApiUser, force-dynamic, parseEstructuraBody, order 404 -> 403 -> 409 -> 400)

`gateEjecucionWrite(usuario, proyectoId)` in `src/lib/api/ejecucion.ts`: `loadProjectScoped` (404), `canExecuteProject`
with `es_miembro` (403 "No tienes permisos sobre este proyecto."), `estado !== "EN_EJECUCION"` -> 409 INVALID_STATE
"El proyecto aún no tiene línea base aprobada.". ADM/GER always pass; member COORDINADOR passes; non-member
COORDINADOR, VIS, COLAB get 403. Void gate: 404, `canManageProjects` 403, non-empty `motivo` (1..500), allowed in any
estado. Read gate: membership-aware read (extend `gateEstructuraRead` or use `loadProjectScoped` to also get estado).

| Route | Roles | Notes |
|---|---|---|
| GET/POST projects/[id]/deliverables/[deliverableId]/progress | read / gateEjecucionWrite | body `{fecha, cantidad, observacion?, justificacion_exceso?}` strict; fecha <= todayInBogota() else 400 "La fecha del avance no puede ser posterior a hoy."; cumulative counted + cantidad > meta without justificacion -> 400; audit CREAR avance; 201 `{avance, cuenta}` |
| POST .../progress/[progressId]/void | ADM, GER | `{motivo}`; already void -> 409 |
| GET/POST projects/[id]/progress/[progressId]/attachments | read / gateEjecucionWrite | file confirm `{storage_path, nombre, tamano_bytes, tipo_mime?}` or link `{url_externa, nombre}`; void avance -> 409 |
| POST projects/[id]/uploads/sign (or kind in /uploads/sign) | gateEjecucionWrite | new `SignedUploadTarget` kind `proyecto_soporte`, key `proyectos/{proyectoId}/soportes/{uuid}_{sanitized}` |
| GET/POST projects/[id]/indicators/[indicatorId]/measurements, POST .../[mid]/void | read / gateEjecucionWrite / ADM,GER | body `{fecha, valor, observacion?}`; response includes `ultima`, `tendencia` |
| GET/POST projects/[id]/beneficiaries, POST .../[bid]/void | read / gateEjecucionWrite / ADM,GER | body `{fecha, cantidad Int>0, actividad_id?, observacion?}`; GET returns `{registros, total}` (non-void sum) |
| GET projects/[id]/technical-status?corte=AAAA-MM-DD | read | default corte todayInBogota(); returns `{corte, avance_real, avance_programado, desviacion_pp, color, alerta?, actividades:[{id,codigo,peso,progreso,estado}], umbrales:{umbral1,umbral2,confirmado}}`; bad corte 400; `base` echoed "vigente" until S8 |

Reaching EN_EJECUCION: DO NOT add a route in S4. Tests set `estado` with Prisma; for manual QA add a guarded local
script `scripts/set-project-estado.ts` (loads `.env.local`, refuses non-loopback like prisma/seed.ts and
scripts/reset-demo.ts, dry-run first, `--apply`). Stopgap start route rejected as pre-empting S8.2.

## 4. Pure libs and fixtures

`src/lib/proyectos/avance.ts` (no db, no next imports): `avanceEntregable = min(1, acum/meta)` (meta<=0 -> 0);
`avanceActividad` = mean of its entregables ([] -> 0); `avanceReal = Σ(peso·act)/Σpeso` (Σpeso 0 -> 0);
`fraccionTiempo = clamp((corte-inicio+1)/(fin-inicio+1), 0, 1)` via toDayNumber; `avanceProgramado =
Σ(peso·fraccion)/Σpeso`; `desviacionPp = (programado - real)·100`; `acumuladoContable(avances, requiereMedio)` sums
cantidad where not void and (not requiereMedio or has medio); `estadoActividad` FINALIZADA (progress 1, reached on or
before fin) / FINALIZADA_CON_RETRASO / EN_CURSO (progress>0 or corte>=inicio) / NO_INICIADA; `tendencia(ultima,
previa)`; `fecha_cumplimiento` = date of the avance (ordered by fecha, created_at) where the running counted sum
first reaches meta. Plain numbers; convert Decimal with `Number(x.toString())`.
`semaforo-v2.ts` additions: `type ColorSemaforo = "verde"|"amarillo"|"rojo"`; `colorTecnicoV2(desviacionPp,
{umbral1, umbral2})`: <= umbral1 verde, <= umbral2 amarillo, else rojo; negative is verde; beware float (round to 1
decimal or compare in tenths; 10.0 verde, 10.1 amarillo, 20.0 amarillo, 20.1 rojo). Params consumed from
`getSemaforoParametrosV2()`; `umbrales.confirmado = umbral1.confirmado && umbral2.confirmado`; tolerancia/retraso
unused until S5.
Golden F-T1 (`src/lib/proyectos/__fixtures__/tecnico.ts`), project start 2026-10-05, corte 2026-10-25. Activities
1.1 w1 (10-05..10-11, peso 1), 1.2 w2 (10-12..10-18, 1), 1.3 w3 (10-19..10-25, 1), 1.4 w3-6 (10-19..11-15, 4).
Entregables meta/counted: 1.1-E1 2/2, 1.1-E2 1/1, 1.2-E1 2/1, 1.3-E1 2/0, 1.4-E1/E2/E3 2/0. Expected activity
progress 1, 1, 0.5(1.2 mean of 1.2 deliverables as given), 0, 0; fractions 1,1,1,0.25; real = 1.5/7 = 0.2143;
programmed = 4/7 = 0.5714; deviation 35.7 pp, rojo (with 10/20). F-T1b: add an uncounted avance of 1 on 1.3-E1:
unchanged when requiereMedio=true; with requiereMedio=false activity 1.3 = 0.25 and real = 1.75/7 = 0.25.
NOTE: re-derive the fixture arithmetic from the formulas in the test (the mapper's table has activity-progress
inconsistencies); the formulas above are authoritative, the expected 35.7 pp / 21.4 % / 57.1 % must hold.

## 5. Storage for medios

Reuse `files.ts` (`MAX_FILE_BYTES`, `isAllowedNameAndMime`, `sanitizeFileName`, `STORAGE_BUCKET`) and the ADR-13
signed-upload flow (browser uploads to a signed URL, server confirms with metadata and enforces
`storedObjectSize <= MAX_FILE_BYTES`, as src/app/api/v1/tasks/[id]/attachments/route.ts does). Add
`proyecto_soporte` to `SignedUploadTarget`/`targetStoragePrefix`/`assertKeyBelongsToTarget` and a
`proyectoSoportePath` helper. Add `isValidExternalUrl(url)` to files.ts (`new URL`, https only, length <= 2000).
No multipart path. No Documentos mirror (deferred). Never delete from storage (guard test
src/lib/api/no-storage-delete.test.ts); soft delete only. Download via 60 s signed URL, permission `canReadProject`.
Mock `createSupabaseAdmin` in unit tests as the tasks route tests do.

## 6. UI

New section after Estructura (project-ficha-dialog.tsx ~202): `project-ejecucion.tsx` (hint when BORRADOR; content
for EN_EJECUCION/SUSPENDIDO/CERRADO) with `ejecucion-avance.tsx` (per activity a `<progress>` + semáforo Badge; per
entregable meta, counted, "Pendiente de soporte" counter, "Registrar avance"), `avance-form.tsx` (fecha max today,
cantidad, observación, justificación_exceso only when over goal, medio file or https link: create avance, sign,
upload, confirm), `ejecucion-indicadores.tsx` (last, trend, history, form), `ejecucion-beneficiarios.tsx`,
`semaforo-tecnico.tsx` (renders API color, real, programado, desviación, corte date, "No confirmado" badge; never
recomputes the color). Write controls: `canManageProjects` OR COORDINADOR who is an active member (check whether
`useProjectMembers` is readable by a COORDINADOR; else expose `permisos.ejecucion` from the project item); void
buttons managers only; API is the authority. Hooks in src/hooks/projects.ts following the existing pattern.

## 7. Work units (strict TDD)

U1 pure libs (~300): avance.ts, fixtures, colorTecnicoV2, tendencia. RED: F-T1, F-T1b, no-activities 0 not NaN,
four estados, boundaries, Σpeso 0.
U2 avances backend (~400): migration v2_avances (+entregables unique), ejecucion.ts gate, progress routes + void,
deliverable-delete guard, AUDIT_ENTIDADES_V2, OpenAPI, `scripts/set-project-estado.ts`. RED: invariant (cantidad>0,
anulación CHECK, cross-project FK); route matrix 201 COORD-M/ADM/GER, 403 non-member COORD/VIS/COLAB, 409 BORRADOR,
404, future date 400, over-goal rules, `cuenta` false when requiereMedio, void needs ADM/GER + motivo and keeps row.
U3 medios (~380): migration v2_soportes_medios, isValidExternalUrl, signed-upload target, sign/confirm/link routes,
download. RED: CHECKs, key-belongs-to-target (sibling prefix attack), http: link 400, ext+mime, oversize, `cuenta`
becomes true after attaching, never-delete guard green.
U4 mediciones + beneficiarios (~400): two tables, routes + void, guards, hook types. RED: trend sube/baja/igual,
first has no trend, void excluded, beneficiaries sum excludes void, cross-project actividad 400, 403/409 matrix.
U5 technical-status (~300): route, fecha_cumplimiento, OpenAPI. RED: F-T1 end-to-end (red, confirmado=false),
bad corte 400, param avance_requiere_medio=false, 404/403.
U6 UI (~400): hooks + ejecucion section + mount. RED: hidden hint in BORRADOR, write controls manager/member COORD
only, future date blocked, exceso field, pending-support badge, semáforo corte + "No confirmado", ficha mount (stub
new hooks in existing ficha/list tests).
Order U1, U2, U3, U4, U5, U6.

## 8. Risks and default decisions

Risks: float at 10.0/10.1; cumulative cap check is racy -> do sum + insert in a transaction with a row lock on the
entregable (`SELECT ... FOR UPDATE` via $queryRaw); EN_EJECUCION unreachable from the UI until S8.2 (QA via script);
Supabase Storage mocked in unit tests; slow `/mnt/c` suite (known flakes: prisma/proyecto-secuencia.invariant.test.ts,
user-menu, upload-dialog, task-dialog, change-password-dialog); native review needs consent (pending).
Defaults: no transition route; `avance_requiere_medio` true (counted = at least one non-deleted medio); void any
estado for ADM/GER, create only EN_EJECUCION; medición valor >= 0 and fecha <= today, trend by (fecha, created_at);
beneficiarios total vs meta shown as plain numbers; estadoActividad derived on read; Documentos mirror deferred;
medio can be added after the avance exists, not to a voided one (409); technical-status echoes base "vigente".
