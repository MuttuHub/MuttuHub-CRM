# Delta for opportunity-access-control

> New capability — commercial access gate `canManageOpportunities` (RNF-C02), orthogonal to `RolUsuario` (D3). Seeded via migration to avoid lockout at deploy.

## ADDED Requirements

### Requirement: canManageOpportunities es ortogonal al rol

El sistema MUST exponer `Usuario.gestiona_oportunidades: Boolean @default(false)` y una regla efectiva `canManageOpportunities(u) = isFullAccess(u.rol) || u.gestiona_oportunidades`. Un COLABORADOR responsable de un cliente MUST NOT tener acceso a las oportunidades de ese cliente por el solo hecho de ser responsable — el acceso depende exclusivamente de este flag o de `isFullAccess`.

- **ADMINISTRADOR (`isFullAccess`) → `canManageOpportunities` true sin el flag** — `permissions.test.ts`
- **COLABORADOR con `gestiona_oportunidades: true` → true** — `permissions.test.ts`
- **COLABORADOR con `gestiona_oportunidades: false`, aunque sea responsable del cliente → false** — `permissions.test.ts`

### Requirement: Migración siembra el flag para evitar lockout

La migración que introduce `gestiona_oportunidades` MUST setear `true` automáticamente para todo COLABORADOR que sea responsable de al menos un cliente con al menos una oportunidad existente al momento del deploy. Todos los demás usuarios MUST quedar en `false` por defecto.

#### Scenario: Seed de la migración
- GIVEN un COLABORADOR responsable del cliente C, y C tiene al menos una oportunidad
- WHEN se ejecuta la migración
- THEN `gestiona_oportunidades` queda en `true` para ese COLABORADOR

#### Scenario: Sin oportunidades no hay seed
- GIVEN un COLABORADOR responsable únicamente de clientes sin ninguna oportunidad
- WHEN se ejecuta la migración
- THEN `gestiona_oportunidades` queda en `false` para ese COLABORADOR

### Requirement: Negación de acceso sin el flag

Un COLABORADOR sin `gestiona_oportunidades` (y sin `isFullAccess`) MUST NOT poder ver ni gestionar oportunidades de ningún cliente, incluso si es responsable de ese cliente. MUST seguir viendo y operando sus tareas de ejecución activa asignadas.

#### Scenario: Ejecutor de campo sin el flag
- GIVEN un COLABORADOR responsable del cliente C, `gestiona_oportunidades: false`
- WHEN intenta listar o ver el detalle de una oportunidad de C
- THEN la respuesta es 403, o la oportunidad no aparece en el listado
- AND sus tareas de ejecución activa asignadas en el tablero siguen siendo visibles y operables sin restricción adicional
