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
| Superficie exclusiva | `prisma/**`, `scripts/**`, `src/app/api/**`, `src/lib/**`, `src/hooks/**`, `src/components/crm/**`, `project-dashboard.tsx`, `project-list.tsx`, `project-create-form.tsx`, `nuevo-proyecto*`, `project-gastos.tsx`, `gastos-kpis.tsx`, `notification-panel.tsx`, `ejecucion-beneficiarios.tsx`, `resumen-kpis.tsx`, `portafolio-kpis.tsx`, las pestañas de `project-ficha.tsx`, `src/app/(app)/proyectos/[id]/**`, `docs/**`, `odd/**` | `project-presupuesto.tsx`, `project-cronograma.tsx`, `estructura-gantt.tsx`, `project-financiero.tsx`, el encabezado de `project-ficha.tsx`, y los `.test.tsx` de cada uno |
| No toca | la superficie de DeepSeek | todo lo demás: `package.json`, el lockfile, DTOs y API. Si falta un campo, lo pide |

Claude integra la rama de DeepSeek en los puntos de sincronización: el viernes en la noche y el sábado a las 12:00.

## Decisiones

| ID | Pregunta | Estado | Respuesta | Bloquea |
|---|---|---|---|---|
| PO-1 | Semaforización territorial | ✅ 2026-10-15 | Quitarla. El municipio queda solo como filtro (RF v2, REQ-DSH-04) | F1 |
| PO-2 | PDF en el lanzamiento o solo Excel | ✅ 2026-10-15 | El PDF sale de la impresión del navegador: una vista imprimible de la ficha que el usuario guarda como PDF. No hay motor en el servidor. `formato=pdf` de la API sigue sin soporte | F13 |
| PO-4 | ¿Se admiten proyectos de un día (inicio = fin)? | ✅ 2026-10-15 | No. Inicio estrictamente anterior al fin (V-03), igual que en la importación | F4 |
| PO-5 | ¿`valor_total > 0` desde la creación? | ✅ 2026-10-15 | Sí. Es obligatorio y > 0 al crear (REQ-ORG-04) | F5 |
| M1 | Crear desde cliente: ¿por defecto «independiente» u ocultar el camino por oportunidad? | ✅ 2026-10-15 | Siempre se elige primero el cliente. Después se puede elegir, de forma opcional, una oportunidad de ese cliente (la FK compuesta ya lo garantiza). La conversión desde una oportunidad ganada se mantiene | F8 |
| M2 | ¿Qué datos del cliente muestra la tarjeta al seleccionarlo? | ✅ 2026-10-15 | Una tarjeta de solo lectura con NIT, sector, ciudad, contacto principal y conteo de oportunidades y proyectos. Debajo, la lista de oportunidades del cliente para elegir una (opcional, M1). Tamaño M | F8 |
| M3 | ¿El proyecto lleva descripción en el lanzamiento? Requiere migración aditiva | ✅ 2026-10-15 | Sí, opcional: columna `descripcion` nula, se captura al crear y se edita en la ficha | F9, R3 |
| M4 | «Primero clientes, luego oportunidades»: ¿orden de menú (ya se cumple) o flujo? ¿Se ocultan las pestañas vacías de Clientes? | ✅ 2026-10-15 | El orden del menú ya se cumple. Se ocultan las pestañas vacías, que son solo Oportunidades y Mapa (`ClientesSectionPlaceholder`) | F10 |
| M5 | Beneficiarios «solo cantidad»: ¿la meta, los atendidos o ambos? ¿Se quita el historial por actividad? | ✅ 2026-10-15 | Beneficiarios deja de ser sección. Queda un solo número editable, «Beneficiarios», en los datos generales. Desaparecen el registro de atendidos y el KPI atendidos/meta | F14 (D5 y F2 cancelados) |
| M6 | «Observado» → «Pendiente por revisión»: ¿renombrar solo la etiqueta? | ✅ 2026-10-15 | Solo la etiqueta, en el filtro, el KPI y la alerta. Se mantiene el criterio (sobregasto o datos incompletos) | F11 |
| M7 | Notificar el rechazo de un gasto: ¿con el motivo? ¿también al anular? Requiere migración aditiva (enum) | ✅ 2026-10-15 | Solo al rechazar, con el motivo en el mensaje y enlace al gasto. Nuevo `GASTO_RECHAZADO`; las notificaciones de proyecto se abren a quien registró el gasto | F12, R3 |
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
- [x] ~~**F2** Tarjeta «Beneficiarios atendidos / meta» en el tablero gerencial (C5).~~ Cancelada por M5: ya no se
  miden atendidos.
- [ ] **F3** Filtros del portafolio por cliente, línea, municipio y responsable (RF-31). La API ya los acepta
  (`src/app/api/v1/projects/route.ts:61-65`). Archivo: `project-list.tsx`. Tamaño S.
