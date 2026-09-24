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
- [ ] **C2. `/clientes` vista "Tarjetas" responsive** (Critical, #1) —
      entrada principal a clientes, hoy inusable en mobile (grid de 3
      columnas fijo). Usar el Kanban/Tablero como referencia de patrón
      responsive que sí funciona.
- [ ] **C3. Client Sheet full-screen en mobile** (Critical, #2) — modal de
      ~300px que recorta contenido sin scroll; transversal a todos los
      tabs del sheet (General/Contactos/Oportunidades/...).
- [ ] **C4. Tab Gantt responsive en mobile** (Critical, #3) — foco
      explícito de este audit (tab nuevo de la Parte A); barras quedan en
      2-4px, fechas ilegibles.
- [ ] **C5. Rol truncado en tabla de usuarios, Administración** (Critical,
      #5) — "Colaborador" y "Coordinador" ambos truncan a "Co", pérdida de
      información funcional, no solo estética.
- [ ] **C6. Hydration mismatch en login** (Important, #6 — bug de código
      real) — `acceso-page.tsx` usa `style={{}}` inline en vez de
      Tailwind; refactor a clases del sistema de diseño existente.
- [ ] **C7. Warning de consola en Bitácora de auditoría** (Important, #12 —
      bug de código real) — falta mapeo de `"dashboard"` en
      `ACCION_LABELS`/`ENTIDAD_LABELS` de `AuditLogSection`.
- [ ] **C8. Categoría de documento duplicada por fila** (Important, #7) —
      badge + texto plano repiten el mismo valor en `/documentos`.
- [ ] **C9. Etiquetas de eje Y superpuestas, gráfico Curva S** (Important,
      #8) — un componente, se repite en dashboard `/`, `/tablero-gerencial`
      y proyectos→Resumen.
- [ ] **C10. Leyenda de colores en Gantt** (Important, #9) — WCAG 1.4.1,
      info solo por color (verde/rojo/amarillo) sin texto/ícono de apoyo.
- [ ] **C11. Touch targets de editar/borrar en Indicadores** (Important,
      #10) — íconos < 44×44px, muy juntos, acción destructiva (borrar).
- [ ] **C12. Columnas IP/Agente ausentes en mobile, Bitácora de accesos**
      (Important, #13 — a confirmar con el usuario si es recorte
      intencional u overflow sin querer).
- [ ] Nice-to-have (bajo impacto, no bloquean): #11 posible redundancia
      `/` vs `/tablero-gerencial`, #14 semáforo de Cronograma solo por
      color, #15 nombre de cliente sin tooltip en Documentos.

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
