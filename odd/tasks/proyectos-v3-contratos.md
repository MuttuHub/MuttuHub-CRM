# Contratos de Proyectos v3

Inventario del prototipo (`docs/ux-crm-2026-11/proyectos-v2-prototipo.html`): cada pantalla y cada acción con lo que
**hoy** existe en la app, el **hueco** cuando no hay nada, **quién** lo construye y qué **decisión** espera. Es la
entrada de B1–B8 y la lista de pedidos a A (plan paralelo §3 y §6, B0.4).

Leído de: el prototipo (pantallas, pestañas, diálogos), `rediseno-ciclo-proyecto.md` (ítems CP y acciones del video),
`src/hooks/projects.ts` (hook → endpoint) y `src/app/api/v1/**` (rutas reales). Las filas marcadas **«confirmar»** no
se pudieron cerrar leyendo el hook; se verifican en la unidad que las usa.

**Leyenda.** **Hoy** = endpoint o hook existente que v3 consume tal cual. **Hueco** = no existe. **Dueño**: A = agente A
(`src/app/api/**`, `src/lib/proyectos/**`, `prisma/**`, `src/hooks/projects.ts`, `ui/`); B = agente B (`proyectos-v3/**`).
Desde B3, B puede **agregar** archivos de endpoint nuevos con aviso; todo cambio a un archivo existente se pide a A.
**Decisión** = ID de la puerta (plan §4, rediseño §5) o «—».

> **D-V3-1 está resuelta desde el 2026-11-04** (`odd/tasks/backlog-completo-2026-11.md`, L15): «no se reserva la
> interfaz. La interfaz de U17–U21 se construye en la sección viva y v3 la hereda cuando llegue». Consecuencia para este
> inventario: **U17, U18/CP6 y U19 no son pedidos de B**; son trabajo de A en la sección viva, y v3 los hereda. Quedan
> marcados así abajo, sin renumerar la lista de pedidos para no romper las referencias.

## 1. Portafolio · pantalla 1 (`/proyectos-v3`)

| Elemento del prototipo | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Filas: código, nombre, cliente, estado, semáforo técnico, avance real/plan, ejecución $, próxima alerta | `useProjectsPortfolio` → `GET /api/v1/dashboard/portfolio` | — | B (pantalla) | P5 |
| KPIs gerenciales (en ejecución, en crítico, avance técnico promedio, ejecución financiera) | mismo endpoint (`/dashboard/portfolio`) | — | B | P5 |
| Filtros Todos / En ejecución / En Crítico / Borradores, cliente, responsable | el endpoint arma filtros desde `useProjectsPortfolio`; el conjunto exacto se confirma en B1 | parcial | B | P5 |
| «Lo que te toca esta semana» por rol | `GET /api/v1/dashboard/my-summary` (resumen personal, otro alcance) y `GET /projects/{id}/attention` | falta la lista por proyecto y rol | A (endpoint) + B | **D-G11** (P3) |
| «Nuevo proyecto» | `useCreateProject` → `POST /api/v1/projects`; `useCreateProjectFromOpportunity` | — | B (enlace) | — |
| Fila de borrador con «Faltan n de 6 requisitos» | `precondicionesLineaBase()` en `src/lib/proyectos/linea-base.ts`; no hay lectura por API | `GET /projects/{id}/baseline/check` (PR-14, U9/U10) | A | — |
| «Tablero gerencial» | el prototipo solo muestra un aviso: no hay ruta ni ítem | — (fuera de B0) | — | — |

## 2. Ficha del proyecto · pantalla 2

### Cabecera

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Identificación, estado, cliente, responsable | `useProject` → `GET /projects/{id}` | — | B | — |
| Chip «Técnico · N % real · plan · atrasadas» | `useProjectTechnicalStatus` → `GET /projects/{id}/technical-status` | — | B | — |
| Chip «Financiero · % ejecutado · % de lo programado» | `useProjectFinancialSheet` → `GET /projects/{id}/financial-sheet` | — | B | — |
| Banner de congelado (suspendido/cerrado) | `transiciones-estado.ts` (regla) + `GET /projects/{id}` | — | B | B7 |
| «Solicitar cambio» de datos generales (valor, fechas, responsable) | `useRequestModification` → `POST /projects/{id}/modifications`; `TipoModificacion` cubre TRASLADO, ADICION, REDUCCION, REPROGRAMACION, CRONOGRAMA, ENTREGABLES (`src/lib/proyectos/modificaciones.ts:15`) | no hay tipo para valor/fechas/responsable → confirmar con A en B2 | A | — |

