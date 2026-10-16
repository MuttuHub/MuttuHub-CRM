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

## Z3 · Estados, bordes y formatos

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | alta | src/components/crm/client-sheet.tsx:559 | En modo solo lectura (`puede_editar === false`) los campos de texto de la pestaña General se pintan con `formatFecha(value)`, que no es un formateador de texto: devuelve «—» para cualquier cadena no-fecha | Nombre, Empresa, Tamaño, Ubicación y los demás campos muestran «—»: la ficha General queda en blanco para quien no edita | Usar `{value || "—"}`; `formatFechaDia` solo donde el dato es fecha (InlineDate ya lo hace) |
| 2 | media | src/components/proyectos/ficha/ficha-documentos.tsx:146 | La fecha de subida usa `formatFechaCalendario(soporte.created_at)` y `created_at` llega como ISO completo (`supports/route.ts:95`): `Number("16T…")` es `NaN` y devuelve «—» siempre | Cada fila termina en «… · Ana · —»: la fecha de subida nunca aparece (la prueba `ficha-documentos.test.tsx:55` usa ISO pero no asercia la fecha) | Usar `formatFechaHora(soporte.created_at)` (o `slice(0,10)`) |
| 3 | media | src/components/proyectos/project-list.tsx:151,300-304 | Si el portafolio falla, `portafolio` queda `undefined` y todas las filas caen en «Sin medir»; no hay aviso ni se distingue de un proyecto no medible (la prueba en `project-list.test.tsx:479` fija ese comportamiento) | Un error de red se ve como «los proyectos no son medibles», sin ninguna señal de fallo | Diferenciar `portafolioQuery.isError` y mostrar «Sin datos del portafolio» + aviso/reintento |
| 4 | media | src/components/proyectos/project-dashboard.tsx:433 | `curva.data ?? null` no distingue carga ni error: mientras carga o si falla, la tarjeta dice «Sin datos de avance todavía» (falso vacío y error oculto) | La curva afirma que no hay datos cuando en realidad no cargaron | Ramas `isLoading`/`isError` (reutilizar `CurvaAvance`, que sí las tiene) |
| 5 | media | src/components/proyectos/gasto-form.tsx:96,169-173 · project-gastos.tsx:141 | «Registrar gasto» pasa `budgetQuery.data?.rubros ?? []`; si el presupuesto aún carga o no hay rubros con monto asignado, el select de Rubro queda sin opciones y el envío solo responde «Elige el rubro.» | No se puede registrar ningún gasto y el mensaje no explica qué falta | Deshabilitar «Registrar gasto» hasta cargar el presupuesto y, si no hay rubros con monto, decir «Asigna primero un monto a un rubro» |
| 6 | media | src/components/proyectos/project-create-form.tsx:288,305,511-519 | «Valor total» no normaliza el texto: `Number("250.000")` es 250 (punto decimal), así que un monto escrito a la colombiana se guarda 1000 veces menor; no agrupa miles, a diferencia del `MontoInput` de Presupuesto (`presupuesto-programacion.tsx`) | El proyecto queda con un valor equivocado sin ningún aviso (~$250 en vez de $250.000) | Reutilizar `MontoInput`/normalización de montos en la creación |
| 7 | media | src/components/crm/client-list.tsx:229-233,275-276 | Los chips de fecha formatean con `new Date("YYYY-MM-DD")` + `toLocaleDateString` sin `timeZone`: en Bogotá (UTC-5) el día mostrado es el anterior al elegido | Se filtra «Desde 01/08» y el chip dice «Desde: 31/07» (ninguna prueba cubre el chip) | Formatear en UTC o desde las partes del ISO |
| 8 | media | src/components/proyectos/project-list.tsx:221 · project-gastos.tsx:212 · src/components/crm/interacciones-feed.tsx:95 | Listas sin paginación ni tope: la API no tiene `take` (`projects/route.ts` solo hace `findMany`; `expenses` e `interactions` tampoco) y la UI pinta todas las filas | Con cientos de proyectos/gastos/interacciones la página se vuelve interminable y lenta | Paginar en la API (`take/skip` o cursor) con «cargar más» |
| 9 | baja | src/components/proyectos/project-list.tsx:187 | Si `GET projects` falla, la tarjeta queda vacía: el único aviso es un toast que se desvanece (el chip de conteo muestra «—») | Pantalla sin proyectos, sin mensaje en página ni botón de reintento; parece una lista vacía | Mensaje en la tarjeta con «Reintentar» (como el resto de vistas) |
| 10 | baja | src/components/proyectos/print/project-print-sheet.tsx:362 · gasto-form.tsx:187-193 | Períodos en crudo en la hoja imprimible («Corte 2026-11.») y en el select de Periodo del gasto (opciones «2026-10»), cuando `mesLegible` existe y se usa en la ficha | El mismo mes sale «nov 2026» en una pantalla y «2026-11» en otra (y en el PDF) | Formatear con `mesLegible` conservando el `value` ISO |
| 11 | baja | src/components/crm/shared.tsx:69 | Prioridad desconocida cae en el `else` y se pinta «Baja» con punto azul: un dato inesperado se muestra como otro valor válido | Un valor corrupto o futuro se lee como «Baja» | Fallback explícito («—» o el valor crudo) |
| 12 | baja | src/components/proyectos/project-financiero.tsx:238-241 | La frase de la barra redondea E/P a entero (`Math.round(ep_decimas/10)`) mientras la tabla y los KPI muestran un decimal | «Ejecutado … (56 %)» en la barra y «56,2 %» en la tabla, para el mismo dato | Usar `formatPercent` con `ep_decimas` en la frase |

