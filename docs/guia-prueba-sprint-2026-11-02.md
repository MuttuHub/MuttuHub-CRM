# Guía de prueba — sprint 28-oct a 02-nov (requisitos del jefe + doc PO v1.1)

Cubre lo construido entre el 28-oct y el 02-nov de 2026: los dos carriles de los requisitos del jefe
(etiquetas, aliados, documentos por cliente, admin, reporte semanal, pestañas) y los ajustes AJ-01 a AJ-06
del documento «Ajustes al módulo Proyectos» v1.1 (`docs/Hub-proyectos261028.docx`, pruebas del 27-oct).
Los textos entre comillas son los que renderiza la interfaz (verificados contra el código durante el
desarrollo; los mensajes de rechazo son verbatim del documento del PO; el resto se prueba paso a paso). Para el flujo general del módulo Proyectos, usar la
guía base: `docs/guia-prueba-proyectos.md`.

> **Probar todo en local.** Nunca contra Supabase remoto ni producción.
> **Actualización 2026-11-04:** producción ya tiene todas las migraciones de este sprint (gastos/IVA y
> clientes/carpetas desde el 28/29-oct; `ReporteActividad` de AJ-01 y peso por duración de AJ-02 desde el
> 2026-11-04) y el backfill de carpetas de cliente aplicado (52 documentos en 11 carpetas). Detalle en
> `odd/tasks/jefe-carril-1.md` L11 y `odd/tasks/aj01-estado-en-curso.md` L10.

> **Primera pasada automatizada (2026-11-02, por el agente):** las reglas de servidor y componentes de
> **D, E, G, H, I, J, K y L** quedaron cubiertas por sus suites (430 tests verdes en las secciones
> restantes; 1820 en las áreas tocadas hoy, eslint/tsc limpios). Lo que **sigue siendo manual** es todo
> lo visual/de navegador: formularios y modales en pantalla (E), pestañas/impresión (F y G4-G5), y los
> recorridos de UI de D/I–K/L. El detalle de lo verificado por código está en el log de la sesión; esta
> guía se recorre igual, paso a paso.

## Preparación (10 minutos)

1. Levantar el stack local de base de datos (Docker). Verificar que esté el contenedor
   `supabase_db_muttu-hub` corriendo.
2. Aplicar migraciones y verificarlas:
   ```bash
   npm run db:migrate:local
   npm run db:migrate:status:local   # debe listar todas las migraciones como aplicadas
   npm run db:generate:local
   ```
3. Cargar datos de demostración:
   ```bash
   npm run db:demo:reset:local
   npm run db:demo:seed-projects:local
   npm run db:demo:seed-flujo:local
   ```
4. Levantar la app: `npm run dev` (si el 3000 está ocupado: `npm run dev -- -p 3107`).
5. Entrar con el usuario de demo **gerencia** (para todo lo de proyectos y documentos) y luego con el
   de demo **ADMINISTRADOR** (para las secciones A, H).

---

## A. Etiquetas de tareas y clientes (jefe R1 · carril 1, 1.1 · carril 2, 2.6)

- [x] **A1.** Admin › Catálogos › crear la etiqueta «QA-01». Aparece en el listado de etiquetas.
  ✅ 2026-11-02 — hallazgo al crear: el borrador local no avisaba que faltaba «Guardar cambios» (0 PUTs); se agregó chip «Cambios sin guardar» + `beforeunload`. Re-probado y persistente.
- [x] **A2.** Abrir el Kanban y **crear/editar una tarea**: el campo **Etiquetas** ofrece «QA-01»
      **sin recargar la página** (sin F5, sin cerrar sesión).
  ✅ 2026-11-02 — el diálogo de tarea ofreció al instante las etiquetas nuevas creadas en admin («Fundación», «Cooperativa», «Social»); catálogo vivo vía `useTaskTags`.
- [x] **A3.** El filtro de etiquetas del tablero Kanban también ofrece «QA-01» sin recargar.
  ✅ 2026-11-02 — filtro ofrece las etiquetas nuevas al instante y filtra al elegirla. Observación: es de selección única → registrada como mejora UX #26 del backlog (no es bug del sprint).
- [x] **A4.** Crear/editar un **cliente**: el campo Etiquetas ofrece «QA-01».
  ✅ 2026-11-02 — el form de cliente (CRM) ofreció al instante las etiquetas nuevas, sin recargar.
- [x] **A5.** Filtrar el listado de clientes por etiqueta: muestra solo los clientes etiquetados.
  ✅ 2026-11-02 — asignada etiqueta nueva a un cliente y el filtro dejó solo el etiquetado.
