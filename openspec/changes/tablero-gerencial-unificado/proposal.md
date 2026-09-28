# Proposal: tablero-gerencial-unificado — Tablero gerencial con visualizaciones v6; unificar `/tablero-gerencial` y `/`

## Intent

F1.6 del plan de acción de la Auditoría v6 (`Auditoria v6.dc.html:255`): "Tablero gerencial con visualizaciones sugeridas — Curva S, radar, barras de entregables; una sola ruta; advertencia de doble conteo." Área `UI`, KPI 1–6, tamaño `M`.

La Auditoría ya documenta la brecha exacta (`Auditoria v6.dc.html:216`): **"KPIs agregados; dos rutas para lo mismo"** — hoy existen DOS implementaciones distintas del tablero gerencial:

1. `/tablero-gerencial` (`src/app/(app)/tablero-gerencial/page.tsx` → `TableroGerencialClient`): renderiza `<KpiCards />` + `<CurveSChartContainer />` (org-wide, sin `projectId`). Es la implementación MÁS VIEJA — muestra 6 tarjetas KPI en texto/porcentaje y la curva S, pero SIN semaforización visual por color en el gauge principal, sin permisos-aware error handling (un error 403 del endpoint se muestra como "No se pudo cargar el tablero gerencial", igual que cualquier otro fallo de red), y sin tacómetro/radar/semaforización territorial.
2. La 5.ª "cara" de `/` (Inicio), `CaraGerencial` (`src/components/dashboard/cara-management.tsx`), montada dentro de `DashboardTabs`: tacómetro real (SVG), curva S, radar (de UN solo eje — ver Gap), cumplimiento de cronograma y entregables como barra única agregada, beneficiarios, Y manejo explícito de 403 con el mensaje de permiso del servidor. Esta es la implementación MÁS COMPLETA y la que ya sigue el patrón real de v6 (tacómetro, curva S, radar — comentario propio del archivo lo declara "quinta cara").

Ambas rutas consumen el MISMO endpoZnto (`GET /api/v1/dashboard/projects`, gateado por `canViewManagementDashboard`), pero `/tablero-gerencial` NO expone el mensaje de permiso del 403 y su nav item (`src/lib/nav.ts`) es visible a TODOS los roles sin filtrar por `puede_ver_tablero_gerencial` — cualquier COLABORADOR sin el flag ve el link, entra, y recibe un error genérico en vez de un mensaje de permiso claro.

v6 (`README.md:160-161`, `Muttu Hub v6.dc.html:311-326`) pide explícitamente: **"unify `/tablero-gerencial` and `/`"**, con 6 KPIs (avance técnico, avance financiero/curva S, cumplimiento de indicadores — radar multi-eje, cumplimiento de cronograma — barras por proyecto, entregables — barras agrupadas plan vs. entregado por proyecto, beneficiarios), filtros por Línea · Territorio · Periodo, y una tabla de semaforización territorial — ninguno de los dos existentes hoy tiene los filtros ni la semaforización territorial. v6 también define que el rol **Visualizador** (`puede_ver_tablero_gerencial`) ATERRIZA directamente en el tablero gerencial (`LANDING.Visualizador = 'tablero'`, `Muttu Hub v6.dc.html:1034`) y NO tiene el ítem "Inicio" en su navegación (`ACCESS.Visualizador` no incluye `'inicio'`, línea 1033) — solo ve Proyectos, Tablero (gerencial), Reportes.

## Scope

**In:**
- Eliminar la ruta standalone `/tablero-gerencial` (`page.tsx` + `TableroGerencialClient`) como una segunda implementación; su contenido se reemplaza por un redirect/alias hacia `/` con la 5.ª cara ("Tablero gerencial") preseleccionada.
- Enriquecer `CaraGerencial` (la implementación que sobrevive) con las piezas que v6 pide y hoy faltan:
  - Radar multi-eje (5 ejes: avance técnico, avance financiero, cumplimiento de indicadores, cumplimiento de cronograma, entregables) — la primitiva `Radar` YA soporta N ejes (comentario propio de `radar.tsx` lo anticipa); solo cambia qué le pasa `CaraGerencial`.
  - Cumplimiento de cronograma como barras horizontales POR PROYECTO (no una única barra agregada).
  - Entregables como barras agrupadas (planificado vs. entregado) POR PROYECTO (no una única barra agregada).
  - Semaforización territorial: lista de territorios con conteo de proyectos y semáforo técnico/financiero por territorio.
  - Filtros nuevos: Línea (estratégica) y Territorio, además del rango de fecha ya existente (Periodo). Chips visuales igual que v6.
  - Advertencia de doble conteo de beneficiarios (Auditoría, KPI 6: "Riesgo de doble conteo con más de un indicador marcado") cuando `indicadores_beneficiarios_count > 1`.
