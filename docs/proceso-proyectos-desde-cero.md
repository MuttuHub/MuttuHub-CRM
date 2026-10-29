# El proceso de un proyecto, de principio a fin

Este documento explica, de forma general, cómo nace un proyecto en Muttu Hub, cómo se arma su presupuesto y su
estructura de trabajo, y cómo se le hace seguimiento semana a semana hasta que termina. No reemplaza el manual
técnico del módulo (`docs/guia-uso-proyectos-v2.md`) ni la guía paso a paso de creación
(`docs/paso-a-paso-crear-proyecto.md`): es el mapa general antes de entrar al detalle de pantallas y botones.

Versión: 2026-10-28. Verificado contra el código del módulo **Proyectos** en esa fecha.

---

## 1. El ciclo de vida en una imagen

Un proyecto pasa por cinco estados. El camino normal es lineal; **Suspendido** y **Cancelado** son desvíos que
Administrador o Gerencia activan a propósito, en cualquier momento de la ejecución:

**Borrador → En ejecución → Cerrado**, con dos salidas posibles desde En ejecución: **Suspendido** (temporal, se
reactiva) y **Cancelado** (definitivo, sin vuelta atrás). La tabla completa de quién puede pasar a dónde está en la
sección 7.

En palabras simples:

- **Borrador**: se está armando. Todo se puede editar libremente. Desde aquí solo se puede **cancelar** o **aprobar
  la línea base**.
- **En ejecución**: el proyecto está vivo. Se registran avances y gastos, y los semáforos empiezan a hablar. Desde
  aquí se puede **suspender**, **cerrar** o **cancelar**.
- **Suspendido**: congelado temporalmente (por ejemplo, mientras se resuelve algo con el cliente o el financiador).
  Se puede **reactivar** (vuelve a En ejecución) o **cancelar**.
- **Cerrado**: terminó. Queda de solo lectura, pero se puede **reabrir** si hace falta corregir o completar algo.
- **Cancelado**: es el único estado sin salida. No se puede deshacer.

Solo **Administrador** o **Gerencia** cambian el estado, y siempre con un **motivo** obligatorio que queda en el
historial de auditoría del proyecto.

---

## 2. Antes de que exista el proyecto: la oportunidad comercial

La mayoría de los proyectos nace de una **oportunidad** que ya se trabajó en el CRM (ficha del cliente →
Oportunidades) y que llegó al estado **Ganada**. Convertir esa oportunidad en proyecto:

- precarga el **cliente**, el **nombre** y el **valor estimado**;
- deja la oportunidad enlazada al proyecto (no se puede volver a usar para crear otro);
- es el camino recomendado, porque mantiene la trazabilidad comercial completa.

También existe el camino de **proyecto independiente**, para trabajo que no nace de una oportunidad del CRM (se
elige el cliente a mano). Ambos caminos llegan al mismo asistente de creación.

---

## 3. Crear el proyecto: cinco pasos hasta tener un borrador completo

La creación es un asistente de cinco pasos (**General → Metas → Cronograma → Presupuesto → Revisión**). Solo
**Administrador** y **Gerencia** pueden crear proyectos.

| Paso | Qué se define | Notas |
|---|---|---|
| 1. General | Cliente u oportunidad, nombre, responsable, valor total, fechas, meta de beneficiarios, líneas estratégicas, municipios | Al guardar, el proyecto nace en **Borrador** con un código automático (`PRY-2026-001`, por ejemplo). Este paso no se repite. |
| 2. Metas | Objetivos, actividades (con semana de inicio y fin), entregables e indicadores | A mano, con una plantilla Excel genérica, o importando directamente el Excel de estructura de la PO (no toca el presupuesto). |
| 3. Cronograma | Solo lectura: cronograma por semanas y Gantt | Se arma automáticamente con lo cargado en el paso 2. |
| 4. Presupuesto | Monto asignado por rubro (catálogo R01 a R15) y su programación mes a mes | La suma de los rubros debe igualar el valor total del proyecto. |
| 5. Revisión | Resumen de todo lo anterior | Desde aquí se **aprueba la línea base** o se **guarda el borrador** para continuar después. |

