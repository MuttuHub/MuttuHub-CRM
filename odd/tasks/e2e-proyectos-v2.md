# E2E de verificación de Proyectos v2 (Playwright)

Rama `test/e2e-proyectos-v2`, worktree `MuttuHub-CRM-worktrees/e2e`. Suite de verificación escrita el 2026-10-17 para
el candidato del lanzamiento: sigue `odd/tasks/prueba-manual-proyectos-v2.md` (secciones §1–§10) y corre contra un
dev server **ya encendido** (nunca lo arranca ni lo apaga).

## Cómo correrla

```bash
PLAYWRIGHT_BASE_URL=http://<host>:3000 npx playwright test --config playwright.verify.config.ts
```

- 1 worker, sin reintentos, 180 s por prueba; requiere los usuarios demo (admin, gerencia, coordinador, colaborador)
  y los datos del seed local en la Supabase local.
- Reportes: `playwright-report-verify/` (HTML) y `test-results-verify/` (traces y capturas de los fallos), ambos
  ignorados por git.
- **Nota de entorno (WSL + dev server en Windows):** este worktree no tiene `node_modules`; se corre desde el repo
  principal (que sí lo tiene) con el node de WSL:
  ```bash
  cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM
  PLAYWRIGHT_BASE_URL=http://172.30.48.1:3000 node node_modules/playwright/cli.js test \
    --config /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/e2e/playwright.verify.config.ts
  ```
  (el worktree `e2e` tiene `node_modules` como enlace simbólico al del repo principal, para que los specs resuelvan
  `@playwright/test`). `172.30.48.1` es el host de Windows visto desde WSL; desde Windows sería `localhost:3000`.

## Cobertura (8 specs)

| Spec | Cubre |
|---|---|
| `clientes.spec.ts` | §10: subnavegación sin Oportunidades/Mapa y redirecciones; fecha de primer contacto legible; pestaña General en solo lectura; «Crear proyecto» por rol |
| `crear-proyecto.spec.ts` | Stepper: cliente preseleccionado, validaciones (valor total, rango de fechas), el borrador aterriza en la ficha, COORDINADOR no crea |
| `documentos-proyecto.spec.ts` | DOC1: subir archivo (validación → firma/subida/confirmación → abrir por URL firmada), guardar enlace, el COORDINADOR integrante borra solo lo suyo |
| `ficha-ejecucion.spec.ts` | Encabezado (semáforos y acciones); avance con archivo generado; gastos (valor es-CO, error de formato, sobregasto → Pendiente por revisión); validar/rechazar/anular; notificación M7; no se valida el gasto propio |
| `historial-impresion.spec.ts` | Segmentos de Historial; diálogo de Excel y vista de impresión desde «Más acciones» |
| `importar-plantilla.spec.ts` | PRY-2026-002: validar e importar la plantilla de la PO (3 objetivos); fixture `e2e/fixtures/plantilla-po-ejemplo-importable.xlsx`; solo contra la base demo local |
| `permisos.spec.ts` | COLABORADOR: lista vacía y 403 de ficha por URL; COORDINADOR: portafolio acotado y 003 negado; GERENCIA: todo; P1 (feeds acotados); P2 (subscore de salud) |
| `helpers.ts` | Login por rol, helper de selects base-ui, filas del portafolio, enlace de ficha, diálogo de ficha de cliente |

## Resultados de la última corrida (2026-10-17, dev server en :3000)

- Todo en verde salvo el fallo deliberado de abajo y el `test.fixme` de DOC1.
- `permisos.spec.ts` › «coordinador non-member: the «No tienes acceso» message shows within 5 s» — **falla a
  propósito**.

## Corrida del spec DOC1 tras el merge (2026-10-18)

- `documentos-proyecto.spec.ts` 3/3 en verde contra el código mergeado (dev server en `172.30.48.1:3000`): subir un
  archivo (validación → firma → subida → confirmación → aparece en el grupo «Proyecto» → abrir por URL firmada),
  guardar un enlace y el COORDINADOR integrante que solo puede borrar lo suyo.
- El selector del campo de archivo necesitó `exact: true`: `getByLabel` de Playwright compara por subcadena y
  «Subir un archivo» (el radio) también contiene «archivo».

## Defecto conocido D1 (prueba que falla a propósito)

`useProject()` (`src/hooks/projects.ts:342`) conserva los 3 reintentos por defecto de react-query en 403/404, así que
el mensaje de acceso de la ficha tarda ~11 s en aparecer en vez de salir de inmediato. Arreglo candidato: un `retry`
en el hook que no reintente ante un `ApiError` 4xx (p. ej. `retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 3`).
Con eso, la prueba pasa sin cambios.

## Pendiente

- D1 (arreglo de app, fuera de la superficie de este worktree): con eso la suite queda 100 % verde.
- Correr la suite completa contra la copia de producción como parte del humo de R7 (incluye ya
  `documentos-proyecto.spec.ts`, que dejó de estar en `test.fixme` al integrarse DOC1).
