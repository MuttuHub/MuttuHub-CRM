# Guía de uso — Módulo de Proyectos

Guía para las personas que van a trabajar con el módulo **Proyectos** de Muttu Hub.
Está escrita para el uso diario, no para probar la aplicación. Los textos entre comillas son los que muestra la
pantalla.

Versión: v2 (lanzamiento 2026). Fuente de este documento: `docs/guia-uso-proyectos-v2.md`. La versión para compartir
con los usuarios es `docs/guia-uso-proyectos-v2.html`.

---

## 1. Qué es el módulo de Proyectos

El módulo reúne en un solo lugar el ciclo completo de un proyecto:

- la información general y el equipo;
- la estructura técnica (objetivos, actividades, entregables e indicadores);
- el presupuesto por rubros y su programación mensual;
- los gastos y sus soportes;
- los documentos;
- el historial de cambios y versiones.

El proyecto nace en **Borrador**, se completa y se aprueba su **línea base**. Desde ese momento queda **En ejecución** y
empieza el seguimiento: avances, gastos, semáforos y alertas.

> **Idea clave:** en Borrador todo se puede editar libremente. Al aprobar la línea base, la estructura y el presupuesto
> quedan congelados; los cambios posteriores se piden como **modificación** y deben aprobarse.

---

## 2. Quién puede hacer qué

Los permisos dependen del rol y de la pertenencia al proyecto (el **Equipo** del proyecto).

| Acción | Administrador | Gerencia | Coordinador | Colaborador |
|---|---|---|---|---|
| Ver el portafolio y la pestaña Tablero | Sí | Sí | Sí, solo sus proyectos | Sí, solo sus proyectos |
| Ver un proyecto | Todos | Todos | Solo donde es integrante | Solo donde es integrante |
| Crear un proyecto | Sí | Sí | Sí | Sí |
| Editar datos generales | Sí | Sí | Sí, donde es integrante | Sí, donde es integrante |
| Cargar o editar la estructura (solo en Borrador) | Sí | Sí | Sí, donde es integrante | Sí, donde es integrante |
| Aprobar la línea base | Sí | Sí | No | No |
| Registrar avance de un entregable | Sí | Sí | Sí, si es integrante | Sí, si es integrante |
| Registrar el avance de la actividad (la pasa a En curso) | Sí | Sí | Solo si es el responsable de la actividad | Solo si es el responsable de la actividad |
| Registrar gastos | Sí | Sí | Sí, si es integrante | Sí, si es integrante |
| Validar o rechazar un gasto | Sí, salvo los que registró | Sí, salvo los que registró | No | No |
| Subir o eliminar documentos del proyecto | Sí | Sí | Sí, si es integrante | Sí, si es integrante |
| Solicitar una modificación | — | — | Sí, si es integrante | Sí, si es integrante |
| Aprobar una modificación | Sí | Sí | No | No |

Notas:

- **Segregación de funciones:** nadie puede validar un gasto que registró. Si un administrador registra un gasto, otro
  administrador o alguien de Gerencia debe validarlo.
- Un **Coordinador o un Colaborador** que no está en el **Equipo** del proyecto no lo ve, ni siquiera abriendo el enlace directo.
- La **bandera gerencial** se asigna en **Administración → Usuarios**. Da lectura del portafolio y de las fichas, nunca
  escritura ni acceso a los soportes financieros.
- Si una pantalla dice **«No tienes permisos sobre este proyecto»** o **«No tienes acceso a este proyecto»**, falta el
  rol o la pertenencia. Se resuelve desde **Administración** o agregando a la persona al **Equipo**.
- Registrar el avance de un entregable y registrar el avance de la actividad son dos acciones distintas: la primera
  suma cantidades contra la meta de un entregable; la segunda es un reporte de porcentaje a nivel de toda la
  actividad y solo puede hacerla su responsable (o Administración/Gerencia).

---

## 3. Cómo llegar

**Menú lateral → Proyectos.**

La página tiene dos pestañas:

- **Portafolio** (la vista principal): los indicadores del portafolio, los filtros y la tabla de proyectos.
- **Tablero**: indicadores gerenciales agregados. Solo aparece si el rol o la bandera lo permiten.

### 3.1 Portafolio

- Arriba, los indicadores del portafolio (totales por estado, avance técnico y financiero).
- **Filtros** por **Estado**, **Cliente**, **Línea**, **Municipio** y **Responsable**. En pantallas angostas los filtros
  se pliegan en el botón **«Filtros»**; **«Limpiar filtros»** los borra todos.
- La tabla muestra: **Proyecto** (código, cliente y nombre), **Territorio · línea**, **Responsable**, **Avance
  técnico**, **Avance financiero** y **Estado**.
