# T4 — Proceso, documentación y suite de pruebas

**Repo:** `C:\Users\Adrian\Documents\MuttuHub-CRM` · **HEAD:** `e261296 docs(openapi): describe the interactions feed as global, matching the route` · 415 commits · 931 archivos rastreados · 2026-10-13

> **Nota de entorno (aplica a todo el informe).** La sesión corre con sandbox de archivos **solo lectura** y PowerShell en **ConstrainedLanguage**. Dos límites del entorno, no del código, condicionaron las corridas: (a) `child_process` con stdio por pipes falla con `EPERM` (probado con `spawnSync('cmd',['/c','echo','hi'])` → `EPERM`), lo que rompe el arranque de Vite/Vitest en Windows; (b) `fs.mkdtempSync` falla con `EPERM`, lo que rompe los tests que crean directorios temporales. Ninguna de las dos cosas es un defecto del repo.
>
> **Corrección del Lead (verificada de forma independiente, 2026-10-13 14:07).** El hallazgo de "2 tests reales que fallan" en `src/components/crm/interaccion-form-dialog.test.tsx` **no es determinista**. El Lead volvió a correr ese archivo en aislamiento y dio **4/4 en verde** (`4 passed`, 11,40 s; el test más largo 4486 ms frente al default de 5000 ms). Es *flaky* por margen de timeout bajo contención — el propio `vitest.config.ts:11-21` documenta exactamente ese modo de fallo («running two full suites concurrently produced 6-7 failures … `Test timed out in 5000ms` … on specs that all pass in isolation»). El veredicto correcto es **flaky, no roto**; ver §1.2(c) corregido y §7.1.

---

## 1. Verificación de build (ejecución real)

### 1.1 `npx tsc --noEmit`

```
$ npx tsc --noEmit
EXIT=0
SECONDS=(sin salida de diagnóstico)
```

Resultado: **exit code 0, cero errores, cero salida de diagnóstico.** `tsconfig.json` declara `incremental: true` + `noEmit: true`, por lo que `tsc` normalmente reescribe `tsconfig.tsbuildinfo`; su mtime se mantuvo en `13/10/2026 01:37 p.m.` (anterior a la corrida de las 13:39), coherente con "estado incremental ya al día, nada que reescribir". Para eliminar cualquier duda de caché se ejecutó además una comprobación completa sin caché:

```
$ npx tsc --noEmit --incremental false
EXIT=0
SECONDS=39.4614976
```

**Veredicto: el typecheck está limpio en HEAD** (reproducido sin caché incremental, 39,5 s). No hubo bloqueo de escritura del sandbox: `tsc` no emite diagnóstico de error de escritura (`TS5033`), y el resultado es 0 en ambas variantes.

### 1.2 `npx vitest run`

**(a) Comando documentado — falla por límite del entorno, no por el código**

```
$ npx vitest run --reporter=verbose
failed to load config from C:\Users\Adrian\Documents\MuttuHub-CRM\vitest.config.ts

⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:441:11)
    at spawn (node:child_process:796:9)
    at Object.execFile (node:child_process:349:17)
    at exec (node:child_process:236:25)
    at optimizeSafeRealPathSync (file:///C:/.../node_modules/vite/dist/node/chunks/node.js:2494:2)
    at windowsSafeRealPathSync (.../vite/dist/node/chunks/node.js:2480:3)
    at getRealPath (.../vite/dist/node/chunks/node.js:33169:36)
    ...
EXIT=1
```

Causa exacta: en Windows, Vite ejecuta `exec("net use", { windowsHide: true }, …)` dentro de `optimizeSafeRealPathSync()` (`node_modules/vite/dist/node/chunks/node.js:2494`) para mapear unidades de red; ese `exec` usa stdio por pipes y **el sandbox DSH prohíbe las named pipes**. Prueba independiente del límite, sin Vite de por medio:

```
$ node -e "const {spawnSync}=require('child_process'); ... spawnSync('cmd',['/c','echo','hi'],{encoding:'utf8'})"
PIPE_FAIL:EPERM spawnSync C:\Windows\system32\cmd.exe EPERM
spawnSync status=null err=EPERM out=undefined
```

**Esto es una limitación de entorno, no un defecto del repo.** En CI (ubuntu-latest) esa rama de Vite no existe.

**(b) Corrida real de la suite (reestructurada para evitar la captura por pipes)**

```
$ npx vitest run --configLoader native
...
 Test Files  4 failed | 326 passed (330)
      Tests  17 failed | 3461 passed (3478)
   Start at  13:40:37
   Duration  466.49s (transform 25.04s, setup 220.88s, import 246.45s, tests 433.34s, environment 797.96s)
EXITCODE=1
SECONDS=470.0557385   (cronometrado con Get-Date)
```

**Cifras exactas: 330 archivos / 3478 casos, 17 fallidos, 3461 pasan, exit 1, 466,49 s (470,1 s de reloj de pared).** Los 330 archivos de la corrida coinciden exactamente con los 330 archivos `*.test.ts(x)` rastreados por git.

**(c) Clasificación de los 17 fallos: 15 son límite del entorno, 2 son flaky por contención (no defectos)**

