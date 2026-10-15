# Log de entrega — DeepSeek (carril X)

Rama: `feat/ficha-ux-finanzas` · Worktree: `../MuttuHub-CRM-worktrees/ficha-ux` · Locator: `odd/tasks/lanzamiento-v2-deepseek-log.md`

Superficie: solo los archivos del carril X. Cada tarea se cierra con un commit que lleva el código y esta entrada.
Verificaciones por tarea: (1) `TZ=America/Bogota npx vitest run` sobre las rutas del carril, (2) `npx tsc --noEmit`,
(3) `npx eslint` sobre las rutas del carril. Convención del hash: cada entrada se cierra en su commit; el hash anotado
es el del commit antes del `--amend` final que incrusta el propio texto (el árbol solo cambia en este campo). No hay
push.

---

## X1 · «Observado» → «Pendiente por revisión»

- Commit: `8f28e7a` — `fix(proyectos): rename the observed expense label to pending review`
- Archivos tocados:
  - `src/components/proyectos/project-gastos.tsx` — texto visible del chip de filtro (`FILTRO_LABEL.OBSERVADOS`).
  - `src/components/proyectos/gastos-kpis.tsx` — texto visible del KPI.
  - `src/components/proyectos/project-gastos.test.tsx` — pruebas que leen el texto (chip y título).
  - `src/components/proyectos/gastos-kpis.test.tsx` — prueba que lee el texto.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril → 7 archivos, 101 pruebas, **verde**. La ruta
     `src/components/proyectos/ficha` aún no existe (se crea en X2) y no aporta archivos a esta corrida.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint` sobre `project-financiero.tsx`, `project-presupuesto.tsx`, `project-gastos.tsx` y `gastos-kpis.tsx`
     → **sin avisos** (la ruta `src/components/proyectos/ficha` se agrega desde X2).
- PEDIDO A CLAUDE: ninguno.
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X1

---

## X2 · `FichaFinanzas`

- Commit: `e21f99e` — `feat(proyectos): add the finance tab that groups summary, expenses and budget`
- Archivos tocados:
  - `src/components/proyectos/ficha/ficha-finanzas.tsx` — **nuevo**. Segmentado `variant="pill"` con Resumen
    (`ProjectFinanciero`), Gastos (`ProjectGastos`) y Presupuesto (`ProjectPresupuesto`). Abre en Presupuesto si el
    proyecto está en `BORRADOR`; en cualquier otro estado, en Resumen.
  - `src/components/proyectos/ficha/ficha-finanzas.test.tsx` — **nuevo**. Hijos burlados: segmento por defecto según
    estado, cambio de segmento, montaje solo del activo y teclado (flecha + Enter, activación manual de Base UI).
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril → 8 archivos, 107 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx
     src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno (el montaje del componente en `project-ficha.tsx` es la tarea U8 de Claude).
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X2
