# Instrucciones para el agente A — backlog

> Pega este archivo completo al iniciar la sesión de Claude Code en el repositorio principal
> (`MuttuHub-CRM`, rama `main` actualizada). Es la misma línea de trabajo de `odd/tasks/backlog-completo-2026-11.md`;
> lo nuevo es que ahora hay un segundo agente (B) trabajando en paralelo en Proyectos v3.

## Tu papel

Eres el **agente A**. Terminas el backlog de Muttu Hub. Tu trabajo tiene **prioridad** sobre el del agente B: si hay que
elegir, ganas tú. No construyes Proyectos v3.

## Lee antes de empezar

1. `AGENTS.md` y `CLAUDE.md` (Next.js 16 tiene cambios: lee la guía en `node_modules/next/dist/docs/` antes de escribir
   código de Next; `.env` es **producción**, cualquier script de datos carga `.env.local` de forma explícita).
2. `odd/tasks/backlog-completo-2026-11.md`: Specs S1–S4, Tasks y el Log completo, sobre todo **L4, L6 y L11**
   (entorno: `node.exe`, junction de `node_modules`, `tsc`/`eslint` con `node node_modules/...`, no aceptar
   `migrate reset`).
3. `docs/ux-crm-2026-11/plan-trabajo-ux-crm.md` (lista única de trabajo).
4. `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md`, secciones 3 («Quién toca qué») y 5 («Línea A»).

## Qué haces, en orden

Sigue la tabla de la sección 5 del plan paralelo:

0. Ayuda a Adrián a fusionar lo terminado (T1, T2, T3, T8 con 7a y 7b primero y 7c rebasado, PR-7d, T5+T5b, T6, docs).
   Tú preparas los PR y el orden; **Adrián decide push, PR y merge**.
1. T4 (PR-2) · 2. T5c · 3. T9 (PR-8) · 4. **T10 (PR-14, PR-15)** · 5. **T11 (PR-16)** · 6. T12 (PR-17) ·
   7. T13 · 8. T14 (F0.3, producción según S4) · 9. **PR-18** · 10. bloqueados que se liberen ·
   11. **Fase 4 empezando por el backend de F4.7** · 12. Frente M (T7, PR-M1b) y resto.

Las unidades en negrita son las que B necesita. Cuando cada una entre a `main`, escribe en tu Log una línea
«**Entrega para B:** <unidad>, <commit>, <qué endpoint o regla queda disponible>».

## Reglas con el agente B

- **No edites** `src/app/(app)/proyectos-v3/**`, `src/components/proyectos-v3/**`, `e2e/proyectos-v3/**`,
  `src/lib/flags.ts` ni `odd/tasks/proyectos-v3.md`. Son de B.
- Eres dueño de `src/app/api/**`, `src/lib/proyectos/**`, `prisma/**`, `src/hooks/projects.ts`,
  `src/components/ui/**`, `src/lib/nav.ts`, `globals.css`, `eslint.config.mjs` y de los dos planes. Si cambias la firma de
  un hook o de un endpoint que B usa, anótalo en tu Log como «**Aviso a B**».
- Si B te pide algo («Pedido a A» en su tracker), Adrián te lo pasa. Agéndalo en tu tabla de Tasks; no interrumpas una
  unidad a medias.
- Según D-V3-1 (pendiente), la interfaz de U17–U21 podría ir solo en v3. Hasta que se decida, construye primero el
  **backend** de F4.7 y espera antes de tocar la interfaz de v1.

## Reglas de siempre (S2 y S4)

- Una rama y un PR chico por unidad desde `main`, sin apilar. Pruebas primero (RED → GREEN). `tsc` y `eslint` en cero.
- Cambios de esquema, permisos o dinero, con ensayo y runbook.
- Textos en «tú», sin Σ, pp, v0 ni códigos de regla; glosario D-G1 cuando exista.
- **Nada en producción** sin la autorización explícita de Adrián, paso a paso, con respaldo y ensayo sobre copia.
- No leas ni imprimas `.env*`, contraseñas ni tokens.
- Al cerrar una unidad: marca **Hecho** en el plan principal, actualiza tu tabla de Tasks y escribe una línea en el
  Log con commit, pruebas y riesgos.
- `next dev` en el puerto **3000** (B usa el 3001).

## Cuándo parar y preguntar

- Una decisión de la PO o de gerencia que no está anotada en la sección 4 del plan principal.
- Cualquier paso en producción.
- Un conflicto con la zona de B.
