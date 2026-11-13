# Parte 2 — diseño y estimación (`T9`)

Estado: **propuesta para revisar con la PO**. No hay código en esta tarea. Fuente de los requisitos:
`docs/Hub-proyectos261110.docx`, transcriptos en `odd/tasks/po-2026-11-10-proyectos.md` (`S5`–`S12`).

La Parte 2 cambia la unidad del presupuesto: deja de llevarse **por rubro** y pasa a llevarse **por actividad y
rubro**, manteniendo además el resumen por rubro para gerencia (textual de la PO en `S5`). Esto no es una capa nueva
encima: mueve la clave con la que se identifica el dinero en todo el sistema.

---

## 1. Lo que hay hoy (medido, no supuesto)

| Pieza | Dónde | Consecuencia para la Parte 2 |
|---|---|---|
| `LineaPresupuestal` = una línea por **rubro** del proyecto | `prisma/schema.prisma:1162-1179`, `@@unique([proyecto_id, rubro_id])` en `:1175` | Es el constraint que hay que cambiar: hoy prohíbe dos líneas del mismo rubro |
| El monto asignado vive en `linea.monto_proyectado_cop` | `schema.prisma:1166` | A (asignado) sigue siendo por línea; lo que cambia es qué representa la línea |
| `ProgramacionPeriodo` cuelga de la línea | `schema.prisma:1185-1200` | La programación mensual ya es por línea, así que hereda la granularidad nueva sin cambios de forma |
| `Gasto` apunta a la línea, no a la actividad | `schema.prisma:1233,1263` | E no tiene dimensión de actividad: es el hueco que `EV-05` viene a llenar |
| `Actividad` no tiene ninguna relación con el presupuesto | `schema.prisma:902-932` | No hay vínculo previo que reutilizar: hay que crearlo |
| **El código de rubro es la clave de negocio** de las versiones | `src/lib/proyectos/versiones.ts:11-12` (`SnapshotV1.presupuesto[{rubro_codigo}]`), `:56-61` (`codigoRubro()` tira si es null), `:177-182` (diff por código) | Las versiones guardadas son JSON **inmutable**: hay que leerlas tal cual y escribir las nuevas con más datos |
| El `detalle` de una solicitud direcciona por **código de rubro** | `src/lib/proyectos/modificaciones.ts:19-20,97-98,104,109` | Igual: las solicitudes ya guardadas usan `R12`; las nuevas necesitan poder decir `1.1\|R12` |
| Nueve sitios colapsan dinero por rubro | `presupuesto.ts:186`, `budget/route.ts:109`, `programming/route.ts:126`, `presupuesto-po/server.ts:65`, `plantilla-import.ts:583`, `modificaciones.ts:191,264,318`, `ficha-financiera.ts:162`, `financial-sheet.ts:77`, `gastos.ts:242` | Con dos líneas del mismo rubro **pierden plata en silencio**: cada uno necesita clave nueva |
| Las superficies Excel son una columna por rubro | `plantilla/columns.ts:87`, `validate.ts:229-230,1006-1025`, `mapear.ts:174-182`, `export-xlsx.ts:214-233` | La plantilla y el export cambian de forma; es lo que más arrastra |
| Los totales del proyecto se comparan con Σ A | `proyectos.valor_total`, `presupuesto.ts:204`, `ficha-financiera.ts:146-152` | Sigue valiendo: Σ A no cambia aunque A tenga más renglones |

## 2. Decisión de fondo: cómo entra la actividad sin romper el histórico

**No se migra el pasado.** Las versiones aprobadas son un registro de auditoría inmutable y las solicitudes viejas
direccionan por código de rubro. La propuesta es **aditiva y compatible en las dos direcciones**:

1. **La línea pasa a identificar un par (actividad, rubro).** Se agrega `actividad_id` (nullable) a
   `lineas_presupuestales` y la unicidad pasa a `[proyecto_id, actividad_id, rubro_id]`, más un índice parcial que
   conserva `[proyecto_id, rubro_id]` donde `actividad_id IS NULL`. Así el proyecto de CedeTextil y todo lo ya cargado
   siguen exactamente como están, y un proyecto nuevo puede tener `R12` varias veces, una por actividad.
2. **Cada línea gana un `codigo_linea` de negocio**, que es `R12` para las líneas heredadas y `1.1|R12` para las
   nuevas. Es el reemplazo directo de `rubro_codigo` en versiones, `detalle`, diffs y exportaciones, y **sirve para
   leer lo viejo y escribir lo nuevo**: un lector que acepte ambas formas entiende las dos generaciones.
3. **La regla que se repite en todo el código nuevo**: *leer las dos formas, escribir la nueva*. Es la misma que dejó
   `T7` con los motivos de corrección y anulación, y evita el error clásico de romper el histórico al evolucionar la clave.

Lo que **sí** cambia de comportamiento, y hay que decirlo: en un proyecto con presupuesto por actividad, un gasto sin
actividad deja de ser representable. Por eso `EV-05` hace la actividad obligatoria para gastos nuevos, y la importación
necesita una columna de actividad con rechazo de fila, igual que hoy hace con el enlace de soporte.

## 3. Modelo propuesto (migraciones)

