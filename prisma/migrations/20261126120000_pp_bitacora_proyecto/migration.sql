-- T8 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S16): a bitácora entry can name the project the
-- interaction was about, so the project report can show «las últimas interacciones con cada aliado sobre
-- este proyecto». Additive: one nullable column, its index and one FK. No existing row changes (every
-- current entry keeps proyecto_id NULL).
--
-- The FK goes to `proyectos(id)` only, NO ACTION like `tareas.proyecto_id`. A composite FK to
-- `proyecto_clientes(proyecto_id, cliente_id)` would also pin «the client is an ally», but it would block
-- removing an ally that has entries; the API checks the ally instead, and an entry keeps its project
-- after the ally is removed (entries are immutable history).
--
-- Revert: ALTER TABLE "bitacora_entradas" DROP CONSTRAINT "bitacora_entradas_proyecto_id_fkey";
--         DROP INDEX "bitacora_entradas_proyecto_id_idx";
--         ALTER TABLE "bitacora_entradas" DROP COLUMN "proyecto_id";

-- AlterTable
ALTER TABLE "bitacora_entradas" ADD COLUMN "proyecto_id" TEXT;

-- CreateIndex
CREATE INDEX "bitacora_entradas_proyecto_id_idx" ON "bitacora_entradas"("proyecto_id");

-- AddForeignKey
ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "bitacora_entradas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
