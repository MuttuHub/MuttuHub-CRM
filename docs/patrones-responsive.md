# Patrones responsive de Muttu Hub

**Estado:** definido en Fase 5 (plan 2026-09-02) · **Alcance:** todas las pantallas autenticadas + acceso.

Antes de esta fase el repo no tenía ninguna convención responsive — por eso existían 34 respuestas
distintas para los mismos problemas. Este doc fija los patrones A–G y la tabla de anchos de referencia.
**Regla de oro: solo CSS. Cero media queries en JS.** El único `setAngosto(window.innerWidth < 940)` que
existía se eliminó en el PR 37 (breakpoint pasado a `lg`).

---

## Los siete patrones

### A — Barra de tabs
Tira con scroll abajo, ancho igual arriba. `flex-none` + `overflow-x-auto` (tira scrolleable) en móvil;
`lg:flex-wrap` + `lg:flex-1` (ancho igual) arriba. El umbral del ancho igual es `md:` para ≤4 tabs y `lg:`
para 5+ (cada tab con `whitespace-nowrap` de ~178px min-content se lleva su propia fila si no se contiene).

Ejemplos: `reportes-page.tsx` (5 tabs → `lg:`), `client-sheet.tsx` (7 tabs → tira con scroll, `no-scrollbar`
+ máscaras de degradado).

### B — Grupo de chips
`shrink-0` en cada chip + `overflow-x-auto` en el contenedor. Sin esto, un grupo de chips desborda el
documento en viewports angostos. Aplicado en `ChipSelector` (dashboard shared).

### C — Tabla
`min-w-[Npx]` explícito en la `<table>` para que **scrollee en vez de aplastarse**. El contenedor de
`ui/table.tsx` ya trae `overflow-x-auto`. Precedente original: `cara-clients-activity.tsx:91` (`min-w-640`).

| Tabla | min-w |
|---|---|
| Clientes · vista Detalles (`client-list.tsx`) | 880 |
| Bitácora de accesos (`accesos-section.tsx`) | 760 |
| Bitácora de auditoría (`audit-log-section.tsx`) | 860 |
| Solicitudes (`solicitudes-section.tsx`, 2 tablas) | 820 |
| Usuarios (`users-table.tsx`) | 760 |
| Repositorio de documentos (`repository-list.tsx`) | 920 |

### D — Grilla
Siempre declarar la base móvil: `grid-cols-1` (o `grid-cols-2` si es de tiles compactos) antes de subir con
`sm:`/`md:`/`lg:`/`xl:`. Nunca una grilla que arranca en 3+ columnas sin base.

### E — Fila de filtros
Grilla fluida arriba; `Popover` cuando aún así quedan ≥3 filas de controles. Clonar el patrón de
`client-list.tsx` (Popover con búsqueda visible). Aplicado en los filtros de Documentos (PR 37).

### F — Tablero
Grupos apilados debajo de `lg`. El kanban usa `flex-col gap-3 lg:flex-row lg:overflow-x-auto` en el
contenedor y `w-full lg:w-[248px]` en la columna — mismo DOM, mismo `SortableContext`, sin árbol gemelo.

### G — Ancho fijo → fluido
Dos reglas:
1. `sm:max-w-[Npx]` → `sm:max-w-[min(Npx,calc(100%-2rem))]` (20+ diálogos). Hoy cada consumidor pisa el cap
   móvil correcto de `ui/dialog.tsx` — `client-sheet.tsx` son 760px en un iPad de 768: 4px de margen.
2. `vh` → `dvh` (10+ sitios). La barra del Safari móvil deja el footer del diálogo debajo del chrome.

> **No** poner `overflow-x-hidden` en `main` como atajo: `dashboard-page.tsx` es `sticky top-2`, y cualquier
> `overflow-x` distinto de `visible` en un ancestro mata el sticky de todos los descendientes.

---

## Tableta — la banda que nadie revisó

| Viewport | Sidebar | Contenido |
|---|---|---|
| 375 (iPhone SE) | drawer | **299 → 327px** |
| 768 (iPad vertical) | drawer | **692px** |
| **1024 (iPad horizontal)** | rail 244 → 200 | **682 → 738px** |
| 1280 | rail 244 | 938px |

Rotar un iPad de vertical a horizontal daba **menos** contenido que en vertical: el sidebar de 244px llega
justo cuando no se puede pagar. El rail ahora mide 200px hasta `xl` (244px en `xl+`), y los paddings del
shell escalan en móvil.

---

## Áreas táctiles

Convención documentada en `globals.css` (44px) e implementada en `ui/button.tsx` con `after:-inset-N`.
Este trabajo no es "agrandar cosas": es **dejar de pisar `after:-inset-2` con `after:-inset-1`**. En la
mayoría de los casos es borrar. Los casos que sí quedaron cortos se corrigieron en PR 36:
- `ui/checkbox.tsx` — 32px → 48px (`after:-inset-3.5`)
- × de los chips de filtro (`client-list.tsx`) — 20px → 44px (`after:-inset-2`)
- paginación del repositorio — 40px → 48px (`after:-inset-2`)