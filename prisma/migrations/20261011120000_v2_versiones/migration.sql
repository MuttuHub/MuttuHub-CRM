-- S8 U1: baseline/modification versions. The snapshot is immutable (own trigger function, like acceso_soportes).
-- CreateEnum
CREATE TYPE "TipoVersion" AS ENUM ('LINEA_BASE', 'MODIFICACION');

-- CreateEnum
CREATE TYPE "TipoModificacion" AS ENUM ('TRASLADO', 'ADICION', 'REDUCCION', 'REPROGRAMACION', 'CRONOGRAMA', 'ENTREGABLES');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "versiones_proyecto" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoVersion" NOT NULL,
    "solicitud_id" TEXT,
    "aprobado_por_id" TEXT NOT NULL,
    "aprobado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "versiones_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_modificacion" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "tipo" "TipoModificacion" NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "version_base_numero" INTEGER NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por_id" TEXT NOT NULL,
    "solicitado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_por_id" TEXT,
    "decidido_at" TIMESTAMP(3),
    "comentario_decision" TEXT,

    CONSTRAINT "solicitudes_modificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_proyecto_solicitud_id_key" ON "versiones_proyecto"("solicitud_id");

-- CreateIndex
CREATE INDEX "versiones_proyecto_proyecto_id_idx" ON "versiones_proyecto"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "versiones_proyecto_proyecto_id_numero_key" ON "versiones_proyecto"("proyecto_id", "numero");

-- CreateIndex
CREATE INDEX "solicitudes_modificacion_proyecto_id_estado_idx" ON "solicitudes_modificacion"("proyecto_id", "estado");

-- AddForeignKey
ALTER TABLE "versiones_proyecto" ADD CONSTRAINT "versiones_proyecto_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_proyecto" ADD CONSTRAINT "versiones_proyecto_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_modificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_modificacion" ADD CONSTRAINT "solicitudes_modificacion_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants Prisma cannot express.
ALTER TABLE "versiones_proyecto"
  ADD CONSTRAINT "versiones_proyecto_numero_ck" CHECK ("numero" >= 0),
  ADD CONSTRAINT "versiones_proyecto_tipo_numero_ck" CHECK (("tipo" = 'LINEA_BASE') = ("numero" = 0)),
  ADD CONSTRAINT "versiones_proyecto_solicitud_ck" CHECK (("tipo" = 'MODIFICACION') = ("solicitud_id" IS NOT NULL));

ALTER TABLE "solicitudes_modificacion"
  ADD CONSTRAINT "solicitudes_modificacion_version_base_ck" CHECK ("version_base_numero" >= 0),
  ADD CONSTRAINT "solicitudes_modificacion_detalle_ck" CHECK (jsonb_typeof("detalle") = 'array'),
  ADD CONSTRAINT "solicitudes_modificacion_rechazo_comentario_ck"
    CHECK ("estado" <> 'RECHAZADA' OR length(trim(coalesce("comentario_decision", ''))) > 0),
  ADD CONSTRAINT "solicitudes_modificacion_decision_ck"
    CHECK ("estado" = 'PENDIENTE' OR ("decidido_por_id" IS NOT NULL AND "decidido_at" IS NOT NULL));

-- Its own function: a version is a frozen snapshot, never edited, deleted or truncated.
CREATE OR REPLACE FUNCTION versiones_proyecto_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'versiones_proyecto es inmutable';
END $$;

DROP TRIGGER IF EXISTS versiones_proyecto_no_update_delete ON "versiones_proyecto";
CREATE TRIGGER versiones_proyecto_no_update_delete
  BEFORE UPDATE OR DELETE ON "versiones_proyecto"
  FOR EACH ROW EXECUTE FUNCTION versiones_proyecto_inmutable();

DROP TRIGGER IF EXISTS versiones_proyecto_no_truncate ON "versiones_proyecto";
CREATE TRIGGER versiones_proyecto_no_truncate
  BEFORE TRUNCATE ON "versiones_proyecto"
  FOR EACH STATEMENT EXECUTE FUNCTION versiones_proyecto_inmutable();
