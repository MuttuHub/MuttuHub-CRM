# Plan de trabajo restante

Estado de partida: **2026-10-19**, `main` en `add9df0`, v2 del módulo de Proyectos en producción con la matriz de
permisos vigente, 4136 pruebas unitarias y 29 e2e en verde.

IDs: **A** operación, **B** producto, **V** v7 CRM, **U** auditoría UX (sus hallazgos conservan `C1–C12`), **E** plataforma. **Estado de ejecución (2026-10-19):** A1 (etiqueta `v2.0.0`), A5 (credenciales) y B1/D1 (mensaje de acceso) están
**hechos**; U0 es el siguiente paso. Detalle en `odd/tasks/fase-0-ejecucion.md`.

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
| B2 | Adaptador de **presupuesto** de la PO (`rubro | valor`) | S | Acceso a `presupuesto.xlsx` real | Importar un archivo de la PO crea las líneas y muestra la vista previa con errores por fila |
| B3 | Adaptador de **estructura** de la PO (objetivos, actividades, entregables con cantidad/unidad/medio) | M | B2, decisión **D-A** | Importar `proyecto.xlsx` crea O/A/E con códigos generados y la vista previa lista los errores |
| B4 | Plantillas actualizadas para la PO (con las columnas nuevas) | S | B3 | Archivos entregados y probados por la PO |
| B5 | Importar **solo estructura** sin presupuesto | S–M | Decisión **D-A** | Un proyecto con presupuesto ya cargado puede importar estructura sin tocarlo |
| B6 | **Rubros editables por proyecto** (deshabilitar y agregar) | M–L | Decisión **D-B**, migración | El presupuesto de un proyecto oculta rubros deshabilitados y acepta uno propio, sin afectar a otros proyectos |
| B7 | **Cerrar / suspender / cancelar** proyecto | M | Decisión **D-C** | La ficha cambia de estado con motivo, auditoría y reglas de quién puede hacerlo |
| B8 | Importar **gastos** desde Excel | M | B2 como referencia | Un archivo de gastos entra con validación por fila y queda en `REGISTRADO` |

> B1 es el único de este frente que no depende de una decisión: puede entrar en la primera semana.

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

## 4. Frente D — Auditoría UX/UI (C1–C12)

Los 12 hallazgos son del 2026-09-23 y **nadie verificó** cuáles siguen vivos tras el rediseño de la ficha.

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| U0 | **Re-auditoría** de los 12 hallazgos con el código actual (2–3 h) | S | — | Cada hallazgo marcado «vigente» o «resuelto», con captura o línea de código |
| U1 | Mobile crítico: header (C1), tarjetas de clientes (C2), Client Sheet (C3), Gantt (C4), columnas de admin (C12) | M | U0 | Ninguna de esas pantallas se sale ni se corta a 390 px |
| U2 | Accesibilidad y consistencia: leyenda del Gantt (C10), touch targets (C11), eje Y de la Curva S (C9) | S–M | U0 | Contraste/leyenda verificados y objetivos táctiles ≥ 44 px |
| U3 | Bugs de código: hydration del login (C6), labels de auditoría (C7), categoría duplicada (C8) | S | U0 | Consola sin errores de hydration ni labels sin mapear |
| U4 | Rol truncado en Administración (C5) | S | U0 | El rol se lee completo o con tooltip accesible |

---

## 5. Frente E — Plataforma y calidad

| ID | Tarea | Tamaño | Depende de | Terminado cuando |
|---|---|---|---|---|
| E1 | Conectar Playwright a CI (build + base sembrada) | M | Infra de CI | La suite de 29 pruebas corre en cada PR |
| E2 | Umbral de cobertura realista y creciente | L | — | `test:coverage` publica el número y el umbral no se puede bajar |
| E3 | `npm run lint` reproducible en local | S | — | `npm run lint` pasa en un clon limpio |
| E4 | Migración a Railway — **Opción A** (app en Railway, Supabase se queda) | S–M | Acceso a Railway | Producción sirviendo desde Railway con el mismo dominio |
| E5 | Migración a Railway — **Opción B** (stack completo, Auth propio) | L | E4, decisión **D-F** | Paridad del humo completa y una semana de estabilidad |
| E6 | Limpieza de artefactos del repositorio (zip del prototipo, PDFs y HTML duplicados) | S | Decisión del usuario | Árbol sin archivos muertos y sin enlaces rotos |

---

## 6. Secuencia recomendada

| Fase | Contenido | Por qué |
|---|---|---|
| **Fase 0** (esta semana) | A1, A3, A5, B1, V0, U0 | Cierra el lanzamiento y evita construir sobre supuestos |
| **Fase 1** (siguiente) | A2, A4, U1, U3, E3 | Riesgo operativo y mobile, que es donde más se usa |
| **Fase 2** | B2 → B3 → B4 → B5 | Es el flujo que pidió la PO y se puede entregar por partes |
| **Fase 3** | B6, B7, B8 y V1–V3 según decisiones | Cada uno con su documento de feature y su migración |
| **Fase 4** | V4–V9, D2, D4, E1, E2, E4 | Mejora continua y plataforma |

Cada tarea que toque esquema, permisos o dinero entra con documento en `odd/tasks/`, pruebas primero y PR propio.

---

## 7. Decisiones abiertas

| ID | Decisión | Quién | Bloquea |
|---|---|---|---|
| **D-A** | ¿La importación de estructura deja de exigir el presupuesto completo? ¿Modo «solo estructura» que conserve el existente? | PO | B3, B5 |
| **D-B** | ¿El rubro personalizado vive solo en su proyecto o se suma al catálogo global? ¿Cómo se agrupa en reportes? ¿Qué pasa al deshabilitar un rubro con gastos? | PO | B6 |
| **D-C** | Al cerrar o suspender: ¿se congela todo, se permite registrar gastos, quién puede hacerlo? | PO | B7 |
| **D-D** | ¿Convocatorias, propuesta económica y oportunidades globales entran en el alcance del negocio? | Negocio | V1, V4, V10 |
| **D-E** | Acceso al DNS de `muttu.co` para verificar Resend | Negocio / TI | A2 |
| **D-F** | ¿Railway reemplaza a Vercel solo (Opción A) o también a Supabase (Opción B)? | Usuario | E4, E5 |

---

## 8. Riesgos

- **Datos:** cualquier tarea con migración (B6, B7, V3) sigue el procedimiento del runbook: respaldo verificado,
  `migrate deploy` antes del código y `migrate diff` vacío.
- **Autorización:** B7 y V1 tocan quién puede hacer qué; se tratan como cambio de seguridad con su matriz y sus pruebas.
- **Alcance de v7:** el prototipo no es requisito. Antes de construir V1–V10 hay que confirmar **D-D**, o se repetirá el
  patrón de trabajo sin validación.
- **Deuda de pruebas:** sin E1, la suite e2e solo corre a mano; cualquier regresión visual o de permisos depende de que
  alguien la ejecute.

---

## 9. Definición de terminado

Una tarea se considera terminada cuando: el comportamiento está implementado, hay pruebas que lo fijan (unitarias y,
si es de UI, componente o e2e), `tsc` y lint están limpios, la documentación afectada se actualizó y el cambio está en
`main` con su PR revisado. Las tareas con migración añaden el respaldo verificado y la comprobación de conteos.
