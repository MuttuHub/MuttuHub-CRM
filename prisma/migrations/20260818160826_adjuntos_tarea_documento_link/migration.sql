-- AlterTable
ALTER TABLE "adjuntos_tareas" ADD COLUMN     "documento_id" TEXT;

-- AddForeignKey
ALTER TABLE "adjuntos_tareas" ADD CONSTRAINT "adjuntos_tareas_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
