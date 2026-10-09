# Guía de prueba paso a paso: sección Proyectos (v2)

Cubre lo construido en las slices S0 a S9: crear un proyecto desde una oportunidad ganada, ficha, historial,
equipo, estructura y Gantt (S3), plantilla Excel (S7), presupuesto y programación (S5), aprobación de línea base
(S8), ejecución técnica y semáforo (S4), gastos y validación (S6), ficha financiera, modificaciones y versiones (S8),
administración, "Mi resumen", y el tablero gerencial con indicadores y exportaciones a Excel (S9). Todo corre en local; nunca contra el Supabase remoto. Los textos entre comillas son
los que renderiza la interfaz (verificados contra el código el 2026-10-09).

## Cómo está organizada la ficha (pestañas)

**Ver detalle** abre la ficha como un diálogo con un **encabezado fijo** y seis pestañas. Todos los pasos de esta
guía nombran la pestaña donde está cada cosa:

| Pestaña | Contiene |
|---|---|
| **Resumen** | Datos generales, **Líneas estratégicas**, **Municipios**, **Equipo** |
| **Estructura** | **Estructura técnica** (objetivos, actividades, entregables, indicadores), **Cronograma por semanas** (Gantt), **Descargar plantilla** / **Importar plantilla** |
| **Avance** | **Ejecución técnica** (semáforo técnico, avances, mediciones, beneficiarios) e **Indicadores** (panel de KPIs y exportaciones) |
| **Presupuesto** | **Presupuesto** (con programación mensual) y **Ficha financiera** |
| **Gastos** | **Gastos** |
| **Cambios** | **Modificaciones**, **Versiones** e **Historial** |

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
3. Si quieres mostrar el flujo de errores en vivo, deja el segundo archivo (`...-error-v12.xlsx`) a mano.

En la reunión (como `admin@`, salvo donde se indica):
1. **Proyectos > Ver detalle** del proyecto en Borrador (abre en **Resumen**: datos y **Equipo**). Pestaña
   **Estructura**: el **Cronograma por semanas** (Gantt). Pestaña **Presupuesto**: **Presupuesto** (Σ asignado =
   Valor total). (1 min)
2. En la pestaña **Estructura**, **Importar plantilla** con el archivo de error: se ve la tabla por hoja y
   **Descargar reporte (.csv)**; nada se escribió. (1 min)
3. **Aprobar línea base** (está en el encabezado, visible en cualquier pestaña) > **Aprobar**: el proyecto pasa a
   **En ejecución**, el encabezado muestra el estado y se habilitan ejecución, gastos, modificaciones y versiones.
   (1 min)
4. Pestaña **Avance** > **Ejecución técnica**: **Registrar avance** en un entregable con un enlace https; mira el
   **Semáforo técnico** (también en el encabezado, con la palabra del color) y la insignia **No confirmado**.
   (2 min)
5. Pestaña **Gastos** > **Registrar gasto** con soporte. Sal y entra como `gerencia@`: cola **Gastos por validar**
   (en **Proyectos**) y, en la pestaña **Gastos** de la ficha, **Validar**. Muestra que el registrante ve "Tú lo
   registraste" en vez de los botones. (2 min)
6. **Sobreejecución** (pestaña **Gastos**): un gasto mayor al asignado del rubro; como `gerencia@` **Validar** da
   409 con "Se notificó a Gerencia" y aparece en la campana, grupo **PROYECTOS**. (1 min)
7. **Solicitar modificación** (traslado) como `admin@` en la pestaña **Cambios**, **Aprobar** como `gerencia@`, y
   en **Versiones** (misma pestaña, bajo Modificaciones) compara `v0` contra **Vigente**. (2 min)

8. **Cierre con el Tablero** (como `admin@` o `gerencia@`): en **Proyectos** abre la pestaña **Tablero**
   (`/proyectos?vista=tablero`): tarjetas del portafolio, semáforos por proyecto, insignia **No confirmado** y
   **Exportar Excel**. Abre **Ver detalle**, muestra los dos chips de semáforo del encabezado y, en la pestaña
   **Avance**, la sección **Indicadores**. (1 min; ver §J)

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

