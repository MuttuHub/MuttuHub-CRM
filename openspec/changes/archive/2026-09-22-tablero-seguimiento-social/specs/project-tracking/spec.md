# Project Tracking Specification

> New capability — `Proyecto`: identidad, ficha, estados y trazabilidad hacia `Cliente` y, opcionalmente, hacia la `Oportunidad` comercial que lo originó (RF-01, D1). Base de agregación de `project-schedule`, `project-budget` y `management-dashboard`. No existe `openspec/specs/project-tracking/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: Ficha integral del Proyecto — RF-01

The system MUST allow registering a `Proyecto` with: nombre, código de proyecto (unique), territorio/municipio, `cliente_id` (required FK to `Cliente`), línea estratégica (closed enum — Empleabilidad, Emprendimiento, Productividad, Cultural, Social, Cívico-político, Método Muttu, Ambiental — per D5), fecha_inicio, fecha_fin, estado, beneficiarios_meta (Int, per D6).

#### Scenario: Creación válida
- GIVEN datos completos de proyecto con `cliente_id` válido y línea estratégica de la lista cerrada
- WHEN se crea el proyecto
- THEN el proyecto queda persistido y visible en la ficha con todos los campos anteriores

#### Scenario: cliente_id inválido rechazado
- GIVEN un `cliente_id` que no corresponde a ningún `Cliente` existente
- WHEN se intenta crear el proyecto
- THEN la operación es rechazada

### Requirement: Proyecto pertenece a exactamente un Cliente

`Proyecto.cliente_id` MUST be a required FK (same shape as `Oportunidad.cliente_id`). MUST NOT be nullable.

- **Crear proyecto sin `cliente_id` válido falla** — `projects/route.test.ts`
- **Ningún proyecto puede tener `cliente_id` nulo tras cualquier migración de este change** — smoke/migration check

### Requirement: Vínculo opcional y trazable con Oportunidad — D1

`Proyecto.oportunidad_id` MUST be nullable and unique (`String? @unique`). The system MUST offer an explicit action "Crear proyecto desde oportunidad ganada" that pre-fills the form from an `Oportunidad` in `fase: EJECUCION` and sets `oportunidad_id`, audited via `logAudit`. The system MUST NOT auto-create a `Proyecto` inside `convert/route.ts` (D1-bis): that endpoint's write payload and idempotency guard (409) MUST stay unmodified, and its existing 11 test scenarios MUST pass without modification.

#### Scenario: Crear proyecto desde oportunidad ganada
- GIVEN una oportunidad en `fase: EJECUCION` sin proyecto vinculado
- WHEN un usuario con `canManageProject` ejecuta la acción "Crear proyecto desde oportunidad ganada"
- THEN se crea un `Proyecto` con `oportunidad_id` fijado y una fila de auditoría

#### Scenario: Unicidad de oportunidad_id
- GIVEN una oportunidad ya vinculada a un Proyecto
- WHEN se intenta crear un segundo Proyecto con el mismo `oportunidad_id`
- THEN la base de datos rechaza el segundo vínculo (`@unique`)

#### Scenario: convert/route.ts no modificado
- GIVEN la suite existente `convert/route.test.ts` (11/11 verde)
- WHEN se ejecuta después de este change
- THEN los 11 escenarios pasan sin modificación

### Requirement: CRUD de Proyecto con permisos

CRUD operations on `Proyecto` MUST be gated by `canManageProject` (see `project-access-control`). Read access for management-only viewers is governed separately by `canViewManagementDashboard` and MUST NOT allow write.

- **Usuario sin `canManageProject` no puede crear/editar/eliminar proyecto** — `permissions.test.ts`, `projects/route.test.ts`
- **Soft delete usa `deleted_at`, no elimina la fila** — `projects/[id]/route.test.ts`
