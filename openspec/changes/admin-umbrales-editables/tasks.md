# Tasks: admin-umbrales-editables — Umbrales del semáforo editables en Administración

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120-180 (`umbrales-section.tsx` + `umbrales-section.test.tsx` only — no server-side files touched, backend already complete since F1.4) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single slice, single commit |
| Delivery strategy | ask-on-risk (session default) — not triggered at this size |

### Suggested Work Units

| Unit | Goal | Focused test command | Rollback boundary |
|------|------|-----------------------|--------------------|
| 1 | `umbrales-section.tsx` — `Draft`/`umbralesToDraft`/`draftToUmbrales`/`validationErrors` cover `indicador`; new "Indicadores" card | `npx vitest run src/components/admin/umbrales-section.test.tsx` | Revert the component file; `PUT /api/v1/settings` keeps preserving stored `indicador` exactly as it does today — zero blast radius outside this one file |

## Slice A: Indicador band editable in `UmbralesSection`

- [x] A.1 RED: `umbrales-section.test.tsx` — extended the mocked `useSettings()` snapshot with `semaforo_umbrales.indicador: { verde: 0.9, amarillo: 0.6 }`; asserted the two new inputs render pre-filled with `90`/`60`. Confirmed RED: 4 of 8 tests failed (missing inputs, missing `indicador` in payload, missing validation) before implementation.
- [x] A.2 GREEN: added `indicador_verde`/`indicador_amarillo` to `Draft`; extended `umbralesToDraft` to populate them from `u.indicador`; rendered the third card in the existing `grid gap-4 lg:grid-cols-2`, same `Input`/`Label` shape as the Técnico card.
- [x] A.3 RED: extended the test — edit both new inputs and click "Guardar cambios"; asserted `useSaveSettings().mutate` was called with `semaforo_umbrales.indicador` as ratios. Included in the same RED run as A.1 (same file, one test run).
- [x] A.4 GREEN: extended `draftToUmbrales` to parse `indicador_verde`/`indicador_amarillo` into `indicador: { verde, amarillo }`, same `Number(...)/100` and non-finite → `null` behavior as the other four fields.
- [x] A.5 RED: added a case setting `indicador_amarillo` greater than `indicador_verde`, asserting "Guardar cambios" disabled and the error message shown. Same RED run as A.1/A.3.
- [x] A.6 GREEN: added the `indicador.amarillo > indicador.verde` check to `validationErrors()`, mirroring the three existing checks and the server's own message (`route.ts:189-195`). Confirmed GREEN: 8/8 tests passing.
- [x] A.7 Manual check: new inputs are `text-[13px]` font-mono matching the pre-existing Técnico/Financiero inputs exactly (no new size pattern introduced), `h-9` height reusing the same already-accepted pattern, grid stays `lg:grid-cols-2` so the third card wraps to a new row on desktop and stacks full-width below `lg`. Verified by code review (no browser available in this session).

**Deviation from design.md**: the design's code sketch reused the Técnico card's exact label text ("Verde igual o mayor a (%)") for the Indicador-verde input. Reusing it verbatim would give two form controls on the same page the identical accessible name, which is an accessibility anti-pattern (screen-reader users can't distinguish them by name) and also made `getByLabelText` ambiguous in the existing test suite. Used `"Indicador verde igual o mayor a (%)"` / `"Indicador amarillo igual o mayor a (%)"` instead — same "igual o mayor a (%)" phrasing/pattern, disambiguated by band name. This label copy was marked as an assumption in design.md, not proposal-approved v6 copy (v6 has no editable-form copy for this band), so no proposal text was overridden.

## Phase 2: Full verification

- [x] 2.1 `npx tsc --noEmit` — 0 errors.
- [x] 2.2 `npx eslint src/components/admin/umbrales-section.tsx src/components/admin/umbrales-section.test.tsx` — 0 errors.
- [x] 2.3 `npx vitest run` (full suite) — 166 files / 1574 tests passed, no regressions; `settings/route.test.ts` unchanged at 21 tests as expected.
- [x] 2.4 Committed as a Conventional Commit on `local/todo-integrado` (no push). No AI attribution.
- [x] 2.5 Updated `odd/tasks/muttu-hub-v6-f0-f1.md`'s F1.5 line with evidence (commit hash, test counts).
