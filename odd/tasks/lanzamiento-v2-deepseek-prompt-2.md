# Prompt para DeepSeek: lote 2 (carril Y)

Copia todo lo que está debajo de la línea y pégalo en tu sesión de DeepSeek. Puede ser la misma sesión o una nueva. El
agente trabaja en el mismo worktree, `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux`, pero en una
**rama nueva**: `feat/deepseek-lote-2`.

---

## Rol

Eres un desarrollador frontend sénior en MuttuHub CRM: Next.js 16, React, TypeScript, Tailwind, TanStack Query y Vitest
con Testing Library. Claude trabaja en paralelo en otra carpeta e integra tu rama tarea por tarea. **No toques nada fuera
de tu superficie.**

## Preparación (una sola vez)

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux
git status                      # debe decir: On branch feat/deepseek-lote-2, limpio
npm ci                          # por si cambió el lockfile; no lo modifica
npx prisma generate             # el esquema tiene campos nuevos; no toca la base
npx tsc --noEmit                # línea base: sin errores
```

Lee `AGENTS.md`. Esta versión de Next.js tiene cambios importantes: antes de usar `redirect`, `Link`, `useRouter` o
`useSearchParams`, consulta la guía en `node_modules/next/dist/docs/`. Lee también
`odd/tasks/lanzamiento-v2-fin-de-semana.md`, en las secciones «Decisiones» y «Carril Y».

## Superficie permitida

### Allowed edit surfaces

src/components/proyectos/project-list.tsx
src/components/proyectos/project-list.test.tsx
src/components/proyectos/portafolio-filtros.tsx
src/components/proyectos/portafolio-filtros.test.tsx
src/components/crm/clientes-subnav.tsx
src/components/crm/clientes-subnav.test.tsx
src/app/(app)/clientes/oportunidades/page.tsx
src/app/(app)/clientes/mapa/page.tsx
src/components/crm/client-sheet.tsx
src/components/crm/client-sheet.test.tsx
src/components/crm/client-form.tsx
src/components/crm/client-form.test.tsx
odd/tasks/lanzamiento-v2-deepseek-log.md

### Prohibido

- `src/hooks/**`, `src/lib/**`, `src/app/api/**`, `prisma/**`, `scripts/**`, `package.json` y `package-lock.json`.
- Cualquier otro archivo de `src/components/**`.
- `prisma migrate`, `db push`, `reset`, cualquier seed y la suite completa.
- `git push`, `git merge` y `git rebase`.

Si te falta un dato que la API o un hook no entregan, anótalo en el log como «PEDIDO A CLAUDE» y sigue con lo demás.

## Tareas, en este orden

Haz un commit por tarea y sigue el ciclo test-first: primero la prueba que falla (RED), después el código (GREEN).

**Y1 · Filtros del portafolio (RF-31).** Hoy la lista de proyectos (`project-list.tsx`) solo filtra por estado. La API
y el hook ya aceptan más filtros: `useProjects(filters)` con `ProjectFilters = { estado, cliente_id, linea_id,
municipio_id, responsable_id }`.

- Agrega cuatro filtros: **Cliente**, **Línea estratégica**, **Municipio** y **Responsable**.
- Las opciones salen de hooks que ya existen: `useClientOptions` (`src/hooks/kanban.ts`), `useStrategicLines` y
  `useMunicipalities` (`src/hooks/projects.ts`) y `useUsers` (`src/hooks/crm.ts`). Verifica la forma de cada respuesta
  antes de usarla.
- Puedes poner los filtros en un componente nuevo, `portafolio-filtros.tsx`.
- Agrega un botón «Limpiar filtros», visible solo si hay alguno activo.
- En móvil (390 px), los filtros caben en una o dos filas, o van en un plegable «Filtros (n)».
- No cambies `kpiLista = useProjects({})`.

Commit: `feat(proyectos): filter the portfolio by client, line, municipality and owner`.

**Y2 · Fecha de primer contacto legible (D2).** En la ficha del cliente (`client-sheet.tsx`) la fecha de primer contacto
se muestra en crudo, en formato ISO. Muéstrala como día legible en UTC, igual que `src/components/crm/print-ficha.tsx`
(~línea 177), reutilizando su mismo formateador si se puede importar sin tocar archivos prohibidos. Revisa también
`client-form.tsx` por si muestra la misma fecha en crudo fuera del input.

Commit: `fix(crm): show the first contact date as a readable day`.

**Y3 · Ocultar las pestañas vacías de Clientes (M4).** En `clientes-subnav.tsx`, quita **Oportunidades** y **Mapa** de
`CLIENTES_SECTIONS`, porque hoy solo muestran «Llega en la siguiente entrega». Las otras cuatro pestañas se quedan. Sus
páginas (`src/app/(app)/clientes/oportunidades/page.tsx` y `mapa/page.tsx`) redirigen a `/clientes` con el `redirect`
de Next.js; lee la guía antes. Actualiza las pruebas del subnav.

Commit: `feat(crm): hide the client sections that are not built yet`.

## Reglas de diseño

- El texto de la interfaz va en español neutro, corto y en voz activa. Los identificadores y comentarios siguen el idioma
  de cada archivo.
- Reutiliza las piezas que ya existen (`Select`, `Button`, `Input`, `StatusChip` y los tokens `ink-*`/`panel`). No
  uses colores hex sueltos ni agregues dependencias.
- Funciona a 390 px de ancho, sin scroll horizontal de la página, y en tema claro y oscuro.

## Verificación (antes de cada commit)

```bash
TZ=America/Bogota npx vitest run src/components/proyectos/project-list src/components/proyectos/portafolio-filtros src/components/crm "src/app/(app)/clientes"
npx tsc --noEmit
npx eslint <cada archivo que tocaste>
```

Las tres tienen que quedar en verde. Si una prueba ya fallaba antes de tu cambio, anótala en el log con su nombre exacto.

## Commits y log

- Commits en Conventional Commits, en inglés y en imperativo. **Sin** `Co-Authored-By` y sin mencionar IA. Uno por
  tarea, en `feat/deepseek-lote-2`, sin push.
- Agrega tus entradas al final de `odd/tasks/lanzamiento-v2-deepseek-log.md`, bajo un título «Lote 2». Cada tarea va
  con su código y su entrada del log **en el mismo commit**, y la entrada termina en `LISTO PARA INTEGRAR: Yn`.
- Al terminar Y3 escribe `LISTO PARA INTEGRAR: TODO LOTE 2` y detente.
