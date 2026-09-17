# Proposal: oportunidades-comerciales — Ciclo comercial trazable de Oportunidad a Proyecto

## Intent

El PRD pide un flujo comercial estructurado, separado del tablero de ejecución. Hoy `Oportunidad` existe (`schema.prisma:163-181`) pero está huérfana: vive solo dentro de la ficha del cliente (`entity-dialogs.tsx:293-423`), no tiene tareas amarradas, no registra comunicación ni fecha de envío, y no se convierte en nada. El equipo comercial no puede responder "¿en qué va esta propuesta y quién hizo qué?".

| RF | Estado | Hueco |
|----|--------|-------|
| RF-C01 jerarquía Cliente→Oportunidad | ✅ | — |
| RF-C02 tareas amarradas a la oportunidad | ❌ | `Tarea` solo tiene `cliente_id?`. Es el corazón faltante |
| RF-C03 trazabilidad y fecha de envío | 🟡 | `fecha_ultima_gestion` se sobreescribe en cada PATCH; bitácora cuelga de `Cliente` |
| RF-C04 conversión a proyecto | ❌ | No existe entidad `Proyecto`; solo `proyectos_relacionados String?` |
| RNF-C01 diferenciación visual | ❌ | Oportunidades nunca aparecen en el tablero |
| RNF-C02 control de acceso | 🟡 | `isFullAccess` es binario; un COLABORADOR responsable del cliente hoy gestiona sus oportunidades |

## Scope

**In:**
- `Tarea.oportunidad_id` + relación inversa `Oportunidad.tareas`; invariante cliente-consistente; filtros y creación de tarea desde la oportunidad.
- Trazabilidad: `fecha_envio_propuesta` fija, `BitacoraEntrada.oportunidad_id` nullable para comunicación, vista de ciclo de vida (estado + tareas + bitácora).
- Conversión adjudicada: acción explícita y auditada sobre la oportunidad `GANADA`.
- Acceso comercial ortogonal al rol + diferenciación visual prospección/ejecución en el tablero.

**Out:** entidad `Proyecto` con presupuesto/cronograma/indicadores; migración automática de tareas existentes a oportunidades; pipeline comercial como tablero Kanban propio; reportes/forecast de ventas; notificaciones comerciales.

## Capabilities

### New
- **`commercial-opportunities`** — ciclo de vida, fecha de envío, bitácora de comunicación, conversión adjudicada auditada.
- **`opportunity-task-linking`** — `Tarea↔Oportunidad`, invariante de cliente, visibilidad diferenciada en el tablero.
- **`opportunity-access-control`** — quién administra oportunidades, independiente de `RolUsuario`.

### Modified
None — no existe `openspec/specs/`.

## Approach

Extender la agregación existente en vez de duplicarla. `Oportunidad` ya es el contenedor natural del ciclo comercial: solo le faltan las tareas, el registro de comunicación y una transición formal de fase. TDD estricto; `permissions.test.ts` es la red de seguridad del nuevo gate.

## Decisiones abiertas (requieren validación del usuario)

**D1 — Modelo Tarea↔Oportunidad.** Recomendación: **FK nullable `oportunidad_id` en `Tarea`**, no tabla intermedia. Una tarea sirve a una sola oportunidad; N:N agrega joins sin caso de negocio. Nullable porque el Kanban ya admite tareas sin cliente. Invariante obligatorio: si `oportunidad_id` está seteado, `cliente_id` debe coincidir con `oportunidad.cliente_id` — si no, se abre un hueco de permisos (el scope de lectura se calcula por `cliente_id`). Enforce por FK compuesta `(oportunidad_id, cliente_id) → Oportunidad(id, cliente_id)` además de validación en API. **Sin backfill**: `origen=CRM` no identifica tareas comerciales; el re-vinculado es manual desde la UI.

**D2 — Conversión a proyecto sin entidad `Proyecto`.** Recomendación: **la oportunidad `GANADA` cambia de fase, no de entidad** (`fase: PROSPECCION | EJECUCION` + `fecha_adjudicacion`, acción explícita y auditada). El PRD pide "heredar los datos base del cliente y de la propuesta" — si copiamos a una entidad nueva, la herencia se vuelve duplicación y se rompe la cadena de trazabilidad que pide RF-C03. Tradeoff aceptado: se difiere el `Proyecto` formal (presupuesto, cronograma, entregables, impacto social). Si el cliente necesita esos campos, es un change posterior, no un parche acá.

