-- Adoptive + idempotent migration (S6 U2, SDD §3.9, RF-20..22, RNF-04): expenses, the
-- expense parent of project supports, and the append-only support access log.
-- Production state is unknown, so every statement is IF NOT EXISTS or wrapped in a
-- duplicate_object block. The `SOBREGASTO_RUBRO` notification enum value and the
-- notification columns belong to a later migration (U4): ADD VALUE cannot share a
-- transaction with its use.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "EstadoGasto" AS ENUM ('REGISTRADO', 'VALIDADO', 'RECHAZADO', 'ANULADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoSoporteGasto" AS ENUM ('FACTURA_PROVEEDOR', 'CUENTA_COBRO_PERSONA_NATURAL', 'OTRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoIdentificacion" AS ENUM ('NIT', 'CC', 'CE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. gastos
CREATE TABLE IF NOT EXISTS "gastos" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "fecha_documento" DATE NOT NULL,
    "periodo" CHAR(7) NOT NULL,
    "tipo_soporte" "TipoSoporteGasto" NOT NULL,
    "tercero_nombre" TEXT NOT NULL,
    "tercero_tipo_id" "TipoIdentificacion",
    "tercero_numero_id" TEXT,
    "tercero_id_norm" TEXT,
    "numero_documento" TEXT NOT NULL,
    "numero_documento_norm" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto_cop" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoGasto" NOT NULL DEFAULT 'REGISTRADO',
    "alerta_sobregasto" BOOLEAN NOT NULL DEFAULT false,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "validado_por_id" TEXT,
    "validado_at" TIMESTAMP(3),
    "rechazado_por_id" TEXT,
    "rechazado_at" TIMESTAMP(3),
    "motivo_rechazo" TEXT,
    "anulado_por_id" TEXT,
    "anulado_at" TIMESTAMP(3),
    "motivo_anulacion" TEXT,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gastos_id_proyecto_id_key" ON "gastos"("id", "proyecto_id");
CREATE INDEX IF NOT EXISTS "gastos_proyecto_id_estado_periodo_idx" ON "gastos"("proyecto_id", "estado", "periodo");
CREATE INDEX IF NOT EXISTS "gastos_linea_id_estado_idx" ON "gastos"("linea_id", "estado");
CREATE INDEX IF NOT EXISTS "gastos_tercero_id_norm_numero_documento_norm_idx"
  ON "gastos"("tercero_id_norm", "numero_documento_norm");
CREATE INDEX IF NOT EXISTS "gastos_estado_created_at_idx" ON "gastos"("estado", "created_at");

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_monto_positivo_ck" CHECK ("monto_cop" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_periodo_ck"
    CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_validador_ck"
    CHECK ("validado_por_id" IS NULL OR "validado_por_id" <> "registrado_por_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_rechazo_ck"
    CHECK ("estado" <> 'RECHAZADO' OR ("motivo_rechazo" IS NOT NULL AND "rechazado_por_id" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_rechazador_ck"
    CHECK ("rechazado_por_id" IS NULL OR "rechazado_por_id" <> "registrado_por_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- N-15 at database level: a VALIDADO expense carries its validator, date and the third-party id.
DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_validado_ck"
    CHECK ("estado" <> 'VALIDADO' OR (
      "validado_por_id" IS NOT NULL AND "validado_at" IS NOT NULL
      AND "tercero_tipo_id" IS NOT NULL AND "tercero_numero_id" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_anulado_ck"
    CHECK (("estado" = 'ANULADO') = ("anulado_at" IS NOT NULL)
      AND num_nonnulls("anulado_at", "anulado_por_id", "motivo_anulacion") IN (0, 3));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_linea_id_proyecto_id_fkey"
    FOREIGN KEY ("linea_id", "proyecto_id") REFERENCES "lineas_presupuestales"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. soportes_proyecto: the expense becomes a third possible parent.
ALTER TABLE "soportes_proyecto" ADD COLUMN IF NOT EXISTS "gasto_id" TEXT;
CREATE INDEX IF NOT EXISTS "soportes_proyecto_gasto_id_idx" ON "soportes_proyecto"("gasto_id");

DO $$ BEGIN
  ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_gasto_id_proyecto_id_fkey"
    FOREIGN KEY ("gasto_id", "proyecto_id") REFERENCES "gastos"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Same constraint name (the S4 invariant test asserts it), now with three parents.
ALTER TABLE "soportes_proyecto" DROP CONSTRAINT IF EXISTS "soportes_proyecto_padre_check";
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_padre_check"
  CHECK (num_nonnulls("avance_id", "medicion_id", "gasto_id") = 1);

-- 4. acceso_soportes: append-only log of issued downloads.
CREATE TABLE IF NOT EXISTS "acceso_soportes" (
    "id" TEXT NOT NULL,
    "soporte_id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceso_soportes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "acceso_soportes_proyecto_id_created_at_idx" ON "acceso_soportes"("proyecto_id", "created_at");
CREATE INDEX IF NOT EXISTS "acceso_soportes_soporte_id_idx" ON "acceso_soportes"("soporte_id");

DO $$ BEGIN
  ALTER TABLE "acceso_soportes" ADD CONSTRAINT "acceso_soportes_soporte_id_fkey"
    FOREIGN KEY ("soporte_id") REFERENCES "soportes_proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Its own function: the audit ledger one raises a message naming auditoria_cambios.
CREATE OR REPLACE FUNCTION acceso_soportes_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'acceso_soportes es de solo escritura';
END $$;

DROP TRIGGER IF EXISTS acceso_soportes_no_update_delete ON "acceso_soportes";
CREATE TRIGGER acceso_soportes_no_update_delete
  BEFORE UPDATE OR DELETE ON "acceso_soportes"
  FOR EACH ROW EXECUTE FUNCTION acceso_soportes_inmutable();

DROP TRIGGER IF EXISTS acceso_soportes_no_truncate ON "acceso_soportes";
CREATE TRIGGER acceso_soportes_no_truncate
  BEFORE TRUNCATE ON "acceso_soportes"
  FOR EACH STATEMENT EXECUTE FUNCTION acceso_soportes_inmutable();
