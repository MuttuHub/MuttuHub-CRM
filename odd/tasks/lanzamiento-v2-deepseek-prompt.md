# Prompt para DeepSeek: rediseño de la ficha del proyecto, parte 2 (carril X)

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en tu sesión de DeepSeek. El agente trabaja en el
worktree `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux`, en la rama `feat/ficha-ux-finanzas`.

---

## Rol

Eres un desarrollador frontend sénior. Trabajas en MuttuHub CRM: Next.js 16, React, TypeScript, Tailwind, TanStack
Query y Vitest con Testing Library. Hay otro agente (Claude) trabajando en paralelo en otra carpeta y otra rama. Tu
trabajo se integra después en la rama de Claude, así que **no puedes tocar nada fuera de tu superficie**.

## Contexto

Los usuarios encuentran la ficha del proyecto difícil de usar: tiene 11 pestañas y repite datos. Se aprobó reducirla a 5
pestañas: Resumen, Actividades, Finanzas, Documentos e Historial. Claude construye el encabezado, Resumen y Actividades,
y monta tus componentes. **Tú construyes Finanzas, Documentos e Historial**, como componentes nuevos que se montan solos.

Lee primero `odd/tasks/lanzamiento-v2-fin-de-semana.md`, en las secciones «Carril U», «Carril X» y «Decisiones». Lee
también `AGENTS.md`: esta versión de Next.js tiene cambios importantes, así que consulta `node_modules/next/dist/docs/`
antes de usar cualquier API de Next.js. Tus componentes son de cliente y no deberían necesitarla.

## Preparación (una sola vez)

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux
git status                      # debe decir: On branch feat/ficha-ux-finanzas, limpio
npm ci                          # no modifica package-lock.json
npx tsc --noEmit                # línea base: sin errores
```

`.env.local` ya está copiado en el worktree. Si quieres ver la app: `npx next dev -p 3001`, y luego
`http://localhost:3001/proyectos`. Esa base de datos local es compartida: **solo navegas**.

## Superficie permitida

### Allowed edit surfaces

src/components/proyectos/ficha/ficha-finanzas.tsx
src/components/proyectos/ficha/ficha-finanzas.test.tsx
src/components/proyectos/ficha/ficha-documentos.tsx
src/components/proyectos/ficha/ficha-documentos.test.tsx
src/components/proyectos/ficha/ficha-historial.tsx
src/components/proyectos/ficha/ficha-historial.test.tsx
src/components/proyectos/project-financiero.tsx
src/components/proyectos/project-financiero.test.tsx
src/components/proyectos/project-presupuesto.tsx
src/components/proyectos/project-presupuesto.test.tsx
src/components/proyectos/presupuesto-programacion.tsx
src/components/proyectos/presupuesto-programacion.test.tsx
src/components/proyectos/tacometro.tsx
src/components/proyectos/tacometro.test.tsx
src/components/proyectos/project-gastos.tsx
src/components/proyectos/project-gastos.test.tsx
src/components/proyectos/gastos-kpis.tsx
src/components/proyectos/gastos-kpis.test.tsx
src/components/proyectos/gasto-*.tsx
src/components/proyectos/gasto-*.test.tsx
src/components/proyectos/project-soportes.tsx
src/components/proyectos/project-soportes.test.tsx
src/components/proyectos/project-modificaciones.tsx
src/components/proyectos/project-modificaciones.test.tsx
src/components/proyectos/project-versiones.tsx
src/components/proyectos/project-versiones.test.tsx
odd/tasks/lanzamiento-v2-deepseek-log.md

### Prohibido

- `project-ficha.tsx`. Claude monta tus componentes ahí.
- `src/hooks/**`, `src/lib/**`, `src/app/**` y la API.
- `prisma/**`, `scripts/**`, `package.json` y `package-lock.json`.
- Cualquier otro archivo de `src/components/**`.
- `prisma migrate`, `prisma db push`, `migrate reset`, cualquier seed y la suite completa (`npx vitest run` sin ruta).
- `git push`, `git merge`, `git rebase` y escribir en la rama `feat/projects-v2`.

