# Lanzamiento v2 a producción: fin de semana del 2026-10-15 al 2026-10-18

Locator: `odd/tasks/lanzamiento-v2-fin-de-semana.md` · Mirror de Engram: `odd/lanzamiento-v2-fin-de-semana/tasks`

## Objetivo

Publicar en producción el módulo de Proyectos v2 y el avance de los tres documentos de requerimientos, antes del lunes
2026-10-19 y sin romper los datos de producción. Los documentos son RF Detalle Clientes, RF Tablero de Seguimiento y RF
v2 Módulo Proyectos. A esto se suman los pedidos de la reunión con el cliente del 2026-10-14.

## Problema y por qué

- La gerencia pidió el lanzamiento antes del lunes. El criterio es «se corrige con el uso».
- Ese criterio vale para lo funcional, porque se arregla con otro deploy. **No** vale para los datos.
- `feat/projects-v2` está 335 commits (+114k / −7k líneas) por delante de `main`. `main` no se toca desde el 2026-09-30.
- Hay 21 migraciones que producción nunca recibió y que nunca se ensayaron contra datos reales.
- Las migraciones son **aditivas**: tablas nuevas, columnas nulas o con valor por defecto, `ADD VALUE` en un enum y
  renombres de FK. Ninguna borra tablas ni columnas, ni cambia tipos.
- Por eso la estrategia es **primero la base, después el código**. Se migra la base mientras la app vieja sigue
  arriba, y después se despliega el código nuevo.
- Si falla el código, se revierte solo el código, con Instant Rollback de Vercel.
- Si falla la base, se restaura el respaldo.

## Avance de partida (medido el 2026-10-14 y el 2026-10-15)

```
RF v2 Módulo Proyectos       90 %  (solo los 36 RF: 96 %)
RF Tablero y Gestión Social  95 %
RF Detalle Clientes          83 %
v7 total                     65 %  (fuera del compromiso del lunes)
```

## Alcance

- **Entra:** los huecos de los tres RF que no dependen de decisiones abiertas, los pedidos de la reunión (M1 a M7) y el
  pulido v7 de la ficha de proyecto (B1 a B5 y B7). También la ruta de lanzamiento completa: ensayo, runbook, respaldo,
  migración y deploy.
- **No entra:** el resto de v7, que incluye kanban y ficha de oportunidad, salud de cartera, mapa, convocatorias y
  propuesta económica. Tampoco entran cerrar, suspender o cancelar proyectos (PO-3) ni la importación de gastos por
  Excel (PO-11).

## Restricciones

- **Esquema congelado.** Solo se admite una migración aditiva de lanzamiento (tarea R3), y solo si M3 o M7 la piden. Su
  dueño es Claude y tiene que estar lista el viernes a las 12:00 para que el ensayo 1 la cubra.
- **Base de datos.** Todo comando de base de datos carga `.env.local` o el archivo del ensayo, nunca `.env`, que apunta a
  Supabase remoto. Los scripts reutilizan la guarda de `scripts/migrate-v2/_guard.ts`.
- **Operaciones remotas.** El dump, `migrate status`, `migrate deploy` en producción, el push y el deploy los ejecuta el
  usuario, o los autoriza de forma explícita una por una.
- **Entrega.** Va un solo merge grande de `feat/projects-v2` a `main` como excepción aceptada por la gerencia (pendiente
  G-1). No se usan PRs encadenados de 400 líneas.
- **Push.** Vercel despliega desde GitHub, así que sin push no hay lanzamiento. Tiene que estar destrabado el viernes.
- **Pruebas.** Los dos agentes no corren la suite completa en paralelo. La corre solo Claude.

## Carriles y aislamiento

| | Claude | DeepSeek |
|---|---|---|
| Rama | `feat/projects-v2`, la de integración | `feat/ficha-v7-polish`, creada desde `feat/projects-v2` |
| Carpeta | la carpeta principal del repo | worktree `../MuttuHub-CRM-worktrees/ficha-v7` |
| Base | Supabase local (54322) y el contenedor de ensayo `postgres` (54330) | ninguna: solo pruebas de sus componentes |
| Puerto | 3000 | 3001 |
| Superficie exclusiva | `prisma/**`, `scripts/**`, `src/app/api/**`, `src/lib/**`, `src/hooks/**`, `src/components/crm/**`, `project-dashboard.tsx`, `project-list.tsx`, `project-create-form.tsx`, `nuevo-proyecto*`, `project-gastos.tsx`, `gastos-kpis.tsx`, `notification-panel.tsx`, `docs/**`, `odd/**` | `project-presupuesto.tsx`, `project-cronograma.tsx`, `estructura-gantt.tsx`, `project-financiero.tsx`, `ejecucion-beneficiarios.tsx`, el encabezado de `project-ficha.tsx`, y los `.test.tsx` de cada uno |
| No toca | la superficie de DeepSeek | todo lo demás: `package.json`, el lockfile, DTOs y API. Si falta un campo, lo pide |

Claude integra la rama de DeepSeek en los puntos de sincronización: el viernes en la noche y el sábado a las 12:00.

