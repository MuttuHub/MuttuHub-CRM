# Plan — mejoras de UI y facilidad de uso del módulo Proyectos

Fecha: 2026-11-05 · Dueño: Adrián · Estado: **por empezar** (actualizado el 2026-11-05 por la noche, ver §0.1).
Objetivo: que cualquier persona del equipo (en especial la Coordinadora/PO) entienda el estado de un proyecto y
complete sus tareas sin ayuda. **Por ahora solo diseños** en Claude Design a partir del código real; la
implementación va después, por PRs chicos, cuando la PO apruebe cada diseño.

## 0. Antes de empezar (leer, no repetir trabajo)

- `docs/ux-crm-2026-11/HANDOFF-sesion-2026-11-05.md` — estado del repo, reglas del entorno y pendientes T1–T6.
- Canvas existente (privado): https://claude.ai/artifact/B2jBj1ScW9vrGFxWNEi5xC — página «Mejoras UX» con
  UX1–UX7 (captura real vs. propuesta). **Este plan lo amplía; no empieza de cero.**
- `docs/ux-crm-2026-11/plan-trabajo-ux-crm.md` (backlog UX en curso), `docs/archive/pendientes/plan-mejora-ux-proyectos.md`
  (U1–U22, BL#), `docs/ux-crm-2026-11/rediseno-ciclo-proyecto.md`, `docs/ux-crm-2026-11/proyectos-v2-prototipo.html`
  (prototipo de la v3) y `docs/ux-crm-2026-11/decisiones-abiertas-2026-11-04.md`.
- **Regla v3 (decisión D-V3-1):** las mejoras se hacen en la sección viva de Proyectos y la v3 las hereda. Si un
  diseño cambia algo que la v3 ya resolvió en su prototipo, alinéalo con ese prototipo en lugar de inventar otro.
- Guías de copia: español neutro con «tú», sin jerga ni siglas («E/P», «pp», «Σ», «v0», códigos de regla), glosario
  D-G1. Accesibilidad: objetivos táctiles ≥ 44 px, contraste 4,5:1, nunca solo color para un estado.

## 0.1 Estado al cierre del 2026-11-05 (leer primero)

- **T1–T4 del traspaso, hechos.**
  - **#145** (AJ-01: cualquier integrante registra avance, nombre en el historial, «90 %», atajo de cabecera,
    aviso de solo consulta) quedó **mergeado** en `main` (`1ded4dd`).
  - **#146** (grupos 1 y 2 del canvas: UX1, UX3–UX6 y el selector de archivo en español) también quedó
    **mergeado** en `main` (`0726e5d`), con CI verde, unit y e2e incluidos.
- **Por qué la PO «no notó los cambios».** Su documento `Hub-proyectos261028.docx` (AJ-01 a AJ-06, v1.1) ya
  estaba implementado en `main`. Pero con su rol (Coordinadora integrante, no responsable) «Registrar avance»
  le quedaba oculto (F1), el historial mostraba un UUID (F2) y casi ninguna pantalla explica qué cambió o qué
  significa cada cifra. Hoy hay ayudas ⓘ (`HelpHint`) en **solo 4 archivos**: asistente de nuevo proyecto,
  importación y `vocabulario-seguimiento.tsx`.
  **Lección para este plan:** cada mejora tiene que **verse y explicarse sola**: ayudas ⓘ, estados vacíos que
  orientan y una nota de «qué cambió».
- **Ya hecho por otra sesión (no repetir):**
  - F1 paso 1, el inventario de código: `docs/ux-crm-2026-11/inventario-ui-proyectos.md` (20 pantallas → T-1…T-9).
  - F3, el Design System «Muttu Hub — Proyectos» en Claude Design:
    https://claude.ai/artifact/4pNniJhtu1ZEvmsfjt4sqi (tokens de `globals.css`, claro/oscuro, 17 componentes).
  - Faltan F1 paso 2 (capturas), F2, F4 y, en F3, el patrón de ayuda ⓘ del §0.2.
  - Hallazgo para F2: el asistente dice «Solo Administración y Gerencia pueden crear proyectos», pero
    `canCreateProject` permite todos los roles.