- **Ver detalle** abre la ficha del proyecto en la misma ventana; **Volver a proyectos** regresa a la lista.
- El botón **Nuevo proyecto** abre el asistente de creación; lo ve cualquier rol.

Si la tabla aparece vacía:

- **«Aún no tienes proyectos visibles»**: tu rol ve solo los proyectos donde eres integrante.
- **«Todavía no hay proyectos»**: el portafolio está vacío; se crea el primero.
- **«No encontramos proyectos con estos filtros»**: usa **Limpiar filtros**.

### 3.2 Otras entradas al proyecto

- **Desde un cliente:** ficha del cliente → la oportunidad ganada → **Convertir en proyecto**. El proyecto hereda el
  cliente, el nombre y el valor estimado.
- **Desde el Tablero de tareas:** una tarea comercial completada de una oportunidad ganada muestra la tarjeta
  **«Pasar a nuevo proyecto →»**.

---

## 4. Crear un proyecto

La creación es un asistente de cinco pasos en `/proyectos/nuevo`:

**General → Metas → Cronograma → Presupuesto → Revisión**

Los pasos 2 a 5 quedan deshabilitados hasta que el paso 1 crea el proyecto. Después se puede saltar entre pasos con las
píldoras de arriba.

### Paso 1 — General (Información general)

1. Elige el **Origen**:
   - **Desde una oportunidad ganada** (recomendado): el proyecto queda enlazado al ciclo comercial. Solo aparecen las
     oportunidades en estado **Ganada** que aún no tienen proyecto.
   - **Proyecto independiente**: se elige el cliente a mano.
2. Completa **Nombre**, **Responsable**, **Valor total**, **Fecha de inicio**, **Fecha de fin**, **Meta de
   beneficiarios**, **Líneas estratégicas** y **Municipios**.
   **Municipios** se elige en dos pasos: primero el **departamento** y después el **municipio** dentro de ese
   departamento. Puedes marcar varios; cada uno queda como una ficha que se puede quitar. Están cargados **los 1122
   municipios de Colombia** (catálogo DANE fijo; no se administra desde **Administración**).
3. Pulsa **Crear proyecto y continuar**.

Al guardar, el proyecto nace en **Borrador** con un código automático **PRY-AAAA-NNN** (por ejemplo `PRY-2026-001`). El
paso 1 no se puede repetir: si vuelves, muestra un resumen de solo lectura. Para cambiar esos datos después, se usa
**Editar datos generales** en la ficha.

Si el valor total difiere del valor estimado de la oportunidad, aparece el aviso **«Diferencia con la oportunidad»**.
Es informativo: no impide crear el proyecto.

### Paso 2 — Metas (Metas e indicadores)

Aquí se carga la estructura:

- **Objetivos** (O1, O2…), cada uno con sus **actividades** (A1.1…) y sus **entregables** (E1.1.1…).
- Cada actividad declara su **semana de inicio** y **semana de fin**.
- Los **indicadores** de resultado llevan línea base y meta.

Dos formas de cargarla:

- **A mano**, con los botones de agregar de cada nivel.
- **Desde Excel:** **Descargar plantilla**, llenarla y **Importar plantilla**. La importación muestra una vista previa y
  valida antes de escribir; si hay errores, indica **regla, fila, columna, valor y mensaje**. Se acepta `.xlsx` de hasta
  4 MB. Si el presupuesto suma distinto del **Valor total** de la hoja Proyecto, no es un error: se importa la suma
  del presupuesto como valor total (advertencia **W-02**) y se recalcula la diferencia con la oportunidad.

- **Desde el Excel de la PO:** **Importar estructura (formato PO)** lee el `proyecto.xlsx` de la PO: una hoja con
  **Objetivo especifico**, **Resultados (indicador)** y **Resultados (meta)**, y otra con una fila por entregable y las
  columnas **Actividad**, **Entregables**, **Inicio (semana)**, **Fin (semana)**, **Cantidad** y **Unidad**. Las filas
  con la misma actividad del mismo objetivo forman una actividad con varios entregables, y los códigos los genera el
  sistema. **Validar** muestra la vista previa o los errores por hoja y celda; **Confirmar importación** reemplaza la
  estructura y **no toca el presupuesto**.

> La plantilla solo se puede descargar cuando el proyecto ya tiene **fechas de inicio y fin**.

### Paso 3 — Cronograma

Vista de solo lectura: el **Cronograma** por semanas y el **Gantt**. Las actividades se editan en el paso 2.

### Paso 4 — Presupuesto

