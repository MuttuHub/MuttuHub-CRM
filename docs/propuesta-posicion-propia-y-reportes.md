# Propuesta: proyectos de posición propia y reportes de gestión

**Fecha:** 19 de noviembre de 2026 · **Estado:** propuesta para revisión

## Resumen

Proponemos tres mejoras al CRM:

1. Proyectos de posición propia que se gestionan con varios aliados.
2. Reportes de gestión por proyecto y por etiqueta, exportables a PDF y Excel.
3. Un diseño de reportes prototipado y aprobado antes de programarlo.

Se implementan en 5 a 7 semanas. El primer entregable, el reporte por etiqueta, estaría en unas 2 semanas. No se modifican los proyectos existentes ni las cifras actuales del tablero. Para avanzar necesitamos cuatro decisiones (sección 6).

## 1. Qué necesitamos resolver

Muttu impulsa iniciativas propias (por ejemplo Fábrica Milagro, Reconstrucción y Distrito Creativo), con su presupuesto y sus actividades. Para financiarlas busca varios aliados: cámara de comercio, empresas privadas, la alcaldía, fundaciones, etc.

Hoy esto se gestiona con **etiquetas** en clientes y tareas. Sirven para filtrar, pero tienen tres límites:

| Necesidad | Qué pasa hoy |
|---|---|
| Ver cuánto vale el proyecto, cuántos aliados tiene y quiénes son | Hay que filtrar clientes por etiqueta y sumar a mano. |
| Ver qué se habló con cada aliado sobre ese proyecto, sus oportunidades y el avance de las tareas | La bitácora y las oportunidades no tienen etiqueta. Si un cliente participa en dos proyectos, no se distingue a cuál corresponde cada conversación. |
| Crear el proyecto en el CRM con presupuesto y actividades | El formulario exige **un solo cliente**. Si se asocia a un cliente u oportunidad, su valor entra a las cifras del tablero y las distorsiona. |

## 2. Propuesta

### 2.1 Proyecto de posición propia, con varios aliados

Proponemos un nuevo tipo de proyecto: **posición propia**. Se suma a los dos que ya existen: "desde oportunidad" e "independiente".

- **No exige un cliente único.** Se le vinculan varios clientes como aliados. Por cada aliado se registra:
  - el rol: financiador, aliado o prospecto;
  - el estado: en gestión, comprometido o descartado;
  - opcionalmente, el aporte comprometido.
- **Maneja lo suyo.** El presupuesto, las actividades y las tareas son del proyecto, independientes de lo que tenga asignado cada cliente.
- **No contamina el tablero.** El valor del proyecto **no** suma al pipeline comercial, que sigue saliendo solo de las oportunidades de cada cliente.
- **Regla para no contar dos veces:** si un aliado abre una oportunidad para aportar al proyecto, esa oportunidad cuenta en el pipeline como cualquier otra y además queda vinculada al proyecto. La ficha del proyecto compara **meta del proyecto** contra **aportes comprometidos**.

### 2.2 Reporte de gestión por proyecto

Es un reporte por cada proyecto de posición propia, disponible en la sección **Reportes** y como botón en la ficha del proyecto. Contiene:

1. **Resumen:** valor, presupuesto, estado, meta frente a lo comprometido.
2. **Aliados:** quiénes son, su rol, su estado y su aporte.
3. **Oportunidades** vinculadas y su etapa.
4. **Bitácora:** las últimas interacciones con cada aliado sobre este proyecto y el próximo paso acordado.
5. **Tareas:** porcentaje de avance, tareas vencidas y próximas.

### 2.3 Reporte de gestión por etiqueta

Es un reporte transversal. Se elige una etiqueta (por ejemplo "Reconstrucción") y un período, y se ve toda la gestión de los clientes y proyectos que tienen esa etiqueta, sin importar a qué cliente pertenece cada proyecto. Complementa el reporte por proyecto; no lo reemplaza.

Contiene:

1. **Resumen:** cuántos clientes y proyectos incluye, valor total de los proyectos, ejecución presupuestal, pipeline abierto y avance de tareas.
2. **Proyectos:** estado, avance de actividades y presupuesto ejecutado frente al programado.
3. **Clientes:** proyectos y oportunidades abiertas de cada uno, y fecha de la última interacción. Se resaltan los clientes que llevan más de 15 días sin interacciones.
4. **Oportunidades abiertas** de esos clientes, con su estado y valor.
5. **Bitácora:** las últimas interacciones con esos clientes y el próximo paso.
6. **Tareas** con la etiqueta, con las vencidas primero.

Qué entra en el reporte:

- **Proyectos:** los que tienen la etiqueta. Hoy los proyectos no tienen etiquetas, así que hay que agregarlas. No se deducen desde la etiqueta del cliente: un cliente etiquetado puede tener otros proyectos que no tienen nada que ver, y los números quedarían inflados.
- **Clientes:** los que tienen la etiqueta.
- **Oportunidades y bitácora:** las de los clientes etiquetados, porque hoy no tienen etiquetas propias.
- **Tareas:** las que tienen la etiqueta.