LISTO PARA INTEGRAR: Z3

## Z4 · Ancho angosto (390 px)

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | media | src/components/proyectos/project-ficha.tsx:92-99 | Las 5 pestañas (`flex-none px-3`, 15.5 px) suman más que el ancho útil de 390 px (~310) y el contenedor usa `overflow-x-auto` + `no-scrollbar`: «Documentos» e «Historial» quedan fuera de pantalla sin barra ni degradado que lo insinúe | Cree que la ficha tiene tres pestañas; las otras dos existen pero no hay pista visual | Copiar las máscaras de degradado de `client-sheet.tsx:183-184` o mostrar la barra de scroll |
| 2 | media | src/components/proyectos/portafolio-kpis.tsx:82 | El valor de «Presupuesto activo» es `whitespace-nowrap` en un grid de 2 columnas (interior ~141 px) y sin `truncate`/`min-w-0`: un monto largo (`$ 999.999 M`, `$ 5.000.000 M`) no puede envolver ni recortarse y se sale del tile | El número se desborda del recuadro y arrastra el ancho de la página en móvil | Quitar `whitespace-nowrap` o añadir `truncate` + `title` con el monto completo |
| 3 | baja | src/components/proyectos/ficha/actividades-tablero.tsx:119-120 | Kanban con `min-w-[44rem]` dentro de `overflow-x-auto`: en 390 px solo se ven 2 de 4 columnas y no hay indicador ni snap | El tablero parece tener dos columnas; no se descubre que hay más a la derecha | Carrusel con snap o segmentado de columna en móvil |
| 4 | baja | src/components/proyectos/estructura-gantt.tsx:103-105 | La cabecera de semanas (`gantt-header`) no es `sticky` dentro del scroll horizontal de la propia Carta Gantt | Al desplazarse a la derecha se pierden las etiquetas de semana (S1…Sn) y las barras quedan sin referencia | `sticky top-0` en la cabecera (o agrupar por mes en móvil) |
| 5 | baja | src/components/crm/client-list.tsx:783-810,1029 | La vista «Detalles» (9 columnas, `min-w-[880px]`) no se oculta en móvil, a diferencia de Tarjetas/Lista que sí tienen fallback; en 390 px solo queda scroll lateral dentro del contenedor de la tabla | Una tabla de 9 columnas apretada con scroll horizontal, sin la vista compacta que ofrecen las otras dos | Ocultar «Detalles» bajo `md` en el selector de vista |
| 6 | baja | src/components/proyectos/ejecucion-avance.tsx:99-108 | La fila de avance no envuelve: el texto `% real · % plan` va con `shrink-0` junto a la barra | Con «100 % real · 100 % plan» la barra queda reducida al mínimo y la fila muy apretada | `flex-wrap` en la fila o mostrar solo el % real en móvil |