## 1. Crear un proyecto (admin)

1. Entra como `admin@demo.muttuhub.local` y abre **Proyectos** en el menú.
2. La lista debe estar vacía. Pulsa el botón de crear: el diálogo lista oportunidades en estado **Ganada** (hay dos).
3. Elige una; se precargan cliente, nombre y valor. Completa fecha de inicio, fecha de fin, línea estratégica
   principal y municipios, y confirma.
4. Resultado esperado: el proyecto aparece como `PRY-2026-001` en estado **Borrador**, y esa oportunidad ya no sale
   como elegible.

## 2. Ficha del proyecto

1. En la fila, usa **Ver detalle**. Abre en la pestaña **Resumen**; el encabezado muestra código, nombre y estado
   (un Borrador no muestra chips de semáforo).
2. En **Resumen** revisa datos generales, **Líneas estratégicas**, **Municipios** y la duración en semanas
   (derivada de las fechas).
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

En la ficha, pestaña **Estructura** (sección **Estructura técnica**), de un proyecto en **Borrador**, como admin o
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

Está en la pestaña **Estructura**, debajo de los objetivos. Cualquier rol que vea la ficha lo ve.

1. En la ficha de un proyecto con fechas y actividades, abre la pestaña **Estructura** y busca el encabezado
   **Cronograma por semanas**.
2. Esperado: una cabecera `S1, S2, ...` con la fecha de cada semana, y por objetivo una barra por actividad con
   su código, ubicada entre su semana inicial y final.
3. Crea otra actividad en Estructura (§4): la barra aparece sin recargar. Una actividad con peso manual muestra el
   icono **Peso manual**.
4. Estados vacíos: sin actividades, "Aún no hay actividades para mostrar en el cronograma."; sin fechas del
   proyecto, "Define las fechas del proyecto para ver el cronograma."
5. Es solo lectura: no se arrastra ni se edita desde el Gantt.

## A. Plantilla Excel (S7)

Solo `admin@` o `gerencia@`, y solo con el proyecto en **Borrador**. Los botones **Descargar plantilla** e
**Importar plantilla** están en la pestaña **Estructura**, en el encabezado de la sección. Otros roles no los ven; fuera de Borrador tampoco.

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
5. Verifica que tras la importación la estructura y el Gantt (pestaña **Estructura**) y el presupuesto (pestaña
   **Presupuesto**) quedaron llenos, y que el **Historial** (pestaña **Cambios**) muestra un solo lote.
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
falla (`PRY-2026-001-error-v12.xlsx`: el total no cuadra con el presupuesto por $50.000). Sube el segundo en el
diálogo para mostrar la tabla de errores. Ojo: el libro válido fija fechas 2026-10-05 a 2027-01-29, valor total
$177.360.000 y responsable `ana@muttu.co` (no existe en la demo: sale la advertencia). Ver también
`docs/guia-demo.md` §1.7.

## B. Presupuesto y programación mensual (S5)

Pestaña **Presupuesto** de la ficha, sección **Presupuesto** (arriba; la **Ficha financiera** va debajo, §F). Se edita solo en **Borrador** y solo `admin@` o
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

Es la única vía real. Solo `admin@` o `gerencia@`, solo con el proyecto en **Borrador**.

1. En el encabezado fijo de la ficha (visible en cualquier pestaña) aparece **Aprobar línea base**. Se abre un diálogo: "Al aprobar, la estructura y el
   presupuesto quedan congelados (versión 0) y el proyecto pasa a En ejecución. Esta acción no se puede deshacer."
