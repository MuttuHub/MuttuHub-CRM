-- Adoptive + idempotent migration (S4 U4, SDD §4.8, REQ-EXE-04/05/07):
-- indicator measurements and beneficiary records.
--
-- Both are voided, never deleted (REQ-EXE-07): `anulado_at` and
-- `motivo_anulacion` travel together. `proyecto_id` is denormalised so the
-- composite foreign keys make a cross-project parent impossible. Also closes
-- the loop left by v2_soportes_medios: `soportes_proyecto.medicion_id` gets its
-- same-project composite foreign key.

-- 1. mediciones_indicador
CREATE TABLE IF NOT EXISTS "mediciones_indicador" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "indicador_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "observacion" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_at" TIMESTAMP(3),
    "anulado_por_id" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "mediciones_indicador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mediciones_indicador_id_proyecto_id_key" ON "mediciones_indicador"("id", "proyecto_id");
CREATE INDEX IF NOT EXISTS "mediciones_indicador_indicador_id_fecha_idx" ON "mediciones_indicador"("indicador_id", "fecha");
CREATE INDEX IF NOT EXISTS "mediciones_indicador_proyecto_id_idx" ON "mediciones_indicador"("proyecto_id");

DO $$ BEGIN
  ALTER TABLE "mediciones_indicador" ADD CONSTRAINT "mediciones_indicador_valor_check" CHECK ("valor" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mediciones_indicador" ADD CONSTRAINT "mediciones_indicador_anulacion_check"
    CHECK (("anulado_at" IS NULL) = ("motivo_anulacion" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mediciones_indicador" ADD CONSTRAINT "mediciones_indicador_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mediciones_indicador" ADD CONSTRAINT "mediciones_indicador_indicador_id_proyecto_id_fkey"
    FOREIGN KEY ("indicador_id", "proyecto_id") REFERENCES "indicadores"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. registros_beneficiarios
CREATE TABLE IF NOT EXISTS "registros_beneficiarios" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "actividad_id" TEXT,
    "fecha" DATE NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "observacion" TEXT,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_at" TIMESTAMP(3),
    "anulado_por_id" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "registros_beneficiarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "registros_beneficiarios_id_proyecto_id_key" ON "registros_beneficiarios"("id", "proyecto_id");
CREATE INDEX IF NOT EXISTS "registros_beneficiarios_proyecto_id_fecha_idx" ON "registros_beneficiarios"("proyecto_id", "fecha");
CREATE INDEX IF NOT EXISTS "registros_beneficiarios_actividad_id_idx" ON "registros_beneficiarios"("actividad_id");

DO $$ BEGIN
  ALTER TABLE "registros_beneficiarios" ADD CONSTRAINT "registros_beneficiarios_cantidad_check" CHECK ("cantidad" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "registros_beneficiarios" ADD CONSTRAINT "registros_beneficiarios_anulacion_check"
    CHECK (("anulado_at" IS NULL) = ("motivo_anulacion" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "registros_beneficiarios" ADD CONSTRAINT "registros_beneficiarios_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "registros_beneficiarios" ADD CONSTRAINT "registros_beneficiarios_actividad_id_proyecto_id_fkey"
    FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. soportes_proyecto.medicion_id composite foreign key
DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_medicion_id_proyecto_id_fkey"
    FOREIGN KEY ("medicion_id", "proyecto_id") REFERENCES "mediciones_indicador"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
