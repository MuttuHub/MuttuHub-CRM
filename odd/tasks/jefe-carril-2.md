# Lane 2 — process doc, users admin, reports, no new tabs, clients (boss requirements 2026-10-28)

Objective: explain the project process end to end for the boss, edit users from admin, remove the municipality list
from admin, stop opening new browser tabs, build the weekly report, add tags to clients, and review modal UX. Shared
rules, verbatim requests (R1–R3), assumptions (A1–A5), root causes and file ownership:
`odd/tasks/jefe-requerimientos-2026-10-28.md` — read it first. One branch + one PR per task from `main`. Test runner:
`npx vitest run` + `npx tsc --noEmit` + Playwright for the flow; DB only with `.env.local`. Mirror: Engram
`odd/jefe-carril-2/tasks` (in the account that works this lane).

## Specs

- **S1 — process from scratch (R1).** «Mi jefe quiere saber como es el proceso desde cero de como se crean los
  proyectos y como se van manteniendo durante su vida útil, para el tema de presupuestos, tareas y seguimiento». A
  boss-facing document: won opportunity → create → structure (manual / template / PO import B3) → budget (manual / PO)
  → team → baseline → weekly follow-up (progress, expenses with Subtotal/IVA AJ-04/05, validation, traffic lights) →
  modifications → suspend / reactivate / close / reopen / cancel (B7); state diagram and who does each step. Fix the
  stale B7 statements in `docs/guia-uso-proyectos-v2.md:391,392,454`.
- **S2 — users (R1).** «desde el panel de administración, poder editar usuarios y permisos y no solo desde la base de
  datos». Per A3: edit name, role and both flags; reactivate; resend invite / reset password. Last-admin guards kept.
- **S3 — municipalities out of admin (R2).** «en el panel de administrador se ven todos los departamentos en una lista
  inmensa, mejora eso, o no los incluyas ahi, ya que dentro de las opciones de seleccionar los municipios ahi están que
  venga directo de la api, no es necesario tenerlos en el panel de administrador». Remove the municipalities sub-table
  from admin; municipality selectors keep reading `GET /api/v1/municipalities`.
- **S4 — no new browser tabs (R1 + R2).** «no quiere ventanas emergentes cuando se seleccione cualquier opción» / «A lo
  que se refiere es otra pestaña del navegador, por ejemplo cuando uno selecciona un proyecto del listado». First
  reproduce in a browser (local and production) what opens a tab when selecting a project; the code at
  `project-list.tsx:278,389` uses plain `Link`s. Internal pages (print/report views) open in the same tab with a
  «Volver» button; downloads download directly. External URLs keep a new tab (A4).
- **S5 — weekly report (R1).** «mejorar el informe que extrae de la sección reportes para presentar todas las
  semanas». A «Semanal» tab in Reportes with print view and Excel: portfolio (traffic lights, % progress, budget
  assigned / programmed / executed by project and by client), overdue activities, tasks closed and overdue this week
  vs last week, «Requiere atención», expenses pending validation. Also fix the task Excel ignoring the period
  (`report-view.tsx:65`).
- **S6 — client tags (R1).** «no aparecen al momento de crear un cliente». Tags field in the client form, saved via the
  clients API (column from Lane 1 task 1.0), filter in the client list; same catalog and hook as Lane 1 task 1.1 (A1).
- **S7 — modal UX review (R2).** «en cuanto a los modales, revisalo y mira si la ux está bien para todos». Review
  Clients, Tasks, Projects and Admin modals; priority: stacked modals in the client file (`client-sheet.tsx`). Fix clear
  defects, log the rest for 2.8.
- **S8 — future improvements (R1).** «Si logras encontrar algún otro fallo de ux o ui coméntamelo y lo guardamos como
  mejora futura». Backlog doc with the list below plus findings from 1.5 and 2.7.

## Tasks

