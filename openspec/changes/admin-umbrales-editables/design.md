# Design: admin-umbrales-editables — Umbrales del semáforo editables en Administración

## Already exists vs. v6 gap

| Pieza | Ya existe (F1.4 y antes) | v6 gap real (F1.5) |
|---|---|---|
| `UmbralesSemaforo` con banda `indicador: { verde, amarillo }` | ✅ `src/lib/semaforo.ts` | — |
| `colorIndicador` puro | ✅ `src/lib/semaforo.ts` | — |
| `resolverUmbrales` mezcla `indicador` (override de proyecto > org > default) | ✅ `src/lib/semaforo.ts` | — |
| `UMBRALES_SEMAFORO_DEFAULT.indicador = { verde: 0.9, amarillo: 0.6 }` | ✅ `src/lib/catalogs.ts` | — |
| `getUmbralesSemaforo()` rellena `indicador` en settings guardados antes de F1.4 | ✅ `src/lib/settings.ts` | — |
| `PUT /api/v1/settings` acepta `semaforo_umbrales.indicador` opcional, preserva el guardado si se omite | ✅ `src/app/api/v1/settings/route.ts` | — |
| `PUT` rechaza `indicador.amarillo > indicador.verde` con 400 | ✅ `route.ts:189-195` | — |
| `GET /api/v1/settings` devuelve siempre `indicador` normalizado | ✅ | — |
| `UmbralesSection`: edita `confirmado`, `tecnico.{verde,rojo}`, `financiero.{verde_min,verde_max,amarillo_min,amarillo_max}` | ✅ `src/components/admin/umbrales-section.tsx` | — |
| `UmbralesSection`: edita `indicador.{verde,amarillo}` | ❌ | **Este change.** Comentario explícito en `route.ts:40-46` marca esto como diferido a F1.5 |
| Validación de cliente `indicador.amarillo ≤ indicador.verde` | ❌ | **Este change** (espejo del check server-side) |
| `Proyecto.umbrales_override` — columna, lectura server-side (`budget`, `indicators` GET, `indicators/[id]` GET/PATCH) | ✅ | — |
| `Proyecto.umbrales_override` — **escritura** (API o UI) | ❌ (ninguna ruta la acepta; `project-form.tsx` la excluye a propósito) | **Fuera de alcance de F1.5** — v6 no renderiza ningún control editable para esto (solo texto de aviso), ver proposal.md Out. Candidato a change futuro si el negocio lo pide explícitamente. |
| Sub-tab "Semáforos" dentro de `/administracion` | ❌ (secciones apiladas, sin `<Tabs>`) | **Fuera de alcance de F1.5** — tocaría las 5 secciones del admin, no solo el semáforo. `UmbralesSection` ya es una tarjeta con borde propio, suficiente para ubicarla. |
| Default `tecnico` reconciliado con v6 (`{ verde: .90, rojo: .70 }`) | ❌ (`catalogs.ts` mantiene `{ verde: .85, rojo: .6 }`, `confirmado: true` desde 2026-09-18) | **No se toca el código** — ver "Open decisions" abajo. La UI editable de este change es el mecanismo para que el negocio aplique el corte de v6 si decide adoptarlo. |

## Technical Approach

Un solo componente y su test, sin tocar ninguna capa de servidor — las cuatro piezas de backend (`semaforo.ts`, `catalogs.ts`, `settings.ts`, `settings/route.ts`) ya soportan `indicador` desde F1.4 (`proyecto-metas-tab`, D4).

