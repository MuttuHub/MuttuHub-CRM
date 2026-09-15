# Design: oportunidades-comerciales — Traceable commercial cycle from Opportunity to Project

## Technical Approach

Additive extension of the existing aggregate. No new entity, no new role, no rewrite of the Kanban.
Four moves, in dependency order:

1. **Schema** — `Tarea.oportunidad_id` guarded by a composite FK, `Oportunidad.fase/fecha_adjudicacion/fecha_envio_propuesta`, `BitacoraEntrada.oportunidad_id`, `Usuario.gestiona_oportunidades`.
2. **Permissions** — a second orthogonal axis composed with the `close-phase-1` gates, surfaced to the UI as a `puede_gestionar_oportunidades` flag in the same shape as `puede_editar`.
3. **Conversion** — one dedicated, audited endpoint that writes two columns on one row and touches `tareas` zero times.
4. **UI** — one extra chip on the existing task card, derived from the DTO. No new component, no new query.

Owner-confirmed: **D2** (phase change, no `Proyecto` entity) and **D3** (orthogonal flag, not a role).
This design does not reopen them.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | `Tarea.oportunidad_id String?` + **Prisma-native composite relation** `@relation(fields: [oportunidad_id, cliente_id], references: [id, cliente_id])`, backed by `@@unique([id, cliente_id])` on `Oportunidad` | Join table `TareaOportunidad`; single-column FK + app-level check only | One task serves one opportunity — N:N buys joins with no business case. The composite FK makes the client-consistency invariant a **database** fact, not a convention someone can forget in a new route. The `@@unique` is required by Postgres (an FK must target a unique key) and doubles as the index for `Oportunidad.tareas`. |
| D2 | Add a hand-written `CHECK (oportunidad_id IS NULL OR cliente_id IS NOT NULL)` in the migration SQL | Rely on the composite FK alone; `MATCH FULL` on the FK | **The FK alone is not enough.** Postgres FKs default to `MATCH SIMPLE`: if *any* referencing column is NULL, the constraint is **not checked**. So `oportunidad_id = 'X', cliente_id = NULL` would pass the FK and produce a commercial task outside every client scope — exactly the leak the invariant exists to stop. Prisma cannot emit `MATCH FULL`, and it does not model `CHECK` constraints, so a hand-written `CHECK` in the migration body is the supported path and survives later `migrate dev` runs. |
| D3 | Two predicates in `src/lib/permissions.ts`: `hasCommercialAccess(actor)` (read) and `canManageOpportunity(cliente, actor)` (write) | One fused predicate; flag alone with no client component | Mirrors the project's own `close-phase-1` D2 convention ("two predicates, one role list"). Splitting read from write keeps the boundary explicit at every call site and lets the flagged COLABORADOR *see* the pipeline without gaining write authority over clients they do not own. |
| D4 | Write gate **composes** the flag with the existing client gate: `hasCommercialAccess(actor) && canEditClient(cliente, actor)` | Flag alone grants commercial write everywhere | Flag-alone would **expand** privilege: a seeded COLABORADOR would suddenly write opportunities on every client in the CRM. Composing keeps today's blast radius identical and makes the flag purely a narrowing axis. The D3 seed then restores exactly what those users have today — nothing more. |
| D5 | Conversion is a dedicated `POST .../:opportunityId/convert`, not a `PATCH { fase }` | Generic PATCH; derive `fase` from `estado === 'GANADA'` | RF-C04 and the success criteria demand an *explicit, audited* action. A derived phase cannot distinguish "won" from "kicked off" and leaves nothing to audit. A dedicated verb also gives a clean 409 for the idempotent second call. |
| D6 | Conversion writes **only** `fase` + `fecha_adjudicacion` on one `oportunidades` row. Zero writes to `tareas` | Copy/move tasks to a project board; flip `Tarea.origen` | The whole point of D2: inheritance without duplication. Linked tasks are already in the Kanban — `oportunidad_id` never filtered them out. `origen` is explicitly NOT a commercial marker (proposal D1). |
| D7 | `fase = EJECUCION` is **terminal**: once converted, `PATCH estado` returns 409 | Allow reverting to `EN_NEGOCIACION` | **Assumption — not stated in the proposal.** A converted opportunity is an executing engagement; silently un-winning it would strand tasks whose badge says "Ejecución". Reversal is an admin/data-fix concern, not a UI affordance. |
| D8 | Keep `Oportunidad.proyectos_relacionados`, marked deprecated in a schema comment; dropped from the create/edit form, still rendered read-only when non-empty | Drop the column in this migration | **Assumption — the proposal does not rule.** Dropping it is destructive and breaks the rollback plan's "additive only" guarantee. Deprecate now, drop in a follow-up change once the data is confirmed migrated or worthless. |
| D9 | Widen `AuditAccion` with `"convertir"` and `AuditEntidad` with `"oportunidad"` | Reuse `accion: "editar"` | Direct precedent: `close-phase-1` D10 already widened `AuditAccion` for `"exportar"`. A distinct verb lets the auditor filter conversions without parsing `cambios`. |

