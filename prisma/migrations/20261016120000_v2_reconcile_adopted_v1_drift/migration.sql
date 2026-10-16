-- Reconcile the drift that the adopted v1 tables carry into v2 (rehearsal R4,
-- 2026-10-16: `migrate diff` after a full deploy on a production copy still
-- wanted these changes). Runs LAST, after every adoptive v2 migration.
--
--   * `rubros_nombre_key`: the v1 unique index on `rubros.nombre`. schema.prisma
--     declares `nombre` WITHOUT @unique (codes are the identity; two rubros may
--     share a name), so the leftover index is dropped.
--   * `deleted_at` on `rubros` and `lineas_presupuestales`: v1 soft-delete
--     columns that schema.prisma no longer has. Dropped only while every value is
--     NULL; a soft-deleted row aborts the migration instead of resurrecting.
--   * `lineas_monto_no_negativo`: the v1 name of the amount CHECK; v2 calls it
--     `lineas_monto_no_negativo_ck`. Renamed when the v2 name is free; when the
--     v2 migration already added its own copy the v1 duplicate is dropped.
--
-- Guarded and idempotent: on a v2-shaped or fresh database every branch is a
-- no-op.

DO $$
DECLARE
  tbl text;
  has_values boolean;
BEGIN
  -- 1. v1 unique index on rubros.nombre (not in schema.prisma).
  IF EXISTS (
       SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'rubros' AND indexname = 'rubros_nombre_key') THEN
    EXECUTE format('DROP INDEX %I.%I', current_schema(), 'rubros_nombre_key');
  END IF;

  -- 2. v1 soft-delete columns.
  FOREACH tbl IN ARRAY ARRAY['rubros', 'lineas_presupuestales']
  LOOP
    IF EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = tbl AND column_name = 'deleted_at') THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE deleted_at IS NOT NULL)', tbl)
        INTO has_values;
      IF has_values THEN
        RAISE EXCEPTION '"%".deleted_at holds soft-deleted rows; refusing to drop the column (no silent data loss). Review those rows first.', tbl;
      END IF;
      EXECUTE format('ALTER TABLE %I DROP COLUMN deleted_at', tbl);
    END IF;
  END LOOP;

  -- 3. v1 name of the amount CHECK.
  IF EXISTS (
       SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relnamespace = current_schema()::regnamespace
          AND t.relname = 'lineas_presupuestales'
          AND c.conname = 'lineas_monto_no_negativo') THEN
    IF EXISTS (
         SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relnamespace = current_schema()::regnamespace
            AND t.relname = 'lineas_presupuestales'
            AND c.conname = 'lineas_monto_no_negativo_ck') THEN
      ALTER TABLE "lineas_presupuestales" DROP CONSTRAINT "lineas_monto_no_negativo";
    ELSE
      ALTER TABLE "lineas_presupuestales" RENAME CONSTRAINT "lineas_monto_no_negativo" TO "lineas_monto_no_negativo_ck";
    END IF;
  END IF;
END $$;