LISTO PARA INTEGRAR: Z4

## Z5 · Calidad de las pruebas nuevas

| # | Gravedad | Archivo:línea | Problema | Qué ve el usuario | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | media | src/components/crm/client-list.test.tsx:53-79 | `vi.mock("@/hooks/crm")` sin `importOriginal` reescribe `esVencida`, `formatCOP`, `formatFecha` e `iniciales` con copias a mano: los asertos de «Vencido» y de montos prueban las copias, no la lógica real (y `esVencida` no se ejercita en ninguna otra prueba) | Nada directo; una regresión real de esos helpers pasaría la suite | Mock parcial: `vi.mock("@/hooks/crm", async (io) => ({ ...(await io()), useClients: …, useUsers: … }))` |
| 2 | media | src/components/proyectos/project-create-dialog.test.tsx:232-233 | Depende del reloj real sin fijarlo y usa la misma función del componente como oráculo (`fechaDeHoy()`/`fechaMasMeses`, importadas en :13): un default equivocado (p. ej. mañana) pasaría, y es frágil a medianoche | Nada directo; el «hoy» del formulario no está realmente verificado | `vi.useFakeTimers(); vi.setSystemTime(...)` y asertar fechas literales |
| 3 | media | src/components/proyectos/ejecucion-avance-form.test.tsx:134 · ejecucion-indicadores.test.tsx:125 | Igual que Z5-2: `expect(fecha.max).toBe(todayInBogota())`, sin fake timers y contra la propia función | Nada directo; el tope «hoy Bogotá» no queda anclado a una fecha fija | Fijar el sistema y comparar contra el ISO literal esperado |
| 4 | media | src/components/crm/entity-dialogs.test.tsx:117-121 | El título promete «the fixed fecha_envio_propuesta», pero el cuerpo solo asevera «Prospección» y /Ganada/; la fecha del fixture (:96) no se comprueba en ningún expect | Nada directo; un render que omitiera la fecha pasaría la prueba | Añadir el aserto de la fecha formateada |
| 5 | media | src/components/crm/salud-vista.test.tsx:88,117 | Oráculos tautológicos: `toBe(new Intl.NumberFormat(...).format(90.7))` y `getByText(formatearPuntaje(56))`; si `formatearPuntaje` devolviera siempre «Sin datos», seguirían en verde | Nada directo; el formato del puntaje no queda demostrado | Asertar literales («90,7», «56») |
| 6 | media | src/components/proyectos/ficha/ficha-resumen.test.tsx:275-282 | El título anuncia «while the user is unknown and in states that allow no edits», pero solo se monta el caso de estado (CERRADO con rol GERENCIA); el caso `usuario: null` (default de `mockApi`, :73) no se ejercita | Nada directo; el botón reapareciendo con usuario desconocido pasaría la suite | Montar con `mockApi()` y asertar la ausencia del botón |
| 7 | baja | src/components/crm/client-form.test.tsx:166-168 | «does not fetch documents until the picker is opened» solo comprueba que el encabezado no está; si el componente llamara a `useDocuments` al montar, seguiría verde | Nada directo | `expect(useDocumentsMock).not.toHaveBeenCalled()` |
| 8 | baja | src/components/proyectos/project-list.test.tsx:839-849 | Repite los cuatro asertos de :543-551 sobre el mismo enlace; lo único nuevo es el `queryByRole` final | Nada directo; duplica mantenimiento | Fusionar ambos casos |
| 9 | baja | src/components/crm/client-sheet.test.tsx:197-201 | Repite los asertos de :188-195 cambiando solo `puede_editar`; sin `it.each` | Nada directo | Unificar con `it.each([true, false])` |
| 10 | baja | src/components/crm/saved-views.test.tsx:65 | `getByText("0")` es global: pasaría con cualquier cero del DOM y no verifica el contador del botón «Vistas» | Nada directo | Acotar al botón: `expect(getByRole("button", { name: /Vistas/ })).toHaveTextContent("0")` |
| 11 | baja | src/components/proyectos/project-list.test.tsx:347 | `toBeGreaterThanOrEqual(6)` cuando el comentario espera 10 (6 filas + 4 tiles): pasaría aunque desaparecieran los tiles | Nada directo | Asertar el total exacto (10) o contar por región |
| 12 | baja | src/components/proyectos/project-list.test.tsx:489 | `void container`: binding muerto, residuo de un aserto eliminado (declarado en :479) | Nada directo | Eliminar el binding |

