# Plan PO 2026-11-10 — Ajustes de Proyectos (Parte 1) y presupuesto por actividad (Parte 2)

Fuente: `docs/Hub-proyectos261110.docx` («Ajustes y evolución del módulo Proyectos», observaciones de las pruebas del 10 de noviembre de 2026). Rama de trabajo: una por tarea desde `main`.
Entrega: un PR por tarea, CI verde (`unit` + `e2e`) antes de mergear. Runner: `npx vitest run src scripts` (unit/API),
`npx vitest run prisma/<archivo>` (invariantes, base local), `npx playwright test --config playwright.ci.config.ts` (e2e).

## Cómo usar este plan (agente ejecutor, p. ej. Fable 5.2)

1. Lee este documento **completo hasta `## Log`** antes de tocar código. Las specs `S#` son textuales de la PO: no las
   reinterpretes; si algo no cierra, detente y anótalo como pregunta.
2. Toma **una sola tarea** (`T#`) por sesión. Su tarjeta dice qué specs cubre, dónde está el código hoy (con
   `ruta:línea` verificadas el 2026-11-10 sobre `main` `120c8a9`), qué test escribir primero y cómo se verifica.
3. **Test primero:** escribe el test con el ejemplo numérico de «Se acepta si», míralo fallar (RED), implementa, míralo
   pasar (GREEN). Cada ejemplo de «Se acepta si» es un test.
4. Antes de abrir el PR: `npx tsc --noEmit -p .`, `npx eslint <archivos>`, `npx knip` (bloquea CI), la suite unit
   completa y los invariantes de `prisma/` que toque la tarea.
5. Reglas del repo que no se negocian: toda escritura de datos va contra la base **local** (`.env.local`,
   127.0.0.1:54322), nunca el `.env` raíz (producción). Toda migración se ensaya sobre una copia restaurada de
   producción antes de aplicarse (`docs/runbook-lanzamiento-v2.md` §3.1). Regla del boy scout: limpia la deuda del
   área que tocas (por ejemplo, partir `src/hooks/projects.ts`) solo si es parte del mismo cambio.
6. Al cerrar la tarea: marca su fila en `## Tasks` con el PR y el commit, y agrega una línea al `## Log`.

## Specs

Texto de la PO entre «comillas», sin cambios. «Propuesto» = la PO lo deja a comentario antes de implementar.

Nota general de la PO: «El documento tiene dos partes. La Parte 1 son ajustes a lo que ya está construido. La Parte 2 es un nuevo alcance: el presupuesto pasa a llevarse por actividad. Por favor, estima la Parte 2 por separado para no retrasar la Parte 1. Cada punto dice qué pasa hoy, cómo debe quedar y cómo se comprueba. Propuesto = detalle que el equipo no pidió de forma explícita, pero que la regla necesita; se puede comentar antes de implementarlo.»

### S1. AJ-07. El avance técnico ejecutado debe usar los avances reportados

**Hoy:** «El avance técnico ejecutado se queda en 3,3 % en octubre y en noviembre, aunque haya actividades con avances reportados. Solo cuenta las actividades Terminadas. El error aparece a la vez en la tarjeta “Periodo del reporte”, en la curva S de avance técnico y en la tabla por periodo.»

**Debe quedar**
- «El avance de cada actividad es su último avance reportado hasta el cierre del periodo, o 100 % si está Terminada.»
- «Para los meses ya cerrados se usa el último reporte con fecha dentro de ese mes, según el historial de avances.»
- «El cálculo se aplica igual en la tarjeta del periodo, la curva S técnica, la tabla por periodo y el semáforo técnico.»
- «Se mantiene la ponderación por duración (AJ-02): avance del proyecto = Σ (peso × avance) / Σ pesos.»
- «Las actividades de tipo Transversal no entran en este cálculo (EV-02).»

**Se acepta si**
- «Una actividad que pesa 4 de 30 semanas reporta 50 % en noviembre: el ejecutado técnico de noviembre sube 4 × 0,50 / 30 = 6,7 puntos.»
- «La tarjeta, la curva y la tabla muestran el mismo valor para el mismo periodo.»
- «Un reporte del 28 de octubre se refleja en octubre; uno del 3 de noviembre, solo desde noviembre.»

### S2. AJ-08. Gastos sin aprobación, con validadores y alertas

**Hoy:** «Los gastos quedan en estado Registrado y solo cuentan como ejecutado cuando alguien los valida. Existen los filtros Validado, Rechazado y “Pendiente por revisión”, y la columna “Por validar”. Por eso Promoción y divulgación muestra $938.000 por validar y el ejecutado del proyecto está en $0. Además, el soporte se elige como archivo o como enlace, y solo uno.»

**Debe quedar**
- «Sin aprobación: se eliminan los estados Validado, Rechazado y Pendiente por revisión, y la columna “Por validar”. Todo gasto registrado cuenta como ejecutado (subtotal + IVA) en su periodo. Los gastos ya son pagos hechos; el control pasa a reglas automáticas.»
- «Validadores al digitar: valores numéricos, mayores que 0, mostrados con separador de miles; el total lo calcula el sistema; advertencia si el IVA supera el 19 % del subtotal. Propuesto: pedir confirmación si un solo gasto supera el 50 % del asignado del rubro, para detectar ceros de más.»
- «Alertas de sobreejecución, que no bloquean el registro: advertencia si el ejecutado acumulado del rubro supera lo programado hasta ese periodo; alerta crítica si supera el asignado total del rubro, con el mensaje “Solicita un traslado al Gerente”.»
- «Duplicados: advertencia si ya existe un gasto del mismo tercero con el mismo número de documento.»
- «Corrección: el Gestor del proyecto puede editar o anular un gasto, con motivo obligatorio y registro en auditoría. El gasto anulado no suma al ejecutado, pero no se borra.»
- «Soportes: cada gasto admite varios archivos y varios enlaces a la vez (completa AJ-06).»
- «Plantilla de gastos: se rechaza toda fila sin enlace de soporte, con indicación de fila y columna.»
- «Propuesto: en la ficha financiera, un resumen de cambios del periodo (gastos editados y anulados) con acceso al detalle y los motivos, para que el Gerente pueda revisarlos sin entrar a la operación diaria.»

**Se acepta si**
- «Al registrar un gasto, el ejecutado del rubro sube de inmediato, sin otro paso.»
- «Los $938.000 de Promoción y divulgación aparecen como ejecutado.»
- «Un gasto que deja el rubro por encima de su asignado se guarda y muestra la alerta crítica.»
- «Registrar dos veces la misma factura del mismo tercero muestra la advertencia antes de guardar.»
- «Un gasto anulado aparece en el historial y no suma.»
- «Un gasto se guarda con 2 archivos y 1 enlace, y muestra los 3.»
- «Una fila de la plantilla sin enlace se rechaza.»

### S3. AJ-09. El Gestor puede solicitar traslados entre rubros

**Hoy:** «Con el rol colaborador el Gestor de proyecto no es posible solicitar un traslado entre rubros, y no está claro qué permisos tiene este rol.»

**Debe quedar**
- «El Gestor solicita el traslado: rubro de origen, rubro de destino, valor y motivo obligatorio.»
- «El Gerente aprueba o rechaza. Al aprobar se genera una nueva versión del presupuesto; si rechaza, el comentario es obligatorio.»
- «El Gestor ve el estado de sus solicitudes (pendiente, aprobada, rechazada) con el comentario.»
- «El Gerente ve las solicitudes pendientes de forma visible, por ejemplo como alerta en la ficha del proyecto.»
- «Por favor confirma si el rol Gerente ya existe en el Hub con permiso de aprobar. Si no existe, nadie puede aprobar aunque el Gestor pueda solicitar.»

**Se acepta si**
- «Un usuario Gestor crea una solicitud de traslado.»
- «La solicitud no cambia el presupuesto hasta que el Gerente la aprueba.»
- «No se puede trasladar un valor que deje el rubro de origen por debajo de lo ya ejecutado.»

### S4. AJ-10. Alerta de posible retraso

