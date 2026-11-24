-- Pendientes #22: indexes for the two filters every opportunity list uses (by client, by estado).
-- Additive only: no data changes.

-- CreateIndex
CREATE INDEX "oportunidades_cliente_id_idx" ON "oportunidades"("cliente_id");

-- CreateIndex
CREATE INDEX "oportunidades_estado_idx" ON "oportunidades"("estado");
