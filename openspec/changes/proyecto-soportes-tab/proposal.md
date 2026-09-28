# Proposal: proyecto-soportes-tab — Pestaña Soportes (RF-04)

## Intent

F1.3 del plan de acción de la Auditoría v6. El mecanismo de soportes (`SoporteProyecto`, XOR archivo/enlace, tipos `VERIFICACION`/`LEGALIZACION`) ya está construido y probado end-to-end (`project-attachments`, capability archivada): `GET/POST .../attachments`, `DELETE .../attachments/[attachmentId]`, y en el cliente `useAttachments`/`useUploadAttachment`/`useDeleteAttachment` en `src/hooks/projects.ts`. La Auditoría lo confirma explícitamente: RF-04 → "Pestaña Soportes y subida desde Modo campo" con brecha única "No hay pestaña Soportes en el workspace"; F1.3 en la hoja de ruta tiene área `UI` (sin `DB`/`API`) y tamaño `S`. Lo único que falta es la interfaz: una pestaña "Soportes" en `project-workspace.tsx` que liste los soportes del proyecto y un modal "Agregar soporte" que use el POST ya existente.

## Scope

**In:**
- Pestaña "Soportes" en `project-workspace.tsx` (7.ª pestaña): lista de soportes del proyecto con chip de tipo (Verificación en azul info, Legalización en rosa), nombre del documento, a qué está vinculado (actividad, gasto, o nada — soporte general del proyecto), autor, fecha y formato/enlace de descarga.
- "Autor" y "vinculado a" se resuelven en el cliente cruzando datos ya disponibles vía hooks existentes (`useUsers` de `src/hooks/crm.ts` para el nombre por `subido_por_id`; `useActivities`/`useExpenses` de `src/hooks/projects.ts` para el nombre de la actividad o el gasto vinculado) — cero cambios de API o de schema.
- Modal "Agregar soporte": Tipo (Verificación/Legalización), Documento (nombre, requerido), Vincular a (actividad si Tipo=Verificación, gasto si Tipo=Legalización, o "Soporte general del proyecto" — refleja el XOR real de la API, `actividad_id`/`gasto_id` mutuamente excluyentes y ambos opcionales), y Archivo o Enlace (radio, XOR — refleja el contrato real de `POST .../attachments`, no el select decorativo "Formato: Drive/PDF" del mock que no corresponde a ningún campo real).
- Eliminar soporte (soft delete) desde la fila, reutilizando `useDeleteAttachment` ya existente, mismo patrón de confirmación que otras "zonas de peligro" del repo.

**Out:**
- Cualquier cambio a `project-attachments` (API, schema, hooks) — está completo y probado; este change es estrictamente UI.
- Modo campo / "Subir soporte" desde el móvil (F3.1, fuera de F1).
- Espejo al repositorio de documentos (`documento_id`) — ya soportado por el backend pero sin superficie de UI propia; no forma parte de RF-04's pestaña Soportes.

## Capabilities

### Modified
- **`project-attachments`** — añade el requisito de superficie UI (pestaña Soportes + modal) sobre el mecanismo ya especificado; no cambia ningún requisito de datos, seguridad o validación existente.

### New
Ninguna.

## Approach

Sin migración, sin cambios de API, sin hooks nuevos. Tres piezas, en orden de dependencia:

1. `tabs/soportes-tab.tsx` — lista los soportes vía `useAttachments(projectId)`, cruza `subido_por_id`/`actividad_id`/`gasto_id` contra `useUsers()`/`useActivities(projectId)`/`useExpenses(projectId)` (todas ya cacheadas por TanStack Query, sin fetch adicional real si el usuario ya visitó otra pestaña), botón "Agregar soporte" y fila de eliminar.
2. `soporte-dialog.tsx` — modal de creación, llama a `useUploadAttachment(projectId)` (multipart, ya soporta `file` XOR `url`, `actividad_id`/`gasto_id` opcionales).
3. `project-workspace.tsx` — añade `"soportes"` a `TAB_VALUES`.

Sigue el patrón de `tabs/legalizacion-tab.tsx` (F1.2, recién aplicado): `"use client"`, sin wrapper `Card`/`Dialog` propio en la pestaña (el `<Tabs>` del workspace ya da el chrome), loading/empty/populated explícitos, TDD estricto.

## Decisiones abiertas (requieren validación del usuario)

Ninguna — la Auditoría no registra ninguna decisión pendiente para RF-04/Soportes (tabla `DEC` de `Auditoria v6.dc.html` no lo menciona), y el mecanismo de datos ya está resuelto y probado en `project-attachments`.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `src/components/proyectos/tabs/soportes-tab.tsx` | New | Pestaña: lista de soportes, chip de tipo, vinculado a, autor, fecha, formato, descargar, eliminar |
| `src/components/proyectos/soporte-dialog.tsx` | New | Modal "Agregar soporte" |
| `src/components/proyectos/project-workspace.tsx` | Modified | `TAB_VALUES` + tab "soportes" |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Resolver "vinculado a"/"autor" en el cliente vía tres hooks distintos (`useUsers`, `useActivities`, `useExpenses`) puede mostrar "Cargando…" en cascada si el usuario entra directo a la pestaña Soportes sin haber visitado las otras | Baja | Cada lookup se degrada a mostrar el id crudo o "—" mientras su query está en `isLoading`, nunca bloquea el render de la lista de soportes en sí (mismo criterio que `resolveDownloadUrls` del backend: un fallo/lentitud de un dato secundario no rompe el listado) |
| El modal "Agregar soporte" del mock v6 usa un select "Formato" (Drive/PDF) que no corresponde a ningún campo real de la API | Alta (ya materializado) | Documentado como decisión D1 en design.md: se reemplaza por el radio Archivo/Enlace real del backend, que es lo que el POST realmente espera |
| Tabla/lista es ancha en filas con nombre + vinculado a + autor + fecha + formato en 390px | Baja | `overflow-x-auto` si se usa tabla, o layout de tarjeta apilada — decisión de diseño en design.md, mismo criterio de `financiero-tab`/`legalizacion-tab` |

## Rollback Plan

Revertir la UI restaura el workspace a 6 pestañas (sin Soportes). Ningún cambio de schema, API o hook — el rollback es puramente la eliminación de los 2 archivos nuevos y la línea de `TAB_VALUES`/`TabsTrigger`/`TabsContent` en `project-workspace.tsx`.

## Dependencies

- `project-attachments` (ya implementado) — este change consume `useAttachments`/`useUploadAttachment`/`useDeleteAttachment` sin modificarlos.
- `src/hooks/crm.ts`'s `useUsers()` (ya implementado, catálogo de usuarios activos) — reutilizado para resolver el nombre del autor.
- F1.2 (`proyecto-legalizacion-tab`) — comparte `project-workspace.tsx` recién modificado (6 pestañas); este change parte de esa versión para evitar conflicto de líneas en `TAB_VALUES`.

## Success Criteria

- [ ] La pestaña Soportes lista todos los soportes del proyecto con tipo, nombre, vinculado a, autor, fecha y formato/enlace
- [ ] "Agregar soporte" crea un `SoporteProyecto` válido (archivo XOR enlace) usando el POST ya existente, sin duplicar su validación
- [ ] Eliminar un soporte desde la fila lo retira de la lista (soft delete vía `useDeleteAttachment`)
- [ ] Cero cambios en `prisma/schema.prisma`, `prisma/migrations/`, o en cualquier ruta de `src/app/api/v1/projects/[id]/attachments/**`
- [ ] Tests nuevos en RED antes del código, GREEN después; suite completa sigue en verde
