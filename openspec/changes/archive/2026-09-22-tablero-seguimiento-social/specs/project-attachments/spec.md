# Project Attachments Specification

> New capability — soportes de verificación y legalización: archivo subido o enlace externo, nunca ambos ni ninguno (RF-04, RF-06, D8), bajo control de roles estricto (RNF-03). No existe `openspec/specs/project-attachments/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: Soporte es archivo XOR enlace externo — D8

`SoporteProyecto` MUST have `storage_path String?` and `url_externa String?`, both nullable, with a Postgres `CHECK` enforcing exactly one non-null. `nombre` MUST be required in both cases. `documento_id` MAY mirror the central `Documento` repository, nullable, without cascade (same contract as `AdjuntoTarea`).

#### Scenario: Solo archivo
- GIVEN `storage_path` con valor y `url_externa` nulo
- WHEN se guarda el soporte
- THEN la base de datos acepta la fila

#### Scenario: Solo enlace
- GIVEN `url_externa` con valor y `storage_path` nulo
- WHEN se guarda el soporte
- THEN la base de datos acepta la fila

#### Scenario: Ambos presentes rechazado
- GIVEN `storage_path` y `url_externa` ambos con valor
- WHEN se intenta guardar el soporte
- THEN la base de datos rechaza el write por el `CHECK` XOR

#### Scenario: Ninguno presente rechazado
- GIVEN `storage_path` y `url_externa` ambos nulos
- WHEN se intenta guardar el soporte
- THEN la base de datos rechaza el write por el `CHECK` XOR

### Requirement: Validación de esquema del enlace externo

When `url_externa` is set, the system MUST validate it uses the `https` scheme only.

- **URL con esquema `http://` o `file://` rechazada** — `attachments/route.test.ts`
- **URL `https://` válida aceptada** — `attachments/route.test.ts`

### Requirement: Medios de verificación de productos entregados — RF-04

The system MUST allow attaching a `SoporteProyecto` to validate delivered products, associated to a `Proyecto` or a specific `Actividad`, as file upload or external link (e.g. Google Drive URLs/folders).

- **Soporte listado en la ficha de la actividad correspondiente** — `activities/[id]/attachments/route.test.ts`

### Requirement: Soportes de legalización financiera — RF-06

The system MUST allow attaching a `SoporteProyecto` associated directly to a línea de gasto and its `rubro_id`, for facturas, cuentas de cobro y planillas.

- **Soporte financiero requiere `rubro_id` trazable** — `budget/[id]/attachments/route.test.ts`

### Requirement: Seguridad y control de roles sobre soportes — RNF-03

Access to `SoporteProyecto` (upload, download-link resolution, deletion) MUST be gated by role: creation/upload/deletion MUST require `canManageProject`; read MUST be scoped to users with project visibility, including management-only viewers per `project-access-control`. `url_externa` values MUST NOT bypass the same role check applied to `storage_path` values — both paths are subject to identical access control.

#### Scenario: Usuario sin acceso al proyecto no puede leer soportes
- GIVEN un usuario sin `canViewManagementDashboard` ni relación con el proyecto
- WHEN intenta acceder a un soporte del proyecto
- THEN la respuesta es 403

#### Scenario: Solo canManageProject puede subir o eliminar
- GIVEN un usuario con solo `puede_ver_tablero_gerencial` (sin `canManageProject`)
- WHEN intenta subir o eliminar un soporte
- THEN la operación es rechazada (403)
