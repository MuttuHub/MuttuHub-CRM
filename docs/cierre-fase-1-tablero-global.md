# Cierre de Fase 1 — Tablero global (permisos)

**Estado:** entregado en `origin/main` · **Fecha:** 2026-09-02 · **Versión:** 1.0 · **Verificación SDD:** PASS_WITH_CONDITION (43/43 escenarios, 785 tests verdes)

---

## Resumen ejecutivo

La Fase 1 del plan `voy-a-hacer-un-synthetic-rabin.md` se ejecutó completa bajo SDD (cambio `close-phase-1`,
chained PRs stacked-to-main) y se empujaron **25 commits a `origin/main`** (rango `868cfa9..e4c4a78`). El
tablero dejó de estar scopeado por rol: **todos los roles ven todas las tareas y todos los clientes**, con la
escritura protegida por `puede_editar` (servidor como autoridad). Los 7 PRs del plan están implementados y
verificados.

| PR | Contenido | Commits | Estado |
|---|---|---|---|
| 1 | `src/lib/permissions.ts` (módulo puro) + delegación en `getTaskForWrite`/`getClientForWrite` + migración de gates de docs a `canReadRestrictedDocs`/`canManageAny` | `868cfa9`, `ce217c0`, `91152e6` | ✅ |
| 2 | `puede_editar` emitido en respuestas de Tarea y Cliente (sub-entidades heredan) | `eeb1bd2` (RED) + `ea7949a` (GREEN) | ✅ |
| 3 | **Lecturas globales** — los 9 sitios READ-SCOPE: clients list/detail, dashboard (`resolveScope` eliminado → `"all"` literal), attachments download (write gate → read gate preservando el 403 de `Documento.categoria`), cron/daily creado (personal), report + export | `3e6a535`..`d62e236` + `b9c5486` | ✅ |
| 4 | UI affordances con `puede_editar` — `useSortable({disabled})`, destructivos ocultos, campos disabled | `575d1eb` (RED) + `7b2684e` (GREEN) + `5e5a12a` (e2e) | ✅ |
| 5 | Toggle "Mi tablero / Equipo" eliminado + `localStorage.removeItem("muttu:kanban:scope")` | `d0b9912` | ✅ |
| 6 | Filtros prioridad/etiqueta/fecha al servidor + banner truncado + auditoría de exports (`accion: "exportar"`) | `5837aae` (RED) + `8f02782`/`3975eee` (GREEN) + `6657d6e` (docs) | ✅ |
| 7 | `useInfiniteQuery` + botón "Cargar más" (tope de 100 eliminado) | `239987f` (RED) + `d8576b3` (GREEN) | ✅ |

---

## 1. Decisiones de arquitectura que quedaron

| Decisión | Detalle |
|---|---|
| Dos predicados, un rol list | `canManageAny` (escritura) + `canReadRestrictedDocs` (confidencialidad de docs) = mismo valor, semántica distinta. `isFullAccess` **queda vivo** en `crm.ts` (11 call sites: notifications, cron, etc.) — se usa para el read-scope remanente que el plan dejó intacto |
| Servidor como autoridad | `puede_editar` es calculado por el server; la UI solo lo consume. Un PATCH spoofeado con el flag en `false` sigue devolviendo 403 |
| PR 3 + PR 4 deploy-gated | Lecturas globales (PR 3) y UI gates (PR 4) salen en el mismo release — sin B2, un COLABORADOR vería tareas ajenas con botones que dan 403 |
| `fecha_entrega` fusionada sin `AND` | El rango `{gte,lte}` se fusiona en el mismo objeto que `vencidas` (`{lt}`) — Prisma rechaza claves duplicadas a nivel plano; AND habría roto la query |
| `total` honesto | El `count` del response excluye prioridad/etiqueta/fecha (mide truncación, no filtros) — el banner "Mostrando N de M" no miente |
| "Cargar más" button, no infinite scroll | El Kanban no está virtualizado; un scroll listener pelearía con `@dnd-kit` |

---

## 2. Verificación (sdd-verify, PASS_WITH_CONDITION)

Reporte: `openspec/changes/close-phase-1/verify-report.md`

### Escenarios
| Capability | Escenarios | Cubiertos |
|---|---|---|
| `task-write-boundaries` (PR 2 + PR 4) | 13 | 13 |
| `global-task-board` (PR 3 + PR 6 + PR 7) | 30 | 30 |
| **Total** | **43** | **43 (100 %)** |

