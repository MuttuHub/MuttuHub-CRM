-- T14.5 (S11, EV-07): cierre de gastos de la actividad.
--
-- Tres columnas NUEVAS y nulables sobre `actividades`: el estado de cierre vive en la actividad
-- («la actividad muestra ahorro», «no se pueden registrar gastos en una actividad cerrada»), no en la
-- línea, porque el cierre tiene una nota que hay que enseñar y una línea no tendría dónde guardarla.
--   * `gastos_cerrados_at`   — el instante del cierre; NULL = gastos abiertos. Es también el predicado
--                              que usan los tres escritores de gastos para rechazar una actividad cerrada.
--   * `gastos_cerrados_nota` — la nota obligatoria que explica la diferencia (S11).
--   * `gastos_cerrados_por`  — el usuario que cerró, como escalar suelto y SIN relación (igual que
--                              `usuario_id` en la auditoría): el cierre sobrevive a un usuario borrado.
--
-- Puramente aditiva: ninguna columna existente cambia de tipo ni de nulabilidad, no se toca ningún dato,
-- no se añade ningún DEFAULT (toda actividad existente queda con los gastos ABIERTOS, que es el estado
-- de hoy) y no hay backfill. Revertir es `ALTER TABLE "actividades" DROP COLUMN` de las tres.
--
-- Nota de generación: `prisma migrate dev --create-only` añadió también un `DROP INDEX
-- "lineas_presupuestales_actividad_id_idx"`, un desajuste anterior a esta rebanada (el índice lo crea
-- en SQL `20261112120000_t10_linea_por_actividad` y no estaba declarado en `schema.prisma`). Se quitó:
-- esta migración no borra nada, y el índice se declaró en `LineaPresupuestal` para que el próximo
-- `migrate dev` no lo vuelva a intentar.

-- AlterTable
ALTER TABLE "actividades" ADD COLUMN     "gastos_cerrados_at" TIMESTAMP(3),
ADD COLUMN     "gastos_cerrados_nota" TEXT,
ADD COLUMN     "gastos_cerrados_por" TEXT;
