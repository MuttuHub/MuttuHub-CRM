-- S6 U4: project notifications (overspend). Adoptive + idempotent.
-- Task rows keep NULL proyecto_id/gasto_id, and NULLs never collide in the unique index.
ALTER TABLE "notificaciones" ADD COLUMN IF NOT EXISTS "proyecto_id" TEXT;
ALTER TABLE "notificaciones" ADD COLUMN IF NOT EXISTS "gasto_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "notificaciones"
    ADD CONSTRAINT "notificaciones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id")
    REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notificaciones"
    ADD CONSTRAINT "notificaciones_gasto_id_fkey" FOREIGN KEY ("gasto_id")
    REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "notificaciones_usuario_id_tipo_gasto_id_key"
  ON "notificaciones"("usuario_id", "tipo", "gasto_id");
CREATE INDEX IF NOT EXISTS "notificaciones_usuario_id_leida_idx" ON "notificaciones"("usuario_id", "leida");