- [x] **A6.** Quitar «QA-01» del catálogo y editar una tarea que la tenía guardada: la etiqueta sigue
      visible como chip seleccionable (la tarea conserva etiquetas ya guardadas aunque ya no existan
      en el catálogo).
  ✅ 2026-11-02 — se usó «Cooperativa» (el usuario creó Fundación/Cooperativa/Social en vez de QA-01): eliminada del catálogo, la tarea y el diálogo siguen mostrándola. Su sección A quedó 6/6.

> Criterio de aceptación del jefe: «en el panel de administración le muestra que se crean y están en el
> listado de etiquetas, pero no aparecen al momento de crear un cliente o asignar una tarea». Si al
> crear una etiqueta en admin NO aparece sin recargar en A2/A3/A4, es bug del sprint; reportar.

## B. Tipo de cliente «Aliado estratégico» (jefe R1 · carril 1, 1.0/S2)

- [x] **B1.** Crear/editar un cliente: el campo tipo ofrece **«Aliado estratégico»**. Guardar puede ser
      «Aliado estratégico» en la ficha del cliente.
- [x] **B2.** Listado de clientes: se puede filtrar por tipo y el cliente aliado aparece.
  ✅ 2026-11-02 — B1 y B2 en verde según el tester (campo tipo ofrece, guarda y filtra). Sección B cerrada 2/2.

## C. Documentos por cliente: carpetas, subida y arrastre (jefe R1 · carril 1, 1.2–1.4)

> **Interfaz 2026-11-02 (explorador):** árbol en el panel izquierdo (clic derecho para
> renombrar/mover/eliminar y arrastrar carpetas para ordenar la jerarquía); barra de ruta con
> **Atrás/Adelante** arriba; buscador + **Filtros** sobre los **iconos de carpetas**; listado de
> documentos debajo. La vinculación al cliente se elige al crear la carpeta (Cliente opcional).

- [x] **C1.** Documentos › **«Nueva carpeta»**: nombrarla como el cliente «Gobernación de Bolívar» (o el
      demo), elegir **Cliente (opcional)** = ese cliente y **Crear carpeta**. Queda en el árbol general
      (con jerarquía si es subcarpeta) y marcada como carpeta de ese cliente (icono verde).
      *2026-11-02: rediseño por decisión del tester — se eliminó el botón «Carpeta de cliente» y su
      diálogo; todas las carpetas viven en el listado/árbol general y la vinculación al cliente se elige
      al crear la carpeta.*
      ✅ 2026-11-02 — el tester la creó con cliente y apareció en árbol + grid con su marca.
- [x] **C2.** Entrar a esa carpeta (clic en su **icono del grid** o en el árbol) y subir un documento.
      Queda **dentro de esa carpeta para ese cliente** (no en «Todas»). Verificar el chip del cliente
      en el detalle del documento.
      ✅ 2026-11-02 — subida dentro de «Gobernación de Sierra Verde» con aviso carpeta+cliente, aparece
      sin F5 (luego del fix de raíz `sin_carpeta`), chip del cliente en el detalle y **no** aparece en
      la raíz.
- [x] **C3.** Arrastrar desde el escritorio **2 o 3 archivos** sobre la carpeta del cliente en el árbol
      (o sobre el listado con la carpeta abierta). Se suben todos a esa carpeta y quedan ligados al
      cliente. Se muestra **un solo toast resumen** del lote, no uno por archivo.
      ✅ 2026-11-02 — 3 archivos soltados sobre el tile de «Gobernación de Sierra Verde»: diálogo de lote,
      un solo aviso, los 3 adentro y ligados al cliente.
- [x] **C4.** Arrastrar un documento **existente** (por el asa de movimiento) sobre la carpeta del
      cliente: se mueve a esa carpeta y **además se le asigna el cliente** automáticamente.
      ✅ 2026-11-02 — «Manual de identidad corporativa» arrastrado del grid a la carpeta: DB confirma
      `carpeta = Gobernación de Sierra Verde` y `clientes = Gobernación de Sierra Verde` (sin tocar nada más).
- [x] **C5.** Soltar un documento sobre la raíz donde ya está («Todas») no hace nada (sin petición ni
      toast). En vista Lista, arrastrar y soltar fuera de toda carpeta tampoco lo mueve; soltar archivos
      del escritorio en un área vacía abre el diálogo de subida (no navega fuera de la app).
      ✅ 2026-11-02 — no-ops confirmados por el tester; el drop en vacío abre «Subir documento»
      (se agregó red de seguridad al drop para no salir de la app).
