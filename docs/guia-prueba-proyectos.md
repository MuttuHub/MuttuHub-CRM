# Guía de prueba paso a paso: sección Proyectos (v2)

Cubre lo construido en las slices S0 a S14: crear un proyecto desde una oportunidad ganada, ficha, historial,
equipo, estructura y Gantt (S3), plantilla Excel (S7), presupuesto y programación (S5), aprobación de línea base
(S8), ejecución técnica y semáforo (S4), gastos y validación (S6), ficha financiera, modificaciones y versiones (S8),
administración, "Mi resumen", y el tablero gerencial con indicadores y exportaciones a Excel (S9). Todo corre en local; nunca contra el Supabase remoto. Los textos entre comillas son
los que renderiza la interfaz (verificados contra el código el 2026-10-09).

> **Actualización 2026-10-14:** la ficha pasó a **once pestañas** (P1): **Beneficiarios**, **Soportes** y **Equipo**
> son pestañas propias, y las antiguas **Avance**, **Presupuesto** y **Gastos** se llaman ahora
> **Ficha de seguimiento**, **Financiero** y **Legalización**. La tabla de pestañas de abajo es la fuente de verdad.
> **Actualización 2026-10-12:** la ficha pasó a ocho pestañas y esta guía se refrescó para S14 (secciones de
> Proyectos contra el diseño v6). Los textos de interfaz siguen verificados contra el código; lo nuevo de S14 se
> apoya en la ejecución de la slice (`odd/tasks/v2-projects-v6-sections.md`).

## Cómo está organizada la ficha (pestañas)

**Ver detalle** abre la ficha en su propia página, `/proyectos/<id>`, en la **misma ventana**
(es un enlace normal; Ctrl o clic central lo abren en otra pestaña si se quiere). La página tiene el botón
**Volver a proyectos** (lleva a `/proyectos`), un **encabezado fijo** y once pestañas. No hay diálogo. Un id que no
existe muestra "Proyecto no encontrado"; un proyecto que el usuario no puede ver muestra "No tienes acceso a este
proyecto". Para no confundir: las pestañas de abajo son las de la ficha; la pestaña del navegador es otra cosa.
Todos los pasos de esta guía nombran la pestaña de la ficha donde está cada cosa:

| Pestaña | Contiene |
|---|---|
| **Resumen** | Tarjetas KPI, tarjeta **Requiere atención**, datos generales (origen, cliente, responsable, fechas, duración, valor total), **Líneas estratégicas** y **Municipios** |
| **Metas e indicadores** | **Metas e indicadores** (objetivos, actividades, entregables), **Indicadores** (registro de avance por indicador) y **Descargar plantilla** / **Importar plantilla** |
| **Cronograma** | **Cronograma** por semanas (solo lectura) |
| **Gantt** | **Gantt** por semanas |
| **Ficha de seguimiento** | Semáforo técnico, **curva S** (técnica y financiera), tarjetas laterales del corte y **avance por meta**; los entregables se registran con **Registrar avance** y, a nivel de cada actividad, su propio **Registrar avance** (estado En curso, AJ-01) |
| **Financiero** | **Presupuesto** (con programación mensual, **gauge** y barras por rubro) y **Ficha financiera** |
| **Legalización** | **Gastos** (libro mayor con KPIs, filtros y tabla) |
| **Beneficiarios** | **Beneficiarios** (registro de beneficiarios del proyecto) |
| **Soportes** | **Soportes** (todos los soportes vivos del proyecto, solo metadatos) |
| **Equipo** | **Equipo** (integrantes del proyecto y sus roles) |
| **Cambios** | **Modificaciones**, **Versiones**, **Historial** y **Exportar fichas** (corte, base y exportaciones a Excel) |

- **Encabezado fijo** (se ve en todas las pestañas): código, nombre, botón **Aprobar línea base** (solo en
  Borrador y solo admin/gerencia), chip de estado y, fuera de Borrador, los chips **Semáforo técnico: <color>** y
  **Semáforo financiero: <color>**. Solo aparecen cuando el proyecto es medible (En ejecución, Suspendido o
  Cerrado) y ya cargaron los indicadores.
- Los chips de semáforo llevan **siempre la palabra del color** (Verde, Amarillo o Rojo), no solo el color.
- Las pestañas inactivas **no se montan**: cada una consulta sus datos solo cuando la abres (la primera vez puede
  mostrar un instante de carga). La pestaña inicial es **Resumen**.

Usuarios (contraseña `MuttuDemo2026!`, dominio `demo.muttuhub.local`):

| Usuario | Rol | Para qué lo usas aquí |
|---|---|---|
| `admin@` | Administrador | Todo, incluida Administración |
| `gerencia@` | Gerencia | Gestiona proyectos; recibe la notificación de sobreejecución |
| `coordinador@` | Coordinador | Ve solo sus proyectos; puede registrar avances/gastos y solicitar modificaciones si es integrante |
| `colaborador@` | Colaborador | Solo lectura; sirve para los checks negativos y, con la bandera gerencial (§J), para el tablero |

## Recorrido de 10 minutos para la reunión

Camino feliz más corto que muestra más valor. Prepáralo ANTES (ver §0 y §A): proyecto ya importado y aprobado.

Antes de la reunión (5 min, una sola vez):
1. §0 completo (migraciones, reset de la demo, `npm run dev`).
2. Crea un proyecto (§1) y corre el piloto de la plantilla con `--apply` (§A.3). Deja ese proyecto en Borrador.
3. Si quieres mostrar el flujo de errores en vivo, deja el segundo archivo (`...-error-v13.xlsx`) a mano.

En la reunión (como `admin@`, salvo donde se indica):
1. **Proyectos > Ver detalle** del proyecto en Borrador (abre en la misma ventana, en **Resumen**: datos y **Equipo**; **Volver a proyectos** regresa a la lista). Pestaña
   **Cronograma**: el **Cronograma** por semanas. Pestaña **Gantt**: el **Gantt** por semanas. Pestaña **Financiero**: **Presupuesto** (Σ asignado =
   Valor total). (1 min)
2. En la pestaña **Metas e indicadores**, **Importar plantilla** con el archivo de error: se ve la tabla por hoja y
   **Descargar reporte (.csv)**; nada se escribió. (1 min)
3. **Aprobar línea base** (está en el encabezado, visible en cualquier pestaña) > **Aprobar**: el proyecto pasa a
   **En ejecución**, el encabezado muestra el estado y se habilitan ejecución, gastos, modificaciones y versiones.
   (1 min)
4. Pestaña **Ficha de seguimiento**: **Registrar avance** en un entregable con un enlace https (URL y "Nombre del enlace", ambos obligatorios; espera a que
   el diálogo cierre solo: el enlace se guarda en una segunda petición); mira el
   **Semáforo técnico** (también en el encabezado, con la palabra del color) y la insignia **No confirmado**.
   (2 min)
5. Pestaña **Legalización** > **Registrar gasto** con soporte. Sal y entra como `gerencia@`: cola **Gastos por validar**
   (en **Proyectos**) y, en la pestaña **Legalización** de la ficha, **Validar**. Muestra que el registrante ve "Tú lo
   registraste" en vez de los botones. (2 min)
6. **Sobreejecución** (pestaña **Legalización**): un gasto mayor al asignado del rubro; como `gerencia@` **Validar** da
   409 con "Se notificó a Gerencia" y aparece en la campana, grupo **PROYECTOS**. (1 min)
7. **Solicitar modificación** (traslado) como `admin@` en la pestaña **Cambios**, **Aprobar** como `gerencia@`, y
   en **Versiones** (misma pestaña, bajo Modificaciones) compara `v0` contra **Vigente**. (2 min)

8. **Cierre con el Tablero** (como `admin@` o `gerencia@`): en **Proyectos** abre la pestaña **Tablero**
   (`/proyectos?vista=tablero`): tarjetas del portafolio, semáforos por proyecto, insignia **No confirmado** y
   **Exportar Excel**. Abre **Ver detalle**, muestra los dos chips de semáforo del encabezado y, en la pestaña
   **Metas e indicadores**, la sección **Indicadores**. (1 min; ver §J)