Si un cliente tiene dos etiquetas, aparece en los dos reportes. Por eso los totales de distintas etiquetas no se deben sumar entre sí.

### 2.4 Exportación a PDF y Excel, prototipada en Claude Design

- Primero se prototipan en Claude Design el PDF (portada, resumen ejecutivo y tablas) y la estructura del Excel. Se ajustan hasta tener el visto bueno:
  - reporte por proyecto: hojas Resumen, Aliados, Oportunidades, Bitácora y Tareas;
  - reporte por etiqueta: hojas Resumen, Proyectos, Clientes, Oportunidades, Bitácora y Tareas.
- La implementación reutiliza lo que ya existe: el CRM ya exporta a Excel la ficha financiera, la ficha de proyecto, el portafolio y el reporte semanal, y genera PDF desde vistas de impresión.
- Con el diseño aprobado, el mismo estilo se puede aplicar a los reportes que ya existen.

## 3. Qué ganamos con estas mejoras

| Mejora | Valor que aporta |
|---|---|
| Proyecto de posición propia con varios aliados | **Claridad sobre la meta:** en un solo lugar se ve cuánto vale el proyecto, cuánto está comprometido, cuánto falta por cubrir y quién aporta. Así se decide a qué aliado priorizar.<br>**Cifras confiables en el tablero:** el valor del proyecto no infla el pipeline, y las decisiones comerciales se toman con números reales.<br>**Memoria del proyecto:** las conversaciones con cada aliado quedan asociadas al proyecto. Si cambia la persona a cargo, el contexto no se pierde. |
| Reporte de gestión por proyecto | **Rendición de cuentas lista para enviar:** un informe con formato fijo para financiadores y aliados, sin armarlo a mano cada vez.<br>**Alertas a tiempo:** la brecha por cubrir y las tareas vencidas aparecen a la vista, no cuando ya es tarde.<br>**Menos trabajo manual:** hoy hay que filtrar por etiqueta y sumar en una hoja aparte. |
| Reporte de gestión por etiqueta | **Visión por iniciativa:** la dirección ve cómo avanza, por ejemplo, todo lo de "Reconstrucción": proyectos, clientes, oportunidades y tareas en un solo informe.<br>**Clientes desatendidos a la vista:** se resaltan los que llevan más de 15 días sin interacciones.<br>**Bajo costo:** usa datos que el equipo ya carga y las etiquetas que ya existen; solo hay que agregarlas a los proyectos. |
| Exportación a PDF y Excel prototipada en Claude Design | **Imagen profesional y consistente** con la marca en todo lo que sale del CRM.<br>**Excel útil para analizar:** montos y fechas como valores reales, que se pueden sumar y filtrar sin rehacer nada.<br>**Menos retrabajo:** el diseño se aprueba antes de programarlo. |

**Cómo medirlo:** antes de implementar, registrar cuánto tarda hoy armar un informe de proyecto o de iniciativa y con qué frecuencia se pide. Después de la entrega, comparar contra el tiempo de generarlo desde el CRM.

## 4. Fases sugeridas

| Fase | Entregable | Depende de | Tiempo estimado |
|---|---|---|---|
| 1 | Prototipos de los reportes (PDF y Excel) en Claude Design | — | Hechos. Faltan 1 a 2 días de ajustes según la revisión. |
| 2 | Etiquetas en proyectos y reporte por etiqueta, con exportación a PDF y Excel | Fase 1 | 6 a 8 días hábiles |
| 3 | Proyecto de posición propia con varios aliados, fuera de las cifras del tablero | — (puede ir en paralelo con las fases 1 y 2) | 12 a 15 días hábiles |
| 4 | Reporte por proyecto y exportación a PDF y Excel con el diseño aprobado | Fases 1 y 3 | 6 a 9 días hábiles |

El reporte por etiqueta puede salir primero porque solo necesita agregar etiquetas a los proyectos; no depende del modelo con varios aliados.

**Total estimado:** de 25 a 34 días hábiles, unas 5 a 7 semanas con una persona de desarrollo. El primer entregable visible, el reporte por etiqueta, estaría en unas 2 semanas.

Cómo se reparte el tiempo:

- **Fase 2:**
  - campo de etiquetas en proyectos (base de datos, formulario y API): 1 a 2 días;
  - consulta y pantalla del reporte: 2 a 3 días;
  - exportación a PDF y Excel, y pruebas: 3 días.
- **Fase 3:** es la más grande, porque hoy todo el módulo de proyectos supone que hay un solo cliente.
  - modelo de aliados y su gestión en la ficha del proyecto: 4 a 5 días;
  - adaptar a "varios aliados" las pantallas, filtros, cálculos y exportaciones que hoy leen el cliente del proyecto (unos 33 archivos, entre ellos el portafolio, el tablero, el reporte semanal y la ficha): 6 a 8 días;
  - pruebas: 2 días.
