-- RF-06 (proyecto-legalizacion-tab): additive legalization traceability on gastos.
-- estado_legalizacion is derived in the API, never stored.

-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "numero_comprobante" TEXT,
ADD COLUMN     "observacion" TEXT,
ADD COLUMN     "observado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tercero" TEXT;
