# Checklist de aceptación — observaciones del PO del 2026-11-10

Fuente: `docs/Hub-proyectos261110.docx` («Ajustes y evolución del módulo Proyectos — Observaciones de las
pruebas del 10 de noviembre de 2026 · v1.0»). Los criterios están transcriptos textualmente en
`odd/tasks/po-2026-11-10-proyectos.md` (`## Specs`, S1–S12), que es la copia de trabajo de este documento.

Cómo se usa: cada criterio del PO tiene su renglón. La columna **test automático** dice qué archivo hay que
correr; la columna **a mano** dice qué hacer cuando el criterio habla de una pantalla y ningún test la mira.
Un criterio con `Estado: cubierto` significa que alguien corrió ese comando y lo vio verde **en esta sesión**;
`por confirmar` significa que el archivo existe pero nadie lo corrió contra este criterio todavía.

> El entorno local tiene un problema conocido: una corrida de la suite completa puede quedarse colgada sin
> escribir salida (pasó tres veces el 2026-11-12, siempre tras suspender la máquina). Conviene correr por área,
> como indica cada renglón, y dejar la suite completa al CI del PR.

---

## Parte 1 — Ajustes (implementados)

### AJ-07 · El avance técnico ejecutado debe usar los avances reportados (`S1`, PR #169)

| # | Criterio del PO (textual) | Test automático | A mano | Estado |
|---|---|---|---|---|
| 1 | «Una actividad que pesa 4 de 30 semanas reporta 50 % en noviembre: el ejecutado técnico de noviembre sube 4 × 0,50 / 30 = 6,7 puntos.» | `npx vitest run src/lib/proyectos/curva.test.ts` | — | por confirmar |
| 2 | «La tarjeta, la curva y la tabla muestran el mismo valor para el mismo periodo.» | `npx vitest run src/lib/proyectos/curva.test.ts src/lib/proyectos/atencion.test.ts src/components/proyectos/curve-s-chart.test.tsx` | Ficha → tarjeta «Periodo del reporte», curva S técnica y tabla por periodo del mismo mes: los tres números deben coincidir. | por confirmar |
| 3 | «Un reporte del 28 de octubre se refleja en octubre; uno del 3 de noviembre, solo desde noviembre.» | `npx vitest run src/lib/proyectos/curva.test.ts` | Reportar un avance con fecha 28/10 y otro con fecha 03/11, y comparar octubre y noviembre. | por confirmar |
| 4 | «Las actividades de tipo Transversal no entran en este cálculo (EV-02).» | `npx vitest run src/lib/proyectos/curva.test.ts` | — | no aplica todavía: EV-02 (actividad Transversal) es Parte 2, aún sin construir (`T9`). |

### AJ-08 · Gastos sin aprobación, con validadores y alertas (`S2`, PR #172, #173, #175)

