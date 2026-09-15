# Delta for commercial-opportunities

> New capability — commercial lifecycle of `Oportunidad`: fixed proposal-sent date, communication log, lifecycle view, and phase-based conversion (D2). No existing `openspec/specs/commercial-opportunities/spec.md` — this delta seeds the full spec at archive time.

## ADDED Requirements

### Requirement: Oportunidad pertenece a un único Cliente — invariante preexistente, sin cambios de código

Toda `Oportunidad` MUST pertenecer a exactamente un `Cliente` vía FK obligatoria (`Oportunidad.cliente_id`). Este comportamiento ya está implementado (RF-C01, ✅ per proposal) y este requisito lo documenta como baseline que `opportunity-task-linking` y `opportunity-access-control` MUST preservar sin regresión.

- **Crear oportunidad sin `cliente_id` válido falla** — `clients/[id]/opportunities/route.test.ts`
- **Ninguna oportunidad puede tener `cliente_id` nulo tras cualquier migración de este change** — smoke/migration check

### Requirement: fecha_envio_propuesta se fija una sola vez

El sistema MUST registrar `fecha_envio_propuesta` en `Oportunidad` la primera vez que se marca el envío de la propuesta, y MUST NOT sobreescribirla en actualizaciones posteriores. `fecha_ultima_gestion` sigue actualizándose en cada PATCH como hoy, de forma independiente y sin relación con este campo.

#### Scenario: Primer envío fija la fecha
- GIVEN una oportunidad sin `fecha_envio_propuesta`
- WHEN se registra el envío de la propuesta
- THEN `fecha_envio_propuesta` queda fijada con la fecha del evento

#### Scenario: Actualización posterior no altera la fecha fijada
- GIVEN una oportunidad con `fecha_envio_propuesta` ya fijada
- WHEN se actualiza cualquier otro campo de la oportunidad (incluido `fecha_ultima_gestion`, `estado`)
- THEN `fecha_envio_propuesta` permanece sin cambios

### Requirement: Bitácora de comunicación por oportunidad

`BitacoraEntrada.oportunidad_id` MUST ser nullable y permitir asociar entradas de comunicación a una oportunidad específica, sin afectar bitácoras existentes atadas solo a `Cliente`.

- **Crear entrada de bitácora con `oportunidad_id` → visible en la vista de ciclo de vida de esa oportunidad** — bitácora/opportunities test
- **Entradas de bitácora preexistentes sin `oportunidad_id` no se ven afectadas** — regression check

### Requirement: Vista de ciclo de vida de la oportunidad

El detalle de `Oportunidad` MUST incluir: `estado`, `fase`, tareas vinculadas (ver `opportunity-task-linking`), bitácora de comunicación y `fecha_envio_propuesta`.

- **GET detalle de oportunidad incluye estado, fase, tareas, bitácora y fecha_envio_propuesta** — `clients/[id]/opportunities/route.test.ts`

### Requirement: Conversión a EJECUCION por cambio de fase (GANADA) — D2

Cuando una `Oportunidad` pasa a `estado: GANADA`, el sistema MUST ofrecer una acción explícita que cambia `fase` de `PROSPECCION` a `EJECUCION` y fija `fecha_adjudicacion`. La acción MUST quedar auditada en `auditoria`. Las tareas vinculadas (`Tarea.oportunidad_id`) MUST conservarse sin duplicación de datos: no se crea ninguna entidad `Proyecto` nueva, las tareas simplemente pasan a operarse en el Tablero de Seguimiento existente conservando su historial.

#### Scenario: Conversión exitosa
- GIVEN una oportunidad en `estado: GANADA`, `fase: PROSPECCION`, con N tareas vinculadas
- WHEN un usuario con `canManageOpportunities` ejecuta la conversión
- THEN `fase` pasa a `EJECUCION` y `fecha_adjudicacion` queda fijada
- AND se crea una fila en `auditoria` con la acción
- AND las N tareas vinculadas conservan `oportunidad_id`, historial y bitácora sin duplicarse

#### Scenario: Conversión bloqueada si no está GANADA
- GIVEN una oportunidad en un `estado` distinto de `GANADA`
- WHEN se intenta ejecutar la conversión
- THEN la operación es rechazada y `fase` no cambia

#### Scenario: Usuario sin `canManageOpportunities` no puede convertir
- GIVEN un usuario sin el flag de acceso comercial (ver `opportunity-access-control`)
- WHEN intenta ejecutar la conversión
- THEN la respuesta es 403 y `fase` no cambia
