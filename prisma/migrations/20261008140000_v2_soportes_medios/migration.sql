-- Adoptive + idempotent migration (S4 U3, SDD §4.8, REQ-EXE-03):
-- medios de verificación of an execution record.
--
-- A medio is an uploaded file (signed upload, the object is never deleted from
-- storage) or an external https link. `medicion_id` is declared now so the
-- exactly-one-parent CHECK is final; its composite foreign key arrives with the
-- measurements table (S4 U4). `gasto_id` and the access log belong to S6.

CREATE TABLE IF NOT EXISTS "soportes_proyecto" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "avance_id" TEXT,
    "medicion_id" TEXT,
    "nombre" TEXT NOT NULL,
    "storage_path" TEXT,
    "url_externa" TEXT,
    "tipo_mime" TEXT,
    "tamano_bytes" INTEGER,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "soportes_proyecto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "soportes_proyecto_storage_path_key" ON "soportes_proyecto"("storage_path");
CREATE INDEX IF NOT EXISTS "soportes_proyecto_avance_id_idx" ON "soportes_proyecto"("avance_id");
CREATE INDEX IF NOT EXISTS "soportes_proyecto_medicion_id_idx" ON "soportes_proyecto"("medicion_id");
CREATE INDEX IF NOT EXISTS "soportes_proyecto_proyecto_id_idx" ON "soportes_proyecto"("proyecto_id");

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_padre_check"
    CHECK (num_nonnulls("avance_id", "medicion_id") = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_fuente_check"
    CHECK (num_nonnulls("storage_path", "url_externa") = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_tamano_check"
    CHECK ("tamano_bytes" IS NULL OR "tamano_bytes" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_avance_id_proyecto_id_fkey"
    FOREIGN KEY ("avance_id", "proyecto_id") REFERENCES "avances_entregable"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
