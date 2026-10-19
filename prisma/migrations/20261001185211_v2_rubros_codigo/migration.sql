-- Adoptive + idempotent migration (S1.1a, REQ-CAT-01). Production already has an
-- abandoned v1 `rubros` table (Personal, Transporte, Material POP, Operación
-- logística — created by a migration that exists in no branch of this repo), so
-- a plain CREATE TABLE would abort `migrate deploy`. This file creates the table
-- when absent (branch/local) and adopts it when present: adds `codigo` when
-- missing, backfills R01/R12, suspends the two rows that leave the catalog, and
-- installs the immutability trigger exactly once.

-- 1. Table for the greenfield path. No-op when the legacy table already exists.
CREATE TABLE IF NOT EXISTS "rubros" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
);

-- 2. Adoption of an existing legacy table: every column is added only when
-- missing. On the legacy table only `codigo` is absent; the rest are no-ops.
ALTER TABLE "rubros" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "rubros" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rubros" ADD COLUMN IF NOT EXISTS "orden" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rubros" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "rubros" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
UPDATE "rubros" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;
ALTER TABLE "rubros" ALTER COLUMN "updated_at" SET NOT NULL;

-- 3. Unique code index. Postgres allows several NULLs, which is what keeps the
-- two legacy rows in the table while they leave the catalog.
CREATE UNIQUE INDEX IF NOT EXISTS "rubros_codigo_key" ON "rubros"("codigo");

-- 4. Backfill the two legacy rows that survive into the R01..R15 catalog.
-- These two literals are the ONLY copy of a rubro code outside RUBROS_V2 in
-- src/lib/catalogs.ts: this SQL runs before the application does, against
-- pre-existing rows identified by their v1 name, so it cannot import the TS
-- constant. The greenfield path seeds all 15 from RUBROS_V2 at run time.
UPDATE "rubros" SET "codigo" = 'R01' WHERE "nombre" = 'Personal' AND "codigo" IS NULL;
UPDATE "rubros" SET "codigo" = 'R12' WHERE "nombre" = 'Transporte' AND "codigo" IS NULL;

-- 5. "Material POP" and "Operación logística" leave the catalog: suspended and
-- code-less. They are not offered to any project; their existing amounts live on
-- `lineas_presupuestales` and are untouched until the manual per-project
-- reassignment (N-13).
UPDATE "rubros" SET "activo" = false WHERE "codigo" IS NULL;

-- 6. Immutable codes. The trigger rejects an UPDATE only when an existing code
-- actually changes; a NULL code may still be assigned (the backfill above). It
-- mirrors the plpgsql function + BEFORE trigger style of
-- auditoria_cambios_inmutable(), not its unconditional condition.
CREATE OR REPLACE FUNCTION rubros_codigo_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.codigo IS NOT NULL AND NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'rubros.codigo es inmutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rubros_codigo_no_update ON "rubros";
CREATE TRIGGER rubros_codigo_no_update
  BEFORE UPDATE ON "rubros"
  FOR EACH ROW EXECUTE FUNCTION rubros_codigo_inmutable();
