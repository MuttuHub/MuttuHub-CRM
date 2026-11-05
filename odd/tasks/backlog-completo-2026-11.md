# Backlog completo — ejecución en local (2026-11)

Objetivo: resolver todo lo pendiente del plan `docs/ux-crm-2026-11/plan-trabajo-ux-crm.md`, unidad por unidad, en local.
Ramas: una por PR desde `main`, sin PRs apilados (plan §3); push, PR y merge los decide el usuario. Delivery: `ask-on-risk`.
Pruebas: Vitest (`npx vitest run <archivo>`), e2e con Playwright en `e2e/`; base local Docker vía `.env.local`.

## Specs

- **S1 — Pedido.** «el mismo proyecto que llevamos, y resolver todo lo que tenemos pendiente en el backlog» (en
  respuesta a «hagamos un plan de trabajo en local»). Alcance: cada ítem del plan termina **Hecho** con evidencia
  (commit, pruebas) o queda marcado **Decisión** con la pregunta exacta para la PO o gerencia.
- **S2 — Reglas de trabajo** (plan §3): un PR chico por unidad desde `main`; pruebas primero; `tsc` y lint limpios; cambios
  de esquema, permisos o dinero con ensayo y runbook; UI en «tú», sin Σ, pp, v0 ni códigos de regla; glosario D-G1; al
  cerrar un ítem se marca **Hecho** en el plan.
- **S3 — Notificaciones por correo.** «mi jefe me pidió que se enviaran notificaciones por correo electrónico, que tipo
  de notificaciones podemos enviar y que servicio o microservicio propio podemos utilizar, o herramientas opensource o
  gratuitas». Respuesta acordada: Frente M del plan (outbox + puerto `EmailSender`; Mailpit en local; proveedor de
  producción según D-M1; DNS según D-E).
- **S4 — Producción.** Nada se aplica en producción desde esta feature sin la autorización explícita del usuario, paso a
  paso, con respaldo y ensayo sobre copia (memoria: ensayo sobre dump restaurado).

## Tasks

Orden: primero lo que no depende de decisiones. Ruta: `inline` salvo que se indique un motivo de delegación.