2. Para ver qué bloquea, pulsa **Aprobar** con el proyecto incompleto: la API responde 409 y el diálogo lista TODAS
   las precondiciones en rojo, por ejemplo:
   - "El proyecto no tiene un valor total mayor que cero."
   - "El proyecto debe tener fechas de inicio y fin válidas."
   - "La meta de beneficiarios debe ser mayor que cero." (se fija al crear el proyecto o con la plantilla)
   - "El proyecto no tiene objetivos." / "El objetivo X no tiene actividades." / "La actividad X no tiene entregables."
   - "La suma del presupuesto (...) no es igual al valor total del proyecto (...); diferencia ..."
   - "Programación pendiente." / "La programación del rubro X no coincide con lo asignado; control ..."
   - "El rubro suspendido X tiene un monto asignado pendiente de reasignación."
   - "El periodo AAAA-MM está fuera del rango del proyecto."
3. Corrige (B, §4 o la plantilla) y vuelve a pulsar **Aprobar**. Esperado: el diálogo se cierra, el chip de estado
   del encabezado pasa a **En ejecución**, el botón desaparece, aparecen los chips **Semáforo técnico** y
   **Semáforo financiero** (cuando los indicadores terminan de cargar) y el **Historial** (pestaña **Cambios**)
   registra la aprobación en un solo lote.
4. Efectos: Estructura, Presupuesto y plantilla quedan cerrados; se habilitan **Ejecución técnica** (pestaña
   **Avance**), **Gastos** (pestaña **Gastos**), **Modificaciones** y **Versiones** (pestaña **Cambios**, con la
   versión `v0`).
5. Atajo solo para QA local, SIN versión 0: `npx tsx scripts/set-project-estado.ts PRY-2026-001 EN_EJECUCION
   --actor admin@demo.muttuhub.local --apply` (en seco por defecto). Un proyecto así NO tiene v0: Versiones dice
   "La línea base aún no está aprobada.", Modificaciones falla ("El proyecto no tiene línea base aprobada.") y el
   selector Base en **Original (v0)** da "La versión original aún no existe.". Para la reunión usa la aprobación real.
6. `coordinador@` y `colaborador@` no ven el botón.

## D. Ejecución técnica y semáforo (S4)

Pestaña **Avance**, sección **Ejecución técnica** (la sección **Indicadores** va debajo, §J.2). En Borrador solo dice: "La ejecución técnica estará disponible cuando el proyecto
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
5. **Registrar medición** en un indicador (Fecha, Valor, Observación) y **Registrar beneficiarios** (Fecha,
   Cantidad, Actividad opcional). Se ven en sus listas con la última medición.
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
   - Borrar un entregable con avances (en la pestaña **Estructura**) responde 409.

## E. Gastos y validación (S6)

Pestaña **Gastos** de la ficha (sección **Gastos**). Registran `admin@`, `gerencia@` o `coordinador@` integrante, solo con el proyecto
**En ejecución**. Validan y rechazan solo `admin@` y `gerencia@`. Regla central: no puedes validar ni rechazar un
gasto que tú registraste.

1. Como `admin@`, en la pestaña **Gastos**: **Registrar gasto**. Campos: Rubro (solo rubros con monto asignado), Valor, Fecha del documento,
   Periodo, Tipo de soporte (Factura de proveedor, Cuenta de cobro de persona natural, ...), Número de documento,
   Tipo y Número de identificación, Nombre del tercero, Descripción y soporte (**Archivo** o **Enlace**).
   Pulsa **Registrar**.
2. Esperado: el gasto aparece como **Registrado** con el resumen por estado ("Registrado: 1 gasto · $ ...").
3. **Alerta de duplicado**: registra otro con el mismo número de identificación y número de documento. Aparece
   "Gasto registrado, con avisos" con "Ya existe un gasto con el mismo NIT/cédula y número de documento (...)". No
   bloquea; pulsa **Entendido**.
4. **Validación por otro usuario**: como `admin@` (el registrante) la fila dice "Tú lo registraste" y no hay
   botones. Entra como `gerencia@`: en **Proyectos** aparece la cola **Gastos por validar · N**, y en la ficha,
   pestaña **Gastos**, el gasto tiene **Validar** y **Rechazar**.
