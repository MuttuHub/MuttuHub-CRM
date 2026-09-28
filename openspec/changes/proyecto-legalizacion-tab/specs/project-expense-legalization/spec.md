# Delta for project-expense-legalization

> New capability — trazabilidad de legalización sobre `Gasto` (tercero, número de comprobante, marca de observado) y su exposición en la pestaña Legalización (RF-06). El mecanismo de subida/enlace de soportes pertenece a `project-attachments` y no se toca. No existe `openspec/specs/project-expense-legalization/spec.md` todavía — este delta siembra el spec completo al archivar.

## ADDED Requirements

### Requirement: Gasto registra tercero y comprobante — RF-06

`Gasto` MUST permitir registrar `tercero` (nombre del beneficiario/proveedor) y `numero_comprobante`, ambos opcionales en el modelo pero solicitados por el modal "Registrar gasto". Estos campos MUST persistirse aditivamente, sin afectar gastos existentes (ambos `NULL` por defecto).

- **Crear gasto con tercero y numero_comprobante los persiste tal cual** — `expenses/route.test.ts`
- **Gastos creados antes de esta migración quedan con ambos campos en `NULL`, sin error** — `expenses/route.test.ts`

### Requirement: Estado de legalización derivado, no copiado — RF-06

El sistema MUST derivar el estado de legalización de un gasto sin almacenar un valor redundante: `observado` (booleano propio de `Gasto`) tiene prioridad; si es `false`, el estado se calcula a partir de la existencia de al menos un `SoporteProyecto` con `tipo: LEGALIZACION` y `gasto_id` igual a este gasto. El sistema MUST NOT introducir una columna `estado_legalizacion` separada que pueda desincronizarse de `soportes` u `observado`.

- **Estado "Falta soporte" cuando no hay ningún SoporteProyecto LEGALIZACION vinculado y `observado` es false** — `expenses/route.test.ts`
- **Estado "Con soporte" cuando existe al menos un SoporteProyecto LEGALIZACION vinculado y `observado` es false** — `expenses/route.test.ts`
- **Estado "Observado" cuando `observado` es true, independientemente de si hay soportes** — `expenses/route.test.ts`

#### Scenario: Gasto recién creado sin soporte
- GIVEN un gasto creado sin ningún `SoporteProyecto` vinculado
- WHEN se consulta su estado de legalización
- THEN el estado es "Falta soporte"

#### Scenario: Gasto con soporte de legalización adjunto
- GIVEN un gasto con un `SoporteProyecto` de `tipo: LEGALIZACION` vinculado vía `gasto_id`
- WHEN se consulta su estado de legalización
- THEN el estado es "Con soporte"

#### Scenario: Gasto marcado como observado
- GIVEN un gasto con `observado: true` y una `observacion`
- WHEN se consulta su estado de legalización, tenga o no soportes vinculados
- THEN el estado es "Observado"

### Requirement: Marcar un gasto como observado — RF-06

El sistema MUST permitir marcar un `Gasto` como observado, con una `observacion` de texto, a través del endpoint de edición de gasto ya existente (`PATCH .../expenses/[expenseId]`). Esta acción MUST requerir la misma autorización de escritura que el resto de las ediciones de gasto (`canManageProject`).

- **PATCH con `observado: true` y `observacion` no vacía se acepta y persiste** — `expenses/[expenseId]/route.test.ts`
- **PATCH de `observado`/`observacion` sin permiso de escritura sobre el proyecto es rechazado** — `expenses/[expenseId]/route.test.ts`

#### Scenario: Marcar observado
- GIVEN un usuario con `canManageProject` sobre el proyecto
- WHEN envía `PATCH .../expenses/[expenseId]` con `{ observado: true, observacion: "Factura ilegible" }`
- THEN el gasto queda marcado como observado con esa observación persistida

### Requirement: Pestaña Legalización con libro y filtros — RF-06

El workspace del proyecto MUST incluir una pestaña "Legalización" que liste los gastos del proyecto como un libro (mes, comprobante, fecha, rubro, concepto, tercero, valor, estado, observación), con filtros Todos / Sin soporte / Observados aplicados sobre el estado derivado descrito arriba. Las filas con `observado: true` MUST mostrarse con un tinte visual distinto al resto.

- **Filtro "Sin soporte" muestra solo gastos en estado "Falta soporte"** — `legalizacion-tab.test.tsx`
- **Filtro "Observados" muestra solo gastos con `observado: true`** — `legalizacion-tab.test.tsx`

#### Scenario: Filtrar por sin soporte
- GIVEN una lista de gastos con estados mixtos
- WHEN se selecciona el filtro "Sin soporte"
- THEN solo se muestran los gastos en estado "Falta soporte"

### Requirement: Registrar gasto crea el soporte en el mismo flujo cuando corresponde — RF-06

El modal "Registrar gasto" MUST permitir elegir entre "Soporte: ahora" (con un enlace https) o "Soporte: después". Cuando se elige "ahora" con un enlace válido, el sistema MUST crear el `Gasto` y, en la misma acción de usuario, un `SoporteProyecto` de `tipo: LEGALIZACION` vinculado a ese gasto vía la API de adjuntos ya existente (`project-attachments`), sin duplicar su lógica de validación https/XOR.

#### Scenario: Registrar gasto con soporte inmediato
- GIVEN un usuario que completa el modal "Registrar gasto" eligiendo "Soporte: ahora" con un enlace https válido
- WHEN confirma el formulario
- THEN el gasto se crea y queda en estado "Con soporte" sin una acción adicional del usuario

#### Scenario: Registrar gasto sin soporte inmediato
- GIVEN un usuario que completa el modal "Registrar gasto" eligiendo "Soporte: después"
- WHEN confirma el formulario
- THEN el gasto se crea en estado "Falta soporte", legalizable más tarde desde el flujo de adjuntos existente
