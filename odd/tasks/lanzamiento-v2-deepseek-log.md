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

---

## X3 · Finanzas más simples

- Commit: `52d9ff3` — `refactor(proyectos): simplify the finance view with a progress bar and advanced options`
- Archivos tocados:
  - `src/components/proyectos/project-financiero.tsx` — tacómetro reemplazado por una barra horizontal (avance
    E/A, marca de programado P/A y total asignado) con la frase «Ejecutado … de … programados (… %) · Asignado …»
    debajo, que es también su `aria-label` (`role="img"`). El color sale del servidor (`total.color`); con
    `ejecucion_disponible: false` no hay color ni porcentaje. Corte y Base pasan a un bloque «Opciones avanzadas»
    plegable, cerrado por defecto y operable con teclado, con sus valores por defecto actuales (corte del servidor,
    base vigente). Se conserva la insignia «No confirmado» a la vista.
  - `src/components/proyectos/project-gastos.tsx` — se quita la fila de KPI (`gastos-kpis`), que repetía totales del
    Resumen; quedan los conteos por estado de los chips de filtro. La carga y el error de la consulta se muestran
    dentro de la sección (antes los pintaba la fila de KPI).
  - `src/components/proyectos/project-financiero.test.tsx` — pruebas de la barra y del plegable (RED → GREEN).
  - `src/components/proyectos/project-gastos.test.tsx` — la prueba de la fila de KPI pasa a verificar que ya no está
    y que los conteos del filtro se mantienen.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril → 8 archivos, 108 pruebas, **verde**. Extra:
     guardas de código (`surface`, `control`, `design`, `table`, `a11y`, `responsive`) → 6 archivos, 30 pruebas,
     verde. `tacometro.tsx` y sus pruebas quedan intactos (el tablero lo sigue usando).
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx
     src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno.
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X3

---

## X4 · Montos legibles en Presupuesto

- Commit: `20883d9` — `feat(proyectos): format money inputs and months in the budget`
- Archivos tocados:
  - `src/components/proyectos/presupuesto-programacion.tsx` — nuevo campo compartido `MontoInput` (separador de
    miles al escribir, valor numérico hacia `parseMontoInput`/API), `mesLegible` («oct 2026») en encabezados,
    etiquetas accesibles y el mensaje de error local. Vive aquí porque `presupuesto-ui.tsx` está fuera de la
    superficie del carril; `project-presupuesto.tsx` ya importa de este archivo.
  - `src/components/proyectos/project-presupuesto.tsx` — usa `MontoInput` en la tabla de asignación.
  - `src/components/proyectos/project-presupuesto.test.tsx` — valores con miles en pantalla, meses legibles y
    envío numérico intacto.
  - `src/components/proyectos/presupuesto-programacion.test.tsx` — **nuevo**. Meses legibles, miles al escribir con
    control numérico y lectura sin edición.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril → 9 archivos, 111 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx
     src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno. Nota: `MoneyInput` de `presupuesto-ui.tsx` queda sin uso (ese archivo no es de mi
  superficie; no lo toco).
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X4

---

## X5 · `FichaDocumentos`

- Commit: `486f9ea` — `feat(proyectos): add the documents tab with every project support grouped by origin`
- Archivos tocados:
  - `src/components/proyectos/ficha/ficha-documentos.tsx` — **nuevo**. Una lista con todos los soportes de
    `useProjectSupports`, agrupada en Actividades (avance), Indicadores, Gastos y Proyecto; filtro por origen con
    chips (`aria-pressed`) y buscador por nombre (insensible a mayúsculas); estados de carga (esqueleto), error
    (en línea) y vacío (proyecto sin documentos / filtro sin resultados). Reutiliza `formatoSoporte` y las mismas
    acciones de descarga de `project-soportes.tsx` (URL firmada por origen; enlace externo directo; «Abrir»
    deshabilitado para un indicador sin enlace).
  - `src/components/proyectos/ficha/ficha-documentos.test.tsx` — **nuevo**. Agrupación, filtro, buscador, vacíos,
    error/carga y apertura (gasto por URL firmada; enlace directo).
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril **más** las guardas de código → 16 archivos,
     149 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx
     src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno. La pestaña vieja «Soportes» sigue montada hasta que U8 la retire.
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X5