- [ ] **F4** V-03 estricto: inicio < fin (C1). Depende de PO-4. Tamaño S.
- [ ] **F5** `valor_total > 0` al crear (C2). Depende de PO-5. Tamaño S.
- [ ] **F6** Fecha de primer contacto en formato legible (D2). Tamaño S.
- [ ] **F7** El DTO de la tarea lleva el id y el código del proyecto, para enlazar al proyecto exacto (D3). Tamaño S.
- [ ] **F8** Crear proyecto desde un cliente (M1, M2). Cambios:
  - El formulario pide primero el cliente. Ya no hay selector de origen; el origen se deduce de si se eligió una
    oportunidad (`project-create-form.tsx:141,339-426`).
  - Al elegir el cliente aparece una tarjeta de solo lectura (NIT, sector, ciudad, contacto principal, conteo de
    oportunidades y proyectos) y, debajo, la lista de oportunidades del cliente para elegir una de forma opcional.
  - La conversión desde una oportunidad ganada (`?oportunidad=`) sigue funcionando y llega con el cliente y la
    oportunidad ya seleccionados.
  - La ficha del cliente lleva un botón «Crear proyecto» que abre `?cliente=<id>` con el cliente preseleccionado.

  Tamaño M.
- [ ] **F9** Descripción del proyecto (M3). Toca el esquema (R3), el zod de creación, `PROJECT_SELECT_V2`, el DTO, el
  formulario, la ficha y OpenAPI. Depende de M3. Tamaño M.
- [ ] **F10** Ocultar las pestañas Oportunidades y Mapa de Clientes (M4). Se quitan de `CLIENTES_SECTIONS`
  (`clientes-subnav.tsx:23-31`) y sus rutas redirigen a `/clientes`. Tamaño S.
- [ ] **F11** Renombrar la etiqueta «Observado» a «Pendiente por revisión» (M6). Es solo texto: `project-gastos.tsx:51`,
  `gastos-kpis.tsx:100`, `atencion.ts:39` y sus pruebas. Tamaño S.
- [ ] **F12** Notificar a `registrado_por_id` cuando se rechaza un gasto (M7). Toca la ruta `reject`,
  `notificaciones-proyecto.ts`, la lectura de notificaciones para roles no gerenciales, `notification-panel.tsx` y
  OpenAPI. Depende de M7 y R3. Tamaño M.
- [ ] **F13** PDF por impresión del navegador (RF-32, PO-2). Cambios:
  - Una vista imprimible de la ficha del proyecto y de su resumen financiero, con hoja de estilos `@media print`.
  - Respeta el rol, igual que la ficha.
  - Lleva un botón «Imprimir / Guardar PDF».
  - Toma como referencia la `print-ficha.tsx` que ya existe para clientes.

  Ruta nueva bajo `src/app/(app)/proyectos/[id]/` (superficie de Claude). Tamaño M.
- [ ] **F14** Beneficiarios como un solo número (M5). Cambios:
  - Quitar la pestaña Beneficiarios de la ficha (`project-ficha.tsx:127,205`) y su registro
    (`ejecucion-beneficiarios.tsx`).
  - Reutilizar `Proyecto.beneficiarios_meta` como el campo «Beneficiarios», editable en los datos generales. No requiere
    migración. La tabla `RegistroBeneficiario` se conserva sin uso y sin borrar datos.
  - Ajustar los KPI que comparan atendidos contra la meta (`resumen-kpis.tsx:162`, `portafolio-kpis.tsx:86`, el tablero
    y el agregado de la API).
  - Verificar si la línea base congela `beneficiarios_meta`. Si lo congela, se pregunta al PO si debe seguir editable.

  Se pasa del carril D al F porque toca la API y los agregados. Tamaño M.

### Carril D: ficha de proyecto v7 (DeepSeek)

- [ ] **D1** (B1) Presupuesto: formato de miles en los campos de dinero y meses legibles. Tamaño S.
- [ ] **D2** (B2) Encabezado de la ficha: chips de línea estratégica y territorio. Si el DTO no trae los campos, los pide
  a Claude. Tamaño S.
- [ ] **D3** (B3) Cronograma: 4 KPI, leyenda de umbrales y columnas «Días», «Al corte» y soporte. Tamaño M.
- [ ] **D4** (B4) Gantt: relleno del avance real y línea de «Corte». Tamaño M.
- [x] ~~**D5** (B5) Beneficiarios: KPI y desglose.~~ Cancelada por M5. El trabajo pasa a F14 (Claude).
- [ ] **D6** (B7) Financiero: alertas del semáforo financiero y nota de «rubros sin asignación». Tamaño S.

## Calendario

| Día | Claude | DeepSeek | Usuario |
|---|---|---|---|
| Jueves 15 | R1, R2, F1, F11, F4, F5 | D1, D6 | Destrabar el push, conseguir G-1 y sacar el dump de producción |
| Viernes 16 | R3 (12:00), R4, R5, F3, F6, F7, F8, F14, F10 | D3, D4, D2 | Probar en el navegador |
| Sábado 17 | F9, F12, F13 → **congelamiento a las 12:00** → R6, R7, R8 | Solo correcciones que Claude le marque | Probar la versión candidata |
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
- 2026-10-15: el usuario respondió, en nombre del PO, PO-2, PO-4, PO-5 y M1 a M7. Cambios en el plan:
  - D5 y F2 quedan cancelados por M5.
  - Se agrega F14.
  - F13 baja de L a M, porque el PDF sale de la impresión del navegador.
  - Corrección: Clientes tiene solo 2 pestañas vacías (Oportunidades y Mapa), no 6.
  - R3 queda con dos migraciones aditivas: `descripcion` y `GASTO_RECHAZADO`.

## Siguiente paso

Faltan G-1 (aceptación de la gerencia) y G-2 (ventana). Luego R1 y R2, para arrancar a DeepSeek con D1 y D6.
