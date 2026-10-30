# Boss requirements (2026-10-28) — shared index for two parallel lanes

Objective: deliver the boss's requests from the 2026-10-28 review in two independent lanes worked by two accounts
in parallel, without merge conflicts. This file is the shared, **read-only** reference (requests, root causes, ownership,
rules). Progress lives only in each lane's own document:
- Lane 1 (data, tags, documents): `odd/tasks/jefe-carril-1.md`
- Lane 2 (process doc, admin, reports, clients, navigation): `odd/tasks/jefe-carril-2.md`

Test runner: `npx vitest run`, `npx tsc --noEmit`, Playwright e2e for the touched flow. Any DB command uses
`.env.local` (the root `.env` is PRODUCTION — see `CLAUDE.md`).

## Requests (verbatim)

- **R1 — boss request, verbatim.** «Mi jefe quiere saber como es el proceso desde cero de como se crean los proyectos y
  como se van manteniendo durante su vida útil, para el tema de presupuestos, tareas y seguimiento, no quiere ventanas
  emergentes cuando se seleccione cualquier opción, tiene problemas al crear etiquetas, que en el panel de
  administración le muestra que se crean y están en el listado de etiquetas, pero no aparecen al momento de crear un
  cliente o asignar una tarea, crear una categoría de aliados y mejorar el informe que extrae de la sección reportes
  para presentar todas las semanas, me dice que en la sección de documentos no sirve muy bien, si el crea una carpeta
  por ejemplo para un cliente, no se guarda dentro de esa carpeta y para ese cliente sino que queda en la carpeta
  "Todas", debe existir una opción fácil para crear carpetas por cliente, y poder arrastrar los archivos a las carpetas
  de esos cliente y automáticamente se le asigne a ese cliente dicho documento, también si se crea una tarea para ese
  cliente y se adjunta un documento debe aparecer en su carpeta de la sección de documentos, también desde el panel de
  administración, poder editar usuarios y permisos y no solo desde la base de datos. Si logras encontrar algún otro
  fallo de ux o ui coméntamelo y lo guardamos como mejora futura.»
- **R2 — user clarification, verbatim (2026-10-28).** «A lo que se refiere es otra pestaña del navegador, por ejemplo
  cuando uno selecciona un proyecto del listado. No, los modales no, en cuanto a los modales, revisalo y mira si la ux
  está bien para todos, además revisé en el panel de administrador se ven todos los departamentos en una lista inmensa,
  mejora eso, o no los incluyas ahi, ya que dentro de las opciones de seleccionar los municipios ahi están que venga
  directo de la api, no es necesario tenerlos en el panel de administrador»
- **R3 — user, verbatim.** «Para esto voy a usar dos cuentas, esta y otra del trabajo, crea las tasks de tal manera
  pueda avanzar los mas rapido posible y no exista conflicto»

## Assumptions (accepted with the plan; change only with a user decision logged in the lane doc)

- A1. Clients and tasks share **one** tag catalog (the `task_tags` setting).
- A2. "Categoría de aliados" = a new `TipoCliente` enum value (e.g. `ALIADO_ESTRATEGICO`, label «Aliado estratégico»),
  not an admin-configurable catalog.
- A3. "Editar permisos" = role + the two existing flags (`gestiona_oportunidades`, `puede_ver_tablero_gerencial`). No
  per-user granular permissions, no email change.
- A4. External links (support URLs such as Drive) still open in a new tab; internal pages and downloads do not.
- A5. One client folder per client (unique); folders without a client keep working as today.

## Root causes found (evidence)

- **Tags.** Forms use the hardcoded `TASK_TAGS` (`src/lib/catalogs.ts:99`) instead of the `task_tags` setting saved
  by admin: `src/components/kanban/task-dialog.tsx:384`, `src/components/kanban/kanban-board.tsx:908`. The client
  commitment form `src/components/crm/task-dialogs.tsx` has no tags field; `Cliente` has no tags column. Working pattern
  to copy: `useDocCategories` (`src/hooks/documents.ts:120`) + invalidation in `useSaveSettings`
  (`src/hooks/admin.ts:203`).
- **Documents.** `carpeta_id` is dropped at every layer of the upload: `repository-list.tsx:405` → `upload-dialog.tsx`
  → `useUploadDocument` (`src/hooks/documents.ts:372`) → `POST /api/v1/documents` (create at `route.ts:236`). So every
  document gets `carpeta_id = null` and only shows under «Todas». `Carpeta` has no `cliente_id`. The task-attachment
  mirror `mirrorAttachmentAsDocument` (`src/app/api/v1/tasks/[id]/attachments/route.ts:71`) already creates a linked
  `Documento` but without a folder. `PATCH /api/v1/documents/[id]` accepts `carpeta_id` but no UI calls it.