| ID | Specs | Task | Depends | Route | Status | Commit / evidence |
|---|---|---|---|---|---|---|
| 2.1 | S1 | `docs/proceso-proyectos-desde-cero.md` (+ HTML/PDF like the other guides); fix B7 in `guia-uso-proyectos-v2.md`. Docs only. | — | inline | done | branch `docs/proceso-proyectos-desde-cero`, commit 99a14fe, PR #104 |
| 2.2 | S2 | Edit-user panel in `users-table.tsx` (name, role, flags), reactivate, resend invite / reset password via `src/lib/supabase/admin.ts`; new hooks in `src/hooks/users.ts` (not `hooks/admin.ts`). | — | inline | done | branch `feat/admin-editar-usuarios`, commit 4ce90d3, PR #105 |
| 2.3 | S3 | Remove the municipalities sub-table from `catalogos-v2-section.tsx` (+ test). Delete now-unused admin hooks only after 1.1 is merged. | — | inline | done (hooks cleanup pending 1.1) | branch `feat/admin-sin-municipios`, commit 9bf0059, PR #106 |
| 2.4 | S4 | Reproduce first; then replace internal `window.open`/`_blank` (sites in the index) with same-tab navigation + «Volver» on print pages; direct downloads in `hooks/projects.ts`. | 1.1 merged | delegated (parallel with 2.7) | 2.4a done; 2.4b (kanban sites) pending #103 | branch `feat/sin-pestanas-nuevas`, commit 17a168c (push blocked: TLS) |
| 2.5 | S5 | Weekly report tab + `/print/reportes/semanal` + Excel, reusing management-board hooks; fix task Excel period. | 2.4 | delegated (context backstop) | doing | branch `feat/reporte-semanal` stacked on 17a168c |
| 2.6 | S6 | Client tags in `client-form.tsx`, clients API, list filter; reuse `useTaskTags()`. | 1.0, 1.1 merged | inline | todo | |
| 2.7 | S7 | Modal UX review (clients first). | 2.6 | delegated (parallel with 2.4a) | Admin+Projects done; Clients after 2.6 | branch `fix/modales-admin-proyectos`, commit 44753a2 (push blocked: TLS) |
| 2.8 | S8 | `docs/pendientes/mejoras-ux-reunion-2026-10-28.md`. | — | inline | done (modal findings appended after 1.5/2.7) | branch `docs/backlog-mejoras-ux`, commit 611685d, PR #107 |

### Already-detected improvements for 2.8

- «Tablero» means three things: Kanban `/tablero`, the portfolio board, and an activities sub-view.
- The management board is not in Inicio or Reportes.
- Reportes › Tareas has no responsable/cliente filter.
- Portfolio PDF is not implemented (400).
- Kanban tasks cannot be linked to a project (`Tarea` has no `proyecto_id`).
- Missing empty states in Contactos, Oportunidades, Subtareas.
- The Reportes tab bar relies on an `!important` patch.
- `project-create-form.tsx` uses `DialogFooter` on a full page.
- Print views are inconsistent (`/print/*` vs inside the app layout).

## Log