Mientras el proyecto está en Borrador se puede editar todo sin restricciones: estructura, presupuesto, fechas,
equipo. Esa libertad se pierde en cuanto se aprueba la línea base.

---

## 4. Aprobar la línea base: el punto sin retorno

Aprobar la línea base es lo que convierte un borrador en un proyecto que se está ejecutando de verdad. Antes de
dejar aprobar, el sistema revisa que el proyecto tenga:

- valor total mayor que cero y fechas válidas;
- meta de beneficiarios mayor que cero;
- al menos un objetivo, con sus actividades y entregables;
- el presupuesto exactamente igual al valor total;
- la programación mensual cuadrada con lo asignado por rubro;
- ningún rubro suspendido con dinero asignado.

Si falta algo, el sistema lista exactamente qué falta y no deja seguir. Al aprobar:

- la **estructura** y el **presupuesto** quedan congelados como la versión `v0` (la foto de referencia);
- el proyecto pasa a **En ejecución**;
- **no se puede deshacer**. Cualquier cambio después de este punto se pide como **solicitud de modificación**
  (sección 6).

---

## 5. En ejecución: el seguimiento semanal

Una vez aprobada la línea base, el trabajo diario y semanal gira en torno a tres cosas: **avance de actividades**,
**gastos** y **semáforos**.

### 5.1 Avances

Cada actividad se sigue desde **Registrar avance**: fecha (no puede ser futura), porcentaje de avance y un **medio de
verificación** (archivo o enlace) que respalde ese avance. Si el avance supera lo planeado, hay que explicar por qué
(**justificación del exceso**). Ese soporte queda visible en la pestaña **Documentos** del proyecto.

### 5.2 Gastos

Cada gasto se registra con su **rubro**, **Subtotal**, **IVA** y **Total** (el Total lo calcula el sistema; el IVA
puede ser cero, pero hay que escribirlo), la fecha del documento, el periodo contable y un **soporte obligatorio**
(factura, cuenta de cobro u otro). Sin soporte, el gasto no se puede registrar ni validar.

La validación tiene un control de doble llave: **quien registra un gasto nunca puede validarlo**, ni siquiera un
administrador sobre su propio registro. Lo valida o rechaza otro Administrador o Gerencia, con motivo si lo rechaza.

### 5.3 Semáforos y «Requiere atención»

Cada proyecto en ejecución muestra dos semáforos en su encabezado:

- **Semáforo técnico**: qué tan al día va el avance de actividades y entregables.
- **Semáforo financiero**: qué tan alineado está el gasto frente al presupuesto y su programación mensual.

Cada semáforo (Al día, Atención, En riesgo) lleva directo a la pestaña que explica la causa. El bloque **Resumen →
Requiere atención** junta todo lo que necesita acción —gastos pendientes de validar, programación sin cuadrar,
rubros sobreejecutados— ordenado por gravedad, para no tener que recorrer todas las pestañas buscando qué falta.

### 5.4 Rutina recomendada

- **Cada semana**: revisar «Requiere atención», registrar avances con su soporte, registrar gastos con su soporte,
  validar o rechazar los gastos pendientes, y revisar los semáforos en rojo.
- **Cada mes**: comparar la ficha financiera contra la línea base (`v0`) y ajustar lo que corresponda con una
  solicitud de modificación.

---

## 6. Cambios después de la línea base: las modificaciones

Después de aprobada la línea base, la estructura y el presupuesto no se editan directamente. Un integrante del
equipo **solicita una modificación**; queda en una cola con estado **Pendiente**, y solo Administrador o Gerencia la
**aprueba** o la **rechaza** (con comentario si la rechaza). Mientras está pendiente, el cambio no se aplica. Cada
versión aprobada queda comparable campo a campo contra la anterior en **Historial → Versiones**.

