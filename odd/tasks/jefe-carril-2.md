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
| 2.1 | S1 | `docs/proceso-proyectos-desde-cero.md` (+ HTML/PDF like the other guides); fix B7 in `guia-uso-proyectos-v2.md`. Docs only. | — | inline | todo | |
| 2.2 | S2 | Edit-user panel in `users-table.tsx` (name, role, flags), reactivate, resend invite / reset password via `src/lib/supabase/admin.ts`; new hooks in `src/hooks/users.ts` (not `hooks/admin.ts`). | — | inline | todo | |
| 2.3 | S3 | Remove the municipalities sub-table from `catalogos-v2-section.tsx` (+ test). Delete now-unused admin hooks only after 1.1 is merged. | — | inline | todo | |
| 2.4 | S4 | Reproduce first; then replace internal `window.open`/`_blank` (sites in the index) with same-tab navigation + «Volver» on print pages; direct downloads in `hooks/projects.ts`. | 1.1 merged | inline | todo | |
| 2.5 | S5 | Weekly report tab + `/print/reportes/semanal` + Excel, reusing management-board hooks; fix task Excel period. | 2.4 | inline | todo | |
| 2.6 | S6 | Client tags in `client-form.tsx`, clients API, list filter; reuse `useTaskTags()`. | 1.0, 1.1 merged | inline | todo | |
| 2.7 | S7 | Modal UX review (clients first). | 2.6 | inline | todo | |
| 2.8 | S8 | `docs/pendientes/mejoras-ux-reunion-2026-10-28.md`. | — | inline | todo | |

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
