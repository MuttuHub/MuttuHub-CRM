-- DropIndex
DROP INDEX "auditoria_created_at_idx";

-- CreateIndex
CREATE INDEX "auditoria_created_at_id_idx" ON "auditoria"("created_at", "id");

-- CreateIndex
CREATE INDEX "auditoria_entidad_created_at_id_idx" ON "auditoria"("entidad", "created_at", "id");