Si necesitas un dato que la API o un hook no entregan, **no lo agregues**. Anótalo en el log como «PEDIDO A CLAUDE» y
sigue con lo demás.

## Contrato de los componentes que creas

Los tres reciben el proyecto ya cargado y se montan dentro de un `TabsContent` de la ficha:

```tsx
import type { ProjectListRow } from "@/hooks/projects";

export function FichaFinanzas({ proyecto }: { proyecto: ProjectListRow }): JSX.Element
export function FichaDocumentos({ proyecto }: { proyecto: ProjectListRow }): JSX.Element
export function FichaHistorial({ proyecto }: { proyecto: ProjectListRow }): JSX.Element
```

Así se monta hoy cada pieza (`project-ficha.tsx`). Usa esto para componer:

- `<ProjectFinanciero proyecto={proyecto} />` y `<ProjectPresupuesto proyecto={proyecto} />`
- `<ProjectGastos proyecto={proyecto} />`
- `<ProjectSoportes proyectoId={proyecto.id} />`
- `<ProjectModificaciones proyecto={proyecto} />`, `<ProjectVersiones proyecto={proyecto} />` y
  `<ProjectHistorial proyecto={proyecto} />` (desde `@/components/proyectos/project-historial`)

## Tareas, en este orden

Haz un commit por tarea. Sigue el ciclo test-first: primero la prueba que falla (RED), después el código (GREEN). Toma
como modelo las pruebas existentes, por ejemplo `project-gastos.test.tsx`.

**X1 · Etiqueta «Observado» → «Pendiente por revisión».** Cambia solo el texto visible: el chip de filtro en
`project-gastos.tsx:51` y el KPI en `gastos-kpis.tsx:100`. Actualiza las pruebas que leen el texto
(`project-gastos.test.tsx:281` y `:326-348`). No cambies la clave del filtro, `data-observado`, `esObservado` ni
ningún tipo.
Commit: `fix(proyectos): rename the observed expense label to pending review`.

**X2 · `FichaFinanzas`.** Va en `src/components/proyectos/ficha/ficha-finanzas.tsx`.

- Arriba lleva un selector segmentado. Usa `Tabs` de `@/components/ui/tabs` con `variant="pill"` en `TabsList`.
- Las opciones son **Resumen**, que compone `ProjectFinanciero`; **Gastos**, que compone `ProjectGastos`; y
  **Presupuesto**, que compone `ProjectPresupuesto`.
- Abre por defecto en Presupuesto si `proyecto.estado === "BORRADOR"`, y en Resumen en cualquier otro estado.
- Solo se monta el segmento activo, igual que las pestañas de la ficha.

Pruebas: el segmento por defecto según el estado, el cambio de segmento y que solo se monte el activo (mockea los tres
hijos).
Commit: `feat(proyectos): add the finance tab that groups summary, expenses and budget`.

**X3 · Finanzas más simples.**

- En `project-financiero.tsx`, reemplaza el tacómetro por una barra horizontal. Muestra lo ejecutado, una marca para lo
  programado y el total asignado, con una frase debajo, por ejemplo: «Ejecutado $12.400.000 de $15.000.000
  programados (83 %) · Asignado $40.000.000». El color sigue saliendo del servidor (`color` del semáforo financiero),
  **no lo recalcules**.
- Los selectores de corte y de base («vigente» u «original») pasan a un bloque plegable «Opciones avanzadas», cerrado por
  defecto, con sus valores por defecto actuales.
- En `project-gastos.tsx` quita la fila de KPI (`gastos-kpis`) si repite totales de Resumen. Deja solo los conteos por
  estado que sirven para filtrar.

Accesibilidad: la barra tiene `role="img"` y un `aria-label` con la misma frase. El plegable se maneja con teclado.
Commit: `refactor(proyectos): simplify the finance view with a progress bar and advanced options`.

**X4 · Montos legibles en Presupuesto.**

