# Proposal: admin-umbrales-editables — Umbrales del semáforo editables en Administración (RF-03, RF-07)

## Intent

F1.5 del plan de acción de la Auditoría v6 (`Auditoria v6.dc.html:254`): `['F1.5', 'Umbrales del semáforo en Administración', 'Editar settings y override por proyecto.', 'UI', 'RF-03 · RF-07', 'S']`.

El backend de esta funcionalidad **ya está completo**: `GET/PUT /api/v1/settings` (`src/app/api/v1/settings/route.ts`) acepta y valida las tres bandas de `UmbralesSemaforo` — `tecnico`, `financiero` e `indicador` — incluyendo el rechazo con 400 cuando `indicador.amarillo > indicador.verde` (agregado en F1.4/D4, `proyecto-metas-tab`). Lo que falta es exclusivamente **la UI**: `UmbralesSection` (`src/components/admin/umbrales-section.tsx`) ya edita `confirmado`, `tecnico` y `financiero`, pero nunca construyó inputs para `indicador` — el PUT lo preserva en silencio cuando el payload lo omite (comentario explícito en `route.ts:40-46`: "the currently-shipped `UmbralesSection` ... builds no editing UI for it (F1.5)"). Esta pestaña quedó pendiente **a propósito** al cerrar F1.4.

## Scope

**In:**
- `UmbralesSection`: nueva tarjeta "Indicadores (valor actual / meta)" con dos inputs (`verde`, `amarillo`, %), mismo patrón visual y de estado (borrador/dirty/Guardar/Descartar) que las tarjetas Técnico y Financiero ya existentes.
- Validación de cliente: `indicador.amarillo` no puede ser mayor que `indicador.verde` — mismo mensaje de coherencia que el servidor ya aplica (`route.ts:189-195`), agregado a `validationErrors()`.
- Tests: `umbrales-section.test.tsx` — render pre-poblado desde el snapshot GET, edición + guardado incluye `indicador` en el payload PUT, error de validación bloquea el guardado cuando `amarillo > verde`.

**Out (con justificación explícita):**
- **Override por proyecto** (mencionado en la fila F1.5 de la Auditoría y en la copia del mock v6 — "cada proyecto puede sobrescribirlos"). El mock v6 (`Muttu Hub v6.dc.html:356`) **no renderiza ningún control editable de override** — solo un párrafo de aviso; ningún wireframe muestra un formulario por proyecto. La columna `Proyecto.umbrales_override` existe en el schema y se **lee** server-side en 3 rutas (`budget`, `indicators` GET, `indicators/[id]` GET/PATCH vía `resolverUmbrales`), pero **ninguna ruta acepta escribirla hoy** — ni `projects/route.ts` (POST) ni `projects/[id]/route.ts` (PATCH), y `project-form.tsx` la excluye explícitamente ("intentionally out of scope (design.md Open Questions — deferred, advanced/optional field)"). Cerrar esta brecha exige un endpoint de escritura nuevo + UI nueva en el flujo de proyecto (no en Administración) — un cambio bastante mayor que el tamaño `S` que la Auditoría asignó a F1.5. Queda fuera, documentado como decisión abierta (ver design.md).
- **Pestaña "Semáforos" dedicada dentro de Administración** (v6 muestra `Administración` con sub-tabs Usuarios/Roles/Solicitudes/Catálogos/**Semáforos**/Auditoría — `README.md:166`, `Muttu Hub v6.dc.html:1289`). El código actual no tiene navegación por tabs en `/administracion` — todas las secciones (`UsersTable`, `CatalogsSection`, `UmbralesSection`, `AccesosSection`, `AuditLogSection`) se apilan linealmente en una sola página (`administracion/page.tsx`). Introducir tabs tocaría las 5 secciones existentes, no solo Umbrales — fuera de alcance de un change `UI`/`S` centrado en el semáforo. `UmbralesSection` ya es una tarjeta visualmente distinta (`<section>` con borde propio), suficiente para que el usuario la ubique.
- Reconciliación del default `tecnico` (`{ verde: 0.85, rojo: 0.6 }` en `catalogs.ts` vs. `{ verde: 0.90, rojo: 0.70 }` que muestra v6/recomienda la Auditoría, `Auditoria v6.dc.html:274`). El valor actual ya fue confirmado por el negocio el 2026-09-18 (`confirmado: true`, ver `design.md` archivado, riesgo "Umbrales nunca confirmados" marcado Resuelto). Cambiar el default de fábrica en código sería alterar en silencio un valor de negocio ya firmado, sin que nadie lo haya pedido. La resolución correcta es la que este mismo change entrega: hacer editable la UI para que un administrador aplique el corte de v6 si el negocio decide adoptarlo — no un cambio de código. Ver "Open decisions" en design.md.
- Cualquier cambio de schema, migración o rutas de API — el PUT/GET de `/api/v1/settings` ya soporta `indicador` completo desde F1.4; cero trabajo de backend.

