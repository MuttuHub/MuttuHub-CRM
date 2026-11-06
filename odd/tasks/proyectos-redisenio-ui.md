# Proyectos — rediseño de usabilidad de la ficha (implementación)

Objective: implement the PO-approved redesign of the project ficha (Resumen, Actividades, Finanzas, Documentos, Historial), desktop and mobile.
Branch: `feat/proyectos-redisenio-ui` (worktree `.claude/worktrees/redisenio`, base `origin/main@0726e5d`). Delivery: work-unit commits on this branch; PR split decided by the human.
Test runner: `node.exe node_modules/vitest/vitest.mjs run --dir src <files>` (Windows node only) · tsc: `node.exe node_modules/typescript/bin/tsc --noEmit -p .` · eslint via `node.exe node_modules/eslint/bin/eslint.js`.

## Specs

- **S1 — Source of truth.** The approved design is the canvas https://claude.ai/artifact/4iECnWb1jzLdjKvH6s4CwN (sources in `docs/ux-crm-2026-11/canvas-fuente/project/`: `<Tab>-propuesta`, `<Tab>-movil-propuesta`, `Interacciones-<Tab>`) and the clickable prototype https://claude.ai/artifact/TAVwaGPYxskpaWCrTG4fJJ (sources in `docs/ux-crm-2026-11/prototipo-ficha/`). User: «la po esta de acuerdo con el diseño, avanza en lo que mas puedas, y luego uso mi otra cuenta».
- **S2 — Resumen y cabecera** as in `Resumen-propuesta` / `Interacciones-Resumen`: figures in numbers with ⓘ, «Qué falta» rows with the exact action, Novedades notice, header actions.
- **S3 — Actividades** as in `Actividades-propuesta`, `Registrar-avance-prototipo` / `Interacciones-Actividades`: one main action per card, entregables table, historial with Anular, Registrar avance form, «Cronograma» instead of «Gantt».
- **S4 — Finanzas** as in `Finanzas-propuesta`, `Validar-gasto-propuesta` / `Interacciones-Finanzas`: three key figures, gastos por validar in the summary, validation panel with soporte and rubro saldo, no clipped gastos table, plain words instead of E/A, Umbral rojo, Σ A, pp.
- **S5 — Documentos** as in `Documentos-propuesta` / `Interacciones-Documentos`; **Historial** as in `Historial-propuesta`, `Versiones-propuesta` / `Interacciones-Historial` (sentences instead of raw fields, «Versión original (línea base)» instead of v0, comparator hidden with one version).
- **S6 — Mobile.** User: «todos los diseños también deben ser adaptados a dispositivos moviles». Every tab follows its `-movil-propuesta` board at 390 px (no horizontal overflow, 44 px targets).
- **S7 — Constraints.** UI-only in this pass: no schema/API contract changes; behaviour that needs the API is listed as follow-up. Open PO questions (`docs/ux-crm-2026-11/reporte-sesion-2026-11-05.md` §6) keep today's behaviour — notably validating a gasto over its rubro stays blocked. Do not touch `proyectos-v3` or its flag; only `.env.local`; Vitest/Next only with `node.exe` and `--dir src`.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T0 | S1 | inline | docs into repo | — |
| T1 | S2, S6 | delegated (parallel unit) | pending | — |
| T2 | S3, S6 | delegated (parallel unit) | pending | — |
| T3 | S4, S6 | delegated (parallel unit) | pending | — |
| T4 | S5, S6 | delegated (parallel unit) | pending | — |
| T5 | S1–S7 | inline | seam check: full suite, tsc, eslint | — |

Route evidence: T1–T4 are independent units with disjoint edit surfaces (one tab each), each several files and well over 100 lines, launched together (Writer trigger a).

## Log

- L1 (2026-11-06) User: «la po esta de acuerdo con el diseño, avanza en lo que mas puedas, y luego uso mi otra cuenta».
- L2 Earlier requests carried over: «todos los diseños también deben ser adaptados a dispositivos moviles»; «tambien incluye todas las interacciones de cada sección para que quede claro al momento de realizar los cambios».