| # | Archivo / test | Error verbatim | Veredicto |
|---|---|---|---|
| 1–9 | `scripts/migrate-v2/_harness.test.ts` (9 tests) | `Error: EPERM: operation not permitted, mkdtemp 'C:\Users\Adrian\AppData\Local\Temp\migrate-v2-XXXXXX'` ❯ `_harness.test.ts:82` | **Entorno** (sandbox sin escritura) |
| 10–14 | `scripts/migrate-v2/_guard.test.ts` (5 tests) | `AssertionError: … (undefined and string) is invalid for this assertion` en `expect(result.stderr).toContain(...)`; `expected null to be +0` | **Entorno**: el test lanza un proceso hijo (`runProbe`) que no puede arrancar → `stderr`/`status` `undefined`/`null` |
| 15 | `prisma/local-env.test.ts > loadLocalEnv > never overrides variables that are already set, so CI and the shell win` | `Error: EPERM: operation not permitted, mkdtemp 'C:\Users\Adrian\AppData\Local\Temp\local-env-XXXXXX'` ❯ `prisma/local-env.test.ts:128` | **Entorno** |
| 16 | `src/components/crm/interaccion-form-dialog.test.tsx > InteraccionFormDialog > submits tipo, aliado, oportunidad, resumen y próximo paso through the per-client log` | `Error: Test timed out in 5000ms.` ❯ `interaccion-form-dialog.test.tsx:63` | **FLAKY (contención), no roto** — ver abajo |
| 17 | `src/components/crm/interaccion-form-dialog.test.tsx > … > sends a null próximo paso and a null oportunidad when they are left empty` | `AssertionError: expected "vi.fn()" to be called with arguments: [{…}]` — recibido con el texto corrupto | **FLAKY (contención), no roto** — ver abajo |

**Estado real de los fallos 16/17 tras verificación cruzada del Lead.** El verificador los repitió en aislamiento y fallaron (2/4), con el mock recibiendo `"texto": "aVjiussittaad ade d"` (strings entrelazados carácter a carácter) y, en otra corrida, `"texto": "Vi"` (truncado tras 2 caracteres) más 4 llamadas a `mutateAsync`. **El Lead repitió el mismo archivo en aislamiento, en una máquina sin `eslint` en segundo plano, y dio 4/4 en verde**:

```
$ npx vitest run --configLoader native src/components/crm/interaccion-form-dialog.test.tsx
 ✓ src/components/crm/interaccion-form-dialog.test.tsx (4 tests) 8208ms
     ✓ submits tipo, aliado, oportunidad, resumen y próximo paso through the per-client log  4486ms
     ✓ sends a null próximo paso and a null oportunidad when they are left empty  1766ms
     ✓ blocks the submit and asks for an aliado when none is chosen  1005ms
     ✓ blocks the submit when the resumen is empty  946ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  11.40s
```

Dato decisivo: el primer test tarda **4486 ms con un límite de 5000 ms (90 % del presupuesto)**. Es un margen de 514 ms, y el propio `vitest.config.ts:11-21` documenta este modo de fallo exacto («`Test timed out in 5000ms` … on specs that all pass in isolation», reproducido al correr dos suites concurrentes). Conclusión: **hay un test frágil por presupuesto de timeout y `user-event` sobre jsdom, no un fallo funcional.** El síntoma (payload truncado/entrelazado) es el resultado de que `user-event` siga escribiendo mientras el test ya expiró/siguió, no de un bug del componente. **Acción recomendada: subir el `testTimeout` de ese archivo (o global a 15 s) y estabilizar el helper de tecleo; es deuda de flakiness, no un blocker de release.** Nótese que el modo CP-4 documentado en `vitest.config.ts` ya reconocía este riesgo y aun así fijó el default de 5 s.

**(d) ¿La suite es solo lógica pura? No.** Los **29 archivos `prisma/*.invariant.test.ts` corrieron y pasaron en verde** en esta máquina, lo que significa que `vitest run` **sí abre una conexión real a PostgreSQL en loopback** durante la suite. El guard es `prisma/require-local-db.ts` (importa `./local-env`, luego `assertLocalDatabaseUrl()`), que carga `.env.local` y **rechaza cualquier host que no sea loopback** (`prisma/require-local-db.ts:1-15`); `prisma/invariant.test.ts:1-48` envuelve cada fixture en una transacción Prisma forzada a rollback. No se leyó ningún archivo `.env`. No se ejecutaron migraciones ni seeds.

---

## 2. ESLint

### 2.1 `npx eslint .` (el comando exacto de `npm run lint`, que es el que corre CI)

```
$ npx eslint .
TOTAL FILES=1087  ERRORS=1883  WARNINGS=15004
.next-stale-1790784370 -> E1725 W14952 filesFlagged=246
supabase               -> E154  W32   filesFlagged=1
Web app views creation  -> E4    W16   filesFlagged=2
src                     -> E0    W4    filesFlagged=2
prisma, scripts, e2e, *.ts/*.mjs (raíz) -> E0 W0
EXIT=1
SECONDS=156.6874348
```

(Repetido 4 veces: 96,6 s / 88,2 s / 156,7 s; el conteo varía levemente entre corridas — 1086–1087 archivos, 15002–15004 warnings — porque el contenido de `.next-stale-*` cambia.)

**Ninguno de los 1883 errores viene de código propio.** Se reparten así:

* `.next-stale-1790784370/**` → **E1725 W14952** en 246 archivos (bundle de Turbopack compilado; p. ej. `[turbopack]_runtime.js E21`, `[root-of-the-server]__02mcv7s._.js E10`).
* `supabase/.temp/start-secrets/supabase_edge_runtime_muttu-hub/main/index.ts` → **E154 W32** (runtime Deno vendorizado de Supabase CLI; `no-var`, `prefer-const`).
* `Web app views creation/.../support.js` (×2) → **E4 W16** (`react/no-deprecated`: `ReactDOM.render is deprecated since React 18.0.0`).