- [x] **C6.** Subir dos veces el mismo archivo con el mismo título en la misma carpeta: el segundo
      intento muestra el banner de duplicado con la opción «Crear aparte» (y no rompe nada).
      ✅ 2026-11-02 — el banner ofrece «Crear aparte» y «Nueva versión»; probado «Crear aparte», quedan
      los dos documentos sin error.
- [x] **C7.** **Caso del jefe reproducido:** con la carpeta del cliente abierta en el árbol, subir un
      archivo → queda dentro de esa carpeta y ligado al cliente (no en «Todas»).
      *Aclaración 2026-11-02: subir sin ninguna carpeta abierta (vista «Todas») mantiene el
      comportamiento previo — el fix garantiza que con la carpeta del cliente activa el archivo NO se
      escape a «Todas».*
      ✅ 2026-11-02 — cubierto por C2/C3/C6: todas las subidas dentro de «Gobernación de Sierra Verde»
      quedaron ahí, ligadas al cliente y fuera de la raíz.
- [x] **C8.** **Explorador (NUEVO 2026-11-02):** abrir una carpeta desde los **iconos del grid** → la
      barra de ruta muestra `Todas › <carpeta>` (con los niveles previos si hay subcarpetas) y el grid
      muestra **solo sus subcarpetas**. **Atrás** vuelve a la vista anterior y **Adelante** regresa;
      clic en un segmento del medio de la ruta salta a ese nivel.
      ✅ 2026-11-02 — con `Todas › Gobernación de Sierra Verde › Subcarpeta C10`: atrás/adelante y salto
      por segmento en verde.
- [x] **C9.** **Jerarquía arrastrando (NUEVO):** arrastrar una carpeta sobre otra → queda adentro
      (subcarpeta) y se ve el nivel en el árbol. Arrastrarla de vuelta a **«Todas»** (o «Mover…» →
      **«Raíz del repositorio»**, que debe quedar **marcada**) → vuelve al nivel superior. Soltar una
      carpeta dentro de su propia rama → no debe hacer nada (guarda de ciclo).
      ✅ 2026-11-02/03 — cerrado por el tester (arrastre y retorno a raíz funcionando con el explorador).
- [x] **C10.** **Crear subcarpeta y redirigir (NUEVO):** con una carpeta abierta, «Nueva carpeta» →
      elegir **«Dentro de» = Raíz del repositorio** → se crea en la raíz (no dentro de la abierta). Y
      «Mover…» de una carpeta anidada a la raíz envía el cambio de verdad (la carpeta se mueve).
      ✅ 2026-11-02 — subcarpeta dentro de Gobernación, «Suelta C10» redirigida a la raíz y «Mover…» a
      raíz funcionando. Extra: crear carpeta con nombre repetido en el mismo nivel ahora se bloquea con
      aviso (validación UI).

## D. Adjunto de tarea → carpeta del cliente (jefe R1 · carril 1, 1.4)

- [x] **D1.** Crear una tarea con cliente «Gobernación…» y adjuntar un PDF. El documento aparece en
      **Documentos › carpeta de ese cliente**, ligado al cliente.
      ✅ 2026-11-03 — verificado: el espejo aparece en la carpeta del cliente. Hallazgos de la misma
      prueba (corregidos): el diálogo de tarea perdía el título al reabrir una tarea en caché (fix
      `lastKey`) y no había forma de eliminar un adjunto (agregado DELETE con confirmación; baja también
      el espejo del Repositorio).
- [x] **D2.** Crear una tarea sin cliente con adjunto: el documento aparece en «Todas» (comportamiento
      previo, sin cambio).
      ✅ 2026-11-03 — verificado: el espejo queda suelto en la raíz, sin cliente.

## E. Modales revisados (carril 1, 1.5 · carril 2, 2.7)

Documentos:
- [x] **E1.** Crear/cambiar el nombre de la carpeta pulsando **Enter** rápido dos veces: **no** se
      crean dos carpetas y no se rompe el diálogo.
      ✅ 2026-11-03 — tester: crear y renombrar con doble Enter dejan una sola carpeta; DB local
      confirma una única fila viva («Prueba E1 Renombrada»).