1. Revisa el **Valor total**.
2. Asigna un monto a cada **rubro** (R01 a R15) y pulsa **Guardar presupuesto**.
3. La suma **Σ asignado** debe igualar el valor total. Si no cuadra, usa **Igualar valor total a Σ A** o ajusta los
   montos.
4. Programa los desembolsos por mes en **Programación mensual** y pulsa **Guardar programación**. Mientras no cuadre
   con lo asignado, verás **«Programación pendiente»**.

### Paso 5 — Revisión

Resumen de solo lectura: proyecto, cliente, responsable, fechas y conteos de objetivos, indicadores, actividades,
entregables y presupuesto.

Dos salidas:

- **Aprobar línea base**: congela estructura y presupuesto, crea la versión `v0` y deja el proyecto **En ejecución**. No
  se puede deshacer.
- **Guardar borrador**: abre la ficha para seguir después. No se pierde nada: cada paso ya guardó lo suyo.

Si la suma del presupuesto no coincide con el valor total, el aviso lo indica; hay que corregirlo en **Finanzas** antes
de aprobar.

---

## 5. La ficha del proyecto

**Ver detalle** abre `/proyectos/<id>` con un encabezado fijo y cinco pestañas: **Resumen**, **Actividades**,
**Finanzas**, **Documentos** e **Historial**.

En el encabezado, siempre visible:

- **Código** y **nombre**.
- El **estado**: Borrador, En ejecución, Suspendido, Cerrado o Cancelado.
- Los chips **Semáforo técnico** y **Semáforo financiero** (desde En ejecución). Cada chip lleva a la pestaña que explica
  su causa.
- Las acciones según rol y estado: **Aprobar línea base** (en Borrador), **Registrar avance** y **Registrar gasto** (en
  ejecución).
- El menú **«⋯» → «Más acciones»** con **Exportar a Excel** e **Imprimir / PDF**.

### 5.1 Resumen

- **Estado del proyecto** (fuera de Borrador): el semáforo **Técnico** y el **Financiero**, cada uno con una frase que
  explica el color (**Al día**, **Atención** o **En riesgo**) y un enlace a la pestaña correspondiente. Los umbrales de
  color (**umbral1**, **umbral2**) y el tope de avance mientras una actividad tiene entregables incompletos
  (**tope_en_curso**, 90 % por defecto) los configura Administración; no se editan desde la ficha del proyecto.
- **Cuándo una actividad está atrasada**: cuenta como ejecutada a tiempo si su avance llegó al tope en su fecha fin
  o antes, aunque los soportes lleguen después. Una actividad vencida está **atrasada** mientras su avance siga por
  debajo del tope. Por eso el avance programado de cada actividad llega como máximo al tope: una actividad al 90 %
  que solo espera soportes no pone el semáforo en amarillo ni en rojo, y la curva S planeada termina en el tope.
- **Requiere atención**: la lista de lo que necesita acción, ordenada por gravedad. Cada punto lleva a la pantalla donde
  se resuelve.
- **Datos generales**: origen, cliente, responsable, fechas, duración, valor total, beneficiarios y, si aplica, la
  diferencia con la oportunidad; también las **Líneas estratégicas** y los **Municipios**.
  - **Editar datos generales** (Administración, Gerencia o un integrante) abre el formulario. Si el proyecto ya salió de Borrador,
    algunos cambios se convierten en una **solicitud de modificación** en lugar de aplicarse de inmediato.
- **Equipo**: quiénes participan y con qué rol. Administrador y Gerencia agregan o quitan integrantes. Se pueden
  agregar usuarios con rol **Coordinador** o **Colaborador**.

En **Borrador**, el Resumen muestra en su lugar **Próximos pasos**: fechas y valor, objetivos y actividades, presupuesto
y aprobación de la línea base, cada uno con su enlace.

### 5.2 Actividades

Una sola estructura con tres vistas: **Lista**, **Gantt** y **Tablero**.

**En Borrador**

- **Lista**: la estructura editable (objetivos, actividades, entregables, indicadores) y la carga por Excel.
  Las fechas de una actividad se derivan de sus semanas y **el peso también**: siempre es su duración en semanas
  (`semana fin − semana inicio + 1`) y no se edita en ningún formulario. De ahí sale el avance ponderado del
  proyecto, con el que se mide el semáforo técnico.
- **Gantt**: lectura por semanas.
- No hay **Tablero** todavía, porque aún no hay nada que seguir.

**Desde En ejecución**

- **Lista**: el seguimiento por actividad, con lo planeado, lo real, el semáforo y el botón **Registrar avance**.
- **Gantt**: la programación por semanas.
- **Tablero**: columnas **Por iniciar**, **En curso**, **Atrasada** y **Terminada**. Al abrir una tarjeta, la Lista se
  posiciona en esa actividad.
