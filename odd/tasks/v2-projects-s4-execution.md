# Muttu Hub v2 — S4 Technical execution and semáforo (avances, medios, mediciones, beneficiarios, technical status)

Parent plan: `odd/tasks/v2-projects-sdd.md` (§3.5 EXE, §3.6 TEC, §4.2, §4.8, §4.9, §5.5), ledger
`odd/tasks/v2-projects-execution.md`, verified mapping `odd/tasks/v2-projects-s4-map.md` (read it: it holds the
formulas, the F-T1 golden numbers, route tables and defaults). Branch: `feat/projects-v2`.

## Objective

Authorized users register progress (avances) against deliverables of an EN_EJECUCION project, attach supporting media,
record indicator measurements and beneficiaries, and read a technical semáforo (real vs programmed progress, color).

## Decisions (defaults, no PO answer yet; revisit with feedback)

1. No route moves a project to EN_EJECUCION in S4 (that is baseline approval, S8.2). Tests set `estado` via Prisma;
   manual QA uses the guarded local script `scripts/set-project-estado.ts` (dry-run default, `--apply`, loopback only).
2. Create access: ADM/GER or an active-member COORDINADOR (`gateEjecucionWrite`), only while EN_EJECUCION
   (409 INVALID_STATE otherwise). Void: ADM/GER only, non-empty `motivo` (1..500), any estado. Order 404 -> 403 -> 409 -> 400.
3. Void, never delete (REQ-EXE-07): voided rows are excluded from every calculation, audited with ANULAR.
4. `avance_requiere_medio` defaults to true: an avance counts (`cuenta`) only with at least one non-deleted medio.
5. Cumulative counted quantity above the deliverable goal needs `justificacion_exceso` (400 otherwise); the check and the
   insert run in one transaction with a row lock on the entregable.
6. `fecha` of an avance and a measurement cannot be after `todayInBogota()`.
7. Medios: signed-upload flow only (ADR-13), 60 s signed download, https links only, never delete from storage.
   A medio can be added to an existing avance, not to a voided one (409). No Documentos mirror (deferred).
8. `estadoActividad` is derived on read (FINALIZADA, FINALIZADA_CON_RETRASO, EN_CURSO, NO_INICIADA), never stored.
9. technical-status echoes `base: "vigente"` until S8; tolerancia/retraso parameters unused until S5.
10. Delete guards: deliverable with live avances, indicator with live measurements, activity with live beneficiarios -> 409.

## Constraints

- Local only; no push, PR or remote write. Every DB command loads `.env.local` explicitly.
- Artifacts in English; user-facing messages in Spanish. Conventional commits, no attribution.
- TDD **on**. Runner: `TZ=America/Bogota npx vitest run <path>`; typecheck `npx tsc --noEmit`.
- Delivery strategy `ask-on-risk`; ~400 lines/unit advisory.
- Native review: RDD needs per-candidate human consent; recorded as pending.

## Tasks

Route: delegated writer in two rounds (round 1: U1-U3, round 2: U4-U6).

- [ ] **U1** Pure libs: `src/lib/proyectos/avance.ts`, `__fixtures__/tecnico.ts`, `colorTecnicoV2`/`ColorSemaforo`, tendencia.
- [ ] **U2** Avances backend: migration `v2_avances`, `ejecucion.ts` gates, progress + void routes, delete guard,
  `beneficiarios` audit entity, OpenAPI, `scripts/set-project-estado.ts`.
- [ ] **U3** Medios: migration `v2_soportes_medios`, `isValidExternalUrl`, `proyecto_soporte` upload target,
  sign/confirm/link routes, signed download, `cuenta` from live medio.
- [ ] **U4** Mediciones + beneficiarios: tables, routes + void, guards, tendencia in response.
- [ ] **U5** `GET projects/[id]/technical-status`, `fecha_cumplimiento`, OpenAPI.
- [ ] **U6** UI: hooks, ejecucion section, semáforo, ficha mount.

## Acceptance

- Every RED test exists, was observed failing, then passes. `tsc` clean; full vitest green under `TZ=America/Bogota`
  (known load-flakes recorded honestly). F-T1 golden: real 21.4 %, programmed 57.1 %, deviation 35.7 pp, rojo.

## Progress

- 2026-10-08: document created from the S4 map.

## Next step

U1.