- [x] **E2.** En la subida, **nueva versión** y los otros 5 diálogos de carpeta: **Cancelar** queda
      deshabilitado mientras corre la petición; si la petición falla, el diálogo queda abierto con el
      error visible.
      ✅ 2026-11-03 — tester, con DevTools: «Slow 3G» deja Cancelar deshabilitado en Nueva carpeta,
      Cambiar nombre, Mover, Eliminar, Subir documento y Nueva versión; «Offline» deja el diálogo
      abierto con el error visible.
- [x] **E3.** Abrir «Nueva versión» de un documento, cancelar y volver a abrir: el diálogo NO recuerda
      el archivo elegido anteriormente (se borra al cerrar).
      ✅ 2026-11-03 — tester: al reabrir «Nueva versión» el diálogo no conserva el archivo anterior.

Clientes / proyectos / admin:
- [x] **E4.** En la ficha de cliente no hay **modales apilados** (overlay dentro de otro).
      ✅ 2026-11-03 — tester: Esc en Editar y Cancelar en Desactivar cierran solo el diálogo hijo; los
      diálogos de contacto, oportunidad, compromiso e interacción cierran sin dejar overlay.
- [ ] **E5.** En Proyectos/Admin: la **eliminación de estructura** pide confirmación; el diálogo
      «Solicitar modificación» tiene su **Cancelar**; y los diálogos de documentos deshabilitan
      Cancelar mientras corre la petición.

## F. Nada abre pestañas nuevas (jefe R1/R2 · carril 2, 2.4)

- [ ] **F1.** Seleccionar un proyecto del listado lo abre **en la misma pestaña del navegador** (no
      Ctrl+clic, no clic central, clic normal).
- [ ] **F2.** Las vistas de impresión del Kanban y de Reportes abren en la **misma pestaña** con botón
      **«Volver»** para regresar.
- [ ] **F3.** Descargar un archivo adjunto (gasto, documento): **descarga directa**, sin abrir pestaña
      nueva.
- [ ] **F4.** Enlaces externos (Drive, etc.) **siguen abriendo pestaña nueva** — comportamiento
      esperado (A4 del plan), no es bug.

## G. Reporte semanal (jefe R1 · carril 2, 2.5)

- [ ] **G1.** Reportes › **pestaña «Semanal»**: muestra portafolio con semáforo por proyecto y cliente,
      % de avance, presupuesto **asignado / programado / ejecutado**.
- [ ] **G2.** El reporte incluye: actividades atrasadas, tareas cerradas y atrasadas **esta semana vs
      la semana previa**, sección **«Requiere atención»** y gastos pendientes de validación.
- [ ] **G3.** Exportar el periodo del reporte a **Excel**.
- [ ] **G4.** Vista de impresión del reporte semanal en `/print/reportes/semanal`, en la misma pestaña
      con botón «Volver».
- [ ] **G5.** El export de Excel de **Tareas** respeta el periodo/filtro seleccionado (arreglo del
      sprint; antes ignoraba el periodo).

## H. Administración: usuarios y municipios (jefe R1 · carril 2, 2.2–2.3)

- [ ] **H1.** Admin › usuarios: **editar el nombre** de un usuario y guardar; se refleja en el listado.
- [ ] **H2.** Cambiar el **rol** y las banderas del usuario; verificar que afecta el acceso al volver a
      loguear (probar siempre con DOS cuentas para no bloquear la sesión).
- [ ] **H3.** **Desactivar** y luego **reactivar** un usuario.
- [ ] **H4.** **Reenviar invitación / restablecer contraseña**: aparece un diálogo con el **link para
      copiar** (no llega por email: el sistema no tiene envío saliente configurado).
- [ ] **H5.** Intentar degradar o desactivar **al último ADMINISTRADOR**: debe bloquearse con aviso
      (guard de seguridad del sistema, sigue vigente).
- [ ] **H6.** Admin ya **NO muestra la lista inmensa de municipios**; los selectores de municipio en
      formularios siguen leyendo la API y funcionan.

---

## I. AJ-01 — Estado «En curso» con reporte de avance (PO v1.1, pag. AJ-01)

Los casos «Se acepta si» del documento, con los mensajes verbatim:

- [ ] **I1.** Actividad «Sin iniciar» con un reporte de avance de **30 %**: queda **En curso** con 30 %.
- [ ] **I2.** Después del 30 %, se aceptan **70 %** y luego **90 %**; el historial muestra los tres
      reportes con sus observaciones (fecha, porcentaje, observación, usuario).
- [ ] **I3.** Con avance actual de 70 %, un nuevo reporte de 70 % o de 50 % se rechaza con el mensaje
      > «El avance debe ser mayor que el último reportado (70 %)».
