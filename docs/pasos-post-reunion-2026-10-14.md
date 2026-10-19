# Pasos posteriores a la reunión y funcionalidades pendientes (2026-10-14)

Qué hacer después de la demo del módulo Proyectos y qué falta, con detalle, de lo que pidió el cliente. Contexto:
rama `feat/projects-v2`; estado de la demo en `odd/tasks/demo-proyectos-2026-10-14.md`; plan vivo de alineación con el
prototipo v7 en `odd/tasks/v7-alignment.md`; pendientes del 2026-10-13 en
`docs/pendientes/pendientes-v7-alignment-2026-10-13.md`.

Tamaños: **S** (horas), **M** (1 a 2 días), **L** (más de 2 días o con decisión externa). Son estimaciones gruesas.

## A. Inmediato (hoy, después de la reunión)

1. **Restaurar los datos locales** (borra la base local; solo Docker local; requiere consentimiento explícito):
   ```bash
   npm run db:migrate:reset:local -- --force
   npm run db:seed:local
   npm run db:demo:seed-projects:local -- --apply
   npm run db:demo:seed-flujo:local -- --apply
   ```
2. **Destrabar el push.** El firewall Fortinet inspecciona TLS: `github.com` presenta un certificado emitido por
   `O=Fortinet` que el bundle de certificados de WSL no reconoce (`Verify return code: 21`). Dos salidas:
   - Instalar la CA raíz de Fortinet en WSL: copiarla a `/usr/local/share/ca-certificates/` y ejecutar
     `sudo update-ca-certificates`.
   - Hacer el push desde Git de Windows, que usa el almacén de certificados de Windows.

   Es un *fast-forward* (la punta remota es ancestro de HEAD), así que no hay conflicto de historia. Requiere
   acceso al certificado de la red y la decisión del usuario de publicar; push, PR y merge siguen siendo suyos.
3. **Correr la suite completa, `npx tsc --noEmit` y `next build`.** Ya es seguro: no hay demo en curso. Recuerda
   `TZ=America/Bogota npx vitest run` y que los comandos de base de datos usan `.env.local`.
4. **Registrar el resultado** (verde o fallos) en `odd/tasks/demo-proyectos-2026-10-14.md` (T2 y T7).

## B. Camino a producción

| # | Paso | Detalle | ¿Requiere decisión o credenciales? |
|---|---|---|---|
| 1 | Crear un ambiente de pruebas | No existe: las 12 variables de entorno del proyecto de Vercel tienen alcance solo `Production`, así que un *Preview* no recibe `DATABASE_URL`. Tampoco hay rama `develop`, aunque el PRD la declara (`docs/Muttu_Hub_PRD_v2.md:1027`) | Sí: decidir el proveedor de la base de pruebas; credenciales de Vercel y Supabase |
| 2 | Base de pruebas y variables de Preview | Crear la base, cargar las variables con alcance Preview | Sí: credenciales |
| 3 | Aplicar las 18 migraciones allí | De `20261005120000_v2_municipios` a `20261013130000_v2_relaciones` | Sí: credenciales de la base de pruebas |
| 4 | Ensayo contra una copia de datos de producción | Valida que las migraciones adoptivas funcionen con datos reales | Sí: acceso a una copia de producción |
| 5 | Revisión por PRs encadenados | `feat/projects-v2` está 333 commits por delante de `main`, y `main` no tiene el módulo de Proyectos (0 ocurrencias de `model Proyecto` en su `schema.prisma`). Partir en cortes de unas 400 líneas (skill `chained-pr`) | Sí: estrategia de encadenado (pila contra `main` o rama de integración) |
| 6 | Respaldo de producción | Antes de tocar nada | Sí: credenciales |
| 7 | `prisma migrate deploy` en producción | Con respaldo y ventana acordada | Sí: decisión explícita e informada del usuario (nunca por un script de demo) |
| 8 | Merge a `main` y despliegue | Tras PRs aprobados y ensayo exitoso | Sí: decisión del usuario |

## C. Funcionalidades pendientes que pidió el cliente

### C.1 Requisitos del RF (cliente)

Fuente: RF v2.0 del PO y `odd/tasks/v2-projects-sdd.md`.

