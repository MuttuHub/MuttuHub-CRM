-- Adoptive + idempotent migration (S3 U3, SDD §4.8, REQ-STR-05/06):
-- deliverables per activity and result indicators per objective.
--
-- What Prisma cannot express lives here: the partial unique code indexes (unique
-- per PROJECT among live rows, ignoring case), the CHECK constraints and the
-- composite same-project foreign keys that make a cross-project reference
-- impossible. `entregables.proyecto_id` is denormalised for exactly that reason
-- and because the deliverable code is unique per project (REQ-STR-05).

-- 1. entregables
CREATE TABLE IF NOT EXISTS "entregables" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "actividad_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad_meta" DECIMAL(15,2) NOT NULL,
    "unidad" TEXT NOT NULL,
    "tipo_medio_exigido" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "entregables_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "entregables_proyecto_id_idx" ON "entregables"("proyecto_id");
CREATE INDEX IF NOT EXISTS "entregables_actividad_id_idx" ON "entregables"("actividad_id");
CREATE UNIQUE INDEX IF NOT EXISTS "entregables_codigo_activo_uq"
  ON "entregables"("proyecto_id", lower("codigo")) WHERE "deleted_at" IS NULL;

DO $$ BEGIN
  ALTER TABLE "entregables" ADD CONSTRAINT "entregables_cantidad_meta_check" CHECK ("cantidad_meta" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entregables" ADD CONSTRAINT "entregables_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "entregables" ADD CONSTRAINT "entregables_actividad_id_proyecto_id_fkey"
    FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. indicadores
CREATE TABLE IF NOT EXISTS "indicadores" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "objetivo_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "meta" DECIMAL(15,2) NOT NULL,
    "unidad" TEXT NOT NULL,
    "linea_base" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "indicadores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "indicadores_proyecto_id_idx" ON "indicadores"("proyecto_id");
CREATE INDEX IF NOT EXISTS "indicadores_objetivo_id_idx" ON "indicadores"("objetivo_id");
CREATE UNIQUE INDEX IF NOT EXISTS "indicadores_id_proyecto_id_key" ON "indicadores"("id", "proyecto_id");
CREATE UNIQUE INDEX IF NOT EXISTS "indicadores_codigo_activo_uq"
  ON "indicadores"("proyecto_id", lower("codigo")) WHERE "deleted_at" IS NULL;

DO $$ BEGIN
  ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_meta_check" CHECK ("meta" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_linea_base_check"
    CHECK ("linea_base" IS NULL OR "linea_base" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_objetivo_id_proyecto_id_fkey"
    FOREIGN KEY ("objetivo_id", "proyecto_id") REFERENCES "objetivos"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
