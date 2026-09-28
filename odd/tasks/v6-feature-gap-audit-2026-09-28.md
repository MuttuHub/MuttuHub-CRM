# Muttu Hub v6 — Gap Audit (read-only)

Date: 2026-09-28. Branch: `local/todo-integrado`. Sources: `design_handoff_muttu_hub_v6/Muttu Hub v6.dc.html`, `referencia/Auditoria v6.dc.html` (embedded JS data, dated 25 sept 2026 — **written before F0.1/F0.2 and F1.1–F1.6 landed**, so several of its "falta"/"parcial" screen statuses are now stale; this report re-verifies each against the current tree and calls out where the Auditoría text is outdated). All facts below cite file paths I actually read; anything not confirmed against code is labeled "assumption" or "per Auditoría (unverified against code)".

## 1. Executive summary

| Status | Count |
|---|---|
| Implemented | 15 |
| Partial | 9 |
| Missing | 4 |
Screens counted: 28 (from Auditoría's `PANT` table, re-graded below).

Requirement rows (`REQ`, 23 total incl. roles): backend 21 Cumple / 1 Parcial (RF-C03, WARNING-2) / 0 Falta / 1 N/A. UI: after re-grading with F0–F1 done, UI is now ~13 Cumple / 7 Parcial / 3 Falta (Auditoría's original count of 5/9/9 is stale — F1.1–F1.6 closed most of the "Falta" UI rows).

## 2. Screens vs app (re-graded from Auditoría `PANT`, verified against code)

| Screen | v6 group | Codebase target | Status | Evidence |
|---|---|---|---|---|
| Acceso | Transversal | `src/app/(auth)/login` | **Implemented** | per Auditoría, not re-verified (out of scope, unrelated to F0-F1) |
| Inicio | Transversal | `src/app/(app)/page.tsx`, `dashboard-page.tsx` | **Implemented** | 5 "caras" incl. management (F1.6) |
| Aliados · lista y ficha | Clientes | `src/app/(app)/clientes/page.tsx`, `src/components/crm/client-list.tsx`, `client-sheet.tsx` | **Implemented** | confirmed, single page (no tab strip; see §4) |
| Pipeline de oportunidades (dedicated kanban) | Clientes | `client-sheet.tsx` (list only), `src/components/dashboard/cara-pipeline.tsx` (funnel/bar chart) | **Partial** | `cara-pipeline.tsx`: "embudo por estado con barras horizontales", not a drag/drop kanban with movable cards. Auditoría F2.3 not started (no commit since 25 sept touches this). |
| Ficha de oportunidad | Clientes | `src/components/crm/entity-dialogs.tsx` — `OportunidadFormDialog` (line 325) + `OportunidadLifecycleDialog` (line 818) | **Partial** | Lifecycle dialog exists (since PR #46, `039918b`, 18 sept) and shows estado/fase badge, linked tasks, bitácora, conversion CTA — more built than the Auditoría text implies. Still missing: vertical timeline of dated events, proposal-sections checklist, and "Propuesta económica" tab (no `PropuestaEconomica` model — confirmed absent from `prisma/schema.prisma`). Still a dialog, not the full page/sheet v6 wants. |
| Interacciones | Clientes | `BitacoraEntrada` in `client-sheet.tsx` | **Partial** | `model BitacoraEntrada` (schema.prisma:301) has only `texto`, `autor_id`, `oportunidad_id` — no `tipo`/`proximo_paso`/`fecha_proximo_paso`. No global cross-client view, only per-client tab. |
| Relaciones · poder/interés | Clientes | `Contacto` model + `client-sheet.tsx` | **Missing** (design says F4, not F0-F3) | `model Contacto` (schema.prisma:193) has only `rol_decision: RolContacto?` — no `poder`/`interés`/`fuerza`/`dueño interno` fields. No 2×2 matrix UI. |
| Convocatorias · Salud · Mapa | Clientes | — | **Missing** (design only, F4.3) | no route/component found |
| Automatizaciones | Clientes | `src/app/api/v1/cron/daily`, `src/app/api/cron/daily` | **Partial** | fixed due-date notification rules only, no configurable rule builder |
| Tareas (kanban) | Transversal | `src/app/(app)/tablero`, `src/components/kanban/kanban-board.tsx` | **Implemented** | unaffected by this audit's scope |
| Proyectos · lista | Tablero | `src/app/(app)/proyectos`, `project-list.tsx` | **Implemented** | |
| Nuevo proyecto (5-step wizard) | Tablero | `src/components/proyectos/project-form.tsx` (414 lines) | **Partial** | grep for `step`/`Step`/`wizard`/`Stepper` → 0 matches. Single form, not v6's 5-step wizard with stepper. Not in F0-F4 action plan at all (gap in the plan itself, see §6). |
| Proyecto · Resumen | Tablero | `tabs/resumen-tab.tsx` | **Implemented** | |
| Proyecto · Metas | Tablero | `tabs/metas-tab.tsx` | **Implemented** (F1.4, done 2026-09-28) | commits `4285ec2`/`46a84d3`/`66d7fec`; upgrades Auditoría's stale "Falta" |
| Proyecto · Cronograma | Tablero | `tabs/cronograma-tab.tsx` | **Implemented** (F0.2, done) | commit `e78f7ee` |
| Proyecto · Gantt | Tablero | `tabs/gantt-tab.tsx` | **Implemented** (F0.2, done) | committed pre-audit, kept read-only by design |
| Proyecto · Indicadores | Tablero | `tabs/indicadores-tab.tsx` | **Implemented** (F0.2, done) | |
| Proyecto · Financiero | Tablero | `tabs/financiero-tab.tsx` | **Implemented** (F1.1, done) | commit `14ce6db` |
| Proyecto · Legalización | Tablero | `tabs/legalizacion-tab.tsx` | **Implemented** (F1.2, done) | commits `a06ce4d`/`c86b532`; `Gasto.tercero`/`numero_comprobante`/`observado`/`observacion` confirmed in schema (lines 699-702). Migration `20260928120000_legalizacion_gasto` generated but **not yet applied to any DB** per `muttu-hub-v6-f0-f1.md` F1.2 note — verify before demo. |
| Proyecto · Soportes | Tablero | `tabs/soportes-tab.tsx` | **Implemented** (F1.3, done) | commits `68e7275`/`2a80cf0` |
| Proyecto · Ficha de seguimiento (Curva S mensual + replaneación) | Tablero | — | **Missing** | No `PlanMensual` model in schema (confirmed: model list has no such entry). F3.2, not started. |
| Proyecto · Beneficiarios | Tablero | `Indicador.cuenta_beneficiarios` (aggregate only) | **Missing** | No `RegistroAtencion` model (confirmed absent). Only an aggregate KPI count exists, no per-activity/municipio/grupo records tab. F3.3, not started. |
| Proyecto · Equipo | Tablero | `Proyecto.responsable_id` (single FK) | **Missing** | `model Proyecto` (schema.prisma:550) still has one `responsable_id String`, no `ProyectoMiembro` join table. **Not scheduled in any F0-F4 item** — a gap in the Auditoría's own action plan (only mentioned in the `BRE` data-gaps table, never promoted to a `FAS` phase item). |
| Modo campo | Tablero | — | **Missing** | no mobile field-mode route/component found; F3.1, not started |
| Tablero gerencial | Tablero | `src/app/(app)/page.tsx` `cara-management.tsx`, `/tablero-gerencial` (308 redirect) | **Implemented** (F1.6, done) | one route now (`/?cara=management`); 5-axis radar, per-project bars, territorial semaforización, doble-conteo warning — commits `86682c9`…`befa554` |
| Reportes | Transversal | `src/components/reportes/reportes-page.tsx` | **Partial** | covers `pipeline`/`tasks`/`clients-activity`/`my-summary` (4 caras) + tareas report (line 36-41). **No 5th tab for the `management` cara** (financial/project reports) — confirmed by reading the `CARAS` array. Matches Auditoría's "no hay reportes de proyecto ni financieros", still true after F1.6. |
| Repositorio | Transversal | `src/app/(app)/documentos`, `repository-list.tsx` | **Implemented** | |
| Administración | Transversal | `src/app/(app)/administracion/page.tsx` | **Partial** | Confirmed sections: Usuarios (`users-table.tsx`), Catálogos (`catalogs-section.tsx`), **Semáforos** (`umbrales-section.tsx`, now includes `indicador` band editing per F1.5), Accesos (`accesos-section.tsx`), Auditoría (`audit-log-section.tsx`). **No "Roles y permisos" visual matrix** (✓/—/Propios/Lectura) anywhere in the section list — confirmed by reading `administracion/page.tsx` in full (only 5 sections mounted, no matrix component exists). |

## 3. Requirement traceability (Auditoría `REQ`, re-graded)

All backend/model/API rows (`RF-C01–C04`, `RNF-C01–C02`, `RF-01`, `RNF-03`) remain **Cumple** — unaffected by this session's work, not re-verified beyond the schema read in §4.

| Req | Topic | Auditoría UI status (25 sept) | Re-graded UI status (28 sept) | Notes |
|---|---|---|---|---|
| RF-02 | Actividad→meta, Cronograma/Gantt | Parcial (uncommitted) | **Cumple** | F0.2 merged the 3 tabs |
| RF-03 | Semáforo técnico | Parcial (no umbral screen) | **Cumple** for editing (F1.5); umbral *values* still pending client sign-off (F0.4, D0.4) |
| RF-04 | Soportes/medios de verificación | Falta (no tab) | **Cumple** | F1.3 |
| RF-05 | Financiero por rubro | Falta (no tab) | **Cumple** | F1.1 |
| RF-06 | Legalización | Falta (no tab) | **Cumple** | F1.2 |
| RF-07 | Semáforo financiero UI | Parcial (missing alert card) | **Cumple** | F1.1 built the alert card |
| KPI 1–5 | Tablero gerencial visualizations | Parcial (2 routes) | **Cumple** | F1.6 unified route + added radar/bars |
| KPI 6 | Beneficiarios | Parcial (double-count risk) | **Cumple** (warning added), records-by-group still **Falta** | F1.6 added the warning; `RegistroAtencion` (F3.3) still not built |
| RNF-01 | Modo campo | Parcial (no field view) | **unchanged — Falta** | not part of F0-F1 scope |
| Roles | 3 vs 4 profiles | Parcial (mapping undocumented) | **unchanged — Parcial** | see §5 |
| RF-C03 | Ciclo comercial (WARNING-2) | Parcial | **unchanged — Parcial**, but with more built than the audit text implies (`OportunidadLifecycleDialog` since 18 sept) | see §2 |

## 4. Data-model gaps (Auditoría `BRE`, verified against `prisma/schema.prisma`)

| Model | Requirement | Gap | Verified? |
|---|---|---|---|
| `BitacoraEntrada` | RF-C03 | No `tipo`, `proximo_paso`, `fecha_proximo_paso` | **Confirmed** (schema.prisma:301-320: only `texto`, `autor_id`, `oportunidad_id`) |
| `Tarea` | RF-C02 | No task-type catalog, uses free `etiquetas: String[]` | **Confirmed** (schema.prisma:251-298) |
| `PropuestaEconomica` (new model) | RF-C03/C04 | Doesn't exist | **Confirmed absent** from model list |
| `Gasto` | RF-06 | `tercero`/`numero_comprobante`/`observado`/`observacion` | **Now present** (F1.2 added them, schema.prisma:699-702) — Auditoría's gap is **closed**, but migration not yet applied to any DB (see §2 Legalización row) |
| `PlanMensual` (new model) | RF-03 | Doesn't exist | **Confirmed absent** |
| `RegistroAtencion` (new model) | KPI 6 | Doesn't exist | **Confirmed absent** |
| `Contacto` | Relaciones | No `poder`/`interés`/relationship strength/`dueño` | **Confirmed** (schema.prisma:193-208: only `rol_decision`) |
| `Proyecto` | RF-01 | Single `responsable_id`, no `ProyectoMiembro`, single `linea_estrategica` (v6 shows two) | **Confirmed** (schema.prisma:550-603) |
| `Oportunidad` | RF-C03 | Enum (`DISENANDO_PROPUESTA/PRESENTADA/EN_REVISION/EN_NEGOCIACION/GANADA/PERDIDA/STANDBY`) vs v6 UI names (Revisión TDR/Sin iniciar/Planeación/En formulación/Enviada/Aceptada/Rechazada) | **Confirmed** (schema.prisma:55-63) — a naming/UI-mapping decision, not a schema change (per Auditoría's own recommendation, DEC table) |

## 5. Role/permission mismatches (verified against `src/lib/permissions.ts` + `src/lib/nav.ts`)

- Code has **4 roles** (`RolUsuario`: ADMINISTRADOR/GERENCIA/COORDINADOR/COLABORADOR) + **2 orthogonal flags** (`gestiona_oportunidades`, `puede_ver_tablero_gerencial`), confirmed in `permissions.ts`.
- v6 design documents **4 perfiles**: Administrador, Comercial, Gestor de proyecto, Visualizador.
- Mapping (per Auditoría's recommended decision, not yet formally signed off — F0.4 open): Comercial = COLABORADOR + `gestiona_oportunidades`; Visualizador = `puede_ver_tablero_gerencial` flag; Gestor de proyecto = `Proyecto.responsable_id` match (`canManageProject`/`canViewProject` in `permissions.ts:90-103`).
- **No UI surfaces this mapping** — confirmed: `administracion/page.tsx` has no "Roles y permisos" matrix component (§2).
- Deliberately out of scope (per task framing, not re-verified): Visualizador landing on tablero gerencial, hiding "Inicio" nav item for Visualizador.
- `nav.ts` (read in full): flat two-group nav (Operación/Dirección), no v6-style CRM tab strip under `/clientes`.

## 6. Auditoría action plan F0–F4 (source: embedded `FAS` JS array in `Auditoria v6.dc.html`)

| Item | Description | Size | Status (verified) |
|---|---|---|---|
| F0.1 | Merge PRs #44-46, archive `oportunidades-comerciales` | S | **Done** — merged 17 sept, archived 28 sept (`odd/tasks/muttu-hub-v6-f0-f1.md`) |
| F0.2 | PR Cronograma/Gantt/Indicadores tabs, delete dead code | S | **Done** — commit `e78f7ee` |
| F0.3 | Repair Docker/e2e for opportunity cycle | S | **Open** — explicitly out of scope per task framing |
| F0.4 | Client decision session (umbrales, roles) | S | **Open** — Auditoría's DEC recommendations used as interim default |
| F1.1 | Pestaña Financiero | M | **Done** — commit `14ce6db` |
| F1.2 | Pestaña Legalización + registro de gasto | M | **Done** — commits `a06ce4d`/`c86b532` (migration not yet applied) |
| F1.3 | Pestaña Soportes | S | **Done** — commits `68e7275`/`2a80cf0` |
| F1.4 | Pestaña Metas | S | **Done** — commits `4285ec2`/`46a84d3`/`66d7fec` |
| F1.5 | Umbrales editables en Administración | S | **Done** — commit `90db05b` |
| F1.6 | Tablero gerencial unificado | M | **Done** — commits `86682c9`…`befa554` |
| F2.1 | Bitácora tipo/próximo paso + vista global Interacciones | M | **Not started** — no matching commit, schema unchanged |
| F2.2 | Vista de ciclo de vida de oportunidad | M | **Partially pre-existing** — `OportunidadLifecycleDialog` (18 sept, PR #46) covers estado/fase/tareas/bitácora/convert, but not the full dated-events timeline v6 shows |
| F2.3 | Pipeline kanban de oportunidades | M | **Not started** — `cara-pipeline.tsx` is a funnel chart, not a movable kanban |
| F2.4 | Tipo de tarea comercial (catálogo) | S | **Not started** |
| F2.5 | Propuesta económica → alimenta conversión | L | **Not started** — no `PropuestaEconomica` model |
| F3.1 | Modo campo móvil | M | **Not started** |
| F3.2 | Ficha de seguimiento mensual (`PlanMensual`) | L | **Not started** |
| F3.3 | Registros de atención de beneficiarios | M | **Not started** |
| F3.4 | Resolver hallazgos UX restantes (Parte C) | M | **Done** per `odd/tasks/proyecto-workspace-tabs-y-ux-audit.md` — 12/12 items closed (7 real fixes, 1 seed-data fix, 4 verified false positives), only 3 low-priority nice-to-haves left unstarted by explicit user decision |
| F4.1 | Relaciones: poder/interés/dueño | M | **Not started** |
| F4.2 | Salud de cuenta calculada | M | **Not started** |
| F4.3 | Convocatorias/Mapa/Automatizaciones | L | **Not started** (design only) |
| F4.4 | Roadmap CRM (8 features, see `Muttu Hub - Roadmap CRM.dc.html`) | L | **Not started**, not detailed further in this audit (explicitly deferred, per task scope) |

Note: **"Proyecto · Equipo"** and **"Nuevo proyecto" 5-step wizard** are real v6 screens with no corresponding `FAS` item at all — a gap in the plan itself, not just in the code (see §2).

## 7. Prioritized gap list

### P1 (blocks a v6 core flow / explicitly on the Auditoría plan)

| Item | Size | Migration? | Why P1 |
|---|---|---|---|
| F2.1 Bitácora tipo/próximo paso + global Interacciones view | M | Yes (additive on `BitacoraEntrada`) | Blocks RF-C03 core CRM flow; WARNING-2 from the verify report |
| F2.3 Pipeline kanban de oportunidades | M | No | Core commercial pipeline UX explicitly required by RF-C01/RNF-C02 |
| F2.5 Propuesta económica | L | Yes (new model `PropuestaEconomica`) | Blocks RF-C04 conversion-with-budget flow; also feeds Ficha de oportunidad |
| F3.2 Ficha de seguimiento mensual (`PlanMensual`) | L | Yes (new model) | RF-03; team's stated current workaround is Excel — direct business pain point |
| F3.1 Modo campo móvil | M | No (UI on existing APIs) | RNF-01, explicit requirement, currently 0% built |
| Legalización migration not yet applied | S | Apply existing migration | Feature code exists but is inert against any real DB until applied — verify before any demo/handoff |

### P2

| Item | Size | Migration? |
|---|---|---|
| F3.3 Registros de atención de beneficiarios (`RegistroAtencion`) | M | Yes (new model) |
| F2.2 Full ciclo-de-vida timeline + proposal checklist (beyond current dialog) | M | No |
| F2.4 Tipo de tarea comercial (catálogo) | S | Small (catalog in settings, no new table) |
| Proyecto · Equipo (`ProyectoMiembro`) | M | Yes (new join table) — **not in any Auditoría phase, needs its own task** |
| Nuevo proyecto 5-step wizard | M | No | **not in any Auditoría phase, needs its own task** |
| Administración: Roles y permisos matrix | S | No | closes the role-mapping documentation gap (§5) |
| Reportes: 5th tab for `management` cara (financial/project reports) | S | No |
| F0.4 Client decision session (umbrales, role mapping) | S | No | unblocks several other items' "final" status |
| F0.3 Docker/e2e repair | S | No | explicitly out of scope for this audit per task framing |

### P3 (cosmetic / design-only, F4 backlog)

| Item | Size | Migration? |
|---|---|---|
| F4.1 Relaciones poder/interés/dueño | M | Yes (`Contacto` fields) |
| F4.2 Salud de cuenta calculada | M | No |
| F4.3 Convocatorias/Mapa/Automatizaciones (rule builder) | L | Yes (multiple new models, design-only today) |
| F4.4 Roadmap CRM (8 features) | L | Unknown, not detailed in this pass |
| Nice-to-haves from UX audit (#11 `/` vs `/tablero-gerencial` redundancy label, #14 Cronograma semáforo color-only, #15 Documentos tooltip) | S each | No |

## 8. Assumptions / not independently verified

- Acceso (`/login`) and Repositorio (`/documentos`) graded "Implemented" per Auditoría text only — not re-read in this pass (out of scope, no v6 gap expected).
- F0.3/F0.4 status taken from the task's framing ("Known open") and `muttu-hub-v6-f0-f1.md`, not re-investigated (explicitly out of scope: no Docker/DB commands run, per instructions).
- RNF-02 (performance, "p95 648ms") not re-measured — Auditoría itself flags this as "reportado, no re-medido".
- F4.4 Roadmap CRM's 8 features were not individually enumerated — the source doc (`Muttu Hub - Roadmap CRM.dc.html`) was not opened in this pass; treat this row as a placeholder pointer, not a graded finding.
