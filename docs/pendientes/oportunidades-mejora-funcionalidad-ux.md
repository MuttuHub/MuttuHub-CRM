# Oportunidades de mejora — funcionalidad y UX/UI

> 2026-08-19, al cierre de la auditoría QA v1.0
> (`docs/pendientes/plan-accion-auditoria-qa.md`). Alcance deliberado: ideas
> que se resuelven con las herramientas que **ya están en el proyecto**
> (`@dnd-kit`, `@base-ui/react`, `exceljs`, `jszip`, `zustand`, el patrón de
> `Setting` para catálogos configurables, soft-delete vía `deleted_at`) — sin
> sumar dependencias, servicios externos ni licencias nuevas. La deuda técnica
> y las mejoras de infraestructura siguen en
> `docs/pendientes/pendientes-y-mejoras.md`; esto es específicamente producto
> y experiencia.

---

## Funcionalidad

### 1. Búsqueda global (`Cmd/Ctrl+K`)

Hoy cada módulo tiene su propio buscador con debounce (Clientes, Tareas,
Repositorio) pero no hay una forma de buscar "Alcaldía de Soledad" sin saber
si es un cliente, una tarea o un documento. Un command palette con
`@base-ui/react` (ya en el proyecto: `Dialog` + lista filtrable) que consulte
en paralelo `/api/v1/clients`, `/api/v1/tasks` y `/api/v1/documents` con el
mismo término, agrupando resultados por tipo. Estado del palette (abierto/
cerrado, últimos vistos) en `zustand`, mismo patrón que `src/store/sidebar.ts`.

### 2. Papelera — restaurar lo borrado

Cliente, Tarea, Documento y Contacto ya usan soft-delete (`deleted_at`); hoy
ese dato solo sirve para ocultar filas, no para recuperarlas. Una vista
"Papelera" en Administración (rol Administrador) que liste lo borrado en los
últimos N días con un botón "Restaurar" (`deleted_at: null`) evita el típico
"me equivoqué y borré el cliente equivocado" sin tocar el esquema.

### 3. Exportar Documentos y Bitácora de auditoría a Excel

`exceljs` ya exporta Clientes y Tareas (`/api/v1/clients/export`,
`/api/v1/tasks/export`); extender el mismo patrón a la lista del Repositorio
y a la nueva bitácora de auditoría (`GET /api/v1/auditoria`) es la forma más
barata de darle a Administración un reporte de cumplimiento exportable, sin
librería nueva.

### 4. Línea de tiempo unificada en la ficha del cliente

La ficha ya tiene pestañas separadas para Bitácora, Tareas y Documentos, y
ahora además existe la Auditoría de negocio (quién creó/editó qué). Un tab
"Actividad" que mezcle las cuatro fuentes en un timeline cronológico es una
vista nueva sobre datos que ya se consultan hoy por separado — no requiere
un modelo nuevo, solo una query combinada y un componente de lista con
fecha.

### 5. Preferencias de notificación por tipo

`Notificacion` ya distingue `COMPROMISO_VENCIDO` / `TAREA_VENCIDA` /
`POR_VENCER`. Igual que `doc_categories`/`task_tags` se guardan como un
`Setting` configurable, un `Setting` por usuario (o una columna simple en
`Usuario`) podría dejar silenciar un tipo puntual (ej. no me interesa
"por vencer", solo "vencida") sin construir un sistema de preferencias nuevo.

### 6. Orden persistente dentro de una columna del Kanban

`@dnd-kit/sortable` ya está instalado y soporta reordenar listas, no solo
mover entre columnas. Si hoy el orden dentro de una columna no sobrevive un
refresh, agregar un campo `orden` en `Tarea` y usar el sortable existente
resuelve "quiero mis tareas más urgentes arriba" sin tooling nuevo.

---

## UX / UI

### 7. Tablero Kanban en mobile: lista agrupada, no columnas