- **Ya diseñados y pendientes del OK de la PO:** grupos 3 y 4 de la página «Mejoras UX» del canvas:
  - formulario de gasto por secciones (UX2);
  - fila de actividad con tabla de entregables (UX1/UX7);
  - historial como línea de tiempo;
  - estado vacío de Modificaciones (UX6);
  - Finanzas con 3 cifras clave (UX5);
  - cabecera con indicadores en número.

  No se rediseñan desde cero: se **amplían** y se llevan al Design System de F3.

## 0.1b Avance de la madrugada del 2026-11-06 (leer antes de seguir)

- **Estado del repo local (a propósito):** la copia principal quedó en `main` **desacoplada** (`0726e5d`), para que
  el servidor del puerto 3000 muestre lo actual. El tracker de la v3 está guardado en el stash con etiqueta
  `ux-capturas-proyectos-v3-2026-11-05-2345` (solo `odd/tasks/proyectos-v3.md`). Para volver:
  `git switch docs/plan-backlog-completo`, luego `git stash list` → `git stash apply stash@{N}` del que tenga esa
  etiqueta y, si quedó bien, `git stash drop stash@{N}`. Toda la carpeta `docs/ux-crm-2026-11/` está **sin
  commitear** (no existe en `main`).
  - Incidente: un `git switch` rechazado alcanzó a correr a medias y dejó el árbol mezclado; se completó con
    `git checkout -f --detach 0726e5d`. No se perdió nada: el único cambio local era el que está en el stash.
- **F1 paso 2 (capturas), hecho para Gerencia** (31 de 32; falla solo Cronograma en móvil, la pestaña no recibe el
  clic) y para Coordinadora (también 31 de 32). Arnés: `.claude/qa/capturar.mjs`, modo nuevo `ux` + `CAP_EMAIL`; correrlo con
  `node.exe` (el servidor escucha en `[::1]` de Windows) y `WSLENV=CAP_MODE:CAP_OUT:CAP_EMAIL:CAP_BASE_URL`. Salida en
  `docs/ux-crm-2026-11/capturas/ux-proyectos/<rol>/` (ignorada por git). Falta el rol colaborador.
- **F4, primera tanda de diseños:** canvas «Proyectos — Rediseño de usabilidad»,
  https://claude.ai/artifact/4iECnWb1jzLdjKvH6s4CwN (privado: compartirlo con la PO desde Share). 13 tableros en
  4 páginas, con el Design System de F3:
  1. Resumen y cabecera: hoy vs. propuesta en escritorio y móvil (cifras en número, «Qué falta» accionable,
     aviso de Novedades).
  2. Actividades: hoy vs. propuesta y **prototipo interactivo de «Registrar avance»** (tope del 90 %, guardar,
     historial).
  3. Finanzas: hoy vs. propuesta (3 cifras clave, gastos por validar en la ficha) y panel de validación con el
     soporte a la vista.
  4. Patrón de ayudas (ⓘ, texto guía, estado vacío) y página de Novedades con guía por rol.
  Las notas azules del canvas tienen los textos de cada ⓘ. Faltan los flujos 4–7 del plan (Historial, Nuevo
  proyecto e importación, Portafolio, móvil de gasto) y llevar el patrón ⓘ al Design System.
- **Hallazgos nuevos para F2 (vistos en las capturas):**
  - Finanzas › Gastos en escritorio (1440 px) **se corta por la derecha**: «Validar» queda fuera de la vista.
  - El portafolio dice 12,5 % de avance financiero (ejecutado sobre asignado, «E/A») y la ficha 24,9 % (sobre
    lo programado): dos medidas con el mismo nombre.
  - Resumen dice que la 1.3 va en «25 %»; la lista dice «50 % real».
  - Una actividad finalizada (1.1) sigue ofreciendo «Registrar cantidad» en sus entregables.
  - Actividades en móvil mide 403 px en una pantalla de 390 (desplazamiento lateral).
  - Financiero «Verde · Al día» junto a la alerta «Posible retraso»; todos los rubros en verde aunque R11 tiene un
    gasto que supera lo asignado.
  - Subtítulo del portafolio «Portafolio v2: …» (jerga interna).

