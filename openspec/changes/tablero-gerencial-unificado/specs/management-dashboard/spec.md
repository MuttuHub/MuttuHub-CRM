# Delta for management-dashboard

> First formal spec for the "Tablero de Control Gerencial" view. The underlying endpoint (`GET /api/v1/dashboard/projects`), its permission gate (`canViewManagementDashboard`), and its 6 base KPIs were already built and tested under `tablero-seguimiento-social` (archived) without a dedicated capability spec. This delta documents both the requirements ALREADY in production (as ADDED, since no prior spec file existed for them) and the new requirements F1.6 introduces (route unification, per-project/per-territory breakdowns, new filters, multi-axis radar, double-count warning).

## ADDED Requirements

### Requirement: Endpoint agregado único para el tablero gerencial

El sistema MUST exponer `GET /api/v1/dashboard/projects` como el único endpoint que resuelve los 6 KPIs del tablero gerencial (avance técnico, avance financiero/curva S, cumplimiento de indicadores, cumplimiento de cronograma, productos entregados/programados, beneficiarios atendidos/meta) en un solo round-trip HTTP. El acceso SIN `proyecto_id` MUST estar gateado por `canViewManagementDashboard` (rol gerencial — `ADMINISTRADOR`/`GERENCIA`/`COORDINADOR` — o `COLABORADOR` con `puede_ver_tablero_gerencial`); un usuario sin ese permiso MUST recibir 403 con un mensaje explícito, nunca un error genérico.

- **Un usuario con rol gerencial ve el tablero completo** — `dashboard/projects/route.test.ts`
- **Un `COLABORADOR` con `puede_ver_tablero_gerencial=true` ve el tablero completo** — `dashboard/projects/route.test.ts`
- **Un `COLABORADOR` sin el flag recibe 403 con mensaje de permiso** — `dashboard/projects/route.test.ts`, `cara-management.test.tsx`

#### Scenario: Usuario sin permiso ve el mensaje del servidor, no un error genérico

- GIVEN un `COLABORADOR` sin `puede_ver_tablero_gerencial`
- WHEN visita el tablero gerencial (vía `/`, la pestaña "Tablero gerencial", o `/tablero-gerencial`)
- THEN ve el mensaje de permiso devuelto por el servidor, renderizado dentro del shell de la app, nunca una pantalla de error genérica ni un fallback silencioso a otra pestaña

### Requirement: Una sola ruta para el tablero gerencial

El sistema MUST exponer el tablero gerencial en una única ruta funcional: la 5.ª pestaña ("Tablero gerencial") de `/`. `/tablero-gerencial` MUST redirigir a `/?cara=management` en vez de renderizar una implementación propia.

- **`/tablero-gerencial` redirige a `/?cara=management`** — test de la ruta (`page.test.tsx` o equivalente de este Next.js)
- **`/?cara=management` preselecciona la pestaña "Tablero gerencial" en `DashboardTabs`** — `dashboard-page.test.tsx`
- **El ítem de navegación "Tablero Gerencial" apunta a `/?cara=management` y se resalta solo cuando esa pestaña está activa** — `sidebar.test.tsx`/`nav.test.ts`

#### Scenario: Visitar la ruta legada redirige a la ruta unificada

- GIVEN un usuario con un bookmark a `/tablero-gerencial`
- WHEN visita esa URL
- THEN es redirigido a `/?cara=management` y ve el mismo contenido que tendría clickeando la pestaña "Tablero gerencial" desde `/`

### Requirement: Radar de cumplimiento con múltiples ejes

El tablero gerencial MUST mostrar el radar de "Cumplimiento de indicadores" con 5 ejes (avance técnico, avance financiero, cumplimiento de indicadores, cumplimiento de cronograma, entregables), reutilizando la primitiva `Radar` ya existente (`radar.tsx`) sin cambiar su forma — solo el número de ejes que `cara-management.tsx` le pasa.

- **El radar renderiza exactamente 5 ejes con sus valores correspondientes** — `cara-management.test.tsx`

#### Scenario: Radar multi-eje con los 5 KPIs no-beneficiarios

- GIVEN los 6 KPIs agregados del endpoint
- WHEN se renderiza el tablero gerencial
- THEN el radar muestra 5 puntos (avance técnico, avance financiero, cumplimiento de indicadores, cumplimiento de cronograma, entregables), excluyendo beneficiarios

### Requirement: Desglose por proyecto para cronograma y entregables

