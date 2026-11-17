# e2e: aceptación en pantalla del documento del PO del 2026-11-10

Objetivo: comprobar con Playwright, en la aplicación corriendo, cada criterio de «Se acepta si» de
`Hub-proyectos261110` (AJ-07..AJ-10, EV-01..EV-07), para que el informe de avance no tenga salvedades.
Rama `test/e2e-aceptacion-po-261110` · entrega `ask-on-risk` · runner: Playwright (`playwright.ci.config.ts`) contra
el Supabase local `muttu-hub` con variables de `supabase status` (worktree sin `.env`).

## Specs

Cada S# es un criterio del PO, citado textualmente. EV-08 queda fuera: es una carga sobre datos de producción.

- S1 AJ-07: «Una actividad que pesa 4 de 30 semanas reporta 50 % en noviembre: el ejecutado técnico de noviembre sube 4 × 0,50 / 30 = 6,7 puntos.»
- S2 AJ-07: «La tarjeta, la curva y la tabla muestran el mismo valor para el mismo periodo.»
- S3 AJ-07: «Un reporte del 28 de octubre se refleja en octubre; uno del 3 de noviembre, solo desde noviembre.»
- S4 AJ-08: «Al registrar un gasto, el ejecutado del rubro sube de inmediato, sin otro paso.»
- S5 AJ-08: «Los $938.000 de Promoción y divulgación aparecen como ejecutado.»
- S6 AJ-08: «Un gasto que deja el rubro por encima de su asignado se guarda y muestra la alerta crítica.»
- S7 AJ-08: «Registrar dos veces la misma factura del mismo tercero muestra la advertencia antes de guardar.»
- S8 AJ-08: «Un gasto anulado aparece en el historial y no suma.»
- S9 AJ-08: «Un gasto se guarda con 2 archivos y 1 enlace, y muestra los 3.»
- S10 AJ-08: «Una fila de la plantilla sin enlace se rechaza.»
- S11 AJ-09: «Un usuario Gestor crea una solicitud de traslado.»
- S12 AJ-09: «La solicitud no cambia el presupuesto hasta que el Gerente la aprueba.»
- S13 AJ-09: «No se puede trasladar un valor que deje el rubro de origen por debajo de lo ya ejecutado.»
- S14 AJ-10: «Técnico en rojo y ejecutado del 1 % de lo programado: aparece la alerta.»
- S15 AJ-10: «Técnico en verde y ejecutado del 40 % de lo programado: no aparece la alerta.»
- S16 AJ-10: «Técnico en rojo y ejecutado del 80 % de lo programado: no aparece la alerta.»
- S17 EV-01: «Una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas, y esos valores suman en sus rubros.»
- S18 EV-01: «Una plantilla con la misma actividad y rubro en dos filas se rechaza con fila y columna.»
- S19 EV-02: «Un proyecto con una actividad transversal de 17 semanas tiene el mismo avance técnico que sin ella.»
- S20 EV-02: «La actividad transversal aparece en el grupo “Gestión del proyecto” y se puede elegir al registrar gastos.»
- S21 EV-03: «Al importar la plantilla, todas las líneas tienen una programación propuesta que suma su valor.»
- S22 EV-03: «Al editar un mes, el total por rubro y por mes de arriba se actualiza.»
- S23 EV-03: «No se puede confirmar si alguna línea tiene un valor pendiente por programar.»
- S24 EV-04: «El Gestor pasa $2.000.000 de Transporte de noviembre a diciembre en una actividad, sin aprobación, y el total de la línea no cambia.»
- S25 EV-04: «Un cambio que altere el total de la línea no se permite sin traslado aprobado.»
- S26 EV-04: «En noviembre no se puede mover valor desde octubre.»
- S27 EV-05: «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.»
- S28 EV-05: «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3, y se puede consultar como un solo documento.»
- S29 EV-05: «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»
- S30 EV-06: «El ejecutado total es igual en las dos vistas.»
- S31 EV-06: «Un gasto registrado en la actividad 1.2 sube el ejecutado de esa actividad y el de su rubro.»
- S32 EV-07: «Una actividad abierta con asignado $10.000.000 y ejecutado $7.000.000 muestra saldo $3.000.000.»
- S33 EV-07: «Un ahorro de $3.000.000 trasladado y aprobado reduce el disponible de la actividad de origen y aumenta el de la actividad y rubro de destino; el total del proyecto no cambia.»
- S34 EV-07: «Al cerrarla con nota, muestra ahorro $3.000.000 y la nota.»
- S35 EV-07: «No se puede cerrar sin nota; no se pueden registrar gastos en una actividad cerrada.»

