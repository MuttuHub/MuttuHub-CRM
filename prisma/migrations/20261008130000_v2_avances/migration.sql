-- Adoptive + idempotent migration (S4 U2, SDD §4.8, REQ-EXE-01..07):
-- progress records (avances) of a deliverable.
--
-- An avance is voided, never deleted (REQ-EXE-07): `anulado_at` and
-- `motivo_anulacion` travel together. `proyecto_id` is denormalised so the
-- composite foreign key can make a cross-project deliverable impossible, which
-- needs the parent's `(id, proyecto_id)` unique key added in step 1.

-- 1. entregables (id, proyecto_id) unique key, target of the composite FK
CREATE UNIQUE INDEX IF NOT EXISTS "entregables_id_proyecto_id_key" ON "entregables"("id", "proyecto_id");

-- 2. avances_entregable
CREATE TABLE IF NOT EXISTS "avances_entregable" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "entregable_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cantidad" DECIMAL(15,2) NOT NULL,
    "observacion" TEXT,
    "justificacion_exceso" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_at" TIMESTAMP(3),
    "anulado_por_id" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "avances_entregable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "avances_entregable_id_proyecto_id_key" ON "avances_entregable"("id", "proyecto_id");
CREATE INDEX IF NOT EXISTS "avances_entregable_entregable_id_fecha_idx" ON "avances_entregable"("entregable_id", "fecha");
CREATE INDEX IF NOT EXISTS "avances_entregable_proyecto_id_idx" ON "avances_entregable"("proyecto_id");

DO $$ BEGIN
  ALTER TABLE "avances_entregable" ADD CONSTRAINT "avances_entregable_cantidad_check" CHECK ("cantidad" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "avances_entregable" ADD CONSTRAINT "avances_entregable_anulacion_check"
    CHECK (("anulado_at" IS NULL) = ("motivo_anulacion" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "avances_entregable" ADD CONSTRAINT "avances_entregable_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "avances_entregable" ADD CONSTRAINT "avances_entregable_entregable_id_proyecto_id_fkey"
    FOREIGN KEY ("entregable_id", "proyecto_id") REFERENCES "entregables"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