| Pendiente | Qué falta exactamente | Fuente | Estado actual y evidencia | Dependencia o decisión | Tamaño |
|---|---|---|---|---|---|
| Exportar a PDF | Generar la ficha del proyecto y la ficha financiera en PDF, respetando el rol de quien exporta y auditando la exportación | REQ-DSH-03 (RF-32) | Solo Excel. `formato=pdf` responde 400 hasta decidir el motor: `src/app/api/v1/projects/[id]/export/route.ts:6` | Decisión D-08 (motor de PDF, N-23); riesgo R-15: compatibilidad con serverless | L |
| Cerrar, suspender y cancelar proyecto | Endpoint, reglas de transición, permiso y botones en la ficha | P14 / REQ-ORG-08 | Los estados existen en el enum; no hay endpoint ni interfaz | Decidir reglas de cada transición (qué pasa con gastos y avances abiertos) | M |
| Quitar la semaforización territorial | El RF v2.0 pide eliminar la sección y la consulta `por_territorio`; el municipio queda solo como filtro | REQ-DSH-04 (`odd/tasks/v2-projects-sdd.md:733`) | Reintroducida por el diseño v6/v7 (D7): `src/components/proyectos/project-dashboard.tsx:551` | **Decisión del PO**: ¿manda el RF o el prototipo? | S (si se quita) |
| Fecha de fin mayor que la de inicio | Rechazar también `fin = inicio`. V-03 exige inicio estrictamente anterior a fin (supuesto A-18: el PO acepta proyectos de un día) | V-03 | Las rutas rechazan solo `fin < inicio`: `src/app/api/v1/projects/route.ts:230` y `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts:90` | Confirmar con el PO si se admiten proyectos de un día (A-18) | S |
| Valor total mayor que cero al crear | Hoy se permite 0 u omitido en la creación | REQ-ORG-04 | Solo se bloquea al aprobar la línea base (`odd/tasks/v2-projects-sdd.md:2794` lo decide así: la validación pertenece a S8.1) | Confirmar con el PO si debe exigirse desde la creación | S |
| Registro de acceso a soportes | Log de consulta de soportes (Ley 1581) | REQ-NFR-04 / RNF-04 | Implementado para soportes de gastos: `.../expenses/[expenseId]/attachments/[attachmentId]/download/route.ts:63`. El registro se inserta **después** de firmar la URL y no es transaccional con ella; si falla, responde 500 y no entrega la URL. Cobertura de otros tipos de soporte: **por verificar** | Decidir si basta con el comportamiento actual (falla cerrada) | S |
| Informe de rubros suspendidos | Reasignación manual de líneas presupuestales sobre rubros suspendidos | S1.1b (N-13) | Existe el script de solo lectura `scripts/migrate-v2/s1-rubros-report.ts`; si la reasignación posterior se hizo: **por verificar** | Acción manual del usuario sobre datos reales | S |

### C.2 Proyectos frente al prototipo v7

Fuente: prototipo v7 (diseño, no requisito) y `odd/tasks/v7-gap-analysis.md`. Dependencia general: ninguna requiere
migración, salvo que se indique.

| Pendiente | Qué falta exactamente | Estado actual | Dependencia o decisión | Tamaño |
|---|---|---|---|---|
| Cronograma | 4 KPI, leyenda de umbrales (editables en Administración), columnas "Días", "Al corte" y chip de soporte | `src/components/proyectos/project-cronograma.tsx` solo trae la tabla por semanas | Ninguna | M |
| Gantt | Relleno del avance real sobre la barra planeada y línea de corte | `src/components/proyectos/estructura-gantt.tsx` solo muestra lo planeado | Ninguna | M |
| Beneficiarios | KPI y desglose "Por grupo poblacional" | `src/components/proyectos/ejecucion-beneficiarios.tsx` solo trae el registro | Ninguna | S |
| Soportes | Formulario de vínculo (vincular a, URL de Drive) | Pestaña de solo lectura (`project-soportes.tsx`, `GET /projects/:id/supports`) | Decidir el modelo de vínculo (`SoporteProyecto` existe) | M |
| Financiero | Alertas del semáforo financiero y nota de "rubros sin asignación" | `project-financiero.tsx` tiene gauge, barras y tabla | Ninguna | S |
| Legalización | "Importar Excel" de gastos | `project-gastos.tsx` registra uno por uno | Definir plantilla y reglas de validación | M |
| Presupuesto | Formato de miles en los campos de dinero y meses legibles | Entradas numéricas sin formato | Ninguna | S |
| Encabezado de la ficha | Chips de línea estratégica y territorio | El encabezado muestra estado y semáforos | Ninguna | S |
| "Nueva planeación" editable | Entrada mensual editable del v7 en Ficha de seguimiento | Tabla mensual de solo lectura vía curva S | **Decisión de producto**: choca con el bloqueo de la línea base (S8) | L |

### C.3 Oportunidades

| Pendiente | Qué falta exactamente | Estado actual | Dependencia o decisión | Tamaño |
|---|---|---|---|---|
| C2 Vista global de oportunidades | Endpoint global (`GET /api/v1/opportunities` con totales), kanban de 7 etapas, ficha de oportunidad. Mapeo ya decidido y **sin migración**: EN_REVISION «Revisión TDR», DISENANDO_PROPUESTA «En formulación», PRESENTADA «Enviada · seguimiento», EN_NEGOCIACION «En negociación», GANADA «Aceptada», PERDIDA «Rechazada», STANDBY «En espera» | Solo la pestaña **Oportunidades** dentro de la ficha de cada cliente; la sección global es un marcador (`src/components/crm/clientes-section-placeholder.tsx`) | Ninguna (mapeo decidido) | L |
| Propuesta económica | Líneas presupuestales de la propuesta (imprevistos, overhead, rubros) y herencia de esas líneas al convertir en proyecto | No existe modelo | Diseñar modelo y migración | L |
| Convocatorias (opcional) | Modelo, CRUD y página; acción "Crear oportunidad" | No existe | Confirmar si entra en el alcance | M |