- Al final, el bloque **Indicadores** permite registrar el avance de cada indicador. Cada medición ya registrada
  admite además varios archivos o enlaces con el botón **Adjuntar archivo**.

**Registrar un avance (por entregable)**

1. Abre **Registrar avance** en el entregable.
2. Indica la fecha (no puede ser futura) y el avance.
3. Adjunta el **medio de verificación**: un **archivo** o un **enlace** con su nombre.
4. Si el avance excede lo planeado, escribe la **justificación del exceso**.
5. Guarda. El avance queda con su soporte y aparece en **Documentos**.
6. Ya guardado, el avance admite seguir sumando archivos y enlaces con el botón **Adjuntar archivo**: cada uno
   aparece listado por separado (no solo como un conteo).

**Registrar el avance de la actividad (estados Sin iniciar, En curso y Terminada)**

Una actividad llega a **En curso** únicamente registrando un avance; no hay un cambio de estado manual aparte. Solo el
**responsable** de la actividad (o Administración/Gerencia) puede registrar, anular y adjuntar medios a sus reportes.

1. Abre **Registrar avance** en la actividad (no confundir con el **Registrar avance** de un entregable, arriba).
2. Indica la fecha (no puede ser futura), el **porcentaje de avance** (0-100) y una **observación** — siempre
   obligatoria, explica qué se ejecutó y qué falta.
3. Guarda. El primer reporte pasa la actividad a **En curso** automáticamente.

Reglas del reporte:

- Cada nuevo reporte debe ser **mayor** que el último registrado; uno igual o menor se rechaza con el mensaje «El
  avance debe ser mayor que el último reportado (X %)».
- Mientras los entregables de la actividad no estén todos completos (meta alcanzada y con al menos un medio de
  verificación cada uno), el porcentaje no puede superar el tope configurado por Administración (90 % por defecto);
  si se supera, el mensaje es «El avance máximo sin entregables completos es X %».
- La actividad solo llega a **100 % y Terminada** cuando **todos** sus entregables alcanzan su meta y cada uno tiene
  al menos un medio de verificación — sin importar el porcentaje reportado. Si un entregable no se puede cumplir
  (por ejemplo, 48 de 50 personas), la actividad nunca llegará a Terminada por esta vía; la salida es que Gerencia
  apruebe una modificación de la meta.
- El **historial** de la actividad muestra todos los reportes (fecha, porcentaje, observación y usuario), incluidos
  los anulados.
- Para corregir un error de digitación, **anula** el último reporte (pide un motivo) y registra uno nuevo con el
  valor correcto. Solo se puede anular el reporte más reciente; uno ya anulado no se puede volver a anular.
- Un reporte admite adjuntar después un **medio de verificación** (archivo o enlace), igual que un avance de
  entregable.

### 5.3 Finanzas

Tres segmentos: **Resumen**, **Gastos** y **Presupuesto**. En Borrador abre en **Presupuesto**, que es lo único editable
en ese estado.

**Resumen**

- La **ficha financiera**: presupuesto asignado, programado y ejecutado por rubro.
- La comparación contra la **base original (v0)** cuando la línea base está aprobada.
- Filtros de **Corte** y **Base** para ver la foto de una fecha.

**Gastos**

- Los KPI de gastos y la tabla con **Registrado**, **Validado**, **Rechazado** y **Anulado**.
- Filtros por estado (incluye **Pendiente por revisión**) y un buscador.
- **Registrar gasto** abre el formulario: **Rubro**, **Subtotal**, **IVA**, **Total**, **Fecha del documento**,
  **Periodo**, **Tipo de soporte** (factura de proveedor, cuenta de cobro de persona natural u otro), **Número de
  documento**, **Tercero**, **Tipo y número de identificación**, **Descripción** y el **soporte** (archivo o enlace);
  al elegir un archivo se ve su nombre con la opción de **Quitar**.
- **Subtotal, IVA y Total:** el **Total** lo calcula el sistema (Subtotal + IVA) y no se digita. El valor ejecutado que
  consume el presupuesto del rubro es siempre el Total. El **IVA** puede ser 0 (por ejemplo, en cuentas de cobro de
  personas naturales no responsables de IVA), pero hay que escribirlo. En la tabla el IVA se muestra aparte, debajo del
  Total, solo como información. Ejemplo: Subtotal $1.000.000 + IVA $190.000 registra $1.190.000 ejecutados.
