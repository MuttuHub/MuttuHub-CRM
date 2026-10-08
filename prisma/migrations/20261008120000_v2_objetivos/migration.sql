-- Adoptive + idempotent migration (S3 U1, SDD §4.8): project objectives.
--
-- Soft-deleted through `deleted_at`. The partial unique index
-- `objetivos_codigo_activo_uq` makes the code unique per project, ignoring case,
-- among live rows; Prisma cannot express it, so it is hand-written here and is
-- the only DB-level guard. `(id, proyecto_id)` is unique so activities and
-- indicators can reference an objective through a composite foreign key that
-- makes a cross-project reference impossible.

CREATE TABLE IF NOT EXISTS "objetivos" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "objetivos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "objetivos_proyecto_id_idx" ON "objetivos"("proyecto_id");
CREATE UNIQUE INDEX IF NOT EXISTS "objetivos_id_proyecto_id_key" ON "objetivos"("id", "proyecto_id");

-- At most ONE live objective per (proyecto, codigo ignoring case).
CREATE UNIQUE INDEX IF NOT EXISTS "objetivos_codigo_activo_uq"
  ON "objetivos"("proyecto_id", lower("codigo")) WHERE "deleted_at" IS NULL;

DO $$ BEGIN
  ALTER TABLE "objetivos" ADD CONSTRAINT "objetivos_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
