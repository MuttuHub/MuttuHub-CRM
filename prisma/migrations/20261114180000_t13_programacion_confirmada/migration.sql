-- T13 (S7, EV-03): el Gestor confirma la programación cuando «Falta por programar» queda en $0 en todas
-- las líneas; después el Gerente aprueba la línea base. Se guarda cuándo y quién confirmó.
--
-- Solo agrega dos columnas nulas: ninguna fila existente cambia. Un proyecto ya aprobado no necesita la
-- marca (la exige solo la aprobación de la línea base, que ya ocurrió).

ALTER TABLE "proyectos"
  ADD COLUMN IF NOT EXISTS "programacion_confirmada_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "programacion_confirmada_por_id" TEXT;

ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_programacion_confirmada_por_id_fkey"
  FOREIGN KEY ("programacion_confirmada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
