-- T10 (S5, D6): una línea del presupuesto puede pertenecer a una actividad, y un proyecto puede tener
-- varias líneas del mismo rubro (una por actividad).
--
-- Las líneas heredadas (actividad_id NULL) conservan exactamente la unicidad que tenían (proyecto,
-- rubro), para que ningún proyecto cargado antes de la Parte 2 cambie de comportamiento. Las nuevas
-- (actividad_id NOT NULL) se identifican por (proyecto, actividad, rubro).
--
-- Son dos índices parciales y no un constraint porque la clave depende de si la línea es heredada;
-- Prisma no expresa índices parciales, por eso esto vive en SQL y el schema no lleva @@unique por rubro.

ALTER TABLE "lineas_presupuestales" ADD COLUMN IF NOT EXISTS "actividad_id" TEXT;

-- El índice único viejo deja de aplicar: la unicidad pasa a los dos parciales de abajo.
DROP INDEX IF EXISTS "lineas_presupuestales_proyecto_id_rubro_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "lineas_proyecto_actividad_rubro_uq"
  ON "lineas_presupuestales" ("proyecto_id", "actividad_id", "rubro_id")
  WHERE "actividad_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "lineas_proyecto_rubro_heredada_uq"
  ON "lineas_presupuestales" ("proyecto_id", "rubro_id")
  WHERE "actividad_id" IS NULL;

ALTER TABLE "lineas_presupuestales"
  ADD CONSTRAINT "lineas_presupuestales_actividad_id_proyecto_id_fkey"
  FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "lineas_presupuestales_actividad_id_idx"
  ON "lineas_presupuestales" ("actividad_id");
