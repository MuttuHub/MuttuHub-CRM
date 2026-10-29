# Plan de trabajo restante

Estado de partida: **2026-10-19**, `main` en `add9df0`, v2 del módulo de Proyectos en producción con la matriz de
permisos vigente, 4136 pruebas unitarias y 29 e2e en verde.

IDs: **A** operación, **B** producto, **V** v7 CRM, **U** auditoría UX (sus hallazgos conservan `C1–C12`), **E** plataforma. **Estado de ejecución (2026-10-19):** A1 (etiqueta `v2.0.0`), A5 (credenciales), B1/D1 (mensaje de acceso) y **U0
(re-auditoría UX)** están **hechos**. La re-auditoría encontró 10 de 16 hallazgos ya resueltos y dejó cuatro vigentes,
todos pequeños: `odd/tasks/ux-audit-2026-10-19.md`. Detalle de la fase en `odd/tasks/fase-0-ejecucion.md`.
**Último corte: 2026-10-26** — ver la sección 10 (hecho, pendientes y orden recomendado para retomar).

Este plan ordena lo que queda en cinco frentes. Cada tarea trae tamaño (**S** ≤ 1 día, **M** 2–4 días, **L** 1–2
semanas), de qué depende y cómo se sabe que está terminada. Las decisiones que bloquean trabajo están en la sección 5.

---

## 1. Frente A — Cierre operativo del lanzamiento

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| A1 | Etiqueta `v2.0.0` sobre el commit desplegado | S | — | `git tag` empujado y producción sirviendo ese commit |
| A2 | Verificar el dominio en Resend y ajustar `EMAIL_FROM` | S | Acceso al DNS de `muttu.co` | `cron_logs` del día siguiente con `sent>0` y `estado=OK` |
| A3 | Humo en producción con un Coordinador y un Colaborador reales | S | — | Las cinco comprobaciones del runbook §4 marcadas |
| A4 | Respaldos automáticos (PITR o dumps programados) y prueba de restauración | M | Plan de Supabase | Una restauración real ejecutada en un entorno desechable |
| A5 | Limpieza de credenciales y respaldos: borrar `~/.muttu-prod-url`, fijar retención | S | — | `env` sin variables de producción y carpeta de respaldos con política escrita |

---

## 2. Frente B — Producto: módulo de Proyectos

Ordenado por lo que la PO pidió y por lo que desbloquea más trabajo.

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| B1 | **D1**: no reintentar 403/404 en `useProject()` | S | — | El mensaje de «sin acceso» aparece en < 2 s y la prueba e2e correspondiente pasa |
| B2 | Adaptador de **presupuesto** de la PO (`rubro | valor`) | S | Acceso a `presupuesto.xlsx` real | **Código listo** en `feat/po-budget-import` (P1–P3); falta la prueba manual con el archivo real de la PO (P4) |
| B3 | Adaptador de **estructura** de la PO (objetivos, actividades, entregables con cantidad/unidad/medio) | M | B2, decisión **D-A** | **Hecho**: importar `proyecto.xlsx` crea O/A/E (e indicadores) con códigos generados, solo estructura y sin tocar el presupuesto, y la vista previa lista los errores por hoja y celda; el archivo actual de la PO necesita las columnas «Cantidad» y «Unidad» (B4) |
| B4 | Plantillas actualizadas para la PO (con las columnas nuevas) | S | B3 | Archivos entregados y probados por la PO |
| B5 | Importar **solo estructura** sin presupuesto | S–M | Decisión **D-A** | Un proyecto con presupuesto ya cargado puede importar estructura sin tocarlo |
| B6 | **Rubros editables por proyecto** (deshabilitar y agregar) | M–L | Decisión **D-B**, migración | El presupuesto de un proyecto oculta rubros deshabilitados y acepta uno propio, sin afectar a otros proyectos |
| B7 | **Cerrar / suspender / cancelar** proyecto | M | Decisión **D-C** | **Hecho**: la ficha cambia de estado con motivo, auditoría y reglas de quién puede hacerlo (solo Administración y Gerencia); suspendido, cerrado o cancelado quedan congelados, salvo las anulaciones |
| B8 | Importar **gastos** desde Excel | M | B2 como referencia | **Hecho**: un archivo de gastos entra con validación por fila y queda en `REGISTRADO` sin soportes; el soporte se adjunta después y sin él no se valida |

> B1 es el único de este frente que no depende de una decisión: puede entrar en la primera semana.

### 2.1 Ajustes de la PO del 2026-10-28 (AJ)

