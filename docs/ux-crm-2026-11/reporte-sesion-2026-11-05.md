# Reporte de la sesión del 2026-11-05 (hasta la madrugada del 06) — Proyectos

Dos sesiones de Claude Code trabajaron en paralelo: la **sesión A** cerró T1–T4 del traspaso (código y merges) y la
**sesión B** (esta) hizo el plan de mejoras de UI (inventario, Design System, capturas y diseños).

## 1. Código que entró a `main` hoy (sesión A)

| PR | Commit en `main` | Qué cambia para la persona usuaria | Tamaño |
|---|---|---|---|
| #145 | `1ded4dd` | AJ-01: cualquier integrante del proyecto registra avance (antes solo el responsable); el historial muestra el nombre y no un código; «90 %» como tope; atajo «Registrar avance» en la cabecera; aviso de solo consulta; KPIs del proyecto y del portafolio cuentan los reportes de avance; seed demo con los casos de la PO. | 37 archivos, +626 / −196 |
| #146 | `0726e5d` | Grupos 1 y 2 del canvas: reporte anulado sin «Adjuntar archivo»; actividad finalizada sin «Registrar avance» (con texto que explica cómo corregir); «Anular» solo en el último reporte vigente; «Registrar cantidad» en entregables; `SelectorArchivo` en español en los 9 selectores de archivo; sin títulos repetidos en Finanzas y Modificaciones; «% de lo programado» en lugar de «E/P»; barras «Ejecutado» con el color del semáforo; «Umbrales sin confirmar» con su ⓘ; periodo e IVA desglosado en la lista de gastos; contadores «Gastos · N», «Modificaciones · N», «Versiones · N». | 34 archivos, +560 / −161 |

Verificación registrada por la sesión A (`plan-verificacion-aj-y-ux.md` §6): `vitest --dir src` 4614 en verde,
`--dir scripts` 132 en verde, tsc y eslint sin errores, CI verde (unit y e2e) en #146. El e2e
`ficha-ejecucion.spec.ts` se actualizó; la sesión A no lo corrió en local.

Archivos principales: `src/components/proyectos/{ejecucion-avance,ejecucion-avance-form,project-ejecucion,
project-financiero,project-gastos,selector-archivo,adjuntar-soporte,gasto-form}.tsx`, `ficha/{ficha-header,
ficha-finanzas,ficha-historial}.tsx`, `src/lib/api/{ejecucion,kpis-portafolio}.ts`, `src/lib/proyectos/avance.ts`,
`scripts/seed-projects-demo.ts`, los diálogos de importación y los e2e de `e2e/proyectos-v2/`.

## 2. Código de esta sesión (sesión B)

No hubo cambios en `src/`. Lo único de código:

- `.claude/qa/capturar.mjs` (carpeta ignorada por git): modo nuevo `ux` que recorre 16 vistas de Proyectos
  (portafolio, tablero, nuevo proyecto, la ficha con todas sus pestañas y subpestañas, y los formularios de avance y
  gasto) en 1440 y 390 px; variable `CAP_EMAIL` para entrar con otro usuario demo. Los modos existentes no cambian.
  Corrido para Gerencia y Coordinadora: 31 de 32 capturas cada uno (falla Cronograma en móvil); salida en
  `docs/ux-crm-2026-11/capturas/ux-proyectos/{gerencia,coordinador}/`.
- Un generador del Design System en el scratchpad de la sesión (no está en el repo).

Documentos nuevos o actualizados (todos en `docs/ux-crm-2026-11/`, **sin commitear**):
`inventario-ui-proyectos.md` (nuevo), `plan-mejoras-ui-proyectos.md` (§0.1b nueva), este reporte.

## 3. Artifacts con las vistas nuevas (privados: compartir con la PO desde Share)

| Artifact | Enlace | Qué tiene |
|---|---|---|
| Canvas «Proyectos — Rediseño de usabilidad» | https://claude.ai/artifact/4iECnWb1jzLdjKvH6s4CwN | 27 tableros en 6 páginas, cada propuesta en escritorio y en móvil (390 px): Resumen y cabecera (escritorio y móvil), Actividades + **prototipo interactivo de «Registrar avance»**, Finanzas + panel de validación de gastos con el soporte, Documentos (tabla con «De dónde viene»), Historial (registro de cambios en frases, versiones y solicitudes), patrón de ayudas ⓘ y página de Novedades. Cada página: captura real «hoy», propuesta, notas «qué cambia», textos de las ⓘ y puntos para decidir con la PO. |
| Design System «Muttu Hub — Proyectos» | https://claude.ai/artifact/4pNniJhtu1ZEvmsfjt4sqi | Tokens reales de `globals.css` (claro y oscuro), tipografías, radios, espaciados, 17 componentes (réplicas estáticas) y logos. |

## 4. Hallazgos nuevos (para F2)