## 0.2 Frente nuevo: ayudas ⓘ, textos guía y «qué cambió»

Va **en paralelo** a F2–F4, con el mismo flujo de captura → propuesta → OK de la PO:

1. **Inventario de términos que hoy no se explican.** Barrer `src/components/proyectos/**` y listar cada cifra o
   término que una persona nueva no entendería sin ayuda. Como mínimo:
   - semáforo técnico y financiero, «Umbrales sin confirmar», línea base y versión;
   - tope del 90 %, peso por duración, avance programado vs. real, «% de lo programado», E/A, «Umbral rojo»;
   - «Periodo modificado», «Pendiente por revisión», «Cuenta» / «No cuenta» en entregables;
   - «Finalizada con retraso», «Sin soporte».

   Salida: tabla término → pantalla/archivo → texto propuesto (máx. 2 frases, español neutro con «tú»), en
   `docs/ux-crm-2026-11/ayudas-proyectos.md`.
2. **Patrón visual de la ayuda.** Diseñar en el Design System el `HelpHint` (ⓘ con popover), su variante en línea
   (texto guía gris bajo un campo) y el estado vacío que orienta (qué es, por qué está vacío y el botón de la
   acción). Regla: la ayuda nunca reemplaza una etiqueta clara; si el término se puede cambiar por palabras
   llanas, se cambia, como ya se hizo con «E/P» → «% de lo programado».
3. **Ayudas por pantalla en el canvas.** En cada tablero de F4, marcar dónde va cada ⓘ y su texto.
4. **«Qué cambió» visible para la PO.**
   - Diseñar un aviso discreto y descartable en la ficha («Novedades: ahora puedes registrar avance…») que
     enlaza a una página corta de novedades con capturas antes/después.
   - Proponer también una guía breve por rol (Coordinación, Gerencia, integrante) con las 4 tareas clave
     (T-1, T-2, T-3, T-5).
   - Es **propuesta**: requiere el OK de la PO antes de implementarse.

## 1. Tareas que el módulo tiene que facilitar (el criterio de todo el plan)

| # | Tarea | Quién | Hoy (pasos/fricción conocida) |
|---|---|---|---|
| T-1 | Ver si un proyecto va bien o mal y por qué | Coordinación, Gerencia | Semáforos sin número; causa repartida entre Resumen, Finanzas y Actividades |
| T-2 | Registrar el avance de una actividad | Integrantes | Botón disperso; confusión avance (%) vs. cantidad de entregable |
| T-3 | Registrar un gasto con su soporte | Integrantes | Formulario en zigzag; selector de archivo en inglés |
| T-4 | Validar o rechazar gastos | Gerencia | Cola aparte; revisar soporte y rubro en otra pantalla |
| T-5 | Saber qué falta (soportes, entregables, atrasos) | Coordinación | «Requiere atención» en Resumen; no lleva a la acción exacta |
| T-6 | Crear un proyecto e importar su plantilla | Coordinación | Asistente de 5 pasos + importación con errores técnicos |
| T-7 | Aprobar línea base / solicitar una modificación | Gerencia, Coordinación | Requisitos poco visibles; estado vacío que no explica |
| T-8 | Encontrar un documento o soporte | Todos | Soportes repartidos por actividad, gasto y Documentos |
| T-9 | Revisar el portafolio | Gerencia | Lista con muchas columnas; filtros |

## 2. Fases

### F1 — Inventario y capturas reales (1 sesión)
1. Mapear pantallas y componentes desde el código: `src/app/(app)/proyectos/**`, `src/components/proyectos/**`
   (ficha: `ficha-header`, `ficha-resumen`, `ficha-actividades` con Lista/Gantt/Tablero, `ficha-finanzas`
   con Resumen/Gastos/Presupuesto, `ficha-documentos`, `ficha-historial`; lista/portafolio; `nuevo-proyecto/*`;
   diálogos de importación; impresión). Salida: tabla pantalla → archivo → tareas T-x que sirve.
