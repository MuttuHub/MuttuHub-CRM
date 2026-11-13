-- v2 projects module — CONTRACT step of AJ-02 (activity weight = duration in weeks).
--
-- `20261030120000_v2_actividades_peso_por_duracion` made `peso` optional and dropped its CHECK,
-- so the code from before and after AJ-02 could both run. Apply THIS migration only once the
-- AJ-02 code is live in production: nothing reads or writes these columns any more, and the
-- approved baselines keep their historical weight in the immutable `versiones` JSON snapshots.
--
-- Idempotent: `DROP COLUMN IF EXISTS`.

ALTER TABLE "actividades" DROP COLUMN IF EXISTS "peso_manual";
ALTER TABLE "actividades" DROP COLUMN IF EXISTS "peso";
