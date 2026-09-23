# Project Schedule Specification

> New capability — `Meta` + `Actividad`: cronograma con línea base vs. ejecución, avance técnico ponderado y semaforización técnica (RF-02, RF-03, D2). Umbrales de semáforo tratados como parámetro configurable, nunca constante en código — ver D10. No existe `openspec/specs/project-schedule/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: Meta pertenece a un Proyecto

`Meta` MUST belong to exactly one `Proyecto` (`Meta.proyecto_id`, required FK) with invariant `Meta @@unique([id, proyecto_id])`.

- **Meta sin `proyecto_id` válido rechazada** — `projects/[id]/goals/route.test.ts`

### Requirement: Actividad indica su Meta asociada — RF-02, D2

Every `Actividad` MUST reference exactly one `Meta` (`Actividad.meta_id`, required) to allow objectively verifying whether it was completed fully. `Actividad.proyecto_id` MUST match `Meta.proyecto_id` — enforced by composite FK `(meta_id, proyecto_id) → Meta(id, proyecto_id)` plus a Postgres `CHECK` at the database level (same pattern as `Tarea↔Oportunidad`), not only API validation. `Actividad` is a new model — it MUST NOT extend `Tarea`.

#### Scenario: Actividad válida
- GIVEN una Meta M del Proyecto P
- WHEN se crea una Actividad con `meta_id = M` y `proyecto_id = P`
- THEN la operación se acepta

#### Scenario: Fuga entre proyectos rechazada — invariante crítico, no negociable
- GIVEN una Meta M del Proyecto P
- WHEN se intenta crear una Actividad con `meta_id = M` pero `proyecto_id` de otro proyecto Q (≠ P)
- THEN la base de datos rechaza el write por violación de la FK compuesta, con o sin validación de API

- **Invariante meta-proyecto cubierto por test de invariante dedicado (no solo API)** — `permissions.test.ts` o suite de invariantes equivalente

### Requirement: Actividad registra línea base vs. ejecución

`Actividad` MUST store: peso/ponderación (used for weighted progress), fecha_planificada, fecha_real (nullable until executed), porcentaje_avance.

- **Actividad participa en el cálculo ponderado solo si tiene peso registrado** — `activities/route.test.ts`

### Requirement: Cálculo del Avance Técnico (%) — RF-03

The system MUST calculate `avance_tecnico` per `Proyecto` as the weighted average of `Actividad.porcentaje_avance` using `peso` as weight over all non-deleted activities of the project: `Σ(porcentaje_avance × peso) / Σ(peso)`.

#### Scenario: Cálculo ponderado
- GIVEN un proyecto con actividades A (peso 2, avance 100%) y B (peso 1, avance 40%)
- WHEN se calcula avance_tecnico
- THEN el resultado es (100×2 + 40×1) / 3 = 80%

#### Scenario: Proyecto sin actividades
- GIVEN un proyecto sin actividades registradas
- WHEN se calcula avance_tecnico
- THEN el resultado es 0%, nunca una división por cero

### Requirement: Semaforización técnica con umbral parametrizado — RF-03, D10

The system MUST compare avance real / avance planificado a la fecha de corte against thresholds stored as configurable parameters (organization-level default, optional per-project override) — MUST NOT hardcode the cut values as code constants. Given a configured green threshold `T_verde` and red threshold `T_rojo` (`T_rojo < T_verde`): when the ratio is ≥ `T_verde` the color MUST be verde; when < `T_rojo`, rojo; otherwise amarillo.

> Per D10, the literal cut values are flagged as an unconfirmed business assumption (the source document says "Pendiente por definir" for both bands). This requirement intentionally describes threshold comparison parametrically so it stays correct regardless of the final confirmed values — implementers MUST read the parameters from configuration, never inline them.

#### Scenario: Verde por parámetro configurado
- GIVEN `T_verde` configurado en un valor X y una razón avance real/planificado ≥ X
- WHEN se calcula el semáforo
- THEN el color es verde

#### Scenario: Rojo por parámetro configurado
- GIVEN `T_rojo` configurado en un valor Y y una razón < Y
- WHEN se calcula el semáforo
- THEN el color es rojo

#### Scenario: Amarillo entre bandas
- GIVEN una razón entre `T_rojo` y `T_verde` (Y ≤ razón < X)
- WHEN se calcula el semáforo
- THEN el color es amarillo

#### Scenario: Cambio de parámetro sin despliegue
- GIVEN un umbral configurado a nivel organización
- WHEN el negocio confirma un nuevo corte y se actualiza el parámetro
- THEN el semáforo refleja el nuevo corte sin requerir cambio de código ni despliegue
