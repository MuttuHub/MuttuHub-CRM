-- Adoptive + idempotent migration (S1.3, REQ-CAT-04). The municipios catalog is
-- greenfield on this branch — no `municipios` table exists in any environment —
-- so the CREATE TABLE branch is the one that runs. The file still follows the
-- adoption shape of S6.5 of the v2 SDD: the table is created only when absent
-- and every column is added only when missing, so running this SQL a second
-- time is a no-op and it is safe against a pre-existing table.
--
-- NO SEED ROWS. N-21 originally asked for this catalog to be "seeded from the
-- normalised legacy `territorio` values", but no `territorio` field or enum
-- exists anywhere in this repository: there is nothing to normalise and a
-- national list of municipios would be invented data. The demo municipios live
-- in prisma/seed.ts and never here; the migration creates structure, not rows.

-- 1. Table.
CREATE TABLE IF NOT EXISTS "municipios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "codigo_dane" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_suspension" TIMESTAMP(3),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id")
);

-- 2. Adoption of a pre-existing table: every column is added only when missing.
-- On the creation path above all of these are no-ops. The NOT NULL adds are
-- safe because the only table this migration can meet is either the greenfield
-- one it just created or an empty one; there is no legacy `municipios` data to
-- backfill.
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "nombre" TEXT NOT NULL;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "departamento" TEXT NOT NULL;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "codigo_dane" TEXT;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "fecha_suspension" TIMESTAMP(3);
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "orden" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "municipios" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
UPDATE "municipios" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;
ALTER TABLE "municipios" ALTER COLUMN "updated_at" SET NOT NULL;

-- 3. Unique indexes.
-- (nombre, departamento) TOGETHER: the same municipal name may repeat across
-- departments, but never twice inside the same department.
CREATE UNIQUE INDEX IF NOT EXISTS "municipios_nombre_departamento_key"
  ON "municipios"("nombre", "departamento");

-- `codigo_dane` is OPTIONAL and unique only WHEN PRESENT. Postgres already
-- treats NULLs as distinct in a unique index, so any number of municipios may
-- have no DANE code while a repeated non-NULL code is rejected.
CREATE UNIQUE INDEX IF NOT EXISTS "municipios_codigo_dane_key"
  ON "municipios"("codigo_dane");