Fuente: documento «Ajustes al módulo Proyectos» v1.1 (28 de octubre de 2026), observaciones de las pruebas del 27 de
octubre. Según el documento, cada «cambio de regla» prevalece sobre la regla de la v2.0.

| ID | Ajuste | Prioridad | Estado |
|---|---|---|---|
| AJ-01 | Estado **En curso** con reporte de avance de la actividad (porcentaje + observación, tope configurable, historial) | Alta | Pendiente; necesita una tabla nueva |
| AJ-02 | Peso de cada actividad = su duración en semanas, no editable | Alta | Pendiente; depende de AJ-01 |
| AJ-03 | El atraso se mide por la ejecución (llegar al tope en la fecha fin), no por los soportes | Alta | Pendiente; depende de AJ-01 |
| AJ-04 | IVA discriminado: Subtotal + IVA = Total; el ejecutado es el Total | Alta | **Hecho** (#99, migración aplicada en producción el 2026-10-28) |
| AJ-05 | Periodo del gasto tomado de la fecha del documento, con la marca «Periodo modificado» | Media | **Hecho** (#99) |
| AJ-06 | Varios archivos y enlaces por avance y por gasto, columna «Enlace del soporte», botón «Adjuntar archivo» | Alta | Pendiente; sin migración |

**Decisiones del usuario, como vocero de la PO (2026-10-28):**

1. Si una actividad tiene reportes y entregables, su avance es **el mayor** entre el último reporte y el promedio de los
   entregables.
2. Las actividades con avances de entregables pero sin reportes conservan el cálculo anterior.
3. Los pesos manuales ya guardados se recalculan por duración. Las líneas base aprobadas conservan su foto histórica.
4. El reporte de avance lo registra el **responsable** de la actividad.
5. El tope del 90 % sobre lo programado aplica al color del proyecto, al color de cada actividad y a la curva S.
6. Las plantillas de gastos con «Valor (COP)» se rechazan con un mensaje que pide la plantilla nueva (hecho en AJ-04).

Orden recomendado: AJ-06, luego AJ-01 → AJ-02 → AJ-03, cada uno con su documento en `odd/tasks/` y su PR.

---

## 3. Frente C — v7 en CRM

Primero una verificación, porque hay rutas que existen y no se sabe si cumplen el prototipo. Sin ese paso, se corre el
riesgo de reconstruir lo que ya está.

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| V0 | **Verificación de paridad** de `/clientes/mapa`, `/clientes/salud`, `/clientes/relaciones` y `/clientes/automatizaciones` contra v7 | S | — | Documento con «cumple / parcial / esqueleto» por pantalla y backend faltante |
| V1 | Oportunidades globales: lista y kanban por etapas | M–L | V0, decisión **D-D** | Existe una vista global con las etapas acordadas y mover una oportunidad actualiza su fase |
| V2 | Ficha de oportunidad con conversión a proyecto y tareas | M | V1 | Convertir una ganada crea el proyecto y enlaza las tareas |
| V3 | Interacciones con `tipo` y `próximo paso` + feed global | M | Migración | El feed global filtra por tipo y muestra el próximo paso |
| V4 | Convocatorias (modelo, CRUD, página) | M | Decisión **D-D** | Alta, edición y listado con estados |
| V5 | Mapa de aliados por departamento | M | V0 | Agregación por departamento con filtros y sin datos inventados |
| V6 | Salud de cartera con score de proyectos | M | V0 | El score se calcula en servidor y explica sus componentes |
| V7 | Relaciones poder/interés/fuerza con cuadrantes | M | V0 | Mapa de cuadrantes y lista coherentes |
| V8 | Automatizaciones ligadas a umbrales y cron | S–M | V0 | Un umbral activo dispara el aviso esperado |
| V9 | Ficha de seguimiento con tabla mensual y «nueva planeación» | M | — | La tabla permite editar la planeación de un mes y la curva S refleja el cambio |
| V10 | Propuesta económica de la oportunidad | L | Decisión **D-D** | **Fuera de alcance** salvo que el negocio lo pida |

---

## 4. Frente U — Auditoría UX/UI (re-auditada el 2026-10-19)

Resultado de **U0**: 10 de los 16 hallazgos de 2026-09-23 ya no se reproducen (header, tarjetas de clientes, Client
Sheet, Gantt, tabla de usuarios, Curva S, ruta vieja, IP/Agente, cronograma y tooltip de cliente). Evidencia en
`odd/tasks/ux-audit-2026-10-19.md`.

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| U1 | Categoría de documento duplicada por fila (C7) | S | — | **Hecho**: seed corregido + etiquetas filtradas |
| U2 | Leyenda del Gantt (C9) | S | — | **Hecho**: leyenda con texto |
| U3 | Entidad `dashboard` en la bitácora de auditoría (C12) | S | — | **Hecho**: «Tablero», sin warning |
| U4 | Quitar los estilos inline del login (C6) | M | — | **Hecho**: inputs con clases; sin warning de hidratación |
| U5 | Indicador de scroll en subnavegación (N1) | S | — | **Hecho**: degradado en móvil |

## 5. Frente E — Plataforma y calidad

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| E1 | Conectar Playwright a CI (build + base sembrada) | M | Infra de CI | **Hecho**: la suite mantenida `e2e/proyectos-v2` (31 pruebas) corre en cada PR contra una base sembrada (job `e2e`); los specs legacy de la raíz quedan fuera como seguimiento |
| E2 | Umbral de cobertura realista y creciente | L | — | **Hecho**: piso en CI con `autoUpdate` hacia arriba (solo en local); hoy 74/73/69/65 (líneas/sentencias/funciones/ramas) |
| E3 | `npm run lint` reproducible en local | S | — | **Hecho**: artefactos locales ignorados y 0 problemas |
| E4 | Migración a Railway — **Opción A** (app en Railway, Supabase se queda) | S–M | Acceso a Railway | Producción sirviendo desde Railway con el mismo dominio |
| E5 | Migración a Railway — **Opción B** (stack completo, Auth propio) | L | E4, decisión **D-F** | Paridad del humo completa y una semana de estabilidad |
| E6 | Limpieza de artefactos del repositorio (zip del prototipo, PDFs y HTML duplicados) | S | Decisión del usuario | Árbol sin archivos muertos y sin enlaces rotos |

---

## 6. Secuencia recomendada

| Fase | Contenido | Por qué |
|---|---|---|
| **Fase 0** (hecha) | A1, A5, B1, U0 | Etiqueta, credenciales, D1 y re-auditoría UX |
| **Fase 1** (siguiente) | A2, A4, U1–U3, E3 | Riesgo operativo y los cuatro hallazgos vigentes, que son pequeños |
| **Fase 2** | B2 → B3 → B4 → B5 | Es el flujo que pidió la PO y se puede entregar por partes |
| **Fase 3** | B6, B7, B8 y V1–V3 según decisiones | Cada uno con su documento de feature y su migración |
| **Fase 4** | V4–V9, D2, D4, E1, E2, E4 | Mejora continua y plataforma |

Cada tarea que toque esquema, permisos o dinero entra con documento en `odd/tasks/`, pruebas primero y PR propio.

---

## 7. Decisiones abiertas

| ID | Decisión | Quién | Bloquea |
|---|---|---|---|
| **D-A** | ¿La importación de estructura deja de exigir el presupuesto completo? ¿Modo «solo estructura» que conserve el existente? | PO | **Decidida (2026-10-21)**: modo «solo estructura» que conserva el presupuesto existente. **Precisada (2026-10-26)**: «La idea es subir un solo documento, si no tiene presupuesto se crea la estructura con presupuesto cero. se debe conversvar tal cual la estrucutra en caso tal exista una importacion posterior.» Destraba B3 y B5 |
| **D-B** | ¿El rubro personalizado vive solo en su proyecto o se suma al catálogo global? ¿Cómo se agrupa en reportes? ¿Qué pasa al deshabilitar un rubro con gastos? | PO | **Decidida (2026-10-26)**: «Los 15 rubros están bien, deben ser editables y modificables por si depronto para un proyecto no aplican, se puedan deseleccionar o inhabilitar para ese proyecto en concreto». Sin rubros propios. Destraba B6 |
| **D-C** | Al cerrar o suspender: ¿se congela todo, se permite registrar gastos, quién puede hacerlo? | PO | **Decidida (2026-10-26)**: «si se suspende queda congelado. Si se cierra puede volver a abrirse, quedaria temporalmente solo lectura mientras no deba reactivarse. Solo gerencia y adminsitracion pueden suspender o cancelar.» Destraba B7 |
| **D-D** | ¿Convocatorias, propuesta económica y oportunidades globales entran en el alcance del negocio? | Negocio | **Decidida (2026-10-21)**: entran oportunidades globales (V1, V2) e interacciones con feed (V3); quedan fuera convocatorias (V4) y propuesta económica (V10) |
| **D-E** | Acceso al DNS de `muttu.co` para verificar Resend | Negocio / TI | A2 |
| **D-F** | ¿Railway reemplaza a Vercel solo (Opción A) o también a Supabase (Opción B)? | Usuario | E4, E5 |

---

## 8. Riesgos

- **Datos:** cualquier tarea con migración (B6, B7, V3) sigue el procedimiento del runbook: respaldo verificado,
  `migrate deploy` antes del código y `migrate diff` vacío.
- **Autorización:** B7 y V1 tocan quién puede hacer qué; se tratan como cambio de seguridad con su matriz y sus pruebas.
- **Alcance de v7:** el prototipo no es requisito. Antes de construir V1–V10 hay que confirmar **D-D**, o se repetirá el
  patrón de trabajo sin validación.
- **Deuda de pruebas:** E1 ya corre la suite `e2e/proyectos-v2` en cada PR. Quedan fuera de CI los specs legacy de la
  raíz (`invitation-flow`, `oportunidad-ciclo`, `permisos-colaborador`, `proyectos-ficha-pagina`); una regresión en
  esos flujos sigue dependiendo de que alguien los ejecute a mano.

---

## 9. Definición de terminado

Una tarea se considera terminada cuando: el comportamiento está implementado, hay pruebas que lo fijan (unitarias y,
si es de UI, componente o e2e), `tsc` y lint están limpios, la documentación afectada se actualizó y el cambio está en
`main` con su PR revisado. Las tareas con migración añaden el respaldo verificado y la comprobación de conteos.

---

## 10. Corte del 2026-10-26 y próximos pasos

`main` en `51c957a`. CI de `main` en verde (jobs `unit` y `e2e`).

### Hecho en esta jornada

| PR | Qué |
|---|---|
| #85, #89 | La suma del presupuesto importado pasa a ser el total del proyecto (V-12 deja de bloquear); el invariante en vivo fija el bloqueo en V-13 |
| #86, #87, #88 | Ajustes de la PO (`Hub-proyectos.docx`, 2026-10-23): ficha en la misma ventana, cliente en un solo campo con búsqueda, plantilla sin «Tipo de medio exigido» ni «Unidad» (el formato anterior se sigue aceptando). Departamento → municipio ya estaba (#80) |
| #90 | E3 (lint reproducible) y V0 (paridad v7) |
| #91 | E2 (piso de cobertura que solo sube) |
| #92 | B2 (importar presupuesto desde el libro de la PO) |
| #94 | E1 (Playwright en CI contra una base sembrada) |
| #95 | B8 (importar gastos desde Excel; el soporte se adjunta después y sin soporte no se valida). Detalle: `odd/tasks/importar-gastos.md` |
| #96 | La búsqueda de clientes ya no reescribe la URL al abrir la ficha (cancelaba «Crear proyecto»; hacía inestable el e2e) |

Abierto: este PR de documentación (#93), con las decisiones D-A, D-B y D-C de la PO.

### Orden recomendado para retomar

1. **Arreglos chicos (< 1 h):**
   - Corregir el mensaje «La descripción es obligatorio.» → «obligatoria».
   - Los imports de presupuesto (B2) y gastos (B8) solo deben aceptar `modo=validar` o `modo=aplicar`; hoy cualquier
     otro valor aplica el import.
2. **B7 — cerrar / suspender / cancelar.** D-C está decidida sin ambigüedad: suspendido = congelado; cerrado = solo
   lectura y se puede reabrir; solo gerencia y administración suspenden o cancelan. Toca permisos: documento de feature,
   matriz y pruebas primero.
3. **B6 — rubros editables por proyecto** (D-B decidida; requiere migración).
4. **B3 → B4 → B5**, después de aclarar con la PO la pregunta 1 de abajo.
5. A2 y A4 cuando haya acceso al DNS de `muttu.co` y al plan de Supabase; V1–V3 según D-D.

### Preguntas para la PO

1. **D-A:** «se debe conservar tal cual la estructura en caso exista una importación posterior»: en una segunda
   importación del mismo proyecto, ¿se conserva la estructura existente y solo se carga el presupuesto, o se reemplaza
   la estructura?
2. **Soportes de gastos (B8):** hoy solo quien registró el gasto puede adjuntarle el soporte. ¿Debe poder hacerlo
   cualquier miembro del proyecto (o el coordinador)?

### Seguimientos técnicos de B8 (no bloquean)

- El tope de 5 soportes por gasto se re-verifica sin bloqueo de fila (igual que los adjuntos de avance).
- Un miembro COLABORADOR puede importar gastos, igual que puede registrar uno (`canAccessProject`).
- Specs e2e legacy fuera de CI (ver Riesgos).
