-- V8 (odd/tasks/producto-pendientes-2026-11.md, S4): a SIN_CONTACTO notification names its client.
-- Additive and idempotent: one new nullable column, no existing row changes, no backfill.
-- Every other row keeps NULL cliente_id, and NULLs never collide in the unique index, so there is
-- at most one SIN_CONTACTO row per (usuario, cliente). Deleting a client only unlinks its rows.
-- Revert: DROP INDEX "notificaciones_usuario_id_tipo_cliente_id_key";
--         ALTER TABLE "notificaciones" DROP COLUMN "cliente_id";
ALTER TABLE "notificaciones" ADD COLUMN IF NOT EXISTS "cliente_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "notificaciones"
    ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id")
    REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "notificaciones_usuario_id_tipo_cliente_id_key"
  ON "notificaciones"("usuario_id", "tipo", "cliente_id");
