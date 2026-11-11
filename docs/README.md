# Índice de documentación

Qué documento manda para cada cosa, y cuáles quedaron como registro histórico. Actualizado el **2026-11-10**.

Leyenda: **Vigente** (describe el estado actual) · **Referencia** (sigue siendo útil, no es normativo) ·
**Histórico** (registro de una etapa cerrada; no actualizar) · **Feature** (plan de trabajo en `odd/tasks`).

## Empezar aquí

| Documento | Estado | Para qué |
|---|---|---|
| [`../README.md`](../README.md) | **Vigente** | Stack, módulos, permisos, puesta en marcha, variables, pruebas y despliegue |
| [`despliegue-y-portabilidad.md`](despliegue-y-portabilidad.md) | **Vigente** | Servicios, acoplamientos a Supabase y plan de migración (Railway Pro) |
| [`plan-trabajo-restante.md`](plan-trabajo-restante.md) | **Vigente** | **Fuente única de lo pendiente.** La sección 0 dice qué queda abierto; ahí se cargan los requerimientos nuevos |
| [`plan-limpieza-codigo.md`](plan-limpieza-codigo.md) | **Vigente** | Fases L0–L8 de limpieza de código (anexo técnico del plan) |
| [`guia-uso-proyectos-v2.md`](guia-uso-proyectos-v2.md) · [`.html`](guia-uso-proyectos-v2.html) · [`.pdf`](guia-uso-proyectos-v2.pdf) | **Vigente** | Guía de usuario del módulo de Proyectos + anexo de validación para la PO |

## Producto y requisitos

| Documento | Estado | Para qué |
|---|---|---|
| [`Muttu_Hub_PRD_v2.md`](Muttu_Hub_PRD_v2.md) | **Referencia** | PRD de la plataforma (no cubre el módulo de Proyectos) |
| [`plan-accion-requerimientos-v7.md`](plan-accion-requerimientos-v7.md) | **Referencia** | Requerimientos del prototipo v7; ejecutado en parte |
| [`../odd/tasks/v7-gap-analysis.md`](../odd/tasks/v7-gap-analysis.md) | **Referencia** | Brechas v6 → v7 por pantalla |
| [`brief-video-direccion.md`](brief-video-direccion.md) | **Referencia** | Guion y criterios del video de dirección |

## Operación

| Documento | Estado | Para qué |
|---|---|---|
| [`runbook-lanzamiento-v2.md`](runbook-lanzamiento-v2.md) | **Histórico ejecutado** | Cómo se migró y desplegó v2 el 2026-10-19; sirve de plantilla para la próxima ventana |
| [`../odd/tasks/lanzamiento-v2-fin-de-semana.md`](../odd/tasks/lanzamiento-v2-fin-de-semana.md) | **Histórico** | Plan, decisiones y evidencia del lanzamiento |
| [`../odd/tasks/plan-emergencia-lanzamiento-v2.md`](../odd/tasks/plan-emergencia-lanzamiento-v2.md) | **Histórico** | Vuelta atrás de emergencia |
| [`archive/analisis/`](archive/analisis/) | **Histórico** | Auditoría profunda del 2026-10-13 (commits, arquitectura, seguridad, pruebas) |

## Demos, guías y material de apoyo

| Documento | Estado | Para qué |
|---|---|---|
| [`guia-demo.md`](guia-demo.md) | **Referencia** | Grabar una demo local con datos sembrados |
| [`libreto-demo-proyectos-2026-10-14.md`](libreto-demo-proyectos-2026-10-14.md) | **Histórico** | Libreto de la demo de Proyectos |
| [`paso-a-paso-crear-proyecto.md`](paso-a-paso-crear-proyecto.md) | **Referencia** | Detalle del asistente de creación; la guía vigente lo resume |
| [`guia-prueba-proyectos.md`](guia-prueba-proyectos.md) | **Histórico** | Guía de prueba de las slices S0–S14 |
| [`patrones-responsive.md`](patrones-responsive.md) | **Referencia** | Patrones de layout y breakpoints |
| [`pasos-post-reunion-2026-10-14.md`](pasos-post-reunion-2026-10-14.md) | **Histórico** | Acuerdos tras la reunión con el cliente |

## Históricos de etapas cerradas

| Documento | Estado |
|---|---|
| [`cierre-fase-1-tablero-global.md`](cierre-fase-1-tablero-global.md) | **Histórico** |
| [`cierre-plan-40-20.md`](cierre-plan-40-20.md) | **Histórico** |
| [`plan-supabase-manana.md`](plan-supabase-manana.md) | **Histórico** |
| [`archive/pendientes/`](archive/pendientes/) | **Histórico** (deuda y mejoras de fases anteriores; lo vigente está en `plan-trabajo-restante.md`) |
| [`archive/pendientes-v7.md`](archive/pendientes-v7.md) | **Histórico** (inventario v7 al 2026-10-19, absorbido por `plan-trabajo-restante.md`) |
| [`archive/pasos-siguientes.md`](archive/pasos-siguientes.md) | **Histórico** |
| [`archive/PLAN-TRABAJO-2026-11-08.md`](archive/PLAN-TRABAJO-2026-11-08.md) · [`-09`](archive/PLAN-TRABAJO-2026-11-09.md) | **Histórico** (planes diarios; su contenido está en las secciones 11–12 del plan) |
| [`archive/DIAGNOSTICO-SEED-CLOUD.md`](archive/DIAGNOSTICO-SEED-CLOUD.md) | **Histórico** (incidente del seed en producción, 2026-09-22; motivo del guard anti-producción) |
| [`proposals/`](proposals/) | **Histórico** |

## Trabajo en curso (`odd/tasks`)

Cada feature tiene su documento con `## Specs` (numeradas `S#`), `## Tasks` y `## Log`. El estado se lee en las
casillas de cada tarea, no aquí.

| Documento | Tema |
|---|---|
| [`../odd/tasks/permisos-proyectos-por-rol.md`](../odd/tasks/permisos-proyectos-por-rol.md) | Matriz de permisos del 2026-10-19 (implementada) |
| [`../odd/tasks/documentacion-vigente-y-portabilidad.md`](../odd/tasks/documentacion-vigente-y-portabilidad.md) | Esta actualización documental |
| [`../odd/tasks/e2e-proyectos-v2.md`](../odd/tasks/e2e-proyectos-v2.md) | Suite e2e de Proyectos |
| [`../odd/tasks/subir-documentos-proyecto.md`](../odd/tasks/subir-documentos-proyecto.md) | DOC1 |
| [`../odd/tasks/ux-audit-2026-10-19.md`](../odd/tasks/ux-audit-2026-10-19.md) | **Vigente**: re-auditoría UX con estado por hallazgo |
| [`../odd/tasks/ux-audit-report-2026-09-23.md`](../odd/tasks/ux-audit-report-2026-09-23.md) | Auditoría UX/UI original (histórico) |

## Artefactos que no son documentación

`muttu-hub-v2.html` (prototipo de diseño), `../manual-usuario.html`, `../guia-acceso.html` y los dos PDF de la raíz son
material de comunicación anterior. Se conservan hasta decidir su limpieza (ver `archive/pendientes-v7.md`, Q5).