## Data Model

```prisma
model Oportunidad {
  // ... existing fields unchanged ...
  fase                   FaseOportunidad @default(PROSPECCION)
  fecha_adjudicacion     DateTime?       // set once, by the convert endpoint
  fecha_envio_propuesta  DateTime?       // RF-C03: fixed; NOT fecha_ultima_gestion
  /// @deprecated D8 — superseded by fase + Tarea.oportunidad_id. Read-only in the UI.
  proyectos_relacionados String?

  tareas   Tarea[]
  bitacora BitacoraEntrada[]

  @@unique([id, cliente_id])   // composite FK target (D1)
  @@index([cliente_id, estado])
}

enum FaseOportunidad { PROSPECCION EJECUCION }

model Tarea {
  // ... existing fields unchanged ...
  oportunidad_id String?

  cliente     Cliente?     @relation(fields: [cliente_id], references: [id])
  oportunidad Oportunidad? @relation(fields: [oportunidad_id, cliente_id],
                                     references: [id, cliente_id],
                                     onDelete: NoAction, onUpdate: NoAction)

  @@index([oportunidad_id])
}

model Usuario {
  // ... existing fields unchanged ...
  gestiona_oportunidades Boolean @default(false)   // D3 — orthogonal to rol
}

model BitacoraEntrada {
  // ... existing fields unchanged ...
  oportunidad_id String?
  oportunidad    Oportunidad? @relation(fields: [oportunidad_id, cliente_id],
                                        references: [id, cliente_id],
                                        onDelete: NoAction, onUpdate: NoAction)
}
```

`cliente_id` is deliberately shared between the `cliente` and `oportunidad` relations — that sharing *is* the
invariant. `onDelete/onUpdate: NoAction` is required on the composite relation: two relations overlapping on one
scalar create conflicting cascade paths, which Prisma rejects. Soft delete (`deleted_at`) is the project's
deletion model anyway, so `NoAction` costs nothing.

> **Verify before coding (first task of the change):** run `npx prisma validate` on the schema above. If Prisma
> refuses the shared-scalar composite relation, fall back to a single-column `oportunidad_id` relation in the
> schema plus a hand-written `ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_cliente_fkey" FOREIGN KEY
> ("oportunidad_id", "cliente_id") REFERENCES "oportunidades"("id", "cliente_id")` in the migration. The DB-level
> guarantee is identical; only the source of truth moves. The `CHECK` of D2 is required either way.

**Note the asymmetry:** `BitacoraEntrada.cliente_id` is `NOT NULL`, so the MATCH SIMPLE hole of D2 does not exist
there. The `CHECK` is needed on `tareas` only.

## Migration

`prisma/migrations/2026xxxxxxxxxx_oportunidades_comerciales/migration.sql` — additive, reversible:

```sql
CREATE TYPE "FaseOportunidad" AS ENUM ('PROSPECCION', 'EJECUCION');

ALTER TABLE "oportunidades"
  ADD COLUMN "fase" "FaseOportunidad" NOT NULL DEFAULT 'PROSPECCION',
  ADD COLUMN "fecha_adjudicacion" TIMESTAMP(3),
  ADD COLUMN "fecha_envio_propuesta" TIMESTAMP(3);
CREATE UNIQUE INDEX "oportunidades_id_cliente_id_key" ON "oportunidades"("id", "cliente_id");

ALTER TABLE "tareas" ADD COLUMN "oportunidad_id" TEXT;
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_cliente_fkey"
  FOREIGN KEY ("oportunidad_id", "cliente_id")
  REFERENCES "oportunidades"("id", "cliente_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- D2: MATCH SIMPLE skips the FK when cliente_id is NULL. Close the hole.
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_requiere_cliente"
  CHECK ("oportunidad_id" IS NULL OR "cliente_id" IS NOT NULL);
CREATE INDEX "tareas_oportunidad_id_idx" ON "tareas"("oportunidad_id");

ALTER TABLE "bitacora_entradas" ADD COLUMN "oportunidad_id" TEXT;
ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "bitacora_oportunidad_cliente_fkey"
  FOREIGN KEY ("oportunidad_id", "cliente_id")
  REFERENCES "oportunidades"("id", "cliente_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- D3 seed: keep today's commercial users working after deploy.
ALTER TABLE "usuarios"
  ADD COLUMN "gestiona_oportunidades" BOOLEAN NOT NULL DEFAULT false;

UPDATE "usuarios" u SET "gestiona_oportunidades" = true
WHERE u."rol" = 'COLABORADOR'
  AND EXISTS (
    SELECT 1 FROM "clientes" c
    JOIN "oportunidades" o ON o."cliente_id" = c."id" AND o."deleted_at" IS NULL
    WHERE c."responsable_id" = u."id" AND c."deleted_at" IS NULL
  );
```

Non-COLABORADOR roles need no seed — `hasCommercialAccess` short-circuits on `canManageAny(rol)`.

**No backfill of `Tarea.oportunidad_id`** (proposal D1, confirmed). `origen = CRM` does not identify commercial
tasks — it only says "created from the CRM side", which includes execution tasks. Any heuristic backfill would
either link the wrong tasks (silent corruption of the new invariant) or need manual review of every row anyway.
**Accepted impact:** every commercial task that exists today lands with `oportunidad_id = NULL`. It stays in the
Kanban exactly as it is, with no opportunity chip, until someone links it from the opportunity view. Traceability
starts at deploy, not retroactively. The UI must therefore ship the "link existing task" affordance in the same
release — without it there is no path out of the NULL state.

## Permissions

```ts
// src/lib/permissions.ts — same file, same style as canManageAny/canEditClient
export type CommercialActor = PermissionActor & { gestiona_oportunidades: boolean };

/** READ axis: who may see the commercial cycle at all (RNF-C02). */
export function hasCommercialAccess(actor: CommercialActor): boolean {
  return canManageAny(actor.rol) || actor.gestiona_oportunidades;
}

/** WRITE axis: commercial access AND the existing client write boundary (D4). */
export function canManageOpportunity(
  cliente: { responsable_id: string },
  actor: CommercialActor,
): boolean {
  return hasCommercialAccess(actor) && canEditClient(cliente, actor);
}
```

- **Deliberate deviation from `close-phase-1`:** reads are global for clients and tasks, but **not** for
  opportunities. RNF-C02 and the success criteria explicitly require "no ve ni edita". `hasCommercialAccess` is
  role/flag-only — never per-client — so the deviation is one predicate wide, not a new scoping mechanism.
- **UI surface:** the client payload gains `puede_gestionar_oportunidades: boolean`, computed exactly like
  `puede_editar` (`canManageOpportunity(cliente, actor)`), no extra query — `CLIENT_BASE_SELECT` already carries
  `responsable_id`. `client-sheet.tsx:186-188` switches `readOnly={cliente.puede_editar === false}` →
  `readOnly={cliente.puede_gestionar_oportunidades === false}`, and the *Oportunidades* tab is hidden entirely
  when `hasCommercialAccess` is false (server is still the authority — the routes 403 regardless).
- **Actor plumbing:** `requireApiUser()` returns the full `Usuario` row, so `gestiona_oportunidades` is already
  in scope at every call site. No session/JWT change.
- **Dashboard pipeline:** `dashboard/pipeline/route.ts` aggregates `Oportunidad`. It must gate on
  `hasCommercialAccess` and return zeroed/hidden commercial aggregates otherwise — otherwise the flag leaks the
  numbers it was meant to hide.

