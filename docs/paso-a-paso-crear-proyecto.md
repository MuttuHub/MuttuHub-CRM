# Paso a paso: crear un proyecto y cargar su información hasta la línea base

Guía para crear un proyecto en el módulo **Proyectos** y completar su información hasta aprobar la línea base.
Sirve para seguirla en la demo y para compartirla con quienes usarán el módulo. Los textos entre comillas o en
negrita son los que muestra la interfaz (verificados contra el código el 2026-10-14). Para el recorrido completo
del módulo, ver `docs/guia-prueba-proyectos.md`.

## 1. Prerrequisitos

1. **Rol**: solo **Administrador** y **Gerencia** pueden crear proyectos (`canCreateProject`). Un Coordinador o un
   Colaborador no ve el botón; si el servidor recibe la solicitud responde "No tienes permisos para crear proyectos."
2. Abre **Proyectos** en el menú (`/proyectos`).
3. El botón **Nuevo proyecto** está en el encabezado de la lista, junto al filtro **Estado**. Si ves las pestañas
   **Portafolio** y **Tablero**, el botón está en **Portafolio** (el **Tablero** no lo muestra: vuelve a
   **Portafolio**).
4. Hay un segundo acceso, desde la oportunidad: ver el Camino A.

## 2. Camino A: desde una oportunidad ganada

Es el camino recomendado: el proyecto hereda los datos comerciales y la oportunidad queda enlazada.

**Cómo llegar**

- Desde **Proyectos**: **Nuevo proyecto** y, en **Origen**, deja marcado **Desde una oportunidad ganada** (es el
  valor por defecto).
- Desde el cliente: abre una oportunidad en estado Ganada y pulsa **Convertir en proyecto**. El diálogo se abre con
  esa oportunidad ya elegida.

**Qué oportunidades aparecen**: solo las que están en estado Ganada y todavía no tienen proyecto. Si no hay ninguna,
el diálogo dice "No hay oportunidades ganadas sin proyecto." El botón **Convertir en proyecto** tampoco se muestra
en una oportunidad que ya tiene proyecto.

**Pasos**

1. En **Oportunidad ganada**, elige una tarjeta (nombre, cliente y valor estimado).
2. Se precargan: **Cliente** (solo lectura), **Nombre** y **Valor total** (los dos editables).
3. Completa o ajusta los campos comunes (sección 4).
4. Pulsa **Crear proyecto**.

**Qué le pasa a la oportunidad**: en la misma transacción pasa a la fase de ejecución (`EJECUCION`) y se registra la
fecha de adjudicación (solo si no tenía una). Si el **Valor total** difiere del valor estimado de la oportunidad, el
diálogo muestra "Diferencia con la oportunidad: ... Se guarda en el proyecto y no impide crearlo."

## 3. Camino B: proyecto independiente

Para proyectos que no nacen de una oportunidad del CRM.

1. **Nuevo proyecto** y, en **Origen**, elige **Proyecto independiente**.
2. Elige el **Cliente** en el selector ("Selecciona el cliente").
3. Escribe el **Nombre** (obligatorio, máximo 200 caracteres).
4. Completa los campos comunes (sección 4) y pulsa **Crear proyecto**.

Diferencias con el Camino A: el cliente y el nombre no se precargan, el nombre es obligatorio y no hay aviso de
diferencia de valor porque no hay oportunidad. Cambiar de origen limpia el cliente, el nombre y el valor.

## 4. Campos comunes

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

**Mensajes de validación del diálogo** (el diálogo no envía nada hasta corregirlos):

- "Selecciona al menos una línea estratégica."
- "Marca una línea estratégica como principal."
- "Solo una línea estratégica puede ser la principal."
- "Selecciona al menos un municipio."
- "Selecciona el responsable."
- "Completa las fechas de inicio y fin."
- "La fecha de fin no puede ser anterior a la de inicio."
- Camino A: "Selecciona la oportunidad ganada."
- Camino B: "Selecciona el cliente." y "El nombre del proyecto es obligatorio."

**Al crear**: el diálogo cambia a **Proyecto creado** ("Quedó en borrador. Ábrelo para completar su ficha.") y
muestra el código y el nombre. El código lo asigna el servidor con el formato **PRY-AAAA-NNN** (año y consecutivo
anual de tres dígitos, por ejemplo `PRY-2026-001`). Pulsa **Abrir proyecto** para ir a la ficha o **Listo** para
volver a la lista. El proyecto queda en estado **Borrador**.

## 5. Después de crear: cargar la información (proyecto en Borrador)

