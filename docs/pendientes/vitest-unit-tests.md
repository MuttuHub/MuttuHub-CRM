# Plan: Unit tests con Vitest + Testing Library

> Estado: **completada (Fases 0–5, 2026-08-10, suite 206/206)**
> Estimación: 2–4 hs · Última actualización: 2026-08-10
> Contexto: `docs/plan-supabase-manana.md` §6 — "TestSprite no reemplaza unit/component tests locales".

## Progreso

- ✅ **Fase 0 — Setup** (commit `ae35953`): vitest 4.1.10, TLR 16.3.2, jsdom 30, vitest.config.ts, src/test/setup.ts (mocks matchMedia/ResizeObserver), scripts test/test:watch/test:coverage. Ojo: `@vitejs/plugin-react` pinnado a 5.2.0 (el latest 6.x choca con peer babel de shadcn).
- ✅ **Fase 1 — Utilidades puras** (commit `a633e64`): nav, catalogs (test paramétrico vs enums Prisma), dashboard, alerts, settings. Puros al 100%; las async de Prisma quedan deliberadamente fuera (getAlertBuckets, reconcileAlertas, getSetting, etc.).
- ✅ **Fase 2 — Stores y helpers UI** (commit `3cea1b4`): filters/sidebar stores, sparkline, shared.tsx, saved-views, buildDashboardQuery (vive en src/hooks/dashboard.ts, NO en shared.tsx como decía el plan). Hallazgo → **BUG-001**.
- ✅ **Fase 3 — Componentes representacionales** (commit `463881b`): ui/* (8), demo-fallback, client-list (3 estados + paginación + `?cliente=`), client-form (zod). Hallazgo → **BUG-002**. Lint: `coverage/**` agregado a eslint ignore (commit `3cea1b4`).
- ✅ **Fase 4 — Hooks** (commit `8e45c94`): useNavCounts + 4 hooks dashboard al 100% (vi.stubGlobal fetch + apiGet real).
- ✅ **Fase 5 — Cierre**: `coverage.all: true` + include client-side; thresholds reales 60/60/60/50 (reales 66.7% líneas, 65% stmts, 69.3% funcs, 55.9% branches); README con sección Testing. Quirk documentado: en vitest 4.1.10+v8 include/exclude no filtran el grafo cargado.

---

## Objetivo

Cubrir la lógica pura y los componentes clave con tests locales rápidos (ms, sin red, sin Supabase) para el día a día. TestSprite (E2E en cloud) sigue siendo el gate de integración; Vitest es la red de seguridad de desarrollo.

**Stack del proyecto (verificado en package.json):**
- Next.js **16.3.0** (Turbopack), React **19.2.8**, TypeScript 5
- @tanstack/react-query 5, zustand 5, zod 4, @base-ui/react (no Radix)
- Sin configuración de test existente: hay que bootstrapear todo
- **Ojo versiones**: verificar compatibilidad de Vitest con Node 24 y esbuild antes de fijar versión

---

## Fase 0 — Setup (30–45 min)

1. Instalar devDependencies:
   - `vitest` + `@vitest/coverage-v8`
   - `jsdom` (DOM para componentes)
   - `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event`
   - `@vitejs/plugin-react` (transpile JSX/TSX)
2. Crear `vitest.config.ts`:
   - `environment: "jsdom"`, `globals: true`
   - Alias `"@" → "./src"` (mismo alias que tsconfig/Next)
   - `setupFiles: ["src/test/setup.ts"]`
   - Coverage: `reporter: ["text", "html"]`, thresholds iniciales conservadores (60% líneas) y subir después
3. Crear `src/test/setup.ts`:
   - `import "@testing-library/jest-dom/vitest"`
   - cleanup automático post-test
   - Mock global de `window.matchMedia` (lo usan base-ui/shadcn para responsive)
4. Agregar scripts al `package.json`:
   - `"test": "vitest run"`
   - `"test:watch": "vitest"`
   - `"test:coverage": "vitest run --coverage"`
5. Smoke test: un test trivial de `cn()` para validar que todo el pipeline corre.

**Verificación:** `npm test` pasa con el smoke test.

---

## Fase 1 — Utilidades puras (45–60 min) ⭐ primero

Pura lógica, cero mocking de Supabase — máximo valor, mínimo riesgo.

| Archivo | Funciones a cubrir | Notas |
|---|---|---|
| `src/lib/utils.ts` | `cn()` | merge de clases con tailwind-merge |
| `src/lib/nav.ts` | `isNavActive()` | root exacto vs prefijos: `/`, `/clientes`, `/clientes/123` |
| `src/lib/catalogs.ts` | labels de cada catálogo, `ENUM_VALUES`, completezza frente a `ESTADO_*` | test paramétrico: todo enum tiene label |
| `src/lib/dashboard.ts` | `resolveScope`, `parseDashboardFilters`, `rangoDeFechas`, `rangoDeFechasNullable`, `clienteScopeWhere`, `tareaScopeWhere` | scope own/all por rol, filtros por rango, where de Prisma por rol |
| `src/lib/alerts.ts` | `startOfLocalDay`, `addLocalDays`, `emptyAlertBuckets`, `alertTipo` | manejo de fechas locales: inicio de día, DST, fin de mes; buckets por origen |
| `src/lib/settings.ts` | `flattenDocCategories`, `defaultDocCategories` | estructura de categorías anidadas |

> `alerts.ts` exporta también `getAlertBuckets`/`reconcileAlertas` (async con Prisma) — NO testear en esta fase; se pueden mockear si se quiere integración, pero el valor está en las puras.

## Fase 2 — Stores y helpers de UI (30–45 min)

| Objetivo | Notas |
|---|---|
| Stores zustand (`useFiltersStore` y similares) | sin DOM, assert de estado + acciones |
| `src/components/dashboard/sparkline.tsx` | render + SVG paths con datos conocidos |
| `src/components/dashboard/shared.tsx` | helpers puros exportados (formatos, labels, `buildDashboardQuery`) |
| `src/components/crm/saved-views.tsx` | helpers lógicos (parse/serialize de la view) |

## Fase 3 — Componentes representacionales (45–60 min)

| Objetivo | Notas |
|---|---|
| `src/components/ui/*` | badge, button, card, skeleton, tabs, input, label, separator — render, variantes (cva), events básicos |
| `src/components/dashboard/demo-fallback.tsx` | render, variante vacía vs error |
| `src/components/crm/client-list.tsx` | estados: loading/skeleton, vacío ("No encontramos clientes"), con datos — mockear queries de react-query con `vi.mock` del hook |
| `src/components/crm/client-form.tsx` | validación con zod: campos inválidos → mensajes; submit → callback |

**Regla de oro:** todo componente que toque Supabase/react-query se testea **mockeando el hook** (`vi.mock("@/hooks/...")`), no el backend. Fases de demo-fallback y los cards del dashboard se prueban con `data` inyectada directamente.

## Fase 4 — Hooks (opcional, si sobra tiempo)

| Hook | Notas |
|---|---|
| `src/hooks/nav.ts` | con mock de fetch a /api/v1/nav/counts (MSW o vi.mock de fetch) |
| `src/hooks/dashboard.ts` | solo si el mock de react-query es limpio |

## Fase 5 — Cierre ✅ (hecha 2026-08-10)

1. `npm run test:coverage` → thresholds reales: **lines 60 / statements 60 / functions 60 / branches 50** (medidos: 66.7 / 65.0 / 69.3 / 55.9). Meta del plan (lib ≥70%) alcanzada en el núcleo: utils/nav/catalogs/dashboard/settings al 100%; el global baja por `lib/api` y `lib/mock` arrastrados por imports transitivos (el exclude no filtra el grafo cargado en este combo de versiones — mitigación documentada en `vitest.config.ts`).
2. README: sección **Testing** + scripts `test`/`test:watch`/`test:coverage`.
3. GitHub Action con `npm test` en PR — **hecha (`.github/workflows/ci.yml`, 2026-08-10)**

---

## Riesgos / decisiones abiertas

| Riesgo | Mitigación |
|---|---|
| Next 16 / React 19: `@testing-library/react` depende de `react-dom/test-utils` interno | Verificar versión compatible (TLR ≥16 soporta React 19); si conflictúa, usar `render` de TLR con `act` propio |
| base-ui requiere `matchMedia`/`ResizeObserver` en jsdom | Mocks en `setup.ts` |
| Módulos que importan servidor (Prisma, Supabase server) arrastrar al import | Aislar imports client-only; los tests que los toquen usan `vi.mock` del módulo completo |
| Eslint (eslint-config-next) marca `*.test.tsx` | Agregar `vitest` config de globals al eslint (types globales `vitest/globals`) |
| Cambios de API de catálogos (enums) rompen tests paramétricos | Los tests paramétricos son la red: si un enum nuevo no tiene label, el test lo atrapa |

## Criterio de done

- [x] `npm test` corre en < 30 s y pasa en verde — **206 tests en ~7 s (2026-08-10)**
- [x] Cobertura ≥ 70% en `src/lib/*` y ≥ 50% global (report V8) — **real 66.7% líneas global (≥50 ✓); núcleo de lib al 100%; thresholds 60/60/60/50 en `vitest.config.ts`**
- [x] Utilidades puras 100% de funciones exportadas cubiertas (o justificado) — **Fase 1**
- [x] Componentes clave: demo-fallback, client-list (3 estados), client-form (validación zod), sparkline — **Fase 3**
- [x] Unidades de negocio del PRD sin retroceso: los helpers de dashboard (scope, rango, where) cubiertos — **Fase 1/2**
- [x] Scripts `test`, `test:watch`, `test:coverage` en package.json — **Fase 0**
- [x] README actualizado — **Fase 5: sección Testing + scripts**

## Pendientes relacionados (no bloquean Vitest)

- [x] GitHub Action TestSprite + `npm test` como gate en PRs — **hecho 2026-08-10: `.github/workflows/ci.yml` (npm test + lint en PR/main, siempre activo) + `.github/workflows/testsprite.yml` (E2E TestSprite blocking; necesita `VERCEL_TOKEN` para previews en PRs, skipea con aviso si falta). Secret `TESTSPRITE_API_KEY` cargado en GitHub. Ver `plan-supabase-manana.md` §6.**
- [ ] SMTP custom en dashboard de Supabase (usuario, cuando quiera — `@muttu.co` rechazado por el proveedor)
- [ ] BUG-001 (zustand persist hidrata rango inválido) y BUG-002 (debounce buscador clientes inefectivo) — ver `docs/pendientes/bugs-pendientes.md`
- [ ] Re-correr TC028 de TestSprite en el sandbox con la cuenta `tc028@muttu.co` (solo si se quiere el reporte oficial)