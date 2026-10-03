-- Adoptive + idempotent migration (S1.2, REQ-CAT-03). The strategic-lines
-- catalog is greenfield on this branch — no `lineas_estrategicas` table exists
-- in any environment — so the CREATE TABLE branch is the one that runs. The
-- file still follows the adoption shape of S6.5 of the v2 SDD: the table is
-- created only when absent, every column is added only when missing, the seed
-- never duplicates and the trigger/function are replaced in place, so running
-- this SQL a second time is a no-op.

-- 1. Table.
CREATE TABLE IF NOT EXISTS "lineas_estrategicas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_suspension" TIMESTAMP(3),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineas_estrategicas_pkey" PRIMARY KEY ("id")
);

-- 2. Adoption of a pre-existing table: every column is added only when missing.
-- On the creation path above all of these are no-ops. The NOT NULL adds are
-- safe because the only table this migration can meet is the greenfield one it
-- just created; there is no legacy `lineas_estrategicas` shape to backfill.
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "codigo" TEXT NOT NULL;
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "nombre" TEXT NOT NULL;
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "fecha_suspension" TIMESTAMP(3);
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "orden" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lineas_estrategicas" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
UPDATE "lineas_estrategicas" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;
ALTER TABLE "lineas_estrategicas" ALTER COLUMN "updated_at" SET NOT NULL;

-- 3. Unique code index.
CREATE UNIQUE INDEX IF NOT EXISTS "lineas_estrategicas_codigo_key" ON "lineas_estrategicas"("codigo");

-- 4. Seed the 8 RF-02 strategic lines, in LE01..LE08 order. These 8 literals
-- are the ONLY copy of a line code outside LINEAS_ESTRATEGICAS_V2 in
-- src/lib/catalogs.ts: this SQL runs before the application does, so it cannot
-- import the TS constant (the same rationale as the rubro backfill).
-- `ON CONFLICT (codigo) DO NOTHING` makes a re-run a no-op and never overrides
-- an administrator's suspension of a line. `updated_at` has no database
-- default (Prisma's `@updatedAt` writes it client-side), so the insert supplies
-- it explicitly.
INSERT INTO "lineas_estrategicas" ("id", "codigo", "nombre", "activo", "orden", "updated_at")
VALUES
  (gen_random_uuid(), 'LE01', 'Empleabilidad', true, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE02', 'Emprendimiento', true, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE03', 'Productividad', true, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE04', 'Cultural', true, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE05', 'Social', true, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE06', 'Cívico-político', true, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE07', 'Método Muttu', true, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LE08', 'Ambiental', true, 8, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- 5. Immutable codes. The trigger rejects an UPDATE only when an existing code
-- actually changes, mirroring the plpgsql function + BEFORE trigger style of
-- rubros_codigo_inmutable().
CREATE OR REPLACE FUNCTION lineas_estrategicas_codigo_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.codigo IS NOT NULL AND NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'lineas_estrategicas.codigo es inmutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lineas_estrategicas_codigo_no_update ON "lineas_estrategicas";
CREATE TRIGGER lineas_estrategicas_codigo_no_update
  BEFORE UPDATE ON "lineas_estrategicas"
  FOR EACH ROW EXECUTE FUNCTION lineas_estrategicas_codigo_inmutable();