1. **`umbrales-section.tsx`** — `Draft` gana dos campos string (`indicador_verde`, `indicador_amarillo`), mismo patrón que los 6 campos existentes (string de borrador, convertido a razón `/100` al guardar). `umbralesToDraft`/`draftToUmbrales` cubren la banda completa. `validationErrors` gana un cuarto chequeo: `indicador.amarillo > indicador.verde` → mismo texto de coherencia que el servidor ya usa como referencia (`route.ts` comentario en `umbrales-section.tsx:82-83` ya dice "Mismas coherencias que valida el PUT"). Una tercera tarjeta ("Indicadores (valor actual / meta)") se agrega al `grid gap-4 lg:grid-cols-2` existente, con dos inputs (`Verde igual o mayor a (%)`, `Amarillo igual o mayor a (%)`) — mismo componente `Input`/`Label`, mismo `h-9 rounded-12 bg-panel px-3 font-mono text-[13px]`.
2. **`umbrales-section.test.tsx`** — extiende los casos existentes: el snapshot mockeado incluye `indicador`, se asertan los valores pre-poblados en los dos nuevos inputs, editar y guardar incluye `indicador` en el payload del `PUT` mockeado, y un caso donde `amarillo > verde` deshabilita "Guardar" y muestra el mensaje de error (mismo patrón que los 3 casos de coherencia ya cubiertos para técnico/financiero).

`sameUmbrales`/`dirty` ya comparan por `JSON.stringify` del objeto completo — no requieren cambio: automáticamente incluyen `indicador` una vez que `Draft`/`draftToUmbrales` lo cubren.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | Reutilizar el mismo patrón de tarjeta/borrador/validación que Técnico y Financiero ya usan, sin extraer un componente `UmbralBandCard` genérico | Extraer un sub-componente parametrizado por banda (3 usos → `map`) | Solo hay 3 bandas y cada una tiene una forma de campos ligeramente distinta (2 vs. 4 vs. 2 inputs, distinta etiqueta). Extraer ahora es una refactorización especulativa sin un cuarto consumidor a la vista — mismo criterio ya aplicado en `proyecto-metas-tab` design.md D3 ("si diverge, es señal de extraer... no se hace preventivamente"). |
| D2 | El override por proyecto queda completamente fuera de este change (ni API de escritura ni UI) | Agregar aunque sea un endpoint `PATCH` mínimo para `umbrales_override` sin UI todavía | El mock v6 no muestra ningún formulario de override — solo un aviso textual. Construir un endpoint de escritura sin ninguna superficie que lo use es trabajo especulativo fuera del alcance `S` que la Auditoría asignó, y duplicaría el criterio "no inventar UI que v6 no muestra" aplicado también al default `tecnico`. |
| D3 | No se cambia `UMBRALES_SEMAFORO_DEFAULT.tecnico` en código | Actualizar el default de fábrica a los valores de v6 (`.90`/`.70`) siguiendo la "Recomendación" de la Auditoría al pie de la letra | El valor actual (`.85`/`.6`) ya fue confirmado por el negocio el 2026-09-18 (T6, `confirmado: true`). Cambiar un default de fábrica en código no afecta el `Setting` ya guardado en producción (la comparación siempre lee el `Setting`, nunca la constante — ver `settings.ts` docstring), así que el efecto práctico sería nulo para un ambiente ya sembrado, pero SÍ afectaría cualquier ambiente nuevo (`ensureDefaultSettings`) sin que el negocio lo haya pedido para F1.5. La UI editable que este change entrega es la vía correcta: si el negocio decide adoptar el corte de v6, lo aplica desde Administración, con el propio flag `confirmado` como registro de que fue una decisión consciente. |

## Data Model

Ninguno. Cero cambios en `prisma/schema.prisma`, `prisma/migrations/`, o en cualquier tipo exportado de `src/lib/semaforo.ts`/`src/lib/catalogs.ts`/`src/lib/settings.ts`. El tipo `SemaforoUmbralesInput` de `src/hooks/admin.ts` (`Omit<UmbralesSemaforo, "indicador"> & { indicador?: ... }`) ya es lo suficientemente permisivo para que el componente empiece a enviar `indicador` sin cambios de tipo.

## Component Structure

### `umbrales-section.tsx`

```ts
type Draft = {
  confirmado: boolean;
  tecnico_verde: string;
  tecnico_rojo: string;
  financiero_verde_min: string;
  financiero_verde_max: string;
  financiero_amarillo_min: string;
  financiero_amarillo_max: string;
  // admin-umbrales-editables (F1.5): banda de indicadores (KPI 3, D4),
  // diferida en proyecto-metas-tab — ver route.ts:40-46.
  indicador_verde: string;
  indicador_amarillo: string;
};
```

