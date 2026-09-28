```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0c3c41d21a9d8ffea72e2892d9b4777fc9f6e6b782438210af49286b71c9556b
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 11/11
test_command: "powershell.exe -NoProfile -Command \"node node_modules/vitest/vitest.mjs run src/lib/permissions.test.ts src/lib/permissions.read.test.ts prisma/invariant.test.ts 'src/app/api/v1/clients/[id]/opportunities/route.test.ts' 'src/app/api/v1/clients/[id]/opportunities/[opportunityId]/route.test.ts' 'src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts' 'src/app/api/v1/clients/[id]/opportunities/[opportunityId]/tasks/route.test.ts' src/app/api/v1/tasks/route.test.ts 'src/app/api/v1/tasks/[id]/route.test.ts' src/app/api/v1/dashboard/pipeline/route.test.ts 'src/app/api/v1/users/[id]/route.test.ts' src/app/api/v1/clients/route.test.ts 'src/app/api/v1/clients/[id]/route.test.ts' 'src/app/api/v1/clients/[id]/log/route.test.ts' src/components/kanban/task-card.test.tsx src/components/crm/entity-dialogs.test.tsx src/components/crm/client-sheet.test.tsx src/components/crm/client-sheet-write-gate.test.tsx src/hooks/kanban.test.ts\""
test_exit_code: 0
test_output_hash: sha256:89f822e3eeed268e309b401437fc372b0a37c62b5f51145417ced369cad3dafb
build_command: "npx tsc --noEmit"
build_exit_code: 0
build_output_hash: sha256:a0ce61175d92a0a3030c425d024e8413786465adf9b1a8b2634b0d9423db7709
```

## Verification Report

**Change**: oportunidades-comerciales
**Version**: N/A (no prior spec version; this is the seeding change)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 36 |
| Tasks complete | 36 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: PASSED
```text
npx tsc --noEmit -> exit 0, zero diagnostics
```

