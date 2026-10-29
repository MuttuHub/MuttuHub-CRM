-- Boss requirements 2026-10-28, lane 1 task 1.0 (odd/tasks/jefe-carril-1.md). Additive only:
-- no existing row changes.
--   * `TipoCliente` gains ALIADO_ESTRATEGICO (the allies category).
--   * `clientes.etiquetas`: client tags, same catalog as tasks (`task_tags` setting); existing
--     clients get an empty list.
--   * `carpetas.cliente_id`: a client folder, at most one per client (unique; NULLs allowed, so
--     folders without a client keep working). Deleting a client only unlinks its folder.

-- AlterEnum
ALTER TYPE "TipoCliente" ADD VALUE 'ALIADO_ESTRATEGICO';

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "carpetas" ADD COLUMN     "cliente_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "carpetas_cliente_id_key" ON "carpetas"("cliente_id");

-- AddForeignKey
ALTER TABLE "carpetas" ADD CONSTRAINT "carpetas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
