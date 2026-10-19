-- Adoptive + idempotent migration (S3 U2a, SDD §4.8, REQ-STR-02..04): week-based
-- project activities.
--
-- Calendar dates are never stored: they are derived on read from the weeks and
-- the project start. What Prisma cannot express lives here:
--   * CHECK actividades_semanas_check: 1 <= semana_inicio <= semana_fin. The
--     upper bound against the project duration depends on project dates and is
--     a service-layer rule (the project can shrink afterwards).
--   * CHECK actividades_peso_check: peso > 0.
--   * partial unique index actividades_codigo_activo_uq: the code is unique per
--     project, ignoring case, among live rows.
--   * composite foreign key (objetivo_id, proyecto_id) -> objetivos(id,
--     proyecto_id): an activity can never reference another project's objective.

CREATE TABLE IF NOT EXISTS "actividades" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "objetivo_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "semana_inicio" INTEGER NOT NULL,
    "semana_fin" INTEGER NOT NULL,
    "peso" DECIMAL(9,2) NOT NULL,
    "peso_manual" BOOLEAN NOT NULL DEFAULT false,
    "responsable_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "actividades_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "actividades_proyecto_id_idx" ON "actividades"("proyecto_id");
CREATE INDEX IF NOT EXISTS "actividades_objetivo_id_idx" ON "actividades"("objetivo_id");
CREATE UNIQUE INDEX IF NOT EXISTS "actividades_id_proyecto_id_key" ON "actividades"("id", "proyecto_id");

CREATE UNIQUE INDEX IF NOT EXISTS "actividades_codigo_activo_uq"
  ON "actividades"("proyecto_id", lower("codigo")) WHERE "deleted_at" IS NULL;

DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_semanas_check"
    CHECK ("semana_inicio" >= 1 AND "semana_fin" >= "semana_inicio");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_peso_check" CHECK ("peso" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_objetivo_id_proyecto_id_fkey"
    FOREIGN KEY ("objetivo_id", "proyecto_id") REFERENCES "objetivos"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_responsable_id_fkey"
    FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