**Hoy:** «La ficha de CedeTextil muestra al mismo tiempo “Semáforo técnico: Rojo” y “Semáforo financiero: Verde”. El financiero está en verde porque se ha gastado menos de lo programado, pero con el técnico en rojo eso indica casi siempre retraso, no ahorro.»

**Debe quedar**
- «Se muestra la alerta “Posible retraso” junto al semáforo financiero cuando se cumplen las dos condiciones: el ejecutado del periodo es menor que un porcentaje de lo programado y el semáforo técnico está en amarillo o rojo.»
- «El porcentaje es un parámetro del Administrador. Propuesto: valor inicial de 60 %.»
- «La alerta no cambia el color del semáforo financiero; lo complementa.»
- «Se muestra en la ficha del proyecto y en el Tablero gerencial.»

**Se acepta si**
- «Técnico en rojo y ejecutado del 1 % de lo programado: aparece la alerta.»
- «Técnico en verde y ejecutado del 40 % de lo programado: no aparece la alerta.»
- «Técnico en rojo y ejecutado del 80 % de lo programado: no aparece la alerta.»

Parte 2 — nota de la PO: «El presupuesto deja de llevarse solo por rubro y pasa a llevarse por actividad y rubro. Esto reemplaza la regla anterior de que el presupuesto nacía del rubro. El objetivo es ver, para cada actividad, cuánto se planeó, cuánto se gastó y la diferencia, y mantener además el resumen por rubro para la gerencia. Los ajustes de la Parte 1 siguen aplicando.»

### S5. EV-01. Presupuesto por actividad y rubro

**Hoy:** «El presupuesto se carga por rubro, con un valor asignado y una programación mensual por rubro.»

**Debe quedar**
- «Cada línea del presupuesto es una combinación actividad + rubro + valor. Una actividad puede tener uno o varios rubros (por ejemplo, solo Personal, o Formación y Transporte).»
- «El asignado por rubro y el valor total del proyecto se calculan sumando las líneas; no se digitan.»
- «Plantilla del proyecto, hoja Presupuesto: columnas Código de actividad, Rubro y Valor; una fila por combinación.»
- «Se elimina de la plantilla la hoja de Programación mensual (ver EV-03).»
- «Validaciones: la actividad existe, el rubro está activo y no se repite la misma combinación actividad + rubro.»

**Se acepta si**
- «Una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas, y esos valores suman en sus rubros.»
- «Una plantilla con la misma actividad y rubro en dos filas se rechaza con fila y columna.»

### S6. EV-02. Actividad de tipo Transversal

**Hoy:** «Todas las actividades pertenecen a un objetivo y cuentan en el avance técnico. Los gastos que no son de una sola actividad (por ejemplo, el personal de coordinación) no tienen dónde ubicarse.»

**Debe quedar**
- «Las actividades tienen un tipo: Normal o Transversal.»
- «Las transversales se agrupan en “Gestión del proyecto”, un grupo aparte de los objetivos.»
- «Una actividad transversal no requiere entregables y no entra en el avance técnico, la curva S técnica ni el cumplimiento del cronograma.»
- «Sí entra en el presupuesto, la programación, el registro de gastos y las vistas financieras.»
- «Plantilla, hoja Actividades: columna Tipo; en las transversales el objetivo va vacío. Propuesto: sus fechas son, por defecto, las del proyecto.»

**Se acepta si**
- «Un proyecto con una actividad transversal de 17 semanas tiene el mismo avance técnico que sin ella.»
- «La actividad transversal aparece en el grupo “Gestión del proyecto” y se puede elegir al registrar gastos.»

### S7. EV-03. Programación mensual propuesta por el sistema

**Hoy:** «La programación mensual se digita por rubro en la hoja de Excel.»

**Debe quedar**
- «Al importar, el sistema propone la programación mensual de cada línea (actividad + rubro) en proporción a los días que la actividad ocupa en cada mes. El centavo que sobre por redondeo se suma al último mes.»
- «Ejemplo: actividad del 19 de octubre al 15 de noviembre (28 días) con Transporte por $10.000.000: 13 días en octubre y 15 en noviembre, se proponen $4.642.857 y $5.357.143.»
- «En las transversales la propuesta sale pareja por mes, y el Gestor la ajusta.»
- «El Gestor revisa y ajusta en la web, en una pantalla agrupada por actividad (grupos que se pliegan y despliegan) y con arriba los totales por rubro y por mes.»
- «El Gestor confirma la programación cuando “Falta por programar” queda en $0 en todas las líneas. Después el Gerente aprueba la línea base, como hoy.»

**Se acepta si**
- «Al importar la plantilla, todas las líneas tienen una programación propuesta que suma su valor.»
- «Al editar un mes, el total por rubro y por mes de arriba se actualiza.»
- «No se puede confirmar si alguna línea tiene un valor pendiente por programar.»

### S8. EV-04. Reprogramación entre meses por el Gestor

**Hoy:** «Después de aprobada la línea base, toda reprogramación exige una modificación aprobada por el Gerente.»

**Debe quedar**
- «El Gestor puede mover valores entre meses de una misma línea sin aprobación, siempre que el total de la línea no cambie.»
- «Cada movimiento queda en auditoría (línea, mes de origen, mes de destino, valor, usuario, fecha).»
- «Solo se pueden mover valores del mes en curso hacia meses futuros, o entre meses futuros. Los meses ya cerrados no se modifican, para no cambiar los semáforos pasados.»
- «Los traslados entre rubros o entre actividades sí requieren aprobación del Gerente (AJ-09). Con esta evolución, el traslado indica actividad y rubro de origen, y actividad y rubro de destino.»

**Se acepta si**
- «El Gestor pasa $2.000.000 de Transporte de noviembre a diciembre en una actividad, sin aprobación, y el total de la línea no cambia.»
- «Un cambio que altere el total de la línea no se permite sin traslado aprobado.»
- «En noviembre no se puede mover valor desde octubre.»

### S9. EV-05. Registro de gasto por objetivo, actividad y rubro, con facturas distribuidas

**Hoy:** «El gasto se registra por rubro, sin actividad.»

**Debe quedar**
- «Orden del formulario: Objetivo (o “Gestión del proyecto”), Actividad y Rubro.»
- «El objetivo funciona solo como filtro: al elegir el objetivo 1, solo aparecen sus actividades. No se guarda como dato aparte; se deduce de la actividad.»
- «En Rubro solo aparecen los rubros presupuestados en la actividad elegida.»
- «Factura que cubre varias actividades: se registra una sola factura (un tercero, un número de documento, sus soportes) con varias líneas. El usuario indica en cada línea la actividad, el rubro y el valor que le corresponde. Ejemplo: factura de $1.000.000, actividad 1.2 por $350.000 y actividad 1.3 por $650.000.»
- «La suma de las líneas debe ser exactamente igual al total de la factura; si no, no se guarda. Propuesto: el IVA de cada línea se calcula en proporción a su subtotal y se puede corregir.»
- «El control de duplicados y la anulación se aplican a la factura completa.»
- «Plantilla de gastos: columna Código de actividad. Varias filas con el mismo tercero y el mismo número de documento se leen como una sola factura distribuida, no como duplicados, y deben sumar el total.»

**Se acepta si**
- «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.»
- «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3, y se puede consultar como un solo documento.»
- «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»

### S10. EV-06. Vistas financieras por actividad y por rubro

**Hoy:** «Solo existe la vista por rubro.»

**Debe quedar**
- «Selector “Por actividad / Por rubro” en Finanzas.»
- «Por actividad: agrupada por objetivo y por “Gestión del proyecto”. Por cada actividad: asignado, programado al corte, ejecutado, saldo o ahorro (EV-07) y semáforo. Al abrir una actividad se ve el detalle por rubro.»
- «Por rubro: la vista actual (curva S, tabla por periodo, semáforo). El valor de cada rubro es la suma de ese rubro en todas las actividades.»
- «El semáforo usa la misma regla de gasto óptimo en las dos vistas: ejecutado frente a lo programado al corte.»

**Se acepta si**
- «El ejecutado total es igual en las dos vistas.»
- «Un gasto registrado en la actividad 1.2 sube el ejecutado de esa actividad y el de su rubro.»

### S11. EV-07. Cierre de gastos de la actividad: saldo, ahorro o sobreejecución