### Pestaña Resumen

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| KPIs (avance técnico, ejecución financiera, beneficiarios, requiere atención) | `useProjectKpis` → `GET /projects/{id}/kpis`; `useProjectBeneficiaries` → `GET /projects/{id}/beneficiaries` | — | B | — |
| «Requiere atención» con botón que resuelve | `useProjectAttention` → `GET /projects/{id}/attention` | — | B | — |
| Datos generales y equipo | `useProject`, `useProjectMembers` → `GET /projects/{id}/members` | — | B | — |

### Pestaña Actividades

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Objetivos, actividades, entregables, indicadores (CRUD) | `useProjectObjectives/Activities/Deliverables/Indicators` → `GET/POST /projects/{id}/{objectives,activities,deliverables,indicators}` | — | B | — |
| Historial de avance por actividad + «Anular el último reporte» | `useActivityReports`, `useVoidActivityReport`, `useAttachActivityReportMedio` (`/activities/{aid}/progress…`) | — | B | — |
| Avance de entregable (meta + soporte) | `useDeliverableProgress`, `useVoidAvance`, `useAttachAvanceMedio` (`/deliverables/{did}/progress…`) | — | B | — |
| «Registrar avance» unificado (actividad + entregables + soporte) | hoy dos formularios (`reporte-actividad-form.tsx`, `ejecucion-avance-form.tsx`) sobre endpoints que ya existen | la UI unificada es de B; el registro unificado es CP8 | B | BL#27 · **PR-18** |
| Hitos por actividad (variante U22) | no hay modelo ni endpoint | schema + endpoint | A | **D-G7** (U22) |
| Vista Cronograma | cálculo puro en `src/lib/proyectos/gantt.ts` y `weeks.ts` | — | B | — |
| Vista Tablero (por estado de actividad) | `src/lib/proyectos/estado-actividad.ts` | — | B | — |
| Registro de medición de indicadores | `useCreateMedicion`, `useIndicatorMeasurements`, `useVoidMedicion` | — | B | — |

### Pestaña Finanzas

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Resumen por rubro: asignado, programado, ejecutado, ejecutado vs. programado | `useProjectFinancialSheet` (`?base=original`) | — | B | — |
| Comparar con plan original / versión vigente | `useProjectVersionCompare` → `GET /projects/{id}/versions/compare` | — | B | — |
| Gastos: filtros por estado, validar, rechazar, anular, adjuntar soporte | `useProjectExpenses`, `useValidateExpense`, `useRejectExpense`, `useVoidExpense`, `useAttachExpenseSupport`; cola global `useExpenseValidationQueue` → `GET /api/v1/expense-validations` | — | B | — |
| Gasto en 4 grupos con error por campo (U20) | el endpoint no cambia (`POST /projects/{id}/expenses`) | la agrupación es UI de B; el backend de U20 es de A | A + B | — |
| Tercero recordado del último gasto (CP9) | sin endpoint nuevo: se sugiere con los gastos ya cargados | UI de B sobre U20 | B | — |
| Presupuesto y programación (solo lectura en ejecución) | `useProjectBudget` → `GET /budget`, `useProjectProgramming` → `GET /programming` | — | B | — |
| Importar gastos desde Excel | `useImportExpenses` → `GET /expenses/template` + `POST /expenses/import` | — | B | — |