- Los campos de dinero de `project-presupuesto.tsx` y `presupuesto-programacion.tsx` muestran separador de miles
  (`1.234.567`) mientras se escribe, pero el valor que se envía sigue siendo numérico.
- Los meses se ven legibles («ene 2026», no `2026-01`).
- Reutiliza `formatCOP`/`toCents` de `@/lib/proyectos/money` sin modificarlos.

Commit: `feat(proyectos): format money inputs and months in the budget`.

**X5 · `FichaDocumentos`.**

- Una sola lista con todos los soportes del proyecto, agrupada por origen. `useProjectSupports(id)` ya devuelve
  `ProjectSupport[]` con `origen: "avance" | "indicador" | "gasto" | "proyecto"`.
- Los grupos son «Actividades» (`avance`), «Indicadores», «Gastos» y «Proyecto».
- Arriba lleva un filtro por origen y un buscador por nombre.
- Reutiliza el formato y las acciones de `project-soportes.tsx`.
- Incluye estados de carga, error y vacío.

No necesitas API nueva.
Commit: `feat(proyectos): add the documents tab with every project support grouped by origin`.

**X6 · `FichaHistorial`.** Selector segmentado (`variant="pill"`) con las opciones Modificaciones
(`ProjectModificaciones`), Versiones (`ProjectVersiones`) y Auditoría (`ProjectHistorial`). Abre en Modificaciones.
Commit: `feat(proyectos): add the history tab with modifications, versions and audit`.

## Reglas de diseño

- El texto de la interfaz va en español neutro, corto y en voz activa. Los identificadores y comentarios siguen el
  idioma del archivo que tocas.
- Reutiliza las piezas que ya existen: `SectionHeader`, `EmptyBlock` (`@/components/proyectos/ui`), `StatusChip`,
  `Skeleton`, `Button`, `Tabs` y los tokens de color `ink-*`, `panel` y `destructivo`. **No** uses colores hex sueltos,
  **no** pongas tarjetas dentro de tarjetas y **no** agregues dependencias.
- Tiene que verse bien a 390 px de ancho, sin scroll horizontal de la página, y en tema claro y oscuro.
- Se ve una sola acción principal por vista.

## Verificación (antes de cada commit)

```bash
TZ=America/Bogota npx vitest run src/components/proyectos/ficha src/components/proyectos/project-financiero src/components/proyectos/project-presupuesto src/components/proyectos/presupuesto-programacion src/components/proyectos/project-gastos src/components/proyectos/gastos-kpis src/components/proyectos/project-soportes src/components/proyectos/project-modificaciones src/components/proyectos/project-versiones src/components/proyectos/tacometro
npx tsc --noEmit
npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx
```

Las tres tienen que quedar en verde. Si una prueba ya fallaba antes de tu cambio, anótala en el log con su nombre exacto
y no la «arregles» fuera de tu superficie.

## Commits

Usa Conventional Commits en inglés y en imperativo. **Sin** `Co-Authored-By` y sin mencionar IA. Haz un commit por
tarea en `feat/ficha-ux-finanzas`, y no hagas push.

## Log de entrega

Lleva `odd/tasks/lanzamiento-v2-deepseek-log.md` con una entrada por tarea. Cada entrada tiene el ID, el hash del commit,
los archivos tocados, el resultado de las tres verificaciones y los «PEDIDO A CLAUDE».

La integración es **progresiva**: Claude incorpora a su rama cada tarea apenas termina.

- Cierra cada tarea con su commit del código **y** la entrada del log en el mismo commit, terminada en
  `LISTO PARA INTEGRAR: Xn`.
- Nunca dejes un commit a medias en la rama: cada commit tiene que compilar y pasar sus pruebas.
- No hagas merge ni rebase desde `feat/projects-v2`. Tu superficie no se cruza con la de Claude, así que no lo
  necesitas.

Al terminar X6 escribe «LISTO PARA INTEGRAR: TODO» y detente. Si encuentras una decisión de producto que no está en el
plan, anótala como «PREGUNTA» y sigue con lo que no dependa de ella.