## Decisiones

| ID | Pregunta | Estado | Respuesta | Bloquea |
|---|---|---|---|---|
| PO-1 | Semaforización territorial | ✅ 2026-10-15 | Quitarla. El municipio queda solo como filtro (RF v2, REQ-DSH-04) | F1 |
| PO-2 | PDF en el lanzamiento o solo Excel | pendiente | | F13 |
| PO-4 | ¿Se admiten proyectos de un día (inicio = fin)? | pendiente | | F4 |
| PO-5 | ¿`valor_total > 0` desde la creación? | pendiente | | F5 |
| M1 | Crear desde cliente: ¿por defecto «independiente» u ocultar el camino por oportunidad? | pendiente | | F8 |
| M2 | ¿Qué datos del cliente muestra la tarjeta al seleccionarlo? | pendiente | | F8 |
| M3 | ¿El proyecto lleva descripción en el lanzamiento? Requiere migración aditiva | pendiente | | F9, R3 |
| M4 | «Primero clientes, luego oportunidades»: ¿orden de menú (ya se cumple) o flujo? ¿Se ocultan las 6 pestañas vacías de Clientes? | pendiente | | F10 |
| M5 | Beneficiarios «solo cantidad»: ¿la meta, los atendidos o ambos? ¿Se quita el historial por actividad? | pendiente | | D5 |
| M6 | «Observado» → «Pendiente por revisión»: ¿renombrar solo la etiqueta? | pendiente | | F11 |
| M7 | Notificar el rechazo de un gasto: ¿con el motivo? ¿también al anular? Requiere migración aditiva (enum) | pendiente | | F12, R3 |
| G-1 | La gerencia acepta un merge grande sin PRs encadenados | pendiente (usuario) | | R6, R9 |
| G-2 | Ventana de lanzamiento (propuesta: domingo 2026-10-18 en la mañana) | pendiente (usuario) | | R9 |

## Tareas

Ruta: **I** = inline, **D** = delegada (un escritor acotado). Todas las tareas de código siguen el ciclo test-first
(RED → GREEN) cuando hay una prueba ejecutable.

### Carril R: lanzamiento (Claude)

- [ ] **R1** Base en verde sobre `feat/projects-v2`: `npx tsc --noEmit`, `TZ=America/Bogota npx vitest run` y
  `npm run build`. Ruta D (ejecución). Aceptación: los tres en verde, con el resultado anotado aquí.
- [ ] **R2** Worktree y rama de DeepSeek, y su prompt listo para pegar (`odd/tasks/lanzamiento-v2-deepseek-prompt.md`).
  Ruta I.
- [ ] **R3** Migración aditiva de lanzamiento. Contiene `Proyecto.descripcion String?` si M3 la aprueba, y
  `TipoNotificacion.GASTO_RECHAZADO` en una migración aparte si M7 la aprueba, porque `ADD VALUE` no comparte
  transacción. Ruta D. Plazo: viernes 12:00.
- [ ] **R4** Ensayo 1. Pasos:
  1. Restaurar el dump de producción en el contenedor `postgres` de 54330.
  2. Correr `prisma migrate status`, que debe coincidir con `main`.
  3. Correr `prisma migrate deploy` y los invariantes.
  4. Correr `s1-rubros --dry-run`.
  5. Comprobar que la app de `main` funciona sobre la base migrada.
  6. Restaurar el dump una segunda vez, para probar que el respaldo sirve.

  Ruta D. Depende de que el usuario entregue el dump. Aceptación: todo termina sin error. Si no, es **no-go** hasta
  corregirlo.
- [ ] **R5** Checklist de infraestructura: variables de entorno nuevas de v2, buckets de Storage, cron y alcance de las
  variables en Vercel. Ruta D.
- [ ] **R6** Integración del sábado a las 12:00. Pasos:
  1. Merge de `feat/ficha-v7-polish`.
  2. Suite, `tsc` y build.
  3. Etiqueta `v2.0.0-rc1`.

  Ruta I.
- [ ] **R7** Ensayo 2 con el código final, más el humo de la app sobre la copia. Ruta D.
- [ ] **R8** Runbook de lanzamiento, checklist de humo y plan de vuelta atrás (`docs/runbook-lanzamiento-v2.md`). Ruta D.
- [ ] **R9** Lanzamiento, que ejecuta el usuario. Pasos:
  1. Respaldo verificado.
  2. `migrate deploy`.
  3. Humo de la app vieja.
  4. `s1-rubros --dry-run`, y después `s1-rubros --apply --expect-hash`.
  5. Merge a `main`.
  6. Deploy en Vercel.
  7. Humo.

  Ruta I, acompañado.

### Carril F: requerimientos y reunión (Claude)

- [ ] **F1** Quitar la semaforización territorial del tablero gerencial (REQ-DSH-04, PO-1). El municipio queda solo como
  filtro. Archivo: `project-dashboard.tsx`. Tamaño S.
- [ ] **F2** Tarjeta «Beneficiarios atendidos / meta» en el tablero gerencial (C5). Usa `agregado.beneficiarios`.
  Tamaño S.
