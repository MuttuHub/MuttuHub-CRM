-- Adoptive + idempotent migration (S2.1, RF-04, ADR-09). The project module is
-- greenfield on this branch: no `proyectos` table and neither enum exists in any
-- environment (the v1 module never shipped), so this migration CREATES both
-- enums, the three tables and every index. There is deliberately NO separate
-- "ADD VALUE" migration for the enums — unlike the v1 branches, the types are
-- new here and are created in this same file.
--
-- NO CHECK constraints and NO seed rows: none are specified for these tables.
--
-- The composite FK on (oportunidad_id, cliente_id) forces a project's
-- `cliente_id` to match its opportunity's own `cliente_id` (ADR-09 / F1): a
-- project can never point at an opportunity belonging to a different client,
-- and the FK shares `cliente_id` with the `cliente` relation exactly like
-- `Tarea.oportunidad`. Its `Oportunidad.proyecto Proyecto?` 1:1 back-relation
-- makes Prisma require the defining tuple to be unique, so BOTH the
-- `oportunidad_id` single-column unique and the `(oportunidad_id, cliente_id)`
-- tuple unique exist below.
--
-- The partial unique index `proyecto_lineas_principal_uq` (DP-05) enforces at
-- most one principal strategic line per project. Prisma cannot express a
-- partial index, so it is hand-written here; "exactly one principal" is a
-- service-layer rule, the database only forbids a second one.

-- 1. Enums, guarded so a re-run is a no-op.
DO $$ BEGIN
  CREATE TYPE "EstadoProyecto" AS ENUM ('PLANIFICACION', 'BORRADOR', 'EN_EJECUCION', 'SUSPENDIDO', 'CERRADO', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrigenProyecto" AS ENUM ('OPORTUNIDAD', 'INDEPENDIENTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tables.
CREATE TABLE IF NOT EXISTS "proyectos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "oportunidad_id" TEXT,
    "responsable_id" TEXT,
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR',
    "origen" "OrigenProyecto",
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "valor_total" DECIMAL(15,2),
    "diferencia_valor_oportunidad" DECIMAL(15,2),
    "beneficiarios_meta" INTEGER,
    "umbrales_override" JSONB,
    "programacion_pendiente" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "proyecto_lineas" (
    "proyecto_id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "proyecto_lineas_pkey" PRIMARY KEY ("proyecto_id","linea_id")
);

CREATE TABLE IF NOT EXISTS "proyecto_municipios" (
    "proyecto_id" TEXT NOT NULL,
    "municipio_id" TEXT NOT NULL,

    CONSTRAINT "proyecto_municipios_pkey" PRIMARY KEY ("proyecto_id","municipio_id")
);

-- 3. Adoption of a pre-existing table: every column is added only when missing.
-- On the greenfield creation path above all of these are no-ops. As in the
-- municipio migration, the NOT NULL adds are safe because the only table this
-- migration can meet is either the one it just created or an empty one; there
-- is no legacy project data to backfill.
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "codigo" TEXT NOT NULL;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "nombre" TEXT NOT NULL;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "cliente_id" TEXT NOT NULL;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "oportunidad_id" TEXT;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "responsable_id" TEXT;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "estado" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR';
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "origen" "OrigenProyecto";
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "fecha_inicio" DATE;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "fecha_fin" DATE;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "valor_total" DECIMAL(15,2);
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "diferencia_valor_oportunidad" DECIMAL(15,2);
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "beneficiarios_meta" INTEGER;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "umbrales_override" JSONB;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "programacion_pendiente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
UPDATE "proyectos" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;
ALTER TABLE "proyectos" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "proyecto_lineas" ADD COLUMN IF NOT EXISTS "proyecto_id" TEXT NOT NULL;
ALTER TABLE "proyecto_lineas" ADD COLUMN IF NOT EXISTS "linea_id" TEXT NOT NULL;
ALTER TABLE "proyecto_lineas" ADD COLUMN IF NOT EXISTS "principal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "proyecto_municipios" ADD COLUMN IF NOT EXISTS "proyecto_id" TEXT NOT NULL;
ALTER TABLE "proyecto_municipios" ADD COLUMN IF NOT EXISTS "municipio_id" TEXT NOT NULL;

-- 4. Indexes.
-- `codigo` (PRY-AAAA-NNN, generated by the later S2.2) is unique.
CREATE UNIQUE INDEX IF NOT EXISTS "proyectos_codigo_key" ON "proyectos"("codigo");

-- 1:1 with a GANADA opportunity: one project per opportunity ...
CREATE UNIQUE INDEX IF NOT EXISTS "proyectos_oportunidad_id_key" ON "proyectos"("oportunidad_id");

-- ... and the defining tuple of the composite FK must be unique for Prisma to
-- model `Oportunidad.proyecto Proyecto?` as 1:1. Redundant with the single
-- column index above, harmless, and required by the validator.
CREATE UNIQUE INDEX IF NOT EXISTS "proyectos_oportunidad_id_cliente_id_key"
  ON "proyectos"("oportunidad_id", "cliente_id");

CREATE INDEX IF NOT EXISTS "proyectos_cliente_id_idx" ON "proyectos"("cliente_id");
CREATE INDEX IF NOT EXISTS "proyectos_estado_idx" ON "proyectos"("estado");

-- DP-05: at most ONE principal line per project. Partial unique index — Prisma
-- cannot express it, and it is the only DB-level guard for the invariant.
CREATE UNIQUE INDEX IF NOT EXISTS "proyecto_lineas_principal_uq"
  ON "proyecto_lineas"("proyecto_id") WHERE "principal";

-- 5. Foreign keys, each guarded so a re-run is a no-op. Required relations use
-- Postgres's default Prisma actions (RESTRICT / CASCADE); the composite
-- opportunity relation is NoAction/NoAction exactly as declared in the schema.
DO $$ BEGIN
  ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_oportunidad_id_cliente_id_fkey"
    FOREIGN KEY ("oportunidad_id", "cliente_id") REFERENCES "oportunidades"("id", "cliente_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_responsable_id_fkey"
    FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyecto_lineas" ADD CONSTRAINT "proyecto_lineas_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyecto_lineas" ADD CONSTRAINT "proyecto_lineas_linea_id_fkey"
    FOREIGN KEY ("linea_id") REFERENCES "lineas_estrategicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyecto_municipios" ADD CONSTRAINT "proyecto_municipios_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyecto_municipios" ADD CONSTRAINT "proyecto_municipios_municipio_id_fkey"
    FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
