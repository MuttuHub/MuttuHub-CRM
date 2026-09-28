# Proposal: proyecto-legalizacion-tab — Pestaña Legalización + registro de gasto (RF-06)

## Intent

F1.2 del plan de acción de la Auditoría v6. `Gasto` ya existe y ya se puede legalizar con un `SoporteProyecto` tipo `LEGALIZACION` (spec `project-attachments`, ya implementado y probado — POST `.../attachments` acepta `gasto_id` + `tipo`). Lo que falta es lo que pide RF-06 y que la Auditoría marca como brecha de datos: `Gasto` no guarda tercero, número de comprobante ni una marca de "observado" con su motivo, y no hay pestaña en el workspace para el libro de legalización ni el modal "Registrar gasto".

## Scope

**In:**
- Migración aditiva en `Gasto`: `tercero String?`, `numero_comprobante String?`, `observado Boolean @default(false)`, `observacion String?`.
- Extender `EXPENSE_SCHEMA`/`EXPENSE_SELECT` (POST) y `EXPENSE_PATCH_SCHEMA` en `src/app/api/v1/projects/[id]/expenses/` para aceptar/devolver los campos nuevos.
- Estado de legalización **derivado**, no una columna redundante: `observado` → "Observado"; si no, ¿existe al menos un `SoporteProyecto` tipo `LEGALIZACION` con `gasto_id` = este gasto? → "Con soporte" : "Falta soporte". Requiere anotar el conteo/existencia de soportes en `EXPENSE_SELECT` (p. ej. `_count` filtrado por `tipo`).
- Pestaña "Legalización" en `project-workspace.tsx`: 3 KPI cards, filtros (Todos · Sin soporte · Observados), tabla libro (mes, comprobante, fecha, rubro, concepto, tercero, valor, estado chip, observación), fila con tinte rojo si observado.
- Modal "Registrar gasto": Rubro (required), Concepto, Tercero, Valor COP, N.º comprobante, Fecha, Soporte (ahora/después), Enlace. "Ahora" con Enlace crea el `Gasto` y en la misma acción de usuario dispara el POST a `.../attachments` con `tipo: LEGALIZACION` y `gasto_id`; "después" solo crea el `Gasto` (queda "Falta soporte" hasta que se adjunte).

**Out:**
- Cualquier cambio a `project-attachments` (el mecanismo de subida/enlace ya está completo y probado).
- Marcar "Observado" es una acción de edición del `Gasto` vía el PATCH ya existente (`observado` + `observacion`) — no se crea un endpoint nuevo.
- Reconciliación contable, exportes o reportes financieros — fuera de F1.

## Capabilities

### New
- **`project-expense-legalization`** — campos de trazabilidad de legalización en `Gasto` (tercero, comprobante, marca de observado) y su exposición vía API; el mecanismo de soporte en sí pertenece a `project-attachments` y no se toca.

### Modified
Ninguna — no se modifica `project-attachments` ni `project-budget` (el semáforo y el presupuesto por rubro no cambian; `Gasto.monto_cop` sigue siendo la única fuente de `monto_ejecutado_cop` en `budget/route.ts`, sin cambios).

## Approach

Migración mínima: 4 columnas nullable/con default, sin tocar `linea_id`, `monto_cop` ni la FK compuesta existente. El estado "con soporte / sin soporte" se deriva de la relación `Gasto.soportes` ya existente (evita el mismo error que el proyecto ya corrigió una vez con la trazabilidad al rubro: nunca copiar un dato que ya vive en una FK). Solo `observado`/`observacion` son estado genuinamente nuevo, porque no son derivables de ninguna relación existente.

UI sigue el patrón de `financiero-tab.tsx` (F1.1, recién aplicado): `"use client"`, hook de React Query dedicado (`useExpenses(projectId)`, falta el hook cliente aunque el endpoint ya existe), loading/empty/populated, TDD estricto.

## Decisiones abiertas (requieren validación del usuario)

Ninguna nueva. D-FIN1 (F1.1) no aplica aquí — este change no toca el semáforo.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `prisma/schema.prisma` | Modified | `Gasto.tercero/numero_comprobante/observado/observacion` |
| `prisma/migrations/` | New | Migración aditiva, sin CHECK nuevo (los 4 campos son de dominio libre o booleano, no requieren invariante cross-columna) |
| `src/app/api/v1/projects/[id]/expenses/route.ts` | Modified | `EXPENSE_SCHEMA`, `EXPENSE_SELECT` (+ conteo de soportes LEGALIZACION) |
| `src/app/api/v1/projects/[id]/expenses/[expenseId]/route.ts` | Modified | `EXPENSE_PATCH_SCHEMA` (tercero, numero_comprobante, observado, observacion) |
| `src/hooks/projects.ts` | Modified | `useExpenses`, `useCreateExpense` (o equivalente), tipos `Gasto`/`EstadoLegalizacion` derivado en el cliente |
| `src/components/proyectos/tabs/legalizacion-tab.tsx` | New | Pestaña: KPIs, filtros, tabla libro |
| `src/components/proyectos/expense-dialog.tsx` (o similar) | New | Modal "Registrar gasto" |
| `src/components/proyectos/project-workspace.tsx` | Modified | `TAB_VALUES` + tab "legalizacion" |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Derivar el estado en el cliente en vez de en la API duplica la regla "con soporte si hay ≥1 LEGALIZACION" | Media | Calcular el estado derivado en el propio `EXPENSE_SELECT`/response de la API (no en el componente), igual que F1.1 hizo con el semáforo — la UI solo pinta lo que la API ya resolvió |
| Modal "Soporte ahora" son dos escrituras (crear gasto + crear soporte) sin transacción explícita hoy | Media | Encadenar las dos llamadas desde el cliente con manejo de error en la segunda (el gasto ya quedó creado, solo falta el soporte — no es un estado inconsistente, es "falta soporte" hasta reintentar); documentar esto como comportamiento esperado, no bug |
| Tabla del libro es ancha (9 columnas) en 390px | Baja | `overflow-x-auto`, mismo patrón que `cronograma-tab`/`financiero-tab` |

## Rollback Plan

Columnas aditivas nullables/con default — revertir el schema no toca datos preexistentes de `Gasto`. Revertir la UI restaura el workspace a 5 pestañas (sin Legalización). El PATCH ampliado puede revertirse a su forma actual sin romper llamadas existentes (los campos nuevos son opcionales).

## Dependencies

- F1.1 (Financiero) — ya aplicado; este change no depende de su código pero comparte el mismo `project-workspace.tsx` recién modificado, así que hay que partir de esa versión (commit `14ce6db`/`be2623c`) para evitar conflicto de líneas en `TAB_VALUES`.
- `project-attachments` (ya implementado) provee el mecanismo de soporte que este change consume, no modifica.

## Success Criteria

- [ ] `Gasto` acepta y persiste tercero, número de comprobante, observado y observación, aditivamente, sin romper gastos existentes
- [ ] El estado "con soporte / sin soporte / observado" que muestra la tabla coincide exactamente con lo que la API deriva (ningún cálculo repetido en el cliente)
- [ ] "Registrar gasto" con "Soporte: ahora" + Enlace crea el gasto y el soporte de legalización en la misma acción de usuario
- [ ] Los filtros Todos/Sin soporte/Observados filtran correctamente sobre datos reales
- [ ] Tests nuevos en RED antes del código, GREEN después; suite completa sigue en verde