## Conversion Flow (D2, confirmed)

```
POST /api/v1/clients/:id/opportunities/:opportunityId/convert
  │
  ├─ requireApiUser  ──────────────────────────────► 401
  ├─ canManageOpportunity(cliente, actor) ─────────► 403
  ├─ opportunity exists, cliente_id matches ───────► 404
  ├─ estado !== 'GANADA'  ─────────────────────────► 409 "Solo se adjudica una oportunidad GANADA."
  ├─ fase === 'EJECUCION' ─────────────────────────► 409 "Esta oportunidad ya fue adjudicada."
  │
  └─ tx: UPDATE oportunidades SET fase='EJECUCION', fecha_adjudicacion=now() WHERE id=:opportunityId
         logAudit({ entidad: "oportunidad", entidad_id, accion: "convertir",
                    cambios: { fase: { de: "PROSPECCION", a: "EJECUCION" }, estado: "GANADA" } })
```

**Nothing else happens.** `tareas` is not written, not moved, not re-flagged.

```
   Oportunidad (fase)                     Tablero de Seguimiento (Kanban)
   ┌──────────────────┐                   ┌─────────────────────────────┐
   │ PROSPECCION      │──┐                │  card  [Cliente] [Prospección] │
   │ estado: EN_NEG.  │  │ oportunidad_id │                             │
   └──────────────────┘  ├───────────────►│  same rows, same columns,   │
   ┌──────────────────┐  │  (unchanged)   │  same DnD, same filters     │
   │ EJECUCION        │──┘                │  card  [Cliente] [Ejecución]  │
   │ estado: GANADA   │                   └─────────────────────────────┘
   └──────────────────┘
        only the chip changes
```

The tasks were already on the board before conversion — `oportunidad_id` never filtered anything out. Conversion
changes one derived label, which is precisely what "hereda los datos base sin duplicarlos" means.

`fecha_envio_propuesta` (RF-C03): auto-set to `now()` on the **first** transition `estado → PRESENTADA` *when
currently null*; an explicit body value always wins; a generic PATCH never clears it implicitly. Unlike
`fecha_ultima_gestion` it is never rewritten by a later PATCH.

## Kanban Differentiation (RNF-C01)

| Layer | Change |
|---|---|
| `src/lib/api/crm.ts` | `TASK_SELECT` gains `oportunidad: { select: { id: true, nombre: true, fase: true } }` — one join, same pattern as `cliente`. |
| `TaskItem` / `toTaskItem` | Flat fields matching the existing DTO style: `oportunidad_id`, `oportunidad_nombre`, `oportunidad_fase: FaseOportunidad \| null`. |
| `src/components/kanban/task-card.tsx` | `CardTask` (line ~25) gains the three fields; the badge row (lines 83-88) renders a second chip **next to** the existing rose `cliente_nombre` chip: `PROSPECCION` → amber chip "Prospección" (`Target` icon); `EJECUCION` → emerald chip "Ejecución" (`Rocket` icon); `null` → nothing. |
| `src/app/api/v1/tasks/route.ts` | New `oportunidad` filter → `where.oportunidad_id`, placed beside `filters.cliente` (line 150). New `oportunidad_id` in POST/PATCH schemas with the API-level invariant check (below). |

No new component, no new prop drilling, no new query: the chip is a pure derivation of the DTO already in scope.