2. Capturar cada pantalla en **escritorio (1440) y móvil (390)** con la app local y datos demo, extendiendo el arnés
   `.claude/qa/capturar.mjs` (modo nuevo `ux`, sin tocar los existentes) o el script de
   `scratchpad/demo/capturar-actual*.mjs` descrito en el traspaso. Roles: Coordinadora integrante, Coordinadora/
   Gerencia en solo consulta, Gerencia. Guardar en `docs/ux-crm-2026-11/capturas/ux-proyectos/`.

### F2 — Auditoría de facilidad de uso por tarea (1 sesión)
Para cada tarea T-1…T-9: recorrerla en el navegador, contar pasos y clics, anotar fricciones con severidad
(bloquea / confunde / molesta) y la heurística que falla (visibilidad del estado, lenguaje del usuario, prevención de
errores, consistencia, reconocer antes que recordar). Incluir los hallazgos ya conocidos (UX1–UX7, F2–F8 del plan de
verificación). Salida: `docs/ux-crm-2026-11/auditoria-usabilidad-proyectos.md` con una tabla priorizada
(impacto × esfuerzo) y las 10 mejoras de mayor valor.

### F3 — Sistema visual desde el código (1 sesión)
Extraer los tokens reales de la app (colores, tipografías, radios, espaciados, sombras, tonos de estado) de
`src/app/globals.css` y `src/components/ui/**` (Button, StatusChip, ToneBadge, ProgressBar, Table, Dialog/
CaptureSurface) y crear con ellos un **Design System** en Claude Design (tipo «Design System») llamado
«Muttu Hub — Proyectos». Así los diseños usan los mismos colores y componentes que el código, y la
implementación es directa. No usar el sistema de diseño por defecto de la organización para esto.

### F4 — Diseños en Claude Design (2–3 sesiones)
Un canvas nuevo «Proyectos — Rediseño de usabilidad» (o páginas nuevas en el canvas existente) instalado con el
Design System de F3. Por cada flujo: **hoy (captura real) vs. propuesta**, con notas de qué cambia y por qué, en
escritorio y móvil. Orden sugerido por impacto:
1. **Ficha › Resumen y cabecera** (T-1, T-5): estado con números, «qué falta» accionable que lleva a la acción exacta.
2. **Actividades › Lista** (T-2, T-8): una acción principal por actividad, entregables en tabla, soportes como
   contador, historial como línea de tiempo (amplía UX1 y UX7). **Prototipo interactivo** del flujo completo
   «Registrar avance» (abrir, tope del 90 %, guardar, ver en el historial).
3. **Finanzas** (T-3, T-4): Resumen con 3 cifras clave (amplía UX5), lista de gastos (UX3), formulario por secciones
   (UX2) y **validación de gastos** con el soporte a la vista en el mismo panel.
4. **Historial** (T-7): modificaciones con estado vacío explicativo (UX6), requisitos de línea base visibles.
5. **Nuevo proyecto e importación** (T-6): asistente con progreso claro y errores de importación en lenguaje llano.
6. **Portafolio** (T-9): menos columnas, filtros guardados, semáforos con número.
7. **Móvil**: registrar avance y gasto desde el teléfono (hoja inferior), lectura del estado.
Cada tablero lleva un título corto, las tareas T-x que mejora y 3 notas «qué cambia». Nada de datos inventados:
usar los datos demo o textos marcados como ejemplo.

### F5 — Validación con la PO y con usuarios (paralelo a F4)
- Adrián comparte el canvas con la PO (menú Share) y se recogen comentarios en el propio canvas.
- Prueba rápida con 2–3 personas (Coordinadora, Gerencia, un integrante) sobre el prototipo: pedirles 4 tareas
  (T-1, T-2, T-3, T-5), medir si las completan sin ayuda y dónde dudan.
- Registrar cada decisión (aprobado / ajustar / descartado) en `docs/ux-crm-2026-11/decisiones-ui-proyectos.md`.

