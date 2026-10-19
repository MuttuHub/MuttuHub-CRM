# Fase 0 — ejecución y estado para retomar

Cierre de sesión: **2026-10-19**. `main` en `8f0377a`, etiqueta **`v2.0.0`** creada y empujada.
Plan de referencia: `docs/plan-trabajo-restante.md` (fases y criterios de aceptación).

## Hecho en esta sesión

| Tarea | Evidencia |
|---|---|
| Permisos por rol del 2026-10-19 | PR #73 (`83e7b63`): matriz por pertenencia, creación para todos, Tablero acotado |
| Suite e2e de Permisos | PR #74 (`da14703`): 29/29 contra build de producción, specs independientes del seed |
| Documentación vigente | PR #75 (`add9df0`): README, índice, portabilidad (Railway), pendientes |
| Plan de trabajo restante | PR #76 (`b945135`): cinco frentes, tamaños, dependencias y decisiones abiertas |
| **A1** Etiqueta `v2.0.0` | Tag anotado sobre `8f0377a`, empujado |
| **A5** Limpieza de credenciales | `~/.muttu-prod-url` borrado |
| **B1 / D1** Mensaje de «sin acceso» | PR #77 (`8f0377a`): política global `shouldRetryQuery` (4xx no se reintenta); e2e en 2.7 s |

## Lo siguiente (en orden)

1. **U0 — Re-auditoría UX** de los 12 hallazgos (`C1–C12`) del 2026-09-23 contra el código actual y el navegador a
   390 px. Salida: `odd/tasks/ux-audit-2026-10-19.md` con «vigente / resuelto» y evidencia por hallazgo.
2. **A3 — Humo en producción** con un Coordinador y un Colaborador reales (runbook §4).
3. **A2 — Resend**: verificar `muttu.co` y ajustar `EMAIL_FROM` cuando haya acceso al DNS.
4. **A4 — Respaldos automáticos** y una restauración de prueba.
5. **Fase 1**: U1 (mobile crítico), U3 (bugs), E3 (lint reproducible).

## Cómo retomar el entorno local

```bash
# base demo (si el contenedor local está vacío)
node.exe --env-file=.env.local --env-file=.env.seed node_modules/tsx/dist/cli.mjs prisma/seed.ts
node.exe node_modules/tsx/dist/cli.mjs scripts/seed-projects-demo.ts --apply

# servidor para e2e: SIEMPRE build de producción, el dev server se degrada
node.exe node_modules/next/dist/bin/next build
node.exe node_modules/next/dist/bin/next start

# e2e (desde WSL, contra el servidor de Windows)
PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000 node node_modules/playwright/cli.js test \
  --config playwright.verify.config.ts
```

Notas de entorno: el `node_modules` es de Windows, por eso la suite se corre con `node.exe` y Playwright desde WSL. El
seed demo crea los usuarios `@demo.muttuhub.local` con la clave `MuttuDemo2026!`.

## Decisiones que siguen bloqueando trabajo

D-A importar solo estructura · D-B rubros por proyecto · D-C semántica de cerrar/suspender · D-D alcance de v7 en CRM ·
D-E DNS de `muttu.co` · D-F destino Railway (solo app o stack completo). Detalle en `docs/plan-trabajo-restante.md` §7.
