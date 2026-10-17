# Prompt para DeepSeek: lote 5 (carril V, correcciones menores para después del lanzamiento)

Copia todo lo que está debajo de la línea y pégalo en tu sesión de DeepSeek. El agente trabaja en el mismo worktree,
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux`, en una **rama nueva**: `feat/deepseek-lote-5`.

**Este lote NO entra en el lanzamiento del domingo.** Claude lo integra después de que v2 esté en producción.

---

## Rol

Eres un desarrollador frontend sénior en MuttuHub CRM: Next.js 16, React, TypeScript, Tailwind, TanStack Query y Vitest
con Testing Library. Corriges los hallazgos de gravedad **baja** que tú mismo reportaste en los lotes Z y W.

## Preparación (una sola vez)

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux
git status                                   # debe estar limpio
git switch -c feat/deepseek-lote-5 feat/projects-v2
npm ci                                       # no modifica el lockfile
npx prisma generate                          # no toca la base
npx tsc --noEmit                             # línea base: sin errores
```

Lee `AGENTS.md`. Esta versión de Next.js tiene cambios importantes: antes de usar APIs de Next, consulta la guía en
`node_modules/next/dist/docs/`.

## Qué corregir

Los hallazgos de gravedad **baja** de `odd/tasks/lanzamiento-v2-deepseek-log.md`, secciones Z1 a Z5 y W1:
- Z1-6 a Z1-13;
- Z2-6 a Z2-10;
- Z3-9 a Z3-12;
- Z4-3 a Z4-6;
- Z5-7, Z5-8, Z5-9 y Z5-11;
- las dos bajas de W1: las pruebas que faltan.

**Antes de cada uno, verifica contra el código actual.** Varios archivos cambiaron el viernes (correcciones ZF y R6c a
R6e), así que un hallazgo puede estar ya resuelto o haber cambiado de línea. Si ya está resuelto, anótalo como
«ya resuelto» y no lo toques.

Las bajas de W2 (el runbook) ya están corregidas: no las toques.

## Superficie permitida

### Allowed edit surfaces

src/components/proyectos/project-list.tsx
src/components/proyectos/project-list.test.tsx
src/components/proyectos/project-financiero.tsx
src/components/proyectos/project-financiero.test.tsx
src/components/proyectos/ejecucion-avance.tsx
src/components/proyectos/ejecucion-avance.test.tsx
src/components/proyectos/project-ficha.tsx
src/components/proyectos/project-ficha.test.tsx
src/components/proyectos/project-ejecucion.tsx
src/components/proyectos/project-ejecucion.test.tsx
src/components/proyectos/print/project-print-sheet.tsx
src/components/proyectos/print/project-print-sheet.test.tsx
src/components/proyectos/nuevo-proyecto/paso-revision.tsx
src/components/proyectos/nuevo-proyecto/paso-revision.test.tsx
src/components/proyectos/ficha/ficha-resumen.tsx
src/components/proyectos/ficha/ficha-resumen.test.tsx
src/components/proyectos/ficha/ficha-header.tsx
src/components/proyectos/ficha/ficha-header.test.tsx
src/components/proyectos/ficha/ficha-documentos.tsx
src/components/proyectos/ficha/ficha-documentos.test.tsx
src/components/proyectos/ficha/actividades-tablero.tsx
src/components/proyectos/ficha/actividades-tablero.test.tsx
src/components/proyectos/estructura-gantt.tsx
src/components/proyectos/estructura-gantt.test.tsx
src/components/proyectos/curve-s-chart.tsx
src/components/proyectos/curve-s-chart.test.tsx
src/components/dashboard/dashboard-page.tsx
src/components/dashboard/dashboard-page.test.tsx
src/components/crm/client-list.tsx
src/components/crm/client-list.test.tsx
src/components/crm/shared.tsx
src/components/crm/shared.test.tsx
src/components/crm/client-sheet.tsx
src/components/crm/client-sheet.test.tsx
src/components/crm/client-form.test.tsx
src/components/crm/saved-views.test.tsx
prisma/v1-production-shape.invariant.test.ts
odd/tasks/lanzamiento-v2-deepseek-log.md

### Prohibido

- Cualquier archivo fuera de esa lista. En particular `prisma/migrations/**` (nunca se edita una migración ya
  aplicada), `prisma/schema.prisma`, `src/app/api/**`, `src/lib/**`, `src/hooks/**`, `docs/**`, `package.json` y el
  lockfile.
- `prisma migrate`, `db push`, `reset` y cualquier seed. La prueba invariante de W1 corre sola contra la base local
  (54322) y solo con `--no-file-parallelism`. **Nunca** leas el `.env` de la raíz: es producción.
- `git push`, `git merge`, `git rebase`, `git add -A` y `git add .`.
- Cambiar el nombre de un concepto en la interfaz («Aliados», «compromiso», «metas»). Esos cambios son decisiones de
  producto pendientes. Si un hallazgo depende de eso, anótalo como «PREGUNTA» y sigue.

Si un arreglo necesita un archivo fuera de la superficie, anótalo en el log como «PEDIDO A CLAUDE» y sigue con lo demás.

## Cómo trabajar

- Un commit por grupo coherente, con sus pruebas. Mensajes Conventional Commits en inglés, por ejemplo
  `fix(proyectos): …`, `fix(crm): …`, `test(…): …`, y **sin** `Co-Authored-By`.
- Test-first cuando haya una prueba ejecutable: primero la prueba que falla (RED) y después el código (GREEN).
- Los textos de la interfaz quedan en español, coherentes con el resto de la app. El código, los comentarios y los
  nombres de prueba van en inglés.

Después de cada commit corre las verificaciones y anótalas:

1. `TZ=America/Bogota npx vitest run <archivos de prueba tocados>`.
2. `npx tsc --noEmit`, sin correrlo al mismo tiempo que vitest, porque eso produce timeouts falsos.
3. `npx eslint <archivos tocados>`.

## Cómo reportar

Agrega al log una sección `## V · Correcciones menores` con esta tabla:

| Hallazgo | Veredicto | Commit | Nota |
|---|---|---|---|

El veredicto es uno de: `corregido`, `ya resuelto`, `falso positivo`, `PREGUNTA` o `PEDIDO A CLAUDE`.

Al terminar, escribe `LISTO PARA INTEGRAR: TODO LOTE 5`.
