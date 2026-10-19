# v7 prototype vs implemented app: gap analysis

Sources: `Muttu Hub v7.dc.html` (React-like template; style-stripped copy in scratchpad v7.txt), diffed against v6. Repo: feat/projects-v2.

## What changed v6 -> v7
Only a light/dark theme system (CSS tokens, `toggleTheme`, "Modo claro/oscuro" buttons in sidebar and login, light is default). No new screens, no new sections. The app already has a theme toggle (`src/components/shell/header.tsx`, `use-theme`). v7 CRM sub-nav is actually 8 tabs: Aliados, Oportunidades, Interacciones, Relaciones, Convocatorias (extra, not in the user's list), Salud, Mapa, Automatizaciones. v7 has NO in-app guide/help text (rg for guia/ayuda/tour/help: zero hits). Only inline microcopy (e.g. "La conversion a proyecto se habilita cuando la oportunidad pasa a Aceptada", "Toda tarea comercial queda amarrada a una oportunidad").

All v7 CRUD is create-only and client-state-only (no edit/delete anywhere). Dialogs (`openM`): aliado, opp, tarea (inside opp), inter, gasto, soporte, benef.

## Current app CRM baseline
- One route `/clientes` -> `ClientList` (src/components/crm/client-list.tsx, 1357 lines): filters + 3 views (Tarjetas/Lista/Detalles), saved views, print/export. Click opens `ClientSheet` (client-sheet.tsx, 1634 lines) with tabs General, Contactos, Oportunidades, Compromisos, Bitacora, Documentos, Tareas relacionadas.
- No sub-navigation, no cross-client opportunities page, no cross-client interactions page.
- Prisma: `Cliente` (estado 7 values, tipo, prioridad, responsable), `Contacto` (rol_decision DECISOR/TECNICO/INFLUENCIADOR/OTRO), `Oportunidad` (estado DISENANDO_PROPUESTA/PRESENTADA/EN_REVISION/EN_NEGOCIACION/GANADA/PERDIDA/STANDBY, fase PROSPECCION/EJECUCION, valor_estimado_cop, fecha_envio_propuesta, fecha_adjudicacion), `Tarea` (+ oportunidad_id), `BitacoraEntrada` (only `texto`, optional oportunidad_id, immutable), `Notificacion`, `Setting`, `Municipio` (departamento string), cron daily (src/app/api/cron/daily).
- API: `/api/v1/clients`, `/clients/[id]`, `/contacts`, `/opportunities` (+ `[id]`, `/tasks`, `/convert`, `/project`), `/log`, `/export`; `/api/v1/projects/eligible-opportunities`.

## A) CLIENTES

| Section | v7 (layout / data / actions) | Current app | Backend | Gap |
|---|---|---|---|---|
| Aliados | 2-col: left list card ("N aliados", "Nuevo aliado" btn) of buttons: initials avatar, name, "tipo . responsable", chips "N oportunidades / N proyectos / salud score"; right "Ficha del aliado": name, "tipo . estado . Responsable", Oportunidades list with "+ Nueva", Contactos list (name, rol). Dialog fields: nombre, tipo, estado, responsable. | `/clientes` ClientList (cards/list/table, filters by tipo/estado/prioridad/responsable) + ClientSheet (richer: inline edit, contactos CRUD, bitacora, docs). Functionally a superset; layout differs (no master/detail split, no salud chip, no proyectos count on row). | Full: Cliente CRUD, contacts CRUD. Missing: salud score, projects count in list DTO (Proyecto.cliente relation exists). | S-M (re-skin to master/detail + salud/pry counts) |
| Oportunidades (list) | Header "Oportunidades" + "Nueva oportunidad"; 4 KPI tiles; 7-column kanban (Revision TDR, Sin iniciar, Planeacion, En formulacion, Enviada-seguimiento, Aceptada, Rechazada) each with sum of COP; card = name, "Prospeccion" chip + financiador, monto + fecha, "n/m tareas" + responsable, left/right arrows to move stage (comercial role). | Only per-client tab `OportunidadesTab` (client-sheet.tsx:1038) + `OportunidadFormDialog`/`OportunidadLifecycleDialog` (entity-dialogs.tsx). No global page. | `Oportunidad` model + per-client routes. MISSING: global `GET /api/v1/opportunities` (cross-client list with task counts, sums), stage enum mismatch (app 7 states != v7 7 columns: TDR/SIN/PLAN/FORM/ENV/ACE/REC need new enum values or a mapping), no KPI endpoint. | L |
| Oportunidad (ficha) | Back link; state `<select>` over 7 states; "Convertir en proyecto" (enabled only when Aceptada) / "abrir PRY-..." ; 3 tabs: Resumen y ciclo de vida (Acerca de la propuesta: objetivo, destinatario, alineacion, duracion, secciones del documento checklist; ciclo-de-vida timeline with fixed send date), Propuesta economica (imprevistos %, overhead %, total, rubro table: rubro/descripcion/unidad/cant/dedicacion/V.unit/total), Tareas (list + toggle + "+ Tarea para esta oportunidad"); side "Propiedades" panel. | Lifecycle dialog + convert action exist (entity-dialogs.tsx:600,630); tasks linked via oportunidad_id (task-dialogs.tsx). No ficha page, no economic proposal, no proposal sections. | Convert route exists. MISSING: proposal fields (objetivo, destinatario, alineacion, duracion, secciones) and economic proposal lines/imprevistos/overhead (no model). | L |
| Interacciones | Filter chips (Todas + types) + "Registrar interaccion"; timeline cards: tipo (Reunion/Correo/Llamada/Visita), aliado, opp, fecha, autor, resumen, "Proximo paso". Dialog: tipo, aliado, opp, resumen, siguiente paso. | Per-client `BitacoraTab` (client-sheet.tsx:1298): free-text entries only. No cross-client feed. | `BitacoraEntrada` (texto + optional oportunidad_id) and `/clients/[id]/log`. MISSING: `tipo`, `proximo_paso` (+ optional fecha) columns; global GET with filters; (immutable by design: no edit/delete, matches v7). | M |
| Relaciones | Filter chips (by aliado); left "Mapa de poder e interes" 2x2 quadrant (Mantener satisfecho / Gestionar de cerca / Monitorear / Mantener informado) with person pills; right "Contactos" list: initials, name, cargo, "Relacion: owner", rol chip, 3-bar relationship strength. | Contactos tab inside ClientSheet (ContactosTab, entity-dialogs ContactoFormDialog). No map, no strength, no cross-client view. | `Contacto` has rol_decision only. MISSING: `poder`, `interes` (or quadrant), `fuerza_relacion` (1-3), `owner_id`, rol "Filtro"; global contacts GET. | M-L |
| Convocatorias (not in user list, in v7) | Cards: financiador, name, monto, "Cierra en N dias", requirements ok/total progress bar, CTA "Crear oportunidad". | None | None (no model) | M |
| Salud | Portfolio gauge/bar "Salud de la cartera" (Contacto 40% / Compromisos 35% / Proyectos 25%; Sana/Atencion/En riesgo counts); ranked list per aliado: name, score, bar, reason text; click -> aliado. | None. (Home dashboard has client activity, `src/lib/dashboard.ts`, but no health score.) | None. Needs derived score (days since last bitacora, overdue commitments, project semaforo) computed server-side; no model strictly needed (compute) but an endpoint is. | M |
| Mapa | Coverage by departamento: tile-grid map (code, count, heat by color-mix), right panel with departamento name, stats (aliados / proyectos / ...), item list. | None for clients. `Municipio.departamento` exists for projects; `Cliente.ubicacion` is free text. | MISSING: client -> departamento relation (ubicacion is free text) and aggregate endpoint. | M |
| Automatizaciones | "Seguimiento automatico": rule list with toggle switches (e.g. recordar compromisos 2 dias antes, alertar 30 dias sin contacto, ...) ; "Plantillas de correo" list with usage text. | None in UI. Backend cron `/api/cron/daily` sends COMPROMISO_VENCIDO / TAREA_VENCIDA / POR_VENCER / SOBREGASTO notifications with hardcoded rules; `Setting` key-value model exists. | Partial: cron + Notificacion + Setting. MISSING: rule table/settings (enabled flag, thresholds), email template model, email sending. Toggles could persist in `Setting` (S) but templates/send are L. | M (toggles) / L (templates+email) |

Note on CRUD: v7 only shows create flows (aliado, opp, tarea, interaccion). The app already has more CRUD than v7 for aliados/contactos/oportunidades/bitacora; the missing backend is for new concepts, not CRUD of existing ones.

## B) TABLERO (v7 "Tareas")

v7 (label "Tareas", h1 "Tablero del equipo", subtitle "Las tareas comerciales completadas de una oportunidad aceptada pasan a Nuevo proyecto."):
- Header: filter pills (Todas, Prospeccion, Ejecucion, Mias) right-aligned. No "Nueva tarea", no Excel/Print, no view switcher.
- 7 columns, 264px wide, horizontal scroll, rounded-18 column cards with colored dot + count pill: Por hacer, En curso, En revision, Bloqueada, En espera, Completada, plus 7th "Nuevo proyecto" (dashed pink border, tinted, description "Cada tarjeta crea el proyecto en Seguimiento...", empty text "Completa una tarea comercial de una oportunidad aceptada").
- Card: title, phase chip "Prospeccion . ref" / "Ejecucion . PRY-...", "responsable . fecha" (red if Vencida/Hoy), "Avanzar ->" button (no drag), "Reanudar ->" for Bloqueada/En espera, in Completada a commercial task whose opp is Aceptada gets "Pasar a nuevo proyecto ->" (creates project), otherwise hint text; in Nuevo proyecto column card shows "check PRY-code . abrir proyecto".
- No dialogs on this view (tasks are created inside the opportunity ficha).

Current (src/components/kanban/kanban-board.tsx 879 lines, task-card.tsx, task-dialog.tsx 853):
- Segmented Tablero/Lista/Reporte; buttons Nueva tarea / Excel / Imprimir; FiltersRow (responsable, cliente, prioridad, etiqueta, entrega desde/hasta); 6 columns (POR_HACER, EN_CURSO, EN_REVISION, BLOQUEADA, EN_ESPERA, COMPLETADA) 248px, dnd-kit drag and drop, blocked-reason dialog, task dialog with comments/subtasks/attachments, TruncationBanner.

| Item | v7 | Current | Backend | Gap |
|---|---|---|---|---|
| Header / filters | Pills Todas/Prospeccion/Ejecucion/Mias | Segmented + full FiltersRow | tasks API has responsable/cliente/estado; MISSING filter by fase (derivable from oportunidad.fase) | S |
| Columns | 7 incl. "Nuevo proyecto" | 6 | "Nuevo proyecto" is virtual: = Completed commercial task whose Oportunidad has a Proyecto (`Oportunidad.proyecto` relation exists). No enum change needed | M |
| Card | Phase chip + ref, owner/date, advance button | task-card.tsx has OpportunityPhaseChip (line 127), client, priority, etc. | oportunidad_fase/nombre already in DTO | S |
| Move | "Avanzar ->" linear NEXT map; no DnD | DnD + status endpoint `/tasks/[id]/status` | exists | S (add button, optional) |
| Convert | "Pasar a nuevo proyecto" on card | Conversion lives in entity-dialogs `ConvertirEnProyectoAction` and `/opportunities/[id]/convert` | exists; needs hand-off from card | M |
| Visual | rounded-18 columns, dashed 7th column, pills | existing token styling | none | S |

Overall B: M (UI re-skin + 7th virtual column + fase pills; keep DnD/dialogs unless user wants strict v7).

## C) PROYECTOS

Current app is already built on "diseno v6" (comments in project-list.tsx, portafolio-kpis.tsx), so differences are small and mostly structural.

| Screen | v7 | Current app | Backend | Gap |
|---|---|---|---|---|
| Listado | h1 Proyectos + subtitle by role + "Nuevo proyecto"; KPI row (Proyectos, Presupuesto activo, ...); table cols Proyecto(code . client + name), Territorio . linea, Responsable, Avance tecnico bar, Avance financiero bar, Estado | project-list.tsx: same 6 columns, PortafolioKpis, state filter select, "Nuevo proyecto" dialog; proyectos-vista.tsx tabs Portafolio / Tablero | complete | S (verify KPIs/labels only) |
| Nuevo proyecto | Full page wizard "Nuevo proyecto" with stepper (pasos), fields per step (readonly demo), lineas chips, table step, Atras/Siguiente | `project-create-dialog.tsx` (578 lines) dialog, origin + eligible opportunities | complete (POST /projects, eligible-opportunities, import template) | M (dialog -> stepped page, only if desired) |
| Tablero gerencial | h1 "Tablero de Control Gerencial", filter chips, 6 widgets: Avance tecnico gauge, Curva S + %, Radar indicadores, Cumplimiento cronograma bars, Productos entregados/programados, Beneficiarios; "Semaforizacion territorial" table | project-dashboard.tsx (Tacometro, CurveSChart, Radar, StatTile, territorial semaforo at line 551) under `/proyectos?vista=tablero` | `/dashboard/*` exists | S |
| Ficha, header | back link, code, name, chips (estado, linea, territorio), "Solo lectura" badge | project-ficha.tsx header with estado + semaforos | yes | S |
| Ficha, tabs | 10 tabs: Resumen, Metas e indicadores, Cronograma, Gantt, Ficha de seguimiento, Financiero, Legalizacion, Beneficiarios, Soportes, Equipo | 8 tabs: Resumen, Metas e indicadores, Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios. Beneficiarios + indicadores live inside Avance (project-ejecucion.tsx), Equipo is inside Resumen (project-team.tsx via project-ficha.tsx:313), no Soportes tab | RegistroBeneficiario, SoporteProyecto, ProyectoMiembro exist | M (split Avance into Ficha de seguimiento/Beneficiarios/Soportes, Equipo to tab; app keeps Cambios, not in v7) |
| Resumen | KPI buttons (navigate to tab) + "Requiere atencion" list | resumen-kpis.tsx, requiere-atencion.tsx | yes | S |
| Metas e indicadores | per-meta card: activities chips, indicators with verification, progress; "Registrar avance de indicador" | estructura-*.tsx, ejecucion-indicadores.tsx | yes | S |
| Cronograma | 4 KPI tiles, legend of thresholds (Real >= plan -5pp, -5 a -20, < -20, editable in Admin), table N/Actividad/Dias/Inicio/Fin/Al corte/%plan/%real/Entregable/Soporte | project-cronograma.tsx (165 lines) | yes (cronograma + semaforo-v2 settings) | S (compare columns "Dias", "Al corte", "Soporte" chip) |
| Gantt | year header, bars with planned span + filled real %, cut line "Corte" | estructura-gantt.tsx | yes | S |
| Ficha de seguimiento | Line chart planned (dashed) vs executed with month points; side cards (periodo, tiempo restante, presupuesto ejecutado); monthly detail table with editable "Nueva planeacion" input; Avance por meta bars | Curve S (curve-s-chart.tsx) inside Avance tab; no monthly detail table with "Nueva planeacion" input, no tiempo-restante card | `/curve`, `/programming` exist; "Nueva planeacion" per month = ProgramacionPeriodo (exists) | M |
| Financiero | Semicircle gauge (3 bands + needle) with legend, "Cumplimiento por rubro" bars, rubro table (asignado/plan mes/ejecutado/dif/% mes/% ano/estado), note "5 rubros sin asignacion", "Alertas del semaforo financiero" | tacometro.tsx, project-financiero.tsx (356) + project-presupuesto.tsx | yes | S-M (check % ano column, sin-asignacion note, alert list) |
| Legalizacion | KPI tiles (legalizado, con soporte, observados), filter chips (Todos/Sin soporte/Observados), "Importar Excel" + "Registrar gasto", table Mes/Compr./Fecha/Rubro/Concepto/Tercero/Debito/Soporte/Anotacion | project-gastos.tsx + gastos-kpis.tsx + gasto-form.tsx + expense-validation-queue.tsx (app is richer: validation, void, reject) | yes | S |
| Beneficiarios | KPI tiles, records table, "Por grupo poblacional" bars, "Registrar beneficiarios" | ejecucion-beneficiarios.tsx | yes (RegistroBeneficiario) | S (move to own tab) |
| Soportes | link form (vincular a, Drive URL) + list of soportes | none as tab; SoporteProyecto model + attachments APIs only per entregable/avance | partial: SoporteProyecto model; no dedicated list/CRUD route (only progress/expense attachments) | M |
| Equipo | member cards: initials, name, desc, rol | project-team.tsx (members CRUD) | yes (/members) | S |

## Backend support summary (Clientes)
- Exists: Aliados (Cliente CRUD), contactos, oportunidades (per client + convert), tareas por oportunidad, bitacora (log), cron notifications, Setting.
- NO backend: Convocatorias, Salud (score), Mapa (departamento aggregation; no relation), Relaciones power/interest/strength, Automatizaciones rules/templates/email, economic proposal (propuesta economica) and proposal metadata, interaction tipo/proximo paso, global opportunity/interaction/contact lists, Soportes tab list.

## Suggested unit breakdown (ordered, <= ~400 lines each)
1. Clientes sub-navigation shell: tabs strip + routes (`/clientes`, `/clientes/oportunidades`, ...) reusing existing ClientList for Aliados (S, ~150).
2. Aliados master/detail re-skin + salud/pry counts in list DTO (M).
3. Global opportunities API (`GET /api/v1/opportunities`, KPIs) + stage mapping decision (migration for 7 stages) (M).
4. Oportunidades kanban page (7 columns, move arrows) (M).
5. Oportunidad ficha page (state select, convert, lifecycle, tareas tab) (M).
6. Tablero: pills filter + "Nuevo proyecto" 7th virtual column + phase chips + advance button (M).
7. Interacciones: migration (`tipo`, `proximo_paso`) + global feed + dialog (M).
8. Relaciones: migration (poder, interes, fuerza, owner) + quadrant map + list (M-L).
9. Salud: server-side score + endpoint + page (M).
10. Mapa: client departamento field/relation + aggregate + tile map (M).
11. Automatizaciones: toggles on `Setting` wired to cron thresholds; templates deferred (S-M).
12. Convocatorias: model + CRUD + page (M, optional/out of user's list).
13. Oportunidad propuesta economica (model + tab) (L, split in 2).
14. Proyectos: ficha tabs reorganization (Ficha de seguimiento / Beneficiarios / Soportes / Equipo) + monthly detail table (M x2).
15. Proyectos: Nuevo proyecto stepper page (optional) (M).

## Key Learnings
1. The v7 prototype differs from v6 only by a light/dark theme system, so there are no new product screens between those two versions.
2. v7 has no in-app guide or help text; its only guidance is short inline microcopy inside the Tareas and Oportunidad views.
3. The CRM sub-navigation in v7 has eight tabs including Convocatorias, which was not in the requested list of seven sections.
4. The current app has no Convocatorias, Salud, Mapa, Relaciones power/interest or Automatizaciones backend, and BitacoraEntrada lacks tipo and proximo paso fields.
5. The Proyectos module already follows the v6 design, so the main structural gap is ficha tabs (10 in v7 versus 8 in the app) rather than visual redesign.