### «Debe quedar» (L7: el usuario pidió verificarlos también en pantalla)

- S36 AJ-07: «El cálculo se aplica igual en la tarjeta del periodo, la curva S técnica, la tabla por periodo y el semáforo técnico.»
- S37 AJ-08: «Sin aprobación: se eliminan los estados Validado, Rechazado y Pendiente por revisión, y la columna “Por validar”.»
- S38 AJ-08: «Validadores al digitar: valores numéricos, mayores que 0, mostrados con separador de miles; el total lo calcula el sistema; advertencia si el IVA supera el 19 % del subtotal.»
- S39 AJ-08: «advertencia si el ejecutado acumulado del rubro supera lo programado hasta ese periodo»
- S40 AJ-08: «Corrección: el Gestor del proyecto puede editar o anular un gasto, con motivo obligatorio y registro en auditoría. El gasto anulado no suma al ejecutado, pero no se borra.»
- S41 AJ-08: «Propuesto: en la ficha financiera, un resumen de cambios del periodo (gastos editados y anulados) con acceso al detalle y los motivos»
- S42 AJ-09: «El Gerente aprueba o rechaza. Al aprobar se genera una nueva versión del presupuesto; si rechaza, el comentario es obligatorio.»
- S43 AJ-09: «El Gestor ve el estado de sus solicitudes (pendiente, aprobada, rechazada) con el comentario.»
- S44 AJ-09: «El Gerente ve las solicitudes pendientes de forma visible, por ejemplo como alerta en la ficha del proyecto.»
- S45 AJ-10: «El porcentaje es un parámetro del Administrador. Propuesto: valor inicial de 60 %.» · «La alerta no cambia el color del semáforo financiero; lo complementa.»
- S46 EV-01: «El asignado por rubro y el valor total del proyecto se calculan sumando las líneas; no se digitan.»
- S47 EV-01: «Plantilla del proyecto, hoja Presupuesto: columnas Código de actividad, Rubro y Valor» · «Se elimina de la plantilla la hoja de Programación mensual» · «Validaciones: la actividad existe, el rubro está activo …»
- S48 EV-02: «Una actividad transversal no requiere entregables y no entra en el avance técnico, la curva S técnica ni el cumplimiento del cronograma.»
- S49 EV-03: «En las transversales la propuesta sale pareja por mes» · «una pantalla agrupada por actividad (grupos que se pliegan y despliegan)» · «Después el Gerente aprueba la línea base, como hoy.»
- S50 EV-04: «Cada movimiento queda en auditoría (línea, mes de origen, mes de destino, valor, usuario, fecha).»
- S51 EV-05: «En Rubro solo aparecen los rubros presupuestados en la actividad elegida.» · «el IVA de cada línea se calcula en proporción a su subtotal y se puede corregir» · «El control de duplicados y la anulación se aplican a la factura completa.» · «Plantilla de gastos: columna Código de actividad. Varias filas con el mismo tercero y el mismo número de documento se leen como una sola factura distribuida»
- S52 EV-06: «Por actividad: agrupada por objetivo y por “Gestión del proyecto”. … Al abrir una actividad se ve el detalle por rubro.» · «Por rubro: la vista actual (curva S, tabla por periodo, semáforo).»
- S53 EV-07: «Con los gastos cerrados, la actividad muestra ahorro (si sobró) o sobreejecución (si se gastó de más), con su nota.» · «Propuesto: el Gestor puede reabrirla con motivo, y queda en auditoría.»

## Tasks