Abre la ficha (`/proyectos/<id>`). Las pestañas son: **Resumen**, **Metas e indicadores**, **Cronograma**, **Gantt**,
**Ficha de seguimiento**, **Financiero**, **Legalización**, **Beneficiarios**, **Soportes**, **Equipo** y **Cambios**.
Solo Administrador y Gerencia editan un Borrador. Orden recomendado:

1. **Metas e indicadores**: crea los **Objetivos**, dentro de cada uno las **Actividades** (con semana de inicio y
   fin; las fechas se calculan a partir de las semanas del proyecto) y los **Entregables** (código, descripción,
   cantidad meta, unidad y tipo de medio), y los **Indicadores** (código, nombre, meta y unidad). Hay dos formas:
   - Manual, objeto por objeto.
   - Con plantilla Excel: **Descargar plantilla**, llénala e **Importar plantilla** (**Validar plantilla** y luego
     **Confirmar importación**). La importación reemplaza estructura, presupuesto, programación, fechas, líneas y
     municipios del borrador; si hay errores no se escribe nada.
2. **Cronograma** y **Gantt**: son de solo lectura. Revisa en **Gantt** el **Cronograma por semanas**: una barra por
   actividad, calculada con las semanas que cargaste.
3. **Financiero**: sección **Presupuesto**. Escribe el monto **Asignado** por rubro y pulsa **Guardar presupuesto**.
   Si la suma no coincide con el valor total, usa **Igualar valor total a Σ A**. Luego completa la **Programación
   mensual** (una columna por mes, una fila por rubro) y pulsa **Guardar programación**. La programación de cada
   rubro debe coincidir con lo asignado; mientras no cuadre aparece **Programación pendiente**.
4. **Equipo**: agrega a los integrantes. El responsable ya figura como miembro; el servidor solo acepta
   coordinadores activos.
5. **Aprobar línea base**: botón en el encabezado de la ficha, visible desde cualquier pestaña, solo para
   Administrador y Gerencia y solo en Borrador.
   - Si falta algo, **Aprobar** responde con la lista de precondiciones pendientes (valor total mayor que cero,
     fechas válidas, meta de beneficiarios mayor que cero, objetivos con actividades y entregables, presupuesto igual
     al valor total, programación cuadrada). Corrige y vuelve a pulsar **Aprobar**.
   - Al aprobar, la estructura y el presupuesto quedan congelados (versión `v0`) y el proyecto pasa a **En
     ejecución**. No se puede deshacer.
   - Se habilitan la ejecución técnica (**Ficha de seguimiento**), los gastos (**Legalización**) y las
     **Modificaciones** y **Versiones** (pestaña **Cambios**).

## 6. Notas para la demo local

- La base local tiene **una sola** oportunidad ganada libre: "Demo · Programa de formación técnica", del cliente
  Universidad Central del Valle.
- Marca **al menos un municipio** antes de **Crear proyecto**; sin él aparece "Selecciona al menos un municipio."
- Crear el proyecto **consume** ese dato de demo: la oportunidad pasa a ejecución y deja de ser elegible. Volver al
  estado inicial exige el reset local completo documentado en `odd/tasks/demo-proyectos-2026-10-14.md`
  (`db:migrate:reset:local`, `db:seed:local` y `db:demo:seed-projects:local -- --apply`).
- Todo comando que toque la base debe usar `.env.local`, nunca el `.env` de la raíz.

## 7. Errores frecuentes

| Mensaje | Causa | Qué hacer |
|---|---|---|
| "Selecciona al menos un municipio." | Ningún municipio marcado | Marca uno o más en **Municipios** |
| "Marca una línea estratégica como principal." | Líneas incluidas sin ninguna principal | Marca **Principal** en una |
| "Solo una línea estratégica puede ser la principal." | Más de una marcada como principal | Deja una sola |
| "La fecha de fin no puede ser anterior a la de inicio." | Fechas invertidas | Corrige las fechas |
| "Esta oportunidad ya tiene un proyecto." | La oportunidad ya fue convertida (409) | Elige otra o abre el proyecto existente |
| "Solo se crea un proyecto desde una oportunidad en estado Ganada." | La oportunidad no está Ganada | Pasa la oportunidad a Ganada primero |
| "No tienes permisos para crear proyectos." | Rol distinto de Administrador o Gerencia (403) | Pide a un Administrador o Gerencia |
| "El cliente no existe." | Cliente eliminado o id inválido (404) | Elige otro cliente |
| "No hay oportunidades ganadas sin proyecto." | No quedan oportunidades elegibles | Usa el Camino B o consulta la nota de la demo |
| "No pudimos crear el proyecto. Inténtalo de nuevo." | Falla inesperada del servidor | Reintenta; si persiste, revisa el servidor |
