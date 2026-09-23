# Project Access Control Specification

> New capability — visibilidad de solo lectura gerencial y gates de escritura sobre `Proyecto` y sus entidades relacionadas, siguiendo el precedente compositivo de `hasCommercialAccess`/`canManageOpportunity` (D3). Cubre el rol "Visualizador/Directivo" del documento de roles y permisos. No existe `openspec/specs/project-access-control/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: puede_ver_tablero_gerencial es un flag ortogonal al rol — D3

`Usuario.puede_ver_tablero_gerencial: Boolean @default(false)` MUST exist and MUST NOT be modeled as a fifth `RolUsuario` enum value. The effective read predicate MUST be `canViewManagementDashboard(u) = canManageAny(u.rol) || u.puede_ver_tablero_gerencial`, mirroring the shape of `hasCommercialAccess`.

- **ADMINISTRADOR/GERENCIA/COORDINADOR (`canManageAny`) → `canViewManagementDashboard` true sin el flag** — `permissions.test.ts`
- **COLABORADOR con `puede_ver_tablero_gerencial: true` → `canViewManagementDashboard` true** — `permissions.test.ts`
- **COLABORADOR con `puede_ver_tablero_gerencial: false` → `canViewManagementDashboard` false** — `permissions.test.ts`

### Requirement: El flag otorga solo lectura, nunca escritura

`puede_ver_tablero_gerencial` MUST grant read access to the Tablero de Control Gerencial only. It MUST NOT compose into any write predicate (`canManageProject` or equivalents). A user with only this flag MUST NOT be able to create, edit, or delete any `Proyecto`, `Meta`, `Actividad`, línea presupuestal, or `SoporteProyecto`.

#### Scenario: Visualizador/Directivo ve el tablero, no puede editar
- GIVEN un usuario con `puede_ver_tablero_gerencial: true`, rol COLABORADOR, sin `canManageAny`
- WHEN accede al Tablero de Control Gerencial
- THEN la vista se muestra en modo solo lectura
- AND cualquier intento de editar un proyecto, meta, actividad o presupuesto es rechazado (403)

### Requirement: canManageProject — gate de escritura sobre Proyecto

The system MUST expose `canManageProject(actor)` composed at minimum from `canManageAny(actor.rol)`, following the same compositional style as `canEditClient`/`canManageOpportunity` — no generic middleware, pure predicate function. `canManageAny` MUST imply `canManageProject`; a design MAY extend it with an additional project-responsible-user axis, but this requirement fixes only that floor.

- **`canManageAny(rol)` → `canManageProject` true** — `permissions.test.ts`
- **COLABORADOR sin ningún flag ni responsabilidad adicional → `canManageProject` false** — `permissions.test.ts`

### Requirement: Roles y sus permisos principales — mapeo del documento de origen

The three source roles MUST map onto existing predicates without introducing a new `RolUsuario` value:
- Administrador (`canManageAny` true): full CRUD sobre `Proyecto`, gestión de usuarios, catálogo de rubros, parámetros de semáforo, acceso total a reportes.
- Gestor de Proyecto / Ejecutor (COLABORADOR con `canManageProject` true): registra cronogramas, metas y presupuestos; carga soportes; actualiza avances técnicos y sube medios de verificación.
- Visualizador / Directivo (`puede_ver_tablero_gerencial: true`, sin `canManageAny`): acceso de solo lectura al Tablero de Control Gerencial, indicadores globales y semaforizaciones.

- **Tabla de roles verificada contra `permissions.test.ts` para las tres categorías** — `permissions.test.ts`