### C.4 Clientes

| Pendiente | Qué falta exactamente | Estado actual | Dependencia o decisión | Tamaño |
|---|---|---|---|---|
| C1b Aliados maestro/detalle | Rediseño de la lista a lista + ficha, con conteo de oportunidades y proyectos y puntaje de salud por fila | La lista actual sigue como pestaña Aliados | Ninguna | M |
| C6 Mapa | Cobertura por departamento | Sin empezar | **Decisión**: `Cliente.ubicacion` es texto libre; modelar la relación con departamento o agregar por el texto | M |
| C7 Reglas adicionales de automatización | Recordar compromisos 2 días antes, alertar 30 días sin contacto, plantillas de correo y envío | Solo el resumen diario con umbral configurable (`Setting` clave `automatizaciones`) | Definir proveedor de correo y plantillas | L |
| C8 Guías por sección | Una guía de usuario por sección | Sin empezar | **Decisión**: el prototipo v7 no trae ayuda en la app; ¿panel dentro de la app o documento del repositorio? | M |
| C5b Salud: verificación visual | Pase de capturas en claro y oscuro, 1440 y 390 px | Implementada (`8cc448a`), sin verificación visual | Ninguna | S |
| Fecha de primer contacto | Mostrarla con formato legible en la hoja del cliente | Se muestra cruda (ISO) | Ninguna | S |

### C.5 Tablero de tareas

| Pendiente | Qué falta exactamente | Estado actual | Dependencia o decisión | Tamaño |
|---|---|---|---|---|
| Enlace al proyecto exacto | Exponer id y código del proyecto en el DTO de la tarea, para que la tarjeta convertida enlace al proyecto | El DTO no los trae | Ninguna | S |
| Tarjeta **Pasar a nuevo proyecto →** | Mostrarla en la demo | Exige una tarea comercial completada de una oportunidad ganada sin proyecto; `src/components/kanban/board-logic.ts:112` | Datos de demostración, no un defecto | S |

## D. Decisiones que necesitan al PO o al usuario

1. Semaforización territorial: ¿se quita (RF) o se mantiene (prototipo)? (REQ-DSH-04)
2. Motor de PDF y fecha de entrega del PDF (D-08).
3. Reglas de cerrar, suspender y cancelar un proyecto (P14).
4. ¿Se admiten proyectos de un día (inicio = fin)? (V-03 / A-18)
5. ¿El valor total debe ser mayor que cero desde la creación o basta al aprobar la línea base? (REQ-ORG-04)
6. "Nueva planeación" editable frente al bloqueo de la línea base (S8).
7. Mapa: modelar la relación cliente-departamento o agregar por texto libre (C6).
8. Guías por sección: panel en la app o documento (C8).
9. Alcance de Convocatorias y de la propuesta económica.
10. Estrategia de PRs encadenados y proveedor del ambiente de pruebas (sección B).
11. Publicar: push, PR y merge, y la ventana para `migrate deploy` en producción (decisión del usuario).

## E. Fuentes

- Documentos del PO en `~/Downloads`: `Requerimientos_Funcionales_v2_Modulo_Proyectos.docx`,
  `Estructura_Detalle_Tecnico_y_Financiero.docx`, `Requerimientos Funcionales - Detalle Clientes.docx`,
  `Requerimientos Funcionales - Tablero de Seguimiento y Gestión Social.docx`.
- `odd/tasks/v2-projects-sdd.md`: SDD derivado del RF, con los identificadores REQ, V, P y D usados arriba.
- Prototipo v7: `~/Downloads/Web app views creation/Muttu Hub v7.dc.html`. Es diseño, **no** requisito.
- `docs/Muttu_Hub_PRD_v2.md` **no** cubre Proyectos; no sirve como fuente de requisitos de este módulo.
- Análisis de brechas: `odd/tasks/v7-gap-analysis.md`; auditoría profunda del 2026-10-13: `docs/analisis/`.

## F. Orden sugerido después de la reunión

| Orden | Trabajo | Tamaño aprox. |
|---|---|---|
| 1 | Sección A completa: restaurar datos, destrabar el push, suite + `tsc` + `next build`, registrar resultado | S |
| 2 | Resolver las decisiones D.1 a D.5 con el PO (son las que desbloquean requisitos del RF) | S (reuniones) |
| 3 | Ambiente de pruebas y ensayo de migraciones (sección B, pasos 1 a 4); es la ruta crítica a producción | L |
| 4 | Requisitos del RF baratos: V-03, REQ-ORG-04 al crear, REQ-DSH-04 según decisión | S |
| 5 | PRs encadenados y revisión (sección B, paso 5) en paralelo con el ambiente de pruebas | L |
| 6 | Brechas v7 de Proyectos de tamaño S y M (Cronograma, Gantt, Beneficiarios, Financiero, formatos) | M |
| 7 | P14 (cerrar, suspender y cancelar) y PDF, cuando haya decisión | M a L |
| 8 | Oportunidades C2 y resto de Clientes (C1b, C6, C7, C8) | L |
| 9 | Producción: respaldo, `migrate deploy`, merge a `main` | M |
