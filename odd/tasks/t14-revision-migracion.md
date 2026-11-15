# Revisión de la migración de T14 (carril B) — Claude, 2026-11-14

Migración: `prisma/migrations/20261115120000_t14_gasto_reparto/migration.sql`, commit `45e98f7` de
`feat/t14-gasto-por-actividad`.

## Veredicto: APROBADA. Sigue con la rebanada 2-B.

No hay bloqueantes. Es aditiva: crea `gastos_reparto` y la llena con una fila por gasto existente. No altera ninguna
columna de `gastos`, y se revierte con `DROP TABLE "gastos_reparto"`.

## Lo que comprobé yo (no solo tu reporte)

Base descartable `ci_t14`, armada en el orden del CI (migrate deploy, db seed, seed-projects-demo, seed-demo-flujo:
5 gastos, $ 34.265.000) y después tu SQL aplicado tal cual con psql:

| # | Punto | Resultado |
|---|---|---|
| 1 | `gastos` y `lineas_presupuestales` intactas | Sí: md5 de todas las filas, idéntico antes y después |
| 2 | Conteos | 5 gastos → 5 repartos |
| 3 | Ejecutado total | $ 34.265.000,00 = Σ repartos $ 34.265.000,00 |
| 4 | Cada factura con reparto que suma su total | 0 facturas que no suman; 0 repartos con línea o proyecto distinto al del gasto |
| 5 | CHECK `valor > 0` | presente |
| 6 | Vuelta atrás | `DROP TABLE gastos_reparto` corre sin error y deja `gastos` igual (probado en una transacción con rollback) |

Drift: `prisma migrate diff` de la base migrada contra tu `schema.prisma` no muestra nada de T14. La única diferencia
es `lineas_presupuestales_actividad_id_idx`, que viene de T10 y ya estaba antes.

## Avisos para la rebanada 2-B (no bloquean)

1. **La regla «la suma de las líneas es exactamente el total» no la garantiza la base.** Nada impide un reparto que
   no sume `monto_cop`. En 2-B se tiene que cumplir en el servidor, con un test por cada caso de S9 («Una
   distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»). Si quieres que la base también la
   garantice, un constraint trigger diferido (`DEFERRABLE INITIALLY DEFERRED`) sobre `gastos_reparto` lo hace;
   decídelo tú y avísalo en el reporte.
2. **Choque con el carril A: «esta línea ya tiene gastos».** Hoy esa comprobación cuenta `gastos.linea_id` en tres
   lugares del carril A: el PUT de presupuesto (A3), la importación de la plantilla y el borrado de una actividad
   (`borrarPresupuestoDeActividad`, T13 S8). Cuando 2-B escriba facturas repartidas en varias líneas, una línea va a
   poder tener gastos **solo por un reparto**. Esas tres comprobaciones no la verían, y el borrado chocaría con la FK
   `NO ACTION` y daría un 500 en lugar de un 409. **No toques esos archivos.** En tu reporte de 2-B di qué valor
   queda en `gastos.linea_id` de una factura repartida (por ejemplo, la línea del primer reparto), y Claude cambia las
   tres comprobaciones para que cuenten `gastos_reparto` cuando tu rama entre a main.
3. Proceso: el prompt pedía reportar la migración antes de commitearla, y la commiteaste con el reporte. Como no está
   subida, no hay problema; para la próxima, mantén ese orden.