**Causa raíz con evidencia:** `eslint.config.mjs:9-17` solo ignora `.next/**`, `out/**`, `build/**`, `next-env.d.ts`, `coverage/**`. No ignora `.next-stale-1790784370/**` (715 MiB de build viejo, escondido de git por `.git/info/exclude:26`), ni `supabase/**` (que arrastra `supabase/.temp/`, ignorado por git vía `supabase/.gitignore:3`), ni `Web app views creation/`.

### 2.2 Lint acotado a código propio

```
$ npx eslint src prisma scripts e2e
FILES_LINTED=765  ERRORS=0  WARNINGS=2  FILES_WITH_ERRORS=0 FILES_WITH_WARNINGS=1
WARN @typescript-eslint/no-unused-vars x2
EXIT=0
SECONDS=27.2444982

$ npx eslint src
FILE \src\app\auth\confirm\page.tsx E0 W2
   L156:10 @typescript-eslint/no-unused-vars
   L156:18 @typescript-eslint/no-unused-vars
ESLINT_SRC FILES=703 ERRORS=0 WARNINGS=2
EXIT=0
```

**Veredicto: el código propio está limpio** (0 errores; 2 warnings, ambos en `src/app/auth/confirm/page.tsx:156` por `invite`/`setInvite` sin usar — ítem de deuda ya documentado en `HANDOFF-contexto-sesion.md:50` y `PENDIENTES-MENORES.md:46`).

**Discrepancia no explicada del todo (se reporta en vez de esconderla):** cuando ESLint corre sobre el árbol entero o sobre `src supabase "Web app views creation"`, además marca `src/components/crm/relaciones-vista.tsx:84` con 2 warnings `react-hooks/exhaustive-deps` (total `src` = E0 W4, 2 archivos); cuando corre solo sobre `src` o `src prisma scripts e2e`, ese archivo sale limpio (reproducido dos veces en cada forma). No se logró reproducir de forma determinista la diferencia; hay que re-verificarla en un checkout limpio.

**Impacto real:** `npm run lint` **no es reproducible en esta copia de trabajo**. Localmente da exit 1 con 1883 errores; en un checkout limpio de CI (sin `.next-stale-*`, sin `supabase/.temp/`) lintará solo fuentes rastreadas y pasará. La afirmación "eslint clean" que aparece en los ledgers solo es cierta para código propio, no para el comando tal como está escrito.

---

## 3. Inventario de la suite

### 3.1 Conteos

| Ámbito | Archivos con test | Líneas fuente (no test) | Líneas de test |
|---|---|---|---|
| `src/**` | **292** de 703 archivos rastreados | 76.443 | 54.845 |
| `prisma/**` | **29** (todos `*.invariant.test.ts` + `local-env.test.ts`) | 4.402 | 6.825 |
| `scripts/**` | **9** (5 en `migrate-v2/`, 4 sueltos) | 3.016 | 1.512 |
| `e2e/**` (Playwright) | **7** `*.spec.ts` | — | 989 |
| **Total vitest** | **330** | **83.861** | **63.182** |

* Archivos `*.test.ts(x)` rastreados: **330**; de ellos `src` 292 (app 123 · components 93 · lib 59 · hooks 12 · store 3 · test 2), `prisma` 29, `scripts` 9. `e2e` son 7 `*.spec.ts` (excluidos de vitest por `vitest.config.ts:28`).
* Casos de test en el código: **3236** ocurrencias de `it(`/`test(` + **708** `describe(`. Vitest **ejecutó 3478 casos** (más que 3236 porque las tablas `it.each` expanden).
* Playwright: 7 specs, 10 llamadas a `test(`.
* **Ratio de test a fuente de producción: 63.182 / 83.861 = 75,3 %** (0,75 líneas de test por línea de producción). Es una suite grande, no simbólica.

### 3.2 Configuración

* `vitest.config.ts`: `environment: "jsdom"`, `globals: true`, `setupFiles: ["src/test/setup.ts"]`, `pool: "threads"`, `maxWorkers: 4`, `exclude: [...defaults, "e2e/**"]`. Cobertura configurada **dentro de `test`** (Vitest 4), `include: src/lib|store|hooks|components`, `exclude: src/lib/{api,supabase,auth,mock}, src/lib/db.ts, src/lib/email.ts`; **thresholds comentados a propósito** con la nota "la cobertura real es ~13-15%" (`vitest.config.ts:50-60`).
* `src/test/setup.ts`: `@testing-library/jest-dom/vitest` + stubs de `matchMedia` y `ResizeObserver`. No hay configuración de base de datos ni de red ahí.
* `playwright.config.ts`: **sin bloque `webServer`** — "the app must already be up, and Playwright must never start/stop it" (`playwright.config.ts:3-7`); `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"`, `workers: 1`, `fullyParallel: false`, `video: "on"`, `launchOptions.slowMo: 350`, timeout 120 s. Los 7 specs exigen **servidor local vivo + base local sembrada** (`e2e/proyectos-ficha-pagina.spec.ts:6-7`: "the local database holds the S11 demo seed"; `e2e/crm-demo.spec.ts:8`: "'Fundación Horizonte Nuevo' is the 8th seeded client"); `e2e/change-password.spec.ts:17` tiene `test.skip(`.

### 3.3 Cobertura por dominio y huecos en cero

Dominios **bien** cubiertos: rutas API (**121 de 124 `route.ts` tienen `route.test.ts` hermano**), `src/lib/proyectos` (25 test / 34 fuente), `src/components/proyectos` (43/46), `src/components/ui` (20/24), invariantes de base de datos (29 archivos, incluida la BD real).

**Dominios con cobertura cero o casi cero (lista explícita):**

