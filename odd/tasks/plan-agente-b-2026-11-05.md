# Plan para el agente B (Gentle Shell) — 2026-11-05

> Pega este archivo completo en la sesión de Gentle Shell (pi, `deepseek-v4.1-flash`) que trabaja en
> `.claude/worktrees/proyectos-v3`. Reemplaza las instrucciones de arranque de hoy donde las contradiga. Sigue
> valiendo `odd/tasks/prompt-agente-b-proyectos-v3.md` para todo lo demás (zona, entorno, cómo probar).

## 1. Dónde estamos

| Qué | Estado |
|---|---|
| B0.1 bandera (`feat/proyectos-v3-bandera`, `4863dd3`) | Subida, **PR #139** |
| B0.2 guardia (`chore/proyectos-v3-guardas`, `80b05c2` + 2 commits de docs) | Subida hasta `206f671`, **PR #140** |
| Pieza `lista-verificacion` (`54f4a24`) | Solo local, en la rama de B0.2 |
| B0.4 contratos (`docs/proyectos-v3-contratos`, `4c9349e`) | Subida, **PR #141** |
| `main` | **En rojo** por `control-guards` (botón de carpetas en documentos). Lo arregla el **PR #142** de A |

Los PR #139 a #141 se quedan abiertos tal como están. Nadie los cierra ni los rehace.

## 2. Reglas que se corrigen hoy

1. **Push, PR y merge los decide Adrián, siempre.** Antes de cualquier `git push` o `gh pr …`, detente y pide el visto
   bueno en el chat. Un permiso de la herramienta («Allow guarded git push?») no es el visto bueno de Adrián.
2. **La puerta de decisiones está CERRADA.** Vale el plan paralelo (`plan-paralelo-backlog-proyectos-v3.md`,
   2026-11-04 22:11): solo B0; ninguna pantalla de v3 (B1 a B8) hasta que Adrián marque la puerta como abierta. El
   texto «ABIERTA PARA LOCAL» de S3 (20:27) quedó superado; A lo corrige en el tracker.
3. **Un solo tracker.** El tracker de v3 es `odd/tasks/proyectos-v3.md` **del repo principal**
   (`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM/odd/tasks/proyectos-v3.md`, rama `docs/plan-backlog-completo`,
   PR #138). Es el único archivo fuera de tu worktree que puedes editar. **No lo commiteas:** lo commitea A. Tus
   ramas de código no llevan ninguna copia del tracker.
4. **Nunca** leas ni uses `.env` ni `.env.local`. B0 no necesita base de datos.

## 3. Tareas, en orden

| ID | Qué | Terminado cuando |
|---|---|---|
| G1 | Responde **No** al push pendiente («reconcile the v3 tracker…»). Deja tu reconciliación sin commitear. | No hay push ni commit nuevo del tracker en `chore/proyectos-v3-guardas` |
| G2 | En `chore/proyectos-v3-guardas`, un commit que **borre** `odd/tasks/proyectos-v3.md` de esa rama (`git rm`), con el mensaje `docs(odd): move the v3 tracker back to the backlog docs branch`. | `git diff --stat main..HEAD` no menciona `odd/` |
| G3 | Pasa tu reconciliación al tracker del repo principal: tus specs (S4 en adelante) y tu Log **después** de las entradas de A, con números que sigan a los de A (L5, L6…). No reescribas S1 a S3 ni los L de A. | El tracker principal tiene tus entradas; `git status` del repo principal solo muestra ese archivo como modificado por ti |
| G4 | **Pieza `lista-verificacion` (`54f4a24`):** se queda en la rama de B0.2, porque `surface-guards` exige un `.tsx` en cada carpeta de `src/components` y sin ella el PR #140 falla en CI. En el tracker, anótala como parte de B0.2 («pieza mínima para `surface-guards`»), no como B0.5 empezado. | Tracker actualizado; la pieza sigue sin reglas ni textos finales |
| G5 | Pide a Adrián el visto bueno para subir G2 y `54f4a24` al PR #140. Solo con su OK: `git push`. | El PR #140 tiene la pieza y no tiene el tracker |
| G6 | Cuando el PR #142 esté en `main`, avisa: el CI de #139 a #141 se vuelve a correr y debería quedar en verde. Si alguno sigue en rojo, anota la prueba exacta como «Pedido a A». | CI de #139–#141 verde, o el pedido anotado |

## 4. Lo que sigue bloqueado

- **B0.3, B0.5 (el resto de las piezas) y B0.6** esperan el paso 0 de A: que T3 (diálogos, PR #134) y T8 (textos de
  Proyectos, PRs #132 y #135) estén en `main`. Cuando lo estén, cada unidad sale en **su propia rama desde `main`**,
  sin apilar, como dice la sección 6 del plan paralelo.
- **B1 a B8:** puerta cerrada.
- **Los 14 pedidos a A** de `odd/tasks/proyectos-v3-contratos.md` los revisa A. No los implementes tú.

## 5. Cuándo te detienes

- Al terminar G1 a G4: escribe el resumen en el Log del tracker principal y pide el OK de G5.
- Antes de cualquier push, PR o merge.
- Si algo te pide tocar fuera de tu zona, o una decisión de la PO que no está anotada.
- Si una prueba falla en `main` y no es de tu zona: «Pedido a A», no la arreglas.