9. **Vista móvil (S10)**: con el navegador en modo responsive o la ventana más angosta que 768 px, la lista y el
   tablero pasan a tarjetas, y **Registrar avance** / **Registrar gasto** abren una hoja desde abajo con controles
   de 44 px. Las barras de avance muestran real contra programado. (1 min; solo es una simulación por ancho, no un
   teléfono real)

Si el tiempo aprieta, corta el paso 2 y el 6. El paso 8 solo luce con el proyecto ya **En ejecución** (paso 3) y
al menos un avance o gasto validado; un Borrador sale en el tablero como "Sin medir".

## 0. Preparación

1. Base local arriba (Docker/Supabase en `127.0.0.1:54322`). Aplicar TODAS las migraciones pendientes (S3 a S8)
   **solo a la base local**:
   ```bash
   npm run db:migrate:status:local
   node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
   npm run db:generate:local
   ```
2. Dejar la demo en estado inicial (primero en seco, luego aplicar):
   ```bash
   npm run db:demo:reset:local
   npm run db:demo:reset:local -- --apply
   ```
3. Levantar el servidor: `npm run dev` (si lo levantas desde Windows y WSL no conecta, usa la IP de la puerta de
   enlace; ver `docs/guia-demo.md` §1.6). La primera carga de cada ruta puede tardar 30 a 60 s.
4. Los scripts con `tsx` (piloto de plantilla y `set-project-estado`) cargan `.env.local` solos y se niegan a
   correr contra una base que no sea local. En el shell donde se desarrolló `tsx` NO funcionaba (esbuild de
   Windows): córrelos desde un shell donde `tsx` sí arranque (WSL o PowerShell con `npx tsx --version` OK).

### 0.1 Seed de proyectos (demo)

Alternativa al recorrido manual: deja datos listos para mostrar (cifras y nombres ficticios, todo local).

```bash
npm run db:demo:seed-projects:local                # en seco (por defecto): imprime el host y el plan
npm run db:demo:seed-projects:local -- --apply     # escribe
```

Qué crea (escrito por los mismos servicios que usa la API: importador de plantilla, aprobación de línea base,
validación de gastos y la bitácora de auditoría):

- `Demo CedeTextil · En ejecución` (`PRY-2026-001` en una base recién sembrada): línea base aprobada (versión v0,
  por lo que Versiones y Modificaciones funcionan), 4 actividades, 7 entregables, 2 indicadores, presupuesto de
  $177.360.000 y programación mensual. Trae 5 avances (todos con enlace https como medio, salvo uno sin medio a propósito),
  3 mediciones y 5 gastos con soporte https: 2 VALIDADO, 2 REGISTRADO y 1 REGISTRADO con alerta de sobregasto
  (validarlo supera el rubro R11 y queda bloqueado y notificado).
- `Demo CedeTextil · Ruta de fortalecimiento` (`PRY-2026-002`): en BORRADOR con la misma estructura, presupuesto
  y programación importados, para mostrar "Aprobar línea base" en vivo.
- Una oportunidad GANADA sin proyecto, para mostrar "Convertir en proyecto". `prisma/seed.ts` trae dos GANADA y el
  seed consume ambas; si quedan menos de tres libres agrega UNA ficticia ("Demo · Programa de formación técnica ...").

Segunda corrida: no cambia nada. Si existen los DOS proyectos demo (por nombre exacto), imprime
`Demo projects already seeded (...). Nothing was changed.` y termina con código 0. Si existe solo uno (una corrida
anterior falló a medias), no escribe nada, imprime `A previous demo seed run was incomplete ...` y termina con código
distinto de 0: hay que restaurar la base como se indica abajo. Cubierto por pruebas unitarias; no se provocó una
falla real a medias contra la base.

Restaurar la demo: `db:demo:reset:local` NO puede borrar estos proyectos (el aprobado tiene filas en tablas de solo
agregar: `versiones_proyecto`, `acceso_soportes`, `auditoria_cambios`, protegidas por triggers). El camino es
`npm run db:migrate:reset:local` y luego `npm run db:seed:local`. ADVERTENCIA: esto borra TODA la base local; no lo
corre el seed ni nadie por ti.

Verificado el 2026-10-09 contra la base local (`127.0.0.1:54322`) con una consulta de solo lectura: 2 proyectos
(`EN_EJECUCION` y `BORRADOR`), 1 versión (v0), 5 avances con 5 medios, 3 mediciones, 5 gastos (2 VALIDADO,
3 REGISTRADO, uno con alerta) y 1 oportunidad GANADA libre. No verificado: cómo se ven el Tablero y los semáforos en
el navegador, ni el flujo "Convertir en proyecto" con clics. Los semáforos dependen de la fecha: las fechas de los
avances y gastos son "hoy" al correr el seed, pero el proyecto dura del 2026-10-05 al 2027-01-29; corrido mucho
después, el semáforo técnico saldrá más atrasado.

## 1. Crear un proyecto (admin)

1. Entra como `admin@demo.muttuhub.local` y abre **Proyectos** en el menú.
2. La lista debe estar vacía. Pulsa **Nuevo proyecto**: el paso **General** de la página lista oportunidades en estado **Ganada** (hay dos).
3. Elige una; se precargan cliente, nombre y valor. Completa fecha de inicio, fecha de fin, línea estratégica
   principal y municipios, y confirma.
4. Resultado esperado: el proyecto aparece como `PRY-2026-001` en estado **Borrador**, y esa oportunidad ya no sale
   como elegible.

## 2. Ficha del proyecto

1. En la fila, usa **Ver detalle**. Se abre la ficha en su propia página (`/proyectos/<id>`) en la misma ventana, en la
   pestaña **Resumen**, sin diálogo; **Volver a proyectos** regresa a la lista. El encabezado muestra código, nombre y estado
   (un Borrador no muestra chips de semáforo).
2. En **Resumen** revisa datos generales, **Líneas estratégicas**, **Municipios** y la duración en semanas
   (derivada de las fechas).
   Como admin o gerencia, pulsa **Editar datos generales** (en Borrador edita todo; en Ejecución solo la descripción y
   los beneficiarios, y fechas y valor se piden como modificación desde el enlace del diálogo, que lleva a Historial).
3. Abre la pestaña **Cambios**, al final **Historial**: debe verse un paso "conversión de oportunidad + creación" y otro paso separado
   "Integrante del equipo" (el responsable se agregó como miembro al crear).

## 3. Equipo (S2.6)

1. En la ficha, pestaña **Resumen**, sección **Equipo** (al final de la pestaña): aparece el responsable.
2. Agrega a otro usuario con el selector. El servidor solo acepta **coordinadores activos**; si eliges otro rol,
   verás el mensaje de error del servidor (comportamiento esperado, el selector aún no filtra por rol).
3. Agregar al mismo usuario dos veces responde 409. Quitarlo lo marca como baja lógica (no se borra la fila).
4. Revisa el **Historial** (pestaña **Cambios**): cada alta y baja queda auditada.
5. Visibilidad: entra como `coordinador@`. Solo debe ver los proyectos donde es miembro activo; si lo quitas, el
   proyecto desaparece de su lista de inmediato. `colaborador@` no ve la sección de gestión del equipo.

## 4. Estructura técnica (S3)

En la ficha, pestaña **Metas e indicadores** (sección **Metas e indicadores**), de un proyecto en **Borrador**, como admin o
gerencia:

1. **Objetivos**: crea uno (código y descripción). Aparece con contador de actividades e indicadores.
2. **Actividades**: dentro del objetivo, crea una con semana de inicio y fin.
   - Las fechas se muestran **calculadas** a partir de las semanas del proyecto; no se editan a mano.
   - Sin peso, el peso es la duración en semanas. Si escribes un peso, aparece la marca **Peso manual**.
   - Una semana fuera de la duración del proyecto responde error 400.
3. **Entregables**: dentro de la actividad, crea uno (código, descripción, cantidad meta, unidad, tipo de medio).
   Una actividad sin entregables muestra una advertencia.
4. **Indicadores**: dentro del objetivo, crea uno (código, nombre, meta, unidad, línea base opcional).
5. **Reglas a comprobar**:
   - Código repetido en el mismo proyecto: 409 (no distingue mayúsculas).
   - Borrar un objetivo con actividades o indicadores: 409. Borrar una actividad con entregables: 409.
   - Borra primero los hijos y luego el padre: debe funcionar.
   - Cada alta, cambio o borrado aparece en el **Historial** (pestaña **Cambios**).
