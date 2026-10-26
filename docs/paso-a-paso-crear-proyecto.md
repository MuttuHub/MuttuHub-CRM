# Paso a paso: crear un proyecto y cargar su información hasta la línea base

Guía para crear un proyecto en el módulo **Proyectos** y completar su información hasta aprobar la línea base.
Sirve para seguirla en la demo y para compartirla con quienes usarán el módulo. La creación ya no es un diálogo: es
la página `/proyectos/nuevo`, con cinco pasos (**General**, **Metas**, **Cronograma**, **Presupuesto** y
**Revisión**). Los textos entre comillas o en negrita son los que muestra la interfaz (verificados contra el código
el 2026-10-14). Para el recorrido completo del módulo, ver `docs/guia-prueba-proyectos.md`.

## 1. Prerrequisitos

1. **Rol**: solo **Administrador** y **Gerencia** pueden crear proyectos (`canCreateProject`). Un Coordinador o un
   Colaborador que abra la página ve el bloque **"No tienes acceso para crear proyectos"** con el mensaje **"Solo
   Administración y Gerencia pueden crear proyectos. Pídeselo a alguien con ese rol."** Tampoco ve el botón; si el
   servidor recibe la solicitud responde "No tienes permisos para crear proyectos."
2. Abre **Proyectos** en el menú (`/proyectos`) y entra con cualquiera de estos accesos:
   - El botón **Nuevo proyecto** en la barra de la lista, junto al filtro **Estado**. Vive en la pestaña
     **Portafolio**; la pestaña **Tablero** no lo muestra (vuelve a **Portafolio**). Es el acceso principal.
   - Desde un cliente: hoja del cliente > **Oportunidades** > **Ver ciclo** de la oportunidad Ganada > **Convertir
     en proyecto**. Abre `/proyectos/nuevo?oportunidad=<id>` con la oportunidad ya elegida.
   - La tarjeta **"Pasar a nuevo proyecto →"** del **Tablero** de tareas (`/tablero`) solo aparece en una tarea
     comercial completada de una oportunidad ganada sin proyecto; lleva a la misma URL con la oportunidad elegida.
3. La página tiene un enlace **Volver a proyectos** arriba y, una vez existe el proyecto, los botones **Atrás** y
   **Siguiente** al pie.

## 2. La página y sus cinco pasos

El encabezado, mientras no hay proyecto, dice **Nuevo proyecto** y, debajo, "Desde una oportunidad ganada o como proyecto independiente.
Queda en borrador." El indicador de pasos son cinco píldoras numeradas; cada paso ya recorrido muestra un check y
lleva "(completado)". **Los pasos 2 al 5 quedan deshabilitados (en gris) hasta que el paso 1 cree el proyecto**;
solo entonces se puede saltar entre ellos con las píldoras o con **Atrás** / **Siguiente**.

| # | Píldora | Título en pantalla | Qué muestra (texto del encabezado del paso) |
|---|---|---|---|
| 1 | **General** | **Información general** | "Datos base del proyecto. El código se asigna solo." |
| 2 | **Metas** | **Metas e indicadores** | "Cada meta tiene indicadores de resultado con línea base y meta." |
| 3 | **Cronograma** | **Cronograma de actividades** | "Toda actividad declara su meta asociada y su entregable." |
| 4 | **Presupuesto** | **Presupuesto proyectado por rubros** | "Reparte el valor total por rubro y programa los desembolsos por mes." |
| 5 | **Revisión** | **Revisar y aprobar** | "Confirma lo capturado. Puedes guardar el borrador o aprobar la línea base." |

**Paso 1 — General.** Es el único que crea algo: al guardar, el proyecto nace en estado **Borrador** (chip
**Borrador** en el encabezado) con código **PRY-AAAA-NNN** (año y consecutivo anual de tres dígitos, por ejemplo
`PRY-2026-001`) y se avanza solo al paso 2. El formulario es el mismo para los dos orígenes (Camino A y Camino B):
origen, cliente u oportunidad, **Nombre**, **Responsable**, **Valor total**, fechas, **Meta de beneficiarios**,
**Líneas estratégicas** y **Municipios**. El botón dice **Crear proyecto y continuar**. Si el proyecto ya existe,
el paso 1 deja de mostrar el formulario y pasa a un resumen de solo lectura (nombre, origen, cliente, responsable,
fechas, valor, líneas y municipios) con este aviso: "El proyecto ya quedó creado en borrador. Para cambiar estos
datos, ábrelo desde su ficha; aquí sigue con las metas." El paso 1 nunca crea un segundo proyecto.

