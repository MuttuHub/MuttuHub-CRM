# Activar tabs Cronograma/Gantt/Indicadores + diagnóstico UX/UI

Objetivo: (1) activar las 3 pestañas del workspace de proyecto que hoy están
`disabled` con placeholder "Próximamente" (Cronograma/Gantt/Indicadores), para
que el usuario las vea funcionando "como en producción"; (2) correr un
diagnóstico completo de UX/UI sobre la app para identificar mejoras.

Contexto: rama `local/todo-integrado` (integración local de 10 ramas, ver
`odd/tasks/pendientes-menores-post-tablero.md`). `src/components/proyectos/project-workspace.tsx`
tiene las 3 pestañas deshabilitadas a propósito ("owned by Phases 5-7", nunca
se construyeron). Existe código muerto reusable: `CronogramaTab` en
`src/components/proyectos/project-sheet.tsx:135` (funcional pero no enrutado
desde ningún lado — solo lo usa su propio test).

Delivery strategy: no se define todavía — esto es trabajo de preview en rama
local, no se decide push/PR hasta ver el resultado con el usuario.
TDD: estricto (test runner `npx vitest run`).

## Parte A — Activar las 3 pestañas ✅ (2026-09-23, sin commitear)

- [x] Cronograma: `CronogramaTab` reusado verbatim del código muerto de
      `project-sheet.tsx` (lógica probada, solo relocalizado a
      `tabs/cronograma-tab.tsx`). `project-sheet.tsx` queda como código muerto
      igual (limpieza aparte, no se borró).
- [x] Gantt: `tabs/gantt-tab.tsx` nuevo — vista de solo lectura, barras
      horizontales agrupadas por meta, color por estado (verde=a tiempo,
      rojo=atrasado, amarillo=pendiente), marca de línea base por barra.
- [x] Indicadores: `tabs/indicadores-tab.tsx` nuevo — listado con barra de
      progreso, diálogo alta/edición, borrado con confirmación. Backend CRUD
      ya existía completo (`useIndicators`/`useCreateIndicator`/
      `useUpdateIndicator`/`useDeleteIndicator`).
- [x] Tests TDD (Gantt e Indicadores: RED→GREEN reales; Cronograma:
      confirmación de regresión sobre código ya probado, declarado así).
- Ruta: delegated. `tsc` limpio, `eslint` limpio, suite completa
  158/158 archivos, 1454/1454 tests (4 fallos iniciales por timeout bajo
  carga paralela, reconfirmados verdes en corridas aisladas — no son
  regresiones). Scope exacto: solo `src/components/proyectos/`.
  **Sin commitear** — pendiente de que el usuario lo revise en el navegador.

## Parte B — Diagnóstico UX/UI (read-only, sin cambios de código) ✅ (2026-09-23)

- [x] Recorrido visual (browser real, **Playwright directo** — chrome-devtools
      MCP quedó roto en dos sesiones seguidas, incl. después de un fix de
      config + reinicio; ver Progreso) de las 9 pantallas principales:
      login, clientes, tareas/kanban, oportunidades, proyectos (workspace
      incl. las 3 tabs nuevas de la Parte A), documentos, tablero gerencial
      (dashboard `/` y la ruta vieja `/tablero-gerencial`), administración.
      Cobertura 100%, dos viewports c/u (desktop 1440×900, mobile 390×844),
      sin 404 ni fallos de login.
- [x] Evaluado contra el checklist de `ui-ux-pro-max` (accesibilidad, touch
      targets, layout responsive, tipografía/color, forms/feedback,
      navegación).
- [x] Reporte de hallazgos priorizado — **16 hallazgos** (5 Critical, 8
      Important, 3 Nice-to-have). Ningún fix aplicado (por diseño de esta
      tarea). Reporte completo: `odd/tasks/ux-audit-report-2026-09-23.md`.
      También en Engram: proyecto `muttuhub-crm`, topic
      `odd/proyecto-workspace-tabs-y-ux-audit/parte-b-findings`.
- Ruta: delegated, read-only (audit/review vía agente con Playwright, no
  escribió código de la app).

## Parte C — Fixes priorizados (pendiente, no iniciado)

No arrancada. Orden recomendado por el reporte (agrupa por componente
compartido primero, para no repetir el mismo fix en varias pantallas):