| ID | Ítems del plan | S# | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T0 | F0.6: plan en el repo + Frente M + este documento | S1, S3 | inline | hecho | `1bbd4cc` (rama `docs/plan-backlog-completo`) |
| T1 | F0.4: X1 («obligatoria»), X2 (`modo` estricto en imports) | S1, S2 | inline | hecho | `caf2d47` (rama `fix/x1-x2-mensajes-y-modo`); RED 1+4 → GREEN; suite de áreas tocadas 132 archivos / 1670 tests; assess medio, `under_budget` |
| T2 | PR-R1: R1, R2, R3, R4, R6 (datos de Reportes) | S1, S2 | delegado (paralelo) | hecho | `79cd586` (rama `fix/reportes-datos`); RED 4+2 → GREEN; 270 tests de áreas tocadas; spot check del padre 27/27 |
| T3 | PR-1: BL#14, BL#21, BL#12, BL#11 (base de diálogos) | S1, S2 | delegado (paralelo) | hecho · **verificado visualmente** | `8a5bd9d` (rama `fix/ui-dialog-base`), 23 archivos +125/−70; RED 5 → GREEN 11/11; spot check del padre 11/11. Navegador real: alto 0.65 del viewport en escritorio y 0.852 en móvil (tope 0.90), footer `sticky` y opaco, título 18 px, «Cancelar» outline. Evidencia en `docs/ux-crm-2026-11/capturas/t3/` |
| T4 | PR-2: BL#9, BL#22, BL#15, BL#10 (diálogos con operación en curso) | S1, S2 | por definir | pendiente | — |
| T5 | PR-R2: R9 (hoja de impresión común) | S1, S2 | delegado (paralelo) | hecho · **verificado con PDF real; 2 defectos → T5b** | `660989a` (rama `feat/print-sheet-base`), 8 archivos; RED → GREEN 125/125; spot check del padre 67/67. PDF real: 6/6 en carta 612×792 y «Página N de M» correcto en las 6. Defectos: cabecera y pie no se repiten por página; el semanal pierde el chip de clasificación. Evidencia en `docs/ux-crm-2026-11/capturas/t5/` |
| T5b | **PR-R2b:** repetir cabecera y pie en cada página impresa (ver L13) | S2 | inline | hecho · **verificado en PDF** | Segundo commit de `feat/print-sheet-base`: cabecera y pie como cajas de margen `@page`. 6/6 plantillas x 11 páginas con cabecera, pie y «Página N de M» correctos (antes fallaban 4 de 6). Evidencia en `docs/ux-crm-2026-11/capturas/t5b/` |
| T5c | **PR-R2c:** el semanal desborda el ancho de carta y se corta a la derecha | S2 | por definir | pendiente | Ver L14: tablas de 9 columnas y el `grid-cols-4` de tarjetas no entran en 184 mm útiles; el contenido se corta y arrastra el chip de clasificación |
| T6 | PR-M1: outbox, worker y `EmailSender` (Resend + Mailpit por HTTP) | S3 | delegado (paralelo) | hecho; verificador PASS (ítems 1, 3, 4) | `145dfb8` migración + `03513bf` código (rama `feat/email-outbox`); 16 archivos; spot check del padre 41/41; humo: 1 correo en Mailpit |
| T7 | PR-M2 a PR-M4: plantillas, eventos y resumen v2 | S3 | por definir | pendiente | — |
| T8 | PR-7a–d: U1–U8 (textos de Proyectos) | S1, S2 | delegado (paralelo) | hecho · **verificado (pruebas + visual)** | `8b228fc` (PR-7a, U1–U3), `e8daa97` (PR-7b, U4), `ff222d4` (PR-7c, U5) en la rama `fix/proyectos-textos`, 37 archivos +429/−227. Verificado por el padre: 23 archivos / **369 pruebas en verde**, `tsc` 0, `eslint` 0. Sin tocar: `import-dialog.tsx` (U6, U7) y `lib/proyectos/plantilla/generate.ts` (U8). PR-7d en `c4c1ffb` (rama `fix/proyectos-textos-import`, desde `main`): 4 archivos, +82/−9, tres pruebas nuevas en RED→GREEN; 175 archivos / 2309 pruebas con 2 fallos preexistentes de `control-guards.test.ts` (`repository-list.tsx:1023`, reproducidos en `main`). |
| T9 | PR-8: BL#13, BL#16, BL#7, N10 | S1, S2 | inline | pendiente | — |
| T10 | PR-14, PR-15: U9–U12 (requisitos de línea base visibles) | S1, S2 | por definir | pendiente | — |
| T11 | PR-16: U13–U16 (atajos) | S1, S2 | por definir | pendiente | — |
| T12 | PR-17: BL#8 (impresión unificada) | S1, S2 | por definir | pendiente | — |
| T13 | PR-11, PR-13 (sin decisión): N6, N2 | S1, S2 | por definir | pendiente | — |
| T14 | F0.3: contrato de AJ-02 rehecho sobre `main` (producción según S4) | S1, S4 | inline | pendiente | — |
| T15 | Paralelo sin decisión: T1 (e2e legacy a CI), T3, T8, E6 según el usuario | S1 | por definir | pendiente | — |
| TB | **Bloqueados por decisión:** PR-3 (D-G1), PR-12 (D-G2), PR-6 (D-G3), PR-9 (D-G4), PR-4 parte (D-G5), PR-10 (D-G6), U22 (D-G7), PR-R3–R7, R11, R13 (D-G8), PR-M1 en prod (D-M1, D-E), B4/B5 (D-A), F4.x | S1 | — | decisión | Pedir en F0.5 |

## Log

- **L1 (2026-11-04, usuario, textual):** «el mismo proyecto que llevamos, y resolver todo lo que tenemos pendiente en el
  backlog». Contexto previo, textual: «listo de acuerdo con esto, hagamos un plan de trabajo en local, además mi jefe me
  pidió que se enviaran notificaciones por correo electrónico, que tipo de notificaciones podemos enviar y que servicio o
  microservicio propio podemos utilizar, o herramientas opensource o gratuitas».
- **L2 (2026-11-04):** estimación honesta: ~120 ítems y más de 40 PRs, unas 6–8 semanas; ~15 ítems esperan decisiones.
  Sin otras sesiones activas en la máquina. Mailpit del stack local corre en `localhost:54324`. Próximo: T1.