---

## 7. Suspender, reactivar, cerrar, reabrir o cancelar un proyecto

Esta es la pieza que hasta ahora faltaba y que el jefe pidió directamente: poder cambiar el estado del proyecto
desde la interfaz, sin tocar la base de datos. Ya está disponible. Solo Administrador o Gerencia, desde el botón
**Cambiar estado** en el encabezado de la ficha, con un motivo obligatorio.

| Si el proyecto está en... | Puede pasar a... |
|---|---|
| Borrador | Cancelado |
| En ejecución | Suspendido, Cerrado o Cancelado |
| Suspendido | En ejecución (reactivar) o Cancelado |
| Cerrado | En ejecución (reabrir) |
| Cancelado | Ningún otro estado: es definitivo |

**Qué cambia al suspender o cerrar un proyecto:** se congela. No se pueden registrar avances, gastos ni documentos
nuevos, y no se pueden aprobar ni rechazar modificaciones o gastos pendientes mientras dure esa suspensión o cierre.
La única excepción son las **anulaciones** de gastos ya registrados, que siguen permitidas en cualquier estado como
corrección auditada. Todo cambio de estado, con su motivo y quién lo hizo, queda en **Historial → Auditoría**.

---

## 8. Quién hace qué

| Acción | Administrador | Gerencia | Coordinador | Colaborador |
|---|---|---|---|---|
| Crear un proyecto | Sí | Sí | Sí | Sí |
| Editar estructura y presupuesto (solo en Borrador) | Sí | Sí | Sí, si es del equipo | Sí, si es del equipo |
| Aprobar la línea base | Sí | Sí | No | No |
| Registrar avances y gastos | Sí | Sí | Sí, si es del equipo | Sí, si es del equipo |
| Validar o rechazar un gasto (nunca el propio) | Sí | Sí | No | No |
| Solicitar una modificación | — | — | Sí, si es del equipo | Sí, si es del equipo |
| Aprobar una modificación | Sí | Sí | No | No |
| Cambiar el estado del proyecto (suspender, cerrar, cancelar, etc.) | Sí | Sí | No | No |

Un Coordinador o un Colaborador que **no** es integrante del proyecto no lo ve, ni siquiera con el enlace directo. La
pertenencia al **Equipo** del proyecto es lo que abre o cierra el acceso para esos dos roles.

---

## 9. Dónde se ve el panorama completo

- **Proyectos → Portafolio**: la lista completa con filtros por estado, cliente, línea, municipio y responsable, y
  los indicadores agregados arriba (totales por estado, avance técnico y financiero).
- **Proyectos → Tablero**: la vista gerencial agregada (solo visible según el rol o la bandera de Gerencia).
- Cada proyecto se puede **exportar a Excel** o **imprimir / generar PDF** desde su propia ficha.

---

## 10. Glosario mínimo

- **Línea base**: la foto aprobada de la estructura y el presupuesto (versión `v0`).
- **Rubro**: categoría de gasto del catálogo (R01 a R15).
- **Asignado / Programado / Ejecutado**: lo que el presupuesto destina a un rubro, cómo se reparte por mes, y lo
  efectivamente gastado y validado.
- **Semáforo técnico / financiero**: el estado de avance de actividades o de ejecución presupuestal.
- **Modificación**: el cambio solicitado y aprobado después de la línea base.
- **Medio de verificación**: el archivo o enlace que respalda un avance.

---

## 11. Para profundizar

- Manual completo, pantalla por pantalla: `docs/guia-uso-proyectos-v2.md` (versión navegable:
  `docs/guia-uso-proyectos-v2.html`).
- Guía de creación con cada campo y mensaje de validación: `docs/paso-a-paso-crear-proyecto.md`.