6. **Solo lectura**: entra como `coordinador@` (miembro) o `colaborador@`. La estructura se ve pero sin controles de
   edición. Un proyecto fuera de Borrador también queda de solo lectura con una nota que lo explica.

## 4b. Cronograma (Gantt, S3.6b)

Está en la pestaña **Gantt**. Cualquier rol que vea la ficha lo ve.

1. En la ficha de un proyecto con fechas y actividades, abre la pestaña **Gantt** y busca el encabezado
   **Cronograma por semanas**.
2. Esperado: una cabecera `S1, S2, ...` con la fecha de cada semana, y por objetivo una barra por actividad con
   su código, ubicada entre su semana inicial y final.
3. Crea otra actividad en Metas e indicadores (§4): la barra aparece sin recargar. Una actividad con peso manual muestra el
   icono **Peso manual**.
4. Estados vacíos: sin actividades, "Aún no hay actividades para mostrar en el cronograma."; sin fechas del
   proyecto, "Define las fechas del proyecto para ver el cronograma."
5. Es solo lectura: no se arrastra ni se edita desde el Gantt.

## A. Plantilla Excel (S7)

Solo `admin@` o `gerencia@`, y solo con el proyecto en **Borrador**. Los botones **Descargar plantilla** e
**Importar plantilla** están en la pestaña **Metas e indicadores**, en el encabezado de la sección. Otros roles no los ven; fuera de Borrador tampoco.

### A.1 Descargar y llenar
1. **Descargar plantilla**. Si el proyecto no tiene fechas, la API responde 409: "Define las fechas del proyecto
   antes de descargar la plantilla."
2. El libro tiene nueve hojas: `1. Instrucciones`, `2. Proyecto`, `3. Objetivos`, `4. Actividades`,
   `5. Entregables`, `6. Indicadores`, `7. Presupuesto`, `8. Programación`, `9. Catálogos` (protegida).
   `2. Proyecto` trae código y cliente ya llenos; ahí van fechas, valor total y "Meta de beneficiarios".
3. Llénalo a mano solo si hay tiempo. Para la reunión usa el piloto (A.3), que genera libros ya llenos.

### A.2 Validar e importar
1. **Importar plantilla**. Se abre el diálogo "Importar plantilla de proyecto": reemplaza estructura, presupuesto,
   programación, fechas, líneas y municipios del borrador. Si hay errores, no se escribe nada.
2. Elige el `.xlsx` en "Archivo de la plantilla (.xlsx, máx. 4 MB)" y pulsa **Validar plantilla**.
3. Libro válido: "La plantilla es válida.", resumen (objetivos, actividades, entregables, indicadores, rubros con
   presupuesto, celdas de programación) y "Se reemplazará: ...". Pulsa **Confirmar importación**.
   Un responsable desconocido sale como advertencia ("no bloquean la importación").
4. Libro con errores: alerta "La plantilla tiene N errores. No se importó nada" y tabla por hoja con columnas
   Regla, Fila, Columna, Valor, Mensaje. **Descargar reporte (.csv)** baja el detalle.
5. Verifica que tras la importación la estructura (pestaña **Metas e indicadores**), el Gantt (pestaña **Gantt**)
   y el presupuesto (pestaña **Financiero**) quedaron llenos, y que el **Historial** (pestaña **Cambios**) muestra un solo lote.
6. Negativos:
   - Archivo que no es Excel: "Solo se acepta la plantilla en formato Excel (.xlsx)."
   - Más de 4 MB: "El archivo supera el límite de 4 MB."
   - Proyecto ya aprobado: los botones desaparecen (la API responde 409).
   - Proyecto con avances, mediciones o beneficiarios: 409 con el mensaje del historial (no se reemplaza).
   - `coordinador@` o `colaborador@`: no ven los botones (la API responde 403).

### A.3 Piloto local (libros de ejemplo "CedeTextil", cifras ilustrativas)
Necesita un proyecto en Borrador ya creado (§1). Primero en seco:
```bash
npx tsx scripts/import-plantilla-demo.ts --project PRY-2026-001
npx tsx scripts/import-plantilla-demo.ts --project PRY-2026-001 --actor admin@demo.muttuhub.local --apply
```
Con `--apply` escribe en `tmp/plantilla-demo/` el libro válido (`PRY-2026-001-valida.xlsx`, se importa) y el que
falla (`PRY-2026-001-error-v13.xlsx`: la programación de R12 no cuadra con lo asignado por $50.000). Sube el segundo en el
diálogo para mostrar la tabla de errores. Ojo: el libro válido fija fechas 2026-10-05 a 2027-01-29, valor total
$177.360.000 y responsable `ana@muttu.co` (no existe en la demo: sale la advertencia). Ver también
`docs/guia-demo.md` §1.7.

### A.4 Estructura desde el Excel de la PO (B3)

**Importar estructura (formato PO)** está junto a **Importar plantilla**, con los mismos roles y solo en Borrador
(también con la estructura vacía). Lee el `proyecto.xlsx` de la PO: una hoja de indicadores (`Objetivo especifico |
Resultados (indicador) | Resultados (meta)`) y una de actividades con una fila por entregable (`Objetivo especifico |
Actividad | Entregables | Inicio (semana) | Fin (semana) | Cantidad | Unidad`). No toca el presupuesto.

1. Sube el `proyecto.xlsx` de la PO **tal cual** y pulsa **Validar**. Esperado: "El archivo tiene 2 errores. No se
   importó nada", con «La hoja «Ejemplo1» no tiene la columna «Cantidad»…» y «…«Unidad»…». La cantidad no se lee del
   texto del entregable.
2. Agrega en la hoja `Ejemplo1` las columnas **Cantidad** y **Unidad** con un valor por fila y valida de nuevo.
   Esperado con el archivo de la PO: "El archivo es válido: 3 objetivos, 12 actividades, 15 entregables y 4
   indicadores." y el árbol O1 → IND-01 → A1.1 → E1.1.1… Las filas con la misma actividad quedan en una sola
   (A1.4, semanas 3–6, con tres entregables). Si el borrador ya tiene estructura, aparece "Reemplaza la estructura actual
   (…). El presupuesto no cambia."
3. Con fechas de proyecto más cortas que las semanas del archivo, la validación marca la celda de **Fin (semana)**:
   "La semana final no puede superar la duración del proyecto (N semanas)."
4. **Confirmar importación**: toast "Estructura importada."; **Metas e indicadores** muestra los códigos generados y
   **Presupuesto** sigue igual. **Historial** → **Cambios**: un lote `IMPORTAR` con una fila por objetivo, actividad,
   entregable e indicador, más la fila `reemplazo`.

## B. Presupuesto y programación mensual (S5)

Pestaña **Financiero** de la ficha, sección **Presupuesto** (arriba; la **Ficha financiera** va debajo, §F). Se edita solo en **Borrador** y solo `admin@` o
`gerencia@`; el resto lo ve en solo lectura.

1. Tabla por rubro con columna **Asignado**. Escribe montos (acepta coma o punto) y pulsa **Guardar presupuesto**.
2. Debajo: **Σ asignado**, **Valor total** ("Sin definir" si no hay) y **Diferencia** (Σ A menos valor total).
   Si el valor total estaba vacío, se fija con la suma al guardar.
3. Si Σ A no coincide con el valor total aparece **Igualar valor total a Σ A**: al pulsarlo el valor total pasa a
   ser la suma guardada y la diferencia queda en $ 0. Es lo que exige la línea base.