**Hoy:** «No existe.»

**Debe quedar**
- «Mientras la actividad tiene gastos abiertos, muestra saldo = asignado − ejecutado. No se llama ahorro, porque pueden faltar facturas.»
- «El Gestor marca “Cerrar gastos de la actividad” cuando ya no espera más facturas. Al cerrar, debe escribir una nota obligatoria que explique la diferencia (por ejemplo, “No se requirió transporte porque el taller fue en el mismo municipio”).»
- «Con los gastos cerrados, la actividad muestra ahorro (si sobró) o sobreejecución (si se gastó de más), con su nota.»
- «Una actividad con gastos cerrados no recibe gastos nuevos. Propuesto: el Gestor puede reabrirla con motivo, y queda en auditoría.»
- «El ahorro tiene dos destinos posibles: queda en la actividad como saldo disponible, o se traslada a otra actividad y a otro rubro (por ejemplo, ahorro de Transporte en la actividad 1.2 que pasa a Suministros en la actividad 2.1). El traslado lo solicita el Gestor y lo aprueba el Gerente (AJ-09).»

**Se acepta si**
- «Una actividad abierta con asignado $10.000.000 y ejecutado $7.000.000 muestra saldo $3.000.000.»
- «Un ahorro de $3.000.000 trasladado y aprobado reduce el disponible de la actividad de origen y aumenta el de la actividad y rubro de destino; el total del proyecto no cambia.»
- «Al cerrarla con nota, muestra ahorro $3.000.000 y la nota.»
- «No se puede cerrar sin nota; no se pueden registrar gastos en una actividad cerrada.»

### S12. EV-08. Nueva carga de CedeTextil

**Hoy:** «CedeTextil está en ejecución con el presupuesto por rubro.»

**Debe quedar**
- «CedeTextil se vuelve a cargar con la nueva estructura (actividades, tipo, presupuesto por actividad y rubro).»
- «El gasto ya registrado ($938.000 en Promoción y divulgación) no se migra: el equipo lo vuelve a registrar con su actividad después de la nueva carga.»

**Se acepta si**
- «Después de la carga, la ficha de CedeTextil muestra el presupuesto por actividad y no conserva gastos de la estructura anterior.»
- «Al volver a registrar el gasto de $938.000 con su actividad, aparece en la vista por actividad y en la vista por rubro.»

## Decisiones abiertas (preguntar a la PO antes de la tarea que bloquean)

| ID | Pregunta | Bloquea | Recomendación técnica |
|---|---|---|---|
| D1 | S1 dice «el último avance reportado […] o 100 % si está Terminada». Hoy el sistema toma **el mayor** entre el último reporte y el promedio de entregables, y un avance de entregable solo cuenta si tiene medio de verificación (`src/lib/proyectos/avance.ts:234`, parámetro `avance_requiere_medio`). ¿Se quitan los entregables del cálculo? | T2 (solo la regla; el arreglo de la curva no) | Mantener la regla actual; el «3,3 %» viene de que la curva no lee los reportes (T1), no de la regla |
| D2 | Al quitar la aprobación (S2), ¿qué pasa con los gastos ya **Rechazados** en producción? ¿Cuentan como ejecutado, quedan anulados, o se revisan uno a uno? | T4 | Pasarlos a anulados con motivo «rechazado antes de AJ-08», visibles en el historial |
| D3 | ¿Quién es el «Gestor» y quién el «Gerente»? En el Hub no hay roles por proyecto: **Gerente** = rol global `GERENCIA` (ya existe y aprueba modificaciones, `src/lib/permissions.ts:200`). «Gestor» hoy sería un miembro `COORDINADOR`/`COLABORADOR` del proyecto. | T3, T6 | Gestor = miembro del proyecto con rol `COORDINADOR` o `COLABORADOR`; sin migración |
| D4 | Los «Propuesto» de S2 (confirmar gasto > 50 % del rubro; resumen de cambios del periodo), S4 (60 %), S6 (fechas por defecto), S9 (IVA proporcional) y S11 (reabrir con motivo): ¿se aceptan? | T5, T7, Fase 2 | Aceptarlos todos |
| D5 | S12: CedeTextil en producción tiene línea base aprobada y versiones **inmutables** (trigger). «Volver a cargar» no puede borrarlas. ¿Se crea un proyecto nuevo con la nueva estructura y el actual se cierra/archiva? | T15 | Proyecto nuevo + el actual archivado |

**Respuestas del usuario (2026-11-11, textuales en L8).** Las dio el usuario, no la PO.

| ID | Respuesta | Efecto |
|---|---|---|
| D1 | Mantener la regla actual | T2 no se hace |
| D2 | Los rechazados quedan anulados y no se borran | T4 destrabada; el cambio de estado en producción sigue siendo tarea aparte con ensayo |
| D3 | Gestor = miembro del proyecto con rol `COORDINADOR` o `COLABORADOR`; Gerente = `GERENCIA` | T3 y T6 destrabadas |
| D4 | No se acepta la confirmación de gasto > 50 % del rubro; el resto de «Propuesto» se acepta (el 60 % de S4 ya está en T8) | T5 sin esa confirmación; T7 y Fase 2 destrabadas |
| D5 | Abierta: el usuario pidió la explicación de por qué hace falta un proyecto nuevo | T15 sigue bloqueada |

## Tasks

Tamaños: **S** ≤ medio día de agente, **M** ≈ 1 día, **L** > 1 día (se parte antes de empezar). Todas inline (una
sesión de agente por tarea) salvo que la tarjeta diga otra cosa.

| ID | Specs | Qué | Tamaño | Depende de | Riesgo | Estado |
|---|---|---|---|---|---|---|
| T0 | — | Cerrar urgencias: mergear #166 (invitaciones rotas) y probar una invitación real | S | — | 2 (auth) | Pendiente |
| T1 | S1 | La curva S, la tabla por periodo, «Periodo del reporte» y «Requiere atención» leen los reportes de avance | S | — | 6 | Hecha: PR #169, `91b467a` en `main`; verificación manual en local pendiente |
| T2 | S1 | Regla de avance por actividad según D1 (solo si la PO cambia la regla) | S | D1, T1 | 6 | No se hace: D1 mantiene la regla actual (L8) |
| T3 | S3 | El Gestor solicita traslados; el Gerente ve pendientes; validación contra lo ejecutado | S–M | D3 | 2 (permisos) | Hecha: PR #171, `5934e4e` en `main`; verificación manual en local pendiente |
| T4 | S2 | Gasto sin aprobación: todo gasto no anulado es ejecutado; se quitan «Por validar», filtros y cola | M | D2 | 3 (lectores compartidos) | Hecha: PR #172, `f5c4e4e` en `main`; verificación manual en local pendiente |
| T5 | S2 | Validadores al digitar, alertas de sobreejecución que no bloquean y aviso de duplicados | M | T4, D4 | — | Hecha: `9214f06` (servidor) y `fa2dfb3` (formulario) en `feat/aj-08-validadores-alertas`; verificación manual en local pendiente |
| T6 | S2 | Gestor edita/anula con motivo y auditoría; varios archivos y enlaces por gasto; plantilla exige enlace | M | T4, D3 | 1 si toca datos | Hecha: `843842b`, `8b11b05`, `c7e46da`, `f47680b`, `83e9e94` en `feat/t6-aj08-correccion-y-plantilla`; verificación manual en local pendiente |
| T7 | S2 | (Propuesto) Resumen de cambios del periodo en la ficha financiera | S | T6, D4 | — | Pendiente |
| T8 | S4 | Alerta «Posible retraso» visible en ficha y Tablero gerencial (la lógica ya existe) | S | — | — | Hecha: PR #170, `261e995` en `main`; verificación manual en local pendiente |
| T9 | S5–S12 | **Diseño y estimación de la Parte 2** (sin código): modelo de datos, migraciones, plantillas, recarga de CedeTextil | M | D5 | — | Pendiente |
| T10–T15 | S5–S12 | Rebanadas de la Parte 2, definidas por T9 (orientativas abajo) | L en total | T9 | 1 | Pendiente |

### Orden y calendario sugerido