**API-level invariant** (first line of defence; the FK is the last): on task create/patch, if `oportunidad_id` is
present, load the opportunity and 400 with `"La oportunidad no pertenece a este cliente."` when
`oportunidad.cliente_id !== cliente_id`. A bare P2003 from Postgres is a 500-shaped surprise, not a usable error.

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | All model changes above + `FaseOportunidad` enum. |
| `prisma/migrations/2026xxxx_oportunidades_comerciales/migration.sql` | Create | DDL + `CHECK` + D3 seed. |
| `src/lib/permissions.ts` | Modify | `CommercialActor`, `hasCommercialAccess`, `canManageOpportunity`. |
| `src/lib/permissions.test.ts` | Modify | New matrix cells (the change's safety net — TDD first). |
| `src/lib/api/crm.ts` | Modify | `TASK_SELECT` + `TaskItem` + `toTaskItem` opportunity fields. |
| `src/lib/api/audit.ts` | Modify | Widen `AuditEntidad` (`"oportunidad"`) and `AuditAccion` (`"convertir"`). |
| `src/app/api/v1/clients/[id]/opportunities/route.ts` | Modify | GET gated by `hasCommercialAccess`; POST by `canManageOpportunity`; `fecha_envio_propuesta` in the schema. |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/route.ts` | Modify | Same gates; `fecha_envio_propuesta` write-once rule; 409 on `estado` change when `fase = EJECUCION` (D7). |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.ts` | Create | D5 endpoint. |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/tasks/route.ts` | Create | List + create tasks from the opportunity (`cliente_id` forced from the opportunity — the invariant cannot be violated from this path). |
| `src/app/api/v1/tasks/route.ts` | Modify | `oportunidad` filter, `oportunidad_id` in POST + invariant check. |
| `src/app/api/v1/tasks/[id]/route.ts` | Modify | `oportunidad_id` in PATCH + invariant check; opportunity fields on the detail response. |
| `src/app/api/v1/clients/route.ts`, `clients/[id]/route.ts` | Modify | Emit `puede_gestionar_oportunidades`. |
| `src/app/api/v1/clients/[id]/bitacora/route.ts` | Modify | Optional `oportunidad_id` + same invariant check. |
| `src/app/api/v1/dashboard/pipeline/route.ts` | Modify | Gate commercial aggregates on `hasCommercialAccess`. |
| `src/components/crm/entity-dialogs.tsx` | Modify | Opportunity lifecycle view: estado, fase, `fecha_envio_propuesta`, linked tasks, bitácora, Convert action, "link existing task". `proyectos_relacionados` → read-only (D8). |
| `src/components/crm/client-sheet.tsx` | Modify | Tab visibility + `readOnly` from the new flag. |
| `src/components/kanban/task-card.tsx` | Modify | Opportunity chip (RNF-C01). |
| `src/hooks/crm.ts` | Modify | DTO types: `puede_gestionar_oportunidades`, opportunity fields on `TaskItem`. |
| `src/lib/openapi/paths/clients.ts`, `tasks.ts` | Modify | Contracts for the new fields and the convert endpoint. |
| `src/app/api/v1/.../opportunities/*.test.ts` | Modify/Create | Gate matrix, invariant, convert idempotency. |
| `e2e/oportunidad-ciclo.spec.ts` | Create | Create opportunity → task from opportunity → PRESENTADA (fecha fija) → GANADA → convert → chip flips to Ejecución. |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (RED first) | `hasCommercialAccess` / `canManageOpportunity` full matrix: 4 roles × flag on/off × responsable yes/no | `src/lib/permissions.test.ts` — extend the existing matrix, do not fork it. |
| Integration | **Invariant**: task with `cliente_id` ≠ `oportunidad.cliente_id` → 400 from the API **and** rejected by the DB when the API check is bypassed | `tasks/route.test.ts` + one raw-SQL test asserting both the composite FK *and* the `CHECK` (insert `oportunidad_id` with `cliente_id = NULL` must fail — that case passes the FK alone). |
| Integration | Commercial gate: COLABORADOR without the flag, responsable of the client → 403 on GET and PATCH of opportunities, **200 on their own execution tasks** | `opportunities/route.test.ts` — the second half is the regression guard against over-gating. |
| Integration | Convert: 409 when not `GANADA`, 409 on repeat, one `auditoria` row, linked tasks unchanged (assert `tareas.updated_at` untouched) | `convert/route.test.ts`. |
| Integration | Migration seed correctness | Test asserting the `UPDATE` predicate selects exactly the COLABORADORES responsible for clients with live opportunities. |
| Component | Chip renders per `oportunidad_fase`, absent when null | `task-card.test.tsx`. |
| E2E | Full cycle | `e2e/oportunidad-ciclo.spec.ts`. |
| Sentinel | `documents.test.ts` family passes **unmodified** (carried over from `close-phase-1`) | Diff check in the PR template. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration
boundary. The security surface of this change is authorization and referential integrity, both covered above.

## Implementation Order (risk-minimising)

1. **Stabilise the base.** Commit the uncommitted opportunities CRUD and rebase on `close-phase-1`. Nothing below
   is safe on a dirty tree — the commercial gate has to replace `getClientForWrite` calls that only exist in
   uncommitted code.
2. **Schema + migration + invariant tests.** Purely additive: every column is nullable or defaulted, so the
   Kanban keeps working with zero code changes. `prisma validate` gate (D1 fallback) resolves here, before any
   route depends on the shape.
3. **Permissions.** `permissions.ts` + matrix tests + route gates + `puede_gestionar_oportunidades` emission.
   Ships **with** the admin toggle (see risks) — never before it.
4. **Task↔Opportunity linking.** API invariant, `oportunidad` filter, tasks-from-opportunity route.
5. **Conversion + audit.** Depends on 2 (`fase`) and 3 (gate).
6. **UI.** Opportunity lifecycle view, Kanban chip, tab visibility. Last, because it is the only layer that
   cannot corrupt data — and by then every contract it consumes is frozen.

Steps 2 and 3–6 are naturally separable PRs. Step 2 alone is a deployable no-op; steps 3+4 are a coherent slice;
steps 5+6 close the cycle. `sdd-tasks` should forecast against the 400-line budget with that split in mind.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Seed leaves a COLABORADOR locked out**: the D3 seed only flags those responsible for clients that *already have* an opportunity. A COLABORADOR responsible for a client with **zero** opportunities can no longer create the first one — a silent capability loss the proposal's seed does not cover | High | Ship an admin toggle for `gestiona_oportunidades` in `/administracion` **in the same release** as the gate (step 3). Recommend running the seed `SELECT` in production *before* deploy and reviewing the list with the owner. |
| Prisma rejects the shared-scalar composite relation | Med | Fallback documented in the Data Model section; `prisma validate` is the first task of step 2. Equivalent DB guarantee either way. |
| `MATCH SIMPLE` partial-NULL hole | Med | The `CHECK` of D2 + an explicit test that inserts `oportunidad_id` with `cliente_id = NULL`. This case **passes the FK** — without the dedicated test, the hole reopens unnoticed. |
| Pipeline dashboard leaks commercial figures the flag hides | Med | Explicit gate in `dashboard/pipeline/route.ts` (step 3), with a test. |
| No backfill → existing commercial tasks are invisible to the new traceability | Med (accepted) | Ship the "link existing task" affordance in step 6. Communicate to the commercial team that pre-deploy tasks need one manual link. |
| `close-phase-1` collision | Med | The commercial gate rides the `puede_editar` pattern (`puede_gestionar_oportunidades`, computed in the same query, server as authority) — no second permission mechanism. |
| `AuditEntidad` widening touches the audit reader UI | Low | `audit-log-section.tsx` maps entity labels; add `"oportunidad"` there in the same commit as the type widening. |

## Assumptions Taken (not resolved by the proposal)

- **D7** — `fase = EJECUCION` is terminal and freezes `estado` at `GANADA`. Proposal is silent on reversal.
- **D8** — `proyectos_relacionados` is deprecated-but-kept, read-only in the UI. Proposal lists it as redundant
  but does not rule on dropping it.
- **D4** — the write gate composes with `canEditClient` rather than replacing it. Proposal states the effective
  rule as `isFullAccess(u.rol) || u.gestiona_oportunidades`, which read literally would *grant* flagged
  COLABORADORES write access to every client's opportunities. This design reads that as the commercial *axis*,
  not the complete gate, to avoid a privilege expansion the proposal clearly did not intend.
- **Read gating of opportunities** deviates from `close-phase-1`'s global-read direction. Justified by the
  explicit success criterion ("no ve ni edita"), but it is a direction reversal worth the owner's eye.

## Open Questions

- [ ] `prisma validate` acceptance of the shared-scalar composite relation (D1) — resolve in step 2, fallback ready.
- [ ] Should the admin toggle for `gestiona_oportunidades` be part of this change or a follow-up? This design
      says **part of it** (lockout mitigation) — it adds scope the proposal did not budget for.

---

**Next step**: `sdd-tasks`.