LISTO PARA INTEGRAR: Z5

## Cierre del lote 3

Revisión de solo lectura terminada: Z1–Z5 verificados en el código, con `tsc` en verde y dos corridas puntuales de vitest. Resumen para el triaje de Claude antes del congelamiento:

- **Alta (datos en pantalla):** `client-sheet.tsx:559` — quien no puede editar ve «—» en Nombre, Empresa, Tamaño y Ubicación de la ficha del cliente.
- **Medias con datos visibles:** la fecha de subida de los documentos siempre es «—» (Z3-2); el valor total de la creación no normaliza separadores de miles (Z3-6); los chips de fecha del filtro de Clientes muestran el día anterior (Z3-7); un fallo del portafolio se disfraza de «Sin medir» (Z3-3); la curva del tablero muestra un falso vacío mientras carga o falla (Z3-4); y los selects obligatorios de los diálogos de CRM quedan sin nombre accesible (Z2-1).
- **Resto:** textos inconsistentes, accesibilidad y pulido de 390 px, ordenados por gravedad en cada sección.
- **Nota de base:** la revisión se hizo sobre `feat/projects-v2` en `ab60d3c`. Mientras corría, la rama sumó commits del carril R que no tocan la UI citada salvo `gasto-form.tsx` (parser de valor es-CO, `f8a871b`): allí los números de línea corren +3 (el select de Rubro quedó en 171-179 y «Mes del documento» en 192). Los demás archivos citados no cambiaron en esa ventana.
- No se pudo navegar en el puerto 3001 (sin Supabase local); Z4 se verificó por clases, como permite el prompt. Sin commits de código y sin push.

LISTO PARA INTEGRAR: TODO LOTE 3

---

# Lote 4 — revisión de migraciones y runbook (carril W)

Rama: `feat/deepseek-revision-2`, creada desde `feat/projects-v2` (`b8cce20`) · Worktree: `../MuttuHub-CRM-worktrees/ficha-ux`. Sin commits de código: este lote solo escribe este log.

Contexto leído: tareas R4 (corridas 1 y 2) y R4b del plan; las dos migraciones nuevas (`20260930000000_v2_adopt_production_v1_shape` y `20261016120000_v2_reconcile_adopted_v1_drift`); `prisma/v1-production-shape.invariant.test.ts`; `scripts/migrate-v2/_guard.ts`, `_harness.ts` y `s1-rubros.ts`; `prisma/local-env.ts` y `prisma.config.ts`; el runbook; el DDL v1 del commit `6e4c6c8`; `schema.prisma` y las migraciones v2 vecinas.