- [ ] **I4.** Con entregables incompletos, se acepta **90 %** y se rechaza 95 % con el mensaje
      > «El avance máximo sin entregables completos es 90 %».
      (El tope se configura en la administración; valor inicial 90 %.)
- [ ] **I5.** Con 1 de 2 entregables completos la actividad **no** pasa a Terminada. Con los dos
      completos (meta 100 % y medio de verificación) pasa a **Terminada** y 100 % automáticamente.
- [ ] **I6.** No debe poder guardarse un avance **sin porcentaje** o **sin observación**.
- [ ] **I7.** La observación obligatoria explica porqué del avance (p. ej. «Se realizaron los 2
      talleres; pendiente acta firmada y listado de asistencia»).

## J. AJ-02 — Ponderación por duración (PO v1.1, pag. AJ-02)

- [ ] **J1.** Actividad de **4 semanas al 20 %** y actividad de **2 semanas al 100 %**: el avance del
      proyecto mostrado es **47 %** (aprox). Fórmula: Σ(peso × avance) / Σ pesos → (4×0.20 +
      2×1.00)/6 = 0.467.
- [ ] **J2.** El peso de cada actividad es su duración en semanas y **no es editable** en ningún
      formulario (no aparece un input de peso; si la plantilla importada trae columna Peso, se ignora).

## K. AJ-03 — Atraso por ejecución, no por soportes (PO v1.1, pag. AJ-03)

- [ ] **K1.** Actividad programada hasta la semana 6 con **90 % reportado en la semana 6** y que pasa a
      Terminada en la semana 8 (por los soportes): cuenta como **ejecutada a tiempo**. Su atraso por
      los soportes NO la marca amarilla/roja.
- [ ] **K2.** Actividad programada hasta la semana 6 con solo **50 % en la semana 6**: NO está a
      tiempo (aparece atrasada).

## L. Gastos: IVA, periodo y soportes (PO v1.1, AJ-04/AJ-05/AJ-06, entregados #99/#108)

- [ ] **L1.** Registrar un gasto: hay campos **Subtotal**, **IVA** y **Total**; el Total es **calculado
      por el sistema** (no digitable). Ejemplo del doc: Subtotal 1.000.000 + IVA 190.000 → el rubro
      registra **1.190.000 ejecutados**.
- [ ] **L2.** El IVA puede ser **0** (por ejemplo, cuenta de cobro de persona natural).
- [ ] **L3.** El **periodo** del gasto se llena con el mes de la fecha del documento (fecha
      28/10/2026 → periodo `2026-10`) sin tocar nada; si se cambia la fecha, el periodo se actualiza.
- [ ] **L4.** Si se edita a mano el periodo (por ejemplo, `2026-12` para un doc de octubre), el gasto
      queda con la marca **«Periodo modificado»**.
- [ ] **L5.** Cada gasto acepta **varios archivos y varios enlaces** (de Drive, etc.) como soporte; el
      botón «Adjuntar archivo» es un **botón visible** (no texto plano).
- [ ] **L6.** Un entregable con 3 archivos y 1 enlace de verificación muestra los 4.

---

## Registro de hallazgos (para la mejora futura del jefe R5)

> El jefe pidió: «Si logras encontrar algún otro fallo de ux o ui coméntamelo y lo guardamos como
> mejora futura». Las mejoras ya detectadas y su prioridad viven en
> `docs/pendientes/mejoras-ux-reunion-2026-10-28.md` (ítems 1–20). Los marcados allá son defectos del
> backlog, no bugs del sprint. Si en el testeo hoy aparece otro fallo, anotarlo abajo y lo agregamos al
> backlog: no se arregla en el vuelo.

(Espacio libre — cualquier hallazgo de hoy, con captura si se puede:)

- (vacío, sin hallazgos aún)

## Después del testing

Al terminar, completar estas tres cosas (me lo pide el jefe o la PO para cerrar el ciclo):

1. **Aplicar la migración a producción**, la de `ReporteActividad` (AJ-01) y la de carpetas
   («20261029120000_jefe_clientes_aliados_carpetas»), cada una por separado como se hizo con #99.
2. **Backfill de carpetas de cliente en producción** — la prueba en seco local contó 33 docs
   espejados en 4 clientes y 4 carpetas por crear; en prod se corre aparte (tu decisión).
3. **Decisión de producto**: categoría por defecto al soltar un archivo sin categoría (hoy el drop
   abre siempre el diálogo de subida; fue el único pacto con find que quedó pendiente del 28-oct).