`GET /api/v1/dashboard/projects` MUST devolver un campo aditivo `por_proyecto: { proyecto_id, nombre, cumplimiento_cronograma, productos_entregados, productos_programados }[]`, calculado con la misma subconsulta de proyectos filtrados y las mismas CTEs (`tecnico`, `entregables`) que ya alimentan el agregado org-wide, agrupado por `proyecto_id` en vez de colapsado a una fila. El tablero gerencial MUST mostrar una barra de cumplimiento de cronograma por cada proyecto de `por_proyecto`, y un par de barras agrupadas (planificado vs. entregado) por cada proyecto para entregables.

- **`por_proyecto` incluye una fila por cada proyecto dentro del alcance filtrado** — `dashboard/projects/route.test.ts`
- **El tablero gerencial renderiza una barra de cronograma por proyecto** — `cara-management.test.tsx`
- **El tablero gerencial renderiza barras agrupadas planificado/entregado por proyecto** — `cara-management.test.tsx`

#### Scenario: Desglose por proyecto respeta los filtros aplicados

- GIVEN un filtro de rango de fecha y/o Línea/Territorio aplicado
- WHEN se solicita el tablero gerencial
- THEN `por_proyecto` solo incluye los proyectos que cumplen esos mismos filtros, usando la misma subconsulta que el agregado org-wide

### Requirement: Semaforización territorial

`GET /api/v1/dashboard/projects` MUST devolver un campo aditivo `por_territorio: { territorio, proyectos_count, color_tecnico, color_financiero }[]`, agrupado por `Proyecto.territorio`, usando los umbrales de organización (sin concepto de override por territorio). El tablero gerencial MUST mostrar una lista de territorios con su conteo de proyectos y sus dos semáforos (técnico y financiero).

- **`por_territorio` agrupa correctamente por el valor exacto de `Proyecto.territorio`** — `dashboard/projects/route.test.ts`
- **La sección "Semaforización territorial" muestra una fila por territorio con sus dos semáforos** — `cara-management.test.tsx`

#### Scenario: Territorio con proyectos en distintos estados de semáforo

- GIVEN dos proyectos en el mismo territorio, uno en verde técnico y otro en rojo técnico
- WHEN se calcula `por_territorio` para ese territorio
- THEN el color técnico resultante refleja el agregado del territorio (misma fórmula ya usada por el agregado org-wide, aplicada al subconjunto de ese territorio), no el color de un solo proyecto

### Requirement: Filtros Línea estratégica y Territorio

El tablero gerencial MUST permitir filtrar por `linea_estrategica` (enum `LineaEstrategica`) y por `territorio` (texto libre existente en `Proyecto.territorio`), además del filtro de rango de fecha ya existente. Estos parámetros MUST aplicarse únicamente al endpoint `GET /api/v1/dashboard/projects` (agregado y sus desgloses `por_proyecto`/`por_territorio`), sin extender el tipo `DashboardFilters` compartido por las otras 4 caras del dashboard.

- **`?linea_estrategica=` filtra el agregado y los desgloses a esa línea** — `dashboard/projects/route.test.ts`
- **`?territorio=` filtra el agregado y los desgloses a ese territorio** — `dashboard/projects/route.test.ts`
- **Los chips de Línea/Territorio en la UI disparan un refetch con los query params correctos** — `cara-management.test.tsx`
- **Las otras 4 caras del dashboard (pipeline, tareas, actividad de clientes, mi resumen) no reciben ni exponen estos filtros** — `dashboard-page.test.tsx`

#### Scenario: Combinar Línea, Territorio y rango de fecha

- GIVEN una Línea, un Territorio y un rango de fecha seleccionados
- WHEN se solicita el tablero gerencial
- THEN el agregado y los desgloses reflejan la intersección de los tres filtros, igual que hoy combina rango de fecha con `responsable_id`/`tipo_cliente`

### Requirement: Advertencia de doble conteo de beneficiarios

Cuando `indicadores_beneficiarios_count > 1` (más de un `Indicador` marcado `cuenta_beneficiarios` dentro del alcance filtrado), el tablero gerencial MUST mostrar una advertencia visible de posible doble conteo junto al KPI de beneficiarios, sin alterar el cálculo agregado ya existente.

- **La advertencia se muestra cuando `indicadores_beneficiarios_count > 1`** — `cara-management.test.tsx`
- **La advertencia NO se muestra cuando `indicadores_beneficiarios_count <= 1`** — `cara-management.test.tsx`

#### Scenario: Más de un indicador de beneficiarios en el alcance filtrado

- GIVEN `indicadores_beneficiarios_count = 2` en la respuesta del endpoint
- WHEN se renderiza el KPI de beneficiarios
- THEN se muestra una advertencia visible indicando el riesgo de doble conteo, junto al valor ya calculado (sin ocultarlo ni bloquearlo)
