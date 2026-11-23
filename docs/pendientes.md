# Pendientes — MuttuHub CRM

**Corte:** 2026-11-18 · `main` en `97b8af3c`
**Fuentes:** `docs/plan-trabajo-restante.md`, `odd/tasks/`, checklist de aceptación de la PO, plan de limpieza, descripciones de PR y código.
Los IDs son los del plan, para poder cruzarlos.

---

## 1. Producción — confirmar antes que nada

Ningún documento registra si estas migraciones ya se aplicaron en producción. Mientras no se sepa, el resto del frente de datos no puede avanzar.

| # | ID | Qué falta | Depende de |
|---|---|---|---|
| 1 | — | Confirmar si están aplicadas en producción las 7 migraciones de la Parte 2: `v2_actividades_drop_peso`, `t10_linea_por_actividad`, `t12_tipo_actividad`, `t13_programacion_confirmada`, `t14_gasto_reparto`, `t14_cierre_gastos_actividad`, `ev05_iva_por_linea` | Acceso a producción |
| 2 | AJ-02 | La contracción (borra `peso` y `peso_manual`) ya está en `main` por #165. Falta ensayarla sobre una copia y aplicarla. La rama `feat/aj02-drop-peso-columns` está obsoleta | Ensayo sobre copia de producción |
| 3 | D2 | Pasar a anulados los gastos «Rechazados» anteriores a AJ-08, como tarea aparte y con ensayo previo | Ensayo sobre copia de producción |
| 4 | T15 | CedeTextil en producción | Volcado de producción |
| 5 | EV-08 | Carga de datos productivos | Volcado de producción |

---

## 2. Producto — sin dependencias externas

| # | ID | Qué falta |
|---|---|---|
| 6 | B6 | Rubros editables por proyecto: deshabilitar los que no aplican. D-B ya está decidida; requiere migración |
| 7 | V2 | Enlazar las tareas al convertir una oportunidad GANADA. Hoy `Tarea` no tiene `proyecto_id` |
| 8 | V5 | Mapa de aliados por departamento. Hoy la ruta hace `redirect("/clientes")` |
| 9 | V8 | Reglas de automatización «2 días antes» y «30 días sin contacto» (sin verificar en el código) |
| 10 | V9 | «Nueva planeación» en la ficha de seguimiento (sin verificar en el código) |
| 11 | D4 | Semilla con una tarea comercial sobre una oportunidad GANADA sin proyecto |

---

## 3. Seguimiento de lo ya entregado