5. **Validar**: pasa a **Validado** y alimenta la **Ficha financiera** (pestaña **Presupuesto**, §F). Si faltan tipo y número de
   identificación, **Validar** está deshabilitado con "Completa el tipo y número de identificación del tercero
   antes de validar." y el gasto lleva la insignia **Datos incompletos**.
6. **Rechazar**: pide "Motivo del rechazo" (obligatorio) y **Confirmar rechazo**; la fila muestra
   "Rechazado: <motivo>". No hay pantalla para corregir un rechazado (ver Límites).
7. **Anular un gasto validado** (admin/gerencia): botón **Anular** con motivo; queda **Anulado**.
8. **Sobreejecución**:
   1. Como `admin@` registra un gasto con Valor mayor que el asignado del rubro (o mayor que lo que queda).
      Sale el aviso "Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro." (si la API lo
      devuelve) y la fila lleva **Supera el asignado**.
   2. Como `gerencia@` pulsa **Validar**: error 409 en la fila, "Validar este gasto superaría el valor asignado al
      rubro. Se notificó a Gerencia." El gasto sigue **Registrado**, con la insignia **Supera el asignado**.
   3. La campana (**Notificaciones**) de `gerencia@` muestra el grupo **PROYECTOS** con "Gasto supera el asignado
      del rubro" y el código del proyecto. Refresca si no aparece. Al abrir la campana se marcan como leídas. Hoy la
      notificación lleva a `/proyectos` (no abre la ficha).
   4. Solo se notifica a usuarios Gerencia; `admin@` ve la marca en la lista y en la cola pero no recibe campana.
9. **Soporte**: en cada gasto, el botón con el nombre del soporte ("Ver soporte <nombre>") abre la descarga firmada
   (60 s). Cada acceso se registra. Si falla: "No pudimos abrir el soporte. Inténtalo de nuevo." Un `coordinador@`
   integrante ve los soportes de su proyecto; `colaborador@` no ve la sección de gestión.
10. Negativos: sin soporte, "Adjunta al menos un soporte (archivo o enlace)."; rubro sin asignado, "Solo puedes
    registrar gastos en rubros con valor asignado."; validar un gasto que ya no está registrado, 409 "Solo se pueden
    validar o rechazar gastos en estado registrado."; el registrante que fuerza la llamada recibe 403 "No puedes
    validar un gasto que tú registraste."

## F. Ficha financiera (S5/S6/S8)

Pestaña **Presupuesto**, sección **Ficha financiera** (debajo de **Presupuesto**). Visible para quienes pueden leer el proyecto (admin, gerencia y coordinador integrante).

1. Tabla por rubro con A (asignado), P (programado), E (ejecutado = gastos **Validados**), D y los porcentajes E/P y
   E/A, color por fila y fila de total.
2. Selector **Corte** (mes) y selector **Base**: **Vigente** u **Original (v0)**. En Borrador la opción Original no
   existe (tooltip: "La versión original estará disponible con la línea base aprobada.").
3. Mientras no haya gastos validados: "Ejecución disponible cuando se registren gastos" (en Borrador siempre).
4. Valida un gasto (§E, pestaña **Gastos**), vuelve a la pestaña **Presupuesto** y recarga la sección: E sube y el color del rubro cambia según los umbrales. Si E supera A
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

1. **Catálogos de proyectos**: "Renombra o suspende rubros, líneas estratégicas y municipios. Nada se elimina: lo
   suspendido deja de ofrecerse en proyectos nuevos y puede restaurarse." Tres tablas: **Rubros**,
   **Líneas estratégicas**, **Municipios**.
2. Cada fila muestra **Activo** o **Suspendido**. Botones **Renombrar <nombre>**, **Suspender <nombre>** y
   **Restaurar <nombre>**. Alta de rubro/línea con Código y Nombre; alta de municipio con Nombre, Departamento y
   Código DANE (opcional).
3. Prueba: suspende un municipio, abre el diálogo de crear proyecto o la pestaña **Estructura**: ya no se ofrece. Restáuralo y
   vuelve. Los inactivos siguen visibles en esta pantalla con su insignia.
