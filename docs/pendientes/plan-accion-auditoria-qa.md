# Plan de acción — Auditoría QA (informe de Felipe) + feedback adicional

> Origen: `Informe_QA_Muttu_Hub.pdf` (validación del 14 de agosto de 2026, checklist
> 48/2/5 sobre 55 puntos, sección 3 "Hallazgos críticos") + feedback del dueño del
> producto sobre el Tablero del equipo y el Repositorio de Documentos (18 de agosto
> de 2026). Verificado contra el código real antes de escribir este plan — el
> estado de cada punto refleja lo que hay en el repo, no lo que dice el informe.

---

## Resumen de estado (verificado en código)

| # | Hallazgo | Origen | Estado |
|---|---|---|---|
| 1 | Kanban: copy "solo título obligatorio" vs responsable forzado | Informe | ✅ Cerrado — responsable obligatorio confirmado por el dueño |
| 2 | Documentos: categoría "Comercial" inválida | Informe | ✅ Arreglado |
| 3 | CRM: sin edición inline | Informe | ✅ Arreglado (Lote 3) |
| 4 | Documentos: sin detección de duplicados por nombre | Informe | ✅ Arreglado (Lote 4) |
| 5 | CRM: falta "Cargar desde Brief existente" | Informe | ✅ Arreglado (Lote 6) |
| 6 | CRM: sin exportar ficha individual a PDF | Informe | ✅ Arreglado (Lote 1) |
| 7 | Selects: UUID/enum crudo en vez de nombre legible | Informe (ampliado) | ✅ Arreglado (Lote 2) — fix centralizado, ~10 sitios de una vez |
| 8 | Kanban: fecha de entrega no se guarda | Informe | ✅ Verificado (Lote 5) — funciona, con test de regresión |
| 9 | Seguridad: bitácora solo cubre login | Informe | ✅ Arreglado (Lote 7) |
| 10 | Filtros del Tablero del equipo no entran en una fila | Usuario | ✅ Arreglado (Lote 1) |
| 11 | Filtros del Repositorio de Documentos, mismo problema de ancho | Usuario | ✅ Arreglado (Lote 1) |
| 12 | Adjuntos de tarea no aparecen en el Repositorio de Documentos | Usuario | ✅ Arreglado (Lote 8) |

---

## Priorización en lotes

Ordenado por relación esfuerzo/impacto. Los Lotes 1 y 2 son la continuación
directa de lo ya empezado (bugs 1 y 2, sin commitear todavía).

### Lote 1 — Quick wins (bajo esfuerzo, alto impacto visible)