| # | Origen | Qué falta |
|---|---|---|
| 12 | Correo (#137, PR-M1b) | **Bug reproducido:** si vence el lease, se reenvía un correo ya enviado. Además: no hay timeout ni manejo del 429; los eventos inmediatos (PR-M3) necesitan un disparador más frecuente que el cron de las 8:00; falta el adaptador SMTP (depende de D-M1) |
| 13 | Documentos (#210/#212) | La revisión nunca dio veredicto. Advertencias abiertas: dos restauraciones simultáneas generan doble auditoría; restaurar no revisa títulos duplicados; el orden `nombre_*` no desempata por `id`; se puede arrastrar sin permiso para mover; `orden=` vacío responde 400 |
| 14 | Rediseño de la ficha | Puntos que esperan API (R5, F4, F10, F11, D6, D7, H7, H9). Pendientes de L4: contador de Documentos, «Ver el plan», `registrado_por_nombre`, la API acepta «Registrar cantidad» en una actividad terminada. Siguen abiertos 5 WARNING de la revisión L13 |
| 15 | L32 | Vista por actividad: `PorActividad` no hereda el corte ni la base. Vista previa de la importación de gastos: falta la columna «Actividad» |

---

## 4. Verificación pendiente

| # | Qué falta |
|---|---|
| 16 | Verificación manual en local de T1 y T3–T8 |
| 17 | Checklist de la PO: AJ-07 (el caso literal de 6,7 puntos sigue parcial), AJ-09 y AJ-10. AJ-08, criterio 2: necesita los datos reales de los $938.000 |
| 18 | Lanzamiento v2: casillas sin marcar (Storage privado, cron, respaldos, URL de `/auth/confirm`). Probablemente están superadas, pero no hay evidencia de cierre |

---

## 5. Decisiones de la PO

| # | ID | Pregunta |
|---|---|---|
| 19 | D-A | En una segunda importación, ¿se conserva la estructura o se reemplaza? |
| 20 | B8 | ¿Quién puede adjuntar el soporte de un gasto? |
| 21 | A3, A6, F3, F11 | Decisiones del rediseño de la ficha. El mensaje de `plan-trabajo-restante.md:337` («Opciones avanzadas», «Objetivo 1.» frente a «OE1.», chip «Umbrales sin confirmar») no tiene registro de envío |

---

## 6. Calidad y proceso

| # | Qué falta |
|---|---|
| 22 | Índices en `Oportunidad` por `cliente_id` y `estado`: no existen, solo `@@unique([id, cliente_id])` |
| 23 | Requerir PR para mergear a `main`: hoy un push directo esquiva los checks requeridos |
| 24 | Ramas remotas: 122 sin mergear, casi todas de PRs ya mergeados por squash o cerrados. Son para borrar, no hay trabajo vivo |
| 25 | Limpieza L3–L8. L3 espera la decisión del formato de fecha canónico. L6: crear `odd/archive/`, dejar las guías en un solo formato y decidir qué hacer con los specs e2e fuera de CI (`change-password`, `crm-demo`, `permisos-colaborador`, `proyectos-demo`) |
| 26 | Quitar `shadcn` de las dependencias (necesita un entorno con red) |
| 27 | Tablero: rango de fechas personalizado (`dashboard-page.tsx:2`) |
| 28 | `plan-trabajo-restante.md` §0 desactualizado: dice «último corte 2026-11-14», da #137 como por entrar y AJ-02 sin PR, y no registra el job `build` de CI ni el trabajo del 2026-11-17/18 |

---

## 7. Bloqueado por terceros

| # | ID | Qué falta | Bloqueado por |
|---|---|---|---|
| 29 | A2 | Verificar el dominio en Resend y ajustar `EMAIL_FROM` | DNS de `muttu.co` |
| 30 | A4 | Respaldos automáticos (PITR o dumps programados) y prueba de restauración | Plan de Supabase |
| 31 | E4 | Migración a Railway, Opción A. E5 (stack completo) después, si se va por ahí | Acceso a Railway |
| 32 | B2 / B4 | Prueba de la PO con sus archivos reales de presupuesto y estructura | La PO |

---

## Resuelto desde el corte anterior

- Las semillas ya escriben `gastos_reparto` (`scripts/seed-projects-demo.ts:887`, #206).
- L32.2 (tarjetas en móvil) y L32.3 (descripción del objetivo), en `8b0e1bc`.
- La contracción de AJ-02 está en `main` (#165).
- Hay un job `build` propio en CI (#213).

## Fuera de alcance (decidido)

- V4 convocatorias
- V10 propuesta económica
- E6 limpieza de artefactos del repo
- Permisos granulares por módulo (PRD §3.3.2), fuera de la v1 a propósito (`supabase/server.ts:149`)

---

## Orden sugerido

1. **Producción (1–3):** confirmar qué migraciones están aplicadas. Todo el frente de datos depende de eso.
2. **Bug del correo (12):** un reenvío duplicado lo ve el cliente final.
3. **Mandar las preguntas a la PO (19–21):** cuesta poco y destraba trabajo.
4. **Las chicas (15, 22, 23, 24, 28):** cierran deuda y el agujero del push directo.
5. **B6 y V2:** las dos grandes de producto. Piden migración y su propia sesión.