| ID | S# | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | — | inline | hecho | stack local + worktree sin `.env`, migración EV-07 aplicada en local |
| T2 | S1–S35 | inline | hecho | spec `e2e/proyectos-v2/aceptacion-po-261110.spec.ts`: 26/26 en verde (b04a476) |
| T3 | — | inline | hecho | informe Word regenerado; checklist apunta al spec |
| F1 | S17, S18, S21 | inline | hecho (RED→GREEN) | V-03 exigía «Valor total» > 0 en la hoja 2. Proyecto nuevo = 0, así que no importaba (EV-01: «no se digitan») |
| F2 | S30, S31 | inline | hecho (RED→GREEN) | la vista «Por rubro» pintaba una fila por línea; EV-06: «la suma de ese rubro en todas las actividades» |
| F3 | S28 | inline | hecho (RED→GREEN) | la factura distribuida no dejaba consultar sus líneas; ahora lista actividad · rubro · valor |
| T4 | S36–S53 | inline | hecho (44/44 e2e) | pruebas de «Debe quedar» en el mismo spec |
| G1 | S40 | inline | hecho 72ab269 + 303f7ec | AJ-08 + D3: el Gestor (miembro COORDINADOR/COLABORADOR) anula y corrige gastos ajenos; hoy solo ADM/GER. Risk: item 2 |
| G2 | S51 | inline | hecho 86028a3 + 1905ec7 | EV-05 + D4: IVA de cada línea proporcional a su subtotal y corregible. Risk: item 1 si necesita migración |
| G3 | S48 | inline | hecho cfbcd7f | EV-02 + D4: transversal sin semanas toma las fechas del proyecto |
| G4 | S50 | inline | hecho 0137568 | EV-04: la auditoría del movimiento muestra la línea |
| F5 | S48 | inline | hecho (RED→GREEN), a403997 | V-08 y la precondición de línea base exigían entregables a las transversales |
| F4 | S11, S13, S33 | inline | hecho (RED→GREEN) | REQ-GAS-06 revisaba A ≥ E en TODAS las líneas: una sobreejecutada (AJ-08) bloqueaba cualquier traslado del proyecto |

## Log

- L1 (2026-11-17, usuario): «crea un informe de todo lo que hemos adelantado de "C:\Users\Adrian\Downloads\Hub-proyectos261110.docx" y como se probaron cada uno de los features y como se cumple cada criterio de aceptación. Usa el mismo formato del documento»
- L2 (2026-11-17, usuario): «no puedo enviar el informe con peros, si hay algo que no has probado hazlo con playwright»
- L3 (2026-11-17, usuario): autoriza aplicar la migración pendiente y volver a sembrar la demo en el Supabase local `muttu-hub`.
- L4: se aplicó `20261116120000_t14_cierre_gastos_actividad` en local. El servidor corre desde un worktree sin `.env`
  con las variables de `supabase status`, igual que el job `e2e` del CI, para que nada pueda apuntar a producción.
- L5: el e2e encontró tres defectos que las pruebas unitarias no veían, porque cada una fijaba el comportamiento
  incompleto. (F1) La plantilla de un proyecto nuevo trae «Valor total» = 0 y V-03 la rechazaba, aunque la
  importación ya tomaba como total la suma del presupuesto (W-02). (F2) La vista por rubro con base vigente
  repetía el rubro una vez por actividad: `financial-sheet.ts` le pasaba `porLinea` tal cual. (F3) La fila de la
  factura distribuida decía «Distribuida en 2 líneas» sin decir cuáles. Los tres se corrigieron con TDD.
- L6 (2026-11-17): evidencia final. e2e de aceptación 26/26. Resto del e2e del CI: 55/57; las 2 que fallan
  son del entorno local (invitation-flow pasa con las variables de Supabase exportadas; oportunidad-ciclo busca
  una tarea sembrada que una corrida anterior ya vinculó). Vitest por áreas (la suite de una vez se cuelga en
  WSL): src/lib 1239, scripts 134, src/hooks 145, src/app + src/components 3667, prisma 283; 0 fallos.
  Commits: 6d171ee (F1), 2ee1949 (F2), 92d8727 (F3), fb1f184 (F4), b04a476 (spec).
- L7 (2026-11-17, usuario): «dale si» — verificar con Playwright también los puntos de «Debe quedar».
- L8 (2026-11-17, usuario): ante los 4 huecos (G1–G4), eligió «Construir los 4 (Recomendado)».
- L9 (2026-11-17): e2e 44/44 (S1–S53). Revisión independiente de G1/G2: un bloqueante (Cambios del periodo visible a miembros, 403) corregido en 303f7ec; migración e IVA por línea OK.