- **L3 (2026-11-04):** T1 cerrado en `caf2d47`. X2 reproducido antes del arreglo: `modo=aplicarr` respondía 200 y
  aplicaba en los 4 imports (plantilla, estructura, presupuesto, gastos). Ahora un helper compartido
  (`src/lib/api/import-modo.ts`) acepta `validar`, `aplicar` o ningún `modo` (lo que la app envía para aplicar) y responde
  400 «El modo debe ser «validar» o «aplicar».» antes de escribir; OpenAPI actualizada. X1: «La descripción es
  obligatoria.» / «demasiado larga.»; los demás mensajes no cambian (pruebas existentes). `tsc` y eslint limpios.
  Próximo: T2 (PR-R1) y T3 (PR-1) en paralelo, por escritores delegados en worktrees aislados (unidades
  independientes con superficies disjuntas; contexto largo de esta sesión).
- **L4 (2026-11-04):** T2 aceptado (`79cd586`, diff dentro de la superficie, 5 archivos +115/−25). R1 usa la convención del
  semanal (`fechaEnBogota` del cierre contra el día UTC de `fecha_entrega`). Hallazgos anotados en el plan: R17, R18 y R19
  (decisión). El plan se movió a `docs/ux-crm-2026-11/` (13:20, junto con los prototipos; mudanza sin commit todavía).
  Gotcha: en los worktrees, `npx` de Windows no sigue el symlink de `node_modules`; eslint y tsc van con
  `node node_modules/<pkg>/bin/...`.