**Paso 2 — Metas.** Metas e indicadores: objetivos, actividades (por semana de inicio y fin), entregables e
indicadores, más **Descargar plantilla** / **Importar plantilla**.

**Paso 3 — Cronograma.** Vista de solo lectura: el **Cronograma** por semanas y el **Gantt**. Las actividades se
editan en el paso 2; arriba hay una nota con el enlace **Ir a Metas**: "Las actividades se registran en el paso
Metas, dentro de cada objetivo, ubicadas por semanas."

**Paso 4 — Presupuesto.** **Valor total**, rubros con monto **Asignado** (**Guardar presupuesto**), la suma **Σ
asignado** frente al valor total (**Igualar valor total a Σ A** si no cuadra) y la **Programación mensual** (una
columna por mes; **Guardar programación**; **Programación pendiente** mientras no cuadre con lo asignado). Son los
mismos controles de la sección **Presupuesto** de la ficha.

**Paso 5 — Revisión.** Resumen de solo lectura (proyecto, cliente, responsable, fechas y conteos de objetivos,
indicadores, actividades, entregables y presupuesto). Si la suma de los rubros no coincide con el valor total,
aparece el aviso informativo "La suma de los rubros difiere del valor total en ... Ajusta el presupuesto antes de
aprobar la línea base." Ofrece las dos salidas:
- **Aprobar línea base** (botón principal): la misma acción del encabezado de la ficha (solo Administrador y
  Gerencia, solo en Borrador). Abre una confirmación con **Cancelar** y **Aprobar**; si falta algo, lista ahí las
  precondiciones pendientes (sección 6). Congela estructura y presupuesto, crea la versión `v0` y pasa el proyecto a **En ejecución**. No se
  puede deshacer. Tras aprobar, el paso 5 cambia su título a **Línea base aprobada** ("La estructura y el
  presupuesto quedaron congelados. Abre el proyecto para darle seguimiento."), muestra el aviso "Línea base
  aprobada. El proyecto ya está en seguimiento." y ofrece **Abrir proyecto**.
- **Guardar borrador**: no guarda nada nuevo (cada paso ya persistió sus datos); **abre la ficha** del proyecto en
  `/proyectos/<id>` para seguir después.

**Retomar, recargar y volver.** El paso y el proyecto viven en la URL: `?proyecto=<id>&paso=<n>`. Al crear el
proyecto la página va a `?proyecto=<id>&paso=2`, así que recargar o usar atrás mantiene el proyecto y el paso, y un
`paso` inválido cae en el 2. Si el id no existe, la página muestra **"No pudimos abrir el proyecto"** con "El proyecto no existe." y **Empezar de nuevo**; si no puede verlo, "No tienes permisos sobre este proyecto."

El diálogo anterior (`project-create-dialog.tsx`) ya no tiene llamadores en la aplicación.

## 3. Camino A: desde una oportunidad ganada

Es el camino recomendado: el proyecto hereda los datos comerciales y la oportunidad queda enlazada.

**Cómo llegar**

- Desde **Proyectos**: **Nuevo proyecto** y, en **Origen**, deja marcado **Desde una oportunidad ganada** (es el
  valor por defecto).
- Desde el cliente o el Tablero de tareas: **Convertir en proyecto** (o **"Pasar a nuevo proyecto →"**) abre la
  página con la URL `?oportunidad=<id>`, que preselecciona esa oportunidad en cuanto carga la lista.

**Qué oportunidades aparecen**: solo las que están en estado Ganada y todavía no tienen proyecto (ni siquiera uno
eliminado). Si no hay ninguna, el paso 1 dice "No hay oportunidades ganadas sin proyecto." La acción **Convertir en
proyecto** tampoco se muestra en una oportunidad que ya tiene proyecto.

**Pasos**

1. En **Oportunidad ganada**, elige una tarjeta (nombre, cliente y valor estimado).
2. Se precargan: **Cliente** (texto de solo lectura), **Nombre** y **Valor total** (los dos editables).
3. Completa o ajusta los campos comunes (sección 5).
4. Pulsa **Crear proyecto y continuar**.

**Qué le pasa a la oportunidad**: en la misma transacción pasa a la fase de ejecución (`EJECUCION`) y se registra la
fecha de adjudicación (solo si no tenía una). Si el **Valor total** difiere del valor estimado de la oportunidad, se
muestra "Diferencia con la oportunidad: ... Se guarda en el proyecto y no impide crearlo."

## 4. Camino B: proyecto independiente

Para proyectos que no nacen de una oportunidad del CRM.

1. **Nuevo proyecto** y, en **Origen**, elige **Proyecto independiente**.
2. Elige el **Cliente**: escribe parte del nombre en el campo ("Busca o selecciona el cliente") y elígelo de la lista.
3. Escribe el **Nombre** (obligatorio, máximo 200 caracteres).
4. Completa los campos comunes (sección 5) y pulsa **Crear proyecto y continuar**.

Diferencias con el Camino A: el cliente y el nombre no se precargan, el nombre es obligatorio y no hay aviso de
diferencia de valor porque no hay oportunidad. Cambiar de origen limpia el cliente, el nombre y el valor.

## 5. Campos comunes y mensajes de validación

| Campo | Obligatorio | Notas |
|---|---|---|
| **Nombre** | Camino B: sí. Camino A: no | En A se precarga; si queda vacío se usa el de la oportunidad |
| **Responsable** | Sí | Por defecto, el usuario actual |
| **Valor total** | No (placeholder "Opcional") | Numérico, no negativo. Debe ser mayor que cero para aprobar la línea base |
| **Fecha de inicio** | Sí | Por defecto, hoy |
| **Fecha de fin** | Sí | Por defecto, tres meses después del inicio |
| **Meta de beneficiarios** | No (placeholder "Opcional") | Entero no negativo. Debe ser mayor que cero para aprobar la línea base |
| **Líneas estratégicas** (*) | Sí | Marca al menos una con **Incluir ...** y exactamente una como **Principal**. La primera viene marcada |
| **Municipios** (*) | Sí | Marca al menos uno |

**Mensajes de validación del paso 1** (no se envía nada hasta corregirlos; el aviso aparece junto al botón y la
página baja hasta él):

- "Selecciona al menos una línea estratégica."
- "Marca una línea estratégica como principal."
- "Solo una línea estratégica puede ser la principal."
- "Selecciona al menos un municipio."
- "Selecciona el responsable."
- "Completa las fechas de inicio y fin."
- "La fecha de fin no puede ser anterior a la de inicio."
- Camino A: "Selecciona la oportunidad ganada."
- Camino B: "Selecciona el cliente." y "El nombre del proyecto es obligatorio."

Los pasos 2 a 5 validan al guardar (plantilla, presupuesto y programación); sus mensajes están en
`docs/guia-prueba-proyectos.md`. El paso 5 no revalida: **Aprobar línea base** responde con las precondiciones pendientes.

## 6. Después de crear: completar los pasos y aprobar la línea base

La ficha (`/proyectos/<id>`) repite esas secciones en pestañas: **Resumen**, **Metas e indicadores**, **Cronograma**,
**Gantt**, **Ficha de seguimiento**, **Financiero**, **Legalización**, **Beneficiarios**, **Soportes**, **Equipo** y
**Cambios**. Se completa desde los pasos 2 a 5 o desde la ficha; solo Administrador y Gerencia editan un Borrador.
Orden recomendado:

1. **Metas e indicadores** (o paso 2): **Objetivos**, dentro las **Actividades** (con semana de inicio y fin;
   las fechas se calculan de las semanas del proyecto) y los **Entregables** (código, descripción, cantidad meta,
   unidad y tipo de medio), y los **Indicadores** (código, nombre, meta y unidad). Con plantilla Excel:
   **Descargar plantilla**, llénala e **Importar plantilla** (**Validar plantilla** y **Confirmar importación**);
   reemplaza estructura, presupuesto, programación, fechas, líneas y municipios del borrador y, si hay errores, no
   escribe nada. La plantilla no pide el tipo de medio de los entregables ni la unidad de los indicadores; una
   plantilla descargada antes, que todavía trae esas columnas, se sigue aceptando y esas celdas son opcionales.
2. **Cronograma** y **Gantt** (o paso 3): solo lectura.
3. **Presupuesto** (o paso 4): monto **Asignado** por rubro, **Guardar presupuesto**, **Igualar valor total a
   Σ A** si la suma no cuadra, **Programación mensual** y **Guardar programación**.
4. **Equipo**: agrega a los integrantes. El responsable ya figura como miembro; el servidor solo acepta
   coordinadores activos.
5. **Aprobar línea base** (o paso 5): botón del encabezado, visible en cualquier pestaña, solo para Administrador y
   Gerencia y solo en Borrador. Si falta algo, **Aprobar** responde con la lista de precondiciones pendientes (valor
   total mayor que cero, fechas válidas, meta de beneficiarios mayor que cero, objetivos con actividades y
   entregables, presupuesto igual al valor total, programación cuadrada). Al aprobar, estructura y presupuesto
   quedan congelados (versión `v0`), el proyecto pasa a **En ejecución** (no se puede deshacer) y se habilitan
   ejecución técnica (**Ficha de seguimiento**), gastos (**Legalización**), **Modificaciones** y **Versiones**.

## 7. Notas para la demo local

- Marca **al menos un municipio** antes de **Crear proyecto**; sin él aparece "Selecciona al menos un municipio."
- La base local tiene **5** oportunidades Ganada libres (sin proyecto), todas elegibles en el paso 1:

  | Oportunidad | Cliente | Valor |
  |---|---|---|
  | Escuela de formación técnica en confección | Instituto Andino de Innovación Productiva | $210.000.000 |
  | Fortalecimiento de unidades productivas textiles del Caribe | Fundación Tejiendo Caribe | $185.000.000 |
  | Programa de asociatividad y comercialización agroproductiva | Cooperativa Agroproductiva Alto Cauca | $120.000.000 |
  | Demo · Programa de formación técnica (ganada, lista para convertir) | Universidad Central del Valle | $95.000.000 |
  | Diagnóstico de cadena de valor de economía circular | Agencia de Cooperación Delta Verde | $48.000.000 |

- Crear el proyecto **consume** la oportunidad elegida: pasa a ejecución y deja de ser elegible. Para restaurar
  (**borra los datos locales**; solo Docker local), en este orden: `npm run db:migrate:reset:local -- --force`,
  `npm run db:seed:local`, `npm run db:demo:seed-projects:local -- --apply` y
  `npm run db:demo:seed-flujo:local -- --apply`. Detalle en `odd/tasks/demo-proyectos-2026-10-14.md`.
- No corras la suite de pruebas mientras se ensaya o se demuestra: las pruebas de invariantes crean y borran un
  proyecto `sdd-invariant-*` en la base local.
- Todo comando que toque la base debe usar `.env.local`, nunca el `.env` de la raíz.

## 8. Errores frecuentes

| Mensaje | Causa | Qué hacer |
|---|---|---|
| "Selecciona al menos un municipio." | Ningún municipio marcado | Marca uno o más en **Municipios** |
| "Marca una línea estratégica como principal." | Líneas incluidas sin ninguna principal | Marca **Principal** en una |
| "Solo una línea estratégica puede ser la principal." | Más de una marcada como principal | Deja una sola |
| "La fecha de fin no puede ser anterior a la de inicio." | Fechas invertidas | Corrige las fechas |
| "Esta oportunidad ya tiene un proyecto." | La oportunidad ya fue convertida (409) | Elige otra o abre el proyecto existente |
| "Solo se crea un proyecto desde una oportunidad en estado Ganada." | La oportunidad no está Ganada (409) | Pasa la oportunidad a Ganada primero |
| "No tienes permisos para crear proyectos." | Rol distinto de Administrador o Gerencia (403) | Pide a un Administrador o Gerencia |
| "El cliente no existe." | Cliente eliminado o id inválido (404) | Elige otro cliente |
| "No hay oportunidades ganadas sin proyecto." | No quedan oportunidades elegibles | Usa el Camino B o consulta la nota de la demo |
| "No pudimos crear el proyecto. Inténtalo de nuevo." | Falla inesperada del servidor | Reintenta; si persiste, revisa el servidor |
