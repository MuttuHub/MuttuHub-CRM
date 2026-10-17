# Subir documentos generales del proyecto

Pre-launch feature, approved by the user on 2026-10-17 after the launch window moved to Sunday night (G-2). Branch
`feat/project-documents-upload`, worktree `MuttuHub-CRM-worktrees/doc-upload`. It merges into `feat/projects-v2`
before the rc1 tag.

## Objective

Let the team attach general project documents (contract, agreement, kickoff minutes), as a file or a link, from the
ficha's Documentos tab, and open them later.

## Problem and why

Found in the manual walkthrough. The Documentos tab (`src/components/proyectos/ficha/ficha-documentos.tsx`) groups
supports by origin, and its «Proyecto» group is always empty: no screen creates project-level supports. The server
already has the pieces:
- `signarSubidaSoporte` and `validarSoporte` in `src/lib/api/soportes.ts`;
- the storage target `proyecto_soporte` in `src/lib/api/signed-upload.ts`;
- the `soportes_proyecto` table, where a row with no `avance_id`, `medicion_id` or `gasto_id` means origin «proyecto».

Missing:
- a create endpoint;
- a way to open a project-origin support, since the tab only opens avance and gasto supports or external links;
- the UI.

## Scope

- **In:**
  - create a project-level support, as a file through the signed upload or as an external link;
  - open it through a signed URL with an access audit, following how avance and gasto supports do it;
  - soft-delete with an audit entry;
  - the «Subir documento» UI in the Documentos tab.
- **Out:**
  - editing a support;
  - versions;
  - linking it to the global Documentos module.

## Constraints

- **No migration, no schema change.** Use `soportes_proyecto` as it is. If a needed column is missing, STOP and
  report.
- **Permissions.** Create and delete are allowed to managers (ADMINISTRADOR, GERENCIA) and to a COORDINADOR who is
  an active member. They are allowed in BORRADOR, EN_EJECUCION and SUSPENDIDO, and refused in CERRADO and CANCELADO.
  Reuse the existing predicates in `src/lib/permissions.ts` and the `loadProjectScoped` membership resolution; never
  trust client input. A COORDINADOR can delete only what they uploaded, while managers can delete any project
  document.
- **Read.** Same audience as the `GET /projects/:id/supports` list. Project-origin documents carry no third-party
  financial data, so `puedeVerSoportes` does not hide them, which matches the list's current filter.
- **File hardening.** The same as other supports: allowed name and MIME, size cap, a storage key bound to the
  project, and the real stored size checked.
- **Audit.** Create and delete write an audit entry. Opening a file writes to `acceso_soportes` if that is how the
  other origins are audited; follow them.

## Tasks

- [ ] **DOC1a** API:
  - `POST /api/v1/projects/[id]/supports` creates a project-origin support (file or link) through
    `signarSubidaSoporte` and `validarSoporte`;
  - a download route returns the signed URL of a project-origin file;
  - `DELETE` soft-deletes.

  Route tests cover roles, states, membership, validation, audit, and the 404 for supports of other projects or
  origins. Register the routes in OpenAPI.
- [ ] **DOC1b** UI:
  - a «Subir documento» button in the Documentos tab, for allowed users and states;
  - a dialog to pick a file or paste a link, with a name;
  - project-origin documents open from the tab;
  - a delete action with confirmation, for allowed users;
  - invalidate the supports query after changes.

  Component and hook tests.
- [ ] **DOC1c** Verification:
  - the full suites of the touched areas;
  - `tsc` and `eslint`;
  - a manual check by the user in the browser on PRY-2026-005.

Each task: RED, then GREEN, then a work-unit commit, then evidence here.

## Progress

- 2026-10-17: document created; worktree from `feat/projects-v2` at `42fa9d2`. Route: delegated direct, one writer.
- 2026-10-17: **BLOCKED before DOC1a RED.** The database refuses project-origin rows. CHECK
  `soportes_proyecto_padre_check` is `num_nonnulls(avance_id, medicion_id, gasto_id) = 1`
  (`prisma/migrations/20261010120000_v2_gastos_validacion/migration.sql:145-147`; no later migration changes it), and the
  invariant test `prisma/gastos.invariant.test.ts:262` asserts that a soporte without any parent is rejected. A create
  endpoint would fail on every insert. The «proyecto» branch of `GET /supports` is unreachable for the same reason.
  Building the feature needs a migration that relaxes the CHECK to `<= 1`, plus an update to that invariant test, which
  the constraints forbid. No source was written.

## Next step

**Decision (user, 2026-10-17): allow the migration.** It is migration 26,
`20261017120000_v2_soportes_proyecto_origen`, idempotent, relaxing the CHECK to
`num_nonnulls(avance_id, medicion_id, gasto_id) <= 1`. A row with two or more parents is still rejected. The
invariant tests change to accept a parentless row and still reject two parents. The launch runbook goes from 25 to 26
pending migrations, and the R7 rehearsal on a production copy covers it.

Next: DOC1a, starting with the migration and its invariant RED.
