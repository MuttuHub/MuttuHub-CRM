# Project Schedule Specification (delta)

## MODIFIED Requirements

### Requirement: Edición administrativa de umbrales de semáforo — RF-03, RF-07, D10

Un usuario `ADMINISTRADOR` MUST be able to edit, from Administración, the three organization-level threshold bands used to color the semáforo — `tecnico` (avance real / planificado), `financiero` (ejecutado / proyectado) and `indicador` (valor actual / meta de un `Indicador`) — through `PUT /api/v1/settings`. Each band's coherence MUST be validated both client-side (before enabling the save action) and server-side (rejecting an incoherent payload with 400): `tecnico.rojo` MUST NOT exceed `tecnico.verde`; `financiero.verde_min` MUST NOT exceed `financiero.verde_max`; `financiero.amarillo_min` MUST NOT exceed `financiero.amarillo_max`; `indicador.amarillo` MUST NOT exceed `indicador.verde`. Omitting `indicador` from a `PUT` payload MUST preserve the currently-stored band rather than dropping it (existing behavior since F1.4/D4, unchanged by this requirement).

#### Scenario: Administrador edita el umbral de indicador
- GIVEN un `ADMINISTRADOR` autenticado en Administración con `indicador.verde = 0.9`, `indicador.amarillo = 0.6` cargados
- WHEN cambia `indicador.amarillo` a `0.65` y guarda
- THEN `PUT /api/v1/settings` recibe `semaforo_umbrales.indicador = { verde: 0.9, amarillo: 0.65 }` y el snapshot subsiguiente (`GET`) refleja el nuevo valor

#### Scenario: Coherencia de indicador rechazada en el cliente
- GIVEN un `ADMINISTRADOR` editando los umbrales de indicador
- WHEN ingresa `indicador.amarillo` mayor que `indicador.verde`
- THEN el botón "Guardar cambios" queda deshabilitado y se muestra un mensaje de error, sin llamar a `PUT /api/v1/settings`

#### Scenario: Coherencia de indicador rechazada en el servidor
- GIVEN un `PUT /api/v1/settings` con `semaforo_umbrales.indicador.amarillo` mayor que `semaforo_umbrales.indicador.verde`
- WHEN el servidor procesa la solicitud
- THEN responde 400 `VALIDATION_ERROR` y no persiste el cambio

#### Scenario: Rol sin permisos no puede editar umbrales
- GIVEN un usuario autenticado con un rol distinto de `ADMINISTRADOR`
- WHEN intenta `PUT /api/v1/settings`
- THEN el servidor responde con el mismo gate de autorización que ya aplica a `task_tags`/`doc_categories` (`requireApiRole(["ADMINISTRADOR"])`), sin exponer ni modificar los umbrales