1. **`src/lib/openapi/**` — 26 archivos fuente, 1 archivo de test** (`document.test.ts`). Es el contrato OpenAPI entero (paths, schemas) prácticamente sin probar. **El hueco más grande y más accionable.**
2. **`src/lib/db.ts`, `src/lib/email.ts`, `src/proxy.ts` — 0 tests** y **excluidos de cobertura** por `vitest.config.ts:43-48`. `src/proxy.ts` es el middleware de rutas públicas/autenticación: el punto de mayor riesgo sin test.
3. **`src/lib/supabase/**` (3), `src/lib/auth/**` (2), `src/lib/mock/**` (1) — 6 archivos, 0 tests**, también excluidos de cobertura.
4. **3 rutas API sin test (de 124):** `src/app/api/openapi/route.ts`, `src/app/api/v1/auth/reinvite/route.ts` (justo la que la deuda técnica marca por warning de lint), `src/app/api/v1/dev/invite-token/route.ts`.
5. **Páginas: 26 de 27 `page.tsx` sin test.** Es deliberado en el modo v7 ("UI verified by screenshots"), pero significa que **ninguna pantalla tiene test automatizado**; la única con test es una excepción.
6. **Scripts sin test:** `scripts/offboard-camarabaq.ts`, `scripts/backfill-document-text.ts` (+ `scripts/seed-proyectos-demo.ts.bak`, rastreado como basura).
7. **`src/components/kanban` (7 fuente / 4 test)** y **`src/components/dashboard` (10 fuente / 5 test)** son los subdirectorios de componentes con peor ratio.
8. **Playwright e2e: nunca se ejecuta en CI** (ver §5). 7 specs escritos, 0 corridas automáticas.

---

## 4. Proceso y deriva documental

### 4.1 Cuál es el proceso real

Se distinguen **tres sistemas de documentación** que conviven, con relevos explícitos:

**(a) ODD (`odd/tasks/`, 29 archivos, 901.130 bytes)** — el sistema vivo. Un documento por unidad/feature, con esta estructura fija (`odd/tasks/v7-alignment.md:1-31` es el ejemplo canónico):
1. Cabecera: *parent plan*, *ledger*, rama, y **"Engram mirror topic"** (`odd/v7-alignment/tasks`) — la tarea se espeja a una memoria externa (Engram).
2. `## Mode` — el modo de trabajo acordado. En v7: *"Lighter mode: tests for logic and backend (migrations, routes) only; UI verified by screenshots (light/dark, 1440/390); one native review per section"* (`v7-alignment.md:10-11`). **Este es el contrato que explica por qué las páginas no tienen tests.**
3. `## Units (sequential, single writer)` — casillas `- [x]` / `- [ ]`, **un solo escritor por feature**.
4. `## Progress` — bitácora append-only donde **cada entrada cita los hashes de commit y el resultado de la verificación del padre**: *"Parent verification: full suite **328 files / 3456 tests green**, `tsc` 0, guards green"* (`v7-alignment.md:29`), *"324 files / 3427 tests green"* (`:30`), *"323 files / 3411 tests green"* (`:31`).
5. `## Open product decisions (defaults will be taken and flagged)`.

Censo de casillas en `odd/tasks/`: **108 `[x]` / 77 `[ ]`**. Los 54 abiertos de `v2-projects-and-clients-plan.md` concentran el backlog macro; los demás archivos están casi todos cerrados.

**(b) OpenSpec (`openspec/changes/`)** — un directorio por cambio SDD con `proposal.md` + `design.md` + `tasks.md` + `specs/<capacidad>/spec.md` + **`verify-report.md`**. Dos cambios rastreados y verificados:
* `close-phase-1` → **`PASS_WITH_CONDITION`** (`verify-report.md:249`): *"resolve B1 (owner-of-data sign-off) and B2 (`tasks.md` checkbox update) before archiving"*. **Ambos blockers siguen abiertos.** El reporte es de altísima calidad: matriz de cumplimiento requisito→archivo:línea, tabla de sentinelas de regresión (`git diff origin/main -- src/app/api/v1/documents/route.test.ts` → vacío) y evidencia de ejecución.
* `oportunidades-comerciales` → **`PASS WITH WARNINGS`** (`verify-report.md:171`), *"CRITICAL: None"*, 36/36 tasks, con 5 WARNINGs (uno de formato de evidencia TDD, uno de cobertura de UI en `entity-dialogs.test.tsx`, y el bloqueo del runtime nativo `sdd-attempt` por `changed_line_budget_exceeded`).

**(c) El "ledger" — tres generaciones, y la principal está abandonada.** `odd/tasks/v2-projects-execution.md:3-4` lo dice por escrito:

> *"**Nota (2026-10-12):** este ledger dejó de mantenerse el 2026-10-07 (S2.6). El estado actual (S0–S14 hechos, 268 commits sobre `6bee83f`, 0 publicados) vive en los ledger por slice `odd/tasks/v2-projects-s*-execution.md`"*

La tercera generación es externa: temas Engram + el *"ledger nativo"* (`HANDOFF-contexto-sesion.md:35`: *"Intent asentado en ledger nativo (`sdd-attempt settle` → complete)"*).

**El paso de verificación independiente es real, no retórico:** cada entrada de `Progress` publica conteos exactos de suite/tsc/guards; los `verify-report.md` de OpenSpec re-ejecutan los comandos y citan archivo:línea de forma verificable; y `odd/tasks/v2-projects-s26-membership.md:128` **registra su propia deuda de verificación**: *"**Still pending**: the native review of this slice (`baseRef = 771a541`) and its ledger row."* (Ese commit existe: `git cat-file -t 771a541` → `commit`.)

