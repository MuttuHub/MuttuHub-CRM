# Cierre del plan 40/20 — Muttu Hub

**Estado:** entregado en `origin/main` · **Fecha:** 2026-08-12 · **Versión:** 1.0 · **Auditoría final:** 37/40 diseño, 18/20 técnico (Excelente)

---

## Resumen ejecutivo

El plan 40/20 (40 puntos de heurísticas de diseño Nielsen + 20 puntos técnicos) se ejecutó completo en 9 lotes sobre la UI de Muttu Hub, se re-auditó con método dual (revisión de diseño + detector mecánico) tras cerrar, se aplicaron los hallazgos P1 y P2, y se empujaron 33 commits a `origin/main` (rango `fdb5e38..de0207b`). La app queda en estado de envío con **249 tests verdes**, `tsc --noEmit` limpio y `eslint` sin warnings.

| Dimensión | Antes del plan | Después del plan |
|---|---|---|
| Diseño (Nielsen, /40) | 27 → 33 (Good) | **37/40 (Excelente, 92.5 %)** |
| Especificidad (/10) | 4 → 6 | **8/10** |
| Técnico (/20) | 14 | **18/20** |
| Detector mecánico | — | **0 findings en 9 targets** |
| Tests | 213 | 249 |

---

## 1. Lotes ejecutados (commits en `origin/main`)

### Lote 1 — Seguridad (lockout de administrador)
- `9ae73f7` · Guards de autodemoción y último administrado en `PATCH /users/[id]` y `POST /users/[id]/deactivate`; la UI deshabilita el rol propio y oculta "Desactivar" cuando corresponde. +11 tests.

### Lote 2 — Touch targets (a11y invisible)
- `fd99213` · Hit-areas de 44 px vía `::after` con `inset` negativo en 16 archivos; el diseño visual queda intacto. Excepciones documentadas: rail colapsado 38 px, inputs nativos.

### Lote 3 — Theming del login
- `280a66b` · Mapa "C" del login eliminado, `rose-600` fuera de marca eliminado, "VENCEN HOY" → `text-alerta` AA 5.02:1, "VENCIDOS" → `rose-700` 7.93:1, 217 literales de radio migrados a tokens (`--radius-10/11/12/14`), 39 archivos.

### Lote 4 — Flujo de notificaciones
- `02acf4b` · Las notificaciones de compromisos abren la ficha del cliente (`/clientes?cliente=ID`) en vez de morir en `/tablero`.

### Lote 5 — Datos (latoria kanban + rangos + progreso)
- `d834243` · N+1 de subtareas eliminado: conteo agregado en `TASK_SELECT` con `_count.subtareas`, 1 query por página en vez de N.
- `d538b37` · Validación de rangos `desde > hasta` → `400 VALIDATION_ERROR` con mensaje "La fecha final no puede ser anterior a la inicial." en parser y bloqueo UI con toast.
- `0a15212` · Progreso de subtareas restaurado: `subtotal_hechas` vía `groupBy` agregado + chip de progreso `done/total` con barra restaurado.

### Lote 6 — Distill de filtros
- `a5708ac` · Filtros de Clientes colapsados en un **popover "Filtros"** con contador "n filtros" + persistencia en la URL (`q,tipo,estado,prioridad,responsable,desde,hasta,vmin,vmax`); `cliente` preservado; `appliedRef` anti stale; seed en `onOpenChange`. 13 controles visibles → 2.

### Lote 7 — Pulido
- `e9d4b96` · Jerga interna naturalizada ("bucket" → "sin cerrar", "CRM" → "compromisos", `.env`/Supabase en print/shared) y typo "trataamiento".
- `8303dcc` · Focus-visible en 4 controles del login (`login-focus`), contraste del kbd `⌘K` (`text-shell-faint` → `text-shell-muted`), Escape del drawer móvil + `aria-expanded`/`aria-controls` + `id="sidebar-drawer"`, `transition-all` → `transition-colors` en button y badge, `preload="metadata"` en el video del login, icono `Hexagon` → `CalendarDays` en el chip "Sin fecha".
- `4399136` · "Cerrar" en español en `sheet` y `dialog` (botón de cierre con `aria-label`).

> **Nota de verificación:** el commit `8303dcc` fue revisado dos veces. Una verificación intermedia (con salida de shell corrupta) lo marcó erróneamente como "vacío"; la confirmación definitiva con `git show 8303dcc --stat` y `git log -S` demuestra que contiene 7 archivos, 24+ / 10- — el lote 7 es íntegro y está en su commit correcto.