`umbralesToDraft`/`draftToUmbrales` ganan las dos claves nuevas, mismo `toPercentString`/`Number(...)/100` que las demás. `validationErrors` gana:

```ts
if (parsed.indicador.amarillo > parsed.indicador.verde) {
  errors.push("El umbral de indicador 'amarillo' no puede ser mayor que 'verde'.");
}
```

Tercera tarjeta en el `grid`, mismo shape que Técnico (2 inputs, sin subdivisión verde/amarillo/rojo triple como Financiero):

```
<div className="rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
  <h3>Indicadores (valor actual / meta)</h3>
  <div className="grid grid-cols-2 gap-3">
    <Input id="umbrales-indicador-verde" label="Verde igual o mayor a (%)" .../>
    <Input id="umbrales-indicador-amarillo" label="Amarillo igual o mayor a (%)" .../>
  </div>
</div>
```

El grid pasa de 2 a 3 tarjetas — sigue siendo `lg:grid-cols-2` (la tercera cae en una nueva fila en desktop, apilada en mobile), sin necesidad de tocar el layout del `<section>` contenedor.

## Testing Strategy

Strict TDD, RED antes del código:

1. `umbrales-section.test.tsx` — el snapshot mockeado de `useSettings()` incluye `semaforo_umbrales.indicador: { verde: 0.9, amarillo: 0.6 }`; se asertan los valores `90`/`60` pre-poblados en los dos nuevos inputs.
2. Editar ambos inputs de indicador y hacer click en "Guardar cambios" → `useSaveSettings().mutate` se llama con `semaforo_umbrales.indicador` reflejando los nuevos valores (ratio, no porcentaje) — mismo patrón que las aserciones existentes para `tecnico`/`financiero`.
3. `indicador_amarillo > indicador_verde` → "Guardar cambios" queda `disabled` y aparece el mensaje de error en la lista `<ul>` — mismo patrón que los 3 casos de coherencia técnico/financiero ya cubiertos.
4. Ningún test nuevo en `settings/route.test.ts` — ya cubre `indicador` completo desde F1.4 (D4); este change no toca esa ruta.

## Risks

Ver proposal.md.

## Assumptions Taken (not resolved by the proposal)

- Etiquetas de los nuevos inputs ("Verde igual o mayor a (%)", "Amarillo igual o mayor a (%)") siguen el mismo texto que la tarjeta Técnico usa para sus dos cortes (`umbrales-section.tsx:225,236`), en vez de inventar copy nueva — v6 no muestra un formulario editable real para esta banda (solo la tabla de referencia de solo-lectura en el mock, `Muttu Hub v6.dc.html:1295`), así que no hay copy verbatim de v6 que citar para los labels de input.
- Encabezado de la tercera tarjeta ("Indicadores (valor actual / meta)") describe la razón que `colorIndicador` compara (`valor_actual / meta_valor`, ver `semaforo.ts:55` docstring), espejando cómo las tarjetas existentes describen su propia razón ("avance real / planificado", "ejecutado / proyectado").

## Open decisions

| Decisión | Default aplicado (Auditoría "Recomendación") | Nota |
|---|---|---|
| ¿Actualizar `UMBRALES_SEMAFORO_DEFAULT.tecnico` a `{ verde: .90, rojo: .70 }` (valores de v6)? | **No, no en este change** — ver D3. La Auditoría recomienda "Aprobar los de v6 como default de organización, con override por proyecto" (`Auditoria v6.dc.html:274`), pero el valor actual ya está `confirmado: true` desde 2026-09-18. Este change entrega el mecanismo (UI editable) para que el negocio aplique el corte si lo decide — no lo decide por él. | Requiere confirmación explícita del negocio antes de cambiarlo, vía la propia UI que este change construye. |
| ¿Construir override por proyecto (API + UI)? | **No en este change** — ver proposal.md Out / D2. | Candidato a change futuro, tamaño no trivial (nuevo endpoint de escritura + UI en el flujo de proyecto, no en Administración). |
