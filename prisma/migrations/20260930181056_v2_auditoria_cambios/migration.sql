-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREAR', 'EDITAR', 'IMPORTAR', 'APROBAR', 'VALIDAR', 'RECHAZAR', 'SUSPENDER', 'CAMBIAR_PARAMETRO', 'ANULAR', 'SOLICITAR', 'EXPORTAR', 'CONVERTIR');

-- CreateTable
CREATE TABLE "auditoria_cambios" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "proyecto_id" TEXT,
    "campo" TEXT,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "lote_id" TEXT,

    CONSTRAINT "auditoria_cambios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_cambios_proyecto_id_created_at_idx" ON "auditoria_cambios"("proyecto_id", "created_at");

-- CreateIndex
CREATE INDEX "auditoria_cambios_entidad_entidad_id_idx" ON "auditoria_cambios"("entidad", "entidad_id");

-- RenameForeignKey
ALTER TABLE "bitacora_entradas" RENAME CONSTRAINT "bitacora_oportunidad_cliente_fkey" TO "bitacora_entradas_oportunidad_id_cliente_id_fkey";

-- RenameForeignKey
ALTER TABLE "tareas" RENAME CONSTRAINT "tareas_oportunidad_cliente_fkey" TO "tareas_oportunidad_id_cliente_id_fkey";

-- RF-04 / RNF-05 (REQ-AUD-02): la aplicación no debe poder alterar el libro.
-- UPDATE, DELETE y TRUNCATE se rechazan a nivel de base de datos.
-- La misma función se reutilizará en `versiones_proyecto` (S8.1) y
-- `acceso_soportes` (S6.5).
CREATE OR REPLACE FUNCTION auditoria_cambios_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria_cambios es de solo escritura';
END $$;

CREATE TRIGGER auditoria_cambios_no_update_delete
  BEFORE UPDATE OR DELETE ON auditoria_cambios
  FOR EACH ROW EXECUTE FUNCTION auditoria_cambios_inmutable();

CREATE TRIGGER auditoria_cambios_no_truncate
  BEFORE TRUNCATE ON auditoria_cambios
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_cambios_inmutable();
