-- Adopt the production v1 leftovers BEFORE the first v2 migration runs
-- (rehearsal R4, 2026-10-16, on a production copy).
--
-- Production carries state that no migration in this repo explains:
--   * a phantom applied migration `20260918153200_tablero_seguimiento_social`
--     (commit 6e4c6c8, never merged) that created the abandoned v1 tables
--     proyectos, metas, actividades, gastos, indicadores, soportes_proyecto
--     (all EMPTY in production), the enums "LineaEstrategica", "EstadoProyecto"
--     (v1 values, no BORRADOR) and "TipoSoporte", plus `rubros` and
--     `lineas_presupuestales`, which the v2 migrations deliberately ADOPT;
--   * that phantom migration already renamed two foreign keys, so production
--     has `bitacora_entradas_oportunidad_id_cliente_id_fkey` and
--     `tareas_oportunidad_id_cliente_id_fkey` while
--     `20260930181056_v2_auditoria_cambios` renames the old names
--     unconditionally and aborts.
--
-- Left alone, `migrate deploy` fails on that rename, and later silently keeps the
-- v1 "EstadoProyecto" enum (the v2 `CREATE TYPE` is swallowed by duplicate_object)
-- and the v1 tables (`CREATE TABLE IF NOT EXISTS`). This file normalizes both.
--
-- Every branch is guarded and idempotent: on a v2-shaped or fresh database it is
-- a no-op. A v1 table holding ANY row aborts the migration (no silent data loss).

-- 1. Phantom FK renames. Only needed while 20260930181056 has not run: afterwards
--    the "new" names are the correct ones and must not be touched.
DO $$
DECLARE
  v2_rename_pending boolean;
  pair record;
BEGIN
  IF to_regclass(quote_ident(current_schema()) || '._prisma_migrations') IS NOT NULL THEN
    EXECUTE format(
      'SELECT NOT EXISTS (SELECT 1 FROM %I._prisma_migrations
         WHERE migration_name = %L AND finished_at IS NOT NULL AND rolled_back_at IS NULL)',
      current_schema(), '20260930181056_v2_auditoria_cambios'
    ) INTO v2_rename_pending;
  ELSE
    v2_rename_pending := true;
  END IF;

  IF NOT v2_rename_pending THEN
    RETURN;
  END IF;

  FOR pair IN
    SELECT * FROM (VALUES
      ('bitacora_entradas', 'bitacora_oportunidad_cliente_fkey', 'bitacora_entradas_oportunidad_id_cliente_id_fkey'),
      ('tareas', 'tareas_oportunidad_cliente_fkey', 'tareas_oportunidad_id_cliente_id_fkey')
    ) AS p(tbl, old_name, new_name)
  LOOP
    IF EXISTS (
         SELECT 1 FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relnamespace = current_schema()::regnamespace
            AND t.relname = pair.tbl AND c.conname = pair.new_name)
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relnamespace = current_schema()::regnamespace
            AND t.relname = pair.tbl AND c.conname = pair.old_name)
    THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', pair.tbl, pair.new_name, pair.old_name);
    END IF;
  END LOOP;
END $$;

-- 2. Remove the empty v1 tables. A table is v1 only when it carries a column that
--    the v2 table of the same name does not have, so a v2 table is never touched.
--    Dependency order; plain removal (no CASCADE) so an unexpected dependent
--    fails loudly instead of disappearing.
DO $$
DECLARE
  spec record;
  is_v1 boolean;
  has_rows boolean;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      (1, 'soportes_proyecto', 'actividad_id', NULL),
      (2, 'gastos',            'concepto',     NULL),
      (3, 'indicadores',       'meta_valor',   NULL),
      (4, 'actividades',       'meta_id',      'objetivo_id'),
      (5, 'metas',             NULL,           NULL),
      (6, 'proyectos',         'territorio',   NULL)
    ) AS s(ord, tbl, v1_column, v2_column)
    ORDER BY ord
  LOOP
    IF to_regclass(quote_ident(current_schema()) || '.' || quote_ident(spec.tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    -- `metas` has no v2 counterpart: its mere existence is the v1 marker.
    is_v1 := spec.v1_column IS NULL OR EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = spec.tbl
         AND column_name = spec.v1_column);
    IF is_v1 AND spec.v2_column IS NOT NULL THEN
      is_v1 := NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = spec.tbl
           AND column_name = spec.v2_column);
    END IF;
    IF NOT is_v1 THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', spec.tbl) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'v1 table "%" is not empty; refusing to remove it (no silent data loss). Migrate or archive its rows manually first.', spec.tbl;
    END IF;

    IF spec.tbl = 'proyectos' AND to_regclass(quote_ident(current_schema()) || '.lineas_presupuestales') IS NOT NULL THEN
      -- The adopted lineas_presupuestales table keeps living: only its FK to the
      -- v1 proyectos goes. The v2 presupuesto migration re-adds it.
      EXECUTE 'ALTER TABLE lineas_presupuestales DROP CONSTRAINT IF EXISTS lineas_presupuestales_proyecto_id_fkey';
    END IF;

    EXECUTE format('DROP TABLE %I', spec.tbl);
  END LOOP;
END $$;

-- 3. Remove the v1 enums once nothing uses them. "EstadoProyecto" shares its name
--    with the v2 enum: only the v1 variant (no 'BORRADOR' label) goes. The other
--    two have no v2 counterpart.
DO $$
DECLARE
  enum_name text;
BEGIN
  FOREACH enum_name IN ARRAY ARRAY['EstadoProyecto', 'LineaEstrategica', 'TipoSoporte']
  LOOP
    IF NOT EXISTS (
         SELECT 1 FROM pg_type t
          WHERE t.typnamespace = current_schema()::regnamespace
            AND t.typname = enum_name AND t.typtype = 'e') THEN
      CONTINUE;
    END IF;

    IF enum_name = 'EstadoProyecto' AND EXISTS (
         SELECT 1 FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typnamespace = current_schema()::regnamespace
            AND t.typname = enum_name AND e.enumlabel = 'BORRADOR') THEN
      CONTINUE;
    END IF;

    IF EXISTS (
         SELECT 1 FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_type t ON t.oid = a.atttypid
          WHERE t.typnamespace = current_schema()::regnamespace
            AND t.typname = enum_name AND a.attnum > 0 AND NOT a.attisdropped
            AND c.relkind IN ('r', 'p')) THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP TYPE %I', enum_name);
  END LOOP;
END $$;