- **L1 (2026-10-28) — original request.** See R1–R3 in `odd/tasks/jefe-requerimientos-2026-10-28.md` (verbatim).
- **L2 (2026-10-28).** Plan approved by the user with assumptions A1–A5. Lane created; next step: 2.1.
- **L3 (2026-10-28).** 2.1 done: `docs/proceso-proyectos-desde-cero.md` (+ HTML/PDF) walks the full lifecycle (opportunity →
  creation → baseline → weekly follow-up → modifications → B7 states) for a non-technical reader, with a
  who-does-what table. Fixed the stale B7 statements in `guia-uso-proyectos-v2.md:391,454` (B7 shipped in #97) and the
  self-contradiction at `:392` about the PO template's Cantidad/Unidad columns (already imported since B3, #98); added
  a real §5.6 documenting the state-change dialog. Next step: 2.2.
- **L4 (2026-10-28).** 2.2 done: `users-table.tsx` gets an "Editar nombre" dialog (PATCH already supported it) and a
  "Reactivar" action next to Desactivar (PATCH `activo: true`, no new guard needed — only demoting/deactivating an
  admin is guarded). Added two ADMINISTRADOR-only endpoints, `POST /api/v1/users/:id/resend-invite` and
  `.../reset-password`, both calling `supabaseAdmin.auth.admin.generateLink` (service role) and returning the link in
  a copyable dialog, since outbound email isn't configured — mirrors the existing duplicate-invite fallback in
  `POST /api/v1/users`. New `src/hooks/users.ts` holds the two mutation hooks for those; role/flags/deactivate kept
  their existing raw-`fetch` style to avoid an unrelated refactor. Verified end to end against the local Docker/
  Supabase stack (admin demo login): name edit, reactivate→deactivate round trip, and a real recovery link generated
  for an existing user. Next step: 2.3.
- **L5 (2026-10-29).** 2.3 done: removed the municipalities sub-table, its add form and the detail column (only it used
  it) from `catalogos-v2-section.tsx`; RED test asserts no «Municipios» region and that `useAdminMunicipios` is never
  called. The selectors keep reading `GET /api/v1/municipalities`, and the API endpoints stay. Updated
  `guia-uso-proyectos-v2.md:115` and `guia-prueba-proyectos.md` §H. Checks: focused test 6/6, unit suite 367 files /
  4307 tests green, eslint clean, `tsc` clean in `src/` (only stale `.next/dev/types` errors). `prisma/*.invariant`
  tests not run: Docker is not available in this WSL session (they target 127.0.0.1:54322). Native assess: medium,
  not due (under_budget). Pending after #103 merges: delete `useAdminMunicipios`/`useCreateMunicipio` from
  `hooks/admin.ts`. Next step: 2.8 (2.4 and 2.6 wait for #103/#102).
- **L6 (2026-10-29).** 2.8 done: backlog doc with 8 items, each re-verified in code with path:line. Dropped
  «missing empty states in Contactos/Oportunidades»: false — `client-sheet.tsx:1014,1112` already render them
  (Subtareas not verified, left out). Confirmed: Reportes «Gestión de tareas» passes `responsable`/`cliente` as
  `undefined` (`reportes-page.tsx:85`); portfolio export `formato=pdf` → 400; `!important` tab patch
  (`reportes-page.tsx:70,76`); `DialogFooter` at `project-create-form.tsx:588`; project print lives at
  `/proyectos/[id]/imprimir` vs `/print/*`. A section for modal-review findings (1.5, 2.7) is left as pending.
  Next: lane 2 is blocked until #102/#103 merge (2.4, 2.6); 2.1/2.2/2.3/2.8 await push + PR (user decision).
- **L7 (2026-10-29).** Pushed and opened PRs: 2.1 → #104, 2.2 → #105 (flagged security-sensitive: returns invite/recovery
  links), 2.3 → #106, 2.8 → #107. Suggested merge order: #107, #104, #105, #106. Next: 2.4 split (lane-2 sites now,
  Kanban sites after #103), 2.5 backend, 2.7 for Admin/Projects modals.
- **L8 (2026-10-29).** 2.4a done by a delegated writer (17a168c): shared `PrintToolbar` («Volver» + «Imprimir») on all
  print views; client ficha/list, dashboard, ficha-header and Reportes open print views in the same tab; file
  downloads append `download=` to the signed URL and click a temporary `<a download>`; external URLs keep a new tab
  (A4). Left for 2.4b: `kanban-board.tsx:325`, `report-view.tsx:77`, `task-dialog.tsx:765`, `kanban/print-report.tsx`.
  Reproduction: `project-list.tsx` opened the detail with `target="_blank"` until #86 (8720170, 2026-10-26), which is
  NOT in tag v2.0.0 (2026-10-19) — the writer claimed otherwise; verified with `git merge-base --is-ancestor`.
  Production build unknown. 2.7 (Admin + Projects) done by a parallel writer (44753a2): 4 fixes (confirm structure
  deletes, Cancelar disabled while pending in document dialogs, Cancelar in «Solicitar modificación», Google access
  approvals no longer promise an email); 8 findings appended to the backlog as items 9–16 (4d8c1cc on
  `docs/backlog-mejoras-ux`). Parent spot checks: 48/48 and 36/36 focused tests green. Push blocked: `git push` and
  `gh` fail with "SSL certificate verification failed: certificate signer not trusted". 2.5 launched (delegated).