- **L5 (2026-11-04):** T3 aceptado (`8a5bd9d`, diff solo en `src/components/`). `DialogContent` con `max-h-[90dvh]` y
  desplazamiento, `DialogFooter` fijo y opaco, un solo título de 18 px, «Cancelar» siempre `outline` (antes: 27 outline,
  9 ghost), fijado por un test que escanea el código. `control-guards.test.ts` pasa de 8 fallos en `main` a 2 (previos,
  `repository-list.tsx:1023`). Riesgo: ítem 6 (el diseño real no se prueba en jsdom) → **revisión visual pendiente**
  en el navegador con la rama `fix/ui-dialog-base`. Advertencias: el escaneo usa `process.cwd()` (corre desde la raíz,
  como otros tests del repo); quedan clases repetidas en `ficha/ficha-header.tsx`; «Cancelar» `ghost` en formularios en
  línea que no son diálogos (fuera de BL#11); la X de cierre se desplaza con el cuerpo en diálogos altos.
  Incidente propio: un `git add` registró la mudanza del plan a `docs/ux-crm-2026-11/` como borrado; deshice ese commit
  local y restauré el estado del disco tal como lo dejó el usuario.
- **L6 (2026-11-04):** T6 entregado por el escritor: tabla `email_outbox` (migración aditiva
  `20261104181952_email_outbox`), reclamo con `FOR UPDATE SKIP LOCKED` y lease de 10 min, reintentos 5/10/20/40 min
  (tope 6 h, 5 intentos), `clave_idempotencia` única + cabecera `Idempotency-Key` de Resend, puerto `EmailSender`
  (`EMAIL_TRANSPORT=resend|mailpit`, Mailpit solo en loopback), sin dependencias nuevas; el cron diario drena la cola.
  Humo local: 1 correo «Muttu Hub · Prueba de notificaciones» en Mailpit. **Aviso de entorno:** la migración ya está
  aplicada en la base local pero solo existe en `feat/email-outbox`; en otras ramas `migrate dev` puede proponer un
  reset: no aceptarlo. Preguntas abiertas: los eventos «inmediatos» (PR-M3) necesitan un disparador más frecuente que el
  cron de las 8:00; no se construyó adaptador SMTP (Brevo/SES/M365 por HTTP o dependencia nueva, según D-M1).
  Verificador independiente en curso.
- **L7 (2026-11-04):** verificador independiente de T6: PASS sin bloqueantes (migración aditiva, contrato del cron
  intacto, reclamos concurrentes disjuntos, 5 intentos y FALLIDO, UTC correcto). Desvío aceptado: Mailpit por HTTP en
  lugar de SMTP. Advertencias llevadas al plan como **PR-M1b**: carrera al vencer el lease (reproducida en local: un
  correo enviado queda PENDIENTE y se reenvía), sin timeout ni manejo de 429, drenado antes del resumen, orden de
  despliegue migración→código. Próximo: T4 (PR-2, sobre T3), T5 (PR-R2), T8 (U1–U8).
- **L8 (2026-11-04):** revisión nativa de T6 (`feat/email-outbox`, lentes risk, resilience y reliability, consentida por el
  usuario): **aprobada y acusada** (`authority: burned`). Sus advertencias coinciden con PR-M1b. Otras evaluaciones:
  T1 medio `under_budget`. Próximo: T5 (PR-R2) y T8 (U1–U8) en paralelo por escritores; T4 (PR-2) espera a que T3 entre
  a `main` porque toca los mismos diálogos.
- **L9 (2026-11-04):** T5 aceptado (`660989a`). `PrintSheet` compartido (`src/components/print/print-sheet.tsx`): carta,
  colores exactos, cabecera con logo y clasificación («Interno · Gerencia» / «Personal · nombre»), pie con autor y fecha
  (hora Bogotá), cabecera y pie repetidos por página (grupos de tabla CSS), «Página X de Y» con `@page` (solo
  Chromium 131+), filas sin partir, impresión tras datos + autor + `document.fonts.ready` (reemplaza el timer de 250 ms).
  Migrados: reporte de tareas, las 4 caras del tablero y el semanal, sin cambiar contenido. Pendiente: revisión visual en
  la vista previa de Chrome (riesgo ítem 6). **Preguntas:** ¿qué clasificación y nota llevan la lista y la ficha de
  clientes para adoptar la hoja?; el «generado el…» queda duplicado (bloque del informe + pie) hasta PR-R3–R7.
- **L10 (2026-11-04, continuación en otra sesión):** T8 (PR-7a–c) **verificado con evidencia**, no con la palabra del
  escritor: 23 archivos / 369 pruebas en verde, `tsc --noEmit` y `eslint` en cero, sobre `ff222d4` en un worktree
  detached limpio. Queda PR-7d (U6: ocultar la columna «Regla» en `import-dialog.tsx:83`; U7: mismo estado y aviso en
  los dos «Descargar plantilla», `:206` vs `:238`; U8: 7 voseos en `lib/proyectos/plantilla/generate.ts`).
  `fix/proyectos-textos` son 3 unidades, pero `8b228fc` y `ff222d4` comparten `project-ejecucion.tsx` y
  `project-ficha.test.tsx`: conviene PR-7a y PR-7b primero (superficies disjuntas) y rebasear PR-7c sobre el `main` nuevo.
- **L11 (2026-11-04, entorno — leer antes de cualquier verificación):**
  - **Vitest y `next dev` solo corren bajo `node.exe` (Windows).** `node_modules` trae los bindings nativos win32
    (`@rolldown/binding-win32-x64-msvc`, `@next/swc-win32-x64-msvc`, `@img/sharp-win32-x64`): en WSL fallan con
    «Cannot find module …wasi.cjs». Y `node.exe` **no sigue** los symlinks que crea `ln -s` en los worktrees (el gotcha
    de L4); la solución es una junction de Windows: `cmd.exe /c "mklink /J <worktree>\node_modules <repo>\node_modules"`.
  - **El stack local de Supabase corre sin puertos publicados:** `docker port` vacío para `supabase_kong_muttu-hub` y
    `supabase_db_muttu-hub`; 54321 y 54322 rechazan conexión desde Windows y nada escucha en WSL; `supabase status`
    responde `LegacyStatusDbInspectError`. Consecuencia: la app no alcanza auth ni la base, el login devuelve «Correo o
    contraseña incorrectos» **por el entorno y no por la clave** (`MuttuDemo2026!` es la del seed, `prisma/seed.ts:114`).
    Bloqueadas por esto: F0.7 (capturas «antes»), la revisión visual de T3 y la de T5. No se aplicó nada en producción.
  - **Arnés de capturas listo para reusar:** `.claude/qa/capturar.mjs` (modos `antes`, `t3`, `t5`, `t8`) con login
    demo, dos viewports y PDF real por plantilla. Ojo: la página de acceso tiene **dos botones «Entrar»** y los campos
    son controlados, así que hay que esperar la hidratación y tipear con `pressSequentially` (verificado).
- **L12 (2026-11-04, verificaciones visuales en navegador real):** con el stack restaurado (Docker Desktop estaba
  caído; el `Exited (137)` del edge runtime confirma un OOM) y la base local respaldada (1.4 MB, 94 tablas), se
  hicieron las tres verificaciones pendientes. Chromium 151, base demo.
  - **T3 · PASS.** `Editar datos generales` abre a 585 px sobre 900 (0.65) en escritorio y 719 sobre 844 (0.852) en
    móvil, ambos bajo el tope 0.90; `[data-slot=dialog-footer]` computa `position: sticky` y un fondo `oklab(…)`
    **sin alfa**; el título mide 18 px en los dos casos; «Cancelar» sale con `border`/`bg-input-bg` y sin `bg-primary`.
    Con el cuerpo desplazado el pie sigue visible y nada se transparenta. Cierra el riesgo ítem 6 de T3. El segundo
    diálogo previsto (`Importar plantilla`) no se abre desde la ficha, así que se descarta como caso.
  - **T5 · hecho con 2 defectos.** 6/6 plantillas en carta 612×792 y **«Página N de M» correcto en las 6** (el
    chequeo que solo pasa en Chromium 131+). Pero **la cabecera y el pie no se repiten por página**: la cabecera
    (logo + clasificación) sale solo en la página 1 y el pie solo al final, al revés de lo que afirmaba L9. Causa
    probable: el cuerpo es una sola fila anónima dentro de `.print-sheet { display: table }`, y Chromium no repite
    `table-header-group` / `table-footer-group` cuando el salto cae dentro de una fila; el `thead` de las tablas
    internas sí se repite (la página 2 arranca con «CLIENTE | CANTIDAD»). Además, `impresion-semanal.pdf` **pierde el
    chip de clasificación** en ambas páginas y su pie sale fragmentado; no es desborde (0 bloques fuera del ancho de
    página). Va como **T5b / PR-R2b**.
  - **T8 · PASS visual.** La ficha y el listado muestran el vocabulario llano («frente a … programado» en lugar de pp,
    «Indicador bajo la meta», «Avance sin soporte»), sin Σ, sin v0 y sin códigos de regla. El par «antes» está en
    `capturas/antes/` y el «después» en `capturas/t8/`.
  - **F0.7:** 12 capturas a 1440 y 390 px en `docs/ux-crm-2026-11/capturas/antes/`. La ficha de cliente necesitó ruta
    propia: `/clientes/<id>` da 404, la real es `/clientes?cliente=<id>`.
  - **Nota de proceso:** los verificadores delegados no arrancaron (`ELOCKED` en el runtime de subagentes); la
    verificación visual la hizo el padre en línea. El arnés quedó en `.claude/qa/capturar.mjs` + `analizar-pdf.py`.
- **L13 (2026-11-04, PR-7d cierra T8):** `c4c1ffb` en `fix/proyectos-textos-import` (rama nueva desde `main`, sin
  apilar; toca archivos disjuntos de PR-7a–c). U6: la tabla de errores de importación ya no muestra la columna «Regla»
  ni los códigos `V-07`/`W-01`; el CSV del reporte los conserva para soporte. U7: la barra y el diálogo comparten
  estado y explicación («Define las fechas del proyecto…») al descargar la plantilla. U8: las notas del Excel pasan a
  «tú» («Lee esta hoja», «Pasa el mouse»); **el plan decía 7 voseos y eran 2**. Tres pruebas nuevas, RED observado
  primero. Gate del área: 175 archivos / 2309 pruebas, `tsc` y `eslint` en cero; los 2 fallos de `control-guards.test.ts`
  (`repository-list.tsx:1023`) se reprodujeron igual en `main`, así que son previos y ajenos a este cambio.
- **L14 (2026-11-04, T5b verificado en papel):** la repetición por página no se arreglaba con el CSS que ya
  estaba. Se probaron tres mecanismos aislados con un PDF de prueba antes de tocar el componente:
  (A) `position: fixed` con offsets negativos → repite desfasado una página (cabecera en p1–p4, pie en p2–p5);
  (B) `position: fixed` en `top: 0` / `bottom: 0` → repite en todas, pero **se pinta encima del cuerpo**
  (medido: cabecera en y=75 pt sobre la primera fila, pie en y=716 sobre la última);
  (C) **cajas de margen `@page`** → repite en todas y vive en el margen, sin superposición. Se adoptó **C**:
  `@top-left` el título, `@top-right` la clasificación, `@bottom-left` autor y fecha, `@bottom-center` la nota
  de uso, `@bottom-right` «Página N de M». Los textos son dinámicos, así que `PRINT_SHEET_CSS` pasó de constante a
  función (`printSheetCss`) que los interpola con escape de comillas y backslashes.
  Resultado medido: **6/6 plantillas y 11 páginas con cabecera, pie y numeración** (antes fallaban 4 de 6; el
  semanal perdía ambas). Gate: 20 archivos / 131 pruebas del área, `tsc` y `eslint` en cero.
  **Costo asumido:** el logo (SVG) no puede ir en una caja de margen, así que la cabecera impresa es solo texto;
  el logo sigue en la vista previa en pantalla. Recuperarlo en papel necesita un PNG en `public/brand/` (decisión
  del usuario) o volver a B aceptando la superposición.
  **T5c abierto:** el semanal desborda el ancho útil (184 mm) — tablas de 9 columnas y `grid-cols-4` — y se corta
  a la derecha; con las cajas de margen ya no arrastra el chip, pero el corte del cuerpo sigue. Además pasó de 2 a
  3 páginas por los márgenes nuevos (24 mm arriba, 20 mm abajo).
- **L15 (2026-11-04, plan en paralelo):** Adrián, textual: «ahora la prioridad es terminarl el backlog que tenemos
  pendiente, y depronto con otro agente en paralelo podemos ir desarrollando esta sección renovada». Acordado: esta
  línea es el **agente A** y tiene prioridad; un **agente B** prepara Proyectos v3 en otro worktree, ruta aparte y
  bandera apagada, solo base técnica (B0) hasta cerrar su puerta de decisiones. Contrato y zonas («Quién toca qué»):
  `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md`. Instrucciones: `odd/tasks/prompt-agente-a-backlog.md`.
  B no toca `src/components/proyectos/**`, API, reglas, `prisma/**` ni `ui/`; A no toca `proyectos-v3/**` ni
  `src/lib/flags.ts`. A anota «**Entrega para B**» al fusionar PR-14, PR-16 y el backend de F4.7, y «**Aviso a B**» si
  cambia un hook o endpoint que B usa. Puertos: A 3000, B 3001. Próximo para A: paso 0 (fusionar lo terminado), T4.
- **L15 (2026-11-04, tres decisiones cerradas con Adrián):** quedaron resueltas **D-V3-1**, **D-F** y **D-T5**
  (anotadas en el plan §4 y en `decisiones-abiertas-2026-11-04.md`).
  - **D-V3-1 → no se reserva la interfaz.** La interfaz de U17–U21 se construye en la sección viva y v3 la hereda
    cuando llegue. Dato que lo motivó: **v3 está en cero** — no hay ramas ni commits, y B0.1 a B0.6 siguen
    «pendiente» en `odd/tasks/proyectos-v3.md`; reservarle esas pantallas dejaría las mejoras de uso esperando meses.
  - **D-F → Opción A.** App en Railway y Supabase sigue dando Auth, Storage y Postgres: un día de trabajo, sin tocar
    identidad ni datos. La Opción B (stack completo) se revisa cuando haya requisito de datos en infraestructura propia.
  - **D-T5 → Adrián firma como dueño técnico de los datos** (administra el acceso a Supabase). Queda pedir una línea de
    gerencia que avale que todo el equipo lea todos los clientes y la bitácora. **Abre D-T5b:** ocultar `texto` y
    `próximo_paso` a COLABORADOR y paginar `/interactions` y `/contacts`.
  - **D-V3-2 queda reformulada:** el texto decía «retirar v1», pero en el código **v2 es lo que está en producción**.
    La pregunta real es cuándo se retira la sección actual cuando v3 esté lista.
  - **La puerta de v3 sigue cerrada:** faltan D-G1, D-G7, D-G11, D-G12, D-CP1 a D-CP6, P5 y D-V3-2.
- **L16 (2026-11-04, pedido de la PO sobre la bitácora):** **D-T5b cerrada en «se mantiene como está»**. La bitácora
  completa —`texto` y `próximo_paso`— sigue visible para cualquier usuario autenticado. La recomendación de
  `docs/analisis/T3-seguridad.md:291` (ocultarla a COLABORADOR y paginar `/interactions` y `/contacts`) queda
  **declinada a sabiendas**, no olvidada. Punto de revisión si entra un cliente, un rol externo o un auditor.
