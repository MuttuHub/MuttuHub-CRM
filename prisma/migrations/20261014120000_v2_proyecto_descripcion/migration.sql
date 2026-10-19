-- M3: optional free-text project description. Additive and idempotent.
ALTER TABLE "proyectos" ADD COLUMN IF NOT EXISTS "descripcion" TEXT;
