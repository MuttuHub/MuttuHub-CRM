# Proposal: close-phase-1 — Finish the global read-scope + write-boundary refactor

## Intent

Phase 1 is half-open. Reads global for tasks only; clients/dashboard/attachments still scope COLABORADOR to `responsable_id = self`. No `puede_editar` → PR 3 without PR 4 = 403-on-click. Board capped at 100 rows; filters run client-side. Exports global but unaudited.

## Scope

**In:**
- **PR 2** — emit `puede_editar` per task/client; `TASK_SELECT` adds `cliente: { select: { responsable_id: true } }`.
- **PR 3** — drop read gates (`clients/route.ts:110`, `clients/[id]/route.ts:80`); delete `resolveScope` (`dashboard.ts:23-25`); replace `getTaskForWrite` with read gate in `tasks/[id]/attachments/[attachmentId]/download/route.ts:29` (plan cites shorter path).
- **PR 4** — `useSortable({ disabled: !puede_editar })`; hide destructive buttons; disable edit fields.
- **PR 6** — server-side priority/tag/date; delete local-filter helpers (`kanban.ts:93-127`); banner; extend `logAudit` for exports.
- **PR 7** — `useInfiniteQuery` / "Cargar más".

**Hard constraint:** PR 3 + PR 4 ship together (two commits min). Else flag-gate PR 3.

**Out:** Phases 2–6; hallazgos #1–#4, #6 (only #5 via PR 6+7); `isFullAccess` rename (intentional).

## Capabilities

### New
- **`task-write-boundaries`** — server emits `puede_editar`; UI gates drag / destructive controls / edit fields. Server stays authority.
- **`global-task-board`** — global reads; server-side filters; infinite pagination; audited exports.

### Modified
None — no existing `openspec/specs/`.

## Approach

Strict TDD. `permissions.test.ts` is the safety net; `permissions.read.test.ts` lands in PR 3. `documents.test.ts` must pass unmodified — touching it = confidentiality breach. E2E: COLABORADOR sees the foreign task AND direct `PATCH` returns 403.

## Affected Areas

Permissions: `src/lib/permissions.ts`, `src/lib/api/crm.ts`, `src/lib/dashboard.ts`. Routes: `clients/route.ts`+`[id]/route.ts`, `tasks/route.ts`, `{tasks,clients}/export/route.ts`, `tasks/[id]/attachments/[attachmentId]/download/route.ts`. UI: `src/hooks/kanban.ts`, `kanban-board.tsx`. Audit: `src/lib/audit.ts`. Tests: `permissions.test.ts`, new `permissions.read.test.ts`. Docs: `README.md`, `docs/guia-demo.md`, `openapi/paths/{clients,tasks}.ts`.

## Risks

- **Privilege escalation / 403-on-click window** — TDD; `permissions.test.ts` + read-test; `documents.test.ts` unmodified = sentinel; PR 3 + PR 4 ship together.
- **100-row cap / unaudited exports** — PR 6 server filters + banner + `logAudit`; PR 7 pagination; new export test.
- **Confidentiality shift w/o sign-off** — restricted categories = only COLABORADOR fence; owner-of-data approval before deploy.
- **`isFullAccess` in 11 sites looks like regression** — note in PR.

## Rollback Plan

Revert PR series; each reverts independently. `permissions.ts`+tests stay (additive). If PR 6+7 revert but PR 3+4 keep: restore `applyLocalFilters` from git, re-cap `limit` to 100. If PR 4 reverts after PR 3: hide write controls on `useCurrentUser().rol === "COLABORADOR"`.

## Dependencies

None. `useInfiniteQuery` already in TanStack Query.

## Success Criteria

- [ ] All existing tests pass; `documents.test.ts` unmodified
- [ ] `permissions.test.ts` covers write + read cells; E2E proves COLABORADOR sees foreign task AND direct `PATCH` = 403
- [ ] Server filters return correct counts; exports inherit filters; banner when `N < M`
- [ ] Every export writes an `auditoria` row; owner-of-data sign-off recorded before merge