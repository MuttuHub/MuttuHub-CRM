-- v2 projects module — activity-level progress reports (AJ-01, PO document v1.1, 2026-10-28).
--
-- New table `reportes_actividad`: one row per activity progress report, registered at the
-- ACTIVITY level (distinct from `avances_entregable`, which stays deliverable-level and is
-- untouched by this migration). Void-only, like `avances_entregable`: a correction sets
-- `anulado_at` + `motivo_anulacion`, never a hard delete. `observacion` is NOT NULL here — a
-- deliberate difference from `avances_entregable.observacion`, which stays nullable — AJ-01
-- requires every report to explain what was executed and what is missing.
--
-- `soportes_proyecto` gets a fourth nullable parent, `reporte_actividad_id`, and its existing
-- "at most one parent" CHECK (`soportes_proyecto_padre_check`, currently
-- `num_nonnulls(avance_id, medicion_id, gasto_id) <= 1` as of migration
-- 20261017120000_v2_soportes_proyecto_origen, which allows zero parents for a project-origin
-- document) is replaced to cover all four parents, keeping the same "at most one" semantics.
-- Postgres cannot "add a column to an existing CHECK", so the constraint is dropped and
-- recreated under the same name (the invariant tests assert that exact name).
--
-- Idempotent: CREATE TABLE / ADD COLUMN / CREATE INDEX use IF NOT EXISTS, constraints are
-- wrapped in duplicate_object guards or DROP IF EXISTS + ADD, so re-running this file is safe.

CREATE TABLE IF NOT EXISTS "reportes_actividad" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "actividad_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "observacion" TEXT NOT NULL,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_at" TIMESTAMP(3),
    "anulado_por_id" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "reportes_actividad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reportes_actividad_id_proyecto_id_key" ON "reportes_actividad"("id", "proyecto_id");
CREATE INDEX IF NOT EXISTS "reportes_actividad_actividad_id_fecha_idx" ON "reportes_actividad"("actividad_id", "fecha");
CREATE INDEX IF NOT EXISTS "reportes_actividad_proyecto_id_idx" ON "reportes_actividad"("proyecto_id");

DO $$ BEGIN
  ALTER TABLE "reportes_actividad" ADD CONSTRAINT "reportes_actividad_porcentaje_check"
    CHECK ("porcentaje" > 0 AND "porcentaje" <= 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reportes_actividad" ADD CONSTRAINT "reportes_actividad_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reportes_actividad" ADD CONSTRAINT "reportes_actividad_actividad_id_proyecto_id_fkey"
    FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- soportes_proyecto: the activity progress report becomes a fourth possible parent.
ALTER TABLE "soportes_proyecto" ADD COLUMN IF NOT EXISTS "reporte_actividad_id" TEXT;
CREATE INDEX IF NOT EXISTS "soportes_proyecto_reporte_actividad_id_idx" ON "soportes_proyecto"("reporte_actividad_id");

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_reporte_actividad_id_proyecto_id_fkey"
    FOREIGN KEY ("reporte_actividad_id", "proyecto_id") REFERENCES "reportes_actividad"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Same constraint name (the invariant tests assert it); now covers four parents, still "at
-- most one" non-null — zero stays valid (a project-origin document, migration 26).
ALTER TABLE "soportes_proyecto" DROP CONSTRAINT IF EXISTS "soportes_proyecto_padre_check";
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_padre_check"
  CHECK (num_nonnulls("avance_id", "medicion_id", "gasto_id", "reporte_actividad_id") <= 1);