**1.1. Botón de exportar ficha individual a PDF (#6)**
- El backend ya existe: `src/app/print/clientes/[id]/page.tsx` + `PrintFicha`
  (`src/components/crm/print-ficha.tsx`).
- Falta: agregar el botón "Exportar PDF" en `src/components/crm/client-sheet.tsx`
  que haga `window.open` a `/print/clientes/{id}` (mismo patrón que ya usa
  `client-list.tsx:384` para el listado completo).

**1.2. Ancho de filtros — Tablero del equipo y Repositorio de Documentos (#10, #11)**
- Mismo bug, dos archivos: `SEL_CLASS` en `src/components/kanban/kanban-board.tsx:648`
  y `SELECT_CLASS` en `src/components/documents/repository-list.tsx:301` usan
  `w-full` dentro de un contenedor `flex flex-wrap`, así que cada select reclama
  el 100% del ancho disponible y empuja al siguiente a la línea de abajo.
- Fix: reemplazar `w-full` por `flex-1 basis-0 min-w-[Npx]` (el mínimo que ya
  tiene cada select) en ambas clases, para que compartan el espacio en vez de
  competir por él.

### Lote 2 — Fix centralizado de Selects (#7)

- Causa raíz: `src/components/ui/select.tsx` nunca pasa `items` (ni un
  `itemToStringLabel`) al `Select` de `@base-ui/react`, así que `SelectValue`
  no puede resolver el label del value ya seleccionado y muestra el valor
  crudo (UUID, o el enum en mayúsculas tipo `"ALTA"`).
- Fix: hacer que el wrapper derive `items`/`itemToStringLabel` a partir de los
  `SelectItem` renderizados (o exigir que cada consumidor pase
  `items={[{value, label}]}` explícitamente).
- Arreglarlo una sola vez en `ui/select.tsx` resuelve los ~10 sitios afectados:
  `kanban-board.tsx` (filtros Responsable/Cliente), `task-dialog.tsx`
  (Responsable/Cliente), `crm/task-dialogs.tsx`, `crm/client-form.tsx`,
  `crm/client-list.tsx` (filtro Responsable), `documents/upload-dialog.tsx`
  (Cliente), `documents/repository-list.tsx` (Autor/Cliente),
  `reportes/reportes-page.tsx` (Responsable).
- Al tocar un componente base compartido, correr toda la suite de Vitest de
  componentes tras el cambio (no solo los archivos tocados).

### Lote 3 — CRM: edición inline (#3) ✅ CERRADO

- Todos los campos propios del cliente en la pestaña General son ahora
  editables sin abrir el modal "Editar cliente" (que se mantiene disponible
  para editar varios campos a la vez). Cada campo hace su propio PATCH
  parcial vía `useUpdateClient` — no hay un "guardar todo" separado.
- Texto (nombre, empresa, tamaño, ubicación, canal) y fecha (primer contacto):
  texto estático que se vuelve input al hacer clic; guarda al perder el foco
  o con Enter, Escape cancela.
- Textarea (prioridades identificadas, riesgos, resumen): mismo patrón con
  `<textarea>`.
- Catálogo (tipo, estado, prioridad, responsable): directamente un `Select`
  inline (ya es en sí mismo "un clic para cambiar", sin paso de edición
  separado); prioridad tiene una opción "Sin prioridad" para volver a null.
- **Quedan de solo lectura a propósito**: "Valor potencial" y "Compromisos
  abiertos" — son agregados calculados (suma de oportunidades / conteo de
  compromisos), no columnas propias de Cliente; no tiene sentido "editarlos".
- El tipo `ClientInput` (src/hooks/crm.ts) se amplió para aceptar `null`
  explícito en los campos de texto libre — el PATCH del servidor ya lo
  soportaba para vaciarlos, pero el tipo del cliente no lo reflejaba
  (`undefined` se omite del JSON y el servidor lo lee como "no tocar").
- Tests: nuevo `client-sheet.test.tsx` (guardar texto al perder foco, cancelar
  con Escape, guardar un select de catálogo al toque). Validé rompiendo a
  propósito el guardado del select antes de confiar en el test.

### Lote 4 — Documentos: detección de duplicados por nombre (#4) ✅ CERRADO

- Servidor: `POST /api/v1/documents` busca un documento activo con el mismo
  título (case-insensitive) antes de crear; si existe y el form no manda
  `force=true`, responde 409 `CONFLICT` con `{ documento: { id, titulo } }` en
  vez de crear un duplicado.
- Cliente: `useUploadDocument` distingue ese 409 (nueva `DocumentDuplicateTitleError`,
  sin toast) del resto de errores. `UploadDocumentDialog` muestra un banner de
  advertencia con dos acciones: "Subir como nueva versión" (reusa
  `useUploadVersion` contra el documento existente, el mismo flujo manual que
  ya funcionaba desde la ficha) o "Crear aparte" (reenvía con `force: true`).
- Tests: `documents/route.test.ts` (409 + bypass con force) y nuevo
  `upload-dialog.test.tsx` (banner, versionar, crear aparte) — validé que el
  test de "Crear aparte" falla si se quita `force: true` antes de confiar en
  él.

### Lote 5 — Kanban: verificación de fecha de entrega (#8) ✅ CERRADO

- Revisé el circuito completo a mano: input (`task-dialog.tsx:325-330`,
  controlado, `onChange` correcto) → payload del POST (`fecha_entrega:
  form.fecha_entrega || null`) → schema zod + `parseDate` → `db.tarea.create`
  (`tasks/route.ts:237-240`) → `TASK_SELECT` incluye `fecha_entrega: true` →
  `toTaskItem` la devuelve en la respuesta. No encontré ningún punto donde se
  pierda el valor.
- Agregué 2 tests de regresión en `tasks/route.test.ts` ("persists
  fecha_entrega on create..." y "returns 400 for an invalid fecha_entrega...").
  Para no confiar en un test que "pasa porque sí", rompí a propósito la línea
  de persistencia (`fecha_entrega: undefined`), corrí la suite y confirmé que
  el test nuevo FALLA con el mensaje esperado; restauré el código original y
  volvió a pasar.
- Conclusión: **no es un bug reproducible en el código actual** (al 18 de
  agosto de 2026). Puede haber sido un error puntual de la prueba manual del
  informe, o el commit de por medio ya lo corrigió antes de esta revisión. No
  se tocó código de producción — solo se agregaron tests.

### Lote 6 — CRM: "Cargar desde Brief existente" (#5) ✅ CERRADO

- Definición de producto (resuelta con el dueño 2026-08-18): un "Brief" es un
  documento ya subido al Repositorio de Documentos. Alcance elegido:
  **prellenado liviano, sin dependencias nuevas** — se descartó la extracción
  de contenido con IA (leer el PDF/Word e inferir campos) por ser una pieza
  de arquitectura nueva y de esfuerzo mucho mayor.
- Implementado en `client-form.tsx`: botón "Cargar desde Brief existente" en
  el modal "Nuevo cliente" (solo en modo creación, no en edición) que abre un
  picker con buscador sobre `useDocuments`. Al elegir un documento, se copia
  su `título` como nombre sugerido del cliente; el resto de los ~15 campos
  del formulario quedan vacíos, a completar a mano. No se lee el contenido
  del archivo.
- El picker (`BriefPickerDialog`) se monta solo al abrirse (evita un fetch de
  `/documents` en cada apertura del modal si nadie lo usa).
- Tests en `client-form.test.tsx`: no hace fetch hasta abrir el picker,
  prellena el nombre y cierra el picker, no aparece el botón en modo edición.
  Validé rompiendo a propósito el `onPick` (sin copiar el título) antes de
  confiar en el test.

### Lote 7 — Seguridad: bitácora de auditoría de negocio (#9) ✅ CERRADO

- Nuevo modelo Prisma `Auditoria` (entidad, entidad_id, acción, usuario_id,
  `cambios` JSON, timestamp — sin FK en `entidad_id` a propósito, para
  sobrevivir a un soft delete del recurso referenciado). Migración
  `prisma/migrations/20260818153735_auditoria_negocio/` generada y
  **aplicada** con `prisma migrate deploy` (2026-08-18, confirmado por el
  usuario) — `prisma migrate status` confirma la base al día.
- `logAudit()` (`src/lib/api/audit.ts`), best-effort igual que el log de
  accesos del login: un fallo al escribir la auditoría nunca tumba la
  operación de negocio.
- `cambios` guarda los campos enviados en la operación (ya validados por el
  zod schema del endpoint), no un diff antes/después — evita una lectura
  extra del estado previo en cada PATCH solo para auditoría.
- Instrumentados los 8 puntos de escritura de los 3 módulos: clientes
  (crear/editar/eliminar), tareas (crear/editar incl. `/status`/eliminar),
  documentos (crear/eliminar, y subir nueva versión cuenta como "editar" del
  documento padre).
- Nuevo endpoint `GET /api/v1/auditoria` (solo ADMINISTRADOR, paginación por
  keyset, filtro opcional por entidad) + hook `useAuditoria` + sección
  "Bitácora de auditoría" en Administración, debajo de la bitácora de accesos
  existente (que sigue igual).
- Tests: `audit.ts` (3), `auditoria/route.test.ts` (8) + una aserción de
  `logAudit` agregada al happy-path de cada uno de los 8 endpoints
  instrumentados.

### Lote 8 — Adjuntos de tarea → Repositorio de Documentos (#12) ✅ CERRADO — migración aplicada 2026-08-18

- Camino elegido: **(a) doble escritura**, no migración de esquema — menos
  invasivo, no toca filtros/permisos existentes del repositorio.
- `AdjuntoTarea` ganó un campo `documento_id` nullable (FK a `Documento`,
  `ON DELETE SET NULL`, sin cascada — borrar la tarea nunca borra el
  documento espejo, que sigue viviendo en el Repositorio con vida propia).
  Migración en `prisma/migrations/20260818160826_adjuntos_tarea_documento_link/`,
  generada y **aplicada** con `prisma migrate deploy` (2026-08-18, confirmado
  por el usuario) — `prisma migrate status` confirma la base al día.
- `POST /tasks/:id/attachments` ahora también crea un `Documento` +
  `DocumentoVersion` reusando el mismo `storage_path` (sin volver a subir el
  archivo), categoría fija `"Otro"` (un adjunto no tiene concepto de
  categoría propio), y lo vincula al cliente de la tarea si tiene uno.
  Best-effort: si el espejo falla, el adjunto igual queda guardado en la
  tarea — no se pierde lo que el usuario pidió.
- Alcance decidido: **sin backfill** de los adjuntos ya existentes — solo los
  subidos después de este cambio se espejan. Un backfill queda como mejora
  futura si hace falta.
- Tests: 3 nuevos en `attachments/route.test.ts` (crea+enlaza reusando el
  storage_path, vincula al cliente de la tarea si tiene uno, no rompe la
  subida si el espejo falla). Validé rompiendo a propósito el enlace de
  vuelta (`adjuntoTarea.update`) antes de confiar en el test.

---

## Abiertos que necesitan tu decisión (o la de Felipe) antes de tocar código

1. ~~**Bug 1**: ¿responsable opcional o el copy corregido ya es la solución
   final?~~ — resuelto 2026-08-18: el dueño confirmó que el responsable debe
   ser **obligatorio** para todas las tareas. El comportamiento actual ya es
   el correcto (validado en cliente y servidor); no hace falta tocar código.
2. ~~**Lote 6**: qué es un "Brief existente"~~ — resuelto 2026-08-18: documento
   del Repositorio, prellenado liviano (solo el título → nombre).
3. ~~**Lote 8**: camino (a) vs (b), borrado en cascada~~ — resuelto
   2026-08-18: doble escritura, sin cascada. Falta aplicar la migración.

---

## Orden sugerido de ejecución

1. Lote 1 (quick wins) → 2. Lote 2 (fix centralizado de selects) → 3. Lote 5
(solo verificación) → 4. Lote 4 → 5. Lote 3 → 6. Lote 7 y Lote 8 (mayor
esfuerzo, en paralelo si hay dos personas) → Lote 6 en cuanto se resuelva el
abierto #2.

---

## Cierre — 2026-08-19

Los 12 hallazgos quedaron en `main`, cada uno en su propia PR encadenada
(#19 a #29), con CI en verde (unit + e2e + preview deploy) antes de mergear.
Metodología aplicada a cada corrección: test de regresión escrito, fix roto a
propósito para confirmar que el test fallaba con el mensaje esperado, y recién
entonces restaurado — nunca se confió en un test sin verlo fallar primero.

Se corrió además una revisión de código sobre las 11 PRs originales, que
encontró y corrigió 8 hallazgos adicionales (seguridad, condiciones de
carrera, atomicidad de escrituras, paginación) antes de mergear — ver detalle
en los mensajes de commit de cada PR (`fix(...)`, todos con referencia
"Found in code review de PR #N").

**Bug adicional encontrado en verificación post-cierre**: el contador de
"documentos" de la barra lateral no se actualizaba al subir, espejar o borrar
un documento — `GET /api/v1/nav/counts` cuenta filas de `Documento` en vivo,
pero ninguna mutación invalidaba la query key del contador (la barra lateral
no se remonta al navegar, así que nunca se refrescaba sola). Reportado,
diagnosticado y corregido el mismo día en PR #30, con test de regresión.

**Verificación final sobre `main`**: `tsc --noEmit` limpio, ESLint limpio,
suite completa **711/711** tests en verde.

| PR | Título | Mergeada |
|---|---|---|
| #19 | Copy del Kanban + catálogo de categorías en vivo | 19 ago 13:28 |
| #20 | Exportar PDF + ancho de filtros (Lote 1) | 19 ago 13:31 |
| #21 | Selects: nombre legible en vez de valor crudo (Lote 2) | 19 ago 13:34 |
| #22 | Tests de persistencia de fecha de entrega (Lote 5) | 19 ago 13:38 |
| #23 | Aviso de duplicado antes de subir un documento (Lote 4) | 19 ago 13:43 |
| #24 | Edición inline en la ficha de cliente (Lote 3) | 19 ago 13:49 |
| #25 | "Cargar desde Brief existente" (Lote 6) | 19 ago 13:55 |
| #26 | Modelo y endpoint de la bitácora de auditoría (Lote 7) | 19 ago 14:03 |
| #27 | Sección de bitácora en Administración (Lote 7) | 19 ago 14:12 |
| #28 | Bitácora conectada a clientes, tareas y documentos (Lote 7) | 19 ago 14:20 |
| #29 | Adjuntos de tarea espejados al Repositorio (Lote 8) | 19 ago 14:30 |
| #30 | Contador de documentos de la barra lateral (post-cierre) | 19 ago 14:53 |

> Informe visual de cierre (para compartir con Felipe): ver el artifact
> publicado en la sesión — resume este mismo contenido con evidencia por
> hallazgo. Oportunidades de mejora identificadas al margen de la auditoría:
> `docs/pendientes/oportunidades-mejora-funcionalidad-ux.md`.