---

## X6 · `FichaHistorial`

- Commit: `7ad07c1` — `feat(proyectos): add the history tab with modifications, versions and audit`
- Archivos tocados:
  - `src/components/proyectos/ficha/ficha-historial.tsx` — **nuevo**. Segmentado `variant="pill"` con
    Modificaciones (`ProjectModificaciones`), Versiones (`ProjectVersiones`) y Auditoría (`ProjectHistorial`,
    desde `@/components/proyectos/project-historial`). Abre en Modificaciones.
  - `src/components/proyectos/ficha/ficha-historial.test.tsx` — **nuevo**. Hijos burlados: orden de las
    opciones, segmento por defecto, cambio de segmento, montaje solo del activo y teclado (flecha + Enter).
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run` sobre las rutas del carril **más** las guardas de código → 17 archivos,
     153 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/proyectos/ficha src/components/proyectos/project-financiero.tsx
     src/components/proyectos/project-presupuesto.tsx src/components/proyectos/project-gastos.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno. Nota para U8: la pestaña vieja «Cambios» se retira; su panel de KPI (`soloExportar`)
  queda a cargo de U2/U4 (el menú `⋯` del encabezado).
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: X6

---

## Cierre del carril X

Las tareas X1–X6 están terminadas en `feat/ficha-ux-finanzas`, una tarea por commit, cada una con su entrada en
este log. Para integrar (U8) basta montar `FichaFinanzas`, `FichaDocumentos` y `FichaHistorial` en sus
`TabsContent`:

- `FichaFinanzas` → pestaña «Finanzas» (sustituye `ProjectFinanciero` + `ProjectPresupuesto` y `ProjectGastos`).
- `FichaDocumentos` → pestaña «Documentos» (sustituye la pestaña vieja «Soportes»).
- `FichaHistorial` → pestaña «Historial» (sustituye la pestaña vieja «Cambios»).

Sin migraciones, sin dependencias nuevas y sin cambios fuera de la superficie del carril.

LISTO PARA INTEGRAR: TODO

---

# Lote 2

Rama: `feat/deepseek-lote-2` · Worktree: `../MuttuHub-CRM-worktrees/ficha-ux`. Superficie del lote: filtros del
portafolio (`project-list*`, `portafolio-filtros*`), Clientes (`clientes-subnav*`, las páginas de Oportunidades y Mapa,
`client-sheet*` y `client-form*`) y este log. Mismas verificaciones por tarea: (1) `TZ=America/Bogota npx vitest run`
sobre las rutas del lote, (2) `npx tsc --noEmit`, (3) `npx eslint` sobre los archivos tocados. Misma convención de
hash: el hash anotado es el del commit antes del `--amend` final que incrusta el texto.

## Y1 · Filtros del portafolio (RF-31)

- Commit: `b55704c` — `feat(proyectos): filter the portfolio by client, line, municipality and owner`
- Archivos tocados:
  - `src/components/proyectos/portafolio-filtros.tsx` — **nuevo**. Barra controlada con cinco filtros (estado,
    cliente, línea estratégica, municipio y responsable); los catálogos salen de `useClientOptions`,
    `useStrategicLines`, `useMunicipalities` y `useUsers`; emite el set completo omitiendo claves vacías;
    «Limpiar filtros» solo con algún filtro activo; en móvil un plegable «Filtros (n)» y de `sm` en adelante la
    fila a la vista.
  - `src/components/proyectos/project-list.tsx` — el estado de filtros pasa a un solo `ProjectFilters` que va a
    `useProjects` y a `useProjectsPortfolio`; el select de estado se muda a `PortafolioFiltros`; el texto del vacío
    habla de «estos filtros» (antes solo del estado). `kpiLista = useProjects({})` queda intacto.
  - `src/components/proyectos/portafolio-filtros.test.tsx` — **nuevo**. Cinco pruebas: selects y catálogos, set
    completo sin claves vacías, etiquetas seleccionadas, limpiar y plegable con conteo.
  - `src/components/proyectos/project-list.test.tsx` — integración de los cuatro filtros nuevos (lista y
    portafolio), el botón de limpiar y el invariante de la fila de KPIs sin filtro; textos del vacío actualizados.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run src/components/proyectos/project-list src/components/proyectos/portafolio-filtros
     src/components/crm "src/app/(app)/clientes"` → 15 archivos, 200 pruebas, **verde**. Extra: guardas de código
     (`surface`, `control`, `design`, `table`, `a11y`, `responsive`) → 6 archivos, 30 pruebas, verde.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint` sobre los cuatro archivos → **sin avisos**.
- PEDIDO A CLAUDE: ninguno. Nota: `ESTADOS` (orden del enum) se movió a `portafolio-filtros.tsx`.
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: Y1

---

## Y2 · Fecha de primer contacto legible (D2)

- Commit: `3c9aadb` — `fix(crm): show the first contact date as a readable day`
- Archivos tocados:
  - `src/components/crm/client-sheet.tsx` — `InlineDate` muestra el día UTC con `formatFechaDia` (el mismo
    formateador de la ficha imprimible) en sus dos rutas de lectura (editable y de solo lectura). De paso, el
    borrador de edición parte de la forma `YYYY-MM-DD` (`asInputValue`) y no del ISO crudo: el `<input type="date">`
    no aceptaba el valor crudo y un “guardar sin tocar” podía enviar el ISO completo.
  - `src/components/crm/client-sheet.test.tsx` — tres pruebas nuevas: día UTC en la vista editable, en la de solo
    lectura y el editor abriendo con `YYYY-MM-DD`.
  - `src/components/crm/client-form.tsx` — **revisado, sin cambios**: la fecha solo vive en un `<input type="date">`,
    no se muestra en crudo en ningún otro punto.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run …` sobre las rutas del lote → 15 archivos, 203 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint src/components/crm/client-sheet.tsx src/components/crm/client-sheet.test.tsx` → **sin avisos**.
- PEDIDO A CLAUDE: ninguno.
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: Y2

---

## Y3 · Ocultar las pestañas vacías de Clientes (M4)

- Commit: `54f2631` — `feat(crm): hide the client sections that are not built yet`
- Archivos tocados:
  - `src/components/crm/clientes-subnav.tsx` — `CLIENTES_SECTIONS` queda con las cinco secciones construidas
    (Aliados, Interacciones, Relaciones, Salud y Automatizaciones); Oportunidades y Mapa salen de la navegación.
  - `src/app/(app)/clientes/oportunidades/page.tsx` y `mapa/page.tsx` — las páginas pasan a `return redirect("/clientes")`
    (`redirect` de `next/navigation`; el retorno `never` es el que espera React 19 con TS, y la guía de Next lo admite).
  - `src/components/crm/clientes-subnav.test.tsx` — cinco secciones (y Oportunidades/Mapa/Convocatorias ausentes);
    las dos pruebas del placeholder pasan a probar la redirección con `redirect` burlado.
- Verificaciones:
  1. `TZ=America/Bogota npx vitest run …` sobre las rutas del lote **más** las guardas de código → 21 archivos,
     231 pruebas, **verde**.
  2. `npx tsc --noEmit` → **sin errores**.
  3. `npx eslint` sobre los cuatro archivos → **sin avisos**.
- PEDIDO A CLAUDE: ninguno. Nota: `clientes-section-placeholder.tsx` queda sin uso (no está en mi superficie; no lo
  toco).
- PREGUNTA: ninguna.

LISTO PARA INTEGRAR: Y3

---

## Cierre del lote 2

Y1–Y3 terminadas en `feat/deepseek-lote-2`, una tarea por commit, cada una con su entrada en este log y sin push.
Resumen para la integración: (Y1) filtros del portafolio por cliente, línea, municipio y responsable, con
«Limpiar filtros» y plegable en móvil, y el vacío hablando de «estos filtros»; (Y2) la fecha de primer contacto
como día UTC legible en la ficha del cliente; (Y3) Oportunidades y Mapa fuera del subnav de Clientes y sus rutas
redirigiendo a `/clientes`.

LISTO PARA INTEGRAR: TODO LOTE 2

---

# Lote 3 — revisión de solo lectura (carril Z)

Rama: `feat/deepseek-revision`, creada desde `feat/projects-v2` (`ab60d3c`) · Worktree: `../MuttuHub-CRM-worktrees/ficha-ux` · Locator: `odd/tasks/lanzamiento-v2-deepseek-log.md`.
Sin commits de código: este lote solo escribe este log. Alcance: `git diff main..feat/projects-v2 -- src/components src/app/(app)`, con prioridad en la ficha de proyecto (`src/components/proyectos/ficha/**`, `project-ficha.tsx`), el stepper (`src/components/proyectos/nuevo-proyecto/**`), el portafolio (`project-list.tsx`, `portafolio-filtros.tsx`) y Clientes (`src/components/crm/**`).

Preparación y verificaciones del lote:
- `git status` limpio; rama nueva desde `feat/projects-v2`; `npm ci` sin tocar el lockfile; `npx prisma generate` sin tocar la base. No hubo `prisma migrate`, seeds ni suite completa.
- `npx tsc --noEmit` → exit 0.
- Suite puntual: `TZ=America/Bogota npx vitest run src/components/proyectos/ficha/ficha-documentos.test.tsx src/components/crm/client-sheet.test.tsx` → 2 archivos, 27 pruebas, verde. Confirma que los dos defectos de datos de Z3 sobreviven a la suite actual.
- Navegación en el puerto 3001: **no** fue posible; la Supabase local (127.0.0.1:54322) no está arriba en este entorno y el lote no permite levantarla. Z4 quedó verificado leyendo clases de Tailwind y estructura (el prompt lo admite como alternativa).
- Fuera de alcance por reparto (revisión de Claude): permisos por rol, migraciones y datos, dinero (validación), borrado o anulación. No se detectó nada grave de ese tipo que merezca una línea aparte.

## Z1 · Textos de la interfaz

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | media | src/components/proyectos/project-ficha.tsx:143 · ficha/editar-datos-generales.tsx:181 · nuevo-proyecto.tsx:202 · project-list.tsx:121 · project-historial.tsx:36 · print/project-print-sheet.tsx:107 | Ante un fallo de red, `error.message` es el error crudo del navegador (`TypeError`), no un `ApiError`, y se pinta tal cual; el fallback en español solo cubre errores que no son `Error` | «Failed to fetch» (Chrome) bajo «No pudimos abrir la ficha», en inglés y sin explicación | Mostrar `message` solo si es `ApiError`; en cualquier otro caso, el texto en español |
| 2 | media | src/components/crm/print-ficha.tsx:380 · print-list.tsx:291 | Con 401 (sesión vencida) o 500 se muestra texto de desarrollador: «Configura el archivo .env con Supabase o inicia sesión…» | Un usuario cualquiera con la sesión vencida lee que configure un archivo `.env` para imprimir | Reemplazar por «Tu sesión expiró. Inicia sesión de nuevo»; quitar `.env` y Supabase del mensaje |
| 3 | media | src/components/crm/clientes-subnav.tsx:25 vs src/lib/nav.ts:31,69 · interaccion-form-dialog.tsx:145 · salud-vista.tsx:162 | La misma entidad y la misma ruta se llaman «Aliados» (subnav, diálogo de interacción, salud) y «Clientes» (menú lateral); el título intenta cubrirlo con «Aliados y clientes» | El menú dice «Clientes», la subnavegación «Aliados» y el encabezado «Aliados y clientes» para la misma lista | Unificar a «Clientes» en `CLIENTES_SECTIONS`, `PAGE_HEADERS` y los textos de CRM |
| 4 | media | src/components/crm/task-dialogs.tsx:174 vs src/components/kanban/task-dialog.tsx:246 · src/lib/nav.ts:104 | La misma entidad `Tarea` se llama «compromiso» en la ficha del cliente («Nuevo compromiso») y «tarea» en el tablero («Nueva tarea»); el mismo subtítulo del menú mezcla ambos | Mismo objeto con dos nombres según la pantalla; los dos diálogos conviven en la app | Elegir «Tarea» (o «Compromiso») y aplicarlo en ambos módulos |
| 5 | media | src/components/proyectos/project-estructura.tsx:44 · estructura-objetivos.tsx:75,97 · nuevo-proyecto/paso-revision.tsx:57 · nuevo-proyecto/stepper-logic.ts:6 | La sección se titula «Metas e indicadores» pero su contenido y acciones dicen «objetivos» («Agregar objetivo», «no tiene objetivos»), y el paso 5 cuenta «Objetivos» | Dentro de «Metas» se crean «objetivos»; el conteo del resumen no dice «Metas» | Unificar la etiqueta visible (p. ej. «Objetivos» en sección, botones y conteos) |
| 6 | baja | src/components/proyectos/nuevo-proyecto/paso-revision.tsx:74-79 | «Guardar borrador» no guarda nada: es un enlace que abre la ficha (ya está todo persistido) | Un botón que promete guardar y solo navega; sugiere que hay cambios pendientes | Renombrar a «Abrir la ficha» (o «Revisar en la ficha») |
| 7 | baja | src/components/proyectos/ficha/ficha-header.tsx:84 · print/project-print-sheet.tsx:94 · src/components/crm/print-ficha.tsx:114 | La misma acción tiene tres rótulos: «Imprimir / PDF», «Imprimir / Guardar PDF» e «Imprimir» | El botón de la ficha imprime distinto según desde dónde se abra | Unificar a «Imprimir / Guardar PDF» en los tres puntos |
| 8 | baja | src/components/proyectos/ejecucion-avance.tsx:251 · project-cronograma.tsx:113 · ficha/ficha-resumen.tsx:83 | El mismo hecho (avance sin archivo) se llama «Pendiente de soporte», «Sin soporte» y «avance sin soporte» | Tres nombres para el mismo estado de un avance | Fijar una frase única, p. ej. «Sin soporte», en chip, resumen y cronograma |
| 9 | baja | src/components/proyectos/curve-s-chart.tsx:90 · project-kpis-panel.tsx:130 · ejecucion-avance.tsx:108 | El mismo valor técnico se rotula «Planeado» (leyenda de la curva), «Avance programado» y «% plan» | La pestaña Actividades usa tres nombres para lo mismo | Unificar a «Programado» (o «Plan») en leyenda, métrica y filas |
| 10 | baja | src/components/proyectos/ficha/ficha-resumen.tsx:252 | En BORRADOR, «Próximos pasos» le pide a cualquiera usar «Aprobar línea base», pero el botón solo existe para ADM/GER (`canApproveBaseline` ⇒ `canManageProjects`) | Un colaborador busca un botón que no ve | Condicionar la pista al rol o redactarla «pídele a Administración o Gerencia que la apruebe» |
| 11 | baja | src/components/proyectos/project-financiero.tsx:36 = project-kpis-panel.tsx:30 | `ALERTA_RETRASO_TEXT` está duplicado literal en dos módulos | Dos copias del mismo aviso visible que pueden divergir al editarlo | Exportarlo una sola vez e importarlo en el otro módulo |
| 12 | baja | src/components/proyectos/project-list.tsx:170 · project-financiero.tsx:99 | El chip «No confirmado» no dice a qué se refiere (umbrales del semáforo sin confirmar) y no tiene descripción asociada | «12 proyectos · No confirmado» sin contexto | Añadir `title` o texto corto («Umbrales sin confirmar») |
| 13 | baja | src/components/dashboard/dashboard-page.tsx:2 | Único `TODO` del alcance: `TODO: rango custom` en un comentario; además hay bloques de comentario en inglés en archivos nuevos | No visible para el usuario; rompe la convención del repo | Convertirlo en tarea o quitarlo antes del congelamiento |

LISTO PARA INTEGRAR: Z1

## Z2 · Accesibilidad

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | media | src/components/crm/task-dialogs.tsx:219,251,270 · client-form.tsx:358,377,429,450 · interaccion-form-dialog.tsx:123,144,168 · entity-dialogs.tsx:318,651,894 | Selects con `<Label>` de hermano sin `htmlFor` y `SelectTrigger` sin `id`/`aria-label` (`ui/label.tsx` es un `<label>` plano): el nombre accesible sale del placeholder o del valor actual, nunca del campo; incluye obligatorios como «Responsable», «Tipo de cliente» y «Aliado» | Con lector de pantalla el campo se anuncia «Selecciona el responsable» o «Ana Gómez», no «Responsable»; al elegir un valor el campo pierde su nombre | Poner `id` + `htmlFor` (o `aria-label`) en cada trigger, como ya hace `project-create-form.tsx:389` |
| 2 | media | src/components/crm/client-sheet.tsx:556-590 (InlineText; mismo patrón en InlineTextarea:611, InlineDate:703 e InlineSelect:796) | Los campos de edición en línea de la pestaña General no tienen nombre accesible: la etiqueta vive en un `<dt>` sin asociación y los controles no llevan `aria-label`; el botón de lectura se anuncia solo con el valor (o «—») | Quien navega con lector oye botones sueltos («—», «Alcaldía») sin saber qué campo editan | `aria-label={label}` en cada control y `aria-label={`Editar ${label}`}` en los botones de despliegue |
| 3 | media | src/components/crm/saved-views.tsx:181-199 | El botón «Eliminar vista» es un `<button>` suelto dentro de `DropdownMenuContent` (`role="menu"`): no es `menuitem` y queda fuera de la navegación por flechas del menú | Con teclado no se puede llegar al borrado de una vista dentro del menú | Convertirlo en `DropdownMenuItem` (con icono) o sacar el borrado a un diálogo aparte |
| 4 | media | src/components/crm/client-sheet.tsx:1383-1388 · entity-dialogs.tsx:935-940 | El textarea de la Bitácora y el input de nota del ciclo de vida solo tienen `placeholder` (no es nombre accesible) | Con lector de pantalla no se identifica el campo para escribir la nota | `<Label className="sr-only">` + `id`, o `aria-label` («Nota de seguimiento», «Nota de comunicación») |
| 5 | media | src/components/crm/client-list.tsx:991-1011 | El botón de orden no expone el estado: `aria-label` idéntico en asc/desc y el `<th>` sin `aria-sort` | No se sabe por qué columna ni en qué dirección está ordenada la lista | Añadir `aria-sort` al `TableHead` y la dirección al nombre («…, ascendente/descendente») |
| 6 | baja | src/components/crm/client-list.tsx:610-656 | Los 4 selects del popover de filtros no tienen `aria-label`; su nombre queda en el placeholder y, al elegir, en el valor | «Prospecto» en vez de «Tipo de cliente» en el lector | `aria-label` por filtro, como `portafolio-filtros.tsx:72` |
| 7 | baja | src/components/proyectos/project-ejecucion.tsx:100-115 · project-financiero.tsx:90-108 | `aria-controls` apunta a un panel que solo existe abierto (`{abierto && <div id=…>}`); el primero además usa un `id` dinámico | Referencia ARIA colgante: el control «no expande» nada para la tecnología de asistencia | Renderizar el panel siempre (oculto con `hidden`) o quitar `aria-controls` al cerrar |
| 8 | baja | src/components/proyectos/ficha/ficha-documentos.tsx:151-160 | «Abrir» deshabilitado se explica solo con `title`, que no se anuncia y el botón sale del orden de tabulación | Con teclado o lector no hay forma de saber por qué «Abrir» está inactivo | Texto visible o `.sr-only` con la razón (o `aria-describedby`) |
| 9 | baja | src/components/proyectos/project-ficha.tsx:93 · ficha/ficha-finanzas.tsx:22 · ficha/ficha-historial.tsx:19 | El `tablist` principal y los segmentados internos no tienen nombre accesible (la propia ficha lo hace bien en `ficha-actividades.tsx:52`) | «Pestaña, Resumen, 1 de 5» sin decir de qué bloque | `aria-label` en cada `TabsList` («Secciones del proyecto», «Secciones de Finanzas»…) |
| 10 | baja | src/components/crm/client-sheet.tsx:410-421 | «Exportar PDF» navega con `window.open` desde un `<button>`: sin `href` no hay apertura en pestaña nueva por teclado ni menú contextual | Se pierde el comportamiento normal de un enlace (el equivalente en la ficha sí es `<a>`) | Cambiar a `Link` con `target="_blank" rel="noopener noreferrer"` |

LISTO PARA INTEGRAR: Z2
