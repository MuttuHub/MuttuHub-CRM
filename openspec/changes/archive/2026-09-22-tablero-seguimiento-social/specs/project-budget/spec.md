# Project Budget Specification

> New capability — catálogo `Rubro` administrable, presupuesto proyectado vs. ejecutado con trazabilidad contable, y semáforo financiero bidireccional parametrizado (RF-05, RF-07, D4, D5, D10). No existe `openspec/specs/project-budget/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: Catálogo de Rubro administrable — D5

`Rubro` MUST be a catalog table (`nombre`, `activo`, `deleted_at`) — MUST NOT be a Prisma enum and MUST NOT be a free-text string. Rubros MUST be creatable/editable by an Administrador without a code deployment.

- **Rubro inactivo (`activo=false`) no aparece como opción en nuevas líneas presupuestales pero preserva las históricas** — `rubros/route.test.ts`

### Requirement: Presupuesto proyectado por Rubro — RF-01, RF-05

Every `Proyecto` MUST allow registering an initial budget disaggregated by `Rubro` (línea presupuestal: `proyecto_id`, `rubro_id`, `monto_proyectado_cop: Decimal(15,2)` — COP only, per D4).

- **Crear línea presupuestal con `rubro_id` inválido rechazada** — `budget/route.test.ts`

### Requirement: Comparación permanente proyectado vs. ejecutado — RF-05

The system MUST maintain `monto_ejecutado_cop` per línea presupuestal and MUST always expose proyectado and ejecutado together, identified by `rubro_id`, to preserve accounting traceability. Aggregation across líneas MUST group by `rubro_id`.

#### Scenario: Consulta agregada por rubro
- GIVEN un proyecto con líneas presupuestales en rubros "Personal" y "Transporte"
- WHEN se consulta el resumen presupuestal
- THEN la respuesta muestra proyectado y ejecutado separados por cada rubro, nunca mezclados

### Requirement: Semaforización financiera bidireccional — RF-07, D10

The system MUST calculate `ejecutado / proyectado` a la fecha de corte and compare it against configurable, bidirectional thresholds (organization-level default, optional per-project override) — MUST NOT hardcode cut values as code constants. Both sub-ejecución (ratio below the lower band) AND sobre-ejecución (ratio above the upper band) MUST be flagged rojo/amarillo per the configured bands — over-execution is a finding, not a success.

> Per D10, the literal band values are an unconfirmed business assumption. This requirement describes the comparison parametrically: given a configured lower-green bound `L`, upper-green bound `U`, and outer red bounds, verde requires the ratio to fall within `[L, U]`; an amarillo band surrounds `[L, U]` on either side; beyond that is rojo.

#### Scenario: Verde dentro de banda
- GIVEN `L` y `U` configurados y una razón ejecutado/proyectado dentro de `[L, U]`
- WHEN se calcula el semáforo financiero
- THEN el color es verde

#### Scenario: Rojo por sobre-ejecución
- GIVEN un umbral rojo superior configurado y una razón por encima de ese umbral
- WHEN se calcula el semáforo financiero
- THEN el color es rojo, no verde, aunque el proyecto haya ejecutado la totalidad del presupuesto y más

#### Scenario: Rojo por sub-ejecución
- GIVEN un umbral rojo inferior configurado y una razón por debajo de ese umbral
- WHEN se calcula el semáforo financiero
- THEN el color es rojo

#### Scenario: Cambio de parámetro sin despliegue
- GIVEN umbrales financieros configurados a nivel organización
- WHEN el negocio confirma nuevos cortes y se actualiza el parámetro
- THEN el semáforo refleja el nuevo corte sin requerir cambio de código ni despliegue
