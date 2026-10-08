-- Adoptive + idempotent migration (S5 U2, SDD §3.7, REQ-BUD-01..05): budget lines
-- (assigned amount per project and rubro) and monthly programming cells.
--
-- Production may still carry the v1 `lineas_presupuestales` table (rubros did), so
-- every statement is CREATE ... IF NOT EXISTS / ADD ... IF NOT EXISTS or wrapped in
-- a duplicate_object block. A v1 `deleted_at` column, if present, stays unused:
-- lines are never deleted in v2 ($0 is the "off" state).

-- 1. lineas_presupuestales
CREATE TABLE IF NOT EXISTS "lineas_presupuestales" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "rubro_id" TEXT NOT NULL,
    "monto_proyectado_cop" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineas_presupuestales_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lineas_presupuestales" ADD COLUMN IF NOT EXISTS "monto_proyectado_cop" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "lineas_presupuestales" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lineas_presupuestales" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "lineas_presupuestales_proyecto_id_idx" ON "lineas_presupuestales"("proyecto_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lineas_presupuestales_proyecto_id_rubro_id_key"
  ON "lineas_presupuestales"("proyecto_id", "rubro_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lineas_presupuestales_id_proyecto_id_key"
  ON "lineas_presupuestales"("id", "proyecto_id");

DO $$ BEGIN
  ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_monto_no_negativo_ck" CHECK ("monto_proyectado_cop" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_presupuestales_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_presupuestales_rubro_id_fkey"
    FOREIGN KEY ("rubro_id") REFERENCES "rubros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. programacion_periodo
CREATE TABLE IF NOT EXISTS "programacion_periodo" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programacion_periodo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "programacion_periodo_linea_id_periodo_key"
  ON "programacion_periodo"("linea_id", "periodo");
CREATE INDEX IF NOT EXISTS "programacion_periodo_proyecto_id_periodo_idx"
  ON "programacion_periodo"("proyecto_id", "periodo");

DO $$ BEGIN
  ALTER TABLE "programacion_periodo" ADD CONSTRAINT "programacion_periodo_ck"
    CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "programacion_periodo" ADD CONSTRAINT "programacion_valor_no_negativo_ck" CHECK ("valor" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "programacion_periodo" ADD CONSTRAINT "programacion_periodo_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "programacion_periodo" ADD CONSTRAINT "programacion_periodo_linea_id_proyecto_id_fkey"
    FOREIGN KEY ("linea_id", "proyecto_id") REFERENCES "lineas_presupuestales"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
