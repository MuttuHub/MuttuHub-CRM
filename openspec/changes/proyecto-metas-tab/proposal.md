# Proposal: proyecto-metas-tab — Pestaña Metas (RF-02, KPI 3)

## Intent

F1.4 del plan de acción de la Auditoría v6. `Meta`, `Actividad` (RF-02, `meta_id` NOT NULL con FK compuesta) e `Indicador` (`meta_id` opcional, `valor_actual`/`meta_valor`/`unidad`) ya existen, ya están probados, y ya tienen CRUD completo: `GET .../goals`, `GET .../activities`, `GET/POST/PATCH/DELETE .../indicators` (`useGoals`/`useActivities`/`useIndicators`/`useCreateIndicator`/`useUpdateIndicator`/`useDeleteIndicator` en `src/hooks/projects.ts`). La pestaña "Indicadores" (`tabs/indicadores-tab.tsx`) ya está construida, probada y montada en `project-workspace.tsx` — es un CRUD plano de indicadores con selector de meta opcional, distinto de lo que pide v6.

La Auditoría confirma la brecha: fila F1.4 del plan de acción, área `UI` (sin `DB`/`API`), tamaño `S`, "Metas con indicadores y actividades vinculadas por ID". `README.md` (línea 135) describe exactamente la vista que falta: "one card per meta with its linked activities (IDs) and indicators (bar colored ≥90 / ≥60 / <60, means of verification)". Esa vista agrupada-por-meta es el destino natural de KPI 3 ("Cumplimiento de Indicadores") en el Resumen del proyecto (`resKpis` del mock v6 enlaza esa tarjeta al tab `'metas'`, no a `'indicadores'`) y es la lectura objetiva que RF-02 pide ("cada actividad indica su meta para verificar el cumplimiento de forma objetiva").

## Scope

**In:**
- Pestaña "Metas" (2.ª, justo después de Resumen, como en v6) en `project-workspace.tsx`: una tarjeta por `Meta` con (a) chips de sus actividades vinculadas — código `A{n}` derivado client-side (sin persistir), numerado **secuencialmente en todo el proyecto** (no reiniciado por meta), en el mismo orden que `useActivities` ya devuelve (`fecha_planificada asc`, el orden que Cronograma/Gantt ya consumen) — con % de avance y color de semáforo, reutilizando la misma lógica de color que `cronograma-tab.tsx`/`gantt-tab.tsx` ya aplican por actividad — y (b) sus indicadores, cada uno con nombre, valor actual / meta / unidad, y una barra de progreso coloreada por el umbral **`indicador`** de `UmbralesSemaforo` (`src/lib/semaforo.ts`, default org verde ≥90 %/amarillo ≥60 %, resuelto vía `Setting["semaforo_umbrales"]` + `Proyecto.umbrales_override`, igual que técnico/financiero — nunca hardcodeado en el componente).
- "Editar avance" por indicador: reutiliza `IndicadorFormDialog` — ya construido y probado en `indicadores-tab.tsx` — exportándolo para abrirlo en modo edición desde la fila del indicador dentro de su tarjeta de Meta. Cero diálogo nuevo, cero mutación nueva.
- Estados vacíos explícitos: una Meta sin actividades vinculadas, una Meta sin indicadores, o el proyecto sin metas — nunca un error ni una fila en blanco.