- **New browser tabs.** 12 `window.open` / `target="_blank"` sites: `client-list.tsx:446`, `client-sheet.tsx:415`,
  `dashboard-page.tsx:84`, `kanban-board.tsx:325`, `task-dialog.tsx:765`, `report-view.tsx:77`, `ficha-header.tsx:83`,
  `ficha-documentos.tsx:97` (external URL), `reportes-page.tsx:196`, `src/hooks/projects.ts:1624,1636,1717`
  (downloads). **The project list does not open a new tab in code** (`project-list.tsx:278,389` are plain `Link`s):
  reproduce what the boss saw before changing it.
- **Admin › municipios.** `src/components/admin/catalogos-v2-section.tsx` lists every municipality with its department.
  Selectors already read `GET /api/v1/municipalities` (`src/hooks/projects.ts:424`).
- **Aliados.** Enum `TipoCliente` (`prisma/schema.prisma:32`), labels in `TIPO_CLIENTE_LABELS`
  (`src/lib/catalogs.ts:41`); only `ALIADO_ACADEMICO` exists.
- **Users.** `PATCH /api/v1/users/[id]` already accepts `nombre`, `activo`, `rol` and both flags with last-admin guards;
  the UI (`src/components/admin/users-table.tsx`) lacks edit name, reactivate, resend invite / reset password.
- **Reports.** `/reportes` has no projects, no budget vs executed, no week-over-week; the task Excel ignores the period
  (`src/components/kanban/report-view.tsx:65`). The management board lives only at `/proyectos?vista=tablero`.
- **Modals.** ~39 modal surfaces; worst case is the client file, a modal that opens modals on top
  (`src/components/crm/client-sheet.tsx`).
- **Docs.** `docs/guia-uso-proyectos-v2.md:391,454` still says B7 is not in this version; `:392` contradicts B3.
  `docs/paso-a-paso-crear-proyecto.md` stops at the baseline. No boss-facing end-to-end story.

## Anti-conflict rules

1. One branch and one small PR per task, branched from an up-to-date `main`. Rebase on `main` before merging; whoever
   merges second rebases.
2. **Schema has one owner**: all `prisma/schema.prisma` + migration changes go in task **1.0**, merged first. No other
   task touches the schema. A new need gets its own schema task, announced first; never two open migrations at once.
3. Every shared file has one owner (table below). The other lane waits for the owner's merge.
4. Each lane writes only its own lane document and its own memory. This index is not edited after creation (except to
   record a user decision that changes an assumption, done by whoever receives it, in its own small PR).
5. Shared test files (e.g. OpenAPI tests): append new cases at the end only.

| File / area | Owner |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/catalogs.ts` | Lane 1 |
| `src/components/kanban/*`, `src/hooks/kanban.ts`, `src/hooks/admin.ts`, `src/components/crm/task-dialogs.tsx` | Lane 1 **until 1.1 is merged**, then Lane 2 |
| `src/components/documents/*`, `src/hooks/documents.ts`, `src/app/api/v1/documents*`, `src/app/api/v1/folders*`, `src/app/api/v1/uploads/sign`, `src/app/api/v1/tasks/[id]/attachments*`, `src/lib/openapi/paths/documents.ts` | Lane 1 |
| `src/components/crm/*` (rest), `src/app/api/v1/clients*`, `src/app/(app)/clientes/*` | Lane 2 |
| `src/components/admin/*`, `src/app/api/v1/users*`, `src/app/(app)/administracion/page.tsx` | Lane 2 |
| `src/components/reportes/*`, `src/components/dashboard/*`, `src/app/print/*`, `src/app/api/v1/tasks/report`, `src/app/api/v1/tasks/export` | Lane 2 |
| `src/components/proyectos/*`, `src/hooks/projects.ts`, `docs/*` | Lane 2 |
| `src/components/ui/*` | Nobody |

## Suggested order

- Day 1 — Lane 1: 1.0 → 1.1. Lane 2: 2.1 → 2.2 → 2.3.
- Then — Lane 1: 1.2 → 1.3 → 1.4 → 1.5. Lane 2: 2.4 → 2.5 → 2.6 (needs 1.0 and 1.1 on `main`) → 2.7 → 2.8.
- Migration 1.0 reaches production only through `docs/runbook-lanzamiento-v2.md` (backup first); that is a user decision.