| # | Cambio | Migración | Riesgo |
|---|---|---|---|
| M1 | `lineas_presupuestales.actividad_id` (nullable, FK compuesta `[actividad_id, proyecto_id]`), `codigo_linea String` con backfill `= rubro.codigo`, unicidad nueva + índice parcial heredado | una | 1 (datos) |
| M2 | `gastos.actividad_id` (nullable), backfill desde la línea; queda obligatorio para proyectos nuevos por regla de aplicación, no por constraint | una | 1 |
| M3 | `versiones_proyecto` / `SnapshotV1`: `actividad_codigo` opcional en `presupuesto[]` y `programacion[]`; `codigo_linea` en los nuevos. Sin tocar filas existentes | ninguna (JSON) | — |
| M4 | `solicitudes_modificacion.detalle`: `clave` acepta `CODIGO_ACTIVIDAD\|RUBRO` además de `RUBRO`; validador de clave con las dos formas | ninguna (JSON) | — |
| M5 | Plantilla y export: columna «Actividad» obligatoria en la hoja de presupuesto y en la de gastos; el export suma el pivote por actividad | ninguna | 3 (contrato de archivo) |

## 4. Rebanadas y estimación

Cada rebanada es un PR revisable; el orden es el que menos retrabajo genera.

| Rebanada | Contenido | Tamaño |
|---|---|---|
| `T10` — modelo y claves | M1, M2, M3, M4 + backfill + las nueve claves nuevas + tests de que lo viejo se sigue leyendo | **L** |
| `T11` — presupuesto por actividad (`EV-01`) | Pantalla y APIs de presupuesto por actividad×rubro, resumen por rubro conservado, validaciones de suma | **M–L** |
| `T12` — actividad Transversal (`EV-02`) | Tipo de actividad, exclusión del cálculo técnico (`AJ-07` lo anticipa), efecto en programación | **M** |
| `T13` — programación propuesta y reprogramación (`EV-03`, `EV-04`) | Reparto mensual sugerido por el sistema y reprogramación entre meses por el Gestor, sobre las reglas de traslado que ya existen | **L** |
| `T14` — gasto por objetivo/actividad/rubro y vistas financieras (`EV-05`, `EV-06`) | Columna de actividad en registro e importación, facturas distribuidas, pivotes por actividad y por rubro | **L** |
| `T15` — cierre de actividad y recarga de CedeTextil (`EV-07`, `EV-08`) | Saldo/ahorro/sobreejecución por actividad, y la recarga sobre proyecto nuevo | **M** (bloqueada por `D5`) |

**Total: cinco rebanadas, dos de ellas grandes.** Estimación honesta: `T10` es la que decide si el resto sale limpio;
si `T10` se hace mal, `T11`–`T15` la pagan cinco veces.

## 5. `D5` — por qué la recarga de CedeTextil pide un proyecto nuevo

La pregunta era: si CedeTextil tiene línea base aprobada y versiones inmutables por trigger, ¿se crea un proyecto
nuevo o se recarga encima?

**Proyecto nuevo, y el actual se archiva.** Razón: las versiones aprobadas no guardan una copia del presupuesto, guardan
referencias a la estructura viva (objetivos, actividades, líneas, celdas). Recargar encima obliga a una de dos cosas:
reemplazar lo que la versión aprobada referencia —el trigger lo prohíbe y borraría el registro de lo aprobado— o
versionar la estructura misma, lo que mete un eje de versión en cada consulta financiera, la curva S y la auditoría,
para un recargue que ocurre una vez. El proyecto nuevo deja el histórico legible y la estructura nueva limpia, a cambio
de copiar datos y un flujo de «proyecto nuevo», sin tocar el modelo.

## 6. Preguntas para la PO (antes de `T11`)

1. **¿Una actividad puede tener varios rubros a la vez?** `S5` dice «presupuesto por actividad y rubro»; el diseño lo
   asume sí (una línea por par). Si la respuesta es «una actividad, un rubro», el modelo es más simple y `T10` baja a `M`.
2. **¿El monto asignado sigue siendo la suma de la programación mensual por línea?** Hoy es así y `validarModificacion`
   lo exige; con dos renglones del mismo rubro hay que decidir si el control pasa a la suma por rubro.
3. **Un gasto, ¿puede repartirse entre varias actividades?** `S9` habla de «facturas distribuidas»: si el reparto es por
   actividad, `gastos.actividad_id` debe ser tabla de reparto y no columna.
4. **¿Qué pasa con los gastos ya cargados sin actividad** al activar la Parte 2 en un proyecto existente? Propuesta:
   quedan sin actividad y se muestran en una fila «Sin actividad» del pivote, como hoy se muestran los gastos sin rubro.
5. **El «Propuesto» de `EV-03`** (que el sistema proponga la programación mensual): ¿qué reparto prefiere — lineal por
   semanas, o por duración de cada actividad?

## 7. Lo que este diseño no cubre

No leí las pantallas de presupuesto y ficha para dimensionar el trabajo de UI de `T11`: la estimación de esa rebanada
sale del modelo y de las APIs, no de los componentes. Antes de comprometer fechas conviene un pase de UI de medio día.
