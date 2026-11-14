-- T12 (S6, EV-02): las actividades tienen un tipo, Normal o Transversal.
--
-- Una transversal no pertenece a ningún objetivo —«en las transversales el objetivo va vacío», S6—, así que
-- objetivo_id pasa a ser nullable. Prisma no expresa una relación compuesta opcional: todos los campos
-- escalares de la relación tendrían que ser opcionales y proyecto_id es obligatorio. Por eso la FK compuesta
-- (objetivo_id, proyecto_id) se reemplaza por una FK de una columna para la referencia y un trigger que
-- conserva exactamente la garantía que daba: el objetivo tiene que ser del mismo proyecto de la actividad.
-- El repo ya usa triggers para invariantes que el schema no expresa (rubros.codigo, lineas_estrategicas.codigo,
-- versiones_proyecto inmutable).
--
-- Las filas existentes quedan NORMAL con su objetivo intacto: esta migración no reescribe ningún dato.

CREATE TYPE "TipoActividad" AS ENUM ('NORMAL', 'TRANSVERSAL');

ALTER TABLE "actividades"
  ADD COLUMN IF NOT EXISTS "tipo" "TipoActividad" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "actividades" ALTER COLUMN "objetivo_id" DROP NOT NULL;

ALTER TABLE "actividades" DROP CONSTRAINT IF EXISTS "actividades_objetivo_id_proyecto_id_fkey";

ALTER TABLE "actividades"
  ADD CONSTRAINT "actividades_objetivo_id_fkey"
  FOREIGN KEY ("objetivo_id") REFERENCES "objetivos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE OR REPLACE FUNCTION actividades_objetivo_del_proyecto() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.objetivo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM objetivos WHERE id = NEW.objetivo_id AND proyecto_id = NEW.proyecto_id
  ) THEN
    RAISE EXCEPTION 'actividades.objetivo_id % no pertenece al proyecto %', NEW.objetivo_id, NEW.proyecto_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS actividades_objetivo_del_proyecto ON "actividades";
CREATE TRIGGER actividades_objetivo_del_proyecto
  BEFORE INSERT OR UPDATE OF "objetivo_id", "proyecto_id" ON "actividades"
  FOR EACH ROW EXECUTE FUNCTION actividades_objetivo_del_proyecto();

-- El tipo y el objetivo no pueden contradecirse: NORMAL lleva objetivo, TRANSVERSAL no.
ALTER TABLE "actividades" DROP CONSTRAINT IF EXISTS "actividades_tipo_objetivo_check";
ALTER TABLE "actividades"
  ADD CONSTRAINT "actividades_tipo_objetivo_check" CHECK (
    ("tipo" = 'NORMAL' AND "objetivo_id" IS NOT NULL) OR
    ("tipo" = 'TRANSVERSAL' AND "objetivo_id" IS NULL)
  );
