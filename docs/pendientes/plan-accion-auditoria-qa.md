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
| 1 | Kanban: copy "solo título obligatorio" vs responsable forzado | Informe | ✅ Copy arreglado (validación sigue exigiendo responsable) |
| 2 | Documentos: categoría "Comercial" inválida | Informe | ✅ Arreglado |
| 3 | CRM: sin edición inline | Informe | ❌ Pendiente |
| 4 | Documentos: sin detección de duplicados por nombre | Informe | ✅ Arreglado (Lote 4) |
| 5 | CRM: falta "Cargar desde Brief existente" | Informe | ❌ Pendiente |
| 6 | CRM: sin exportar ficha individual a PDF | Informe | ✅ Arreglado (Lote 1) |
| 7 | Selects: UUID/enum crudo en vez de nombre legible | Informe (ampliado) | ✅ Arreglado (Lote 2) — fix centralizado, ~10 sitios de una vez |
| 8 | Kanban: fecha de entrega no se guarda | Informe | ✅ Verificado (Lote 5) — funciona, con test de regresión |
| 9 | Seguridad: bitácora solo cubre login | Informe | ❌ Pendiente |
| 10 | Filtros del Tablero del equipo no entran en una fila | Usuario | ✅ Arreglado (Lote 1) |
| 11 | Filtros del Repositorio de Documentos, mismo problema de ancho | Usuario | ✅ Arreglado (Lote 1) |
| 12 | Adjuntos de tarea no aparecen en el Repositorio de Documentos | Usuario | ❌ Pendiente |

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

### Lote 3 — CRM: edición inline (#3)

- Reemplazar el flujo actual (botón "Editar" → modal `ClientFormDialog`
  separado, `client-sheet.tsx:216-320`) por edición por clic directo en los
  campos de la pestaña General.
- Necesita una decisión de diseño antes de tocar código: qué campos son
  editables inline (texto/textarea es directo; los selects — tipo, prioridad,
  estado, responsable — y la fecha probablemente necesiten un patrón "clic
  para abrir el control, blur/Enter para guardar" en vez de reescribir toda la
  interacción).

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

### Lote 6 — CRM: "Cargar desde Brief existente" (#5)

- **Necesita definición de producto antes de estimar o diseñar.** El
  documento de Requerimientos Funcionales original (§4.8) no está en el repo
  ni fue encontrado por el propio Felipe al hacer la auditoría — solo tenemos
  la mención del informe. No hay ninguna entidad "Brief" en el schema ni en
  el código.
- Antes de implementar, confirmar con el dueño del producto: ¿qué es
  exactamente un "Brief existente" en este dominio? ¿un documento del
  Repositorio, un formulario previo guardado, datos de otro sistema?

### Lote 7 — Seguridad: bitácora de auditoría de negocio (#9)

- Hoy el único modelo de auditoría es `Acceso` (`prisma/schema.prisma:317-326`),
  limitado a inicios de sesión. No existe un audit trail de creación/edición
  de Cliente, Tarea o Documento.
- Alcance: nuevo modelo Prisma (ej. `AuditLog`: entidad, entidad_id, acción,
  usuario_id, diff/payload, timestamp), instrumentar los endpoints de
  creación/edición de los 3 módulos, y una vista en Administración para
  consultarlo. Es el ítem de mayor esfuerzo de todo el plan — arquitectónico,
  no un fix puntual.

### Lote 8 — Adjuntos de tarea → Repositorio de Documentos (#12)

- Hoy son entidades Prisma totalmente separadas: `AdjuntoTarea`
  (`prisma/schema.prisma:289-300`, minimalista, sin categoría/etiquetas/
  versionado) vs `Documento`/`DocumentoVersion`/`DocumentoCliente`
  (223-264). Comparten el mismo bucket de Supabase pero con prefijos de key
  distintos.
- Decisión de diseño pendiente entre dos caminos:
  - **(a) Doble escritura**: al subir un adjunto de tarea, crear también un
    `Documento`+`DocumentoVersion` enlazados (requiere agregar una FK opcional
    para no duplicar el archivo físico, y definir una categoría por defecto
    ya que `AdjuntoTarea` no tiene ese campo).
  - **(b) Migración de esquema**: que los adjuntos sean directamente
    `Documento` con un `tarea_id` opcional — cambio más profundo, impacta
    filtros y permisos por categoría restringida en todo el repositorio.
  - Recomiendo (a) por menor invasividad, pero falta decidir qué pasa con los
    adjuntos ya existentes (backfill) y con el borrado en cascada
    (tarea eliminada → ¿se borra o se conserva el documento?).

---

## Abiertos que necesitan tu decisión (o la de Felipe) antes de tocar código

1. **Bug 1**: ¿el responsable debe volverse *realmente* opcional en Kanban, o
   el copy corregido ("Título y responsable son obligatorios") ya es la
   solución final aceptada?
2. **Lote 6**: qué es un "Brief existente" en este dominio — sin esto no se
   puede ni diseñar el Lote 6.
3. **Lote 8**: confirmar el camino (a) doble escritura vs (b) migración de
   esquema, y la política de borrado en cascada.

---

## Orden sugerido de ejecución

1. Lote 1 (quick wins) → 2. Lote 2 (fix centralizado de selects) → 3. Lote 5
(solo verificación) → 4. Lote 4 → 5. Lote 3 → 6. Lote 7 y Lote 8 (mayor
esfuerzo, en paralelo si hay dos personas) → Lote 6 en cuanto se resuelva el
abierto #2.