### F6 — Implementación (después de la aprobación)
PRs chicos, uno por mejora aprobada, en orden de impacto. Pruebas primero, `vitest --dir src`, tsc y eslint,
verificación visual con capturas antes/después y un video corto por lote (mismo método que el de AJ-01…AJ-06).

## 3. Entregables y criterio de terminado

| Fase | Entregable | Terminado cuando |
|---|---|---|
| F1 | Inventario + capturas escritorio/móvil | Todas las pantallas de la ficha, lista y asistente capturadas por rol |
| F2 | Auditoría priorizada | Top 10 de mejoras con impacto, esfuerzo y tarea T-x |
| F3 | Design System «Muttu Hub — Proyectos» | Colores, tipografía y componentes base iguales al código |
| F4 | Canvas con flujos hoy vs. propuesta + prototipo de «Registrar avance» | Los 7 flujos diseñados en escritorio y móvil |
| F5 | Decisiones registradas | La PO aprobó o ajustó cada flujo |
| F6 | PRs por mejora | Cada mejora aprobada en `main` con pruebas y evidencia visual |

## 4. Cosas que NO hacer
- No implementar diseños sin el OK de la PO (excepto errores claros, como los del grupo 1 del traspaso).
- No tocar la ruta `proyectos-v3` ni su bandera; no crear pantallas nuevas en paralelo a la v3.
- No cambiar reglas de negocio ni permisos desde un PR de UI.
- No usar `.env` (nube); solo la base local de Docker.

## 5. Prompt para pegar en la nueva sesión
> Retoma el plan de mejoras de UI del módulo Proyectos de MuttuHub-CRM. Lee completos, en este orden:
> `docs/ux-crm-2026-11/plan-mejoras-ui-proyectos.md` (empieza por §0.1 y §0.2),
> `docs/ux-crm-2026-11/HANDOFF-sesion-2026-11-05.md` (reglas del entorno, sección 3) y
> `docs/ux-crm-2026-11/plan-verificacion-aj-y-ux.md` (§6).
> T1–T4 del traspaso ya están hechos: no los repitas. #145 (`1ded4dd`) y #146 (`0726e5d`) están en `main`, así
> que las capturas «hoy» ya muestran los grupos 1 y 2 del canvas. Parte de `main` actualizado.
>
> El objetivo de esta sesión es **diseñar en Claude Design, no implementar**. En orden:
> (1) F1 paso 2, capturas reales en escritorio (1440) y móvil (390) por rol, con la app local y los datos demo.
> El inventario de código ya existe en `docs/ux-crm-2026-11/inventario-ui-proyectos.md`: úsalo, no lo rehagas.
> (2) F2, auditoría por tarea T-1…T-9, más el frente §0.2: inventario de términos sin explicar y textos de ayuda
> en `docs/ux-crm-2026-11/ayudas-proyectos.md`.
> (3) F3, el Design System ya está publicado en https://claude.ai/artifact/4pNniJhtu1ZEvmsfjt4sqi. Léelo y
> agrégale solo el patrón de ayuda ⓘ, el texto guía y el estado vacío que orienta.
> (4) F4, diseños «hoy vs. propuesta» en escritorio y móvil, ampliando los grupos 3 y 4 que ya están en la
> página «Mejoras UX» del canvas https://claude.ai/artifact/B2jBj1ScW9vrGFxWNEi5xC. Marca en cada tablero dónde
> va cada ⓘ con su texto, y diseña el aviso de «Novedades / qué cambió» para la PO.
> Usa solo datos demo o textos marcados como ejemplo. UI en español neutro con «tú», sin siglas ni jerga.
>
> Reglas: no implementes ningún diseño sin el OK de la PO; no toques `proyectos-v3` ni su bandera; solo la base
> local (`.env.local`, nunca `.env`); Vitest y Next solo con `node.exe` y `--dir src`.
> Al terminar cada fase, registra el avance en este plan y en Engram (proyecto `muttuhub-crm`). Recuérdale a
> Adrián que comparta el canvas con la PO (menú Share). Responde en español.
