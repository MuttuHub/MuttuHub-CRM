# Design: proyecto-legalizacion-tab — Pestaña Legalización + registro de gasto

## Technical Approach

Four moves, in dependency order:

1. **Schema** — four nullable/default columns on `Gasto`: `tercero`, `numero_comprobante`, `observado @default(false)`, `observacion`. No new table, no CHECK (no cross-column invariant needed — `observacion` may be non-null even if `observado` is false, e.g. a note left before formally flagging; the requirement only prescribes behavior when `observado: true`, it doesn't forbid the reverse).
2. **API** — extend the existing `expenses/route.ts` (`EXPENSE_SCHEMA`, `EXPENSE_SELECT`) and `expenses/[expenseId]/route.ts` (`EXPENSE_PATCH_SCHEMA`) to carry the new fields, and compute the derived `estado_legalizacion` server-side (never in the client) by adding a `_count` of related `SoporteProyecto` filtered to `tipo: LEGALIZACION` to `EXPENSE_SELECT`.
3. **Client hook** — `useExpenses(projectId)` in `src/hooks/projects.ts` (the GET endpoint already exists; only the client hook is missing), plus a mutation hook for POST (`useCreateExpense`) that the modal calls, chained with the existing attachments upload flow when "ahora" is chosen.
4. **UI** — `tabs/legalizacion-tab.tsx` (KPIs, filters, ledger table) and a "Registrar gasto" dialog, both following the `financiero-tab.tsx` pattern from F1.1.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | `estado_legalizacion` is computed server-side in the API layer (a plain string derived from `observado` + soporte count), never stored as a column | Store `estado_legalizacion` as an enum column, updated by triggers or app logic whenever a soporte is attached/detached | A stored column requires keeping it in sync across two other write paths (`expenses` PATCH and `attachments` POST/DELETE) it doesn't own — a second source of truth for something fully derivable from data that already exists. The repo already avoids this pattern (`Gasto→linea→rubro` traceability by FK, never copied). Computing it at read time in `EXPENSE_SELECT` costs one `_count` per gasto, negligible at this data scale. |
| D2 | The "Soporte: ahora" flow is two sequential client-side calls (create gasto, then create soporte), not a new combined backend endpoint | A new `POST .../expenses-with-soporte` transactional endpoint | The two resources already have independent, tested creation endpoints (`expenses` and `attachments`). A combined endpoint would duplicate validation logic from both for a UX convenience that doesn't need atomicity: if the second call fails, the gasto still exists correctly in "Falta soporte" state — not a corrupt or partial write, just an incomplete one, exactly as if the user had chosen "después" and not yet attached anything. |
| D3 | No CHECK constraint added for the four new columns | Add `CHECK (NOT observado OR observacion IS NOT NULL)` to force an observation note whenever `observado = true` | The proposal/spec don't state this as a hard requirement, and the UI can enforce "observación required when marking observado" as form validation without a database-level invariant. Adding an unrequested CHECK here would be scope creep beyond what RF-06 asks. |

## Data Model

```prisma
model Gasto {
  // ... existing fields unchanged ...
  tercero            String?
  numero_comprobante String?
  observado          Boolean @default(false)
  observacion        String?
}
```

Migration: purely additive `ALTER TABLE gastos ADD COLUMN ...` statements, no backfill needed (all four are nullable or have a safe default).

`EXPENSE_SELECT` gains a `_count: { select: { soportes: { where: { tipo: "LEGALIZACION", deleted_at: null } } } }` (or equivalent), and the route computes:

```ts
type EstadoLegalizacion = "observado" | "con_soporte" | "falta_soporte";

function estadoLegalizacion(gasto: { observado: boolean; _count: { soportes: number } }): EstadoLegalizacion {
  if (gasto.observado) return "observado";
  return gasto._count.soportes > 0 ? "con_soporte" : "falta_soporte";
}
```

This function lives once, server-side, and its output is what both the API response and the UI's filter/chip logic consume — the client never re-implements this branching.

## File Changes

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 4 columns to `Gasto` |
| `prisma/migrations/<timestamp>_legalizacion_gasto/migration.sql` | New additive migration |
| `src/app/api/v1/projects/[id]/expenses/route.ts` | `EXPENSE_SCHEMA` (+tercero, numero_comprobante), `EXPENSE_SELECT` (+4 fields, +soporte count), compute `estado_legalizacion` in response |
| `src/app/api/v1/projects/[id]/expenses/[expenseId]/route.ts` | `EXPENSE_PATCH_SCHEMA` (+observado, observacion, tercero, numero_comprobante) |
| `src/hooks/projects.ts` | `useExpenses(projectId)`, `useCreateExpense(projectId)`, `Gasto`/`EstadoLegalizacion` types |
| `src/components/proyectos/tabs/legalizacion-tab.tsx` | New — KPIs, filter chips, ledger table |
| `src/components/proyectos/tabs/legalizacion-tab.test.tsx` | New |
| `src/components/proyectos/expense-dialog.tsx` | New — "Registrar gasto" modal |
| `src/components/proyectos/expense-dialog.test.tsx` | New |
| `src/components/proyectos/project-workspace.tsx` | Add `"legalizacion"` tab (6th tab) |
| `src/components/proyectos/project-workspace.test.tsx` | Mock + assertions for the new tab |

## Testing Strategy

Strict TDD, RED before code for each of:
1. `expenses/route.test.ts` — new fields accepted/persisted on create; `estado_legalizacion` computed correctly for the three states (falta/con soporte/observado) in list responses.
2. `expenses/[expenseId]/route.test.ts` — PATCH accepts `observado`/`observacion`/`tercero`/`numero_comprobante`; write-permission gating unchanged (still `canManageProject`).
3. `useExpenses`/`useCreateExpense` — query key shape, envelope handling (verify against the real route response shape, same caution F1.1 flagged: don't assume an envelope key without checking).
4. `legalizacion-tab.tsx` — KPI counts, filter behavior (Todos/Sin soporte/Observados), observed-row tint, horizontal scroll wrapper present.
5. `expense-dialog.tsx` — required-field validation (Rubro), "ahora" vs "después" branching, chained create-gasto-then-create-soporte call sequence (mock both hooks, assert order and error handling on the second call failing without rolling back the first).
6. `project-workspace.test.tsx` — new tab mounts only when selected.

## Risks

Same as proposal.md's Risks table — no new risks introduced at design time.

## Assumptions Taken (not resolved by the proposal)

- `numero_comprobante` and `tercero` are plain `String?`, no uniqueness or format constraint — the design brief doesn't specify a format, and the Auditoría's gap description ("Agregar tercero, numero_comprobante y estado_legalizacion") doesn't imply validation beyond presence.
- The ledger table's "mes" column is derived from `fecha_gasto` at render time (month name), not a stored field — consistent with not storing anything derivable.

## Open Questions

None blocking.