**Tests (scoped to this change's touched/created files)**: 293 passed / 0 failed / 0 skipped across 19 test files
```text
node node_modules/vitest/vitest.mjs run <19 files touched/created by this change> -> exit 0
Test Files  19 passed (19)
     Tests  293 passed (293)
```

**Full-suite safety net (context, not the pass/fail gate for this change)**: `node node_modules/vitest/vitest.mjs run`
-> exit 1, Test Files 1 failed | 114 passed (115), Tests 2 failed | 1024 passed (1026).
The 2 failures are `src/app/api/v1/documents/zip/route.test.ts` (filename-sanitization mismatch:
expects space-preserving `"Informe uno_v1.pdf"`, gets underscore `"Informe_uno_v1.pdf"`). Verified
via `git log`/`git blame` that this predates the change (introduced by commit `29a8f26`, "sanitizar
tildes y espacios en nombres de archivo") and that neither the route nor the test was touched by
any of the 3 oportunidades-comerciales commits. Pre-existing, unrelated, not a regression — matches
tasks.md's own PR1/PR2/PR3 batch notes verbatim. The scoped command above is used as the envelope's
`test_command` because it isolates this change's own pass/fail signal from that unrelated baseline
failure, per the orchestrator's explicit instruction not to flag it as a regression.

**Coverage**: Not available — no coverage tool detected in cached capabilities (Not available).

### Spec Compliance Matrix

**commercial-opportunities** (5 requirements, 5 scenarios)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Oportunidad pertenece a único Cliente (baseline) | (no scenario heading — bullets) | `prisma/schema.prisma` FK required + preexisting behavior, unregressed | COMPLIANT |
| fecha_envio_propuesta se fija una sola vez | Primer envío fija la fecha | `opportunities/route.test.ts > auto-sets fecha_envio_propuesta when created directly with estado PRESENTADA`; `[opportunityId]/route.test.ts > auto-sets fecha_envio_propuesta on the first transition to PRESENTADA` | COMPLIANT |
| fecha_envio_propuesta se fija una sola vez | Actualización posterior no altera la fecha fijada | `[opportunityId]/route.test.ts > does not overwrite an already-fixed fecha_envio_propuesta on a later PATCH` | COMPLIANT |
| Bitácora de comunicación por oportunidad | (no scenario heading — bullets) | `clients/[id]/log/route.test.ts` (accepts `oportunidad_id`, rejects cross-client) | COMPLIANT |
| Vista de ciclo de vida de la oportunidad | (no scenario heading — bullets) | `entity-dialogs.test.tsx` (estado/fase/fecha rendered) + `opportunities/[opportunityId]/tasks/route.test.ts` (linked tasks) + `log/route.test.ts` (bitácora) | PARTIAL — see WARNING-2 |
| Conversión a EJECUCION por cambio de fase — D2 | Conversión exitosa | `convert/route.test.ts > converts a GANADA opportunity: sets fase=EJECUCION, fecha_adjudicacion, and audits — tareas untouched` | COMPLIANT |
| Conversión a EJECUCION por cambio de fase — D2 | Conversión bloqueada si no está GANADA | `convert/route.test.ts > returns 409 when the opportunity is not GANADA` | COMPLIANT |
| Conversión a EJECUCION por cambio de fase — D2 | Usuario sin canManageOpportunities no puede convertir | `convert/route.test.ts > returns 403 when the user lacks canManageOpportunity` | COMPLIANT |

**opportunity-access-control** (3 requirements, 3 scenarios)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| canManageOpportunities es ortogonal al rol | (no scenario heading — bullets) | `permissions.test.ts > hasCommercialAccess` + `> canManageOpportunity` (full 4-role × flag × responsable matrix) | COMPLIANT |
| Migración siembra el flag para evitar lockout | Seed de la migración | `prisma/invariant.test.ts > flags exactly the COLABORADOR responsible for a client with a live Oportunidad, not the one without` | COMPLIANT |
| Migración siembra el flag para evitar lockout | Sin oportunidades no hay seed | same test (asserts `withoutOpportunity === false`) + `> does not flag a COLABORADOR whose client's only Oportunidad is soft-deleted` | COMPLIANT |
| Negación de acceso sin el flag | Ejecutor de campo sin el flag | `opportunities/route.test.ts` (403 without flag) + `tasks/route.test.ts` regression guard (COLABORADOR without flag still creates own execution task, 200) | COMPLIANT |

**opportunity-task-linking** (3 requirements, 3 scenarios)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Tarea.oportunidad_id nullable FK con invariante — no negociable | Vínculo válido | `prisma/invariant.test.ts > accepts a Tarea with oportunidad_id set and a matching cliente_id (control case)`; `opportunities/[opportunityId]/tasks/route.test.ts > creates a task inheriting cliente_id and oportunidad_id` | COMPLIANT |
| Tarea.oportunidad_id nullable FK con invariante — no negociable | Vínculo cruzado entre clientes es rechazado | `prisma/invariant.test.ts > rejects a Tarea with oportunidad_id set and cliente_id NULL` (DB CHECK); `tasks/route.test.ts` + `tasks/[id]/route.test.ts` (400 API-level) | COMPLIANT |
| Tarea.oportunidad_id nullable FK con invariante — no negociable | Sin backfill de tareas existentes (D1) | Static: `migration.sql` has zero `UPDATE`/backfill statement touching `tareas.oportunidad_id` — only the D3 `usuarios` seed exists | COMPLIANT (static evidence) |
| Filtrado y creación de tareas desde la oportunidad | (no scenario heading — bullets) | `tasks/route.test.ts` (`oportunidad_id` filter) + `opportunities/[opportunityId]/tasks/route.test.ts` (create forces cliente_id/oportunidad_id from URL) | COMPLIANT |
| Distinción visual en el tablero — RNF-C01 | (no scenario heading — bullets) | `task-card.test.tsx > TaskCard — opportunity phase chip (RNF-C01)` (amber/emerald/none, 3 tests) | COMPLIANT |

**Compliance summary**: 11/11 scenarios compliant (0 UNTESTED, 0 FAILING). 1 non-scenario requirement (Vista de ciclo de vida) is PARTIAL at the UI-rendering layer — see WARNING-2; its underlying data endpoints are independently COMPLIANT.

### Correctness (Static + Dynamic Evidence)
| Decision/Requirement | Status | Notes |
|---|---|---|
| D1 — composite FK `(oportunidad_id, cliente_id) → Oportunidad(id, cliente_id)` | Implemented | `schema.prisma` shared-scalar relation + `@@unique([id, cliente_id])`; matches design.md verbatim. |
| D2 — hand-written `CHECK` closing the MATCH SIMPLE hole | Implemented | `migration.sql`: `tareas_oportunidad_requiere_cliente CHECK (oportunidad_id IS NULL OR cliente_id IS NOT NULL)`; proven by a real-DB test that inserts `oportunidad_id` set + `cliente_id NULL` and asserts DB rejection. |
| D3 — `hasCommercialAccess` orthogonal flag | Implemented | `permissions.ts` matches design.md exactly: `canManageAny(rol) || gestiona_oportunidades`. |
| D4 — write gate composes flag with `canEditClient` | Implemented | `canManageOpportunity = hasCommercialAccess(actor) && canEditClient(cliente, actor)` — exact match, verified never expands privilege via the 34-case permissions matrix. |
| D5 — dedicated `POST .../convert` endpoint | Implemented | Distinct route, 401/403/404/409(x2)/200 flow matches design.md's decision table exactly. |
| D6 — conversion writes ONLY `fase`+`fecha_adjudicacion`, zero writes to `tareas` | Implemented | Route source has zero `db.tarea.*` calls; the route's own DB mock (`vi.mock("@/lib/db", ...)`) does not even stub a `tarea` model, so any accidental call would throw — a structural, not just behavioral, proof of D6. |
| D7 — `fase=EJECUCION` is terminal for `estado` | Implemented | PATCH route 409s only when `parsed.data.estado !== undefined && existing.fase === "EJECUCION"`; non-estado edits (e.g. `nombre`) on a converted opportunity still succeed, matching the design's documented scope. |
| D8 — `proyectos_relacionados` deprecated, read-only | Implemented | Editable input removed from `OportunidadFormDialog`; read-only block shown only when non-empty, both in create/edit form and lifecycle view. |
| D9 — `AuditAccion`("convertir")/`AuditEntidad`("oportunidad") widened | Implemented | `src/lib/api/audit.ts` + `src/hooks/admin.ts` + label in `audit-log-section.tsx`. |
| RF-C03 — `fecha_envio_propuesta` write-once | Implemented | Explicit body value always wins; otherwise auto-set only on first transition to `PRESENTADA` while still `null`; a later PATCH (tested with an `estado` change) never touches an already-fixed date. |
| Migration is additive/reversible | Implemented | All new columns nullable or defaulted; `CREATE TYPE`/`ADD COLUMN`/`ADD CONSTRAINT` only, no drops. |
| Sentinel: `documents.test.ts` family unmodified | Confirmed | `git log`/`git status` show zero touches by any of the 3 commits; `src/hooks/documents.test.ts` untouched and green in the full run. |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D1 fallback (single-column FK if Prisma rejects shared-scalar relation) | N/A | Not needed — Prisma accepted the shared-scalar composite relation as-is (task 0.2). |
| Read gating deviates from `close-phase-1`'s global-read direction | Yes, as designed | `hasCommercialAccess` is role/flag-only, not per-client — matches design's explicit "deliberate deviation" note. |
| Tab visibility driven by `puede_gestionar_oportunidades` vs. design's `hasCommercialAccess` | Deviation (documented) | tasks.md 5.2 literally ties BOTH tab visibility and readOnly to the single write-gate flag, narrower than design.md's prose (visibility from the read gate, readOnly from the write gate). Apply-progress flags this explicitly as a "safe-direction" deviation (hides more, never leaks more) — a flagged-but-non-responsible COLABORADOR loses tab visibility they'd have under the design's literal wording. Confirmed present in `client-sheet.tsx` as documented. Accepted as safe but is a real spec/design mismatch worth a maintainer decision if UX matters. |
| Implementation Order (schema → permissions → linking → conversion → UI) | Yes | Matches the 3-PR stacked-commit structure (PR1=Phase0+1, PR2=Phase2+3, PR3=Phase4+5) exactly. |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | PARTIAL | tasks.md carries an explicit per-task RED/GREEN annotation trail (e.g. "4.1 RED: ...", "4.2 GREEN: ...") for all 36 tasks, cross-referenced against real test files below. The `apply-progress` Engram artifact itself, however, does **not** contain the standardized "TDD Cycle Evidence" table (RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR columns) that `strict-tdd-verify.md` names as the primary artifact — see WARNING-1. |
| All tasks have tests | Yes | Every RED task in tasks.md maps to an existing, real test file confirmed by direct reads (`prisma/invariant.test.ts`, `permissions.test.ts`, `opportunities/*.test.ts`, `tasks/*.test.ts`, `convert/route.test.ts`, `task-card.test.tsx`, `entity-dialogs.test.tsx`, `users/[id]/route.test.ts`). |
| RED confirmed (tests exist) | Yes | All test files named in tasks.md exist in the working tree (verified by direct reads and `fd`/`rg`). |
| GREEN confirmed (tests pass) | Yes | 293/293 in the scoped run above; 1024/1026 in the full-suite safety net (2 pre-existing unrelated failures, confirmed via `git blame` to predate this change). |
| Triangulation adequate | Yes | Permissions matrix: 4 roles × 2 flag states × 2 responsable states = 34 cases. Invariant tests: both the rejection case and a matching control case. Seed test: both the seeded and not-seeded case, plus a soft-deleted edge case. Convert: 401/403/404/409×2/200/COLABORADOR-with-flag = 7 distinct branches. |
| Safety Net for modified files | Yes | Full-suite run (`npm test`-equivalent) executed after every batch per tasks.md's own batch notes (949->999->1024 passing across PR1->PR2->PR3), with the same 2 pre-existing failures carried forward unchanged each time. |

**TDD Compliance**: 5/6 checks fully passed, 1 PARTIAL (artifact-format gap, not a functional gap — see WARNING-1).

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~200 | permissions.test.ts, permissions.read.test.ts, audit.ts-adjacent | vitest |
| Integration (API route, mocked Prisma client) | ~85 | opportunities/*.test.ts, tasks/*.test.ts, convert/route.test.ts, log/route.test.ts, pipeline/route.test.ts, users/[id]/route.test.ts | vitest + route handlers |
| Integration (real DB, transactional rollback) | 4 | prisma/invariant.test.ts | vitest + live Postgres (Supabase dev) |
| Component | ~14 | task-card.test.tsx, entity-dialogs.test.tsx, client-sheet.test.tsx, client-sheet-write-gate.test.tsx | vitest + Testing Library |
| E2E | 0 executed (1 written, not run) | e2e/oportunidad-ciclo.spec.ts | Playwright — **not installed/executed in this sandbox**, matches the project's existing "CI only" pattern for `permisos-colaborador.spec.ts` |
| **Total (scoped)** | **293** | **19** | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in cached capabilities.

### Assertion Quality
Scanned `convert/route.test.ts`, `opportunities/[opportunityId]/tasks/route.test.ts`, `entity-dialogs.test.tsx`, `task-card.test.tsx`, `prisma/invariant.test.ts`, `permissions.test.ts` for the banned patterns in `strict-tdd-verify.md` Step 5f (tautologies, orphan empty checks, ghost loops, smoke-test-only, mock-heavy ratios).

**Assertion quality**: ✅ All assertions verify real behavior — zero tautologies, zero ghost loops, zero assertions-without-production-call found. The `convert/route.test.ts` D6 test is notable: it proves "zero writes to `tareas`" structurally, not just behaviorally — the mock for `@/lib/db` does not stub a `tarea` model at all, so any accidental `db.tarea.*` call in the route would throw and fail the test, rather than silently passing.

One coverage gap flagged separately (not an assertion-quality defect, a triangulation gap): `entity-dialogs.test.tsx` mocks `useTasksByOportunidad`/`useBitacora` with `data: []` in every test — no test renders the lifecycle dialog with a non-empty list to confirm task/bitácora items actually render. See WARNING-2.

---

### Quality Metrics
**Linter**: No errors (`npx eslint` on all 12 core changed source files — permissions.ts, all opportunities/tasks routes, crm.ts, audit.ts, entity-dialogs.tsx, client-sheet.tsx, task-card.tsx)
**Type Checker**: No errors (`npx tsc --noEmit`, whole-project, includes `e2e/**/*.ts`)

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **Apply-progress lacks the standardized "TDD Cycle Evidence" table.** `strict-tdd-verify.md` names this table (per-task RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR columns) as the primary TDD evidence artifact; the Engram `apply-progress` observation (id 527, final/merged revision) instead carries prose batch notes and tasks.md's own per-task RED/GREEN annotations. I independently reconstructed equivalent evidence by cross-referencing tasks.md's task-level annotations against real test files and actual passing execution (documented in the TDD Compliance table above), so this is a **reporting-format gap, not a functional TDD-process failure** — every task's RED test exists, every GREEN test passes, and triangulation is adequate everywhere checked. Recommend the apply phase use the literal table format in future batches so this cross-reference isn't needed.
2. **Lifecycle-view UI test only covers the empty-list case for linked tasks and bitácora.** `entity-dialogs.test.tsx`'s `OportunidadLifecycleDialog` suite mocks `useTasksByOportunidad` and `useBitacora` to always return `data: []`; no test asserts that a populated list of tasks or bitácora entries actually renders inside the dialog. The underlying data plumbing IS tested elsewhere (`opportunities/[opportunityId]/tasks/route.test.ts`, `clients/[id]/log/route.test.ts`), so this is a UI-rendering coverage gap, not a missing feature — but it means the "vista de ciclo de vida... MUST incluir... tareas vinculadas (...) y bitácora" requirement is PARTIAL at the component-test layer.
3. **Documented, pre-accepted gap (surfaced per instructions, not newly discovered)**: `GET/POST /api/v1/clients/{id}/opportunities/{opportunityId}/tasks` (created in PR2) has no OpenAPI contract registered. Confirmed by direct inspection of `src/lib/openapi/paths/clients.ts` and `tasks.ts` — no path registration for this route exists.
4. **Documented, pre-accepted gap (surfaced per instructions, not newly discovered)**: `e2e/oportunidad-ciclo.spec.ts` (task 5.6) exists, is real (not stubbed), type-checks clean, but was never executed — no dev server/DB in this sandbox, following the same "CI only" pattern already established for `permisos-colaborador.spec.ts`.
5. **`client-sheet.tsx` tab-visibility deviates from design.md's prose** (see Coherence table) — tasks.md's literal wording was followed over design.md's description. Safe-direction (hides more, never leaks more) but is a genuine spec/design divergence a maintainer should sign off on if a flagged-but-non-responsible COLABORADOR needs read-only tab visibility.

**SUGGESTION**:
1. Add at least one `entity-dialogs.test.tsx` case with non-empty `useTasksByOportunidad`/`useBitacora` mock data to close WARNING-2 and directly prove the "vista de ciclo de vida" requirement's list-rendering behavior, not just its empty state.
2. Register the OpenAPI contract for `.../opportunities/{opportunityId}/tasks` in a small follow-up, since it's the one route in this change's surface still undocumented.
3. Native `gentle-ai sdd-attempt` runtime is reported (in apply-progress) as `decision_required: true` / blocked on `changed_line_budget_exceeded` for all 3 PRs (900-line budget vs. ~1091/1101/1249 actual). This needs a maintainer-authorized `gentle-ai sdd-attempt reset` before further native attempt tooling runs cleanly — orchestrator/maintainer decision, not a code defect.
4. None of the 3 stacked branches/commits have been pushed to origin or opened as PRs yet (confirmed via `git status`/`git log` — clean local tree, branch `feat/oportunidades-comerciales-03-conversion-ui` unpushed). This is expected per the task context (local-only verification) but is the next required step before this change can be archived as delivered.

### Verdict
PASS WITH WARNINGS
All 36 tasks complete, all 11 spec requirements and 11 scenarios have passing covering tests, D1/D3/D4/D6/D7/RF-C03 all verified correct by direct source inspection plus real test execution (including a live-DB CHECK-constraint test), tsc and eslint are clean, and the only pre-existing test failures are unrelated and already documented — but ship with 5 WARNINGs (1 process/reporting gap, 1 UI test-coverage gap, 2 pre-known/accepted scope gaps, 1 design-deviation needing sign-off) that a maintainer should acknowledge before archiving.
