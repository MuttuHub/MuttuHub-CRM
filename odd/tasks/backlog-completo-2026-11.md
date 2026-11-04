# Backlog completo — ejecución en local (2026-11)

Objetivo: resolver todo lo pendiente del plan `docs/pendientes/plan-trabajo-ux-crm.md`, unidad por unidad, en local.
Ramas: una por PR desde `main`, sin PRs apilados (plan §3); push, PR y merge los decide el usuario. Delivery: `ask-on-risk`.
Pruebas: Vitest (`npx vitest run <archivo>`), e2e con Playwright en `e2e/`; base local Docker vía `.env.local`.

## Specs

- **S1 — Pedido.** «el mismo proyecto que llevamos, y resolver todo lo que tenemos pendiente en el backlog» (en
  respuesta a «hagamos un plan de trabajo en local»). Alcance: cada ítem del plan termina **Hecho** con evidencia
  (commit, pruebas) o queda marcado **Decisión** con la pregunta exacta para la PO o gerencia.
- **S2 — Reglas de trabajo** (plan §3): un PR chico por unidad desde `main`; pruebas primero; `tsc` y lint limpios; cambios
  de esquema, permisos o dinero con ensayo y runbook; UI en «tú», sin Σ, pp, v0 ni códigos de regla; glosario D-G1; al
  cerrar un ítem se marca **Hecho** en el plan.
- **S3 — Notificaciones por correo.** «mi jefe me pidió que se enviaran notificaciones por correo electrónico, que tipo
  de notificaciones podemos enviar y que servicio o microservicio propio podemos utilizar, o herramientas opensource o
  gratuitas». Respuesta acordada: Frente M del plan (outbox + puerto `EmailSender`; Mailpit en local; proveedor de
  producción según D-M1; DNS según D-E).
- **S4 — Producción.** Nada se aplica en producción desde esta feature sin la autorización explícita del usuario, paso a
  paso, con respaldo y ensayo sobre copia (memoria: ensayo sobre dump restaurado).

## Tasks

Orden: primero lo que no depende de decisiones. Ruta: `inline` salvo que se indique un motivo de delegación.

| ID | Ítems del plan | S# | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T0 | F0.6: plan en el repo + Frente M + este documento | S1, S3 | inline | hecho | `1bbd4cc` (rama `docs/plan-backlog-completo`) |
| T1 | F0.4: X1 («obligatoria»), X2 (`modo` estricto en imports) | S1, S2 | inline | hecho | `caf2d47` (rama `fix/x1-x2-mensajes-y-modo`); RED 1+4 → GREEN; suite de áreas tocadas 132 archivos / 1670 tests; assess medio, `under_budget` |
| T2 | PR-R1: R1, R2, R3, R4, R6 (datos de Reportes) | S1, S2 | por definir | pendiente | — |
| T3 | PR-1: BL#14, BL#21, BL#12, BL#11 (base de diálogos) | S1, S2 | por definir | pendiente | — |
| T4 | PR-2: BL#9, BL#22, BL#15, BL#10 (diálogos con operación en curso) | S1, S2 | por definir | pendiente | — |
| T5 | PR-R2: R9 (hoja de impresión común) | S1, S2 | por definir | pendiente | — |
| T6 | PR-M1: outbox, worker y `EmailSender` (Resend + SMTP/Mailpit) | S3 | por definir | pendiente | — |
| T7 | PR-M2 a PR-M4: plantillas, eventos y resumen v2 | S3 | por definir | pendiente | — |
| T8 | PR-7a–d: U1–U8 (textos de Proyectos) | S1, S2 | inline | pendiente | — |
| T9 | PR-8: BL#13, BL#16, BL#7, N10 | S1, S2 | inline | pendiente | — |
| T10 | PR-14, PR-15: U9–U12 (requisitos de línea base visibles) | S1, S2 | por definir | pendiente | — |
| T11 | PR-16: U13–U16 (atajos) | S1, S2 | por definir | pendiente | — |
| T12 | PR-17: BL#8 (impresión unificada) | S1, S2 | por definir | pendiente | — |
| T13 | PR-11, PR-13 (sin decisión): N6, N2 | S1, S2 | por definir | pendiente | — |
| T14 | F0.3: contrato de AJ-02 rehecho sobre `main` (producción según S4) | S1, S4 | inline | pendiente | — |
| T15 | Paralelo sin decisión: T1 (e2e legacy a CI), T3, T8, E6 según el usuario | S1 | por definir | pendiente | — |
| TB | **Bloqueados por decisión:** PR-3 (D-G1), PR-12 (D-G2), PR-6 (D-G3), PR-9 (D-G4), PR-4 parte (D-G5), PR-10 (D-G6), U22 (D-G7), PR-R3–R7, R11, R13 (D-G8), PR-M1 en prod (D-M1, D-E), B4/B5 (D-A), F4.x | S1 | — | decisión | Pedir en F0.5 |

## Log

- **L1 (2026-11-04, usuario, textual):** «el mismo proyecto que llevamos, y resolver todo lo que tenemos pendiente en el
  backlog». Contexto previo, textual: «listo de acuerdo con esto, hagamos un plan de trabajo en local, además mi jefe me
  pidió que se enviaran notificaciones por correo electrónico, que tipo de notificaciones podemos enviar y que servicio o
  microservicio propio podemos utilizar, o herramientas opensource o gratuitas».
- **L2 (2026-11-04):** estimación honesta: ~120 ítems y más de 40 PRs, unas 6–8 semanas; ~15 ítems esperan decisiones.
  Sin otras sesiones activas en la máquina. Mailpit del stack local corre en `localhost:54324`. Próximo: T1.
- **L3 (2026-11-04):** T1 cerrado en `caf2d47`. X2 reproducido antes del arreglo: `modo=aplicarr` respondía 200 y
  aplicaba en los 4 imports (plantilla, estructura, presupuesto, gastos). Ahora un helper compartido
  (`src/lib/api/import-modo.ts`) acepta `validar`, `aplicar` o ningún `modo` (lo que la app envía para aplicar) y responde
  400 «El modo debe ser «validar» o «aplicar».» antes de escribir; OpenAPI actualizada. X1: «La descripción es
  obligatoria.» / «demasiado larga.»; los demás mensajes no cambian (pruebas existentes). `tsc` y eslint limpios.
  Próximo: T2 (PR-R1) y T3 (PR-1) en paralelo, por escritores delegados en worktrees aislados (unidades
  independientes con superficies disjuntas; contexto largo de esta sesión).

