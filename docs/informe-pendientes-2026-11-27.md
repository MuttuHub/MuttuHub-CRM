# Informe final de pendientes — 2026-11-27

Consolida todos los pendientes de `docs/`, `odd/tasks/` y de la sesión del 2026-11-27,
para planificar una limpieza del proyecto. Corte: `main` en `59574e6b` (#242), desplegado
en producción. Cada ítem cita su evidencia; "verificar" indica que el estado se infirió
de git y no se comprobó en la app.

## 0. Estado de partida

- Cadena #214–#242 (22 PRs) mergeada el 2026-11-27; deploy de Vercel exitoso.
- Las 10 migraciones de la cadena se aplicaron a producción el 2026-11-27 16:55 UTC
  (`migrate diff` vacío, conteos sin cambios), previo ensayo sobre copia restaurada.
- Único PR abierto: **#227** (índices de `Oportunidad` + retiro de `shadcn`).

## 1. Prioridad alta — cierre del lanzamiento de hoy (operativo)

| # | Pendiente | Evidencia |
|---|---|---|
| 1.1 | Prueba rápida en producción: proyecto de posición propia con aliado, su reporte y Excel; etiquetar una oportunidad y una entrada de bitácora y verlas en el reporte por etiqueta | `odd/tasks/reportes-etiqueta-y-posicion-propia.md` |
| 1.2 | Borrar `~/.muttu-prod-url` (credencial de producción en disco) | sesión 2026-11-27 |
| 1.3 | Decidir retención y borrar dumps con datos reales en `~/muttu-backups/` (7 entradas, desde 2026-10-18) | `odd/tasks/lanzamiento-v2-pendientes-viernes.md:48`, `docs/runbook-lanzamiento-v2.md:648` |
| 1.4 | Decidir si la regla 2 de V8 («30 días sin contacto») arranca apagada en producción, para evitar la ráfaga de correos de la primera corrida | `docs/pendientes.md:32`, `odd/tasks/producto-pendientes-2026-11.md:155` |
| 1.5 | Mergear #227 con el ritual de migración: local → copia de producción → producción → merge | `odd/tasks/pendientes-2026-11-24.md:31,42,50` |
| 1.6 | Migración fantasma en producción `20260918153200_tablero_seguimiento_social` (registrada en prod, no en el repo): decidir si se documenta o se limpia | sesión 2026-11-27 |

## 2. Producto / funcionalidad

| # | Pendiente | Estado | Evidencia |
|---|---|---|---|
| 2.1 | Texto erróneo: «Solo Administración y Gerencia pueden crear proyectos», pero los 4 roles pueden | abierto (verificado) | `src/components/proyectos/nuevo-proyecto/nuevo-proyecto.tsx:193`, `src/lib/permissions.ts:98` |
| 2.2 | Ficha: puntos que esperan API (R5, F4, F10, F11, D6, D7, H7, H9), contador de Documentos, «Ver el plan», `registrado_por_nombre`, «Registrar cantidad» en actividad terminada, 5 WARNING de L13 | abierto | `odd/tasks/pendientes-2026-11-24.md:12,48`, `docs/pendientes.md:51` |
| 2.3 | Rediseño UI: T13 parcial («Revisar gasto» desde «Qué falta», «debería ir en X», diálogos T9 a 390 px) y T15 (R1, R3, R4, R7, R10, A1, A2, A5, A7, F1, F8, F9, F12, F13, H4, H5, H8, H10, H11) | abierto | `odd/tasks/proyectos-redisenio-ui.md:36,38` |
| 2.4 | Una actividad transversal no puede volver a Normal desde la UI | abierto | `odd/tasks/po-2026-11-10-proyectos.md` (Log final) |
| 2.5 | V8 automatizaciones, avisos del verificador (a)–(f): filas SIN_CONTACTO en la campana, cambio de responsable, duplicado en el resumen diario, tests para ADMINISTRADOR e inactivos | abierto | `odd/tasks/producto-pendientes-2026-11.md:98-101` |
| 2.6 | V5 mapa: selector vacío sin catálogo `municipios`; renombres no se propagan; avisos A1–A4 (trigger, 500 vs 400, seed, OpenAPI) | abierto | `odd/tasks/producto-pendientes-2026-11.md:143-150`, `docs/runbook-lanzamiento-v2.md:76` |
| 2.7 | Cierre/suspensión: carrera del congelamiento en members POST/DELETE y decisiones de modificación; rama sin test en `expense-validations/route.ts:52` | abierto | `odd/tasks/cierre-suspension-proyecto.md:70` |
| 2.8 | Backlog UX de la reunión 2026-10-28 («Tablero» con tres sentidos, PDF de portafolio 400, tareas sin `proyecto_id`, estados vacíos, `!important` en Reportes, impresión) | abierto | `docs/pendientes/mejoras-ux-reunion-2026-10-28.md`, `odd/tasks/jefe-carril-2.md` |
| 2.9 | Hallazgos F2 de capturas (Gastos cortado a 1440 px, dos «avance financiero», semáforo Verde + «Posible retraso», R11 sobregirado en verde, jerga «Portafolio v2») | verificar; quizás cubiertos por #146/#147/#149 | `docs/ux-crm-2026-11/plan-mejoras-ui-proyectos.md:79-89` |
| 2.10 | Diseño v6 sin cerrar (Gantt, barras de Metas, largo de Cambios, curva S del portafolio) y pulido v6 (contraste de pills, tablas a 390 px) | abierto, espera diseño | `odd/tasks/v2-projects-v6-sections.md:155,175`, `odd/tasks/v2-ui-v6-base.md:201-206` |
| 2.11 | v7 C1b reskin de Aliados (lista/detalle) y C8 «una guía por sección» | abierto | `odd/tasks/v7-alignment.md:21,29` |
| 2.12 | Subir documentos DOC1c: verificación manual en navegador sobre PRY-2026-005 | abierto | `odd/tasks/subir-documentos-proyecto.md:74,103` |
| 2.13 | Ficha `[id]`: título/h1, caso amarillo/rojo en el seed, test con id no UUID | abierto, menor | `odd/tasks/v2-projects-ficha-page.md:125` |
| 2.14 | Rubros REQ-CAT-02: 409 al renombrar con datos, texto «Rubro suspendido pendiente de reasignación» | verificar | `odd/tasks/v2-projects-sdd.md:2344-2349,2385` |
| 2.15 | Correo: disparador más frecuente que el cron de las 8:00 (PR-M3) y adaptador SMTP (D-M1) | abierto, sin decidir | `docs/pendientes.md:49`, `odd/tasks/pendientes-2026-11-24.md:10` |
| 2.16 | Ideas congeladas: extracción de brief con IA (OpenRouter), búsqueda semántica en Repositorio | congelado | `docs/proposals/extraccion-brief-ia-openrouter.md`, `docs/archive/pendientes/busqueda-semantica.md` |
| 2.17 | Fuera de alcance por decisión: V4 convocatorias, V10 propuesta económica, E6, permisos granulares, T10 de posición propia (D2) | cerrado por decisión | `docs/pendientes.md:108-113`, `odd/tasks/reportes-etiqueta-y-posicion-propia.md` |

## 3. Datos / migraciones

| # | Pendiente | Estado | Evidencia |
|---|---|---|---|
| 3.1 | EV-08 / AJ-08 criterio 2: la Gestora debe volver a registrar el gasto de $938.000 con su actividad | abierto, depende de la usuaria | `docs/pendientes.md:19,61`, `docs/checklist-aceptacion-po-2026-11-10.md:92` |
| 3.2 | Recarga de CedeTextil en producción (D5: proyecto nuevo y el actual archivado) | verificar; `docs/pendientes.md` lo da por hecho el 2026-11-24 | `odd/tasks/po-2026-11-10-proyectos.md:283,450` |
| 3.3 | Plantilla hoja 2: «Valor total» se teclea y es obligatorio; import de estructura puede dejar líneas en actividades soft-deleted | verificar | `odd/tasks/t11-presupuesto-por-actividad.md:97-99,106-108` |
| 3.4 | `scripts/seed*.ts` y gastos sin reparto (la auditoría estricta falla en base sembrada a mano) | verificar | `odd/tasks/t14-gasto-por-actividad.md:436,486` |
| 3.5 | Borrar clientes de prueba «sdd-invariant» de la base local | abierto, solo local | `odd/tasks/v2-ui-v6-base.md:207` |

## 4. Calidad / tests

| # | Pendiente | Estado | Evidencia |
|---|---|---|---|
| 4.1 | Verificación manual local de T1, T3–T8 y AJ-07 (caso 6,7 pp), AJ-09, AJ-10 | abierto (parte cubierta por e2e #209) | `docs/pendientes.md:60-61`, `odd/tasks/po-2026-11-10-proyectos.md:8-15,656` |
| 4.2 | T0: probar una invitación real en producción | abierto | `odd/tasks/po-2026-11-10-proyectos.md:7,623` |
| 4.3 | Specs e2e fuera de CI (`permisos-colaborador` espera decisión sobre `aria-disabled`; `crm-demo`, `proyectos-demo`, `change-password`) | abierto | `odd/tasks/e2e-proyectos-v2.md:93-97` |
| 4.4 | Invariantes con carrera/deadlock en paralelo (`prisma/municipios.invariant.test.ts`, 40P01); la suite completa de invariantes excede timeout sobre la copia de producción | abierto, deuda técnica | `odd/tasks/jefe-carril-2.md:150`, `odd/tasks/aj06-soportes-multiples.md:127` |
| 4.5 | Invariante del outbox de correo contra Docker (U1) sin correr | abierto, menor | `odd/tasks/pendientes-2026-11-24.md:28` |
| 4.6 | Curva S sin asserts de geometría | abierto, menor | `odd/tasks/v2-projects-v6-sections.md:135` |
| 4.7 | Vitest en WSL: timeouts de workers intermitentes (hay que correr por grupos) | abierto, entorno | sesión 2026-11-27 |

## 5. Infra / deploy / proceso

| # | Pendiente | Estado | Evidencia |
|---|---|---|---|
| 5.1 | A2: DNS de `muttu.co` + dominio en Resend; hoy `EMAIL_FROM` es `@gmail.com` y Resend responde 403 | bloqueado por terceros | `docs/pendientes.md:94`, `odd/tasks/pendientes-menores-post-tablero.md:27` |
| 5.2 | A4: respaldos automáticos (PITR o dumps programados) con prueba de restauración | abierto | `docs/pendientes.md:95`, `docs/runbook-lanzamiento-v2.md:84` |
| 5.3 | E4: migración a Railway (D-F) | abierto/bloqueado | `docs/pendientes.md:96`, `docs/despliegue-y-portabilidad.md:123` |
| 5.4 | B2/B4: prueba de la PO con sus archivos reales | abierto | `docs/pendientes.md:97` |
| 5.5 | Casillas del runbook v2 sin cerrar (Storage privado, cron, `/auth/confirm`, Node en Vercel, `ENABLE_DEV_ROUTES`) | probablemente superadas, falta evidencia | `docs/runbook-lanzamiento-v2.md:79-91`, `odd/tasks/lanzamiento-v2-pendientes-viernes.md:55-94` |
| 5.6 | `gh pr edit` falla en este repo (Projects classic); se usa `gh api -X PATCH` | conocido | sesión 2026-11-27 |

## 6. Limpieza de código y repositorio

| # | Pendiente | Evidencia |
|---|---|---|
| 6.1 | Plan de limpieza L3–L8: formato de fecha canónico (espera a la PO), partir `hooks/projects.ts`, ordenar `components/proyectos`, `odd/archive/` + un solo formato de guías + e2e fuera de CI, convención de nombres, componentes de más de 500 líneas | `docs/plan-limpieza-codigo.md:40-53` |
| 6.2 | 5 worktrees extra: `~/mh-wt/{chore-indices-oportunidad-shadcn, feat-plantilla-transversal, feat-tablero-rango}`, `~/MuttuHub-CRM-deepseek`, `~/MuttuHub-CRM-fast` (uno guarda el `node_modules` compartido) | `git worktree list` |
| 6.3 | 67 ramas locales, la mayoría ya mergeadas (cadenas `pp-*`, `re-*`, `pos-*`) | `git branch` |
| 6.4 | Ref de respaldo `backup/pre-rebase-feat-projects-v2-20260930` | `odd/tasks/v2-projects-execution.md` (final) |
| 6.5 | Archivos sin versionar: `.impeccable/`, `docs/guias/plantilla-cedetextil-para-llenar.xlsx`, `odd/tasks/pendientes-2026-11-24.md`; decidir también sobre los `.docx` de la PO | `git status` |
| 6.6 | Capturas y fuentes generadas en `docs/ux-crm-2026-11/canvas-fuente/` y `capturas/`: revisar qué está versionado y sacarlo del repo | `docs/ux-crm-2026-11/` |

## 7. Preguntas abiertas a la PO

El mensaje U5 está redactado pero no consta su envío (`odd/tasks/pendientes-2026-11-24.md:32,40`).

1. D-A: en una segunda importación, ¿se conserva la estructura o se reemplaza? (hoy se reemplaza) — `docs/pendientes.md:70`
2. B8: ¿quién puede adjuntar el soporte de un gasto? — `docs/pendientes.md:71`
3. Rediseño de la ficha: «Opciones avanzadas», «Objetivo 1.» frente a «OE1.», chip «Umbrales sin confirmar» — `docs/pendientes.md:72`
4. Formato de fecha canónico (C8 de T10: «05 oct 2026» o «05 de oct de 2026»); desbloquea L3 — `docs/plan-limpieza-codigo.md`
5. Umbrales del semáforo (10/20 pp, tolerancia 10 %, posible retraso 70 %); la UI sigue mostrando «No confirmado» — `odd/tasks/v2-projects-sdd.md:3558-3610`, `odd/tasks/v2-projects-s9-execution.md:154`
6. Formato PDF (N-23), que bloquea S9.3b — `odd/tasks/v2-projects-s9-execution.md:155`
7. F4 (¿PRY-2026-002 lleva otro responsable?) y F7 (¿varios soportes al crear un gasto?) — `docs/ux-crm-2026-11/plan-verificacion-aj-y-ux.md:69,77`
8. v7 C8: ¿la guía por sección es un panel en la app o un documento? — `odd/tasks/v7-alignment.md:29`
9. Video de dirección: 6 puntos «Verificar antes de filmar», si el video sigue en pie — `docs/brief-video-direccion.md:73-80`

## 8. Higiene de documentación

### 8.1 Problemas concretos

- `docs/pendientes.md:21-26`: restos de una tabla rota y cabecera con corte 2026-11-18; casi todo §2, §3 y §6 está hecho. Reescribirlo a partir de este informe.
- Dos backlogs en paralelo: `docs/plan-trabajo-restante.md` («fuente única») y `docs/pendientes.md`. Dejar uno solo.
- `docs/README.md` (índice al 2026-11-10) no lista `pendientes.md`, `propuesta-posicion-propia-y-reportes.md`, `checklist-aceptacion-po-2026-11-10.md`, `ux-crm-2026-11/` ni `guias/`.
- Docs con estado desactualizado: `odd/tasks/v1-oportunidades-globales.md:3` dice «abierta» pero está hecho (#159).
- Enlaces rotos en `docs/ux-crm-2026-11/plan-mejoras-ui-proyectos.md:13-15`.
- Mismo contenido en .md, .html y .pdf: `guia-uso-proyectos-v2`, `proceso-proyectos-desde-cero`, `propuesta-posicion-propia-y-reportes`; el .html de la guía v2 está desactualizado respecto al .md.

### 8.2 Candidatos a `docs/archive/`

- Planes vencidos: `plan-supabase-manana.md`, `pasos-post-reunion-2026-10-14.md`, `libreto-demo-proyectos-2026-10-14.md`, `plan-accion-requerimientos-v7.md`.
- Etapas cerradas: `cierre-fase-1-tablero-global.md`, `cierre-plan-40-20.md`, `guia-prueba-proyectos.md`, `guia-prueba-sprint-2026-11-02.md`, `preguntas-po-parte-2.md`, `propuesta-posicion-propia-y-reportes.md` (+pdf), `specs-reportes-etiqueta-y-posicion-propia.pdf`, `reportes-prototipo/`, `muttu-hub-v2.html`, `ux-crm-2026-11/`.
- `checklist-aceptacion-po-2026-11-10.md`, cuando se cierre EV-08 (3.1).

### 8.3 Candidatos a `odd/archive/` (todas sus tareas cerradas o superadas)

- Features cerradas: `aj01-*`, `aj02-*`, `aj03-*`, `aj06-*`, `cierre-suspension-proyecto`, `documentos-redesign`, `documentacion-vigente-y-portabilidad`, `e2e-aceptacion-po-261110`, `gastos-iva-periodo`, `importar-estructura-po`, `importar-gastos`, `jefe-carril-1`, `jefe-carril-2`, `jefe-requerimientos-2026-10-28`, `permisos-proyectos-por-rol`, `p2-nuevo-proyecto-stepper`, `fase-0-ejecucion`, `t11-*`, `t13-*`, `t14-*`, `ux-audit-*`, `v1-oportunidades-globales`, `reportes-etiqueta-y-posicion-propia` (tras 1.1).
- Sprints v2 terminados: `v2-projects-s3` … `s11`, `s26-membership`, `v2-projects-pendientes`, `v2-projects-ficha-page`, `v2-projects-delivery-chain`, `v2-projects-execution`, `v2-projects-and-clients-plan`, `v2-projects-sdd` (antes, pasar sus preguntas §7.4 a la lista viva).
- Ejecuciones de un día: `lanzamiento-v2-*`, `plan-emergencia-lanzamiento-v2`, `plan-retoma-2026-10-29`, `plan-2026-11-13-dos-agentes`, `plan-2026-11-14-dos-agentes`, `demo-proyectos-2026-10-14`.
- Superados: `importar-presupuesto-po` (módulo retirado), `po-2026-11-10-parte-2-diseno`, `proyectos-v3-contratos` (área eliminada en #157), `v7-paridad-crm-2026-10-20`, `v7-gap-analysis`.
- Siguen vivos hasta mover sus pendientes a la lista única: `pendientes-2026-11-24`, `proyectos-redisenio-ui`, `po-2026-11-10-proyectos`, `e2e-proyectos-v2`, `producto-pendientes-2026-11`, `pendientes-menores-post-tablero`, `v7-alignment`, `v2-projects-v6-sections`, `v2-ui-v6-base`, `subir-documentos-proyecto`.

## 9. Orden sugerido para la limpieza

1. Cerrar §1 (operativo de hoy) y corregir 2.1 (texto erróneo, cambio de una línea).
2. Enviar a la PO las preguntas de §7 en un solo mensaje.
3. Higiene de docs (§8): una sola lista viva de pendientes, archivar lo cerrado, actualizar `docs/README.md`.
4. Limpieza de repo (§6.2–6.6): worktrees, ramas locales, refs y archivos sin versionar.
5. Mergear #227 (1.5) y retomar el plan L3–L8 (§6.1).
6. Producto (§2) y calidad (§4) según prioridad de la PO; infra (§5) cuando se desbloqueen los terceros.