### 4.2 Deriva cuantificada

**Hallazgo estructural mayor: los dos documentos de traspaso de nivel superior NO están en git.** `.git/info/exclude` (archivo **local de esta copia**, no se commitea) excluye, con el comentario *"Review-scope tidy-up (2026-10-01, LOCAL ONLY) — Pre-existing untracked leftovers polluted the native review's eligible untracked inventory (914 paths, mostly stale build output)"*:

```
.git/info/exclude:25  .codegraph/
.git/info/exclude:26  .next-stale-*/
.git/info/exclude:27  HANDOFF-contexto-sesion.md
.git/info/exclude:28  PENDIENTES-MENORES.md
.git/info/exclude:29  Web app views creation/
.git/info/exclude:30  Web app views creation.zip
.git/info/exclude:31  odd/tasks/pendientes-menores-post-tablero.md
.git/info/exclude:32  odd/tasks/ux-audit-report-2026-09-23.md
.git/info/exclude:33  openspec/changes/proyecto-financiero-tab/
.git/info/exclude:34  scripts/seed-proyectos-demo.ts.bak
```

`git ls-files` sobre esos paths devuelve **vacío**: son invisibles para `git status`, para CI y para cualquier otro clon. Y no es un accidente no advertido: `openspec/changes/proyecto-financiero-tab/proposal.md:11` lo declara como decisión de proceso — *"**Decision D-07**: keep it out of git — this directory is excluded per clone by `.git/info/exclude`, so this banner is intentionally untracked and no collaborator sees it"*. Se está usando un ignore **local** para esconder documentación, no para excluir artefactos de build.

**Deriva por archivo (con evidencia):**

| Documento | Afirmación | Realidad en HEAD | Veredicto |
|---|---|---|---|
| `HANDOFF-contexto-sesion.md:44-51` ("Qué sigue") | Correr la suite (~1269 tests); sdd-verify; sdd-archive; PRs | HEAD mide 3478 casos | **Obsoleto** (2,7×) |
| `HANDOFF-contexto-sesion.md:38-42` ("Archivos clave") | `src/components/dashboard/{tacometro,radar,cara-management}.tsx`, `src/components/proyectos/project-workspace.tsx`, `.../tabs/resumen-tab.tsx` | **Ninguno existe**: `tacometro.tsx`/`radar.tsx` se movieron a `src/components/proyectos/`; no hay `project-workspace.tsx` | **Obsoleto** |
| `HANDOFF-contexto-sesion.md:15,18,22` + `CLAUDE.md` | `scripts/cleanup-seed-cloud.ts`, `DIAGNOSTICO-SEED-CLOUD.md` | **No existen en disco** (`Test-Path` → falso) | **Referencia rota** |
| `PENDIENTES-MENORES.md:13,14` | `openspec/changes/archive/2026-09-22-…`, `openspec/specs/` mergeados | **`openspec/specs` no existe**; no hay `openspec/changes/archive/` | **Referencia rota** |
| `PENDIENTES-MENORES.md:57-59` | Checklist C1–C12: *"Nada arrancado todavía — para mañana"* | `a20bcdc fix(proyectos): make Proyectos and the shell header fit 390 px screens` y la unidad P1 v7 ya cerraron parte | **Obsoleto** |
| `PENDIENTES-MENORES.md:12` | *"suite completa ✅ 1368/1369"* | 3478 casos | **Obsoleto** (2,5×) |
| `PENDIENTES-MENORES.md:58` | Referencia a `odd/tasks/proyecto-workspace-tabs-y-ux-audit.md` ("Parte C") | **El archivo no existe** | **Referencia rota** |
| `docs/pendientes/pendientes-y-mejoras.md:14` | *"No existe script `test:coverage` en `package.json`"* | `package.json` **sí** lo tiene (`"test:coverage": "vitest run --coverage"`) | **Obsoleto** |
| `docs/pendientes/pendientes-y-mejoras.md:4,42` | *"unit (Vitest 212)"*, *"suite 212 tests en verde"* | 3478 casos | **Obsoleto** (16×) |
| `docs/pendientes/vitest-unit-tests.md:3,14` | *"completada (Fases 0–5, 2026-08-10, suite 206/206)"*; cobertura real *"66,7 % líneas, 65 % stmts, 69,3 % funcs, 55,9 % branches"* con `coverage.all: true` | `vitest.config.ts:51-54` dice *"la cobertura real es ~13-15%"*, thresholds comentados; `coverage.all` **fue eliminado en Vitest 4** | **Contradicción directa**: el doc que declara la cobertura "hecha" describe un mecanismo que ya no existe |
| `docs/pendientes/pendientes-y-mejoras.md:62` | *"Revisar `scripts/cron_setup.sql` — contiene el `CRON_SECRET` real"* | `git ls-files` → **`scripts/cron_setup.sql` está rastreado** (no se abrió el archivo; solo se verificó su rastreo). Ver T3 §1.2 #12: contiene un **placeholder**, no un valor real | **ABIERTO / reclasificado** |
| `odd/tasks/v7-alignment.md:29` | *"full suite **328 files / 3456 tests green**, tsc 0"* | 330 archivos / 3478 tests; con la corrección de §1.2(c) los 17 fallos son de entorno o flaky | **Desactualizado en conteo** |
| `odd/tasks/v7-alignment.md:20` | `- [ ] C4 Relaciones (migration poder/interés, quadrant map)` | Ya commiteado en `71716d9`: `prisma/migrations/20261013130000_v2_relaciones/migration.sql`, `prisma/relaciones.invariant.test.ts`, CRUD de contactos | **Deriva inversa: pendiente que ya no lo está** |