### Sentinels de confidencialidad (todos PASS)
- `git diff origin/main -- src/app/api/v1/documents/` → **vacío** (la frontera de categorías restringidas sigue intacta)
- `prisma/schema.prisma` → sin diff (cero cambios de esquema en Fase 1)
- `package.json`/`pnpm-lock.yaml` → sin diff (cero dependencias nuevas)
- `notifications/route.ts` + `cron/daily/route.ts` → siguen **personales** (COLABORADOR → `"own"`)
- 403 de `Documento.categoria` en el download preservado (un COLABORADOR no puede adjuntar un doc Legal a su propia tarea y bajarlo)
- `permissions.test.ts` (matriz de permisos) pasa sin modificación

### Tests
- 785 tests verdes · `tsc --noEmit` limpio · `eslint` exit 0
- 14 fallos pre-existentes de **entorno** (pasan en CI): `auth/confirm/page.test.tsx`, `users/route.test.ts`, `tasks/export/route.test.ts` + `clients/export/route.test.ts` (resolución de `exceljs` en Windows)

---

## 3. Pendientes de Fase 1 (no bloquean Fase 2)

| # | Pendiente | Tipo | Detalle |
|---|---|---|---|
| 1 | **Sign-off de owner-of-data** | Decisión del dueño | Los PRs 3+4 globalizaron lecturas; después de esto la única frontera de confidencialidad para un COLABORADOR son las categorías restringidas de documentos. Confirmar por escrito que compartir todos los datos de clientes/tareas es aceptable (campos sensibles: `Oportunidad.valor_estimado_cop`, `Contacto.correo/telefono`, `Cliente.riesgos_barreras`). El cambio ya está en `main`. |
| 2 | `loadClientScoped`/`loadTaskScoped` | Deuda de código | Quedaron como dead code en `src/lib/api/crm.ts` tras abrir lecturas. Borrarlos en commit aparte. |
| 3 | 2 `count()` por request de lista | Perf | El `total` añade un segundo count. Aceptable ≤1000 filas; medir tras globalización. |
| 4 | `clients/route.ts` O(n²) | Perf | Carga tabla completa + 3 agregados por request; `enriched.find()` dentro de `.map()`. Ya anotado en el plan §Verificación. |
| 5 | `clients/route.ts` `nextTasks` global | Perf | `take: ids.length` sobre query globalmente ordenada → `next_compromiso` null en muchos clientes. Ya anotado en el plan §Verificación. |
| 6 | Fork innecesario | Limpieza | Se creó `agutierrezreginodev/MuttuHub-CRM` (fork) al intentar pushear con la cuenta equivocada desde Windows. Borrar; el push directo va por WSL con la cuenta `MuttuHub`. |

---

## 4. Nota operativa: push a la org

- El repo `MuttuHub/MuttuHub-CRM` da **403 al push** con la cuenta `agutierrezreginodev` (solo lectura, `push: false`).
- El push directo se hace **desde WSL**, donde `gh auth status` tiene la cuenta **`MuttuHub` activa** (`/home/adrian/.config/gh/hosts.yml`) con scopes `gist, read:org, repo, workflow`.
- Comandos: en WSL `gh auth setup-git && git push origin main` desde `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM`.
- El `gh` de Windows (opencode) es `agutierrezreginodev` — solo sirve para leer.

---

## 5. Próximo paso: Fase 2 — Documentos

El plan define los PRs 8-16. Orden de arranque:

| PR | Contenido | Depende de |
|---|---|---|
| 8 | Esquema: `Carpeta`, `carpeta_id`, `contenido_texto`, `texto_estado`, 3 índices faltantes, GIN crudo | — |
| 9 | API de carpetas (CRUD + ciclos + profundidad + bloqueo de no-vacía) | 8 |
| 10 | `PATCH /documents/:id` + filtro `carpeta` | 8 |
| 11 | Rail de carpetas + navegación + crear | 9 |
| 12 | Renombrar / eliminar / mover | 9 |
| 13 | Aceptar `.pptx` + extracción de texto (4 tipos, `unpdf`/`jszip`/`exceljs`) — paralelizable con 9-12 | 8 |
| 14 | Búsqueda full-text + snippet + fix de `etiquetas` | 8 |
| 15 | Asignar a tarea (doble gate) | 8 |
| 16 | Backfill de texto + `docs/pendientes/busqueda-semantica.md` | 13, 14 |

> Restricciones que conserva el plan: **una sola dependencia nueva** (`unpdf`), PRs ≤400 líneas,
> y alertas de OJO: el índice GIN vive en SQL crudo (Prisma no lo modela) — nunca `prisma db push` en este
> esquema, y borrar el `DROP INDEX` que genere la próxima migración automática.