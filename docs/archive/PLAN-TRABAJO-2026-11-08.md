# Plan de trabajo — 2026-11-08

Copia local de `docs/plan-trabajo-restante.md` §11 (rama `docs/plan-2026-11-07`, PR #148, commit `a3b1871`). Detalle de cada tarea: `odd/tasks/proyectos-redisenio-ui.md` (T10–T13).


`main` en `6ff65e0`. CI de #147 en verde (`unit`, `e2e` y la vista previa de Vercel).

### Hecho en esta jornada

| PR | Qué |
|---|---|
| #147 | Rediseño de la ficha aprobado por la PO: Resumen y cabecera, Actividades, Finanzas, Documentos e Historial, en escritorio y celular. T8: «Revisar» visible en «Gastos por validar», con aviso de permisos para quien no puede validar. T9: «Registrar avance» y «Registrar gasto» abren su ventana desde cualquier pestaña. Sin migraciones ni cambios de API. Detalle: `odd/tasks/proyectos-redisenio-ui.md` |

Antes del merge se verificó la base local: 41 migraciones aplicadas («Database schema is up to date!»). Este cambio no
agrega ninguna. El PR entró solo, con excepción de tamaño, por decisión de la usuaria; el código se revisó por tramos.

### Plan del 2026-11-07 (se movió al 2026-11-08)

Pedido de la usuaria: «Deja listo el plan de trabajo para el dia de mañana». Hallazgo que lo motiva: «por ejemplo a
ficha de documentos todavia no está igual que en prototipo».

0. Rama nueva desde `main` y nueva siembra de la base local (las corridas e2e dejaron gastos y soportes «E2E-…»).
1. **T10:** comparar las cinco pestañas con el **prototipo clicable** (`docs/ux-crm-2026-11/prototipo-ficha/`), en
   escritorio (1440 px) y celular (390 px), y entregar una lista de diferencias por pestaña antes de corregir. La
   revisión visual anterior solo comparó con los tableros del canvas.
2. **T11:** Documentos igual al prototipo: contador «Documentos · N», etiqueta «Filtrar por origen», chip activo
   oscuro, ícono de archivo sin el sufijo «(PDF)», «De dónde viene» como enlace a la actividad o al gasto con la segunda
   línea, columna «Estado» («Gasto rechazado», «Supera lo asignado»), «Subió» en dos líneas y el texto de «Del proyecto».
3. **T12:** avisos de la revisión de T8 y T9: error visible si no carga el presupuesto en «Registrar gasto»; el tope en
   «Registrar avance» espera a los entregables; quien registró su propio gasto sin ser gestor ve «Tú lo registraste»;
   limpiar el aviso de éxito y el código que quedó sin uso.
4. **T13:** lo que queda solo de interfaz: «Cambiar estado» dentro de «⋯», «Revisar gasto» desde «Qué falta» abre el
   panel en ese gasto, «debería ir en X» en la ventana de avance, y las ventanas de T9 revisadas a 390 px.

Lo que necesita la API o una respuesta de la PO sigue en `odd/tasks/proyectos-redisenio-ui.md` (L4).

### Plan del 2026-11-08 (actualizado)

El plan del 2026-11-07 no se empezó; se ejecuta hoy en este orden. Pregunta de la usuaria: «eso lo terminamos todo
hoy?». Las estimaciones son de trabajo efectivo:

| Paso | Qué | Estimación | Hoy |
|---|---|---|---|
| 0 | Mergear este PR (#148), rama nueva `fix/proyectos-ficha-prototipo` desde `main` y nueva siembra de la base local | 15 min | Sí |
| 1 | **T10:** capturas de app y prototipo de las cinco pestañas a 1440 y 390 px; lista de diferencias por pestaña con su tamaño | 1–2 h | Sí |
| 2 | **T11:** Documentos igual al prototipo (ocho diferencias) | 2–3 h | Sí |
| 3 | **T12:** avisos de la revisión de T8 y T9 | 1–2 h | Sí |
| 4 | **T13:** «Cambiar estado» en «⋯», «Revisar gasto» desde «Qué falta», «debería ir en X», ventanas de T9 a 390 px | 2–3 h | Probable |
| 5 | Lo que T10 encuentre en Resumen, Actividades, Finanzas e Historial | sin estimar | Se decide con la lista de T10 |

Al terminar T10 se decide con la usuaria qué entra hoy. T11 y T12 no dependen de T10. Cada tarea lleva su prueba
primero, `vitest --dir src`, `tsc`, `eslint`, el e2e de `ficha-ejecucion` y `permisos`, y la revisión del tramo.

#### Cómo retomar (después de la limpieza del equipo)

1. `git -C .claude/worktrees/redisenio fetch origin` y `git checkout -b fix/proyectos-ficha-prototipo origin/main`.
2. Comprobar que siguen en su lugar: `.env.local`, `node_modules` del worktree (es un junction de Windows hacia la
   copia principal), el contenedor Docker de Supabase local (`127.0.0.1:54322`) y el servidor `next dev` en
   `localhost:3000`.
3. Nueva siembra local (solo con `.env.local`): `prisma migrate reset --force`, después
   `node.exe --env-file=.env.local node_modules/tsx/dist/cli.mjs prisma/seed.ts` y las siembras demo
   `seed-projects-demo --apply` y `seed-demo-flujo --apply` (detalle en `odd/tasks/proyectos-redisenio-ui.md`, L6).
4. Capturas: `node.exe .claude/qa/capturar-redisenio.mjs <carpeta> <pestaña>` (app) y el script del prototipo en
   `.claude/qa/`. Ambos scripts están en `.gitignore`: si la limpieza borra `.claude/qa/`, hay que recrearlos.