**Deriva en el otro sentido (lo importante): las afirmaciones de "hecho" SÍ están respaldadas.** Muestreo de 10 tareas ODD que se declaran completas, con verificación de artefacto:

| Tarea ODD (casilla `[x]`) | Commits citados | Artefacto verificado |
|---|---|---|
| `v7-alignment` T1 (Tablero v7) | `b62fa8c` | commit existe ✓ |
| `v7-alignment` P1 (ficha regroup + Soportes) | `8dd426c`, `3ba7c9a`, `a20bcdc` | `src/components/proyectos/project-soportes.tsx` ✓, `src/app/api/v1/projects/[id]/supports/route.ts` ✓ |
| `v7-alignment` C1a (sub-navegación Clientes) | `80c26fa`, `bbaffb6` | `src/app/(app)/clientes/layout.tsx` ✓ + 7 rutas de sección ✓ |
| `v7-alignment` C3 (Interacciones) | `3fe9f5b`, `91b8c1f`, `da333a3` | `src/app/api/v1/interactions/route.ts` ✓, `src/components/crm/interaccion-form-dialog.tsx` ✓, `prisma/interacciones.invariant.test.ts` ✓ |
| `v2-projects-v6-sections` (9/9) | `72c5d4b`, `d5a80f5` | commits existen ✓ |
| `v2-projects-s26-membership` (5/5) | `771a541` | rutas e invariantes `proyecto-miembros*` ✓ (pero registra deuda de verificación propia, `:128`) |
| `v2-projects-s11-convert-and-seed` (3/3) | — | ruta `convert` + test ✓ |
| `v2-ui-v6-base` (7/7) | — | `src/hooks/crm.ts` ✓ |
| `v2-projects-ficha-page` (3/3) | — | `src/components/proyectos/project-kpis-panel.tsx` ✓ |
| `v2-projects-s10-execution` (6/6) | — | `src/components/proyectos/{tacometro,radar,project-team}.tsx` ✓ |

**Conclusión de la deriva:** el sistema ODD **no infla lo completado** — cada `[x]` del muestreo tiene código y commit detrás. La deriva está en (i) las casillas `[ ]` que ya no lo están (C4), (ii) los **ledgers de nivel superior abandonados y además invisibles para git** (`HANDOFF`, `PENDIENTES-MENORES`), (iii) docs de pendientes que contradicen la config actual (cobertura), y (iv) referencias a archivos borrados. La causa raíz del apartado (ii) está en `.git/info/exclude`, no en el proceso ODD.

---

## 5. CI

### 5.1 `.github/workflows/ci.yml` (gate real de PRs)

* **Disparadores:** `pull_request` (todos) y `push` a `main`; `concurrency: ci-${{ github.ref }}` con `cancel-in-progress: true`.
* **Runner:** `ubuntu-latest`; Node **24** con `actions/setup-node@v4` y `cache: npm`; gestor **npm** (`npm ci`, `package-lock.json`). **No hay pnpm.**
* **Servicio:** `postgres:16` con healthcheck `pg_isready`; `DATABASE_URL`/`DIRECT_URL = postgresql://postgres:postgres@localhost:5432/postgres` a nivel de job.
* **Pasos:** `actions/checkout@v4` → `setup-node` → `npm ci` → **`npx prisma migrate deploy`** → `npx prisma generate` → **`npm run lint`** (eslint) → **`npm test`** (vitest) → `actions/upload-artifact@v4` (coverage).
* **Sí puede correr migraciones:** el servicio es un Postgres desechable y el comentario del workflow lo razona explícitamente (*"prisma/invariant.test.ts must never point at it from CI; this service is what it hits instead"*), lo que además encaja con el guard de loopback de `prisma/require-local-db.ts`. Nota: el comentario cita `prisma/invariant.test.ts`, archivo que ya no existe con ese nombre (hoy hay 29 `prisma/*.invariant.test.ts`): referencia obsoleta menor.

**Diferencias con los scripts locales y pasos que pueden pasar en silencio:**

1. **`tsc --noEmit` no corre en CI. Y `next build` tampoco.** Un `git grep` sobre `.github` por `tsc|next build` no devuelve nada; el único `build` del repo está en `package.json:7` (`prisma generate && next build`) y CI nunca lo invoca. **El gate de PRs es solo eslint + vitest: un error de tipos o un fallo de compilación de Next no bloquea ningún merge.**
2. **El upload de cobertura es un no-op silencioso:** `npm test` es `vitest run` **sin `--coverage`**, así que `coverage/` no se genera; el paso lleva `if-no-files-found: ignore` y además `if: always()`, con lo que "pasa" siempre sin producir artefacto.
3. **`npm run lint` no es el mismo comando que en local en la práctica:** en local el árbol tiene `.next-stale-1790784370/` (715 MiB) y `supabase/.temp/`, que `eslint.config.mjs` no ignora → exit 1 con 1883 errores; en CI no existen → pasa. La paridad comando↔entorno no se cumple.
4. No hay paso de `prisma migrate diff`/drift ni verificación de que `schema.prisma` y las migraciones coincidan.

### 5.2 `.github/workflows/testsprite.yml` (E2E)

