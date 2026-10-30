-- v2 projects module — an activity's weight is its duration in weeks (AJ-02, PO document v1.1, 2026-10-28).
--
-- The weight is now `semana_fin - semana_inicio + 1`, derived wherever it is needed
-- (`src/lib/proyectos/weeks.ts` → `defaultWeight`). Both stored columns are dropped:
--   * `peso` was a second copy of a pure function of the two week columns, so it could only
--     drift from the rule; and
--   * `peso_manual` was exactly what made the weight editable.
--
-- Nothing is backfilled because nothing reads them any more: every weight the system reports
-- after this migration equals the derived one, which is what the PO's «los pesos manuales ya
-- guardados se recalculan por duración» asks for. Approved baselines keep their historical
-- weight in the immutable `versiones` JSON snapshots, so «las líneas base aprobadas conservan
-- su foto histórica» holds without these columns.
--
-- Idempotent: `DROP ... IF EXISTS` on the CHECK constraint and on both columns.

ALTER TABLE "actividades" DROP CONSTRAINT IF EXISTS "actividades_peso_check";
ALTER TABLE "actividades" DROP COLUMN IF EXISTS "peso_manual";
ALTER TABLE "actividades" DROP COLUMN IF EXISTS "peso";