- Endpoint `GET /api/v1/dashboard/projects`: nuevos parámetros opcionales `linea_estrategica`/`territorio` (filtran igual que `responsable_id`/`tipo_cliente` ya lo hacen) y nuevos campos de respuesta aditivos: desglose por proyecto (`cumplimiento_cronograma`, `productos_entregados`/`productos_programados`) y desglose por territorio (`territorio`, `proyectos_count`, `color_tecnico`, `color_financiero`).
- Nav (`src/lib/nav.ts`): quitar el ítem duplicado "Tablero Gerencial" que apuntaba a `/tablero-gerencial`; el link de "Dirección" pasa a apuntar a `/?cara=management` (o equivalente) y se etiqueta igual ("Tablero Gerencial"). El ítem sigue visible para todos (ver Open Decisions — ocultarlo por `puede_ver_tablero_gerencial` es una mejora orthogonal que design.md registra como decisión abierta con default).
- `useDashboardManagement`: acepta `linea_estrategica`/`territorio` opcionales, mismo patrón que `responsable_id`/`tipo_cliente`.

**Out:**
- Cambiar el landing role-based de Visualizador (aterrizar directo en el tablero en vez de en `/`) — v6 lo pide (`LANDING.Visualizador`) pero es un cambio de comportamiento de sesión/redirect post-login que no está en el alcance `M` de F1.6 según la Auditoría (fila F1.6 no lo menciona; es una decisión de producto separada). Se documenta como decisión abierta con default "no cambiar" en design.md.
- Ocultar el ítem "Inicio" de la navegación de un Visualizador (`ACCESS.Visualizador` de v6 no lo incluye) — mismo motivo; fuera de alcance de F1.6, es un cambio de navegación transversal a todos los roles.
- Cualquier cambio a las otras 4 caras del dashboard (`pipeline`, `tasks`, `clients-activity`, `my-summary`) o a sus exports Excel — F1.6 es exclusivamente sobre la 5.ª cara y la ruta duplicada.
- Migraciones de schema: `Proyecto.territorio` y `Proyecto.linea_estrategica` YA EXISTEN (`prisma/schema.prisma:560-561`); los nuevos filtros y desgloses son consultas aditivas sobre columnas existentes, cero cambio de schema.
- Rediseñar el gauge/tacómetro o la curva S (ya cumplen el mock).

## Capabilities

### Modified
- **`management-dashboard`** (nueva capability, no existe openspec previo para la quinta cara — se crea el spec base con los requisitos ya vigentes de `tablero-seguimiento-social`/`gestion-proyectos-workspace` que aplican a esta vista, más los requisitos que F1.6 añade: radar multi-eje, desglose por proyecto, semaforización territorial, filtros Línea/Territorio, ruta única, advertencia de doble conteo).

### New
Ninguna (la capability `management-dashboard` se crea porque no existía spec dedicado a la quinta cara; no es una capability de negocio nueva, es la primera vez que se documenta formalmente).

## Approach