## Capabilities

### Modified
- **`project-schedule`** — añade el requisito de superficie UI administrativa para editar los tres umbrales del semáforo (técnico, financiero, indicador), incluida la coherencia `indicador.amarillo ≤ indicador.verde`. No cambia ningún requisito de cálculo/comparación de color ya especificado.

### New
Ninguna.

## Approach

Ver design.md — cambio de un solo archivo de componente + su test, sin tocar `lib/semaforo.ts`, `lib/settings.ts`, `catalogs.ts` ni `api/v1/settings/route.ts` (los cuatro ya soportan `indicador` desde F1.4).

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `src/components/admin/umbrales-section.tsx` | Modified | `Draft` gana `indicador_verde`/`indicador_amarillo`; `umbralesToDraft`/`draftToUmbrales`/`validationErrors` cubren la tercera banda; nueva tarjeta "Indicadores" en el grid |
| `src/components/admin/umbrales-section.test.tsx` | Modified | Casos de render pre-poblado, guardado con `indicador` en el payload, y bloqueo por `amarillo > verde` |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Un snapshot GET sin `indicador` (imposible hoy — `getUmbralesSemaforo()` siempre lo rellena — pero si algo cambiara aguas arriba) deja el formulario sin valores iniciales para esa tarjeta | Baja | `umbralesToDraft` recibe el snapshot ya normalizado por `useSettings()` → `GET /api/v1/settings` → `getUmbralesSemaforo()`; ningún cambio de este change toca esa cadena |
| Guardar sin querer sobreescribe un `indicador` que otro admin cambió por otra vía (settings API directa) mientras este formulario estaba abierto | Baja, preexistente | Mismo comportamiento que Técnico/Financiero hoy — no es una regresión nueva de este change, y el PUT sigue siendo la fuente de verdad server-side con su propia validación |

## Rollback Plan

Revertir el componente y su test restaura el estado actual (PUT sigue preservando `indicador` en silencio cuando el payload lo omite — comportamiento ya probado y sin cambios). Ningún dato ni schema involucrado.

## Dependencies

- F1.4 (`proyecto-metas-tab`, ya aplicado en `local/todo-integrado`) — provee la banda `indicador` en `UmbralesSemaforo`, su validación server-side y el default de organización. Precondición ya satisfecha.

## Success Criteria

- [ ] `UmbralesSection` muestra y permite editar `indicador.verde`/`indicador.amarillo`, guardándolos vía el PUT ya existente
- [ ] El formulario bloquea el guardado con un mensaje de error cuando `indicador.amarillo > indicador.verde`, igual que el servidor
- [ ] Cero cambios en `prisma/schema.prisma`, `prisma/migrations/`, `lib/semaforo.ts`, `lib/settings.ts`, `catalogs.ts` o `api/v1/settings/route.ts`
- [ ] Tests nuevos en RED antes del código, GREEN después; suite completa sigue en verde