- **Fase 4:** reutiliza la exportación de la fase 2. Suma 1 a 2 días para que cada interacción de la bitácora pueda indicar a qué proyecto corresponde: hoy no existe ese vínculo, y el reporte lo necesita para mostrar "las interacciones con cada aliado sobre este proyecto".

Estas estimaciones incluyen las pruebas automatizadas y suponen que los prototipos se aprueban sin cambios de fondo. Se ajustan después de la fase 1.

## 5. Impacto en el CRM actual

| Área | Qué cambia | Qué no cambia |
|---|---|---|
| Proyectos existentes | Pueden recibir etiquetas, que son opcionales. | Siguen igual: mismo cliente, presupuesto, actividades y gastos. Los tipos "desde oportunidad" e "independiente" se mantienen. |
| Tablero y pipeline | Hay que verificar que los proyectos de posición propia queden fuera de las cifras. | Las cifras actuales no se mueven: siguen saliendo de las oportunidades de cada cliente. |
| Portafolio de proyectos | Los proyectos de posición propia aparecen en el portafolio. El filtro por cliente debe contemplar los proyectos con varios aliados. | El resto de los filtros y la exportación del portafolio. |
| Bitácora | Al registrar una interacción se puede indicar, de forma opcional, a qué proyecto corresponde. | Las entradas existentes y la forma de registrarlas. |
| Integraciones (API) | El cliente del proyecto deja de ser obligatorio, solo en los proyectos de posición propia. Una integración que lea proyectos debe aceptar ese caso. | El resto de la API. |
| Reportes actuales | Opcionalmente pueden adoptar el nuevo diseño más adelante. | El reporte semanal, la ficha financiera, la ficha de proyecto y el portafolio siguen funcionando igual. |
| Datos | Solo si se aprueba convertir las etiquetas actuales en proyectos (decisión 2): eso modifica datos reales. Se haría con respaldo previo y una revisión del resultado. | Todo lo demás son cambios aditivos: agregan columnas y tablas, no modifican ni borran datos. |
| Equipo | Hay que etiquetar los proyectos existentes y registrar los aliados de cada proyecto de posición propia. Una carga inicial y una explicación corta de uso. | La forma de trabajar con clientes, oportunidades, bitácora y tareas. |

**Disponibilidad:** las migraciones son aditivas, así que no se espera interrumpir el servicio durante la implementación.

## 6. Decisiones que necesitamos

1. **Aportes de los aliados:** ¿se registran como oportunidades del cliente (cuentan en el pipeline, como se propone) o solo dentro del proyecto?
2. **Etiquetas actuales:** ¿convertimos las etiquetas de los tres proyectos en proyectos de posición propia, vinculando automáticamente los clientes que hoy las tienen?
3. **Permisos:** ¿qué roles pueden crear proyectos de posición propia y vincular aliados?
4. **Reporte por etiqueta:** ¿alcanza con traer las oportunidades y la bitácora de los clientes etiquetados, o también hay que poder etiquetarlas una por una? Lo segundo es más preciso, pero suma trabajo de carga para el equipo.

## Anexo: notas técnicas (equipo de desarrollo)

- Hoy `Proyecto.cliente_id` es obligatorio, y el vínculo con la oportunidad usa la clave compuesta `(oportunidad_id, cliente_id)`. El cambio propuesto:
  - nuevo valor `POSICION_PROPIA` en `OrigenProyecto`;
  - nueva tabla `ProyectoCliente` (proyecto, cliente, rol, estado, aporte);
  - `cliente_id` pasa a opcional solo para este origen.
- Es una migración aditiva: no modifica datos de los proyectos existentes. Sí cambia el contrato de la API (`cliente_id` deja de ser siempre obligatorio). Hay unos 33 archivos, sin contar las pruebas, que leen `cliente_id` o la relación `cliente`: listados y filtros del portafolio, tablero, reporte semanal, ficha, impresión y exportaciones. Hoy `origen` se puede editar por PATCH; hay que impedir que un proyecto entre o salga de `POSICION_PROPIA`.
- Reporte por proyecto: agregar `proyecto_id` opcional a `BitacoraEntrada`, para saber sobre qué proyecto se habló con cada aliado.
- Las etiquetas existen hoy en `Cliente`, `Tarea` y `Documento`, pero no en `Proyecto`, `Oportunidad` ni `BitacoraEntrada`.
- Reporte por etiqueta: agregar `etiquetas String[] @default([])` a `Proyecto`, con el mismo patrón que `Cliente` y `Tarea`. Es una migración aditiva que no toca datos existentes. Hay que sumarla también al formulario de proyecto, a la API y al documento OpenAPI.
- Las exportaciones a Excel deben conservar la regla de encabezados prohibidos (`ENCABEZADOS_PROHIBIDOS` en `src/lib/proyectos/export-xlsx.ts`).