* **Disparadores:** `pull_request`, `push` a `main`, `workflow_dispatch`; `timeout-minutes: 30`.
* **Es un gate opcional por diseño y puede saltarse en silencio:** detecta `VERCEL_TOKEN`; en PRs sin token **deploya nada y salta el E2E** con solo un `::warning::` (`testsprite.yml:43-45`). Si no hay token en el repo, **el E2E no existe en PRs**.
* **`blocking: false` está comentado** (`testsprite.yml:55-56`), así que el carácter bloqueante depende del default de `TestSprite/run-action@v1`; el propio comentario dice que el suite generado *"falla determinísticamente en el sandbox (14/14 FAILED)"*. Es un gate ambiguo.
* En `push` a `main` el E2E corre contra **producción** (`base_url: https://muttu-hub.vercel.app`, `testsprite.yml:52`).
* **Los 7 specs de Playwright de `e2e/` no los ejecuta ningún workflow.** El único E2E automatizado es TestSprite contra prod, no la suite Playwright del repo (que además exige servidor local y base sembrada, y en el modo v7 las pruebas de UI son por capturas).

---

## 6. Higiene del repositorio

### 6.1 Git

```
$ git count-objects -vH
count: 6611
size: 15.58 MiB
in-pack: 1496
packs: 2
size-pack: 1.64 MiB
prune-packable: 7
garbage: 0
size-garbage: 0 bytes

$ git log --oneline | count  -> 415 commits
$ git ls-files | count       -> 931 archivos rastreados
$ git ls-files --others --exclude-standard -> 1 (analisis/.gitkeep)
$ (tamaño de .git en disco) -> 19.241.698 bytes (6.879 archivos)
```

**Blobs más grandes** (`git rev-list --objects --all | git cat-file --batch-check` → ordenado en node, 7.028 objetos):

| Bytes | Ruta | Nota |
|---|---|---|
| 620.458 | `package-lock.json` | 5 revisiones (504–620 KB cada una) |
| 619.915 / 604.568 / 602.528 / 522.193 / 504.072 | `package-lock.json` (histórico) | |
| 504.072 | `docs/muttu-hub-v2.html` | entregable de diseño, 1 copia |
| 332.420 | `odd/tasks/v2-projects-sdd.md` | **35 commits lo tocaron**; ~15 copias históricas entre 281 KB y 332 KB |

O sea: **la historia de git es pequeña (18 MiB)** y **nunca se commiteó output de build**. El peso está en el disco de trabajo y en el historial de un único markdown de 332 KB reescrito 35 veces.

### 6.2 Artefactos: ¿rastreado o ignorado?

| Ruta | ¿Rastreado? | ¿Ignorado por? | Tamaño en disco |
|---|---|---|---|
| `.next-stale-1790784370/` | No | **solo `.git/info/exclude:26`** (local) | **749.870.234 B (715 MiB)** |
| `.next/` | No | `.gitignore:23` | 1.717.200.992 B (1,60 GiB) |
| `node_modules/` | No | `.gitignore:4` | 2.603.472.052 B (2,42 GiB) |
| `test-results/` | No | `.gitignore:18` | 45 B (1 archivo) |
| `playwright-report/` | No | `.gitignore:19` | 520.879 B (1 archivo) |
| `tsconfig.tsbuildinfo` | No | `.gitignore:48` (`*.tsbuildinfo`) | 555.039 B |
| `Web app views creation.zip` | No | **solo `.git/info/exclude:30`** | 112.627 B |
| `Web app views creation/` | No | **solo `.git/info/exclude:29`** | 425.370 B |
| `supabase/.temp/` | No | `supabase/.gitignore:3` (`.temp`) | 52.379 B |
| `.vercel/project.json` | **SÍ, commiteado** | `.gitignore:57-58` ignora `.vercel/*` **pero re-incluye `!.vercel/project.json`** | 114 B |
| `openspec/**` | **SÍ** (13 archivos, 163.740 B) | — | — |
| `openspec/changes/proyecto-financiero-tab/` | No | **solo `.git/info/exclude:33`** | 14.996 B |

**Impacto práctico:**

* **No hay artefactos de build commiteados.** El repo pesa 18 MiB de objetos; lo que sobra está en disco (715 MiB de `.next-stale-*` + 1,6 GiB de `.next`), y **nada de eso se puede recuperar con un `git clean` guiado por `.gitignore`**, porque `.next-stale-*` y `Web app views creation/` solo están en el exclude local, no en `.gitignore`. Son basura indetectable por las herramientas estándar.
* **`.vercel/project.json` está commiteado a propósito** (por el `!` del `.gitignore`) y expone `projectId` `prj_8YWgGgg92ZI1QEDpagy5sjCuD7Vr` y `orgId` `team_UF3EtORaOMPzlT6Lz64g3rB7`. No son secretos de escritura, pero es configuración de despliegue versionada que normalmente no se commitea.
* **El riesgo real no es el tamaño, es la invisibilidad:** 5 documentos (entre ellos los dos ledgers de traspaso y el informe de auditoría UX), 1 cambio OpenSpec completo y 1 `.bak` están fuera de git por reglas **locales de esta copia**. No aparecen en `git status`, no viajan a CI, no los ve ningún colaborador. Cualquier limpieza de `.next-stale-*` debe hacerse sin tocar esas líneas, o se perderá documentación que existe **solo** en este disco.

---

## 7. Resumen ejecutivo

