# Delta for project-schedule

> Adds the UI surface (workspace tab, grouped by Meta) for the already-specified `Meta`/`Actividad` mechanism (RF-02) and reuses the already-specified `Indicador` update mechanism for KPI 3 — the existing `openspec/specs/project-schedule/spec.md` covers `Meta pertenece a un Proyecto`, `Actividad indica su Meta asociada`, línea base vs. ejecución, avance técnico y semaforización; this delta only adds the requirement that a "Metas" tab exists, grouped by meta, with activities and indicators visible together. No requirement below changes validation, security, data shape, or the técnico semáforo already specified.

## ADDED Requirements

### Requirement: Pestaña Metas en el workspace del proyecto — RF-02, KPI 3

El workspace del proyecto MUST incluir una pestaña "Metas" que agrupe por `Meta`: cada tarjeta MUST mostrar sus actividades vinculadas (`Actividad.meta_id`) con su porcentaje de avance, y sus indicadores (`Indicador.meta_id`) con su valor actual, meta y unidad. La pestaña MUST reutilizar `GET .../goals`, `GET .../activities` y `GET .../indicators` sin duplicar su lógica de agregación.

- **Pestaña Metas agrupa actividades e indicadores por meta** — `metas-tab.test.tsx`
- **Una meta sin actividades vinculadas se muestra con un estado vacío explícito por tarjeta, no como un error** — `metas-tab.test.tsx`
- **Una meta sin indicadores vinculados se muestra con un estado vacío explícito por tarjeta, no como un error** — `metas-tab.test.tsx`

#### Scenario: Listar metas con sus actividades e indicadores

- GIVEN un proyecto con metas, cada una con actividades vinculadas por `meta_id` y algunas con indicadores vinculados por `meta_id`
- WHEN se abre la pestaña Metas
- THEN se listan todas las metas, cada una con sus actividades (código, % de avance) y sus indicadores (valor actual, meta, unidad)

#### Scenario: Meta sin actividades vinculadas

- GIVEN una meta del proyecto sin ninguna actividad con `meta_id` igual al suyo
- WHEN se abre la pestaña Metas
- THEN la tarjeta de esa meta muestra su estado vacío de actividades, sin actividades de otras metas mezcladas

### Requirement: Indicador de una meta se colorea por umbral de cumplimiento parametrizado — KPI 3

`GET .../indicators` y `GET/PATCH .../indicators/[indicatorId]` MUST calcular, server-side, `color_indicador` a partir de la razón `valor_actual / meta_valor` (0 cuando `valor_actual` es `null` o `meta_valor` es 0) contra la banda `indicador` de `UmbralesSemaforo` (`lib/semaforo.ts`), resuelta vía `resolverUmbrales` (override de `Proyecto.umbrales_override` sobre el setting de organización `Setting["semaforo_umbrales"]`, con default org verde ≥90%/amarillo ≥60%) — exactamente el mismo mecanismo que ya resuelve `color_financiero` en `budget/route.ts`. La pestaña Metas MUST renderizar `color_indicador` verbatim y NUNCA MUST recalcular el umbral en el cliente.

- **Indicador con cumplimiento ≥ `indicador.verde` se colorea verde** — `semaforo.test.ts`, `indicators/route.test.ts`
- **Indicador con cumplimiento entre `indicador.amarillo` (inclusive) y `indicador.verde` (exclusive) se colorea amarillo** — `semaforo.test.ts`, `indicators/route.test.ts`
- **Indicador con cumplimiento < `indicador.amarillo` o sin `valor_actual` registrado se colorea rojo** — `semaforo.test.ts`, `indicators/route.test.ts`
- **Un `Setting["semaforo_umbrales"]` guardado antes de que existiera la banda `indicador` se normaliza al default de organización, nunca rompe el cálculo** — `settings.test.ts`
- **El override de proyecto (`umbrales_override.indicador`) tiene prioridad sobre el default de organización, igual que `tecnico`/`financiero`** — `indicators/route.test.ts`

#### Scenario: Indicador sin medir se muestra en rojo, no como error

- GIVEN un indicador de una meta con `valor_actual` en `null`
- WHEN se abre la pestaña Metas
- THEN el indicador se muestra con la leyenda "Sin medir" y su barra en rojo (`color_indicador: "rojo"`), nunca oculto ni como un fallo de carga

#### Scenario: Umbral de indicador guardado antes de este change

- GIVEN un `Setting["semaforo_umbrales"]` persistido antes de que existiera la banda `indicador` (sin esa clave en el JSON)
- WHEN cualquier ruta resuelve los umbrales para colorear un indicador
- THEN el sistema usa el default de organización para `indicador` (verde ≥90%, amarillo ≥60%) sin lanzar error y sin requerir migración

### Requirement: Editar avance de un indicador desde la pestaña Metas — RF-02, KPI 3

El sistema MUST permitir actualizar `valor_actual` de un `Indicador` desde su fila en la pestaña Metas, reutilizando `PATCH .../indicators/[indicatorId]` y el diálogo de edición ya existente (`IndicadorFormDialog`) sin duplicar su validación.

- **"Editar avance" en un indicador de la pestaña Metas actualiza su `valor_actual` y la barra de progreso refleja el nuevo valor** — `metas-tab.test.tsx`

#### Scenario: Editar el avance de un indicador desde su tarjeta de meta

- GIVEN un usuario con permisos de escritura sobre el proyecto viendo la pestaña Metas
- WHEN abre "Editar avance" en un indicador y guarda un nuevo `valor_actual`
- THEN el indicador se actualiza y su barra de progreso y color reflejan el nuevo porcentaje de cumplimiento