- **Periodo:** se llena solo con el mes de la **Fecha del documento** y cambia si cambia la fecha. Se puede cambiar, solo
  eligiendo meses del proyecto. Si se cambia, el gasto muestra la marca **Periodo modificado** y el cambio queda en la
  auditoría. Si el mes de la fecha está fuera de los meses del proyecto, el periodo queda vacío y es obligatorio elegirlo.
- El soporte es obligatorio: un gasto sin soporte no se registra.
- **Importar gastos** carga varios gastos desde un Excel (una fila por gasto) para quienes pueden registrar gastos, solo
  con el proyecto en ejecución. **Descargar plantilla** baja el formato con los rubros del proyecto. **Validar** muestra
  cada fila como válida o con error y su motivo, sin guardar nada; **Importar** crea solo las filas válidas como
  **Registrado** y lista las rechazadas. Un duplicado dentro del archivo (mismo tercero y número de documento) se rechaza.
  Las columnas obligatorias de la plantilla son **Subtotal** e **IVA** (el IVA puede ser 0, pero se escribe); **Total**
  es opcional y, si viene, debe ser igual a Subtotal + IVA o la fila se rechaza indicando la fila y la columna. Un
  **Periodo** vacío usa el mes de la fecha del documento; si ese mes no es del proyecto, la fila se rechaza hasta que se
  indique el periodo. Una plantilla anterior (con la columna **Valor (COP)** y sin **Subtotal**) se rechaza completa con
  «Esta plantilla es anterior: descarga la nueva, que separa Subtotal e IVA.»
  La columna **Enlace del soporte** es opcional y admite uno o varios enlaces en la misma celda, separados por punto
  y coma; cada uno debe empezar por `http://` o `https://` o la fila se rechaza indicando la fila y la columna. Una
  fila con dos enlaces válidos crea el gasto con dos soportes. Si la fila no trae enlaces, el gasto importado aparece
  **Sin soporte** y quien lo registró lo adjunta con **Adjuntar archivo** (archivo o enlace, hasta 5); al elegir un
  archivo se ve su nombre con la opción de **Quitar**. Un gasto sin soporte no se puede validar.
- **Validar** y **Rechazar** están disponibles para Administrador y Gerencia, y nunca sobre un gasto propio. Al
  rechazar se escribe el **motivo**.
- **Anular** un gasto es una acción aparte, con su propio motivo.

**Presupuesto**

- El **valor total** y el monto **Asignado** por rubro, con la suma **Σ asignado**.
- **Programación mensual** por rubro, con **Guardar programación**.
- Si un rubro está suspendido y tiene monto asignado, aparece el aviso **«Rubro suspendido pendiente de reasignación»**.

**Notificaciones relacionadas**

- Quien registró un gasto rechazado recibe **«Gasto rechazado»** con el motivo y el enlace.
- Gerencia recibe el aviso de **rubro sobreejecutado** y el proyecto lo muestra en **Requiere atención**.

### 5.4 Documentos

Reúne en una sola lista todos los soportes del proyecto, con su origen: **Actividades**, **Indicadores**, **Gastos** y
**Proyecto**.

- **Filtrar documentos** por origen y **Buscar por nombre**.
- Al abrir un documento, la descarga usa una **URL firmada**: el archivo no es público. El archivo se **descarga
  directo**, sin abrir otra pestaña; un **enlace** externo (por ejemplo Drive) sí se abre en otra pestaña.
- **Subir documento** (Administrador, Gerencia o un integrante, en estados editables) permite un **archivo** o
  un **enlace con su nombre**.
- **Eliminar** solo está disponible para documentos del grupo **Proyecto**, y solo para quien los subió o para
  Administrador y Gerencia.

Los soportes de avances y gastos se administran desde su propia pantalla: aquí solo se consultan.

### 5.5 Historial

Tres segmentos: **Modificaciones**, **Versiones** y **Auditoría**.

- **Modificaciones**: la cola de solicitudes con estado **Pendiente**, **Aprobada** o **Rechazada**. Un integrante
  solicita; Administrador y Gerencia aprueban o rechazan (el rechazo lleva **Comentario del rechazo**).
  Mientras una solicitud está pendiente, el cambio no se aplica.
- **Versiones**: la `v0` de la línea base y las versiones siguientes, con comparación campo por campo (proyecto,
  presupuesto, programación, actividades, entregables e indicadores).
- **Auditoría**: el registro de cambios del proyecto, con usuario y fecha.

### 5.6 Cambiar el estado: suspender, reactivar, cerrar, reabrir o cancelar

Solo **Administrador** o **Gerencia**. En el encabezado de la ficha, el botón **Cambiar estado** abre un diálogo con
las acciones válidas para el estado actual y un **motivo** obligatorio:

| Estado actual | Acciones disponibles |
|---|---|
| Borrador | Cancelar |
| En ejecución | Suspender, Cerrar, Cancelar |
| Suspendido | Reactivar, Cancelar |
| Cerrado | Reabrir |
| Cancelado | Ninguna (el botón no aparece) |

- **Suspendido** y **Cerrado** congelan el proyecto: desaparecen **Registrar avance**, **Registrar gasto**, **Subir
  documento** y las decisiones sobre modificaciones y gastos pendientes; esas acciones responden «No se puede
  modificar un proyecto en este estado» (409) si se intentan por API. Las **anulaciones** de gastos siguen permitidas
  en cualquier estado, como corrección auditada.
- **Reactivar** devuelve un proyecto suspendido a **En ejecución**; **Reabrir** hace lo mismo desde **Cerrado**.
- **Cancelar** es el único cambio sin vuelta atrás: el proyecto queda en **Cancelado** sin acciones posibles.
- Cada cambio de estado y su motivo quedan en **Historial → Auditoría**.
- Un Coordinador o un Colaborador no ve **Cambiar estado**.

---

## 6. Aprobar la línea base

Es el paso que convierte un borrador en un proyecto en ejecución. Solo Administrador y Gerencia, y solo en Borrador.

Antes de aprobar, el sistema verifica:

- el proyecto tiene un **valor total mayor que cero**;
- tiene **fechas de inicio y fin válidas**;
- tiene **beneficiarios mayor que cero**;
- tiene **objetivos**, y cada objetivo tiene **actividades**;
- cada actividad tiene **entregables**;
- la **suma del presupuesto** es igual al valor total (si no, indica la diferencia);
- la **programación** existe y cuadra con lo asignado por rubro;
- no hay **rubros suspendidos con monto asignado**.

Si falta algo, la confirmación lista las precondiciones pendientes y no deja aprobar. Al aprobar, la estructura y el
presupuesto se congelan, se crea la versión `v0` y el proyecto pasa a **En ejecución**.

> **No se puede deshacer.** Para cambiar algo después, se usa una **solicitud de modificación**.

---

## 7. Imprimir, PDF y Excel

En el encabezado de la ficha, menú **«⋯»**:

- **Exportar a Excel**: elige el **corte** y la **base** y descarga la ficha.
- **Imprimir / PDF**: abre una hoja limpia, sin el menú lateral, en la **misma pestaña**. Con **Ctrl+P** (o el botón
  **Imprimir / Guardar PDF**) se imprime o se guarda como PDF; **Volver** regresa a la ficha.

### 7.1 Reporte semanal (Reportes › Semanal)

En **Reportes**, la pestaña **Semanal** arma el informe para presentar cada semana. La semana va de **lunes a
domingo** (hora de Colombia); por defecto es la semana en curso y las flechas **Semana anterior / Semana siguiente**
cambian de semana. Los indicadores se calculan al **domingo** de la semana elegida (o a hoy, si la semana está en
curso), con los mismos números del Tablero de proyectos.

| Sección | Qué muestra |
| --- | --- |
| Resumen | Proyectos, avance real promedio, ejecutado frente a asignado y actividades atrasadas. |
| Portafolio por proyecto | Semáforo técnico y financiero, avance real y programado, y presupuesto asignado, programado y ejecutado. |
| Portafolio por cliente | Lo mismo agregado por cliente, con cuántos proyectos tiene en cada color. |
| Tareas | Tareas cerradas y vencidas de la semana frente a la semana anterior, con la diferencia. |
| Actividades atrasadas | Actividades vencidas cuyo avance sigue por debajo del tope (**tope_en_curso**). |
| Requiere atención | Lo mismo que la ficha (rubros sobreejecutados, avances sin soporte, indicadores bajo la meta, posible retraso); los gastos observados se cuentan, sin detalle. |
| Gastos por validar | Solo Administrador y Gerencia: cantidad, monto y fecha del registro más antiguo, por proyecto. |

Cada rol ve los proyectos que ve en el Tablero. Una tarea **vencida** en la semana es la que tenía entrega esa
semana y no se cerró a tiempo; una **cerrada** es la que se completó esa semana.

- **Generar reporte** abre la versión para imprimir en la **misma pestaña**; **Imprimir** la imprime o la guarda
  como PDF y **Volver** regresa a Reportes.
- **Exportar Excel** baja `reporte-semanal-<lunes>.xlsx`, con una hoja por sección. Solo agregados: sin gastos
  individuales, terceros ni soportes.

### 7.2 Reporte de tareas (Reportes › Tareas y Tablero de tareas)

