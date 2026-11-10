# V1 · Oportunidades globales (lista y kanban de 7 etapas)

Estado: **abierta** (2026-11-10). Requisito en `docs/plan-trabajo-restante.md:84` (V1) y `docs/plan-accion-requerimientos-v7.md:190` (A5/C2b). Sin migración: el mapeo de etiquetas no cambia el enum.

## Specs

- **S1** — `docs/plan-accion-requerimientos-v7.md:190`: «kanban de 7 etapas con el mapeo decidido: EN_REVISION «Revisión TDR», DISENANDO_PROPUESTA «En formulación», PRESENTADA «Enviada · seguimiento», EN_NEGOCIACION «En negociación», GANADA «Aceptada», PERDIDA «Rechazada», STANDBY «En espera»» … «Las 7 columnas con total en COP; mover de etapa respeta permisos; no cambia el enum de la base».
- **S2** — `docs/plan-trabajo-restante.md:84`: «Existe una vista global con las etapas acordadas y mover una oportunidad actualiza su fase».
- **S3** — `docs/pasos-post-reunion-2026-10-14.md:81` (C2): «Endpoint global (`GET /api/v1/opportunities` con totales), kanban de 7 etapas, ficha de oportunidad.» (la ficha es V2, fuera de esta tarea).
- **S4** — `docs/plan-accion-requerimientos-v7.md:190`, columna de migración: «**no** (mapeo de etiquetas)». Nada de esta tarea puede requerir migración ni cambiar `EstadoOportunidad`.
- **S5** — La sección hoy es un marcador: `src/app/(app)/clientes/oportunidades/page.tsx` redirige a `/clientes` y `src/components/crm/clientes-subnav.tsx` no lista Oportunidades. Al terminarla, la página deja de redirigir y la sección entra al subnavigador de Clientes.

## Tasks

| ID | Qué | Specs | Ruta | Commit |
|---|---|---|---|---|
| T1 | Página + entrada de navegación, con las pruebas del redireccionamiento actualizadas | S5 | inline | — |
| T2 | `GET /api/v1/opportunities` cross-client con totales por estado + hook | S3, S4 | worker | — |
| T3 | Kanban de 7 columnas con totales en COP y mover respetando permisos | S1, S2 | worker | — |
| T4 | Pruebas de columnas, totales y permiso al mover; docs del plan | S1, S2 | inline | — |

## Decisiones tomadas al abrir

- **Columnas**: las 7 del enum, en el orden del mapeo de S1. No se agregan ni se renombran etapas.
- **Lectura cross-client**: se apoya en `hasCommercialAccess` (`src/lib/permissions.ts:55`), el mismo gate que ya usa el endpoint por cliente. Sin filtro por responsable: `clientReadScope()` devuelve `{}` desde S8.
- **Escritura (mover de etapa)**: `canManageOpportunity` (`src/lib/permissions.ts:69`), vía el PATCH que ya existe. Sin endpoint nuevo de escritura.
- **Índices**: `Oportunidad` no tiene índice por `cliente_id` ni por `estado`. S4 prohíbe migración, así que la lista ordena por `created_at` y se acepta el costo; queda anotado por si una medición futura lo pide.

## Log

- **L1** — Pedido original del usuario, textual: «cual me recomiendas?» → «dale vamos». Autoriza la recomendación previa: arrancar por **V1** antes que **B6**, porque B6 es la única del backlog que exige migración y A4 (respaldos automáticos) sigue abierto.
- **L2** — Mapa del dominio verificado el 2026-11-10: no existe endpoint cross-client; `Oportunidad` tiene `estado` y `fase`; el kanban del tablero de tareas ya distingue `oportunidad_fase`; `clientes/oportunidades/page.tsx` es un `redirect("/clientes")` de 9 líneas y `clientes-subnav.test.tsx:69-72` lo fija en `REDIRECTED_PAGES`.
