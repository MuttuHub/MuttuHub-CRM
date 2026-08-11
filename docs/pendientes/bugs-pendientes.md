# Bugs pendientes

> Bugs conocidos, documentados y no corregidos aún. Cada entrada tiene repro,
> impacto y fix sugerido. Se cierran cuando se corrige el código.

---

## BUG-001 — zustand `persist` hidrata un `rango` inválido sin validar

- **Estado:** ✅ resuelto · **Reportado:** 2026-08-10 (Fase 2 de tests vitest) · **Corregido:** 2026-08-11
- **Componente:** `src/store/filters.ts` (`useFiltersStore`, persist key `muttu-hub-filters`)
- **Repro:** en localStorage setear `{"state":{"rango":"1000000"},"version":0}` y crear el store → `rango` queda `"1000000"` (sin validación en `hydrate`).
- **Impacto:** `RANGO_HEADER_LABELS[rango]` devuelve `undefined` en el header; el filtro activo deja de tener label (bug cosmético, el backend/API no depende de él — el rango inválido se serializa tal cual al query, ver `buildDashboardQuery`).
- **Fix aplicado:** `merge` en el persist valida el valor hidratado contra `RANGO_OPCIONES` y cae a `"mes"` si no es válido. Test actualizado: `src/store/filters.test.ts` ("validates rango on hydrate: unknown value falls back to mes (BUG-001)").

---

## BUG-002 — Debounce del buscador de clientes inefectivo: una request por tecla

- **Estado:** ✅ resuelto · **Reportado:** 2026-08-10 (Fase 3 de tests vitest) · **Corregido:** 2026-08-11
- **Componente:** `src/components/crm/client-list.tsx`
- **Repro:** escribir en el buscador → `commit({ q })` (línea 251/302) actualizaba `applied` INMEDIATAMENTE (línea 156) → `useClients(applied)` refetchea con key distinta en cada tecla. El `useEffect` de 350 ms (líneas 143–152) solo re-aplicaba el mismo `q` después del timeout (no-op).
- **Impacto:** performance — N requests por cada frase buscada (una por tecla) en vez de 1 tras la pausa; react-query cachea por key, así que cada tecla es una key distinta.
- **Fix aplicado:** en `commit`, `q` se excluye del `setApplied` inmediato y el `useEffect` de 350 ms sobre `local.q` es el ÚNICO que propaga `q` a `applied`. `clearFilters`/`applyView` siguen aplicando directo. Tests actualizados en `src/components/crm/client-list.test.tsx` ("applies the search query only after the 350ms debounce window (no request per keystroke)" + "applies non-search filters immediately without debounce").