**Out:**
- Cualquier cambio al schema, API o hooks de `Meta`/`Actividad` — completos y probados; siguen estrictamente UI. `Indicador` gana un campo derivado de solo-lectura (`color_indicador`, calculado server-side, ver Approach) sobre su GET/PATCH ya existentes — no un campo de tabla, no migración.
- "Nuevo indicador" (creación desde cero): sigue siendo exclusivo de la pestaña Indicadores ya existente. La pestaña Metas solo edita el avance (`valor_actual`) de un indicador ya existente — evita duplicar el punto de entrada de creación que `indicadores-tab.tsx` ya resuelve.
- "Medio de verificación" por indicador (el mock v6 lo muestra, `i.mv`): `Indicador` no tiene ese campo en `prisma/schema.prisma` — no hay dato real que mostrar. Agregarlo requeriría una migración, fuera del alcance `UI`-only que la Auditoría asignó a F1.4.
- La UI de edición del umbral `indicador` en el admin (`UmbralesSection`): el PUT de `/api/v1/settings` acepta el campo (opcional, ver Approach) y el GET lo devuelve, pero no se construye ningún formulario nuevo para editarlo — sigue el mismo default de organización hasta que F1.5 (fuera de este change) agregue esos inputs.
- Click-through de las tarjetas KPI de `KpiCards`/`resumen-tab.tsx` hacia la pestaña Metas — `KpiCards` es compartido con `/tablero-gerencial` (org-wide, sin `projectId`) y añadir navegación ahí es un cambio transversal que no forma parte de la pestaña Metas en sí; se deja como mejora futura si el negocio la pide.

## Capabilities

### Modified
- **`project-schedule`** — añade el requisito de superficie UI (pestaña Metas, agrupada por Meta) sobre `Meta`/`Actividad`/RF-02 ya especificados, y el requisito de la banda `indicador` del semáforo (KPI 3) resuelta server-side; no cambia ningún requisito de dato, semáforo técnico/financiero o validación ya especificado — `indicador` es una tercera banda independiente, mismo mecanismo de resolución.

### New
Ninguna.

## Approach

Sin migración, sin nuevos hooks. Un campo derivado de solo-lectura en dos rutas API ya existentes, y tres piezas de UI, en orden de dependencia:

1. **`lib/semaforo.ts`/`lib/catalogs.ts`** — `UmbralesSemaforo` gana una tercera banda `indicador: { verde: number; amarillo: number }`, junto a `tecnico`/`financiero`. Nueva función pura `colorIndicador(razon, u)`: `razon >= u.indicador.verde` → verde, `razon >= u.indicador.amarillo` → amarillo, si no rojo — mismo estilo que `colorTecnico`/`colorFinanciero`. `UMBRALES_SEMAFORO_DEFAULT` (catalogs.ts) gana `indicador: { verde: 0.9, amarillo: 0.6 }`. `resolverUmbrales` mezcla la banda `indicador` exactamente igual que `tecnico`/`financiero` (override de proyecto > setting de organización > default).
2. **`lib/settings.ts`** — nuevo `getUmbralesSemaforo()`: envuelve `getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT)` y rellena `indicador` con el default de organización cuando el registro guardado es de antes de este change (JSON sin migración — sin este relleno, un `Setting` viejo rompería `colorIndicador`). Todo lector nuevo de esta banda pasa por acá.
3. **`api/v1/projects/[id]/indicators/route.ts` (GET) y `[indicatorId]/route.ts` (GET/PATCH)** — mismo patrón que `budget/route.ts`: resuelven `umbrales` (`getUmbralesSemaforo()` + `resolverUmbrales(umbralesOrganizacion, proyecto.umbrales_override)`) y agregan `color_indicador` a la proyección de cada indicador, calculado server-side. El frontend nunca calcula el color — lo renderiza verbatim, igual que `financiero-tab.tsx` hace con `color_financiero`.
4. **`api/v1/settings/route.ts`** — el PUT acepta `semaforo_umbrales.indicador` como opcional; si se omite (caso de hoy: `UmbralesSection` no construye UI para esta banda, ver Scope/Out), el servidor conserva el `indicador` ya guardado en vez de sobreescribirlo con `undefined` — así el admin existente sigue funcionando sin cambios y nunca borra la banda por omisión. El GET la devuelve siempre (normalizada por `getUmbralesSemaforo()`).
5. `indicadores-tab.tsx` — un cambio de una palabra: exportar `IndicadorFormDialog` (hoy declarado sin `export`) para que `metas-tab.tsx` lo reutilice en modo edición. Sin cambio de comportamiento; el archivo y sus tests existentes quedan intactos.
6. `tabs/metas-tab.tsx` — lee `useGoals(projectId)`/`useActivities(projectId)`/`useIndicators(projectId)` (los tres ya cacheados por TanStack Query), agrupa actividades e indicadores por `meta_id`, calcula el código `A{n}` **secuencial en todo el proyecto** (numerado en el mismo orden que `useActivities` ya devuelve — `fecha_planificada asc` — antes de agrupar por meta) y el color de semáforo por actividad (mismo criterio que `gantt-tab.tsx`'s `actividadColor`, duplicado localmente por el mismo precedente ya usado dos veces en el repo), renderiza `indicador.color_indicador` verbatim (paso 3), y abre `IndicadorFormDialog` por indicador para "Editar avance".
7. `project-workspace.tsx` — añade `"metas"` a `TAB_VALUES` como **2.ª pestaña**, justo después de `"resumen"` (como en v6).

Sigue el patrón de `tabs/soportes-tab.tsx` (F1.3, recién aplicado): `"use client"`, sin wrapper `Card`/`Dialog` propio en la pestaña (el `<Tabs>` del workspace ya da el chrome), loading/empty/populated explícitos por meta, TDD estricto.

## Decisiones ya resueltas (corrección post-revisión del usuario)

- **Umbrales de color del indicador**: parametrizados vía `UmbralesSemaforo.indicador` (default org verde ≥90 %/amarillo ≥60 %, igual a los valores de v6), resuelto server-side por `resolverUmbrales` — no un hardcode local de la pestaña. Ver Approach, pasos 1-4.
- **Posición de la pestaña**: 2.ª, justo después de Resumen, como en v6 — no al final de `TAB_VALUES`. `project-workspace.test.tsx` se actualiza para reflejar el nuevo orden de `TabsTrigger`/`TabsContent`.
- **Numeración `A{n}`**: secuencial en todo el proyecto (no reiniciada por meta), en el orden que `useActivities` ya devuelve.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `src/lib/semaforo.ts` | Modified | Banda `indicador` en `UmbralesSemaforo`, `colorIndicador(razon, u)`, merge en `resolverUmbrales` |
| `src/lib/semaforo.test.ts` | Modified | Tests de `colorIndicador` y del merge de `indicador` en `resolverUmbrales` |
| `src/lib/catalogs.ts` | Modified | `UMBRALES_SEMAFORO_DEFAULT.indicador = { verde: 0.9, amarillo: 0.6 }` |
| `src/lib/settings.ts` | Modified | `getUmbralesSemaforo()` — normaliza/rellena `indicador` para settings guardados antes de este change |
| `src/lib/settings.test.ts` | Modified | Test de `getUmbralesSemaforo()` |
| `src/app/api/v1/settings/route.ts` | Modified | PUT acepta `semaforo_umbrales.indicador` opcional sin borrar el guardado si se omite; GET lo devuelve |
| `src/app/api/v1/settings/route.test.ts` | Modified | Casos de `indicador` opcional/preservado en PUT, presente en GET |
| `src/app/api/v1/projects/[id]/indicators/route.ts` | Modified | GET agrega `color_indicador` server-side (mismo patrón que `budget/route.ts`) |
| `src/app/api/v1/projects/[id]/indicators/route.test.ts` | Modified | Casos de `color_indicador` en la respuesta del GET |
| `src/app/api/v1/projects/[id]/indicators/[indicatorId]/route.ts` | Modified | GET/PATCH agregan `color_indicador` a la respuesta |
| `src/app/api/v1/projects/[id]/indicators/[indicatorId]/route.test.ts` | Modified | Casos de `color_indicador` en GET/PATCH |
| `src/hooks/projects.ts` | Modified | `Indicador.color_indicador: "verde" \| "amarillo" \| "rojo"` en el DTO |
| `src/components/proyectos/tabs/metas-tab.tsx` | New | Pestaña: tarjeta por meta, chips de actividades (código `A{n}` secuencial en todo el proyecto), indicadores con barra de progreso coloreada por `color_indicador` |
| `src/components/proyectos/tabs/metas-tab.test.tsx` | New | |
| `src/components/proyectos/tabs/indicadores-tab.tsx` | Modified | Exportar `IndicadorFormDialog` (sin cambio de comportamiento) |
| `src/components/proyectos/project-workspace.tsx` | Modified | `TAB_VALUES` + tab "metas" como 2.ª pestaña |
| `src/components/proyectos/project-workspace.test.tsx` | Modified | Mock + assertions para la nueva pestaña, orden actualizado |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| El código `A{n}` por actividad es puramente de presentación (no existe en el schema); si se persiste sin querer, sería un dato inventado | Baja | Se calcula en el propio render de `metas-tab.tsx`, por meta, sin tocar `Actividad`/ningún hook — nunca se envía en un payload |
| Duplicar la función de color por actividad (ya existe en `cronograma-tab.tsx`/`gantt-tab.tsx`) por tercera vez puede divergir si el proyecto luego cambia el criterio de semáforo técnico | Media | Documentado en design.md como decisión explícita, mismo patrón ya aceptado dos veces; si diverge, es señal de que corresponde extraerla a un helper compartido — no se hace preventivamente aquí para no tocar los dos archivos existentes en un change que la Auditoría clasificó como `S` |
| Reutilizar `IndicadorFormDialog` desde otro archivo (`metas-tab.tsx`) sin que `indicadores-tab.tsx` lo declare pensando en ese consumidor externo | Baja | Solo se exporta el símbolo (una palabra); su contrato de props (`projectId`, `open`, `onOpenChange`, `indicador`, `metas`) ya es genérico y no asume el archivo llamante |
| Tarjetas con muchos indicadores/actividades son anchas en 390px | Baja | Layout de tarjeta apilada (`flex-col`), chips en `flex-wrap`, mismo patrón que `soportes-tab.tsx`/la tarjeta de Meta del propio mock v6 |

## Rollback Plan

Revertir la UI restaura el workspace a 7 pestañas (sin Metas) y `Indicador` vuelve a no tener `color_indicador` en su respuesta (campo aditivo — ningún consumidor existente lo lee, revertirlo no rompe nada). Ningún cambio de schema ni migración — el rollback es la eliminación de `metas-tab.tsx`/su test, el `export` agregado en `indicadores-tab.tsx`, la línea de `TAB_VALUES`/`TabsTrigger`/`TabsContent` en `project-workspace.tsx`, y revertir la banda `indicador` en `semaforo.ts`/`catalogs.ts`/`settings.ts`/las dos rutas de indicators.

## Dependencies

- `project-schedule` (ya implementado) — este change consume `useGoals`/`useActivities`/`useIndicators` sin modificarlos.
- `indicadores-tab.tsx` (ya implementado, `gestion-proyectos-workspace` Fase 7, sin commit aún per Auditoría F0.2) — este change depende de que exista y reutiliza su `IndicadorFormDialog`. **F0.2 (mergear las tabs Cronograma/Gantt/Indicadores a `main`) es una precondición de despliegue**, aunque no de desarrollo: este change parte de `local/todo-integrado`, donde esas tabs ya están, igual que F1.1–F1.3 lo hicieron.
- F1.3 (`proyecto-soportes-tab`) — comparte `project-workspace.tsx` recién modificado (7 pestañas); este change parte de esa versión para evitar conflicto de líneas en `TAB_VALUES`.

## Success Criteria

- [ ] La pestaña Metas (2.ª, tras Resumen) lista todas las metas del proyecto agrupadas, cada una con sus actividades vinculadas (chip con código `A{n}` secuencial en todo el proyecto, % y color) y sus indicadores (valor, meta, unidad, barra coloreada por `color_indicador`)
- [ ] `color_indicador` se calcula server-side vía `resolverUmbrales`/`colorIndicador`, nunca hardcodeado en el componente
- [ ] "Editar avance" de un indicador desde su tarjeta de Meta actualiza `valor_actual` vía el `PATCH` ya existente, sin duplicar su validación
- [ ] Una Meta sin actividades o sin indicadores muestra un estado vacío explícito, no un error
- [ ] Cero cambios en `prisma/schema.prisma` ni `prisma/migrations/`
- [ ] `GET`/`PUT /api/v1/settings` y `UmbralesSection` (admin) siguen funcionando sin cambios visibles para el usuario final
- [ ] Tests nuevos en RED antes del código, GREEN después; suite completa sigue en verde
