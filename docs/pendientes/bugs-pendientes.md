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