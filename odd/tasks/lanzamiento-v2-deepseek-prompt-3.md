# Prompt para DeepSeek: lote 3 (carril Z, revisión de solo lectura)

Copia todo lo que está debajo de la línea y pégalo en tu sesión de DeepSeek. El agente trabaja en el mismo worktree,
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux`, en una **rama nueva**: `feat/deepseek-revision`.

---

## Rol

Eres un revisor frontend sénior en MuttuHub CRM: Next.js 16, React, TypeScript, Tailwind, TanStack Query y Vitest con
Testing Library. El lanzamiento de v2 es el domingo y el código se congela el **sábado a las 12:00**. Tu trabajo es
**encontrar problemas, no corregirlos**: no cambias código. Claude decide qué se corrige antes del congelamiento.

Claude revisa en paralelo permisos por rol, migraciones y datos, dinero, y borrados o anulaciones. **No revises esos
temas**; si ves algo grave de ese tipo, anótalo en una línea y sigue.

## Preparación (una sola vez)

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux
git status                                   # debe estar limpio
git switch -c feat/deepseek-revision feat/projects-v2
npm ci                                       # no modifica el lockfile
npx prisma generate                          # no toca la base
```

Si existe una carpeta suelta `node_modules_stale_*`, bórrala con `rm -rf`. **Nunca** uses `git add -A` ni `git add .`.

Lee `AGENTS.md` y, en `odd/tasks/lanzamiento-v2-fin-de-semana.md`, las secciones «Decisiones» y los carriles U, X, F e
Y. Ahí está lo que se pidió; revisas contra eso.

## Superficie permitida

### Allowed edit surfaces

odd/tasks/lanzamiento-v2-deepseek-log.md

### Prohibido

- Cualquier otro archivo. No hay commits de código en este lote.
- `prisma migrate`, `db push`, `reset`, cualquier seed y la suite completa.
- `git push`, `git merge` y `git rebase`.

Puedes correr pruebas puntuales (`TZ=America/Bogota npx vitest run <archivos>`), `npx tsc --noEmit` y `npx eslint` sobre
rutas concretas. Puedes levantar la app en el puerto **3001** (`npm run dev -- -p 3001`) contra la Supabase local, solo
para navegar.

## Qué revisar

El alcance es `git diff main..feat/projects-v2 -- src/components src/app/'(app)'`. Prioriza la ficha de proyecto
(`src/components/proyectos/ficha/**`, `project-ficha.tsx`), el stepper de nuevo proyecto
(`src/components/proyectos/nuevo-proyecto/**`), el portafolio (`project-list.tsx`, `portafolio-filtros.tsx`) y Clientes
(`src/components/crm/**`).

**Z1 · Textos de la interfaz.** Español claro y consistente: el mismo concepto con el mismo nombre en todas partes
(por ejemplo «Beneficiarios», «Pendiente por revisión», «Registrar gasto»). Sin textos en inglés visibles, sin
`TODO`/`lorem`, sin mensajes de error técnicos mostrados al usuario, y con tildes correctas.

**Z2 · Accesibilidad.** Controles con nombre accesible (`aria-label` o `<label>`), botones de solo ícono con nombre,
orden de foco y teclado en pestañas, segmentados, menús y diálogos, foco devuelto al cerrar un diálogo, `role` correctos y
estados (`aria-selected`, `aria-expanded`) actualizados.

**Z3 · Estados y bordes.** Cada vista con carga, vacío y error: que no quede en blanco ni muestre `undefined`, `NaN` o
`null`. Montos y fechas formateados (pesos colombianos y zona `America/Bogota`). Listas largas y textos largos sin
desbordar.

**Z4 · Ancho angosto (390 px).** Lo que se sale de la pantalla, las tablas sin scroll horizontal propio y los botones
que se cortan. Revisa las clases de Tailwind y, si puedes, navega en 3001.

**Z5 · Calidad de las pruebas nuevas.** Pruebas que no prueban nada (sin `expect`, o que solo comprueban que algo se
renderiza), `skip`/`only` olvidados, dependencias de la hora real sin fijarla y burlas que esconden el comportamiento
que se dice probar.

## Cómo reportar

Un commit por tarea, **solo** del log: `git add odd/tasks/lanzamiento-v2-deepseek-log.md` y
`git commit -m "docs(odd): record review Zn findings"`.

Por cada tarea, una sección `## Zn · <tema>` en el log con una tabla:

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|

- **Gravedad:** `alta` si bloquea una tarea o muestra datos incorrectos; `media` si confunde o es inaccesible; `baja` si
  es pulido.
- Solo hallazgos que verificaste en el código o en la app. Nada de «podría».
- Máximo 15 hallazgos por tarea, ordenados de mayor a menor gravedad.

Al final de cada sección escribe `LISTO PARA INTEGRAR: Zn`. Al terminar las cinco, escribe
`LISTO PARA INTEGRAR: TODO LOTE 3`. Si te bloqueas, anota `PREGUNTA:` o `PEDIDO A CLAUDE:` en el log y sigue con la
siguiente tarea.

Orden: Z1, Z2, Z3, Z4, Z5. Si se acerca el sábado a las 10:00 sin terminar, cierra lo que tengas y escribe el
`LISTO` parcial.