### Pestaña Documentos

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Lista de documentos con descarga firmada | `useProjectSupports` → `GET /projects/{id}/supports`; descarga `GET /supports/{sid}/download` | — | B | — |
| Subir documento (archivo o enlace, máx. 10 MB) | `useCreateProjectDocument` → `POST /supports` + `POST /supports/sign`; `useDeleteProjectDocument` | — | B | — |
| Filtro por origen (Proyecto, Actividades, Gastos, Indicadores) | el soporte trae su vínculo; el filtro lo arma B — confirmar en B2 si alcanza el dato actual | parcial | B (y A si falta el campo) | — |

### Pestaña Historial

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Modificaciones: aprobar, rechazar con comentario | `useProjectModifications`, `useApproveModification`, `useRejectModification` | — | B | — |
| Versiones y comparación con el plan original | `useProjectVersions`, `useProjectVersionCompare` | — | B | — |
| Auditoría | `useProjectAudit` → `GET /projects/{id}/audit` | — | B | — |

### Cierre (pestañas y diálogos de B7)

| Elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Checklist de cierre con «Resolver» | `POST /projects/{id}/estado` solo valida permiso y transición (`src/app/api/v1/projects/[id]/estado/route.ts`) | preflight de cierre, mismo patrón que `baseline/check` (CP11) | A | **D-CP3** |
| Informe de cierre en PDF | formatos de impresión R9/R10 (`src/components/proyectos/print/`) | contenido y destinatario (CP12) | A + B | **D-CP5** |
| «Solicitar cambio de meta» de un entregable (CP10) | `TipoModificacion.ENTREGABLES` existe; confirmar si cubre la meta | confirmar con A en B7 | A | **D-CP4** |

## 3. Asistente del borrador · pantalla 3 (5 pasos)

| Paso / elemento | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| 1 · Datos generales (origen, nombre, responsable, valor, fechas, meta de beneficiarios, líneas, municipio) | `useCreateProject` → `POST /projects`; `useEligibleOpportunities`, `useStrategicLines`, `useMunicipalities`, `useProjectMembers`; meta de beneficiarios por campo del proyecto (`useUpdateProject`) — confirmar nombre exacto en B1 | — | B | D-G1 (textos) |
| 1 · Aviso «la fecha de inicio ya pasó» | regla de fecha en la lib de línea base | UI de B | B | — |
| 2 · Estructura (objetivos → actividades → entregables) | CRUD de objetivos/actividades/entregables | — | B | — |
| 2 · «Importar desde Excel» único (U17) | hoy tres importadores: `useImportStructurePO` (`/structure/import`), `useImportBudget`, `useImportExpenses` | un solo botón con elección de formato | A en la sección viva; v3 lo hereda | D-V3-1 resuelta (L15) |
| 2 · Códigos automáticos (CP1) | hoy el código se escribe a mano y el 409 aparece al guardar | generación en el servidor | A | **D-CP6** |
| 2 · Rango de fechas en vez de semanas (CP2) | semanas en `activities`; el peso se deriva (`weeks.ts`) | servidor calcula semanas desde fechas | A | — |
| 2 · Responsable obligatorio (CP3) | hoy opcional | formulario + importación + checklist | A + B | **D-CP1** |
| 2 · Entregable sin «Tipo de medio exigido» (CP5) | hoy se envía en `estructura-entregables.tsx:141` | migración aditiva (columna sin uso) | A | **D-CP2** |
| 3 · Ver cronograma (solo lectura) | `gantt.ts`, `weeks.ts` | — | B | — |
| 4 · Presupuesto y programación | `useProjectBudget`, `useProjectProgramming`, `useUpdateBudget`, `useUpdateProgramming`, `useSetValorTotal`, `useImportBudget`, `useImportTemplate` | — | B | — |
| 4 · «Repartir según cronograma» (U18 + CP6) y «un solo guardado» (U19) | hoy reparto en partes iguales y dos guardados | endpoints nuevos | A en la sección viva; v3 lo hereda | D-V3-1 resuelta (L15) |
| 4 · «Ajustar en el último mes» cuando no cuadra (CP7) | U12 (diferencia visible) | UI de B sobre U12 | B | — |
| 5 · Checklist «Listo para aprobar · n de 6» | `precondicionesLineaBase()`; hoy solo aparece en el 409 de aprobar | `GET /projects/{id}/baseline/check` | A | — |
| 5 · Aprobar línea base | `useApproveBaseline` → `POST /projects/{id}/baseline/approve` (permiso Admin/Gerencia ya aplicado) | — | B | — |
| 5 · «Avisar a Gerencia» (P4) | no existe; hay `GET/POST /api/v1/notifications` (outbox) | tipo de notificación nuevo | A | **D-G12** |

