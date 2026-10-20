# Pendientes de v7 y del lanzamiento

Inventario consolidado al **2026-10-19**. El orden, el tamaño y los criterios de aceptación de cada tarea están en [`plan-trabajo-restante.md`](plan-trabajo-restante.md). Cada fila dice el estado real, no el deseado: **Hecho**, **Pendiente**,
**Sin verificar** (no hay evidencia reciente) o **Fuera de alcance**. Las fuentes son
`odd/tasks/v7-gap-analysis.md`, `odd/tasks/ux-audit-report-2026-09-23.md`, `PENDIENTES-MENORES.md`,
`odd/tasks/lanzamiento-v2-fin-de-semana.md` y `docs/analisis/`.

---

## 1. Cierre del lanzamiento (operativo)

| # | Tarea | Estado | Dónde |
|---|---|---|---|
| L1 | Etiqueta `v2.0.0` sobre el commit desplegado | **Pendiente** (solo existe `v2.0.0-rc1`) | Runbook §6 |
| L2 | Verificar `muttu.co` en Resend y poner `EMAIL_FROM` | **Pendiente**: el cron registra `sent=0` con error 403 «domain not verified» | `cron_logs` |
| L3 | Humo en producción con un Coordinador y un Colaborador reales | **Pendiente** (las 29 e2e corrieron en local) | Runbook §4 |
| L4 | Monitoreo de las primeras 24 h (Vercel Logs, cron del día siguiente) | **Pendiente** | Runbook §6 |
| L5 | Borrar `~/.muttu-prod-url` y decidir retención de `~/muttu-backups` | **Pendiente** | Runbook §6 |
| L6 | Respaldos automáticos (Supabase Pro con PITR o dumps programados) | **Pendiente**: hoy depende de un dump manual | `docs/pendientes/pendientes-y-mejoras.md` |

---

## 2. Producto — módulo de Proyectos

| # | Tarea | Estado | Nota |
|---|---|---|---|
| P1 | Adaptador de las plantillas de la PO (`proyecto.xlsx`, `presupuesto.xlsx`) + plantillas actualizadas con cantidad/unidad/medio | **Pendiente** | Decisiones T1–T6 en `odd/tasks/lanzamiento-v2-fin-de-semana.md` |
| P2 | Importar **solo estructura** sin presupuesto (hoy V-12 exige que el presupuesto sume el valor total) | **Decisión pendiente** | Mismo documento, «Hallazgo 2026-10-17» |
| P3 | Rubros editables por proyecto (deshabilitar y agregar personalizados) | **Pendiente** (requiere migración) | Preguntas 1–3 a la PO en el mismo documento |
| P4 | Cerrar, suspender y cancelar proyectos (PO-3) | **Pendiente** | Fuera del lanzamiento |
| P5 | Importar gastos desde Excel (PO-11) | **Pendiente** | Fuera del lanzamiento |
| P6 | Defecto **D1**: `useProject()` reintenta 403/404 y el mensaje de acceso tarda ~11 s | **Pendiente** | `odd/tasks/e2e-proyectos-v2.md` |
| P7 | Propuesta económica y convocatorias | **Fuera de alcance** | `odd/tasks/v7-gap-analysis.md` |

---

## 3. v7 en CRM (no comprometido en el lanzamiento)

Del análisis de brechas v6 → v7. Son pantallas o backends que el prototipo muestra y la app **no** cubre por completo.

| # | Brecha | Estado |
|---|---|---|
| C1 | Oportunidades globales con kanban de 7 etapas y ficha propia | **Pendiente** (hoy se ven por cliente) |
| C2 | Convocatorias (modelo, CRUD y página) | **Pendiente** |
| C3 | Mapa de aliados por departamento | **Sin verificar**: existe `/clientes/mapa`, el alcance real no se revisó |
| C4 | Salud de cartera con score de proyectos | **Sin verificar**: existe `/clientes/salud` |
| C5 | Relaciones poder/interés/fuerza con mapa de cuadrantes | **Sin verificar**: existe `/clientes/relaciones` |
| C6 | Automatizaciones (reglas y plantillas de correo) | **Sin verificar**: existe `/clientes/automatizaciones` |
| C7 | Interacciones con `tipo` y `próximo paso` + feed global | **Pendiente** |
| C8 | Propuesta económica de la oportunidad | **Fuera de alcance** |
| C9 | Soportes como pestaña propia en Proyectos | **Hecho**: la pestaña Documentos los reúne |
| C10 | Ficha de seguimiento con tabla mensual y «nueva planeación» | **Parcial**: existe la curva S y la programación mensual, no la tabla editable |

---

## 4. Auditoría UX/UI

**Re-auditada el 2026-10-19** contra el build de producción y 390 px: **10 de los 16 hallazgos ya no se reproducen**.
Quedan cuatro vigentes, todos pequeños, y dos observaciones nuevas. Detalle y evidencia en
`odd/tasks/ux-audit-2026-10-19.md`; el trabajo está en el plan como U1–U5.

| # | Hallazgo | Estado |
|---|---|---|
| C1 | Tarjetas de clientes no responsive | Resuelto |
| C2 | Client Sheet no full-screen en mobile | Resuelto |
| C3 | Gantt inutilizable en mobile | Resuelto |
| C4 | Header de página truncado en mobile | Resuelto |
| C5 | Rol truncado a «Co» | Resuelto |
| C6 | Hydration mismatch en el login | **Vigente** (56 estilos inline) |
| C7 | Categoría de documento duplicada | **Vigente** |
| C8 | Etiquetas del eje Y de la Curva S | Resuelto (gráfico reescrito) |
| C9 | Gantt sin leyenda de colores | **Vigente** |
| C10 | Botones de indicador < 44 px | Resuelto (área de clic ~56 px) |
| C11 | Redundancia `/` vs `/tablero-gerencial` | Resuelto (ruta 404) |
| C12 | Label `dashboard` sin mapear en auditoría | **Vigente** |
| C13 | Columnas IP/Agente en mobile | Resuelto |
| C14 | Cronograma solo por color | Resuelto (chip de texto) |
| C15 | Cliente truncado sin tooltip | Resuelto (`title`) |
| C16 | Badge «N» del dev server | No aplica (entorno) |

Nuevos y menores: N1 subnavegación de Clientes sin indicador de scroll; N2 pestañas del Client Sheet con el mismo
patrón.

## 5. Calidad e infraestructura

| # | Tarea | Estado |
|---|---|---|
| Q1 | Conectar la suite Playwright a CI con un entorno reproducible | **Pendiente** (hoy corre en local contra build de producción) |
| Q2 | Cobertura de pruebas con umbral (hoy ~13–15 %, thresholds desactivados) | **Pendiente** |
| Q3 | `npm run lint` reproducible en local (el análisis detectó fallo por `.next-stale-*`) | **Sin verificar** |
| Q4 | Migración a Railway Pro o equivalente | **Documentada, no ejecutada**: `docs/despliegue-y-portabilidad.md` |
| Q5 | Limpieza de artefactos del repositorio (zip del prototipo, PDFs duplicados, HTML sueltos) | **Pendiente de decisión** (ver `odd/tasks/documentacion-vigente-y-portabilidad.md`, L3) |

---

## 6. Cómo mantener esta lista

Se actualiza cuando una tarea cambia de estado, citando la evidencia (commit, corrida de CI, fila de `cron_logs`). Si una
tarea se descarta, se marca **Fuera de alcance** con la razón; no se borra la fila.