- **Día 1 (prueba con Fable):** T0 → T1 → T8 (sin migraciones, riesgo bajo; terminan con la ficha de CedeTextil
  mostrando el avance real y la alerta). En paralelo, mandar D1–D5 a la PO.
- **Día 2:** T3 y T4 (con D2 y D3 respondidas), luego T5 y T6.
- **Después:** T7, y T9 como entrega aparte para que la PO apruebe la estimación de la Parte 2 (la PO pidió estimarla
  por separado para no retrasar la Parte 1).
- Junto con la primera migración de la Parte 2 entra también #165 (AJ-02, borrar `peso`/`peso_manual`): misma ventana,
  mismo ensayo sobre copia de producción.

## Tarjetas de tarea

### T0 — Urgencias (S)

- Mergear #166 cuando su CI esté verde (corrige `/auth/confirm`: GoTrue rechaza `email` junto a `token_hash`).
- Verificar en producción: invitar un usuario de prueba, abrir el enlace, crear la contraseña, entrar. Borrar el usuario.
- Terminado cuando: el enlace de invitación ya no cae en «Enlace no válido».

### T1 — AJ-07: la curva y «Requiere atención» leen los reportes (S)

- **Causa (verificada):** `src/lib/api/curva.ts:135` llama `calcularTecnico({ corte, requiereMedio, tope, actividades })`
  **sin `reportes`**, así que la curva S técnica (`curve-s-chart.tsx:75`), la tabla por periodo
  (`curve-s-chart.tsx:219-240`) y la tarjeta «Periodo del reporte» (`project-ejecucion.tsx:524-560`, lee
  `curva.periodos[corte].tecnico.ejecutado`) solo ven entregables. Lo mismo `src/lib/api/atencion.ts:58-140`.
  En cambio `src/lib/api/tecnico.ts:68-104` (semáforo técnico) y `src/lib/api/kpis-portafolio.ts:94,180` sí los leen.
- **Qué hacer:** cargar `reporteActividad` (no anulados) en `curva.ts` y `atencion.ts` igual que `tecnico.ts`
  (reusar `agruparReportesPorActividad`; si hace falta, moverlo a un helper compartido en `src/lib/api/`) y pasarlos a
  `calcularTecnico`. `progresoActividad` (`src/lib/proyectos/avance.ts:234`) ya filtra por fecha con `hasta`, así que
  cada periodo ve solo los reportes con fecha ≤ fin del periodo.
- **Tests primero** (`src/lib/api/curva.test.ts`, `src/app/api/v1/projects/[id]/curve/route.test.ts`):
  1. Actividad de 4 de 30 semanas con reporte de 50 % en noviembre → el técnico ejecutado de noviembre sube 6,7 puntos
     (4 × 0,50 / 30).
  2. Reporte del 28 de octubre cuenta en octubre; uno del 3 de noviembre solo desde noviembre.
  3. Mismo periodo → mismo valor en curva, tabla y tarjeta, y en el semáforo técnico (`technical-status`).
  4. Un reporte anulado no cuenta.
- **No incluye:** excluir transversales (depende de EV-02, Fase 2).
- **Verificación manual:** sembrar la base local (`db:seed:local` + `db:demo:seed-projects:local -- --apply`), registrar
  un avance en PRY-2026-001 y ver que la curva y la tarjeta se mueven.
- **Terminado cuando:** los cuatro tests pasan y la ficha de CedeTextil local deja de mostrar 3,3 % con avances
  reportados.

### T2 — AJ-07: regla de avance por actividad (S, solo si D1 lo pide)

- Cambiar `progresoActividad` (`src/lib/proyectos/avance.ts:234`) según la respuesta a D1. Tests en
  `src/lib/proyectos/avance.test.ts`. Afecta a todos los lectores del avance a la vez (curva, KPIs, semáforo, atención).

### T3 — AJ-09: traslados por el Gestor (S–M)

- **Ya existe:** `SolicitudModificacion` con `TipoModificacion.TRASLADO` (`prisma/schema.prisma:1334`), reglas en
  `src/lib/proyectos/modificaciones.ts` (`TRASLADO_CAMBIA_TOTAL`, `validarModificacion` :275), servidor
  `src/lib/api/modificaciones.ts` (`gateModificacionRequest` :83 exige `canExecuteProject` y proyecto EN_EJECUCION con
  línea base; aprobar crea la versión N+1 en `aplicarModificacion` :450), UI `modificacion-form.tsx`,
  `project-modificaciones.tsx`. Permisos: `canExecuteProject` (`src/lib/permissions.ts:158`) ya deja a un
  COORDINADOR/COLABORADOR **miembro** solicitar; `canApproveModification` (:200) es solo ADMINISTRADOR/GERENCIA.
- **Primer paso: reproducir** con un COLABORADOR miembro de un proyecto EN_EJECUCION (local) por qué no puede
  solicitar el traslado (¿la UI esconde el botón?, ¿no es miembro?, ¿el gate?). Documentar la causa en el Log.
- **Qué falta probablemente:** el formulario de traslado simple (origen, destino, valor, motivo obligatorio); la
  validación «No se puede trasladar un valor que deje el rubro de origen por debajo de lo ya ejecutado» (comprobar si
  existe; si no, agregarla en `validarModificacion` usando el ejecutado de T4); comentario obligatorio al rechazar
  (`rechazarModificacion` :514); el Gestor ve sus solicitudes con estado y comentario; alerta de pendientes en la ficha
  para GERENCIA.
- **Tests:** uno por cada «Se acepta si» de S3, en `modifications/**/route.test.ts` y `modificaciones.test.ts`; más
  `src/lib/permissions.test.ts` si cambia un permiso; `e2e/proyectos-v2/permisos.spec.ts` no debe romperse.
- **Respuesta para la PO (D3):** el rol Gerente existe como `GERENCIA` y ya puede aprobar.

### T4 — AJ-08: gasto sin aprobación (M)

- **Hoy:** `enum EstadoGasto { REGISTRADO, VALIDADO, RECHAZADO, ANULADO }` (`prisma/schema.prisma:1202`) y el ejecutado
  cuenta **solo VALIDADO** en al menos seis lectores: `src/lib/api/financiera.ts:21` (`loadGastosValidados`),
  `ficha-financiera.ts:76,101`, `kpis-portafolio.ts:133`, `src/lib/api/modificaciones.ts:159`,
  `validacion-gastos.ts:150`, `src/lib/proyectos/gastos.ts:276` (`superaAsignado`). «Por validar» se calcula en el
  cliente: `project-presupuesto.tsx:79-86,146,250`. Filtro «Pendiente por revisión» = `OBSERVADOS`
  (`project-gastos.tsx:54-71`). Cola global: `/api/v1/expense-validations`, `expense-validation-queue.tsx`.
