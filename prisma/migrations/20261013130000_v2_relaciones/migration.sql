-- v7 alignment C4a (Relaciones): power × interest matrix + optional owner on
-- `contactos`. Adoptive and idempotent — all four columns are nullable, so
-- every pre-existing row keeps working (no backfill, no NOT NULL, no default
-- that could rewrite legacy data). No destructive ops.

-- 1. Quadrant + relationship-strength columns, added only when missing.
--    poder/interes are 1..5 and fuerza_relacion is 1..3; the range is enforced
--    by the API layer (400 on out-of-range) and asserted by the invariant test.
ALTER TABLE "contactos" ADD COLUMN IF NOT EXISTS "poder" INTEGER;
ALTER TABLE "contactos" ADD COLUMN IF NOT EXISTS "interes" INTEGER;
ALTER TABLE "contactos" ADD COLUMN IF NOT EXISTS "fuerza_relacion" INTEGER;

-- 2. Optional internal owner. Nullable, so legacy rows are untouched.
ALTER TABLE "contactos" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;

-- 3. FK to usuarios, guarded so a re-run is a no-op. Prisma's default
--    referential actions for an optional relation are SET NULL / CASCADE.
DO $$ BEGIN
  ALTER TABLE "contactos" ADD CONSTRAINT "contactos_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
