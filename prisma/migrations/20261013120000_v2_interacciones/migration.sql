-- v7 alignment C3a (Interacciones): interaction type + next step on the
-- bitácora. Adoptive and idempotent — existing rows keep working because
-- `tipo` defaults to OTRO and `proximo_paso` is nullable. No destructive ops:
-- the immutable-by-design model (no updated_at/deleted_at, no PATCH/DELETE)
-- is untouched.

-- 1. Enum. Guarded so a re-run is a no-op (CREATE TYPE has no IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE "TipoInteraccion" AS ENUM ('REUNION', 'CORREO', 'LLAMADA', 'VISITA', 'OTRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Columns, added only when missing. `tipo` is NOT NULL with a default, so
-- every pre-existing row lands as OTRO during the migration itself.
ALTER TABLE "bitacora_entradas" ADD COLUMN IF NOT EXISTS "tipo" "TipoInteraccion" NOT NULL DEFAULT 'OTRO';
ALTER TABLE "bitacora_entradas" ADD COLUMN IF NOT EXISTS "proximo_paso" TEXT;

-- 3. Index on the client FK, exactly as declared in schema.prisma (the feed
-- filters and the per-client log both read by cliente_id).
CREATE INDEX IF NOT EXISTS "bitacora_entradas_cliente_id_idx" ON "bitacora_entradas"("cliente_id");