- **Qué hacer (patrón expandir/contraer, sin migración en esta tarea):** un solo predicado compartido «cuenta como
  ejecutado» = estado distinto de ANULADO (y de RECHAZADO según D2), usado por **todos** los lectores; quitar de la UI
  validar/rechazar, «Por validar», los filtros Validado/Rechazado/Pendiente por revisión y la cola de validación. Los
  valores del enum y los CHECK (`20261010120000_v2_gastos_validacion`) **no se tocan aquí**: se eliminan después, en una
  migración de contracción ensayada sobre copia de producción (como AJ-02/#165).
- **Datos de producción:** según D2. Si hay que cambiar estados existentes, es una tarea aparte con ensayo (riesgo 1).
- **Tests:** «Al registrar un gasto, el ejecutado del rubro sube de inmediato» y «Los $938.000 de Promoción y
  divulgación aparecen como ejecutado» (fixture equivalente), en `src/lib/api/gastos.test.ts`,
  `expenses/route.test.ts`, `project-presupuesto.test.tsx`; `prisma/gastos.invariant.test.ts` en verde; e2e
  `ficha-ejecucion.spec.ts` actualizado.
- **Ojo:** «Pendiente por revisión» no es un estado, es un filtro: no hace falta `ALTER TYPE`.

### T5 — AJ-08: validadores y alertas (M)

- Validadores al digitar en `gasto-form.tsx` (numéricos > 0, separador de miles, total calculado, advertencia IVA > 19 %
  del subtotal). La confirmación propuesta para un gasto que supera el 50 % del asignado del rubro **no se
  implementa** (D4, L8).
- Sobreejecución **sin bloquear**: hoy `validacion-gastos.ts` bloquea con 409 al validar; pasar la regla al registro
  como advertencia (ejecutado acumulado > programado al periodo) y alerta crítica (> asignado del rubro) con el mensaje
  textual «Solicita un traslado al Gerente».
- Duplicados: advertencia antes de guardar si existe gasto del mismo tercero con el mismo número de documento (el
  importador ya detecta duplicados: `gastos-import/parse.ts`; reusar la clave).
- **Heredado de T4 (L11):** al quitar la validación, `notificarSobregasto` (`src/lib/api/notificaciones-proyecto.ts`)
  quedó sin quien lo llame: registrar un gasto que supera el asignado ya no avisa a Gerencia por la campana. Decidir
  aquí si el aviso sale al registrar, junto con la alerta crítica. `notificarGastoRechazado` también quedó sin uso.
- **Tests:** los «Se acepta si» de alerta crítica y factura duplicada.

### T6 — AJ-08: corrección, soportes y plantilla (M)

- Editar/anular por el Gestor con motivo obligatorio y auditoría (`logChange` en `src/lib/api/audit-cambios.ts:156`,
  `CAMPOS_AUDITABLES_GASTO` en `src/lib/api/gastos.ts:547`). Hoy PATCH solo lo hace quien registró
  (`[expenseId]/route.ts`) y anular solo aplica a VALIDADO (`void/`). El anulado no suma y no se borra.
- Soportes: «varios archivos y varios enlaces a la vez». Hoy `SoporteProyecto` guarda archivo **o** enlace por fila
  (`soportes_proyecto_fuente_check`) y un gasto admite 1–5 soportes (`src/lib/proyectos/gastos.ts:119`): verificar si la
  UI (`gasto-form.tsx:130,384`, `adjuntar-soporte.tsx`) permite mezclar; ajustar la UI y el tope si hace falta.
- Plantilla de gastos: rechazar fila sin enlace de soporte, con fila y columna (`gastos-import/parse.ts`,
  `template.ts`).
- **Tests:** «Un gasto anulado aparece en el historial y no suma», «2 archivos y 1 enlace», «fila sin enlace se rechaza».

### T7 — AJ-08: resumen de cambios del periodo (S, Propuesto)

- Solo si D4 lo aprueba. Lee `AuditoriaCambio` del periodo para gastos editados/anulados y lo muestra en la ficha
  financiera para GERENCIA.

### T8 — AJ-10: alerta «Posible retraso» (S)

- **Ya existe la lógica:** `alertaRetraso` (`src/lib/proyectos/semaforo-v2.ts:137`) con el parámetro `retraso` del
  Administrador (tabla `Setting`, `getSemaforoParametrosV2` en `src/lib/settings.ts:84`, UI
  `src/components/admin/umbrales-section.tsx`), y la usan `kpis.ts`, `financial-sheet.ts` y `atencion.ts`.
- **Qué hacer:** comprobar el valor por defecto (la PO propone 60 %), que el texto sea exactamente «Posible retraso»,
  que aparezca **junto al semáforo financiero** en el header de la ficha (`ficha-header.tsx:281,286`) y en el Tablero
  gerencial (`project-dashboard.tsx:240-241`), y que no cambie el color del semáforo.
- **Tests:** los tres casos de «Se acepta si» de S4 en `semaforo-v2.test.ts`, más un test de render en
  `ficha-header.test.tsx` y `project-dashboard.test.tsx`.

### T9 — Parte 2: diseño y estimación (M, sin código)

Entregable: `odd/tasks/po-2026-11-10-parte2-diseno.md` con modelo de datos, migraciones, impacto en importadores y
estimación por rebanada, para que la PO la apruebe por separado. Debe resolver, con evidencia del código:

- Línea presupuestal por actividad + rubro: hoy `LineaPresupuestal` es única por (proyecto, rubro)
  (`prisma/schema.prisma:1162`) y `ProgramacionPeriodo` cuelga de ella (:1185). Cómo pasar a (actividad, rubro) sin
  romper los proyectos con línea base aprobada (snapshots inmutables en `VersionProyecto`, :1316).
- Tipo de actividad Normal/Transversal (`Actividad`, :902, no tiene `tipo`) y el grupo «Gestión del proyecto».
- Tres importadores distintos: plantilla de nueve hojas (`src/lib/proyectos/plantilla/`), estructura PO
  (`estructura-po/`), presupuesto PO (`presupuesto-po/`, sin programación mensual). Cuál se conserva.
- Factura distribuida en varias líneas (S9) frente al `Gasto` actual (uno por rubro).
- Cierre de gastos de actividad (S11) y traslados actividad+rubro (S8, S11, extiende T3).
- Recarga de CedeTextil en producción según D5.

### T10–T15 — Rebanadas de la Parte 2 (orientativas; T9 las fija)

T10 tipo Transversal (S6) · T11 presupuesto por actividad + plantilla (S5) · T12 programación propuesta y pantalla de
ajuste (S7) · T13 reprogramación entre meses (S8) · T14 gasto por actividad y factura distribuida + vistas (S9, S10,
S11) · T15 recarga de CedeTextil en producción con ensayo (S12).

## Log

- **L1 (2026-11-10, pedido del usuario, textual):** «"C:\Users\Adrian\Downloads\Hub-proyectos261110.docx". Crea el plan
  de trabajo de tal manera salir de lo mas urgente y luego continuar con los features, y que el plan esté optimizado
  para fable 5.2 y probarlo mañana o pasado mañana»
- **L2 (2026-11-10):** mapa del código hecho sobre `main` `120c8a9` (explorador de solo lectura) y verificado a mano:
  `curva.ts:135` no pasa `reportes` a `calcularTecnico` (causa de AJ-07); `alertaRetraso` ya existe (AJ-10 es
  cableado); no hay roles por proyecto ni rol «Gerente» (equivale a `GERENCIA`). Limpieza de la base de código cerrada
  el mismo día (sección 0 de `docs/plan-trabajo-restante.md`).
- **L3 (2026-11-10, T1):** commit `84aa280` en `fix/aj-07-curva-lee-reportes`, ruta inline. `calcularCurva` y
  `cargarAtencion` cargan los reportes con `cargarReportesPorActividad` (`src/lib/api/tecnico.ts`), el mismo loader
  que ahora usa `loadTecnicoStatus`. Corrección a la tarjeta: `calcularTecnico` calcula `progreso` **sin** `hasta`
  (solo `avance_al_fin` lo usa), así que el filtro por periodo se hace en `curva.ts`, igual que con los avances.
  RED → GREEN: 10 tests nuevos (los cuatro de la tarjeta, `base=original` y «Requiere atención»); pasan los 16
  archivos que dependen del cambio (183 tests), eslint y knip. `tsc` da 17 errores que ya están en `main`
  (`emailOutbox`: cliente Prisma sin regenerar), ninguno en los archivos tocados. Revisión nativa: riesgo medio,
  `under_budget`, sin revisión. **Pendiente:** verificación manual sobre la base local (no respondía
  `127.0.0.1:54322` y `docker` no está disponible desde WSL), push y PR.
- **L4 (2026-11-10, cierre de sesión):** pedido del usuario, textual: «guarda el progreso ya voy a apagar el pc». La
  suite unit completa (`npx vitest run src scripts`, 413 archivos) **no terminó**: llevaba más de 55 minutos sobre
  `/mnt/c` cuando se apagó el equipo. Queda pendiente correrla entera (o apoyarse en el CI del PR). Los commits de T1
  (`84aa280` y el de este registro) están solo en la rama local `fix/aj-07-curva-lee-reportes`, sin push.
- **L5 (2026-11-11, T1):** el usuario autorizó el push y el PR («dale»). Rama subida y PR #169 abierto; su CI es la
  corrida completa de `unit` y `e2e`. El PR #168 (solo este documento, hasta L4) queda duplicado por #169.
- **L6 (2026-11-11, T1):** CI de #169 en verde sobre `0f22ba1` (`unit` 9m17s, `e2e` 5m23s): es la corrida completa
  que no terminó en local. El usuario autorizó mergear #169 y cerrar #168 sin mergear («si»). De T1 queda pendiente
  solo la verificación manual en la base local (sembrar, registrar un avance en PRY-2026-001 y ver moverse la curva).
- **L7 (2026-11-11, T1 y T8):** #169 mergeado en `main` como `91b467a` y #168 cerrado sin mergear. T8 en
  `feat/aj-10-alerta-posible-retraso`, commit `8270e97`, PR #170, ruta inline. Ya existían la lógica (`alertaRetraso`)
  y la insignia en el Tablero gerencial (con test); faltaba el encabezado de la ficha, que ahora muestra «Posible
  retraso» junto al semáforo financiero sin cambiar su color. Decisión del usuario sobre el valor inicial (parte de
  D4, antes de la respuesta de la PO), a la pregunta «¿Cambio el valor por defecto de 70 % a 60 % en T8, o lo dejo en
  70 hasta que la PO confirme D4?» con la recomendación de cambiarlo: «dale». `retraso` pasa de 70 a 60; un valor ya
  guardado por el Administrador no se toca. RED → GREEN: valor inicial 60 e insignia en el encabezado; los tres casos
  de «Se acepta si» quedan fijados con el valor inicial. Pasan los 18 archivos de test que usan los parámetros por
  defecto, el encabezado o el tablero (313 tests), eslint y knip; `tsc` solo con los 17 errores previos de `main`.
  Guías de uso y de prueba actualizadas. Revisión nativa: riesgo medio, `under_budget`, sin revisión. Ojo:
  `vitest related` arrastra los invariantes de `prisma/` (fallan con la base local apagada; su guard solo deja
  conectar a loopback).
- **L8 (2026-11-11, decisiones D1–D5):** respuestas del usuario, textuales: «D1 mantener la regla actual»; «D2 digo
  que queden anulados pero que no se borren por si la po quiere modificarlos, de ahora en adelante ella solo
  registrará gastos que se hicieron 100%»; «D3 Vamos con tu recomendación»; «D4 los gastos ya no llevan
  confirmacion. del resto aceptados»; «D5 explicamos porque se tiene que crear un nuevo proyecto?». Lectura del
  agente (no textual): en D4, «los gastos ya no llevan confirmacion» descarta el «Propuesto» de pedir confirmación
  cuando un gasto supera el 50 % del asignado del rubro; en D2, los gastos anulados por esta decisión deben seguir
  visibles y poder corregirse (a resolver en T4 y T6). D5 queda abierta. CI de #170 en verde sobre `7ea7f7f`
  (`unit` 5m57s, `e2e` 5m35s); el merge sigue siendo decisión del usuario.
- **L9 (2026-11-11, aclaraciones a D2, D4 y D5):** el usuario, textual: «D4 cuando un gasto supera el 50% tienen que
  ver como hacen con las demas actividades y el restante de ese presupuesto»; «D2 Es correcto» (a la lectura de L8:
  anulados, visibles y corregibles, sin borrar); «D5 tienes que modificar ese proyecto? por que?». Lectura del agente
  (no textual): D4 confirma que no hay aviso de confirmación; el manejo del presupuesto restante es de quien
  registra, con las alertas de sobreejecución y los traslados de S2 y S3. D5 sigue abierta.
- **L10 (2026-11-12, T3):** AJ-09 implementado en `feat/aj-09-traslados-gestor` (base `261e995`, ya con el
  fast-forward de #170), ruta inline, tres rebanadas: `5094aa2` (servidor: `construirTrasladoSimple` en
  `src/lib/proyectos/traslado-simple.ts` arma el `detalle` del TRASLADO repartiendo el valor entre los periodos
  abiertos; gate y comentarios ahora dicen COORDINADOR **o** COLABORADOR miembro), `8924141` (la solicitud pendiente
  entra a «Requiere atención» como `modificacion_pendiente`, con `solicitud_id` en API/OpenAPI/hooks) y `a5845da`
  (botón «Solicitar traslado» en Finanzas con el formulario simple origen/destino/valor/motivo; la fila de atención
  lleva al segmento de solicitudes del Historial). Hallazgos del paso «reproducir»: el gate y el botón ya dejaban
  pedir al COLABORADOR miembro (los cambios de `5094aa2` en el gate son solo comentarios) y el piso contra lo
  ejecutado ya existía en `validarModificacion` (`A_MENOR_QUE_EJECUTADO`, ahora fijado con test); lo que faltaba era
  el formulario simple y la visibilidad de pendientes. Comentario obligatorio al rechazar y ver el estado con
  comentario ya existían (`DECISION_SCHEMA`, cola de `project-modificaciones.tsx`). Checks: 185 tests en los 11
  archivos afectados (los tres «Se acepta si» de S3 + reglas del traslado simple), eslint (solo un warning
  preexistente de `ATENCION_TIPOS`), knip limpio, `tsc` con solo los 17 errores preexistentes de `emailOutbox`.
  Riesgo: ítem 2 en `5094aa2` (amplía quién puede solicitar; aprobar sigue siendo solo ADMINISTRADOR/GERENCIA).
  Pendiente: suite completa y `e2e/proyectos-v2/permisos.spec.ts` vía el CI del PR, verificación manual en la base
  local y push + PR (decisión del usuario).
- **L11 (2026-11-11, T4; L10 es la entrada de T3 en la rama `feat/aj-09-traslados-gestor`, PR #171):** pedido del usuario, textual: «Hola estuve adelantando con deepseek porque se acabó tu
  limite de uso, revisa com ovamos». DeepSeek dejó T4 sin commit (63 archivos) en `fix/aj-08-gasto-sin-aprobacion`;
  la revisión de Fable 5.2 lo completó y lo dejó en el commit `ba5fa1f`, ruta inline. Lo que traía bien: el predicado
  único `cuentaComoEjecutado` / `ESTADOS_EJECUTADOS` (`src/lib/proyectos/gastos.ts`), sin tocar el enum ni crear
  migración, y la retirada de la cola, las rutas `validate`/`reject`, «Por validar» y la sección del reporte semanal.
  Lo que faltaba y se corrigió: (1) `src/lib/api/kpis-portafolio.ts` seguía contando solo `VALIDADO` (uno de los seis
  lectores de la tarjeta; su test de paridad con la ficha fallaba por los $999 del gasto registrado: RED observado,
  luego GREEN, con filas `ANULADO` y `RECHAZADO` que no suman); (2) un gasto `VALIDADO` heredado no entraba en el
  filtro «Registrado» y mostraba la insignia «Validado»: ahora se lee «Registrado» (RED → GREEN en
  `project-gastos.test.tsx`); (3) las guías de uso y de prueba y `docs/proceso-proyectos-desde-cero.md` seguían
  explicando la validación; (4) el mensaje 409 de anular decía «registrado o validado». Checks observados: eslint y
  knip limpios; `tsc` con los 17 errores previos de `main` (`emailOutbox`) más 3 de `.next/types/validator.ts`, que es
  generado y aún nombra las rutas borradas; 26 archivos de test del cambio y sus vecinos en verde (444 tests) tras el
  arreglo. **Sin correr:** `prisma/gastos.invariant.test.ts` y `prisma/modificaciones.invariant.test.ts` (la base
  local `127.0.0.1:54322` rechaza la conexión y `docker` falla desde WSL) y el e2e `ficha-ejecucion.spec.ts` (queda
  para el CI del PR). Regresión conocida, pasada a T5: el aviso de campana a Gerencia por sobregasto ya no se envía.
  Los gastos `RECHAZADO` de producción conservan su etiqueta hasta la tarea de datos de D2. Revisión nativa: riesgo
  alto (ítem 3 nombrado), `review_due`. Los 144 archivos de test relacionados con el cambio pasan (1931 tests,
  `vitest related` sin `prisma/` ni `e2e/`).
  **Verificador independiente sobre `ba5fa1f` (solo lectura):** predicado en todos los lectores, sin restos de las
  rutas borradas y esquema intacto, en regla. Dos bloqueos, corregidos en `fc5cded` con RED → GREEN: (1) editar un
  gasto (`PATCH .../expenses/:expenseId`) comparaba contra un ejecutado que ya incluía al propio gasto, así que una
  edición cualquiera podía marcar «Supera lo asignado»: la ruta ahora lo excluye (`excluirGastoId`); (2) tres textos
  seguían hablando de aprobación: el diálogo de registro («lo valida Gerencia»), la fila de «Requiere atención» («Le
  toca a Gerencia validarlo o rechazarlo» y el botón «Revisar gasto», que ya no existe: la fila lleva a Finanzas) y el
  aviso por rubro («N gastos por validar lo superan», ahora «N gastos lo superan»). Avisos que quedan abiertos, no
  bloquean: la etiqueta «Pendiente por revisión» sobrevive en `gastos-kpis.tsx`, `ficha-resumen.tsx` y
  `src/lib/proyectos/atencion.ts` («Gasto por revisar» en la lista de atención); restos sin uso en producción
  (`canValidateExpense`, `puedeValidar`, `notificarGastoRechazado`, las transiciones VALIDAR/RECHAZAR); comentarios
  viejos; «aparece en el historial» de un gasto anulado no tiene test propio; un gasto `VALIDADO` heredado se lee
  «Registrado» pero no se puede editar ni recibir adjuntos hasta T6.
- **L12 (2026-11-11, T4, commits partidos):** la revisión nativa del rango completo (75 archivos, 4617 líneas), con el
  consentimiento del usuario («Revisar este cambio»), se detuvo en el preflight con `lens_context_budget_exceeded`: no
  entra en el contexto del revisor y no se creó autoridad. A la pregunta «¿Parto los commits para revisarlos por
  tramos, o seguimos sin revisión nativa para T4?», con la recomendación de partirlos, el usuario respondió, textual:
  «si». Los commits `ba5fa1f` y `fc5cded` de L11 se rehicieron como cuatro, con el mismo árbol final (comprobado con
  `git diff` contra el respaldo `backup/aj-08-pre-split`, que se puede borrar cuando el PR esté abierto): `c34c1b6`
  (lógica: predicado, lectores del servidor, rutas modificadas, invariantes y seed; 34 archivos, 808 líneas),
  `240ea66` (se borran las rutas de aprobación y sus rutas OpenAPI; 10 archivos, 1482 líneas, casi todo borrado),
  `780a604` (pantallas, hooks y e2e; 27 archivos, 2144 líneas) y `48e5607` (las tres guías). Los commits intermedios
  no se compilaron uno por uno: el PR se integra aplastado, como los anteriores.
- **L13 (2026-11-11, T4, revisión nativa por tramos):** pedido del usuario, textual: «continuemos». Los tres tramos
  de código quedaron aprobados y con acuse, sin bloqueos ni correcciones: `c34c1b6` (base `261e995`, escalado al
  ítem 3), `240ea66` (lentes riesgo y legibilidad) y `780a604` (lentes legibilidad y fiabilidad); el usuario dio el
  consentimiento de cada uno («Revisar este cambio»). `48e5607` y el commit del plan son pasivos: sin revisión.
  Avisos no bloqueantes, comprobados contra la punta de la rama. **Descartados:** el conteo `vigentes` sí excluye
  `RECHAZADO` (`src/lib/api/gastos.ts:509` filtra por `ESTADOS_EJECUTADOS`); `gastos_por_validar` ya no existe en
  `src/`, así que el fixture del reporte semanal compila; la documentación OpenAPI «sin respaldo» del tramo 2 la
  respalda el tramo 1, que ese revisor no veía. **Quedan como seguimiento:** (1) el caso `CANCELADO` de «anular en
  cualquier estado del proyecto» perdió su test al borrar los de `validate` (`void/route.test.ts` cubre `CERRADO`);
  (2) código sin lector: la prop `onVerGastos` (`project-financiero.tsx:49`, aún cableada en `ficha-finanzas.tsx:63`)
  y `puedeValidar` (`finanzas/gastos-comun.tsx:62`), además de los restos ya anotados en L11; (3) sin `resumen`, el
  renglón de `gastos-kpis.tsx:13` lee «0 gastos» sobre un libro con filas, sin test; (4) el e2e
  `ficha-ejecucion.spec.ts` deja en cada corrida el gasto sobreejecutado de R11 contando como ejecutado en
  PRY-2026-001 (antes se rechazaba), y el test de anular no lee la cifra de «Ejecutado» antes y después; (5) la
  etiqueta «pendiente(s) por revisión» / «Gasto por revisar», ya anotada en L11.
- **L14 (2026-11-11, T3 mergeada y T4 sobre `main`):** a la pregunta «¿Mergeo #171 y sigo con el rebase, push y PR
  de T4?», el usuario respondió, textual: «dale». #171 (T3, AJ-09) mergeado aplastado en `main` como `5934e4e`. T4
  rebasada sobre ese `main`; los commits de L12 cambian de identidad, con el mismo contenido: `c34c1b6` → `deffc44`,
  `240ea66` → `eda8444`, `780a604` → `6fa9361`, `48e5607` → `de9d7c5`. Dos conflictos, ambos de suma: el import de
  `src/lib/api/atencion.ts` (queda `loadGastosEjecutados` de T4 junto al import de `modificaciones` de T3) y este
  documento (fila de T3, L10 antes de L11). Costura T3 + T4 comprobada: pasan los 11 archivos de test de lo que
  ambos cambios tocan y sus vecinos (211 tests: atención, modificaciones, traslado simple, ficha, Finanzas,
  OpenAPI); `tsc` con los mismos 20 errores de L11 (17 de `emailOutbox`, 3 del generado `.next/types/validator.ts`),
  ninguno nuevo. La revisión nativa de L13 se hizo sobre los commits anteriores al rebase y no se repitió. El primer
  intento de rebase se interrumpió a mitad de la escritura del árbol; se abortó y se repitió sin pérdida (los
  archivos sueltos eran copias idénticas de `main`). **Sin correr:** la suite completa, los invariantes de `prisma/`
  y el e2e, que corre el CI del PR.
- **L15 (2026-11-11, T4, CI de #172):** PR #172 abierto. Primera corrida: `e2e` en verde y `unit` en rojo por un
  solo test, `prisma/gastos.invariant.test.ts` («feeds E with every expense that counts as executed»), que es uno
  de los invariantes que no se pudieron correr en local. Causa: `loadGastosEjecutados` no tiene `orderBy` (E suma las
  filas) y el test comparaba las dos filas en un orden fijo; antes de AJ-08 devolvía una sola. Corregido en el test
  (dos filas, en cualquier orden), sin tocar el loader. Los otros 33 archivos de invariantes pasaron.
- **L16 (2026-11-11, T4 mergeada; diseño de T5):** CI de #172 en verde sobre `1467351` (`unit` 7m9s, `e2e` 4m15s).
  A la pregunta «¿Mergeo #172 y arranco T5?», el usuario respondió, textual: «si». #172 mergeado aplastado en `main`
  como `f5c4e4e`. T5 en la rama `feat/aj-08-validadores-alertas`. **Ruta: delegada a un escritor** (razón: respaldo
  de contexto de una sesión larga; una sola unidad, sin paralelismo). Lo que ya existe y se reutiliza: los avisos
  después de guardar `SOBREGASTO` y `DUPLICADO` (`AlertaGasto`, `superaAsignado`, `buscarDuplicados` en
  `src/lib/api/gastos.ts`), el total calculado y el subtotal mayor que cero al enviar (`gasto-form.tsx`).
  Decisiones de diseño del agente (no son textuales del usuario):
  (a) **Sobreejecución en dos niveles, después de guardar y sin bloquear:** aviso nuevo `SOBREGASTO_PROGRAMADO`
  cuando el ejecutado acumulado del rubro hasta el periodo del gasto supera lo programado acumulado hasta ese
  periodo; `SOBREGASTO` pasa a ser la alerta crítica (supera el asignado del rubro) y su mensaje incluye el texto de
  S2 «Solicita un traslado al Gerente». Si aplica la crítica, no se repite la de programado.
  (b) **Duplicados antes de guardar:** consulta de solo lectura con la misma clave de `buscarDuplicados` (número de
  identificación normalizado + número de documento normalizado) y la misma redacción por proyecto; el formulario
  muestra la advertencia en línea en cuanto están la identificación y el número de documento, sin paso de
  confirmación (D4). El aviso después de guardar se conserva. Supuesto: un tercero sin número de identificación no
  se detecta (regla RF-21 vigente).
  (c) **Validadores al digitar:** el error del campo se muestra en línea mientras se escribe (subtotal numérico y
  mayor que 0; IVA numérico, puede ser 0), los valores se muestran con separador de miles y sale una advertencia,
  que no bloquea, si el IVA supera el 19 % del subtotal. Sin la confirmación del 50 % (D4).
  (d) **Campana a Gerencia:** `notificarSobregasto` vuelve a llamarse dentro de la transacción que deja el rubro por
  encima de lo asignado (registro, edición e importación). Valor por defecto del agente, avisado al usuario: es el
  comportamiento que existía antes de T4.
- **Siguiente paso:** cerrar el PR de T5 (rama `feat/aj-08-validadores-alertas`, commits `9214f06` y `fa2dfb3`);
  borrar `backup/aj-08-pre-split` (decisión del usuario); T5 y T6; la tarea de datos de D2 (rechazados a anulados, con ensayo sobre copia de
  producción); los seguimientos de L13; cerrar D5; T0 (probar una invitación real en producción); verificación
  manual de T1, T3 y T8 con la base local arriba.
- **L17 (2026-11-12, T5 hecha):** Implementada en `feat/aj-08-validadores-alertas` en dos unidades de trabajo:
  `9214f06` (servidor) y `fa2dfb3` (formulario). Las dos mitades las escribieron subagentes que quedaron abortados a
  mitad de vuelo; el trabajo se completó y se verificó en el hilo principal. (a)(b)(c)(d) de L16 implementadas tal
  cual, sin desvíos. La alerta crítica es ahora `SOBREGASTO` con el texto exacto «Solicita un traslado al Gerente»;
  el nivel intermedio es `SOBREGASTO_PROGRAMADO` y no se emite cuando aplica la crítica. `notificarSobregasto` vuelve
  a llamarse en registro, edición e importación, solo en el camino crítico y nunca en el preview de la importación.
  El chequeo previo de duplicados es `GET /api/v1/projects/:id/expenses/duplicates`, detrás del mismo gate de lectura
  y con la misma clave (identificación + número de documento normalizados) y la misma redacción que
  `buscarDuplicados`. En el formulario los montos se agrupan con `formatMontoInput` sin reinterpretar lo escrito:
  «1.50» sigue siendo inválido y nunca se convierte en 150. Se reparó el doble de `import/route.rules.test.ts`, que
  no mockeaba `programacionPeriodo`, `usuario` ni `notificacion`. **Verificación:** 350 tests verdes en 18 archivos
  (gastos, gastos-import, rutas de gastos, gasto-form, a11y-guards, project-gastos), `tsc --noEmit` limpio y `eslint`
  con 0 errores. La verificación independiente se lanzó dos veces y las dos quedó abortada por interrupciones de la
  sesión: riesgo declarado, no verificación hecha. **Pendiente:** verificación manual en local (registrar un gasto que
  pase el asignado y ver la crítica con la campana; dos facturas iguales del mismo tercero y ver la advertencia en
  línea antes de guardar). **Entrega:** un solo PR con los dos commits; aunque la rebanada pasa las ~400 líneas, el
  formulario consume el endpoint que agrega el servidor y separarlos dejaría la primera mitad sin interfaz. **Fuera de T5, anotado y sin tocar:** la consulta de duplicados dispara un GET por tecla,
  sin debounce.
- **L18 (2026-11-12, review nativo de T5 aprobado):** linaje `review-9885040ff3fcbb66`, tier *medium*, 4 lentes (risk,
  resilience, readability, reliability), sobre los 19 archivos de la rama. Resultado: **aprobado**, 9 hallazgos, todos
  informativos y **no bloqueantes** (ninguno abrió corrección). El primer intento de revisión murió por `ETIMEDOUT` del
  proveedor (`deepseek-v4.1-flash` vía `opencode-go`) sin consumir corridas; STATUS reofreció los mismos slots y se
  relanzó. **Seguimientos anotados, no hechos** (detalle en el recibo del linaje):
  - `R1-001` (risk, WARNING) `expenses/duplicates/route.ts:50-59`.
  - `R2-001`, `R2-002`, `R2-003` (readability, SUGGESTION) en `import/route.test.ts:416`, `lib/api/gastos.ts:353` y
    `duplicates/route.ts:54-56`.
  - `R3-1` (reliability, WARNING) `gasto-form.tsx:161`; `R3-2` (reliability, WARNING) `import/route.ts:106-110`.
  - `R4-DUPLICATE-DEBOUNCE` (resilience, WARNING) `hooks/projects.ts:1750-1764`: la consulta de duplicados dispara un
    GET por tecla, sin debounce. Es el mismo detalle que ya estaba anotado en L17.
  - `R4-IMPORT-APPLY-NPLUS1` y `R4-IMPORT-PREVIEW-NPLUS1` (resilience, WARNING) `gastos-import/server.ts:162-163` y
    `import/route.ts:105-111`: el cálculo de nivel por fila agrega una consulta por gasto importado.
  **Entrega:** PR #173 (`feat/aj-08-validadores-alertas`). Sigue pendiente la verificación manual en local.
- **L19 (2026-11-12, T6 hecha):** Rama `feat/t6-aj08-correccion-y-plantilla` (sale de `2f2cb53`, con `main` mergeado
  encima cuando entró el arreglo N+1). Commits: `843842b` (plantilla), `8b11b05` (Gestor corrige), `c7e46da` (contrato y
  sondas), `f47680b` (soportes múltiples), `83e9e94` (acción Corregir en la lista). **La tarjeta estaba desactualizada
  en dos puntos:** anular con motivo y auditoría ya existía (usa `ESTADOS_EJECUTADOS`, así que abarca `REGISTRADO`), y el
  constraint `num_nonnulls(storage_path, url_externa) = 1` no pedía migración: permite un medio por fila, así que «varios
  archivos y varios enlaces» es una lista. **El agujero real era otro:** el PATCH exigía `registrado_por_id === actor`, y
  nada en `src/` lo llamaba; ahora pasa por `gateGastoGestion` (ADMINISTRADOR/GERENCIA) exigiendo `motivo`, auditado como
  `motivo_correccion`, y hay acción «Corregir» en la lista. Decisión del usuario: el motivo se exige **sólo cuando el
  Gestor corrige el gasto de otro**; el autor edita el suyo sin motivo, y si escribe uno igual se audita. Plantilla: toda
  fila sin «Enlace del soporte» se rechaza con fila y columna; consecuencia declarada, **un Excel exportado antes de que
  existiera la columna se rechaza entero** y hay que descargar la plantilla nueva (la guía decía «opcional» y prometía un
  gasto «Sin soporte»; las dos frases se corrigieron). **Verificación:** 230 tests en importador y rutas de gastos, 103 en
  formulario, lista y accesibilidad; `eslint` 0 errores; `tsc` sin errores en lo tocado. **Verificador independiente**
  (escalado por permisos, ítem 2): encontró el código correcto y dos textos mintiendo —la cabecera del PATCH y la
  descripción publicada en OpenAPI, que decía «403 para cualquiera más, incluidos los administradores»—; corregidos en
  `c7e46da`. **Seguimientos abiertos:** un Gerente puede des-rechazar el gasto `RECHAZADO` de otro al editarlo (sólo filas
  heredadas de AJ-08, T4 las quiere `ANULADO`); `T7` tendrá que leer dos formas de motivo (`motivo_correccion` y el
  `valor_nuevo.motivo` de la anulación); y `main` sigue sin typechequear por el modelo `emailOutbox` ausente en
  `prisma/schema.prisma` (20 errores ajenos a este trabajo) más 3 de `.next/types/validator.ts` por rutas eliminadas.
  **Entrega:** un solo PR; la rebanada es de 1167 líneas en 6 commits, grande para revisar, y se declara así.
