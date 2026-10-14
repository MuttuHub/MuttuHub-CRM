# P2 — "Nuevo proyecto" as a v7 stepper page (feature `p2-nuevo-proyecto-stepper`)

Engram mirror topic: `odd/p2-nuevo-proyecto-stepper/tasks`. Created 2026-10-14 10:17. Branch: `feat/projects-v2`.
Parent plan: `odd/tasks/v7-alignment.md` (task P2). Demo context: `odd/tasks/demo-proyectos-2026-10-14.md`.
Prototype: `~/Downloads/Web app views creation/Muttu Hub v7.dc.html` (`const PASOS` at line 1120, render at ~1282).

## Objective
Show the boss the project creation flow, visual and functional, as in v7: a page with five steps
(General, Metas, Cronograma, Presupuesto, Revisión) instead of the single dialog.

## Why (user, 2026-10-14, textual)
> "que me recomiendas hacer para que se implemente toda la v7 para mostrarsela a mi jefe, que quiere ver el flujo de
> creacion de proyectos? tanto visual como funcional" — accepted plan: "bueno dale, que nos coge el tiempo"

## Scope / constraints
- New route `/proyectos/nuevo`. No backend change, no migration: every step persists through the existing endpoints
  that already work while the project is in BORRADOR.
- Step 1 creates the project (both origins: oportunidad ganada / independiente) with the existing create logic; steps
  2–4 embed the existing Borrador editors; step 5 is a read-only review with "Aprobar línea base" or "Guardar borrador".
- The current dialog keeps working and the "Nuevo proyecto" button keeps opening it until T5 (gate: browser-verified
  page, deadline 13:30; otherwise the demo uses the dialog).
- Demo safety: a dev server with HMR serves this tree; no full suite, no DB-touching tests, no DB commands.
- Rest of v7 (Cronograma KPIs, Gantt real/corte, Beneficiarios by group, Soportes link form, Financiero alerts,
  gastos import) is out of scope today (see the demo doc).

## Tasks (route: delegated — writer trigger, 2+ non-trivial files)
- [ ] T1 Extract the create form from `project-create-dialog.tsx` into a reusable component (dialog keeps identical
      behavior and tests green).
- [ ] T2 Stepper shell page `/proyectos/nuevo` with v7 step indicator; step 1 General creates the project and moves on;
      `?oportunidad=<id>` preselects the won opportunity; refresh/back keeps the created project (`?proyecto=<id>`).
- [ ] T3 Steps 2–4 embed the existing Metas (+ Importar plantilla), Cronograma/Gantt and Financiero (Presupuesto)
      editors for the created project.
- [ ] T4 Step 5 Revisión: summary + "Aprobar línea base" (existing action, same permissions) / "Guardar borrador" → ficha.
- [ ] T5 (gate) Point "Nuevo proyecto" and "Convertir en proyecto" to the page — only after browser verification.
- [ ] T6 Browser verification (both origins), then restore demo data (needs explicit user consent).

## Acceptance
Both origins create a BORRADOR project from step 1; steps 2–4 save through existing endpoints and the data shows in the
ficha; step 5 approves the baseline; dialog path still works; targeted tests + `tsc` + eslint green.

## Progress
(none yet)