| # | Criterio del PO (textual) | Test automático | A mano | Estado |
|---|---|---|---|---|
| 1 | «Al registrar un gasto, el ejecutado del rubro sube de inmediato, sin otro paso.» | `npx vitest run "src/app/api/v1/projects/[id]/expenses"` | Registrar un gasto y mirar el ejecutado del rubro sin recargar: sube solo. | cubierto (T4, PR #172) |
| 2 | «Los $938.000 de Promoción y divulgación aparecen como ejecutado.» | `npx vitest run "src/app/api/v1/projects/[id]/expenses"` | Con la base local, abrir el proyecto de la prueba y ver ese rubro: no debe quedar nada «por validar». | por confirmar (depende de datos) |
| 3 | «Un gasto que deja el rubro por encima de su asignado se guarda y muestra la alerta crítica.» | `npx vitest run "src/app/api/v1/projects/[id]/expenses"` | Registrar un gasto grande: se guarda igual, aparece «Solicita un traslado al Gerente» y suena la campana en Gerencia. | cubierto (T5, PR #173) |
| 4 | «Registrar dos veces la misma factura del mismo tercero muestra la advertencia antes de guardar.» | `npx vitest run src/components/proyectos/gasto-form.test.tsx` | Cargar la misma identificación y número de documento de un gasto existente: la advertencia aparece en línea antes de guardar. | cubierto (T5, PR #173) |
| 5 | «Un gasto anulado aparece en el historial y no suma.» | `npx vitest run "src/app/api/v1/projects/[id]/expenses/[expenseId]/void"` | Anular un gasto con motivo: sigue en la lista como anulado y el ejecutado baja. | cubierto |
| 6 | «Un gasto se guarda con 2 archivos y 1 enlace, y muestra los 3.» | `npx vitest run src/components/proyectos/gasto-form.test.tsx` | Adjuntar 2 archivos y 1 enlace en el formulario; al guardar se ven los 3. | cubierto (T6, PR #175) |
| 7 | «Una fila de la plantilla sin enlace se rechaza.» | `npx vitest run src/lib/proyectos/gastos-import "src/app/api/v1/projects/[id]/expenses/import"` | Importar un Excel con una fila sin «Enlace del soporte»: se rechaza indicando fila y columna. | cubierto (T6, PR #175) |
| — | (corrección del Gestor) «el Gestor del proyecto puede editar o anular un gasto, con motivo obligatorio y registro en auditoría» | `npx vitest run "src/app/api/v1/projects/[id]/expenses/[expenseId]" src/components/proyectos/project-gastos.test.tsx` | Como Gerencia, corregir el gasto de otra persona: pide motivo; sin motivo no guarda. Corregir el propio no lo pide. | cubierto (T6, PR #175) |

### AJ-09 · El Gestor puede solicitar traslados entre rubros (`S3`, PR #171)

| # | Criterio del PO (textual) | Test automático | A mano | Estado |
|---|---|---|---|---|
| 1 | «Un usuario Gestor crea una solicitud de traslado.» | `npx vitest run src/components/proyectos/traslado-form.test.tsx src/lib/proyectos/traslado-simple.test.ts` | Como Gestor, pedir un traslado entre dos rubros y verlo en la lista de pendientes. | por confirmar |
| 2 | «La solicitud no cambia el presupuesto hasta que el Gerente la aprueba.» | `npx vitest run src/lib/proyectos/traslado-simple.test.ts "src/app/api/v1/projects"` | Crear la solicitud y mirar el asignado de ambos rubros: no se mueve hasta aprobar. | por confirmar |
| 3 | «No se puede trasladar un valor que deje el rubro de origen por debajo de lo ya ejecutado.» | `npx vitest run src/lib/proyectos/traslado-simple.test.ts` | Pedir un traslado mayor que (asignado − ejecutado) del rubro de origen: se rechaza. | por confirmar |

### AJ-10 · Alerta de posible retraso (`S4`, PR #170)

| # | Criterio del PO (textual) | Test automático | A mano | Estado |
|---|---|---|---|---|
| 1 | «Técnico en rojo y ejecutado del 80 % de lo programado: no aparece la alerta.» | `npx vitest run src/lib/proyectos/atencion.test.ts` | Un proyecto con técnico en rojo y 80 % de lo programado no debe mostrar «Posible retraso». | por confirmar |
| 2 | (complemento de la misma regla) «Posible retraso» visible en la ficha y en el Tablero gerencial con el umbral desde 60 % | `npx vitest run src/lib/proyectos/atencion.test.ts src/components/proyectos` | Con ejecutado ≥ 60 % de lo programado y técnico en rojo, la alerta aparece en la ficha y en el Tablero. | por confirmar |

---

## Parte 2 — Nuevo alcance (EV-01 a EV-08): **no verificable todavía**

Nada de la Parte 2 está construido: la tarea `T9` del plan (`diseño y estimación de la Parte 2`) sigue
pendiente, y sin modelo de datos no hay criterio que comprobar. Los criterios quedan transcritos en
`odd/tasks/po-2026-11-10-proyectos.md` (`S5`–`S12`) para no perderlos.

Cuando `T9` cierre y las rebanadas `T10`–`T15` estén hechas, esta sección se llena igual que las de arriba: un
renglón por criterio, el comando que lo prueba y el paso manual cuando haya pantalla.

| ID | Alcance | Estado |
|---|---|---|
| EV-01 | Presupuesto por actividad y rubro | sin construir (`T9`) |
| EV-02 | Actividad de tipo Transversal | sin construir (`T9`) |
| EV-03 | Programación mensual propuesta por el sistema | sin construir (`T9`) |
| EV-04 | Reprogramación entre meses por el Gestor | sin construir (`T9`) |
| EV-05 | Registro de gasto por objetivo, actividad y rubro, con facturas distribuidas | sin construir (`T9`) |
| EV-06 | Vistas financieras por actividad y por rubro | sin construir (`T9`) |
| EV-07 | Cierre de gastos de la actividad: saldo, ahorro o sobreejecución | sin construir (`T9`) |
| EV-08 | Nueva carga de CedeTextil | sin construir (`T9`) |

---

## Pendientes que afectan esta checklist

1. **Falta la verificación manual en local** de AJ-07, AJ-09 y AJ-10: sus tests existen pero en esta sesión
   nadie los corrió contra los criterios del PO, por eso quedan «por confirmar». Es el trabajo más rápido de
   cerrar: cada renglón es un comando.
2. **AJ-08 criterio 2** depende de datos reales («los $938.000 de Promoción y divulgación»): sólo se puede
   comprobar con la base local cargada con ese proyecto.
3. **La rama `feat/t6-aj08-correccion-y-plantilla` tiene commits sin pushear** (el arreglo de
   concurrencia y de gastos anulados) porque la red bloquea la verificación TLS. Hasta que se pushee, el PR
   #175 no incluye ese arreglo.
