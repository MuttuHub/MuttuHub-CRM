-- B6 (odd/tasks/producto-pendientes-2026-11.md, S1, decision L7 «Bloquear»): a catalogue rubro can be
-- switched off for ONE project. Additive: one new table with a composite primary key and two FKs; no
-- existing row changes, the global catalogue (`rubros.activo`) is untouched.
--
-- A row means «this rubro is disabled in this project». The application inserts it only while the
-- rubro's lines in the project are at $0 and it has no expenses there (checked under the project row
-- lock), and deletes it to re-enable. `created_by_id` is an audit pointer without FK, like
-- `auditoria_cambios.usuario_id`.
--
-- Revert: DROP TABLE "proyecto_rubros_deshabilitados";

-- CreateTable
CREATE TABLE "proyecto_rubros_deshabilitados" (
    "proyecto_id" TEXT NOT NULL,
    "rubro_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "proyecto_rubros_deshabilitados_pkey" PRIMARY KEY ("proyecto_id","rubro_id")
);

-- CreateIndex
CREATE INDEX "proyecto_rubros_deshabilitados_rubro_id_idx" ON "proyecto_rubros_deshabilitados"("rubro_id");

-- AddForeignKey
ALTER TABLE "proyecto_rubros_deshabilitados" ADD CONSTRAINT "proyecto_rubros_deshabilitados_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_rubros_deshabilitados" ADD CONSTRAINT "proyecto_rubros_deshabilitados_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