- **PDF** (en el reporte) e **Imprimir** (en el Tablero de tareas) abren la versión para imprimir en la **misma
  pestaña**; **Volver** regresa a donde estabas (o a Reportes, si la abriste directo).
- **Excel** del reporte baja `tareas.xlsx` con el **mismo período** que muestra (Semana, Mes, Trimestre o Todo). El
  **Excel** de la cabecera del Tablero de tareas no tiene período: exporta las tareas con los filtros del tablero.
- En una tarea, **Descargar** un adjunto lo baja directo, sin abrir otra pestaña.

---

## 8. Rutina recomendada

**Al crear un proyecto**

1. Verificar cliente, responsable, fechas, valor y beneficiarios.
2. Cargar objetivos, actividades y entregables (a mano o con la plantilla).
3. Asignar el presupuesto por rubro y programarlo por mes.
4. Revisar y **Aprobar línea base**.

**Cada semana**

1. Revisar **Resumen → Requiere atención**, o el consolidado en **Reportes › Semanal**.
2. Registrar los avances con su medio de verificación.
3. Registrar los gastos con su soporte.
4. Administrador o Gerencia: validar o rechazar los gastos pendientes.
5. Revisar los semáforos y explicar los rojos.

**Cada mes**

1. Revisar la **ficha financiera** contra la base `v0`.
2. Ajustar lo que corresponda con una **solicitud de modificación**.

---

## 9. Problemas frecuentes

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| «No tienes acceso para crear proyectos» | Tu rol no crea proyectos | Pedirlo a Administración o Gerencia |
| «No tienes permisos sobre este proyecto» | No eres integrante ni tienes el rol | Pedir que te agreguen al **Equipo** |
| La tabla del portafolio está vacía | Tu rol ve solo tus proyectos, o hay filtros activos | **Limpiar filtros**; si sigue vacía, revisar el **Equipo** |
| «Aprobar línea base» no aparece | No estás en Borrador o no tienes el rol | Verificar estado y rol |
| La aprobación lista precondiciones | Falta completar estructura, presupuesto o programación | Resolver cada punto y volver a intentar |
| No puedo validar un gasto | Lo registraste tú, o no tienes el rol | Que lo valide otra persona con permiso |
| «Programación pendiente» | La programación no cuadra con lo asignado | Ajustar meses o montos en **Presupuesto** |
| «Rubro suspendido pendiente de reasignación» | Un rubro suspendido tiene dinero asignado | Reasignar el monto a otro rubro |
| No puedo editar la estructura | El proyecto ya salió de Borrador | Usar una **solicitud de modificación** |
| El documento no abre | El archivo ya no está o no tienes permiso sobre los soportes | Verificar el origen del documento y el rol |
| «El avance debe ser mayor que el último reportado (X %)» | El nuevo reporte de la actividad es igual o menor que el anterior | Reportar un porcentaje mayor que el último |
| «El avance máximo sin entregables completos es X %» | Los entregables de la actividad no están todos completos | Completar los entregables (meta y medio) o reportar hasta el tope |
| No veo **Registrar avance** en la actividad | No eres el responsable de esa actividad | Pedir al responsable que lo registre, o a Administración/Gerencia |
| «Solo se puede anular el último reporte registrado de la actividad» | Intentas anular un reporte que ya fue superado por uno más reciente | Anular primero el reporte más reciente |

---

## 10. Límites de esta versión

Estas funciones **no** están en el lanzamiento y se trabajarán después:

- **Rubros personalizados o deshabilitados por proyecto**: hoy el catálogo R01 a R15 es global.
- **Correos automáticos con marca**: las notificaciones dentro de la aplicación funcionan; el envío de correo depende del
  dominio y se configurará después.

---

## 11. Glosario

- **Línea base**: la foto aprobada de la estructura y el presupuesto. Versión `v0`.
- **Rubro**: categoría de gasto del catálogo (R01 a R15).
- **Asignado**: el monto que el proyecto destina a un rubro.
- **Programado**: el monto de ese rubro repartido por mes.
- **Ejecutado**: lo efectivamente gastado y validado.
- **Semáforo técnico**: el estado del avance de actividades y entregables (**Al día**, **Atención**, **En riesgo**).
- **Semáforo financiero**: el estado del gasto frente al presupuesto y su programación.
- **Medio de verificación**: el archivo o enlace que prueba un avance.
- **Modificación**: el cambio solicitado después de aprobar la línea base.
- **Reporte de avance**: el porcentaje y la observación que el responsable de una actividad registra para llevarla a
  **En curso**; distinto del avance por entregable, que suma cantidades contra una meta.