### Lote 8 — Undo transaccional
- `c02a3b1` · `DELETE /api/v1/notifications/[id]/read` (scope usuario, idempotente, con test).
- `9191701` · Toast "Deshacer" 5 s para "marcar todas leídas" con `unreadSnapshotRef` + `revertPendingRef` + `invalidate onSettled`.
- `92f948e` · Undo para eliminar vista guardada (localStorage, no API): `ConfirmDialog` nuevo + toast que restaura la posición por `id` con `viewsRef`.
- `0baf39d` · Fix del test del panel (valor válido de `EstadoTarea`).

### Lote 9 — Dark mode
- `ed8ce72` · Token indirection en `globals.css`: `--color-page/panel/ink-*/rose-50-100-200/semánticos + _bg` con variantes `.dark`. **Modo claro byte-idéntico** (valores `:root` sin cambio, verificado en CSS compilado: `--page:#efeaeb`, `--panel:#fdfbfb`, `--ink-950:#191113`); en `.dark` se re-pinan con pares WCAG verificados.
- `5c7a8a3` · Script anti-FOUC inline en `<body>` del root layout (React 19 no hoistea inline scripts en `<head>`); hook `src/hooks/use-theme.ts` (persistencia en `muttu-theme`, default system); toggle Sun/Moon en `header.tsx` con `aria-label` dinámico.
- `c6350b3` · Barrido `bg-white` → `bg-panel` en 40 archivos + login consistente; sin dependencias nuevas.
- `f60ea39` · Limpieza de markers de debug (`▲`) que el sub-agente del lote 9 dejó en el sidebar.
- `c8015c6` · `suppressHydrationWarning` en `<html>` para corregir el mismatch que el script anti-FOUC genera al mutar `documentElement` antes de la hidratación.

### Re-auditoría — fixes P1+P2
- `d2ec107` · **P1**: los toasts de sonner siguen el dark mode (nuevo `src/components/shell/theme-toaster.tsx` que lee `useTheme()`; override `--color-card`/`--color-ink-800` para que el toast use los tokens de la app, no el `#fff` default de sonner light).
- `0635a1e` · **P1**: kanban por teclado — `KeyboardSensor` + `sortableKeyboardCoordinates` + live region `role="status"` que anuncia "Tarea movida a …"; `PointerSensor` intacto con su `activationConstraint {distance: 6}`.
- `9b0831f` · **P2**: focus management en el panel de notificaciones — trap de Tab first↔last, foco inicial en cerrar, retorno a la campana al cerrar; `wasOpenRef` evita robar foco en el mount.
- `de0207b` · **P2**: chips removibles de filtros aplicados bajo la búsqueda + draft persistente (flag `dirty`). **Bug latente corregido en `commit()`**: el merge por spread no podía vaciar un filtro individual (elegir "Todos los tipos" + Aplicar no lo removía) — ahora se hace `delete` por key.

---

## 2. Re-auditoría final (método dual, método de impeccables)

Snapshot: `.impeccable/critique/2026-08-12T02-56-25Z__…acceso-page-tsx.md`

### Heurísticas de Nielsen

| # | Heurística | Score | Hallazgo |
|---|---|---|---|
| 1 | Visibilidad de estado | 4 | Badges, buckets, skeletons, rollback DnD |
| 2 | Lenguaje real | 4 | Vocabulario de la organización, fechas es-CO |
| 3 | Control y libertad | 4 | Undo, Escape, cancelar, limpiar filtros |
| 4 | Consistencia | 4 | Tokens de radio; split popover/inline en kanban |
| 5 | Prevención de errores | 4 | Guard de rango con toast, confirm delete |
| 6 | Reconocer vs recordar | 3 | Filtros activos solo como contador (residual tras chips; el draft ya no se pierde) |
| 7 | Eficiencia | 4 | Vistas 1-click, URL, ⌘K, deep-link |
| 8 | Estética minimalista | 4 | 8 filtros → popover 2×4 |
| 9 | Recuperación | 4 | Undo transaccional, rollback |
| 10 | Ayuda y docs | 2 | Sin superficie de ayuda; "Soporte" muerto en login |
| **Total** | | **37/40** | Excelente (92.5 %) |

### Técnico

10 ítems (a11y, contraste, semántica, foco, perf, queries, responsive, touch targets, estados de error, robustez) — **18/20**. Detalle de los 6 pares de contraste dark calculados con WCAG: todos ≥ 4.5:1 (el más justo `rose-400` sobre `rose-100` oscuro a **4.54:1**).

### Hallazgos reportados aplicados (ronda P1+P2)
- P1 · Toasts ignoran dark mode → `d2ec107`
- P1 · Kanban mouse-only → `0635a1e`
- P2 · Notification dialog sin focus management → `9b0831f`
- P2 · Estado de filtros invisible + draft descartado → `de0207b`

---

## 3. Hallazgos pendientes (opcionales, no bloqueantes)

Quiedan anotados para una próxima ronda, sin impacto en el envío:

| Severidad | Hallazgo | Archivo |
|---|---|---|
| P3 | `transition-all` restante en `tabs.tsx` (componente de lib genérica, fuera del item del lote 7) | `src/components/ui/tabs.tsx:61` |
| M | Login sin `aria-invalid`/`aria-describedby` en la validación de campo | `src/components/auth/acceso-page.tsx` |
| M | Segmented ~28 px (kanban tabs) y login tabs 36 px — bajo la política 44 px, fuera de las excepciones documentadas | `kanban-board.tsx`, `acceso-page.tsx` |
| m | Paginación no persistida en URL (los filtros sí → refresh pierde página) | `client-list.tsx` |
| m | Suspense fallback hardcodea `#EFEAEB` — flash claro de 1 frame en dark | `login/page.tsx` |
| info | `ring-white` en el badge de notificaciones — costura dura en shell oscuro (cosmético) | `notification-panel.tsx` |
| P3 | "Soporte" en el login es una affordance muerta (sin `mailto:` ni ruta) | `acceso-page.tsx:476` |

---

## 4. Pruebas pendientes en navegador (solo pueden hacerse a mano)

Tres cosas que el sub-agente no pudo verificar sin browser automation:

1. **Toast undo en dark mode** — poner dark en `localStorage`, marcá todas leídas → el toast debe salir oscuro, no blanco.
2. **Kanban por teclado** — foco en una tarjeta, Enter/Espacio y flechas → debe moverse entre columnas y anunciar el cambio.
3. **Chips de filtros removibles** — aplicar filtros en Clientes → los chips deben aparecer bajo la búsqueda y removarse con la X.

---

## 5. Propuesta de identidad visual del interior — EN REVISIÓN (no implementada)

Documento: `docs/identidad-interior-propuesta.md` (sin commitear, exploración). Prototipo de referencia: `docs/muttu-hub-v2.html`.

**Estado:** la propuesta queda archivada en revisión. **No se implementa nada** hasta que la administradora del producto apruebe una dirección y autorice el piloto.

### Diagnóstico
El login es un port pixel-faithful del mock aprobado (especificidad 10/10); el interior tomó los tokens de marca (colores, tipografías, esquinas) pero no la composición — es scaffolding estándar de CRM repetido entre módulos (especificidad 4/10, ahora 8/10 tras el plan). El prototipo `muttu-hub-v2.html` ya dibujó un lenguaje propio (tabla de filas con selección rosa, chips píldora, KPIs con delta mono, kanban con borde de urgencia, aurora del login lavada) que la implementación no portó.

### Tres direcciones propuestas

| | A · Refinamiento | B · Interior con carácter | C · Mundo editorial |
|---|---|---|---|
| Concepto | Llevar el lenguaje del login con detalles quirúrgicos, sin tocar composición | Recuperar la composición del prototipo `muttu-hub-v2.html` | Tratar el CRM como publicación |
| Esfuerzo | Bajo | Medio | Alto |
| Riesgo a lo que funciona | Cero | Bajo-medio (mock antes) | Medio-alto |
| Especificidad esperada | 4 → ~6 | ~6 → ~9 | ~9 → 10 |

### Recomendación del documento
**Primero A, después B. C queda documentada como horizonte.** Orden sugerido: A completo → piloto de B en Clientes (mock aprobado por la administradora) → B módulo por módulo (clientes → tablero → documentos → administración).

### Próximo paso cuando se retome
1. Decisión de la administradora: aprobar A y B (o pedir ajustes al documento).
2. Piloto en mock, sin código: HTML estático con dos pantallas (Clientes + Tablero) en el formato de `muttu-hub-v2.html`, sesión de validación de 30-40 min. Criterio de aceptación: "un miembro del equipo reconoce el Hub como Muttu sin ver el logo".
3. Implementar A completo (una tanda de presentación).
4. Piloto B en Clientes → validación → B por módulos.
5. Documentar la gramática visual corta (cuándo se usa rosa, mono, display, la esquina asimétrica, la voz de los subtítulos).

---

## 6. Entrega

- **Push:** `fdb5e38..de0207b` a `origin/main` (github.com/MuttuHub/MuttuHub-CRM.git). 33 commits.
- **Verificación final:** 249 tests verdes · `tsc --noEmit` limpio · `eslint` exit 0 · `next build` confirmó los tokens oscuros en el CSS emitido.
- **Working tree:** limpio salvo `.impeccable/` y `docs/identidad-interior-propuesta.md` (untracked, en revisión por decisión).

## 7. Pendientes de decisión del dueño

- **Propuesta de identidad:** retomar la decisión sobre A/B/C (ver sección 5).
- **Pendientes opcionales de la re-auditoría:** ver sección 3 — ejecutarlos requiere una ronda de trabajo corta; ninguno bloquea el uso actual.