4. Negativo: renombrar un rubro que ya tiene presupuesto responde "El rubro tiene datos asociados: no se puede
   renombrar, solo suspender." Un rubro nunca se elimina. Suspender un rubro con monto asignado en un borrador
   marca la fila de **Presupuesto** (pestaña **Presupuesto**) con "Rubro suspendido pendiente de reasignación" y bloquea la línea base.
5. **Umbrales del semáforo**: "Valores provisionales hasta que el equipo de producto los confirme. Marca cada
   parámetro como confirmado solo cuando esté validado." Parámetros: Umbral 1 (pp), Umbral 2 (pp), Tolerancia (%),
   Retraso (%), Avance requiere medio, Modificación bloquea periodos pasados. Cada uno con insignia **Confirmado**
   o **No confirmado**.
6. Cambia un valor, marca **Confirmar <parámetro>** y pulsa **Guardar parámetros**. Vuelve a la ficha, pestaña
   **Avance** (**Ejecución técnica**) o **Presupuesto** (**Ficha financiera**): la insignia **No confirmado** del semáforo desaparece cuando los parámetros que usa quedan
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
   **Posible retraso** si aplica), **Avance real**, **Ejecutado / asignado** y **Ver detalle** (abre la ficha). Un
   proyecto sin indicadores (Borrador) muestra "Sin medir" y "—".
5. Insignia **No confirmado** junto a **Exportar Excel**: aparece mientras los parámetros del semáforo no estén
   confirmados (§H). Es lo esperado hoy.
6. Estados: cargando (filas gris claro), vacío ("No hay proyectos para mostrar", "Prueba con otros filtros. ..."),
   error ("No pudimos cargar el tablero de proyectos. Inténtalo de nuevo."). Prueba el vacío filtrando por **Estado
   = Cancelado**.
7. Como `coordinador@`: la pestaña existe, pero el tablero cuenta solo los proyectos donde es integrante activo.
   Quítalo del equipo (§3) y el proyecto sale del tablero.

### J.2 Sección Indicadores en la ficha
En **Ver detalle**, pestaña **Avance**, debajo de **Ejecución técnica**. La ven quienes leen el proyecto. Los
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
1. En la pestaña **Avance**, sección **Indicadores**: **Exportar ficha (Excel)** baja `<código>-proyecto.xlsx` (hojas `Proyecto`, `Estructura`,
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

## 5. Ensayo automatizado (opcional)

```bash
npm run db:demo:reset:local -- --apply
npx playwright test e2e/proyectos-demo.spec.ts   # con el dev server arriba
npm run db:demo:reset:local -- --apply           # dejar limpio al terminar
```

## 6. Límites conocidos (para decirlo en la reunión)

No existe todavía, dicho sin adornos:

- **S9 terminada** (tablero, Indicadores por proyecto, exportaciones a Excel, bandera gerencial), pero falta su
  verificación independiente. **PDF no construido**: solo Excel; el PDF responde 400.
- **S10 (pulido visual) se sigue terminando**: la ficha ya está en pestañas bajo un encabezado fijo y los chips de
  semáforo ya llevan la palabra del color, pero faltan las barras de progreso, la hoja de captura móvil y las
  listas en tarjetas por debajo de `md`. La interfaz es funcional, no definitiva. **El diseño no se comprobó en un
  teléfono real.** Las pestañas se renderizan en una fila con desplazamiento horizontal.
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
- No hay edición de datos generales del proyecto desde la interfaz, ni filtro por rol en el selector del equipo.
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
Tampoco se verificó al pasar la ficha a pestañas: que cada paso se vea igual en el navegador (solo se leyeron
`project-ficha-dialog.tsx` y los componentes de cada sección), cuánto tarda en mostrarse el contenido al abrir una
pestaña por primera vez, ni cómo se ve el encabezado fijo con los dos chips en pantallas estrechas. El orden de
las secciones dentro de cada pestaña es el del código; los componentes pueden cambiar en la ronda 2 de S10.
Haz un ensayo completo antes de la reunión.