## 4. Diálogos y acciones transversales · pantalla 4

| Diálogo o acción | Hoy | Hueco | Dueño | Decisión |
|---|---|---|---|---|
| Registrar avance (actividad) | `useCreateAvance` → `POST /activities/{aid}/progress` | — | B | — |
| Anular el último reporte (con motivo) | `useVoidActivityReport` / `useVoidAvance` | — | B | — |
| Registrar entregable (meta + soporte) | `useCreateAvance` (deliverable) + `useAttachAvanceMedio` | — | B | — |
| Registrar gasto (4 grupos) | `useCreateExpense` → `POST /expenses` + `POST /expenses/sign` | — | B | — |
| Adjuntar soporte a un gasto | `useAttachExpenseSupport` → `POST /expenses/{id}/attachments` | — | B | — |
| Validar gasto | `useValidateExpense` → `POST /expenses/{id}/validate` | — | B | — |
| Rechazar gasto (motivo obligatorio) | `useRejectExpense` → `POST /expenses/{id}/reject` | — | B | — |
| Anular gasto (motivo, permitido aun congelado) | `useVoidExpense` → `POST /expenses/{id}/void` | — | B | — |
| Solicitar cambio (presupuesto, meta, fechas, estructura) | `useRequestModification` → `POST /modifications` | tipo de «datos generales» (ver cabecera) | A | — |
| Aprobar / rechazar modificación | `useApproveModification`, `useRejectModification` | — | B | — |
| Cambiar estado (suspender, cerrar, reactivar, cancelar) con motivo | `useChangeProjectEstado` → `POST /estado` | — | B | B7 |
| Importar desde Excel (estructura, presupuesto, gastos) | `useImportStructurePO`, `useImportBudget`, `useImportExpenses` | unificación U17 | A en la sección viva; v3 lo hereda | D-V3-1 resuelta (L15) |
| Descargar plantilla | `useImportTemplate` (`GET /template`), `GET /budget/template`, `GET /expenses/template` | unificación U7 (hecha en v1: PR-7) | B | — |
| Registrar medición de indicador | `useCreateMedicion` → `POST /indicators/{iid}/measurements` | — | B | — |
| Subir documento del proyecto | `useCreateProjectDocument` | — | B | — |
| Descargar soporte | `GET /supports/{sid}/download`, `GET /expenses/{eid}/attachments/{aid}/download`, `GET /progress/{aid}/attachments/{atid}/download` | — | B | — |
| Exportar a Excel | `GET /projects/{id}/export` (hook de descarga en `src/hooks/projects.ts:2939`) | — | B | — |
| Imprimir / PDF | formatos R9/R10 en `src/components/proyectos/print/` | — | B | — |
| «¿Descartar los cambios?» al cerrar un diálogo con datos (BL#9/10) | — | UI de B | B | — |
| Botón destructivo que dice la acción (BL#13) | — | UI de B | B | — |

## 5. Reglas de la PO: dónde viven hoy (v3 no las reimplementa)

v3 **consume** estas reglas; ninguna se vuelve a escribir en `proyectos-v3/`. La matriz de paridad de B0.6 las fija.

| Regla | Dónde vive | Pantalla de v3 que la muestra |
|---|---|---|
| AJ-01: avance mayor que el último, tope 90 % sin entregables completos, observación obligatoria, solo el responsable, anular solo el último | `src/lib/proyectos/avance.ts` y endpoints de `progress` | Ficha › Actividades, diálogo de avance |
| AJ-02: peso = semanas, no editable | `weeks.ts`, `avance.ts` | Actividades (texto), Cronograma |
| AJ-03: atraso por ejecución contra el tope | `avance.ts`, `semaforo-v2.ts` | Portafolio, Ficha › Resumen |
| AJ-04: Subtotal + IVA = Total; IVA obligatorio (puede ser 0) | `money.ts`, `gastos.ts` | Ficha › Finanzas › Gastos, diálogo de gasto |
| AJ-05: periodo desde la fecha del documento; «Periodo modificado» | `gastos.ts` | Diálogo de gasto |
| AJ-06: varios archivos y enlaces, hasta 5 por gasto | endpoints de `attachments` | Avance, entregable, gasto |
| Línea base: 6 requisitos | `linea-base.ts` (`precondicionesLineaBase`) | Asistente paso 5, fila de borrador |
| Nadie valida su propio gasto; sin soporte no se valida | `gastos.ts` + `POST /expenses/{id}/validate` | Ficha › Finanzas › Gastos |
| B7: estados y congelamiento | `transiciones-estado.ts` | Cabecera, diálogo de estado, portafolio |

## 6. Pedidos a A (resumen para su tracker)

Cada línea es lo que v3 necesita y hoy no existe; Adrián las pasa a A. El orden respeta la línea de A del plan §5.
Los puntos **4 y 5** quedaron reclasificados: no son pedidos de B, son trabajo de A en la sección viva que v3 hereda
(D-V3-1 resuelta, L15). Se dejan en su lugar para no renumerar la lista.

1. `GET /projects/{id}/baseline/check` — PR-14 (U9, U10). Habilita el checklist del asistente y la fila de borrador.
2. «Mi semana en el proyecto»: endpoint por proyecto y rol (o ampliación de `dashboard/my-summary`) — P3, **D-G11**.
3. Tipo de modificación para valor, fechas y responsable del proyecto — B2.
4. ~~U17: un solo «Importar desde Excel» con elección de formato — F4.7.~~ **No es un pedido de B:** A lo construye en
   la sección viva y v3 lo hereda (D-V3-1 resuelta, L15).
5. ~~U18 + CP6 («repartir según cronograma») y U19 (un solo guardado) — F4.7.~~ **No es un pedido de B:** igual que el
   anterior, A en la sección viva y v3 lo hereda.
6. U20: campos que el gasto agrupado necesita del backend — B6.
7. CP11: preflight de cierre antes de `POST /estado` — **D-CP3**.
8. CP12: datos del informe de cierre en PDF — **D-CP5**.
9. U22: hitos (schema + endpoint) — **D-G7**.
10. Notificación «Enviar a Gerencia» sobre el outbox existente — P4, **D-G12**.
11. CP1: códigos automáticos generados en el servidor — **D-CP6**.
12. CP3: responsable obligatorio en formulario, importación y checklist — **D-CP1**.
13. CP5: retirar «Tipo de medio exigido» del entregable (migración aditiva) — **D-CP2**.
14. CP2: semanas calculadas desde el rango de fechas — sin decisión pendiente.

## 7. Qué desbloquea cada pantalla

| Pantalla | Necesita de A | Decisiones |
|---|---|---|
| B1 Portafolio v3 | pedido 2 | P5, D-G11, D-G1 |
| B2 Ficha v3 en lectura | pedido 3, PR-16 | D-G1 |
| B3 Estructura en tabla | pedidos 11, 12, 13, 14 (U17 lo hereda de la sección viva) | D-CP1, D-CP2, D-CP6 |
| B4 Presupuesto y programación | hereda de la sección viva (U18/CP6 y U19); sin pedidos propios | — |
| B5 Aprobación con checklist y «Enviar a Gerencia» | pedidos 1, 10 | D-G12 |
| B6 Registros: avance unificado y gasto en 4 grupos | pedidos 6, 9 | D-G7, D-G11 |
| B7 Cierre | pedidos 7, 8 | D-CP3, D-CP4, D-CP5 |
| B8 Activación y retiro de v1 | — | D-V3-2 |

Ninguna pantalla empieza mientras la puerta de decisiones siga cerrada (S2 de `odd/tasks/proyectos-v3.md`).
