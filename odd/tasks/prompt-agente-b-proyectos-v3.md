# Instrucciones para el agente B — Proyectos v3

> Pega este archivo completo al iniciar la sesión de Claude Code en el worktree `.claude/worktrees/proyectos-v3`,
> creado desde `main` actualizado. El agente A trabaja al mismo tiempo en el backlog, en el repositorio principal.

## Tu papel

Eres el **agente B**. Preparas la nueva sección de Proyectos (**Proyectos v3**) al lado de la actual, apagada con una
bandera. El backlog (agente A) tiene **prioridad**: nunca lo bloqueas ni tocas su zona.

**Ahora solo haces B0, la base técnica.** No construyes pantallas de v3 hasta que Adrián marque la puerta de
decisiones como **abierta** en `odd/tasks/proyectos-v3.md` (Spec S3). Si terminas B0 antes, **te detienes** y lo
informas. No construyes nada con supuestos.

## Por qué «v3»

En el código, «v2» ya es la sección de Proyectos en producción (`feat/projects-v2`, «Portafolio v2»,
`e2e/proyectos-v2/`). La sección nueva se llama **v3** en ramas, carpetas, ruta y bandera. El prototipo de referencia se
llama `proyectos-v2-prototipo.html`, pero muestra la misma sección.

## Lee antes de empezar

1. `AGENTS.md` y `CLAUDE.md`. Next.js 16 tiene cambios: lee la guía en `node_modules/next/dist/docs/` antes de escribir
   rutas, layouts o `notFound()`. `.env` es **producción**: nunca lo uses; cualquier script de datos carga `.env.local`
   de forma explícita.
2. `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md` completo. Es tu contrato.
3. `docs/ux-crm-2026-11/rediseno-ciclo-proyecto.md` (qué cambia y por qué) y `proyectos-v2-prototipo.html` (cómo se
   ve; ábrelo en el navegador).
4. `odd/tasks/backlog-completo-2026-11.md`, solo **L4, L6 y L11** (entorno: `node.exe`, junction de `node_modules`,
   `tsc` y `eslint` con `node node_modules/...`, nunca aceptar `migrate reset`).
5. Para entender lo existente: `src/app/(app)/layout.tsx` (`requireUser()`), `src/app/(app)/proyectos/page.tsx`,
   `src/hooks/projects.ts`, `src/lib/proyectos/` y `src/components/proyectos/design-guards.test.ts` (modelo para la
   prueba guardiana).

## Tu zona

Puedes crear y editar **solo**:

- `src/app/(app)/proyectos-v3/**`
- `src/components/proyectos-v3/**` (los hooks nuevos van en `src/components/proyectos-v3/data/`)
- `e2e/proyectos-v3/**`
- `src/lib/flags.ts` (y su prueba)
- `odd/tasks/proyectos-v3.md` y `odd/tasks/proyectos-v3-contratos.md`
- un modo `v3` en `.claude/qa/capturar.mjs`, sin cambiar los modos existentes

**No edites** nada más: ni `src/components/proyectos/**`, ni `src/app/api/**`, ni `src/lib/proyectos/**`, ni
`prisma/**`, ni `src/hooks/projects.ts`, ni `src/components/ui/**`, ni `src/lib/nav.ts`, ni `globals.css`, ni
`eslint.config.mjs`, ni los planes. Si necesitas un cambio ahí, escríbelo en tu Log como «**Pedido a A**»: qué, por
qué y para qué unidad. Adrián se lo pasa a A.

## B0, unidad por unidad

Sigue la tabla B0 de la sección 6 del plan paralelo. Una rama y un PR chico por unidad, **siempre desde `main`**, sin
apilar:

1. **B0.1** `feat/proyectos-v3-bandera`: `src/lib/flags.ts` lee `FEATURE_PROYECTOS_V3` (`off` por defecto, `admin`,
   `on`; cualquier otro valor cuenta como `off`). La ruta `proyectos-v3` muestra «En construcción» y responde 404 si
   la bandera no deja pasar al rol del usuario. `admin` = Administración y Gerencia (confirma los nombres de rol en
   `src/lib/permissions.ts`). Pruebas de los tres modos.
2. **B0.2** `chore/proyectos-v3-guardas`: prueba guardiana. v1 no importa nada de `proyectos-v3`; v3 importa de
   `src/components/proyectos/` solo una lista permitida de módulos puros (por ejemplo `project-display.ts`).
3. **B0.4** `docs/proyectos-v3-contratos`: inventario de contratos (pantalla o acción → endpoint u hook actual, o
   hueco → quién lo construye → qué decisión espera).
4. **B0.3** `feat/proyectos-v3-datos`, **B0.5** `feat/proyectos-v3-piezas` y **B0.6** `test/proyectos-v3-e2e`:
   empiezan cuando el paso 0 de A esté en `main` (diálogos T3 y textos T8). En B0.5, nada de reglas de negocio ni
   textos finales: los textos dependen del glosario D-G1.

**Terminado, para cada unidad:** pruebas primero (RED → GREEN); `tsc` y `eslint` en cero; con la bandera en `off`, la
app se comporta exactamente igual que en `main`; una línea en tu Log con commit, pruebas y riesgos; actualiza tu tabla
de Tasks.

## Reglas del entorno

- `next dev -p 3001` (A usa el 3000).
- La base local de Docker se comparte con A. En B0 **solo lees**: nada de seeds, resets, migraciones ni scripts de
  datos.
- Cuando entre a `main` algo de una zona compartida (API, reglas, migraciones, `ui/`), rebasa ese mismo día tus ramas
  abiertas.
- **Push, PR y merge los decide Adrián.** Tú dejas la rama lista y le dices cómo revisarla.
- **Nada en producción.** No toques variables de entorno de Vercel ni de ningún otro entorno.
- No leas ni imprimas `.env*`, contraseñas ni tokens. Usa solo los datos ficticios de la base demo.

## Cuándo parar y preguntar

- Terminaste B0 y la puerta sigue cerrada: **te detienes**, escribes el resumen en tu Log y avisas.
- Necesitas tocar algo fuera de tu zona.
- Una decisión de la PO que no está anotada en la sección 4 del plan principal.
- Algo de la app actual (v1) cambiaría con la bandera en `off`.
