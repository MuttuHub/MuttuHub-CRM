# Plan de trabajo restante

Estado de partida: **2026-10-19**, `main` en `add9df0`, v2 del módulo de Proyectos en producción con la matriz de
permisos vigente, 4136 pruebas unitarias y 29 e2e en verde.

IDs: **A** operación, **B** producto, **V** v7 CRM, **U** auditoría UX (sus hallazgos conservan `C1–C12`), **E** plataforma. **Estado de ejecución (2026-10-19):** A1 (etiqueta `v2.0.0`), A5 (credenciales), B1/D1 (mensaje de acceso) y **U0
(re-auditoría UX)** están **hechos**. La re-auditoría encontró 10 de 16 hallazgos ya resueltos y dejó cuatro vigentes,
todos pequeños: `odd/tasks/ux-audit-2026-10-19.md`. Detalle de la fase en `odd/tasks/fase-0-ejecucion.md`.
**Último corte: 2026-11-06** — ver la sección 11 (rediseño de la ficha en `main` y plan del 2026-11-07).

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
| B2 | Adaptador de **presupuesto** de la PO (`rubro | valor`) | S | Acceso a `presupuesto.xlsx` real | **Hecho** (#92): `lib/proyectos/presupuesto-po/parse.ts` matchea rubros por nombre normalizado y el diálogo vive en Finanzas; falta la prueba manual con el archivo real de la PO (P4) |
| B3 | Adaptador de **estructura** de la PO (objetivos, actividades, entregables con cantidad/unidad/medio) | M | B2, decisión **D-A** | **Hecho**: importar `proyecto.xlsx` crea O/A/E (e indicadores) con códigos generados, solo estructura y sin tocar el presupuesto, y la vista previa lista los errores por hoja y celda; el archivo actual de la PO necesita las columnas «Cantidad» y «Unidad» (B4) |
| B4 | Plantillas actualizadas para la PO (con las columnas nuevas) | S | B3 | **Hecho en código**: el juego nuevo de columnas incluye «Cantidad» y «Unidad» (`lib/proyectos/plantilla/columns.ts`) y el viejo se sigue aceptando; falta que la PO pruebe sus archivos |
| B5 | Importar **solo estructura** sin presupuesto | S–M | Decisión **D-A** | **Hecho**: el import de estructura no toca el presupuesto ni la programación (`lib/api/estructura-po-import.ts`), con `modo=validar|aplicar` |
| B6 | **Rubros editables por proyecto** (deshabilitar y agregar) | M–L | Decisión **D-B**, migración | El presupuesto de un proyecto oculta rubros deshabilitados y acepta uno propio, sin afectar a otros proyectos |
| B7 | **Cerrar / suspender / cancelar** proyecto | M | Decisión **D-C** | **Hecho**: la ficha cambia de estado con motivo, auditoría y reglas de quién puede hacerlo (solo Administración y Gerencia); suspendido, cerrado o cancelado quedan congelados, salvo las anulaciones |
| B8 | Importar **gastos** desde Excel | M | B2 como referencia | **Hecho**: un archivo de gastos entra con validación por fila y queda en `REGISTRADO` sin soportes; el soporte se adjunta después y sin él no se valida |

> B1 es el único de este frente que no depende de una decisión: puede entrar en la primera semana.

### 2.1 Ajustes de la PO del 2026-10-28 (AJ)

Fuente: documento «Ajustes al módulo Proyectos» v1.1 (28 de octubre de 2026), observaciones de las pruebas del 27 de
octubre. Según el documento, cada «cambio de regla» prevalece sobre la regla de la v2.0.

| ID | Ajuste | Prioridad | Estado |
|---|---|---|---|
| AJ-01 | Estado **En curso** con reporte de avance de la actividad (porcentaje + observación, tope configurable, historial) | Alta | **Hecho** (rama `feat/aj01-estado-en-curso`, tabla nueva ReporteActividad; migración aplicada en producción el 2026-11-04) |
| AJ-02 | Peso de cada actividad = su duración en semanas, no editable | Alta | **Hecho** (rama `feat/aj02-peso-duracion`: migración en dos pasos —esta deja `peso` opcional y sin CHECK; una migración posterior borra `peso` y `peso_manual` cuando el código de AJ-02 ya esté en producción—, peso derivado en todo el servidor, formulario sin campo de peso; migración de expansión aplicada en producción el 2026-11-04 — la de contracción queda desbloqueada y pendiente de su ensayo) |
| AJ-03 | El atraso se mide por la ejecución (llegar al tope en la fecha fin), no por los soportes | Alta | **Hecho** (rama `feat/aj03-atraso-por-ejecucion`, sobre AJ-02: cumplimiento del cronograma, actividades atrasadas, «Requiere atención» y Tablero miden contra el tope; lo programado de cada actividad llega como máximo al tope, en colores y curva S; sin migración) |
| AJ-04 | IVA discriminado: Subtotal + IVA = Total; el ejecutado es el Total | Alta | **Hecho** (#99, migración aplicada en producción el 2026-10-28) |
| AJ-05 | Periodo del gasto tomado de la fecha del documento, con la marca «Periodo modificado» | Media | **Hecho** (#99) |
| AJ-06 | Varios archivos y enlaces por avance y por gasto, columna «Enlace del soporte», botón «Adjuntar archivo» | Alta | **Hecho** (rama `feat/aj06-soportes-multiples`, sin migración) |

**Decisiones del usuario, como vocero de la PO (2026-10-28):**

1. Si una actividad tiene reportes y entregables, su avance es **el mayor** entre el último reporte y el promedio de los
   entregables.
2. Las actividades con avances de entregables pero sin reportes conservan el cálculo anterior.
3. Los pesos manuales ya guardados se recalculan por duración. Las líneas base aprobadas conservan su foto histórica.
4. ~~El reporte de avance lo registra el **responsable** de la actividad.~~ **Reemplazada el 2026-11-05:**
   lo registra **cualquier integrante del equipo del proyecto** (o Administración/Gerencia). Motivo: la
   Coordinadora (PO), integrante pero no responsable, no veía «Registrar avance»; el documento de la PO
   (AJ-01, v1.1) no restringe por rol. Ver `odd/tasks/aj01-estado-en-curso.md`, L10.
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
| V1 | Oportunidades globales: lista y kanban por etapas | M–L | V0, decisión **D-D** | **Hecho** (#159, `0ad4f9b`): vista global cross-cliente con las siete etapas acordadas y totales en COP; mover una oportunidad actualiza su fase por el PATCH existente con `canManageOpportunity`. Pendiente deuda anotada: `Oportunidad` no tiene índice por `cliente_id` ni `estado` |
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
| **Fase 2** | B2 → B3 → B4 → B5 | Completa: los cuatro están en `main` (B2 por #92); B4 solo espera la prueba de la PO |
| **Fase 3** | B6, B7, B8 y V1–V3 según decisiones | Cada uno con su documento de feature y su migración |
| **Fase 4** | V5, V8, V9, D4, E4 | Mejora continua y plataforma. V4 queda fuera de alcance por D-D; V6 y V7 están hechos; V1–V3 están en la Fase 3; D2 está hecho y E1/E2 también |

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

1. **Verificar los dos arreglos chicos:** el mensaje «La descripción es obligatorio.» → «obligatoria», y que los
   imports de presupuesto (B2) y gastos (B8) solo acepten `modo=validar` o `modo=aplicar`. No hay evidencia reciente de
   ninguno de los dos: hay que mirarlos antes de darlos por pendientes.
2. **B6 — rubros editables por proyecto** (D-B decidida; requiere migración). Es la única del frente que sigue abierta.
3. **V1 — oportunidades globales**: la página existe pero redirige a `/clientes` con «aún no está construida». Destraba
   V2, que hoy convierte la oportunidad en proyecto pero no vincula las tareas (`Tarea` no tiene `proyecto_id`).
4. **V8 y V9 completos**: a V8 le faltan las reglas de «2 días antes» y «30 días sin contacto»; V9 solo edita la
   planeación del presupuesto en BORRADOR.
5. **D4 (esquema A)**: falta la semilla que demuestre «Pasar a nuevo proyecto» con una tarea comercial completada sobre
   una oportunidad GANADA sin proyecto. `scripts/seed-demo-flujo.ts` siembra 4 oportunidades libres y ninguna tarea.

B2, B3, B4, B5, B7, B8, V3, V6 y V7 están en `main`. A2 (dominio de Resend), A4 (respaldos) y E4 (Railway) siguen
bloqueadas por terceros, y V4 está fuera de alcance por D-D.
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

## 11. Corte del 2026-11-06: rediseño de la ficha y plan del 2026-11-07

`main` en `6ff65e0`. CI de #147 en verde (`unit`, `e2e` y la vista previa de Vercel).

### Hecho en esta jornada

| PR | Qué |
|---|---|
| #147 | Rediseño de la ficha aprobado por la PO: Resumen y cabecera, Actividades, Finanzas, Documentos e Historial, en escritorio y celular. T8: «Revisar» visible en «Gastos por validar», con aviso de permisos para quien no puede validar. T9: «Registrar avance» y «Registrar gasto» abren su ventana desde cualquier pestaña. Sin migraciones ni cambios de API. Detalle: `odd/tasks/proyectos-redisenio-ui.md` |

Antes del merge se verificó la base local: 41 migraciones aplicadas («Database schema is up to date!»). Este cambio no
agrega ninguna. El PR entró solo, con excepción de tamaño, por decisión de la usuaria; el código se revisó por tramos.

### Plan del 2026-11-07 (se movió al 2026-11-08)

Pedido de la usuaria: «Deja listo el plan de trabajo para el dia de mañana». Hallazgo que lo motiva: «por ejemplo a
ficha de documentos todavia no está igual que en prototipo».

0. Rama nueva desde `main` y nueva siembra de la base local (las corridas e2e dejaron gastos y soportes «E2E-…»).
1. **T10:** comparar las cinco pestañas con el **prototipo clicable** (`docs/ux-crm-2026-11/prototipo-ficha/`), en
   escritorio (1440 px) y celular (390 px), y entregar una lista de diferencias por pestaña antes de corregir. La
   revisión visual anterior solo comparó con los tableros del canvas.
2. **T11:** Documentos igual al prototipo: contador «Documentos · N», etiqueta «Filtrar por origen», chip activo
   oscuro, ícono de archivo sin el sufijo «(PDF)», «De dónde viene» como enlace a la actividad o al gasto con la segunda
   línea, columna «Estado» («Gasto rechazado», «Supera lo asignado»), «Subió» en dos líneas y el texto de «Del proyecto».
3. **T12:** avisos de la revisión de T8 y T9: error visible si no carga el presupuesto en «Registrar gasto»; el tope en
   «Registrar avance» espera a los entregables; quien registró su propio gasto sin ser gestor ve «Tú lo registraste»;
   limpiar el aviso de éxito y el código que quedó sin uso.
4. **T13:** lo que queda solo de interfaz: «Cambiar estado» dentro de «⋯», «Revisar gasto» desde «Qué falta» abre el
   panel en ese gasto, «debería ir en X» en la ventana de avance, y las ventanas de T9 revisadas a 390 px.

Lo que necesita la API o una respuesta de la PO sigue en `odd/tasks/proyectos-redisenio-ui.md` (L4).

### Plan del 2026-11-08 (actualizado)

El plan del 2026-11-07 no se empezó; se ejecuta hoy en este orden. Pregunta de la usuaria: «eso lo terminamos todo
hoy?». Las estimaciones son de trabajo efectivo:

| Paso | Qué | Estimación | Hoy |
|---|---|---|---|
| 0 | Mergear este PR (#148), rama nueva `fix/proyectos-ficha-prototipo` desde `main` y nueva siembra de la base local | 15 min | Sí |
| 1 | **T10:** capturas de app y prototipo de las cinco pestañas a 1440 y 390 px; lista de diferencias por pestaña con su tamaño | 1–2 h | Sí |
| 2 | **T11:** Documentos igual al prototipo (ocho diferencias) | 2–3 h | Sí |
| 3 | **T12:** avisos de la revisión de T8 y T9 | 1–2 h | Sí |
| 4 | **T13:** «Cambiar estado» en «⋯», «Revisar gasto» desde «Qué falta», «debería ir en X», ventanas de T9 a 390 px | 2–3 h | Probable |
| 5 | Lo que T10 encuentre en Resumen, Actividades, Finanzas e Historial | sin estimar | Se decide con la lista de T10 |

Al terminar T10 se decide con la usuaria qué entra hoy. T11 y T12 no dependen de T10. Cada tarea lleva su prueba
primero, `vitest --dir src`, `tsc`, `eslint`, el e2e de `ficha-ejecucion` y `permisos`, y la revisión del tramo.

#### Cómo retomar (después de la limpieza del equipo)

1. `git -C .claude/worktrees/redisenio fetch origin` y `git checkout -b fix/proyectos-ficha-prototipo origin/main`.
2. Comprobar que siguen en su lugar: `.env.local`, `node_modules` del worktree (es un junction de Windows hacia la
   copia principal), el contenedor Docker de Supabase local (`127.0.0.1:54322`) y el servidor `next dev` en
   `localhost:3000`.
3. Nueva siembra local (solo con `.env.local`): `prisma migrate reset --force`, después
   `node.exe --env-file=.env.local node_modules/tsx/dist/cli.mjs prisma/seed.ts` y las siembras demo
   `seed-projects-demo --apply` y `seed-demo-flujo --apply` (detalle en `odd/tasks/proyectos-redisenio-ui.md`, L6).
4. Capturas: `node.exe .claude/qa/capturar-redisenio.mjs <carpeta> <pestaña>` (app) y el script del prototipo en
   `.claude/qa/`. Ambos scripts están en `.gitignore`: si la limpieza borra `.claude/qa/`, hay que recrearlos.

## 12. Corte del 2026-11-08 y plan del 2026-11-09

### Hecho en esta jornada

Rama `fix/proyectos-ficha-prototipo` (sin push): T10 (lista de diferencias con el prototipo,
`docs/ux-crm-2026-11/t10-diferencias-prototipo.md`), T14 (cabecera común C1–C12), T11 (Documentos sin los puntos
de API), T12 (seguimientos de T8/T9 y código muerto) y T15 (ajustes S de Resumen, Finanzas e Historial). Pruebas:
`vitest --dir src` 399 archivos / 4767 pruebas, `tsc` 0, ESLint 0, e2e `proyectos-v2` 31/31. Revisión nativa en
cinco tramos, los cinco aprobados y confirmados; 26 observaciones no bloqueantes (L13 de
`odd/tasks/proyectos-redisenio-ui.md`). Detalle de cada tarea en ese mismo archivo.

### Plan del 2026-11-09

Pedido de la usuaria: «crea el plan de trabajo para mañana. Tambien quiero como limpiar la base de codigo, para que
las futuras modificaciones sean mas faciles de trabajar». El plan de limpieza completo está en
`docs/plan-limpieza-codigo.md`; mañana entran sus fases seguras (L0 a L2).

| Paso | Qué | Estimación |
|---|---|---|
| 1 | Nueva siembra local y revisión visual de las cinco pestañas a 1440 y 390 px contra el prototipo | 30–45 min |
| 2 | Push de `fix/proyectos-ficha-prototipo` y PR (excepción de tamaño, revisado por tramos); merge con CI en verde | 30 min + CI |
| 3 | PR chico con las WARNING útiles de la revisión: dos pruebas de la cabecera que verifican antes de que lleguen los permisos, regla única para «Registrar gasto» como principal, el error de presupuesto que tapa el formulario con datos en caché, y el `isPending` del tope | 1 h |
| 4 | **Limpieza L0:** decidir los 8 PRs abiertos (#130, #131, #133, #136, #137, #138, #143, #144: integrar, actualizar o cerrar); `git worktree prune` y borrar worktrees y ramas ya integradas | 1–1,5 h |
| 5 | **Limpieza L1:** `knip` en modo reporte en CI y `noUnusedLocals`/`noUnusedParameters` en `tsconfig` | 1 h |
| 6 | **Limpieza L2:** borrar los 7 archivos muertos y los exports muertos con sus pruebas; knip pasa a bloquear | 1–2 h |
| 7 | Mensaje a la PO con las decisiones abiertas: validar un gasto que supera lo asignado, «Opciones avanzadas», «Objetivo 1.» frente a «OE1.», chip «Umbrales sin confirmar», y las dos tomadas sin ella («Gerencia o Administración», municipios con departamento); sumar el formato canónico de fecha que necesita L3 | 20 min |

Si sobra tiempo: limpieza L3 empezando por los formateadores de `components/proyectos`, con el formato acordado.
Queda para después: lo que necesita la API (R5, F4, F10, F11, D6, D7, H7, H9), el resto de T13 y los ajustes S/M de
T15.

#### Cómo retomar

1. Worktree `.claude/worktrees/redisenio`, rama `fix/proyectos-ficha-prototipo`; Docker Desktop y Supabase local
   arriba; `next dev` desde ese worktree (si el puerto 3000 lo ocupa otro `next dev`, detenerlo primero).
2. Nueva siembra solo con `.env.local`: `prisma migrate reset --force` (sin `--skip-seed`, esta versión no lo acepta),
   luego `node.exe --env-file=.env.local node_modules/tsx/dist/cli.mjs prisma/seed.ts` y las siembras demo
   `seed-projects-demo --apply` y `seed-demo-flujo --apply`.
3. El id de PRY-2026-001 cambia con cada siembra; el script de capturas lo recibe como cuarto argumento.

## 13. Corte del 2026-11-10: higiene de git (L0) cerrada

### Hecho en esta jornada

- **PRs abiertos: de 8 a 1.** Integrados por squash con CI en verde: #131 (X1/X2, mensajes y modo estricto en
  Excel), #133 (reportes: cierres del mismo día y datos por persona), #143 (N6, último contacto y «días sin
  gestión»), #144 (proyectos-v3 B0.3, selectores de solo lectura), #136 (print sheet compartido, PR-R2) y #130
  (registro de la ventana de producción del 2026-11-04, que era el único lugar donde estaba documentada). Se cerró
  #138 (volcado de planeación del 2026-11-05, superado por este documento, `docs/plan-limpieza-codigo.md` y
  `odd/tasks/proyectos-v3-contratos.md`). Sigue abierto #137 (email outbox): trae la migración
  `20261104181952_email_outbox`, así que entra recién con una ventana para producción.
- **Ramas locales: de 96 a 29.** Se borraron las que ya estaban en `main` por contenido, las de PR mergeado y las 20
  de PR cerrado sin merge (todas con copia en `origin`). Quedan las 11 ramas con worktree activo y 17 sin PR cuyo
  trabajo no está en `origin`: no se tocaron y se deciden en L6.
- **Worktrees: de 22 a 12.** Se borraron los de rama ya integrada (`redisenio`, `main-verde`, `v3`,
  `agent-a615c4a2`, `agent-af1087bc`, `t8d`, `agent-aeb0a5a4`, `cliente-contacto`, `t5b`) y `git worktree prune`
  sacó el `aj01-review`, que apuntaba a una ruta de Windows inexistente.
- **La raíz volvió a `main`**, que estaba en detached HEAD sobre `0726e5d`. Antes se borraron 56 copias sin trackear
  idénticas a `origin/main` en `docs/ux-crm-2026-11/`.

### Qué falta de L0

Nada. Sigue L1: `knip` en modo reporte y `noUnusedLocals`/`noUnusedParameters` en `tsconfig`.
