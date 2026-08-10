# Bugs pendientes

> Bugs conocidos, documentados y no corregidos aún. Cada entrada tiene repro,
> impacto y fix sugerido. Se cierran cuando se corrige el código.

---

## BUG-001 — zustand `persist` hidrata un `rango` inválido sin validar

- **Estado:** pendiente · **Reportado:** 2026-08-10 (Fase 2 de tests vitest)
- **Componente:** `src/store/filters.ts` (`useFiltersStore`, persist key `muttu-hub-filters`)
- **Repro:** en localStorage setear `{"state":{"rango":"1000000"},"version":0}` y crear el store → `rango` queda `"1000000"` (sin validación en `hydrate`).
- **Impacto:** `RANGO_HEADER_LABELS[rango]` devuelve `undefined` en el header; el filtro activo deja de tener label (bug cosmético, el backend/API no depende de él — el rango inválido se serializa tal cual al query, ver `buildDashboardQuery`).
- **Fix sugerido:** validar en `hydrate`/`merge` del persist contra `RANGO_OPCIONES` (fallback `"mes"`), o `RANGO_HEADER_LABELS[rango] ?? RANGO_HEADER_LABELS.mes` en el header. La red de seguridad ya existe: `src/store/filters.test.ts` ("hydrates unknown values verbatim (known gap)").

---

## BUG-002 — Debounce del buscador de clientes inefectivo: una request por tecla

- **Estado:** pendiente · **Reportado:** 2026-08-10 (Fase 3 de tests vitest)
- **Componente:** `src/components/crm/client-list.tsx`
- **Repro:** escribir en el buscador → `commit({ q })` (línea 251/302) actualiza `applied` INMEDIATAMENTE (línea 156) → `useClients(applied)` refetchea con key distinta en cada tecla. El `useEffect` de 350 ms (líneas 143–152) solo re-aplica el mismo `q` después del timeout (no-op).
- **Impacto:** performance — N requests por cada frase buscada (una por tecla) en vez de 1 tras la pausa; react-query cachea por key, así que cada tecla es una key distinta.
- **Fix sugerido:** en `commit`, excluir `q` del `setApplied` inmediato y dejar que el `useEffect` de 350 ms sobre `local.q` sea el ÚNICO que propague `q` a `applied` (el effect ya hace `setApplied(a => ({...a, q...}))`). Cuidado con `clearFilters`/`applyView` que deben seguir aplicando `q` directo. Red de seguridad: `src/components/crm/client-list.test.tsx` ("applies the search query and keeps it after the 350ms debounce window").