- [x] **C1. Header de página compartido** (Critical, hallazgo #4) — trunca
      "Proyectos"→"Proyecto" y se superpone en Documentos en mobile. Un
      componente, cubre 2+ pantallas.
      Evidencia (delegated, `src/components/shell/header.tsx` +
      `header.test.tsx` nuevo): contenedor raíz pasa de `flex items-start
      justify-between` a `flex flex-col items-stretch justify-between
      sm:flex-row sm:items-start` (título ocupa fila completa en mobile,
      íconos bajan a su propia fila desde `sm:` en adelante). RED→GREEN
      confirmado (3 tests nuevos). Checks: `vitest run header.test.tsx` OK
      (3/3), `vitest run` suite completa OK (159 archivos / 1457 tests),
      `tsc --noEmit` sin errores, `eslint` sin warnings/errores.
- [x] **C2. `/clientes` vista "Tarjetas" responsive** (Critical, #1) —
      **FALSO POSITIVO, verificado 2026-09-24.** El grid
      (`client-list.tsx` `ClientResults`) ya es `grid-cols-1 sm:grid-cols-2
      xl:grid-cols-3` desde el commit `8422a5a` (2026-09-02, PR 26), tres
      semanas antes del audit. Verificación en vivo (Playwright, 390×844,
      Docker local, login demo): `gridTemplateColumns` real = 1 columna,
      tarjeta de 300px de ancho, sin overflow en nombre/badges/`dl` de
      datos. No se aplicó ningún fix — no había nada que arreglar. Ruta:
      delegated, read-only.
- [x] **C3. Client Sheet full-screen en mobile** (Critical, #2) —
      **FALSO POSITIVO (bug), verificado 2026-09-24.** El mismo PR 35
      (2026-09-02) que resolvió C2 ya deja el sheet en `w-full
      max-w-[calc(100%-2rem)]` + `h-[88dvh]` con scroll interno
      (`overflow-y-auto`). Verificación en vivo (390×844, tab General):
      `scrollHeight` 1038px vs `clientHeight` 361px, scroll hasta el tope
      real trae todos los campos siguientes a "Canal de contacto inicial"
      — nada queda inalcanzable. Único punto real: visualmente es un
      diálogo centrado (358×743px, bordes redondeados, 16px de margen
      lateral, ~50px arriba/abajo) y no un sheet edge-to-edge nativo —
      decisión de usuario: se deja así (nice-to-have, no bug). Ruta:
      delegated, read-only.
- [x] **C4. Tab Gantt responsive en mobile** (Critical, #3) — foco
      explícito de este audit (tab nuevo de la Parte A); barras quedan en
      2-4px, fechas ilegibles.
      Evidencia (delegated, `src/components/proyectos/tabs/gantt-tab.tsx` +
      `gantt-tab.test.tsx`): confirmado por inspección que el label fijo
      (`w-40` = 160px) + `%` fijo (`w-10` = 40px) + `gap-3` (24px) consumían
      224px fijos antes de que la barra (`flex-1`) recibiera lo que
      sobraba; el contenedor padre (`project-workspace.tsx`, `<div
      className="space-y-6 p-6">`) resta 48px más (24px por lado), dejando
      ~342px reales disponibles en un viewport de 390px — igual de
      insuficiente para el layout de una sola fila. Fix (mismo patrón que
      C1, `header.tsx`): cada fila de actividad pasa a `flex flex-col gap-1.5
      sm:flex-row sm:items-center sm:gap-3`; el label pasa a `w-full
      sm:w-40 sm:shrink-0` (mantiene `truncate` + `title`); la barra y el %
      se agrupan en un wrapper `flex items-center gap-2 sm:contents` — en
      mobile los mantiene juntos en su propia línea, y desde `sm:` en
      adelante `display: contents` los devuelve a ser hijos directos del
      flex-row, restaurando el layout desktop original byte a byte. Sin
      tocar `actividadColor`/`pct`/`clampPct`. RED→GREEN confirmado (2 tests
      nuevos sobre clases responsivas, jsdom no calcula layout real).
      Checks: `vitest run gantt-tab.test.tsx` OK (9/9), `vitest run` suite
      completa OK (159 archivos / 1459 tests), `tsc --noEmit` sin errores,
      `eslint` sin warnings/errores. Ruta: delegated direct (1 writer, 2
      archivos no triviales).
- [x] **C5. Rol truncado en tabla de usuarios, Administración** (Critical,
      #5) — **FALSO POSITIVO (bug), verificado 2026-09-24.** Mismo PR de
      responsive del 2026-09-02 (`e0f3eba`, "min-w en 5 tablas") ya deja
      `<Table className="min-w-[760px]">` con scroll horizontal
      (`overflow-x-auto` del componente base) y badges `whitespace-nowrap`
      sin `truncate`. Verificación en vivo (390×844): `scrollWidth` 760 vs
      `clientWidth` 332 (overflow real), `textContent` de los badges
      completo en el DOM ("Colaborador", "Coordinador", "Gerencia /
      Dirección", "Administrador" — ninguno cortado), y visualmente
      legibles al scrollear hasta la posición correcta. Punto real
      distinto: la columna "Rol" no es visible ni al cargar ni al final
      del scroll (hay que pararse a mitad de camino) — fricción de UX
      menor, no pérdida de información. Decisión de usuario: se deja así
      (nice-to-have, no bug). Ruta: delegated, read-only.
- [x] **C6. Hydration mismatch en login** (Important, #6 — bug de código
      real, confirmado por código, no falso positivo como C2/C3/C5) —
      root cause real: `acceso-page.tsx`, `inputStyle` (dentro del `.map`
      de `campos`) construía `padding` y `border` como shorthand CSS con
      template strings dinámicos (`padding: \`0 ${...}px 0 14px\``,
      `border: \`1px solid ${...}\``). React serializa ese shorthand tal
      cual en el HTML del server; el CSSOM del navegador lo reparsea a su
      propia forma al hidratar, y no coincide con lo que React recalcula
      en cliente — mismatch real (no era problema de `style={{}}` vs
      Tailwind, la página entera usa estilos inline a propósito por
      diseño aprobado; NO se refactorizó el enfoque de estilos). Fix
      acotado: se reemplazaron esas dos propiedades shorthand por
      longhand explícito — `paddingTop/Right/Bottom/Left` (números) y
      `borderWidth`/`borderStyle`/`borderColor` — sin tocar ningún otro
      `style={{}}` del archivo.
      Evidencia (delegated direct, `src/components/auth/acceso-page.tsx`
      + `acceso-page.test.tsx` nuevo): RED→GREEN real confirmado. La
      hidratación SSR real no es reproducible con jsdom+RTL (no hay
      `hydrateRoot` sobre HTML server-rendered en este proyecto), pero se
      encontró una señal observable genuina y no frágil: el CSSOM de
      jsdom (`cssstyle`, misma clase de motor que un navegador real) no
      logra parsear un shorthand `border` cuyo color es una custom
      property (`var(--color-x)`) — la declaración completa se descarta y
      `input.style.borderColor` queda vacío — mientras que `borderColor`
      longhand sí resuelve. Con eso, el test "resuelve `borderColor` vía
      longhand" falló primero contra el código sin arreglar (RED real,
      `expected '' to be 'var(--color-ink-300)'`) y pasó tras el fix
      (GREEN). El otro test (padding email vs password) documenta los
      valores computados correctos pero no distingue shorthand/longhand
      en jsdom (los valores numéricos ya eran correctos antes del bug;
      solo la representación textual serializada difería) — se declara
      así, sin inflar el resultado.
      Checks: `vitest run acceso-page.test.tsx` OK (2/2, RED→GREEN
      real), `vitest run` suite completa OK (160 archivos / 1461 tests),
      `tsc --noEmit` sin errores, `eslint` sin warnings/errores en ambos
      archivos. Ruta: delegated direct (1 writer, 2 archivos: fix +
      test).
- [x] **C7. Warning de consola en Bitácora de auditoría** (Important, #12 —
      bug de código real) — falta mapeo de `"dashboard"` en
      `ACCION_LABELS`/`ENTIDAD_LABELS` de `AuditLogSection`.
      Root cause confirmado: `AuditEntidad` en el server
      (`src/lib/api/audit.ts`) incluye `"dashboard"`, pero su espejo del
      lado cliente en `src/hooks/admin.ts` y `ENTIDAD_LABELS` en
      `src/components/admin/audit-log-section.tsx` no lo tenían — mismo
      tipo de desfase client/server ya documentado ahí mismo para
      `"exportar"`. Al llegar un registro con `entidad: "dashboard"`,
      `toneInfo()` caía al fallback y disparaba `console.warn`.
      Fix acotado: se agregó `"dashboard"` a la unión `AuditEntidad`
      (`src/hooks/admin.ts`, con comentario documentando el porqué, mismo
      patrón que el resto del archivo) y una entrada
      `dashboard: { label: "Dashboard", tone: "neutro" }` en
      `ENTIDAD_LABELS` (`audit-log-section.tsx`) — tone "neutro" por ser
      evento de sistema/agregado, no una entidad de negocio. No se tocó
      `ACCION_LABELS` ni `toneInfo`.
      Test agregado en `audit-log-section.test.tsx`: registro con
      `entidad: "dashboard"` debe renderizar el badge "Dashboard" y NO
      llamar `console.warn` (`vi.spyOn`) — confirmado RED antes del fix
      (`findByText("Dashboard")` fallaba por timeout, quedaba el fallback
      crudo) y GREEN después.
      Checks: `vitest run audit-log-section.test.tsx` OK (6/6, RED→GREEN
      real), `vitest run` suite completa OK (160 archivos / 1462 tests),
      `tsc --noEmit` sin errores, `eslint` sin warnings/errores en los 3
      archivos tocados. Ruta: delegated direct (1 writer, 2 archivos de
      código + 1 de test).
- [x] **C8. Categoría de documento duplicada por fila** (Important, #7) —
      badge + texto plano repiten el mismo valor en `/documentos`.
      Root cause real confirmado (NO era bug de `DocumentRow`): en
      `src/components/documents/repository-list.tsx` la categoría (badge,
      línea 795) y las etiquetas (línea 796, hasta 3 tags) ya se renderizan
      como cosas conceptualmente distintas, correctamente separadas en el
      JSX. El problema era 100% de datos demo: `seedDocumentos` en
      `prisma/seed.ts` le ponía a cada documento `etiquetas: [categoria]`
      — la etiqueta era literalmente el nombre de su propia categoría, por
      eso el mismo texto aparecía dos veces por fila.
      Fix acotado (solo `prisma/seed.ts`, `seedDocumentos`): se agregó un
      mapa `DOCUMENT_TAGS: Record<string, string[]>` con 1-2 etiquetas
      temáticas por categoría (ej. Legal → `["contratos",
      "confidencialidad"]`, Informes → `["trimestral", "gestion"]`),
      siguiendo el mismo estilo que `DOCUMENT_TITLES` ya existente, y se
      reemplazó `etiquetas: [categoria]` por `etiquetas` desde ese mapa
      (`?? ["general"]` como fallback). Se verificó que ninguna etiqueta
      elegida coincide (ni parcial ni exactamente, case-insensitive) con
      ningún valor de `DOC_CATEGORIES`. No se tocó `DocumentRow`, ningún
      otro seed, ni el guard anti-producción.
      TDD: no aplica de forma significativa — es un cambio de contenido
      de un objeto estático en un script de seed, no una unidad de
      comportamiento nueva; se declara explícito en vez de forzar un test
      artificial.
      Checks: `tsc --noEmit` OK (sin errores), `eslint prisma/seed.ts` OK
      (sin warnings/errores), seed corrido contra LOCAL
      (`npx tsx --env-file=.env.local prisma/seed.ts`, Docker Supabase
      local verificado `Up`/`healthy` antes, salida confirma
      `8 documentos upserted` sin tocar nada fuera de localhost),
      verificación directa contra la DB local (script temporal vía el
      `db` de `src/lib/db`, con el mismo guard de host `127.0.0.1`/
      `localhost` en `DATABASE_URL`, borrado al terminar): 0/8 documentos
      con etiqueta igual/parcial a su categoría. Ruta: direct inline (1
      archivo de datos, mecánico, ya entendido).
- [x] **C9. Etiquetas de eje Y superpuestas, gráfico Curva S** (Important,
      #8) — un componente, se repite en dashboard `/`, `/tablero-gerencial`
      y proyectos→Resumen.
      Root cause confirmado por inspección (`src/components/dashboard/curve-s-chart.tsx`,
      líneas 58-65 antes del fix): las 5 marcas del eje Y (`[0, 25, 50, 75,
      100].map`) eran cada una `<div className="absolute left-0 right-0">`
      sin `top` explícito. Sin `top`, un `position: absolute` cae en su
      "static position"; al ser las 5 hermanas consecutivas sin altura en
      el flujo, colapsaban las 5 en el mismo punto — superposición
      garantizada en cualquier viewport, no dependía de datos ni pantalla.
      Fix acotado a las marcas del eje Y: se agregó
      `style={{ top: \`${100 - pct}%\`, transform: 'translateY(-50%)' }}` (eje
      invertido: 100% arriba con `top: 0%`, 0% abajo con `top: 100%`;
      `translateY(-50%)` centra la línea sobre el punto exacto) y
      `data-testid={\`y-axis-mark-${pct}\`}` para poder testear la posición.
      No se tocaron las barras de datos, `CurveSChartContainer` ni la
      lógica de `maxValor`.
      TDD estricto real: test nuevo en `curve-s-chart.test.tsx`
      ("spaces the y-axis marks vertically...") que lee `style.top` de las
      5 marcas vía `data-testid` y verifica que las 5 sean distintas y
      estrictamente decrecientes a medida que `pct` aumenta — RED confirmado
      antes del fix (`getByTestId` fallaba, el testid no existía todavía) y
      GREEN después (7/7 tests del archivo).
      Checks: `vitest run curve-s-chart.test.tsx` OK (7/7, RED→GREEN real),
      `vitest run` suite completa OK (160 archivos / 1463 tests), `tsc
      --noEmit` sin errores, `eslint` sin warnings/errores en los 2 archivos
      tocados. Ruta: direct inline (1 componente + su test, ya entendidos,
      cambio mecánico y acotado).
- [x] **C10. Leyenda de colores en Gantt** (Important, #9) — WCAG 1.4.1,
      info solo por color (verde/rojo/amarillo) sin texto/ícono de apoyo.
      Root cause confirmado por inspección
      (`src/components/proyectos/tabs/gantt-tab.tsx`, antes del fix): cada
      barra de actividad usaba únicamente `BAR_COLOR[color]` para comunicar
      estado (verde=a tiempo, amarillo=pendiente, rojo=atrasado) — sin texto
      ni ícono en ningún lado. Un usuario daltónico o en escala de grises no
      podía distinguir los 3 estados.
      Fix acotado (aditivo, sin tocar `actividadColor`, `BAR_COLOR`,
      `MARKER_COLOR`, el cálculo `pct`/`left`/`width` ni el layout
      responsive de C4): se agregó `STATUS_LABEL: Record<ColorSemaforo,
      string>` (`verde: "A tiempo"`, `amarillo: "Pendiente"`, `rojo:
      "Atrasado"`) y (1) una leyenda compacta arriba del tab, cerca de la
      fila de fechas mín/máx, con swatch de color + texto por estado
      (mismo patrón `flex items-center gap-2 text-[12px]` que la leyenda de
      `curve-s-chart.tsx` líneas 41-53), y (2) `title`/`aria-label` en cada
      `data-testid="gantt-bar"` con el texto de su estado.
      TDD estricto real: 2 tests nuevos en `gantt-tab.test.tsx` ("shows a
      text legend for the 3 status colors" y "labels each bar's status in
      text via title/aria-label, not color alone", este último con 3
      actividades — verde/rojo/amarillo — verificando `title`/`aria-label`
      exacto por barra). RED confirmado antes del fix (2/11 fallando:
      `getByText` no encontraba los textos, `title`/`aria-label` eran
      `null`) y GREEN después (11/11, los tests de C4 preexistentes siguen
      pasando).
      Checks: `vitest run gantt-tab.test.tsx` OK (11/11, RED→GREEN real),
      `vitest run` suite completa OK (160 archivos / 1465 tests), `tsc
      --noEmit` sin errores, `eslint` sin warnings/errores en los 2
      archivos tocados. Ruta: direct inline (1 componente + su test, ya
      entendidos, cambio mecánico y acotado).
- [ ] **C11. Touch targets de editar/borrar en Indicadores** (Important,
      #10) — íconos < 44×44px, muy juntos, acción destructiva (borrar).
- [ ] **C12. Columnas IP/Agente ausentes en mobile, Bitácora de accesos**
      (Important, #13 — a confirmar con el usuario si es recorte
      intencional u overflow sin querer).
- [ ] Nice-to-have (bajo impacto, no bloquean): #11 posible redundancia
      `/` vs `/tablero-gerencial`, #14 semáforo de Cronograma solo por
      color, #15 nombre de cliente sin tooltip en Documentos, (de C3)
      Client Sheet como diálogo centrado en vez de sheet full-screen
      edge-to-edge en mobile, y (de C5) columna "Rol" de la tabla de
      usuarios no cae ni al inicio ni al final del scroll horizontal en
      mobile — decisiones de usuario 2026-09-24: dejarlas así.

Delivery strategy de Parte C: a definir con el usuario cuando arranque
(sigue en rama local, Parte A todavía sin commitear).

## Progreso
- 2026-09-23: doc creado. Arrancando Parte A (delegated writer, TDD estricto)
  y Parte B (delegated audit, read-only) en paralelo.
- 2026-09-23: Parte A completa (ver checklist arriba, sin commitear).
- 2026-09-23: Parte B bloqueada dos veces por chrome-devtools MCP roto
  (`Target closed`, persistió incluso tras fix de config + reinicio de
  sesión) — resuelto usando Playwright directo (ya era devDependency del
  proyecto), sin tocar el MCP roto. Parte B completada y documentada.
  Servidor dev quedó corriendo en `:3001` contra Docker Supabase local
  (`.env.local`), no se tocó `.env`/cloud.
