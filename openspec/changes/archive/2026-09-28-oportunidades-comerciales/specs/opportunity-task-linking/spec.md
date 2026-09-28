# Delta for opportunity-task-linking

> New capability — `Tarea` ↔ `Oportunidad` link (RF-C02) with a client-consistency invariant enforced at the database level (non-negotiable, D1), plus visual differentiation on the Kanban board (RNF-C01).

## ADDED Requirements

### Requirement: Tarea.oportunidad_id nullable FK con invariante de cliente — no negociable

`Tarea` MUST tener `oportunidad_id` nullable con relación inversa `Oportunidad.tareas`. Cuando `oportunidad_id` está seteado, `Tarea.cliente_id` MUST coincidir exactamente con `Oportunidad.cliente_id`. Este invariante MUST estar garantizado por una FK compuesta `(oportunidad_id, cliente_id) → Oportunidad(id, cliente_id)` a nivel de base de datos — la validación de API es defensa en profundidad, NUNCA el único guardia. Sin este invariante se abre una fuga de permisos, porque el scope de lectura se calcula por `cliente_id`.

#### Scenario: Vínculo válido
- GIVEN una oportunidad del cliente A
- WHEN se crea o actualiza una tarea con `oportunidad_id` de esa oportunidad y `cliente_id = A`
- THEN la operación se acepta

#### Scenario: Vínculo cruzado entre clientes es rechazado — invariante crítico, no negociable
- GIVEN una oportunidad del cliente A
- WHEN se intenta crear o actualizar una tarea con ese `oportunidad_id` pero `cliente_id = B` (≠ A)
- THEN la base de datos rechaza el write por violación de la FK compuesta, con o sin la validación de API
- AND ninguna fuga de lectura entre clientes es posible a través de este camino

#### Scenario: Sin backfill de tareas existentes (D1)
- GIVEN tareas creadas antes de este cambio
- WHEN se despliega esta capacidad
- THEN ninguna tarea existente recibe `oportunidad_id` automáticamente; el re-vinculado es manual desde la UI

- **Invariante de integridad cliente-oportunidad cubierto por test dedicado** — `permissions.test.ts` (o suite de invariantes equivalente)
- **`(oportunidad_id, cliente_id)` inconsistente rechazado en create/update de tarea** — `tasks/route.test.ts`, `tasks/[id]/route.test.ts`

### Requirement: Filtrado y creación de tareas desde la oportunidad

Los endpoints de tareas MUST aceptar `oportunidad_id` como filtro de listado y como campo en creación/edición, sujeto al invariante anterior. La vista de oportunidad MUST permitir crear una tarea ya vinculada a ella.

- **`GET /tasks?oportunidad_id=X` devuelve solo tareas de esa oportunidad** — `tasks/route.test.ts`
- **Crear tarea desde la vista de oportunidad hereda `cliente_id` y `oportunidad_id` automáticamente, sin permitir override inconsistente** — `clients/[id]/opportunities/route.test.ts`

### Requirement: Distinción visual en el tablero — RNF-C01

El Kanban MUST distinguir visualmente las tareas vinculadas a una oportunidad en `fase: PROSPECCION` de las tareas de ejecución activa (sin `oportunidad_id`, o con oportunidad en `fase: EJECUCION`).

- **Tarea con `oportunidad.fase = PROSPECCION` renderiza con el indicador visual distintivo** — `kanban-board.test.tsx`
- **Tarea sin `oportunidad_id`, o con oportunidad en `fase: EJECUCION`, renderiza sin el indicador** — `kanban-board.test.tsx`