1. Finanzas › Gastos en escritorio se corta por la derecha: «Validar» queda fuera de la vista.
2. «Avance financiero» significa 12,5 % en el portafolio (sobre lo asignado) y 24,9 % en la ficha (sobre lo programado).
3. Resumen dice que la 1.3 va en 25 %; la lista dice 50 % real.
4. Actividad finalizada (1.1) con «Registrar cantidad» activo en sus entregables.
5. Actividades en móvil mide 403 px en 390 px.
6. Financiero «Verde · Al día» junto a «Posible retraso»; todos los rubros verdes con un gasto que supera lo asignado.
7. El asistente dice «Solo Administración y Gerencia pueden crear proyectos», pero todos los roles pueden.
8. Jerga en pantalla: «Portafolio v2», «E/A», «Umbral rojo», «Σ A», «pp», «v0», «Gantt».
9. Historial › Auditoría vuelca campos crudos («Anulado at», «Iva: $ 0», «Tercero número: ***004») y no dice a qué actividad pertenece cada avance; en escritorio quedó en marcadores de carga al capturar.
10. Historial › Versiones muestra el comparador «Desde/Hasta» con una sola versión y una caja vacía; Documentos repite la etiqueta «Enlace» en cada fila.

## 5. Estado del repo y pendientes

- Copia principal en `main` desacoplada (`0726e5d`) a propósito; stash `ux-capturas-proyectos-v3-2026-11-05-2345`
  con `odd/tasks/proyectos-v3.md`. Cómo volver: `plan-mejoras-ui-proyectos.md` §0.1b.
- Pendiente: capturas del rol colaborador; F2 (auditoría por tarea) y `ayudas-proyectos.md`; patrón ⓘ en el Design
  System; flujos 4–7 de F4; compartir ambos artifacts con la PO; decidir si `docs/ux-crm-2026-11/` se sube a una rama.
- Nada de los diseños se implementa sin el OK de la PO.

## 6. Interacciones (2026-11-06, en la oficina)

- Canvas versión 18: 33 tableros. Cada página termina con un tablero «Interacciones · <Sección>» (Resumen, Actividades,
  Finanzas, Documentos, Historial, Ayudas): por cada elemento, qué hace la persona, qué pasa, estados y mensajes,
  quién puede, cómo es en móvil y el componente actual (`Existe` / `Cambia` / `Nuevo`). Las reglas se contrastaron
  con el código; lo que no está decidido dice «Por definir con la PO».
- Fuentes de todos los tableros en `docs/ux-crm-2026-11/canvas-fuente/` (`project/` = lo publicado; publicar con
  Artifact `url` del canvas y `root` = la carpeta que contiene `project/`).
- Hallazgos del código al escribirlas: la auditoría devuelve máximo 100 movimientos sin filtros y no guarda el código
  de la actividad; el motivo de rechazo de una modificación no queda en la auditoría; la API de reportes de actividad
  no rechaza fechas futuras (solo el formulario); el tope del 90 % es un parámetro sin confirmar y solo aplica mientras
  haya entregables incompletos; las pestañas de la ficha no tienen URL propia; un COLABORADOR miembro puede solicitar
  modificaciones aunque el comentario del formulario diga que solo COORDINADOR.

### Preguntas abiertas para la PO (bloquean la implementación)

1. Validar un gasto que supera su rubro: la propuesta dice «Puedes validarlo igual», pero hoy la API lo bloquea. ¿Se permite con una marca o se mantiene el bloqueo?
2. ¿El aviso de Novedades cuándo aparece, cuándo deja de salir y su cierre se recuerda por usuario o solo en el navegador?
3. La 1.3, ¿va en 25 % o en 50 %? (Resumen y Actividades no coinciden.)
4. ¿«Subir documento» sube solo documentos del proyecto y los demás se suben desde su origen?
5. ¿El registro de cambios lo ve todo rol con acceso a la ficha o solo Coordinación y Gerencia?
6. Aprobar una modificación, ¿pide confirmación o motivo como el rechazo? ¿Dónde se abre «Ver el plan» de una versión?
7. En móvil, ¿las 5 pestañas se desplazan o se agrupan en «Más»? ¿Dónde quedan Cambiar estado, Exportar e Imprimir?
8. ¿«Registrar cantidad» se bloquea también en la API cuando la actividad está finalizada?

El detalle de cada pregunta (hasta 5 por sección) está al final de cada tablero de Interacciones.

## 7. Prototipo navegable de la ficha (2026-11-06)

- https://claude.ai/artifact/TAVwaGPYxskpaWCrTG4fJJ — las 5 pestañas (Resumen, Actividades, Finanzas, Documentos,
  Historial) y la página de Novedades, con sus interacciones funcionando sobre los datos demo de PRY-2026-001.
  Selector Escritorio / Móvil, «Ver como» por rol (Gerencia, Coordinación, Colaborador, Visualizador) y «Reiniciar
  datos». Lo que se hace en una pestaña se refleja en las demás (validar un gasto baja «Qué falta», suma a Ejecutado
  y aparece en el Historial).
- Fuentes en `docs/ux-crm-2026-11/prototipo-ficha/` (index.html, core.js, data.js, app.css, tabs/*). Publicar de
  nuevo: Artifact con `file_path` = index.html, `root` = esa carpeta, `files` con el resto y `url` del artifact.
- Validar un gasto que supera el rubro se deja hacer, como dice la propuesta, pero con la etiqueta «Hoy la API lo
  bloquea»: es la pregunta 1 para la PO.
- Las decisiones «Por definir» que el prototipo resolvió de forma provisional (orden de versiones, aprobar sin
  confirmación, colores por rubro, textos inventados de errores de gasto, etc.) deben revisarse con la PO.
