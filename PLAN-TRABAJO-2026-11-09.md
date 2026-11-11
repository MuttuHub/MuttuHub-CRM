# Plan de trabajo — 2026-11-09

Copia local de `docs/plan-trabajo-restante.md` §12 (rama `fix/proyectos-ficha-prototipo`). Plan de limpieza: `docs/plan-limpieza-codigo.md`.

### Corte del 2026-11-08 y plan del 2026-11-09

### Hecho en esta jornada

Rama `fix/proyectos-ficha-prototipo` (sin push): T10 (lista de diferencias con el prototipo,
`docs/ux-crm-2026-11/t10-diferencias-prototipo.md`), T14 (cabecera común C1–C12), T11 (Documentos sin los puntos
de API), T12 (seguimientos de T8/T9 y código muerto) y T15 (ajustes S de Resumen, Finanzas e Historial). Pruebas:
`vitest --dir src` 399 archivos / 4767 pruebas, `tsc` 0, ESLint 0, e2e `proyectos-v2` 31/31. Revisión nativa en
cinco tramos, los cinco aprobados y confirmados; 26 observaciones no bloqueantes (L13 de
`odd/tasks/proyectos-redisenio-ui.md`). Detalle de cada tarea en ese mismo archivo.

### Plan del 2026-11-09

Pedido de la usuaria: «crea el plan de trabajo para mañana. Tambien quiero como limpiar la base de codigo, para que
las futuras modificaciones sean mas faciles de trabajar». El plan de limpieza completo está en
`docs/plan-limpieza-codigo.md`; mañana entran sus fases seguras (L0 a L2).

| Paso | Qué | Estimación |
|---|---|---|
| 1 | Nueva siembra local y revisión visual de las cinco pestañas a 1440 y 390 px contra el prototipo | 30–45 min |
| 2 | Push de `fix/proyectos-ficha-prototipo` y PR (excepción de tamaño, revisado por tramos); merge con CI en verde | 30 min + CI |
| 3 | PR chico con las WARNING útiles de la revisión: dos pruebas de la cabecera que verifican antes de que lleguen los permisos, regla única para «Registrar gasto» como principal, el error de presupuesto que tapa el formulario con datos en caché, y el `isPending` del tope | 1 h |
| 4 | **Limpieza L0:** decidir los 8 PRs abiertos (#130, #131, #133, #136, #137, #138, #143, #144: integrar, actualizar o cerrar); `git worktree prune` y borrar worktrees y ramas ya integradas | 1–1,5 h |
| 5 | **Limpieza L1:** `knip` en modo reporte en CI y `noUnusedLocals`/`noUnusedParameters` en `tsconfig` | 1 h |
| 6 | **Limpieza L2:** borrar los 7 archivos muertos y los exports muertos con sus pruebas; knip pasa a bloquear | 1–2 h |
| 7 | Mensaje a la PO con las decisiones abiertas: validar un gasto que supera lo asignado, «Opciones avanzadas», «Objetivo 1.» frente a «OE1.», chip «Umbrales sin confirmar», y las dos tomadas sin ella («Gerencia o Administración», municipios con departamento); sumar el formato canónico de fecha que necesita L3 | 20 min |

Si sobra tiempo: limpieza L3 empezando por los formateadores de `components/proyectos`, con el formato acordado.
Queda para después: lo que necesita la API (R5, F4, F10, F11, D6, D7, H7, H9), el resto de T13 y los ajustes S/M de
T15.

#### Cómo retomar

1. Worktree `.claude/worktrees/redisenio`, rama `fix/proyectos-ficha-prototipo`; Docker Desktop y Supabase local
   arriba; `next dev` desde ese worktree (si el puerto 3000 lo ocupa otro `next dev`, detenerlo primero).
2. Nueva siembra solo con `.env.local`: `prisma migrate reset --force` (sin `--skip-seed`, esta versión no lo acepta),
   luego `node.exe --env-file=.env.local node_modules/tsx/dist/cli.mjs prisma/seed.ts` y las siembras demo
   `seed-projects-demo --apply` y `seed-demo-flujo --apply`.
3. El id de PRY-2026-001 cambia con cada siembra; el script de capturas lo recibe como cuarto argumento.