- **tope_en_curso**: el porcentaje máximo (90 % por defecto, configurable) que admite un reporte de avance mientras
  los entregables de la actividad no estén todos completos. También mide el atraso: llegar al tope en la fecha fin es
  ejecutar a tiempo, y es el máximo del avance programado de cada actividad.

---

## Anexo A. Validación en 15 minutos (para la PO)

Este anexo no explica el módulo: sirve para **comprobarlo**. Cada fila dice qué hacer y qué debe verse. Si algo no
coincide, es un hallazgo que conviene anotar con el paso, la pantalla y lo que apareció.

**Antes de empezar**

- Entrar con un usuario **Administrador** o **Gerencia**.
- Tener un cliente con una oportunidad en estado **Ganada** (hoy hay una disponible).
- Para los puntos de permisos, un segundo usuario con rol **Coordinador** que no sea integrante, y un **Colaborador**.

| # | Qué hacer | Qué debe verse |
|---|---|---|
| 1 | Abrir **Proyectos** con el portafolio vacío | El mensaje **«Todavía no hay proyectos»** y los indicadores en cero |
| 2 | **Nuevo proyecto → Desde una oportunidad ganada** | Solo aparecen oportunidades **Ganadas** sin proyecto; nombre y valor precargados; al guardar, código **PRY-AAAA-NNN** y estado **Borrador** |
| 3 | **Nuevo proyecto → Proyecto independiente** | Cliente y nombre obligatorios; sin aviso de diferencia de valor |
| 4 | Abrir el **Resumen** del borrador | **Próximos pasos** con fechas y valor, estructura, presupuesto y línea base, cada uno con su enlace |
| 5 | **Actividades → Lista**: crear objetivo, actividad con semanas, entregable e indicador | Los códigos se generan solos (O1, A1.1, E1.1.1); el **Gantt** refleja las semanas; en Borrador no hay **Tablero** |
| 6 | **Descargar plantilla** e **Importar plantilla** con un error deliberado | La vista previa lista **regla, fila, columna, valor y mensaje**, y no escribe nada hasta corregir |
| 7 | **Finanzas → Presupuesto**: asignar rubros con una suma distinta al valor total | Aviso de la diferencia; **Igualar valor total a Σ A**; la programación mensual muestra **«Programación pendiente»** si no cuadra |
| 8 | **Aprobar línea base** con algo pendiente | Lista las **precondiciones** que faltan; al completarlas y aprobar, el proyecto pasa a **En ejecución** y se crea la versión `v0` |
| 9 | **Actividades → Registrar avance** | La fecha no puede ser futura; exige archivo o enlace; si el avance excede lo planeado, pide **justificación del exceso** |
| 10 | **Finanzas → Gastos → Registrar gasto** | El **soporte es obligatorio**; el gasto queda en **Registrado** |
| 11 | Validar ese gasto con **la misma** cuenta | No se puede: la validación exige otra persona con permiso |
| 12 | **Rechazar** el gasto desde otra cuenta | Pide el **motivo**; quien lo registró recibe **«Gasto rechazado»** con el motivo y el enlace |
| 13 | **Documentos**: subir un archivo y un enlace, y abrirlos | Descarga por **URL firmada**; **Eliminar** solo aparece en documentos del grupo **Proyecto** |
| 14 | **Historial**: ver **Versiones** y **Auditoría** | Comparación `v0` contra la versión actual; la auditoría muestra usuario y fecha |
| 15 | Menú **«⋯»** | **Imprimir / PDF** sale sin menú lateral; **Exportar a Excel** descarga con corte y base elegidos |
| 16 | Abrir el proyecto con un **Coordinador y un Colaborador que no sean integrantes** | No lo ven: **«No tienes permisos sobre este proyecto»** |
| 17 | Abrir la ficha en una ventana de **390 px** | Nada se sale de la pantalla |

### Decisiones de producto que conviene confirmar con la PO

Estos puntos están **fuera** del lanzamiento o dependen de una definición, y conviene cerrarlos antes de la siguiente
iteración:

1. **Importar solo estructura, sin presupuesto, con la plantilla genérica.** Esa plantilla sigue exigiendo que el
   presupuesto cuadre con el valor total. El flujo que pidió la PO (estructura primero, presupuesto después) ya existe
   con **Importar estructura (formato PO)** (sección 4, paso 2), que no toca el presupuesto.
2. **Rubros personalizados o deshabilitados por proyecto.** Hoy el catálogo R01 a R15 es global: un rubro sin uso queda
   en $0 y se sigue mostrando.
3. **Correos automáticos.** Las notificaciones dentro de la aplicación funcionan; el envío de correo depende de verificar
   el dominio de envío.