**D3 — Permisos RNF-C02.** Recomendación: **flag ortogonal `Usuario.gestiona_oportunidades Boolean @default(false)`**, no rol nuevo. `rol` es un enum de valor único que ya gobierna todos los gates: meterle un eje comercial obliga a un o-esto-o-lo-otro falso (alguien puede ser comercial y ejecutor) y a migrar a todos los usuarios. Regla efectiva: `canManageOpportunities(u) = isFullAccess(u.rol) || u.gestiona_oportunidades`. Esto **elimina** el acceso actual del COLABORADOR responsable del cliente; para no dejar gente afuera en el deploy, la migración siembra `true` a los COLABORADORes responsables de clientes con al menos una oportunidad.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `prisma/schema.prisma` | Modified | `Tarea.oportunidad_id`, `Oportunidad.tareas/fase/fecha_adjudicacion/fecha_envio_propuesta`, `BitacoraEntrada.oportunidad_id`, `Usuario.gestiona_oportunidades` |
| `prisma/migrations/` | New | FK compuesta + seed del flag comercial |
| `src/app/api/v1/clients/[id]/opportunities/` | Modified | Gate comercial, conversión, tareas de la oportunidad |
| `src/app/api/v1/tasks/` | Modified | `oportunidad_id` en create/patch/filtros + invariante |
| `src/lib/api/crm.ts`, `src/lib/permissions.ts` | Modified | `canManageOpportunities` |
| `src/components/crm/entity-dialogs.tsx`, `kanban-board.tsx` | Modified | Ciclo de vida, bitácora, distintivo prospección/ejecución |
| `src/lib/audit.ts` | Modified | Auditar conversión y cambios de estado |
| `openapi/paths/` | Modified | Contratos de oportunidades y tareas |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Tarea con `cliente_id` ≠ cliente de la oportunidad → fuga de lectura | Med | FK compuesta + test de permisos dedicado |
| Colisión con `close-phase-1` (WIP: reads globales + `puede_editar`) | **Alta** | Rebase sobre `close-phase-1`; el gate comercial usa el mismo patrón `puede_editar`, no un segundo mecanismo |
| El CRUD de oportunidades está sin commitear | Med | Commitear/estabilizar antes de `sdd-apply` |
| Lockout comercial al deploy | Med | Seed del flag descrito en D3 + verificación previa |
| D2 se queda corto si el cliente sí quiere `Proyecto` | Med | Validar D2 con el owner ANTES de specs |

## Rollback Plan

Migración reversible: `oportunidad_id`, `fase`, fechas, `BitacoraEntrada.oportunidad_id` y `gestiona_oportunidades` son columnas aditivas y nullables/con default — el drop no toca datos preexistentes. Revertir la UI restaura la ficha de cliente actual. Si solo falla el gate comercial: retornar `canManageOpportunities` a `isFullAccess` sin revertir el esquema.

## Dependencies

- `close-phase-1` (`puede_editar`, reads globales) — debe mergear antes o coordinarse.
- CRUD de oportunidades actualmente sin commitear en `src/app/api/v1/clients/[id]/opportunities/`.
- Firma del owner sobre D2 y D3 antes de `sdd-spec`.

## Success Criteria

- [ ] Toda tarea comercial se crea y se lista desde su oportunidad; ninguna tarea puede apuntar a una oportunidad de otro cliente (test de invariante)
- [ ] La vista de oportunidad muestra estado, tareas, bitácora y fecha de envío fija (no sobreescrita por PATCH)
- [ ] La conversión de `GANADA` es una acción explícita, audita una fila en `auditoria` y conserva las tareas vinculadas
- [ ] Un COLABORADOR sin `gestiona_oportunidades` no ve ni edita oportunidades, aun siendo responsable del cliente; sigue viendo sus tareas de ejecución
- [ ] El tablero distingue visualmente prospección de ejecución
- [ ] `permissions.test.ts` cubre las celdas nuevas; suite existente pasa sin modificar `documents.test.ts`
