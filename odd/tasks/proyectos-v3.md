# Proyectos v3 — agente B (base técnica B0)

Worktree `.claude/worktrees/proyectos-v3`, ramas cortas desde `main`, una unidad por rama. Contrato: `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md` (sección 6).
Esta unidad no toca la app actual: con `FEATURE_PROYECTOS_V3=off`, v1 se comporta igual que en `main`.

## Specs

**S1 · Rol y prioridad.** «Eres el **agente B**. Preparas la nueva sección de Proyectos (**Proyectos v3**) al lado de la actual, apagada con una bandera. El backlog (agente A) tiene **prioridad**: nunca lo bloqueas ni tocas su zona.»

**S2 · Solo B0 y puerta cerrada.** «**Ahora solo haces B0, la base técnica.** No construyes pantallas de v3 hasta que Adrián marque la puerta de decisiones como **abierta** en `odd/tasks/proyectos-v3.md` (Spec S3). Si terminas B0 antes, **te detienes** y lo informas. No construyes nada con supuestos.»

Estado de la puerta: **CERRADA** (2026-11-05). Faltan D-G1, D-G7, D-G11, D-G12, D-CP1 a D-CP6, P5, D-V3-1 y D-V3-2, cada una anotada con fecha y quién decidió en la sección 4 del plan principal. Se abre solo cuando Adrián lo marca acá.

**S3 · B0.2, prueba guardiana.** Plan, fila B0.2: «Carpeta `src/components/proyectos-v3/` y prueba guardiana (estilo `design-guards.test.ts`): v1 no importa nada de v3, y v3 solo importa de `src/components/proyectos/` los módulos puros de una lista permitida» · Terminado cuando: «La prueba falla si alguien cruza la frontera».

**S4 · Zona de edición.** Puedo crear y editar **solo**: `src/app/(app)/proyectos-v3/**`, `src/components/proyectos-v3/**` (los hooks nuevos van en `src/components/proyectos-v3/data/`), `e2e/proyectos-v3/**`, `src/lib/flags.ts` (y su prueba), `odd/tasks/proyectos-v3.md` y `odd/tasks/proyectos-v3-contratos.md`, y un modo `v3` en `.claude/qa/capturar.mjs` sin cambiar los modos existentes. «**No edites** nada más: ni `src/components/proyectos/**`, ni `src/app/api/**`, ni `src/lib/proyectos/**`, ni `prisma/**`, ni `src/hooks/projects.ts`, ni `src/components/ui/**`, ni `src/lib/nav.ts`, ni `globals.css`, ni `eslint.config.mjs`, ni los planes.»

**S5 · Cierre de cada unidad.** «**Terminado, para cada unidad:** pruebas primero (RED → GREEN); `tsc` y `eslint` en cero; con la bandera en `off`, la app se comporta exactamente igual que en `main`; una línea en tu Log con commit, pruebas y riesgos; actualiza tu tabla de Tasks.»

**S6 · Entorno y límites.** «`next dev -p 3001` (A usa el 3000).» · «La base local de Docker se comparte con A. En B0 **solo lees**: nada de seeds, resets, migraciones ni scripts de datos.» · «**Push, PR y merge los decide Adrián.** Tú dejas la rama lista y le dices cómo revisarla.» · «**Nada en producción.**» · «No leas ni imprimas `.env*`, contraseñas ni tokens.» · Vitest y `next dev` solo corren bajo `node.exe`; en este worktree `node_modules` es una junction de Windows, no un symlink (log L11 del backlog).

**S7 · Cuándo parar y preguntar.** «Terminaste B0 y la puerta sigue cerrada: **te detienes**, escribes el resumen en tu Log y avisas.» · «Necesitas tocar algo fuera de tu zona.» · «Una decisión de la PO que no está anotada en la sección 4 del plan principal.» · «Algo de la app actual (v1) cambiaría con la bandera en `off`.»

## Tasks

| ID | Spec | Rama | Qué | Estado | Commit |
|---|---|---|---|---|---|
| B0.1 | S1, S2, S5 | `feat/proyectos-v3-bandera` | `src/lib/flags.ts` + ruta `proyectos-v3` con «En construcción» | Hecho, pendiente de merge de Adrián | `4863dd3` |
| B0.2 | S3, S5 | `chore/proyectos-v3-guardas` | Carpeta `src/components/proyectos-v3/` y prueba guardiana de la frontera | Hecho, pendiente de merge de Adrián | `80b05c2` |
| B0.4 | S1, S5 | `docs/proyectos-v3-contratos` | Inventario de contratos del prototipo (pantalla/acción → endpoint u hook, hueco, dueño, decisión) | Pendiente | — |
| B0.3 | S1, S5 | `feat/proyectos-v3-datos` | Selectores de solo lectura en `proyectos-v3/data/` | Bloqueado: espera el paso 0 de A (T3 y T8 en `main`) | — |
| B0.5 | S1, S5 | `feat/proyectos-v3-piezas` | Piezas de presentación sin reglas ni textos finales | Bloqueado: espera el paso 0 de A (diálogos T3) | — |
| B0.6 | S1, S5 | `test/proyectos-v3-e2e` | `e2e/proyectos-v3/` con humo de bandera y matriz de paridad | Bloqueado: espera el paso 0 de A | — |
| B1–B8 | S2 | — | Pantallas de v3 | Bloqueado: puerta de decisiones cerrada | — |

## Log

- **L1 (2026-11-05, pedido original de Adrián, verbatim):** «Hola estoy trabajando con claude y deje un worktree para trabajar contigo»
- **L2 (2026-11-05, arranque):** leí `odd/tasks/prompt-agente-b-proyectos-v3.md`, el plan paralelo completo (secciones 4 y 6) y `CLAUDE.md`. Confirmado el estado: `feat/proyectos-v3-bandera` tiene B0.1 (`4863dd3`, 3 archivos, +121) sin mergear; este worktree está en `chore/proyectos-v3-guardas` desde `main` (`8868f1a`), sin commits. La puerta de decisiones sigue cerrada, así que el alcance es solo B0. Entorno: `node_modules` era un symlink de WSL y `node.exe` no lo sigue; lo reemplacé por una junction (`mklink /J`) y verifiqué vitest con `design-guards.test.ts` (9/9 en verde).
- **L3 (2026-11-05, B0.2 entregado):** `80b05c2` en `chore/proyectos-v3-guardas` (3 archivos, +212). `src/components/proyectos-v3/import-guards.ts` define la frontera y `import-guards.test.ts` la ejerce sobre las fuentes reales: v1 no importa `proyectos-v3` y v3 solo reutiliza `project-display` de `src/components/proyectos/`. Los especificadores se leen con el escáner de TypeScript, así que `export … from`, `require` e `import()` dinámico también cuentan. RED observado dos veces: primero la prueba no resolvía `./import-guards`; después, con una violación real temporal dentro de `proyectos-v3/`, la prueba falló con el mensaje exacto y el archivo se borró. Vitest 8/8, `tsc` 0, `eslint` 0. **Riesgos: ninguno** — no toca código de app ni cambia la bandera, así que con `FEATURE_PROYECTOS_V3=off` v1 queda igual que en `main`. La dirección v1→v3 se prueba con fixtures sintéticos y no con una violación real, porque crear un archivo en `src/components/proyectos/**` está fuera de mi zona (S4).
