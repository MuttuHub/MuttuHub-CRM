-- CreateTable
CREATE TABLE "carpetas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "parent_id" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "carpetas_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN "carpeta_id" TEXT;

-- AlterTable
ALTER TABLE "documento_versiones" ADD COLUMN "contenido_texto" TEXT;
ALTER TABLE "documento_versiones" ADD COLUMN "texto_estado" TEXT;

-- CreateIndex
CREATE INDEX "carpetas_parent_id_idx" ON "carpetas"("parent_id");
CREATE INDEX "documentos_deleted_at_created_at_idx" ON "documentos"("deleted_at", "created_at");
CREATE INDEX "documentos_carpeta_id_idx" ON "documentos"("carpeta_id");
CREATE INDEX "documentos_clientes_cliente_id_idx" ON "documentos_clientes"("cliente_id");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_carpeta_id_fkey" FOREIGN KEY ("carpeta_id") REFERENCES "carpetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "carpetas" ADD CONSTRAINT "carpetas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "carpetas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FTS: índice GIN por expresión (Prisma no modela índices por expresión, vive solo acá).
-- La query debe usar esta expresión byte a byte idéntica o el planner lo ignora.
CREATE INDEX documento_versiones_contenido_fts_idx ON documento_versiones
  USING GIN (to_tsvector('spanish', coalesce(contenido_texto, '')));