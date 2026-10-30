-- v2 projects module — an activity's weight is its duration in weeks (AJ-02, PO document v1.1, 2026-10-28).
--
-- The weight is now `semana_fin - semana_inicio + 1`, derived wherever it is needed
-- (`src/lib/proyectos/weeks.ts` → `defaultWeight`). Nothing reads or writes the stored
-- `peso` / `peso_manual` columns any more.
--
-- EXPAND step of an expand/contract change. The columns are NOT dropped here, so the
-- production code deployed before AJ-02 (which still reads `peso` and writes it as a required
-- value) and the code after AJ-02 (which never writes it) both work against this schema, in
-- whichever order the deploy and the migration run:
--   * `peso` stops being required and loses its `peso > 0` CHECK, so inserts that omit it succeed;
--   * `peso_manual` already has `DEFAULT false`, so it needs no change.
-- A follow-up migration drops both columns once the AJ-02 code is live in production.
--
-- Nothing is backfilled: every weight the system reports equals the derived one, which is what
-- the PO's «los pesos manuales ya guardados se recalculan por duración» asks for. Approved
-- baselines keep their historical weight in the immutable `versiones` JSON snapshots.
--
-- Idempotent: `DROP CONSTRAINT IF EXISTS`, and `DROP NOT NULL` is a no-op when already nullable.

ALTER TABLE "actividades" DROP CONSTRAINT IF EXISTS "actividades_peso_check";
ALTER TABLE "actividades" ALTER COLUMN "peso" DROP NOT NULL;
