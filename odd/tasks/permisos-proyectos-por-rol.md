# Permisos del módulo de Proyectos por rol

Feature: alinear la autorización del módulo de Proyectos con la matriz que definió la PO el 2026-10-19: cualquier rol
crea proyectos; Coordinador y Colaborador trabajan solo donde son integrantes; Administración y Gerencia aprueban,
validan y ven todo. Mirror de Engram: `odd/permisos-proyectos-por-rol/tasks`.

## Specs

Cada `S#` cita el pedido literal y no agrega requisitos que no estén en la matriz.

- **S1.** «cualquier rol, pueda crear un proyecto». Todo usuario autenticado y activo (Administrador, Gerencia,
  Coordinador, Colaborador) puede crear un proyecto, desde una oportunidad ganada o como independiente.
- **S2.** El creador queda como **responsable e integrante** del proyecto que crea (decisión del 2026-10-19, pregunta 1).
  Sin eso, crear y no ver lo creado sería incoherente con S3.
- **S3.** «1. ver portafolio y la pestaña de tablero, acceso: si, solo donde es integrante» y «2. ver proyectos: s1, solo
  donde es integrante». Coordinador y Colaborador ven el portafolio y los proyectos **solo donde son integrantes**;
  Administrador y Gerencia ven todo.
- **S4.** «La pestaña Tablero se muestra a Coordinador y Colaborador con cifras solo de sus proyectos» (decisión del
  2026-10-19, pregunta 3). Los indicadores agregados se calculan sobre los proyectos donde el usuario es integrante.
- **S5.** «4. editar datos generales, ambos si» y «5. cargar la estructura, ambos si», acotado a **los proyectos donde
  es integrante** (decisión del 2026-10-19, pregunta 2). Incluye presupuesto, porque el paso 4 del asistente es parte de
  la estructura y hoy comparte la misma compuerta.
- **S6.** «7. registrar avance en actividades», «8. registrar gastos», «10. subir y/o eliminar un documento» y
  «11. solicitar una modificación»: «ambos si, solo donde es integrante».
- **S7.** «6. aprobar línea base», «9. validar o rechazar un gasto» y «12. aprobar una modificación»: «ambos no». Solo
  Administrador y Gerencia. Se conserva la segregación de funciones: nadie valida un gasto que registró.
- **S8.** «Todos los clientes del CRM» al crear un proyecto (decisión del 2026-10-19, pregunta 4): Coordinador y
  Colaborador pueden **leer** cualquier cliente para elegirlo. No cambia la escritura sobre clientes ni abre el módulo
  comercial completo; la lista de oportunidades elegibles para crear sí queda disponible.
- **S9.** El **Equipo** del proyecto acepta integrantes con rol Coordinador **o Colaborador** (hoy solo Coordinador), y
  el responsable siempre es integrante.
- **S10.** La interfaz refleja las mismas reglas: botones, pestañas y estados vacíos. La autoridad sigue siendo la API;
  ninguna compuerta vive solo en el cliente.
- **S11.** Lo que la matriz no pide se conserva: la bandera gerencial sigue dando lectura de todo el portafolio, la
  administración del Equipo sigue en Administración y Gerencia, y la escritura sobre clientes y tareas del CRM no cambia.

## Tasks

- [ ] **T1** Predicados en `src/lib/permissions.ts`: creación para todos, lectura y escritura por pertenencia, roles
  integrantes, validación y aprobaciones sin cambios. Pruebas unitarias de cada predicado. Ruta I.
- [ ] **T2** Creación: `POST /api/v1/projects` y la conversión desde oportunidad aceptan cualquier rol y dejan al creador
  como responsable e integrante. `checkMiembrosValidos` acepta Coordinador y Colaborador. Ruta I.
- [ ] **T3** Lectura: lista y ficha por pertenencia para Coordinador y Colaborador; soportes financieros; clientes
  legibles para todos; oportunidades elegibles para crear. Ruta I.
- [ ] **T4** Escritura: datos generales (PATCH), estructura y presupuesto para integrantes. Ruta I.
- [ ] **T5** Ejecución: avances, gastos, documentos y solicitudes de modificación para integrantes; validación,
  línea base y aprobación de modificaciones solo Administración y Gerencia. Ruta I.
- [ ] **T6** Tablero y portafolio: indicadores agregados acotados a los proyectos donde el usuario es integrante. Ruta I.
- [ ] **T7** Interfaz: portafolio, ficha, equipo, presupuesto, gastos, documentos y modificaciones con las nuevas
  compuertas; pruebas de componente. Ruta I.
- [ ] **T8** Documentación: OpenAPI, guía de usuario (tabla de roles y anexo de la PO) y runbook si cambia un
  procedimiento; verificación completa (vitest, `tsc`, eslint). Ruta I.

## Log

- **L1 (2026-10-19, verbatim).** «ya cambie de red, mi PO, me pidió que cualquier rol, pueda crear un proyecto, que el
  rol gerente sirva mas para validar todos los registros y gastos y actividades. Ya te doy a detalle el tema de permisos
  para coordinador y colaborador: 1. ver portafolio y la pestaña de tablero, acceso: si, solo donde es integrante 2. ver
  proyectos: s1, solo donde es integrante 3. crear un proyecto: ambos si 4. editar datos generales, ambos si 5. cargar
  la estructura, ambos si 6. apribar linea base, ambos no 7. registrar avance en actividades, ambos si, solo donde es
  integrante 8. registrar gastos, ambos si, solo donde es integrante 9. validar o rechazar un gasto, ambos no 10. subir
  y/o eliminar un documento, ambos si, solo donde es integrante 11. solicitar una modificación, ambos si, solo donde es
  integrante 12. aprobar una modificacion, ambos no»
- **L2 (2026-10-19, decisiones).** Creador = responsable e integrante. Editar datos y estructura = solo donde es
  integrante. Tablero = visible con cifras solo de sus proyectos. Clientes = todos los del CRM.
- **L3 (2026-10-19, nota de riesgo).** Es un cambio de autorización en producción: se implementa en rama, con pruebas por
  compuerta, y el merge se decide aparte. «Validar actividades» no corresponde a una acción existente: hoy se validan
  gastos y se aprueban línea base y modificaciones; si la PO quiere un paso de aprobación de avances, es otra feature.
