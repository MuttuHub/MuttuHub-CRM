# Delta for project-attachments

> Adds the UI surface (workspace tab + creation modal) for the already-specified `SoporteProyecto` mechanism (RF-04, RNF-03) — the archived `openspec/specs/project-attachments/spec.md` covers the data model, XOR validation, and role gating; this delta only adds the requirement that a "Soportes" tab and "Agregar soporte" modal exist. No requirement below changes validation, security, or data shape.

## ADDED Requirements

### Requirement: Pestaña Soportes en el workspace del proyecto — RF-04

El workspace del proyecto MUST incluir una pestaña "Soportes" que liste los `SoporteProyecto` del proyecto: chip de tipo (Verificación, Legalización), nombre del documento, a qué está vinculado (actividad, gasto, o ninguno), autor, fecha y formato o enlace de descarga. La pestaña MUST reutilizar `GET .../attachments` sin duplicar su lógica de resolución de `download_url`.

- **Pestaña Soportes lista los soportes del proyecto con tipo, nombre, vinculado a, autor, fecha y formato** — `soportes-tab.test.tsx`
- **Soporte sin `actividad_id` ni `gasto_id` se muestra como soporte general del proyecto, no como un error** — `soportes-tab.test.tsx`

#### Scenario: Listar soportes de un proyecto
- GIVEN un proyecto con soportes de tipo Verificación y Legalización, algunos vinculados a una actividad, otros a un gasto, y uno sin vínculo
- WHEN se abre la pestaña Soportes
- THEN se listan todos, cada uno con su chip de tipo correcto y su vínculo resuelto (actividad, gasto, o "soporte general del proyecto")

### Requirement: Agregar soporte desde el workspace — RF-04

El sistema MUST permitir crear un `SoporteProyecto` desde un modal "Agregar soporte" en la pestaña Soportes, con Tipo, Documento (nombre, requerido) y Vincular a (actividad si el tipo es Verificación, gasto si es Legalización, o ninguno), reutilizando `POST .../attachments` ya existente sin duplicar su validación XOR archivo/enlace.

- **"Agregar soporte" con un archivo válido crea el soporte y lo agrega a la lista** — `soporte-dialog.test.tsx`
- **"Agregar soporte" con un enlace `https://` válido crea el soporte y lo agrega a la lista** — `soporte-dialog.test.tsx`
- **El campo Documento es obligatorio; enviar el formulario sin él no llama a la API** — `soporte-dialog.test.tsx`

#### Scenario: Agregar soporte con enlace
- GIVEN un usuario con permisos de escritura sobre el proyecto que completa el modal "Agregar soporte" con Tipo, Documento y un enlace `https://` válido
- WHEN confirma el formulario
- THEN el soporte se crea y aparece en la lista de la pestaña Soportes

#### Scenario: Vincular a cambia según el tipo
- GIVEN el modal "Agregar soporte" abierto
- WHEN el usuario selecciona Tipo = "Verificación"
- THEN "Vincular a" ofrece las actividades del proyecto
- WHEN el usuario cambia Tipo a "Legalización"
- THEN "Vincular a" ofrece los gastos del proyecto

### Requirement: Eliminar soporte desde la pestaña — RNF-03

El sistema MUST permitir eliminar (soft delete) un `SoporteProyecto` desde su fila en la pestaña Soportes, reutilizando `DELETE .../attachments/[attachmentId]` ya existente, gated por la misma autorización (`canManageProject`) que el resto de operaciones de escritura sobre soportes.

- **Eliminar un soporte lo retira de la lista** — `soportes-tab.test.tsx`

#### Scenario: Eliminar un soporte
- GIVEN un soporte listado en la pestaña Soportes
- WHEN el usuario confirma su eliminación
- THEN el soporte deja de aparecer en la lista