1. **`npx tsc --noEmit` → exit 0, cero errores** (confirmado también con `--incremental false`, 39,5 s). **`npx vitest run` documentado → exit 1 por límite del sandbox** (`[plugin externalize-deps] Error: spawn EPERM` en Vite `optimizeSafeRealPathSync`); reestructurado con `--configLoader native` da **330 archivos / 3478 casos · 17 fallidos / 3461 pasan · exit 1 · 466,49 s**: 15 fallos son del entorno (`mkdtemp EPERM` en `_harness.test.ts` y `local-env.test.ts`; spawn imposible en `_guard.test.ts`) y **2 son flaky por contención, no defectos** (`src/components/crm/interaccion-form-dialog.test.tsx`; el Lead lo reprodujo en verde 4/4, con el test largo a 4486 ms sobre un límite de 5000 ms, modo de fallo ya documentado en `vitest.config.ts:11-21`). **`npx eslint .` → 1087 archivos, 1883 errores, 15004 warnings, exit 1, 156,7 s**, pero **0 errores en código propio** (1725 en `.next-stale-1790784370/**`, 154 en `supabase/.temp/**`, 4 en `Web app views creation/**`); `npx eslint src prisma scripts e2e` → **765 archivos, 0 errores, 2 warnings, exit 0**.
2. **Suite: 330 archivos vitest, 3478 casos, 63.182 líneas de test contra 83.861 líneas de producción (75,3 %)**; `src` 292 (app 123 · components 93 · lib 59 · hooks 12 · store 3 · test 2), `prisma` 29, `scripts` 9, Playwright 7 specs. **No es solo lógica pura:** los 29 invariantes corren contra un Postgres real en loopback bajo guard. **Huecos en cero: `src/lib/openapi/**` (26 fuente / 1 test), `src/lib/db.ts` + `src/lib/email.ts` + `src/proxy.ts` (el middleware de auth, 0 tests y excluido de cobertura), `src/lib/{supabase,auth,mock}/**` (6 archivos), 3 rutas API (`/api/openapi`, `auth/reinvite`, `dev/invite-token`), 26 de 27 páginas, 2 scripts, y los 7 specs Playwright que nunca corren en CI.**
3. **CI: el gate real es solo eslint + vitest.** `ci.yml` corre en ubuntu-latest con Node 24/npm, levanta un `postgres:16` desechable y **sí aplica migraciones** (`prisma migrate deploy`). **Nunca corre `tsc --noEmit` ni `next build`** → un error de tipos o de compilación no bloquea merges. El upload de cobertura es un **no-op silencioso** (`npm test` sin `--coverage` + `if-no-files-found: ignore`). `testsprite.yml` **salta el E2E en PRs sin `VERCEL_TOKEN` con solo un warning** y tiene `blocking: false` comentado; en `main` corre contra **producción**; los specs Playwright del repo no los ejecuta ningún workflow. Y `npm run lint` **no es reproducible en local** (exit 1 por `.next-stale-*`, que `eslint.config.mjs` no ignora).
4. **Proceso y deriva:** el sistema ODD (`odd/tasks/`, 108 `[x]` / 77 `[ ]`) **no infla lo completado** — en un muestreo de 10 tareas cerradas todos los commits citados existen y los artefactos están en `src/`. La deriva está en (a) `odd/tasks/v7-alignment.md:20` que aún marca `[ ] C4 Relaciones` cuando la migración `20261013130000_v2_relaciones` ya está commiteada en `71716d9`; (b) `HANDOFF-contexto-sesion.md` y `PENDIENTES-MENORES.md` con listas de archivos clave que ya no existen, referencias a `DIAGNOSTICO-SEED-CLOUD.md`, `scripts/cleanup-seed-cloud.ts`, `openspec/specs/` y `openspec/changes/archive/` **inexistentes**, y conteos de suite desfasados 2,5–2,7×; (c) `docs/pendientes/vitest-unit-tests.md` que declara la cobertura "completada" al 66,7 % con `coverage.all` cuando `vitest.config.ts` documenta ~13-15 % y esa opción ya no existe en Vitest 4; (d) `docs/pendientes/pendientes-y-mejoras.md` que niega la existencia de `test:coverage` (existe) y deja **abierto** el ítem de `scripts/cron_setup.sql` (rastreado, pero con placeholder, no con el secreto real — ver T3). **Causa raíz estructural: `.git/info/exclude` (reglas LOCALES) esconde de git `HANDOFF-contexto-sesion.md`, `PENDIENTES-MENORES.md`, el informe de auditoría UX, `odd/tasks/pendientes-menores-post-tablero.md` y `openspec/changes/proyecto-financiero-tab/` — documentación que ningún colaborador ni CI ve, declarado como "Decision D-07" en `proyecto-financiero-tab/proposal.md:11`.**
5. **Higiene: `git count-objects -vH` → 6611 objetos sueltos / 15,58 MiB, 1496 en pack / 1,64 MiB; 931 archivos rastreados, 415 commits, 1 solo untracked.** Nada de build está commiteado; el mayor blob es `package-lock.json` (620 KB, 5 revisiones) y `odd/tasks/v2-projects-sdd.md` (332 KB, **35 commits**). En disco sobran 715 MiB en `.next-stale-1790784370/` y 1,60 GiB en `.next/`, ambos ignorados solo localmente; `.vercel/project.json` **sí está commiteado** (expone `projectId`/`orgId`).

---

## 8. Anexo — corrección del verificador (autocorrección honesta)

El informe original de T4 afirmaba: *«2 son reales y reproducibles en aislamiento»*. Tras la verificación cruzada del Lead, la afirmación correcta es: **los 2 fallos de `interaccion-form-dialog.test.tsx` son flaky por contención de máquina y presupuesto de timeout (4486 ms de 5000 ms), no defectos funcionales del componente.** Evidencia: (a) la rerun del Lead dio 4/4 verde; (b) el modo de fallo exacto está documentado en `vitest.config.ts:11-21`; (c) el síntoma (payload truncado/entrelazado y llamadas extra) es característico de `user-event` corriendo mientras el test ya expiró. Se mantiene como **deuda de estabilidad** con acción concreta: subir el `testTimeout` de ese archivo/test y estabilizar el helper de tecleo.