Arrastrar tarjetas con el dedo entre columnas angostas es incómodo en
pantallas chicas. Por debajo de cierto ancho, mostrar las tareas como una
lista agrupada por estado con un `Select` para cambiar de estado (mismo
componente que ya se usa en el resto del CRM) evita reinventar drag-and-drop
para touch.

> **Estado (Fase 5, PR 34)**: resuelto por el patrón F — las columnas se
> apilan como grupos debajo de `lg` (mismo DOM, mismo `SortableContext`), con
> el `Select` de estado existente para cambios rápidos. Ver
> `docs/patrones-responsive.md`.

### 8. Accesibilidad de teclado en el drag-and-drop

`@dnd-kit` trae sensores de teclado listos para usar
(`KeyboardSensor`); confirmar que el tablero los tenga habilitados y que el
movimiento se anuncie (`aria-live`) para poder mover una tarjeta sin mouse —
hoy es la única interacción del CRM que depende puramente del mouse/touch.

> **Estado (Fase 5)**: cerrado por verificación — `KeyboardSensor` +
> `sortableKeyboardCoordinates` y la región `aria-live` ya están en
> `kanban-board.tsx:175-178,400-402`.

### 9. Confirmaciones destructivas 100% consistentes

Ya existe un `ConfirmDialog` reutilizable (visto en `client-sheet.tsx`);
vale una pasada corta para confirmar que **todas** las acciones de borrado
(adjuntos de tarea, versiones de documento, contactos) lo usan, y que ninguna
quedó con un `window.confirm()` nativo de una implementación más vieja —
inconsistente visualmente y no theme-aware.

### 10. Estado vacío accionable en todas las listas

La Bitácora de auditoría ya tiene un estado vacío con ícono + texto +
explicación ("Aún no hay registros"). Extender ese mismo tratamiento a listas
que hoy podrían mostrar solo una tabla vacía (Contactos, Oportunidades,
Subtareas) — mismo componente, sin diseño nuevo, solo aplicarlo parejo.

> **Estado (Fase 5, PR 33)**: parcial — el patrón C fija `min-w` en las tablas
> para que los contenedores dejen de desbordar en móvil; el tratamiento
> completo de estados vacíos en Contactos/Oportunidades/Subtareas sigue
> abierto.

### 11. Densidad de tabla configurable

Un toggle "compacta / cómoda" en Repositorio y Bitácora (persistido en
`zustand`, como la sidebar) para quien gestiona catálogos grandes y quiere
ver más filas por pantalla sin scroll — es una clase de Tailwind condicional,
no un componente nuevo.

> **Estado (Fase 5, PR 33)**: reencuadrado — el patrón C fija el ancho cómodo
> de cada columna (`min-w`), que es la referencia sobre la que un toggle de
> densidad debe operar; hacerlo antes habría producido dos anchos mínimos en
> conflicto. El toggle en sí sigue pendiente.

### 12. Indicadores visuales en el Dashboard sin librería de charts

Hoy el Dashboard es texto y números. Sin sumar una dependencia de
gráficos, un mini-indicador de tendencia (barra de progreso, sparkline
hecho con SVG/CSS puro) junto a "tareas vencidas" o "pipeline por etapa" da
lectura más rápida al abrir la pantalla — coherente con el resto del sistema
de diseño (`ToneBadge`, `PrioridadChip`) que ya usa color semántico para
comunicar estado de un vistazo.

---

## Cómo prioricé esta lista

Cada ítem cumple dos condiciones: (a) resuelve algo que un usuario real
notaría en el uso diario, y (b) se construye con lo que el proyecto ya tiene
instalado — nada de esto requiere evaluar un proveedor nuevo, negociar un
plan pago, ni una migración de infraestructura. Las mejoras que sí dependen
de eso (dominio propio para email, Supabase Pro, cobertura de tests) siguen
documentadas aparte en `docs/pendientes/pendientes-y-mejoras.md`.
