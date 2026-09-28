# Tasks: proyecto-soportes-tab — Pestaña Soportes (RF-04)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-650 (soportes-tab ~180, soportes-tab.test ~190, soporte-dialog ~230, soporte-dialog.test ~170, workspace wiring ~10, workspace.test ~20) — no migration, no API route, no hooks file touched |
| 400-line budget risk | Medium-High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (`soportes-tab.tsx` — list, type chip, vinculado a/autor/fecha/formato resolution, download, delete; deployable behind the new tab without a way to create soportes yet) → PR 2 (`soporte-dialog.tsx` + `project-workspace.tsx` wiring — adds "Agregar soporte" and mounts the tab) |
| Delivery strategy | ask-on-risk (per this project's cached session choice — orchestrator confirms chain strategy before apply) |
| Chain strategy | pending — orchestrator must ask the user (stacked-to-main vs feature-branch-chain vs size-exception) before apply |

Decision needed before apply: Yes.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary |
|------|------|-----------|----------------------|--------------------|
| 1 | `tabs/soportes-tab.tsx` — list, type chip, lookups, download, delete | PR 1 | `npx vitest run src/components/proyectos/tabs/soportes-tab.test.tsx` | Delete the new file; not yet wired into `project-workspace.tsx`, zero blast radius |
| 2 | `soporte-dialog.tsx` — "Agregar soporte" modal | PR 2 | `npx vitest run src/components/proyectos/soporte-dialog.test.tsx` | Delete the new file, no other file touched |
| 3 | `project-workspace.tsx` — mount the "soportes" tab (both components) | PR 2 | `npx vitest run src/components/proyectos/project-workspace.test.tsx` | Revert `TAB_VALUES`/`TabsTrigger`/`TabsContent` addition |

## Phase 1: Soportes list

- [x] 1.1 RED: `soportes-tab.test.tsx` — loading/empty/populated states; type chip renders `Verificación`/`Legalización` with the correct label; "vinculado a" resolves an activity name (mock `useActivities`), a gasto's `concepto · rubro` (mock `useExpenses`), and "Soporte general del proyecto" when both `actividad_id`/`gasto_id` are `null`; author resolves from `useUsers()` and falls back to `"—"` while pending; download link renders only when `download_url` is non-null; "Agregar soporte" button present (no dialog wiring assertion yet — that's Phase 2/3). Confirm failing. Evidence: RED observed — `Failed to resolve import "./soportes-tab"`.
- [x] 1.2 GREEN: implement `tabs/soportes-tab.tsx` per design.md's Component Structure and the `autorNombre`/`vinculadoA`/`formato` helpers in its Data Model section. Confirm passing. Deviation: `Soporte` type in `src/hooks/projects.ts` was missing `subido_por_id` even though `SUPPORT_SELECT` already returns it — added the field (no fetch/behavior change, purely a stale-type fix needed for author resolution).
- [x] 1.3 RED: extend `soportes-tab.test.tsx` — delete button calls `useDeleteAttachment`'s mutation with the right soporte id; the row disappears from the rendered list on success. Confirm failing. (Combined with 1.1/1.2 in the same RED/GREEN pass — the delete tests were authored and run together with the list tests; the implementation lacked the delete button/dialog to observe RED, then wired to observe GREEN.)
- [x] 1.4 GREEN: wire the delete control (confirm-before-delete, same inline pattern as `task-dialog.tsx`'s `DangerZone`, scoped per-row). Confirm passing. Evidence: `npx vitest run src/components/proyectos/tabs/soportes-tab.test.tsx` — 12 passed.

## Phase 2: Agregar soporte modal

- [ ] 2.1 RED: `soporte-dialog.test.tsx` — required-field validation (Tipo, Documento); "Vincular a" options swap between activities (Tipo=Verificación) and gastos (Tipo=Legalización), plus the leading "Soporte general del proyecto" option in both; Archivo/Enlace radio toggles the visible input; submitting with a valid `https://` enlace calls `useUploadAttachment`'s mutation with `url` set and `file` absent; submitting with a selected file calls it with `file` set and `url` absent; `actividad_id`/`gasto_id` are only present in the payload when "Vincular a" isn't the general option. Confirm failing.
- [ ] 2.2 GREEN: implement `soporte-dialog.tsx` per design.md's Component Structure table (D1: Archivo/Enlace radio, not the mock's "Formato" select). Confirm passing.

## Phase 3: Workspace wiring

- [ ] 3.1 RED: extend `project-workspace.test.tsx` for the `"soportes"` tab (mount-only-when-selected, mirrors every existing per-tab assertion). Confirm failing.
- [ ] 3.2 GREEN: add `"soportes"` to `TAB_VALUES`, `TabsTrigger`, `TabsContent` in `project-workspace.tsx`. Confirm passing.
- [ ] 3.3 Manual check: "Agregar soporte" CTA and delete button ≥44px (`min-h-11`), inputs ≥16px (`text-base`), the soportes list/cards don't break at 390px (no unwanted horizontal scroll on a non-tabular layout) or 1440px.

## Phase 4: Full verification

- [ ] 4.1 `npx tsc --noEmit` — 0 errors.
- [ ] 4.2 `npx eslint .` (or scoped to touched paths) — 0 problems in the diff.
- [ ] 4.3 `npm run test` (full suite) — all green, no regressions.
- [ ] 4.4 Commit as Conventional Commits on `local/todo-integrado` (no push unless the user asks). No AI attribution.
- [ ] 4.5 Update this file's checkboxes and `odd/tasks/muttu-hub-v6-f0-f1.md`'s F1.3 line with evidence.