Ver `design.md` para la decisión de ruteo completa, la tabla "Ya existe vs. brecha v6" por visualización, y el detalle de los nuevos campos del endpoint.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `src/app/(app)/tablero-gerencial/page.tsx` | Removed | Ruta eliminada; reemplazada por redirect a `/` |
| `src/components/dashboard/tablero-gerencial-client.tsx` | Removed | Componente eliminado (solo usado por la ruta removida) |
| `src/components/dashboard/tablero-gerencial-client.test.tsx` | Removed | Test del componente eliminado |
| `src/components/dashboard/cara-management.tsx` | Modified | Radar multi-eje, barras por proyecto (cronograma/entregables), semaforización territorial, filtros Línea/Territorio, advertencia doble conteo |
| `src/components/dashboard/cara-management.test.tsx` | Modified | Casos nuevos: multi-eje, desglose por proyecto, territorial, filtros, advertencia |
| `src/components/dashboard/dashboard-page.tsx` | Modified | Filtros Línea/Territorio pasados a `CaraGerencial` cuando `cara === "management"`; lee `?cara=` inicial de la URL |
| `src/components/dashboard/dashboard-page.test.tsx` | Modified | Caso: `?cara=management` preselecciona la pestaña |
| `src/app/api/v1/dashboard/projects/route.ts` | Modified | Acepta `linea_estrategica`/`territorio`; responde `por_proyecto[]` y `por_territorio[]` aditivos |
| `src/app/api/v1/dashboard/projects/route.test.ts` | Modified | Casos nuevos de filtro y desglose |
| `src/hooks/dashboard.ts` | Modified | `useDashboardManagement` acepta `linea_estrategica`/`territorio`; `ProjectDashboard` (en `hooks/projects.ts`) gana `por_proyecto`/`por_territorio` |
| `src/hooks/projects.ts` | Modified | `ProjectDashboard` type: campos aditivos `por_proyecto`, `por_territorio` |
| `src/lib/nav.ts` | Modified | Quitar el ítem `/tablero-gerencial`; el link "Tablero Gerencial" apunta a `/?cara=management` |
| `src/lib/nav.test.ts` (si existe) | Modified | Reflejar el nuevo href |
| `src/lib/openapi/paths/dashboard-admin.ts` | Modified | Documentar los nuevos parámetros/campos del endpoint |
| `src/app/print/dashboard/management/page.tsx` | Modified | Refleja las nuevas visualizaciones (radar multi-eje, barras por proyecto, territorial) en el PDF |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Un usuario con `/tablero-gerencial` guardado en favoritos pierde el acceso directo | Alta (es el comportamiento buscado por v6) | Redirect server-side 308 a `/?cara=management` conserva el bookmark funcional |
| El desglose por proyecto (`por_proyecto[]`) multiplica el costo de la consulta agregada si se implementa como N consultas | Media | Una sola consulta adicional con `GROUP BY proyecto_id`/`GROUP BY territorio` sobre las mismas 4 CTEs ya existentes (mismo patrón que el comentario del archivo ya prevé para "Fase 4c" del desglose) |
| Doble conteo de beneficiarios si un proyecto marca más de un indicador con `cuenta_beneficiarios` | Ya documentado por la Auditoría (KPI 6) | Advertencia explícita en UI cuando `indicadores_beneficiarios_count > 1`, sin cambiar el cálculo agregado (fuera de alcance de F1.6 corregir el modelo de conteo) |
| Cambiar el nav item rompe `sidebar.test.tsx`/otros tests que asumen `/tablero-gerencial` como href | Media | Actualizar los tests en el mismo PR; búsqueda exhaustiva de `"/tablero-gerencial"` antes de remover |

## Rollback Plan

Revertir el redirect y restaurar `page.tsx`/`tablero-gerencial-client.tsx` desde git; revertir `nav.ts` al href original; revertir los campos aditivos del endpoint (nadie más los consume) y las piezas nuevas de `cara-management.tsx` (radar multi-eje vuelve a un eje, barras únicas vuelven a agregado, se quita la sección territorial y los filtros nuevos). Cero migración que revertir.

## Dependencies

- `tablero-seguimiento-social` (archivado) — endpoint `GET /api/v1/dashboard/projects` y `canViewManagementDashboard` ya construidos; este change los extiende, no los reemplaza.
- `gestion-proyectos-workspace` — `KpiCards`/`CurveSChartContainer` (usadas por la pestaña Resumen de un proyecto individual, `projectId` presente) NO se tocan; solo el camino org-wide (`projectId` ausente) que `/tablero-gerencial` y la 5.ª cara comparten.
- F1.4 (`proyecto-metas-tab`) y F1.5 (umbrales) — no bloquean; no comparten archivos tocados por este change salvo `hooks/projects.ts` (aditivo, sin conflicto de líneas si F1.4 ya está mergeado).

## Success Criteria

- [ ] Una sola ruta funcional para el tablero gerencial: `/tablero-gerencial` redirige a `/` con la cara "Tablero gerencial" activa; el componente `TableroGerencialClient` deja de existir
- [ ] El radar de "Cumplimiento de indicadores" muestra 5 ejes (avance técnico, avance financiero, indicadores, cronograma, entregables), no 1
- [ ] "Cumplimiento del cronograma" y "Entregados/programados" muestran una barra (u par de barras) por proyecto, no una única barra agregada
- [ ] Existe una sección "Semaforización territorial" con conteo de proyectos y semáforo técnico/financiero por territorio
- [ ] Los filtros Línea y Territorio existen, filtran el endpoint agregado y los desgloses, y se combinan con el rango de fecha ya existente
- [ ] Un usuario sin `puede_ver_tablero_gerencial` (y sin rol gerencial) que visita `/tablero-gerencial` o `/?cara=management` ve el mensaje de permiso del servidor, nunca un error genérico
- [ ] Cuando `indicadores_beneficiarios_count > 1` se muestra una advertencia visible de posible doble conteo
- [ ] Cero cambios en `prisma/schema.prisma` ni `prisma/migrations/`
- [ ] Tests nuevos en RED antes del código, GREEN después; suite completa sigue en verde