4. **Programación mensual**: una columna por mes del proyecto y una fila por rubro con monto. Escribe lo
   programado y **Guardar programación**. Un rubro sin monto asignado no se puede programar ("Asigna un monto a
   algún rubro para poder programarlo."). Mientras no cuadre, aparece **Programación pendiente**.
5. El control (Σ programación menos asignado) es informativo en borrador, pero deberá ser $ 0 para aprobar la
   línea base.
6. Negativos: un monto inválido avisa antes de guardar ("Ingresa un valor válido..."); en un proyecto ya aprobado
   la sección queda de solo lectura con "El presupuesto y la programación solo se editan mientras el proyecto está
   en borrador."; `coordinador@` o `colaborador@` no ven controles de edición.

## C. Aprobar línea base (S8): cómo un proyecto llega a EN EJECUCIÓN

Es la única vía real para salir de Borrador. Solo `admin@` o `gerencia@`, solo con el proyecto en **Borrador**.

1. En el encabezado fijo de la ficha (visible en cualquier pestaña) aparece **Aprobar línea base**. Se abre un diálogo: "Al aprobar, la estructura y el
   presupuesto quedan congelados (versión 0) y el proyecto pasa a En ejecución. Esta acción no se puede deshacer."
2. Para ver qué bloquea, pulsa **Aprobar** con el proyecto incompleto: la API responde 409 y el diálogo lista TODAS
   las precondiciones en rojo, por ejemplo:
   - "El proyecto no tiene un valor total mayor que cero."
   - "El proyecto debe tener fechas de inicio y fin válidas."
   - "El número de beneficiarios debe ser mayor que cero." (se fija al crear el proyecto, con la plantilla o desde «Editar datos generales»)
   - "El proyecto no tiene objetivos." / "El objetivo X no tiene actividades." / "La actividad X no tiene entregables."
   - "La suma del presupuesto (...) no es igual al valor total del proyecto (...); diferencia ..."
   - "Programación pendiente." / "La programación del rubro X no coincide con lo asignado; control ..."
   - "El rubro suspendido X tiene un monto asignado pendiente de reasignación."
   - "El periodo AAAA-MM está fuera del rango del proyecto."
3. Corrige (B, §4 o la plantilla) y vuelve a pulsar **Aprobar**. Esperado: el diálogo se cierra, el chip de estado
   del encabezado pasa a **En ejecución**, el botón desaparece, aparecen los chips **Semáforo técnico** y
   **Semáforo financiero** (cuando los indicadores terminan de cargar) y el **Historial** (pestaña **Cambios**)
   registra la aprobación en un solo lote.
4. Efectos: Metas e indicadores, Presupuesto y plantilla quedan cerrados; se habilitan **Ejecución técnica** (pestaña
   **Ficha de seguimiento**), **Gastos** (pestaña **Legalización**), **Modificaciones** y **Versiones** (pestaña **Cambios**, con la
   versión `v0`).
5. Atajo solo para QA local, SIN versión 0: `npx tsx scripts/set-project-estado.ts PRY-2026-001 EN_EJECUCION
   --actor admin@demo.muttuhub.local --apply` (en seco por defecto). Un proyecto así NO tiene v0: Versiones dice
   "La línea base aún no está aprobada.", Modificaciones falla ("El proyecto no tiene línea base aprobada.") y el
   selector Base en **Original (v0)** da "La versión original aún no existe.". Para la reunión usa la aprobación real.
6. `coordinador@` y `colaborador@` no ven el botón.

## C2. Suspender, reactivar, cerrar, reabrir o cancelar (B7)

Solo `admin@` o `gerencia@`. Decisión de la PO (D-C): suspendido = congelado; cerrado = solo lectura y se puede
reabrir; cancelado no se puede deshacer.

1. Con un proyecto **En ejecución**, el encabezado de la ficha muestra **Cambiar estado**. El diálogo ofrece solo las
   acciones válidas para el estado actual (en ejecución: Suspender, Cerrar, Cancelar; suspendido: Reactivar, Cancelar;
   cerrado: Reabrir; borrador: Cancelar; cancelado: ninguna, el botón no aparece).
2. Elige **Suspender**, escribe un motivo y pulsa **Confirmar** (sin motivo el botón queda deshabilitado). Esperado:
   toast "Proyecto suspendido.", el chip pasa a **Suspendido** y bajo el nombre aparece "Proyecto suspendido: está
   congelado hasta que Gerencia o Administración lo reactive."
3. Con el proyecto suspendido: desaparecen **Registrar avance**, **Registrar gasto**, **Subir documento**, los botones
   **Validar**/**Rechazar** de los gastos registrados y los controles del **Equipo**. **Anular** sigue disponible en los
   gastos validados. La cola de validación de gastos ya no lista los gastos de ese proyecto.
4. **Historial** (pestaña **Cambios**): una edición con dos filas en un lote, **Estado** (En ejecución → Suspendido) y
   **Motivo**.
5. **Reactivar** devuelve el proyecto a En ejecución. Repite con **Cerrar** (chip Cerrado, aviso de solo lectura) y
   **Reabrir**. **Cancelar** deja el proyecto en Cancelado sin acciones posibles.
6. `coordinador@` y `colaborador@` no ven **Cambiar estado**; por API (`POST /api/v1/projects/:id/estado`) responden 403.

## D. Ejecución técnica y semáforo (S4)

Pestaña **Ficha de seguimiento** (la sección **Indicadores** está en la pestaña **Metas e indicadores**, §J.2). En Borrador solo dice: "La ejecución técnica estará disponible cuando el proyecto
tenga su línea base aprobada." Escribe `admin@`, `gerencia@` o `coordinador@` integrante; anular es solo de
admin/gerencia.

1. **Semáforo técnico**: chip "Semáforo técnico: Verde / Amarillo / Rojo" (siempre con la palabra del color; el
   mismo color se repite en el chip del encabezado fijo), "Corte al <fecha>", y
   **Avance real**, **Avance programado**, **Desviación** (en pp). El selector **Base** ofrece **Vigente** y
   **Original (v0)**.
2. Insignia **No confirmado**: aparece mientras los umbrales del semáforo no estén confirmados (ver §H). Es lo
   esperado hoy.
3. Por actividad: estado (No iniciada, En curso, Finalizada, Finalizada con retraso, calculado por el servidor),
   barra de progreso y sus entregables con "Meta ... / Contado ...".
4. **Registrar avance** en un entregable: Fecha, Cantidad, Observación (opcional) y "Medio de verificación" con
   tres opciones: **Sin medio**, **Archivo** o **Enlace** (URL https + "Nombre del enlace").
   - Con archivo o enlace, el avance queda **Cuenta** y mueve el semáforo.
   - **Sin medio** queda como **Pendiente de soporte** y NO cuenta (el entregable muestra "N pendiente de soporte").
   - Con el avance ya guardado, **Adjuntar archivo** suma más archivos o enlaces sin tope adicional; cada uno queda
     listado por separado (AJ-06: un entregable con 3 archivos y 1 enlace muestra los 4).
5. **Registrar medición** en un indicador (Fecha, Valor, Observación) y **Registrar beneficiarios** (Fecha,
   Cantidad, Actividad opcional). Se ven en sus listas con la última medición. Una medición ya registrada también
   admite **Adjuntar archivo** (archivo o enlace); a diferencia del avance, no tiene semáforo ni **Cuenta**.
6. **Anular** (solo admin/gerencia): pide "Motivo de anulación"; el registro queda con insignia **Anulado/Anulada**
   y deja de contar. Nada se borra; el Historial lo audita.
7. Negativos:
   - Fecha futura: "La fecha del avance no puede ser posterior a hoy."
   - Sin fecha: "La fecha es obligatoria."
   - Cantidad que supera la meta acumulada: aparece "Justificación del exceso"; sin ella, "Indica una
     justificación del exceso."
   - Enlace no https o vacío: "Completa el enlace y su nombre." (el servidor: "El enlace debe ser una URL https
     válida (máximo 2000 caracteres).")
   - `colaborador@` ve todo sin controles; un `coordinador@` que NO es integrante tampoco los ve.
   - Borrar un entregable con avances (en la pestaña **Metas e indicadores**) responde 409.

## D2. Registrar el avance de la actividad (estado En curso) — AJ-01

Misma pestaña **Ficha de seguimiento**, por actividad. A diferencia de §D.4 (avance por entregable, suma
cantidades), esta acción es un reporte de **porcentaje** a nivel de toda la actividad y solo la registra el
**responsable** asignado a esa actividad (o `admin@`/`gerencia@`). Elige una actividad **Sin iniciar** con dos
entregables para el recorrido completo.

1. Como el `responsable_id` de la actividad (o `admin@`): abre **Registrar avance** en la actividad (no la del
   entregable). Campos: Fecha (tope hoy), Porcentaje de avance, Observación (siempre obligatoria).
2. Sin porcentaje o sin observación: no guarda ("El porcentaje debe ser mayor que 0 y menor o igual a 100." /
   "La observación es obligatoria.").
3. Registra **30 %** con una observación. La actividad pasa de **Sin iniciar** a **En curso** (no hay ningún cambio
   de estado manual aparte: esta es la única forma de llegar a En curso). El historial muestra el reporte con
   fecha, porcentaje, observación y usuario.
4. Registra **70 %** y luego **90 %** (ambos con observación). El historial muestra los tres reportes, del más
   antiguo al más reciente, y la barra de progreso de la actividad sigue el último valor.
5. Con el último reporte en 70 %, intenta registrar **70 %** y luego **50 %**: ambos se rechazan con "El avance
   debe ser mayor que el último reportado (70 %)".
6. Con los entregables de la actividad incompletos (al menos uno sin meta alcanzada o sin medio), **90 %** se
   acepta pero **95 %** se rechaza con "El avance máximo sin entregables completos es 90 %" (el tope es el
   configurado en §H.5; con el valor inicial es 90).
7. Completa un entregable (meta alcanzada + al menos un medio vivo) dejando el otro incompleto. Aunque el último
   reporte esté en el tope (90 %), la actividad sigue **En curso**, nunca pasa a Terminada mientras quede un
   entregable incompleto — sin importar el porcentaje reportado.
8. Completa también el segundo entregable (meta + medio). La actividad pasa a **100 % y Finalizada** (o
   **Finalizada con retraso**, según la fecha) sin necesidad de un nuevo reporte: la condición es que todos los
   entregables estén completos, no el porcentaje del último reporte.
9. **Adjuntar medio**: sobre un reporte ya guardado, adjunta un archivo o un enlace (misma mecánica que el avance
   de entregable, §D.4): el medio queda listado y se puede descargar.
10. **Anular** el último reporte: pide "Motivo de anulación"; queda con insignia **Anulado** y sale del historial de
    vigentes. Intentar anular uno que ya no es el más reciente responde "Solo se puede anular el último reporte
    registrado de la actividad."; intentar anular uno ya anulado responde "El reporte ya está anulado.".
11. Negativos de acceso: un `coordinador@`/`colaborador@` integrante que **no** es el responsable de la actividad no
    ve el botón **Registrar avance** de la actividad (sí puede seguir viendo el historial); `admin@`/`gerencia@`
    siempre lo ven, sean o no el responsable.

## E. Gastos y validación (S6)

Pestaña **Legalización** de la ficha (sección **Gastos**). Registran `admin@`, `gerencia@` o `coordinador@` integrante, solo con el proyecto
**En ejecución**. Validan y rechazan solo `admin@` y `gerencia@`. Regla central: no puedes validar ni rechazar un
gasto que tú registraste.

1. Como `admin@`, en la pestaña **Legalización**: **Registrar gasto**. Campos: Rubro (solo rubros con monto asignado), Subtotal, IVA, Total (solo
   lectura: Subtotal + IVA), Fecha del documento, Periodo, Tipo de soporte (Factura de proveedor, Cuenta de cobro de persona natural, ...), Número de documento,
   Tipo y Número de identificación, Nombre del tercero, Descripción y soporte (**Archivo** o **Enlace**); al elegir
   un archivo se ve su nombre con la opción de **Quitar**. Pulsa **Registrar**.
2. Esperado: el gasto aparece como **Registrado** con el resumen por estado ("Registrado: 1 gasto · $ ...").
   - **Subtotal e IVA:** con Subtotal 1.000.000 e IVA 190.000 el formulario muestra Total $ 1.190.000 sin digitarlo y la
     tabla muestra $ 1.190.000 con "IVA $ 190.000" debajo. Con IVA 0 el Total es igual al Subtotal. Dejar el IVA vacío,
     negativo o con letras no envía nada y muestra el error.
   - **Periodo:** con fecha 28/10/2026 el Periodo aparece como 2026-10 sin hacer nada y no ofrece "Mes del documento".
     Cambiar la fecha cambia el Periodo. Elegir 2026-12 para un documento de octubre registra el gasto con la marca
     **Periodo modificado**. La edición de un gasto (por la API, sin pantalla todavía) audita el cambio de periodo. Con una
     fecha fuera de los meses del proyecto el Periodo queda vacío y **Registrar** pide elegirlo.
   - **Importar gastos:** descarga la plantilla nueva (columnas Subtotal, IVA, Total opcional, Periodo, Enlace del
     soporte opcional). Una fila con Subtotal 500.000, IVA 95.000 y Total 600.000 se rechaza con la fila y la columna
     Total; un archivo con la columna antigua "Valor (COP)" se rechaza completo con "Esta plantilla es anterior:
     descarga la nueva, que separa Subtotal e IVA." Una fila con dos enlaces en la columna "Enlace del soporte"
     (separados por `;`) crea el gasto con dos soportes y sin la marca **Sin soporte**; un enlace que no empiece por
     `http://` o `https://` rechaza la fila con su fila y columna.
3. **Alerta de duplicado**: registra otro con el mismo número de identificación y número de documento. Aparece
   "Gasto registrado, con avisos" con "Ya existe un gasto con el mismo NIT/cédula y número de documento (...)". No
   bloquea; pulsa **Entendido**.
4. **Validación por otro usuario**: como `admin@` (el registrante) la fila dice "Tú lo registraste" y no hay
   botones. Entra como `gerencia@`: en **Proyectos** aparece la cola **Gastos por validar · N**, y en la ficha,
   pestaña **Legalización**, el gasto tiene **Validar** y **Rechazar**.
5. **Validar**: pasa a **Validado** y alimenta la **Ficha financiera** (pestaña **Financiero**, §F). Si faltan tipo y número de
   identificación, **Validar** está deshabilitado con "Completa el tipo y número de identificación del tercero
   antes de validar." y el gasto lleva la insignia **Datos incompletos**.
6. **Rechazar**: pide "Motivo del rechazo" (obligatorio) y **Confirmar rechazo**; la fila muestra
   "Rechazado: <motivo>". No hay pantalla para corregir un rechazado (ver Límites).
7. **Anular un gasto validado** (admin/gerencia): botón **Anular** con motivo; queda **Anulado**.
8. **Sobreejecución**:
   1. Como `admin@` registra un gasto con Total (Subtotal + IVA) mayor que el asignado del rubro (o mayor que lo que queda).
      Sale el aviso "Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro." (si la API lo
      devuelve) y la fila lleva **Supera el asignado**.
   2. Como `gerencia@` pulsa **Validar**: error 409 en la fila, "Validar este gasto superaría el valor asignado al
      rubro. Se notificó a Gerencia." El gasto sigue **Registrado**, con la insignia **Supera el asignado**.
   3. La campana (**Notificaciones**) de `gerencia@` muestra el grupo **PROYECTOS** con "Gasto supera el asignado
      del rubro" y el código del proyecto. Refresca si no aparece. Al abrir la campana se marcan como leídas. Hoy la
      notificación lleva a `/proyectos` (no abre la ficha).
   4. Solo se notifica a usuarios Gerencia; `admin@` ve la marca en la lista y en la cola pero no recibe campana.
9. **Soporte**: en cada gasto, el botón con el nombre del soporte ("Ver soporte <nombre>") descarga el archivo por su
   URL firmada (60 s), directo y sin abrir otra pestaña; si el soporte es un enlace externo, ese sí se abre aparte. Cada acceso se registra. Si falla: "No pudimos abrir el soporte. Inténtalo de nuevo." Un `coordinador@`
   integrante ve los soportes de su proyecto; `colaborador@` no ve la sección de gestión. El botón para sumar más
   soportes se llama **Adjuntar archivo** (antes "Adjuntar soporte") y, al elegir un archivo, muestra su nombre con
   la opción de **Quitar**.
10. Negativos: sin soporte, "Adjunta al menos un soporte (archivo o enlace)."; rubro sin asignado, "Solo puedes
    registrar gastos en rubros con valor asignado."; validar un gasto que ya no está registrado, 409 "Solo se pueden
    validar o rechazar gastos en estado registrado."; el registrante que fuerza la llamada recibe 403 "No puedes
    validar un gasto que tú registraste."

## F. Ficha financiera (S5/S6/S8)

Pestaña **Financiero**, sección **Ficha financiera** (debajo de **Presupuesto**). Visible para quienes pueden leer el proyecto (admin, gerencia y coordinador integrante).

1. Tabla por rubro con A (asignado), P (programado), E (ejecutado = gastos **Validados**), D y los porcentajes E/P y
   E/A, color por fila y fila de total.
2. Selector **Corte** (mes) y selector **Base**: **Vigente** u **Original (v0)**. En Borrador la opción Original no
   existe (tooltip: "La versión original estará disponible con la línea base aprobada.").
3. Mientras no haya gastos validados: "Ejecución disponible cuando se registren gastos" (en Borrador siempre).
4. Valida un gasto (§E, pestaña **Legalización**), vuelve a la pestaña **Financiero** y recarga la sección: E sube y el color del rubro cambia según los umbrales. Si E supera A
   el color es rojo.
5. Cambia **Base** a **Original (v0)** tras una modificación aprobada (§G): A y P vuelven a los valores del v0
   mientras E (los gastos) no cambia.
6. Insignia **No confirmado** mientras los umbrales no estén confirmados (§H).
7. Si el gasto va por debajo de lo programado y el avance técnico está atrasado aparece el aviso "Posible retraso:
   el gasto va por debajo de lo programado y el avance técnico está atrasado."
8. Negativo: la API restringe la lectura a quienes pueden ver el proyecto; el comportamiento exacto de
   `colaborador@` aquí no se verificó.

## G. Modificaciones, versiones y comparación (S8)

Pestaña **Cambios**: secciones **Modificaciones**, **Versiones** e **Historial**, en ese orden. En Borrador: "Las modificaciones estarán disponibles cuando la línea
base esté aprobada." y "La línea base aún no está aprobada."

1. Como `admin@`, `gerencia@` o `coordinador@` integrante: **Solicitar modificación**. El diálogo dice "Gerencia la
   revisa y, si la aprueba, se crea una nueva versión del proyecto."
2. Elige **Tipo de modificación**: Traslado entre rubros, Adición de recursos, Reducción de recursos,
   Reprogramación de periodos, Cronograma, Entregables e indicadores. Cambia solo lo necesario, escribe el
   **Motivo** y **Enviar solicitud**.
   - Traslado: baja un rubro y sube otro por el mismo valor (Σ = 0).
   - Adición: sube rubros (el valor total pasa a ser la nueva suma). Reducción: lo contrario.
3. La solicitud queda **Pendiente** en la lista. Como `admin@` o `gerencia@`: **Aprobar** o **Rechazar**
   (**Confirmar rechazo** con "Comentario del rechazo"). Aprobar crea la versión 1; la fila queda **Aprobada**,
   "por <nombre> · Versión 1". Un `coordinador@` solo solicita; no decide.
4. **Versiones**: tabla con `v0` (Línea base) y `v1` (Modificación), y la comparación **Desde** / **Hasta**
   (`v0` ... `Vigente`). Muestra las diferencias agrupadas (Presupuesto, Programación, Actividades, ...), con
   "Desaparece" / "Aparece" para elementos nuevos o eliminados.
5. Reglas a comprobar (el formulario lista cada una en rojo):
   - **REQ-GAS-06**: pide un traslado que deje un rubro por debajo de lo ya validado como gasto: "El valor
     asignado de «R01» no puede quedar por debajo de lo ya ejecutado ($ ...)." Hace falta tener antes un gasto
     **Validado** en ese rubro (§E).
   - "Un traslado no puede cambiar el valor total del proyecto (diferencia $ ...)."
   - "Una adición debe aumentar el valor total del proyecto." / "Una reducción debe disminuir el valor total del
     proyecto."
   - "El periodo AAAA-MM ya transcurrió: no se puede reprogramar." (depende del parámetro "Modificación bloquea
     periodos pasados", §H)
   - "La fecha de fin no puede ser anterior a la de inicio."
   - Solicitud vieja: "La solicitud se basa en una versión anterior; ..." y "La solicitud ya fue decidida."
6. Negativo: en Borrador o sin v0 no hay formulario; `colaborador@` no ve controles.

## H. Administración: catálogos v2 y parámetros del semáforo (solo `admin@`)

Menú **Administración** (otros roles son redirigidos). Más abajo en la página están las dos secciones.

1. **Catálogos de proyectos**: "Renombra o suspende rubros y líneas estratégicas. Nada se elimina: lo
   suspendido deja de ofrecerse en proyectos nuevos y puede restaurarse." Dos tablas: **Rubros** y
   **Líneas estratégicas**. Los municipios ya no aparecen aquí: el selector de municipios los lee directo de la API.
2. Cada fila muestra **Activo** o **Suspendido**. Botones **Renombrar <nombre>**, **Suspender <nombre>** y
   **Restaurar <nombre>**. Alta de línea con Código y Nombre (los rubros son fijos).
3. Prueba: suspende una línea estratégica, abre el paso **General** de crear un proyecto: ya no se ofrece. Restáurala y
   vuelve. Los inactivos siguen visibles en esta pantalla con su insignia.
4. Negativo: renombrar un rubro que ya tiene presupuesto responde "El rubro tiene datos asociados: no se puede
   renombrar, solo suspender." Un rubro nunca se elimina. Suspender un rubro con monto asignado en un borrador
   marca la fila de **Presupuesto** (pestaña **Financiero**) con "Rubro suspendido pendiente de reasignación" y bloquea la línea base.
5. **Umbrales del semáforo**: "Valores provisionales hasta que el equipo de producto los confirme. Marca cada
   parámetro como confirmado solo cuando esté validado." Parámetros: Umbral 1 (pp), Umbral 2 (pp), Tolerancia (%),
   Retraso (%), Avance requiere medio, Modificación bloquea periodos pasados, **Tope de avance sin entregables
   completos (%)** (AJ-01; valor inicial 90). Cada uno con insignia **Confirmado** o **No confirmado**.
6. Cambia un valor, marca **Confirmar <parámetro>** y pulsa **Guardar parámetros**. Vuelve a la ficha, pestaña
   **Ficha de seguimiento** o **Financiero** (**Ficha financiera**): la insignia **No confirmado** del semáforo desaparece cuando los parámetros que usa quedan
   confirmados. (No verificado qué parámetros exactos controlan cada insignia.)
7. Cambiar "Avance requiere medio" altera si un avance sin medio cuenta; hazlo solo para demostrar, y déjalo como estaba.

## I. Mi resumen (S2.7)

1. Entra al tablero principal (ruta `/`) y abre la pestaña **Mi resumen**.
2. Bloque **Proyectos en ejecución**: "N proyectos", lista de código, nombre y cliente, y **Ver proyectos**.
   Solo cuenta los **En ejecución** (un Borrador no aparece). Si no hay: "No tienes proyectos en ejecución."
3. Bloque **Oportunidades en prospección**: "N oportunidades" con nombre, cliente y valor. Si no hay: "No tienes
   oportunidades en prospección."
4. Alcance: admin y gerencia ven todo; `coordinador@` ve solo sus proyectos como integrante. Aprueba una línea
   base y comprueba que el proyecto pasa de no aparecer a aparecer.

## J. Tablero, indicadores y exportaciones (S9)

Requiere la migración de la bandera gerencial aplicada a la base LOCAL (§0, paso 1). Los números del tablero y de
los Indicadores salen del servidor; la interfaz solo los pinta. Solo hay indicadores para proyectos **En
ejecución**, **Suspendido** o **Cerrado**: un Borrador no tiene (no hay forma de suspender o cerrar desde la
interfaz, ver Límites).

### J.1 Pestaña Tablero (`/proyectos?vista=tablero`)
Quién ve la pestaña **Tablero** (junto a **Portafolio**): `admin@`, `gerencia@`, cualquier `coordinador@`, y un
`colaborador@` solo si tiene la bandera gerencial (§J.4). Quien no califica ve solo el listado, sin pestañas.

1. Como `gerencia@`, abre **Proyectos** y la pestaña **Tablero** (la URL cambia a `?vista=tablero`).
2. Filtros (cada cambio vuelve a consultar): **Estado**, **Línea estratégica**, **Municipio**, **Cliente**,
   **Responsable** y **Corte** (fecha). Sin corte se usa hoy. El municipio es solo un filtro: no hay desglose por
   territorio.
3. Tarjetas: **Proyectos** ("Corte al <fecha>"), **Avance real promedio** (con "Programado ..."), **Ejecutado /
   asignado** (con "Ejecutado / programado ...") y **Ejecutado** (con "Asignado ..."), más el bloque **Proyectos por
   estado**.
4. Tabla: Código, Proyecto (con cliente), Estado, **Semáforo técnico**, **Semáforo financiero** (más la insignia
   **Posible retraso** si aplica), **Avance real**, **Ejecutado / asignado** y **Ver detalle** (abre la ficha en la misma ventana). Un
   proyecto sin indicadores (Borrador) muestra "Sin medir" y "—".
5. Insignia **No confirmado** junto a **Exportar Excel**: aparece mientras los parámetros del semáforo no estén
   confirmados (§H). Es lo esperado hoy.
6. Estados: cargando (filas gris claro), vacío ("No hay proyectos para mostrar", "Prueba con otros filtros. ..."),
   error ("No pudimos cargar el tablero de proyectos. Inténtalo de nuevo."). Prueba el vacío filtrando por **Estado
   = Cancelado**.
7. Como `coordinador@`: la pestaña existe, pero el tablero cuenta solo los proyectos donde es integrante activo.
   Quítalo del equipo (§3) y el proyecto sale del tablero.

### J.2 Sección Indicadores en la ficha
En **Ver detalle**, pestaña **Cambios**, sección **Exportar fichas** (controles **Corte** y **Base** y las
exportaciones a Excel); el registro por indicador está en la pestaña **Metas e indicadores**. La ven quienes leen el proyecto. Los

> **Nota 2026-10-14:** la descripción de tarjetas de los puntos 2 y 3 de esta sección quedó de la ficha de ocho
> pestañas; verifícala antes de usarla en la reunión. Los chips del encabezado sí siguen vigentes.
chips **Semáforo técnico** y **Semáforo financiero** del encabezado fijo salen de estos mismos datos (misma
consulta): deben coincidir en color con las tarjetas de abajo.

1. Controles: **Corte** (fecha) y **Base** (**Vigente** / **Original (v0)**; en Borrador la base está bloqueada).
2. Tarjetas: **Semáforo técnico** (Avance real, Avance programado, Desviación en pp), **Semáforo financiero**
   (Asignado, Programado, Ejecutado, E/A, E/P y el aviso "Posible retraso: ..."), **Cumplimiento del cronograma**
   ("N a tiempo de M vencidas"), **Entregables logrados** ("N de M programados"), **Cumplimiento de indicadores**
   ("N medidos, M sin medir") y **Beneficiarios vs meta**.
3. Insignia **No confirmado** junto a los controles (solo si el proyecto es medible).
4. En un Borrador: "Los indicadores se calculan cuando el proyecto está en ejecución, suspendido o cerrado."
5. Registra un avance con soporte (§D) y un gasto validado (§E), recarga y comprueba que los porcentajes se mueven.
   Cambia **Base** a **Original (v0)** tras una modificación aprobada (§G): lo programado y asignado vuelven al v0;
   los avances y gastos no cambian.

### J.3 Exportaciones a Excel
1. En la pestaña **Cambios**, sección **Exportar fichas**: **Exportar ficha (Excel)** baja `<código>-proyecto.xlsx` (hojas `Proyecto`, `Estructura`,
   `KPIs`) y **Exportar ficha financiera (Excel)** baja `<código>-financiera.xlsx` (hojas `Financiera`, con fila
   Total, y `Resumen`). Respetan el **Corte** y la **Base** elegidos. La financiera exige fechas del proyecto (409
   si no hay).
2. En el **Tablero**: **Exportar Excel** baja `portafolio-<corte>.xlsx` (hojas `Portafolio` y `Resumen`) con los
   filtros activos; tope de 500 proyectos (si se corta, la hoja Resumen lo dice).
3. Abre cada libro: solo agregados. No debe haber columnas de gasto individual, tercero (nombre, NIT/cédula) ni
   soporte, para ningún rol. Si los parámetros no están confirmados, hay una fila "Nota" que lo dice.
4. Cada descarga deja una fila de auditoría `EXPORTAR`; si la auditoría falla, la descarga igual funciona.
5. **PDF**: no existe botón. Si llamas la API a mano con `formato=pdf` responde 400 "Formato no disponible. Por
   ahora solo se exporta en Excel (xlsx)."

### J.4 Dar la bandera gerencial a un colaborador
1. Como `admin@`: **Administración > Usuarios**, menú de acciones de la fila del colaborador (**Acciones de
   <nombre>**), sección **Acceso a proyectos**, casilla **Ve el tablero gerencial**. Solo aparece en filas de rol
   Colaborador. Si falla: "No pudimos actualizar el acceso al tablero gerencial."
2. Entra como `colaborador@` (sesión nueva o recarga). Esperado: **Proyectos** muestra **Portafolio** y **Tablero**;
   el listado trae todos los proyectos; puede abrir la ficha, ver **Indicadores** y exportar.
3. Sigue sin poder: crear proyectos, editar estructura/presupuesto, aprobar línea base, registrar avances o
   gastos, validar o rechazar, ni solicitar o decidir modificaciones (sin botones; la API responde 403). Tampoco ve
   soportes de gastos (la bandera no los habilita).
4. Quita la casilla y comprueba que la pestaña **Tablero** desaparece y `/proyectos?vista=tablero` muestra solo el
   listado. Solo `admin@` puede cambiar la bandera.

### J.5 Checks negativos
- `colaborador@` SIN bandera: sin pestaña; abrir `?vista=tablero` a mano no muestra el tablero; la API del portafolio
  responde 403.
- `coordinador@` que no es integrante de un proyecto: no sale en su tablero ni puede abrir su ficha.
- Corte inválido en la API: 400. Proyecto en Borrador: Indicadores explica por qué no hay cifras.
- El tablero no muestra gastos individuales, terceros, soportes ni "territorio".

### J.6 Reporte semanal (Reportes › Semanal)
1. Como `gerencia@`: **Reportes**, pestaña **Semanal**. Esperado: "Semana del <lunes> al <domingo>" de la semana en
   curso, y las secciones Portafolio por proyecto, Portafolio por cliente, Tareas, Actividades atrasadas, Requiere
   atención y Gastos por validar. Los semáforos y montos coinciden con el **Tablero** de proyectos.
2. **Semana anterior**: cambia la semana y las tareas cerradas/vencidas. **Semana siguiente** se desactiva en la
   semana en curso.
3. **Generar reporte**: abre `/print/reportes/semanal?semana=<lunes>` en la **misma pestaña**; **Volver** regresa a
   Reportes.
4. **Exportar Excel**: baja `reporte-semanal-<lunes>.xlsx` con las hojas `Resumen`, `Proyectos`, `Por cliente`,
   `Actividades atrasadas`, `Requiere atención` y `Gastos por validar`. Sin gastos individuales, terceros ni soportes.
5. Como `coordinador@`: solo sus proyectos y **sin** la sección ni la hoja "Gastos por validar".

## 5. Ensayo automatizado (opcional)

Hay dos specs y **necesitan estados de base distintos**; no corren sobre la misma base sin reiniciarla:

| Spec | Estado de la base que exige | Escribe datos |
|---|---|---|
| `e2e/proyectos-demo.spec.ts` | Demo **limpia**: cero proyectos y dos oportunidades Ganada sin proyecto. Crea `PRY-2026-001` desde una oportunidad y abre su ficha en la misma ventana. | Sí |
| `e2e/proyectos-ficha-pagina.spec.ts` | Semilla **S11** (`npm run db:demo:seed-projects:local -- --apply` en una base local nueva): necesita `PRY-2026-001` En ejecución. | No (solo lee) |

```bash
npm run db:demo:reset:local -- --apply
npx playwright test e2e/proyectos-demo.spec.ts   # con el dev server arriba
npm run db:demo:reset:local -- --apply           # dejar limpio al terminar

# Sobre la base con la semilla S11 (no reiniciar):
npx playwright test e2e/proyectos-ficha-pagina.spec.ts
```

El reset no puede borrar proyectos aprobados: si la base ya tiene la semilla S11, `proyectos-demo.spec.ts` no
tiene su precondición y falla en el paso 4. `proyectos-ficha-pagina.spec.ts` abre la ficha en la misma pestaña, comprueba
encabezado, chips de semáforo, "Volver a proyectos", las once pestañas y el estado "Proyecto no encontrado", y guarda
capturas (ficha a 1440 y 390 px, Tablero a 1440 px) en el directorio indicado por `SCREENSHOT_DIR`.

### 5.1 En CI (job `e2e`)

Cada PR corre la suite mantenida (`e2e/proyectos-v2`, 31 pruebas, ~1,2 min de pruebas y ~5 min de job) contra una
base **efímera**, nunca contra Supabase remoto. El job: levanta `supabase start` (sin studio, imgproxy,
edge-runtime, logflare ni vector), toma las llaves de `supabase status -o json`, crea el bucket `muttu-docs`,
aplica `prisma migrate deploy` y siembra en este orden: `prisma db seed` (usuarios demo, 13 clientes, catálogos),
`scripts/seed-projects-demo.ts --apply` (PRY-2026-001/002 y gastos) y `scripts/seed-demo-flujo.ts --apply`
(clientes, oportunidades Ganadas libres y contactos extra). Después hace `npm run build`, y corre
`npx playwright test --config playwright.ci.config.ts` (servidor `npm start`, 1 worker, 1 reintento). Si falla,
sube `playwright-report-ci/` como artefacto.

Las pruebas deben apoyarse solo en datos que esas tres semillas crean (p. ej. «Textiles del Caribe S.A.» para un
cliente ajeno al colaborador, «Fundación Tejiendo Caribe» para una Ganada sin proyecto). Los specs sueltos de la raíz
de `e2e/` (invitation-flow, oportunidad-ciclo, permisos-colaborador, proyectos-ficha-pagina, crm-demo,
proyectos-demo, change-password) quedan fuera de CI hasta alinearlos con la UI actual.

## 6. Límites conocidos (para decirlo en la reunión)

No existe todavía, dicho sin adornos:

- **S9 terminada** (tablero, Indicadores por proyecto, exportaciones a Excel, bandera gerencial), pero falta su
  verificación independiente. **PDF no construido**: solo Excel; el PDF responde 400.
- **S10 (pulido visual) construida en código**: ficha en pestañas bajo un encabezado fijo, chips de semáforo con la
  palabra del color, barras de progreso con nombre accesible, formularios de captura en una hoja inferior
  (bottom sheet) por debajo de `md` con controles de 44 px, y lista y tablero en tarjetas por debajo de `md`.
  Está cubierta por tests (nombres accesibles, contraste del semáforo, paleta compatible con modo oscuro), pero
  **no hay comparación de capturas reales (1440 y 390 px, claro y oscuro)** y **el diseño no se comprobó en un
  teléfono real**: el cambio de tarjetas y hoja se decide por ancho de ventana (`matchMedia`, 767 px). La relación
  de contraste de la barra (relleno contra fondo) no se midió. Las pestañas se renderizan en una fila con
  desplazamiento horizontal.
- **S13 (base de interfaz v6) y S14 (secciones de Proyectos contra el diseño v6) están implementadas en código**,
  commiteadas en local: la ficha tiene **once pestañas**, **Ficha de seguimiento** suma la **curva S** (técnica y financiera,
  separadas), **Financiero** el **gauge** y las barras por rubro, **Legalización** es un **libro mayor** con KPIs,
  filtros y tabla, **Resumen** suma tarjetas KPI y la tarjeta **Requiere atención** (endpoint
  `GET projects/:id/attention`), y el **Tablero gerencial** suma radar, gauge, barras por proyecto y tabla
  territorial. Suite completa (320 archivos / 3365 tests) verde y `tsc` 0. Faltan: **capturas reales (claro y
  oscuro)** contra los diseños v6, la **revisión nativa** de S13/S14 y la decisión del dueño de producto sobre los
  umbrales del semáforo. Nada de esto está desplegado.
- **No existe la sección de territorio** en esta rama (se retiró/nunca se construyó): el municipio es solo un filtro.
- **La base remota NO tiene la columna de la bandera gerencial** (`puede_ver_tablero_gerencial`). No se migra sin
  autorización del usuario; la migración solo se aplicó a la base local.
- **Decisiones del dueño de producto sin confirmar** en S9: umbrales del semáforo (insignia **No confirmado**),
  formato PDF, y la ruta `dashboard/portfolio` en lugar de `dashboard/projects`.
- **Cerrar, suspender o cancelar un proyecto**: ninguna slice lo construye (P14). Un proyecto En ejecución no tiene
  salida desde la interfaz.
- Gastos: no hay pantalla para corregir un gasto **Rechazado** (la API sí lo permite), y el formulario acepta un
  soporte por gasto (la API admite hasta cinco). La notificación de sobreejecución lleva a `/proyectos`, no abre la
  ficha del proyecto. No hay notificaciones por solicitudes de modificación.
- Modificaciones: el formulario no permite agregar ni quitar actividades, entregables o indicadores.
- No hay filtro por rol en el selector del equipo. Los datos generales se editan desde Resumen (solo admin o gerencia).
  La estructura, el presupuesto y la importación solo se tocan en Borrador y solo por admin o gerencia.
- Un proyecto puesto en En ejecución con `scripts/set-project-estado.ts` no tiene versión 0: sin Versiones, sin
  Modificaciones y sin base Original.
- **Revisiones nativas (RDD) pendientes**: el runtime de desarrollo no era elegible; ninguna slice desde S3 tiene
  revisión nativa aprobada. Se sustituyó por verificación independiente de un segundo agente en S7; la de S8
  (verificación independiente de la ronda 2) sigue pendiente.
- **Valores por defecto sin confirmar por el dueño de producto**: umbrales del semáforo (de ahí la insignia
  **No confirmado**), peso por defecto de las actividades, borrado con hijos, medio exigido, "Modificación bloquea
  periodos pasados", tope de importación (4 MB) y las reglas de notificación de sobreejecución. Están en los
  documentos `odd/tasks/v2-projects-s*-execution.md`.
- Todo es local: nada está empujado ni desplegado, y la base remota no se tocó.

Qué NO pudo verificarse al escribir esta guía: no se ejecutó la aplicación, los scripts ni las pruebas; los textos
salen de leer el código. En particular no se comprobó contra la base real que el libro del piloto deje el proyecto
sin precondiciones de línea base, ni qué parámetros controlan exactamente cada insignia **No confirmado**.
Tampoco se verificó en S9: que el enlace **Proyectos** del menú lateral sea visible para un colaborador con la
bandera (se verificó la página, no el menú), ni los libros de Excel abiertos en Excel real (solo lo que prueban los
tests con `exceljs`).
Al pasar la ficha a su propia página (S12) se verificó en un navegador real (Playwright sobre la semilla S11, solo
lectura, 2026-10-09): "Ver detalle" abría entonces `/proyectos/<id>` en una pestaña nueva (desde #86 abre en la misma
ventana; ver arriba), el encabezado muestra código, estado
y los dos chips de semáforo con la palabra del color, "Volver a proyectos" apunta a `/proyectos`, las once pestañas
abren su sección y un id inexistente muestra "Proyecto no encontrado"; también se miraron capturas a 1440 y 390 px.
**No** se verificó: que `proyectos-demo.spec.ts` corra con la ficha nueva (necesita una demo limpia y la base tenía la
semilla; solo se revisó estáticamente con `tsc`, eslint y `playwright test --list`), cada paso de esta guía dentro de
la ficha nueva más allá de la pestaña **Resumen** y la presencia de las secciones, cuánto tarda cada pestaña en
mostrarse la primera vez, ni el modo oscuro ni un teléfono real. El orden de las secciones dentro de cada pestaña es
el del código.
Haz un ensayo completo antes de la reunión.