- [ ] **F3** Filtros del portafolio por cliente, línea, municipio y responsable (RF-31). La API ya los acepta
  (`src/app/api/v1/projects/route.ts:61-65`). Archivo: `project-list.tsx`. Tamaño S.
- [ ] **F4** V-03 estricto: inicio < fin (C1). Depende de PO-4. Tamaño S.
- [ ] **F5** `valor_total > 0` al crear (C2). Depende de PO-5. Tamaño S.
- [ ] **F6** Fecha de primer contacto en formato legible (D2). Tamaño S.
- [ ] **F7** El DTO de la tarea lleva el id y el código del proyecto, para enlazar al proyecto exacto (D3). Tamaño S.
- [ ] **F8** Crear proyecto desde un cliente (M1, M2). Cambios:
  - El formulario arranca en «independiente» (`project-create-form.tsx:141`).
  - Al seleccionar el cliente aparece una tarjeta con su información.
  - La ficha del cliente lleva un botón «Crear proyecto» que abre `?cliente=<id>` con el cliente preseleccionado.

  Depende de M1 y M2. Tamaño S-M.
- [ ] **F9** Descripción del proyecto (M3). Toca el esquema (R3), el zod de creación, `PROJECT_SELECT_V2`, el DTO, el
  formulario, la ficha y OpenAPI. Depende de M3. Tamaño M.
- [ ] **F10** Navegación de Clientes (M4). Depende de M4: puede no requerir trabajo, o puede ocultar las pestañas vacías.
  Tamaño S.
- [ ] **F11** Renombrar la etiqueta «Observado» a «Pendiente por revisión» (M6). Es solo texto: `project-gastos.tsx:51`,
  `gastos-kpis.tsx:100`, `atencion.ts:39` y sus pruebas. Tamaño S.
- [ ] **F12** Notificar a `registrado_por_id` cuando se rechaza un gasto (M7). Toca la ruta `reject`,
  `notificaciones-proyecto.ts`, la lectura de notificaciones para roles no gerenciales, `notification-panel.tsx` y
  OpenAPI. Depende de M7 y R3. Tamaño M.
- [ ] **F13** Exportación a PDF (RF-32). Depende de PO-2. Si se lanza solo con Excel, queda registrado como decisión.
  Tamaño L.

### Carril D: ficha de proyecto v7 (DeepSeek)

- [ ] **D1** (B1) Presupuesto: formato de miles en los campos de dinero y meses legibles. Tamaño S.
- [ ] **D2** (B2) Encabezado de la ficha: chips de línea estratégica y territorio. Si el DTO no trae los campos, los pide
  a Claude. Tamaño S.
- [ ] **D3** (B3) Cronograma: 4 KPI, leyenda de umbrales y columnas «Días», «Al corte» y soporte. Tamaño M.
- [ ] **D4** (B4) Gantt: relleno del avance real y línea de «Corte». Tamaño M.
- [ ] **D5** (B5 + M5) Beneficiarios: solo cantidad, sin desglose por grupo poblacional. Se ajusta según M5. Tamaño S.
- [ ] **D6** (B7) Financiero: alertas del semáforo financiero y nota de «rubros sin asignación». Tamaño S.

## Calendario

| Día | Claude | DeepSeek | Usuario |
|---|---|---|---|
| Jueves 15 | R1, R2, F1, F11 | D1, D5, D6 | Destrabar el push, responder las decisiones, conseguir G-1 y sacar el dump de producción |
| Viernes 16 | R3 (12:00), R4, R5, F2, F3, F6, F7, F8, y F4/F5 si hay respuesta | D3, D4, D2 | Probar en el navegador |
| Sábado 17 | F9, F12, F10 → **congelamiento a las 12:00** → R6, R7, R8 | Solo correcciones que Claude le marque | Probar la versión candidata |
| Domingo 18 | R9 acompañado, después monitoreo | Margen para correcciones de UI | Ventana de lanzamiento (G-2) y decisión de mantener o revertir |

## Vuelta atrás

| Falla | Acción |
|---|---|
| El código nuevo falla | Instant Rollback de Vercel al deploy anterior. La base se queda, porque es compatible |
| Falla `migrate deploy` | Restaurar el dump de R9 paso 1 y mantener la app de `main` |
| El import de rubros sale mal | `s1-rubros --revert <lote>` |

## Pronóstico de entrega

- Carril F: unas 1.200 líneas.
- Carril D: unas 800 líneas.
- Estrategia: un merge grande como excepción (G-1). Lo que quede de v7 se divide después en PRs de unas 400 líneas.

## Progreso y evidencia

- 2026-10-15: plan creado. PO-1 resuelto (quitar). El mapeo de la reunión confirmó varias cosas:
  - Crear proyectos sin oportunidad ya funciona de punta a punta.
  - «Observado» es una etiqueta derivada (`esObservado`), no un estado del enum.
  - `Proyecto` no tiene descripción.
  - El rechazo de un gasto no notifica a nadie.

## Siguiente paso

Responder las decisiones pendientes, una a una. Luego R1 y R2, para arrancar a DeepSeek con D1, D5 y D6.