Verificaciones del lote (sin conectarse a ninguna base ni leer el `.env`):
- Marcadores de forma v1 contra la forma v2 real: `territorio` (no existe en `proyectos` v2), `concepto` (no en `gastos` v2), `meta_valor` (no en `indicadores` v2), `actividad_id` (no en `soportes_proyecto` v2), `meta_id`+`objetivo_id` (v2 tiene `objetivo_id` y no `meta_id`), `metas` (ninguna migración del repo la crea). Sin falsos positivos encontrados.
- Orden de DROP del adopt: hijos antes que padres (`soportes_proyecto`→`gastos`→`indicadores`→`actividades`→`metas`→`proyectos`, y la FK de `lineas_presupuestales` a `proyectos` se quita antes). Sin bloqueos por FK en la forma real.
- Enums: los tres v1 quedan sin uso tras los DROP; la rama «en uso» existe pero no se activa en ninguna de las dos formas conocidas.
- `bash -n` sobre los 16 bloques bash del runbook (extraídos a `/tmp`): 14 en verde; 2 fallan solo por los placeholders `<…>` (ver W2-5).
- Entorno del WSL del operador: `command -v` → `eza`, `rg`, `supabase` (v2.110.0), `docker`, `node` presentes; **`psql` ausente**. `docker images` → hay `public.ecr.aws/supabase/postgres:17.6.1.143` pero **no** `postgres:17`.
- Dump del viernes (`~/muttu-backups/2026-10-16`, inspeccionado solo por metadatos y conteos, nunca por contenido de filas): `schema.sql` = 28 `CREATE TABLE` (todas de `public`, con `IF NOT EXISTS`) + extensiones; `data.sql` = 61 `COPY` (28 de `public`, 26 de `auth`, 7 de `storage`), con `session_replication_role = replica`.

## W1 · Las dos migraciones nuevas

| # | Gravedad | Archivo:línea | Problema | Consecuencia el domingo | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|
| 1 | media | prisma/migrations/20260930000000_v2_adopt_production_v1_shape/migration.sql:107-119 · prisma/v1-production-shape.invariant.test.ts:36-50 | El RAISE «tabla v1 con filas» vive en el mismo bucle que los DROP: si la tabla con filas es tardía (p. ej. `proyectos`, ord 6), las cinco anteriores ya se borraron. En `migrate deploy` no hay transacción que lo revierta (el propio runbook 3.4 dice «deja la migración parcialmente aplicada»; R4 corrida 1 lo vivió como «a medias» + P3009). El arnés de la prueba envuelve siempre en una transacción y hace rollback, así que no puede observar ese estado | Con la forma real verificada no se activa (las 6 tablas tienen 0 filas), pero si se activara la base queda a medias y hay que saltar al respaldo sin que el mensaje del RAISE lo diga | Dos fases: recorrer las 6 tablas y validar filas primero; borrar solo si ninguna tiene filas |
| 2 | baja | prisma/migrations/20260930000000_v2_adopt_production_v1_shape/migration.sql:138-154 vs prisma/migrations/20261006120000_v2_proyecto_general/migration.sql:25-30 · prisma/v1-production-shape.invariant.test.ts:289-300 | La rama que OMITE el DROP de un enum en uso no tiene ninguna prueba (la invariante solo cubre el caso «sin uso»). Si se activara, el enum v1 sobrevive; el `CREATE TYPE` v2 va guardado con `duplicate_object` (20261006120000:25-30), así que lo traga y la app recibe `EstadoProyecto` sin `BORRADOR` | Ninguna con la forma verificada (tras los DROP los tres enums quedan libres y el ensayo confirmó «solo enums v2»); el hueco es de la red de seguridad | Añadir a la invariante un caso con una tabla que use el enum y exigir que el DROP se omita (y el contraste con el enum v2 presente) |
| 3 | baja | prisma/v1-production-shape.invariant.test.ts:270-300,346-367 · prisma/migrations/20260930000000_v2_adopt_production_v1_shape/migration.sql:37-39,97-102 | Diferencias de cobertura frente a lo que la migración hace: el RAISE se prueba solo con `proyectos` y `metas` (faltan `gastos`, `indicadores`, `soportes_proyecto`, `actividades`); no se prueba la exclusión por `v2_column` (actividades con `meta_id` y `objetivo_id`); no se prueba la rama sin `_prisma_migrations` (adopt:37-39); la conciliación solo prueba el RAISE de `rubros`, no el de `lineas_presupuestales` | Ninguna directa el domingo (el ensayo cubrió la forma real completa); son huecos de la red de seguridad que se cierran con el mismo patrón ya escrito | Añadir los 4-5 casos que faltan (mismo estilo, esquema desechable + rollback) |

LISTO PARA INTEGRAR: W1
