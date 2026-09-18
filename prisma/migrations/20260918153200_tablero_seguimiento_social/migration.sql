-- CreateEnum
CREATE TYPE "LineaEstrategica" AS ENUM ('EMPLEABILIDAD', 'EMPRENDIMIENTO', 'PRODUCTIVIDAD', 'CULTURAL', 'SOCIAL', 'CIVICO_POLITICO', 'METODO_MUTTU', 'AMBIENTAL');

-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('PLANIFICACION', 'EN_EJECUCION', 'SUSPENDIDO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoSoporte" AS ENUM ('VERIFICACION', 'LEGALIZACION');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "puede_ver_tablero_gerencial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "oportunidad_id" TEXT,
    "territorio" TEXT NOT NULL,
    "linea_estrategica" "LineaEstrategica" NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'PLANIFICACION',
    "beneficiarios_meta" INTEGER NOT NULL DEFAULT 0,
    "responsable_id" TEXT NOT NULL,
    "umbrales_override" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividades" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "meta_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "fecha_planificada" TIMESTAMP(3) NOT NULL,
    "fecha_real" TIMESTAMP(3),
    "porcentaje_avance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "actividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubros" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_presupuestales" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "rubro_id" TEXT NOT NULL,
    "monto_proyectado_cop" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lineas_presupuestales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto_cop" DECIMAL(15,2) NOT NULL,
    "fecha_gasto" TIMESTAMP(3) NOT NULL,
    "registrado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "meta_id" TEXT,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "meta_valor" DECIMAL(15,2) NOT NULL,
    "valor_actual" DECIMAL(15,2),
    "cuenta_beneficiarios" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "indicadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soportes_proyecto" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "actividad_id" TEXT,
    "gasto_id" TEXT,
    "tipo" "TipoSoporte" NOT NULL,
    "nombre" TEXT NOT NULL,
    "storage_path" TEXT,
    "url_externa" TEXT,
    "tamano_bytes" INTEGER,
    "documento_id" TEXT,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "soportes_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_codigo_key" ON "proyectos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_oportunidad_id_key" ON "proyectos"("oportunidad_id");

-- CreateIndex
CREATE INDEX "proyectos_cliente_id_estado_idx" ON "proyectos"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "proyectos_deleted_at_idx" ON "proyectos"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_oportunidad_id_cliente_id_key" ON "proyectos"("oportunidad_id", "cliente_id");

-- CreateIndex
CREATE INDEX "metas_proyecto_id_idx" ON "metas"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "metas_id_proyecto_id_key" ON "metas"("id", "proyecto_id");

-- CreateIndex
CREATE INDEX "actividades_proyecto_id_fecha_planificada_idx" ON "actividades"("proyecto_id", "fecha_planificada");

-- CreateIndex
CREATE INDEX "actividades_meta_id_idx" ON "actividades"("meta_id");

-- CreateIndex
CREATE INDEX "actividades_deleted_at_idx" ON "actividades"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "actividades_id_proyecto_id_key" ON "actividades"("id", "proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "rubros_nombre_key" ON "rubros"("nombre");

-- CreateIndex
CREATE INDEX "lineas_presupuestales_proyecto_id_idx" ON "lineas_presupuestales"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineas_presupuestales_proyecto_id_rubro_id_key" ON "lineas_presupuestales"("proyecto_id", "rubro_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineas_presupuestales_id_proyecto_id_key" ON "lineas_presupuestales"("id", "proyecto_id");

-- CreateIndex
CREATE INDEX "gastos_proyecto_id_fecha_gasto_idx" ON "gastos"("proyecto_id", "fecha_gasto");

-- CreateIndex
CREATE INDEX "gastos_linea_id_idx" ON "gastos"("linea_id");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_id_proyecto_id_key" ON "gastos"("id", "proyecto_id");

-- CreateIndex
CREATE INDEX "indicadores_proyecto_id_idx" ON "indicadores"("proyecto_id");

-- CreateIndex
CREATE INDEX "soportes_proyecto_proyecto_id_idx" ON "soportes_proyecto"("proyecto_id");

-- CreateIndex
CREATE INDEX "soportes_proyecto_actividad_id_idx" ON "soportes_proyecto"("actividad_id");

-- CreateIndex
CREATE INDEX "soportes_proyecto_gasto_id_idx" ON "soportes_proyecto"("gasto_id");

-- RenameForeignKey
ALTER TABLE "bitacora_entradas" RENAME CONSTRAINT "bitacora_oportunidad_cliente_fkey" TO "bitacora_entradas_oportunidad_id_cliente_id_fkey";

-- RenameForeignKey
ALTER TABLE "tareas" RENAME CONSTRAINT "tareas_oportunidad_cliente_fkey" TO "tareas_oportunidad_id_cliente_id_fkey";

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_oportunidad_id_cliente_id_fkey" FOREIGN KEY ("oportunidad_id", "cliente_id") REFERENCES "oportunidades"("id", "cliente_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_meta_id_proyecto_id_fkey" FOREIGN KEY ("meta_id", "proyecto_id") REFERENCES "metas"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_presupuestales_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_presupuestales_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_linea_id_proyecto_id_fkey" FOREIGN KEY ("linea_id", "proyecto_id") REFERENCES "lineas_presupuestales"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_meta_id_proyecto_id_fkey" FOREIGN KEY ("meta_id", "proyecto_id") REFERENCES "metas"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_actividad_id_proyecto_id_fkey" FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_gasto_id_proyecto_id_fkey" FOREIGN KEY ("gasto_id", "proyecto_id") REFERENCES "gastos"("id", "proyecto_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- tablero-seguimiento-social — hand-written CHECK constraints, catalog seed
-- and settings row (Prisma does not model CHECK, and the seeds are business
-- data, not schema — none of this is auto-generated).

-- D2/RF-02: pertenencia actividad -> meta dentro del mismo proyecto.
-- meta_id y proyecto_id son ambos NOT NULL, así que el hueco de MATCH
-- SIMPLE (el que obligó al CHECK en `tareas`) no puede existir: la FK
-- compuesta arriba se evalúa siempre. Los CHECK de abajo cubren el dominio,
-- no la pertenencia.
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_peso_positivo"
  CHECK ("peso" > 0);
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_avance_rango"
  CHECK ("porcentaje_avance" BETWEEN 0 AND 100);

-- D8: archivo XOR enlace externo. Exactamente uno no nulo.
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_archivo_xor_url"
  CHECK ( (("storage_path" IS NOT NULL)::int + ("url_externa" IS NOT NULL)::int) = 1 );
-- Defensa en profundidad del esquema https (la validación zod es la primera línea).
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_url_https"
  CHECK ("url_externa" IS NULL OR "url_externa" LIKE 'https://%');
-- Un soporte cuelga del proyecto, o de una actividad, o de un gasto: nunca de ambos.
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_destino_unico"
  CHECK (NOT ("actividad_id" IS NOT NULL AND "gasto_id" IS NOT NULL));

ALTER TABLE "gastos" ADD CONSTRAINT "gastos_monto_positivo" CHECK ("monto_cop" > 0);
ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_monto_no_negativo"
  CHECK ("monto_proyectado_cop" >= 0);

-- D5: catálogo inicial de rubros (los del documento de origen). Idempotente.
INSERT INTO "rubros" ("id", "nombre", "orden", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'Personal', 1, now(), now()),
       (gen_random_uuid(), 'Transporte', 2, now(), now()),
       (gen_random_uuid(), 'Material POP', 3, now(), now()),
       (gen_random_uuid(), 'Operación logística', 4, now(), now())
ON CONFLICT ("nombre") DO NOTHING;

-- D10/T5: fila de parámetros por defecto, CONFIRMADA por el negocio el
-- 2026-09-18 (ver proposal.md D10 y design.md T5/T6).
INSERT INTO "settings" ("id", "key", "value", "updated_at", "created_at")
VALUES (gen_random_uuid(), 'semaforo_umbrales',
        '{"confirmado":true,
          "tecnico":{"verde":0.85,"rojo":0.60},
          "financiero":{"verde_min":0.85,"verde_max":1.15,"amarillo_min":0.60,"amarillo_max":1.40}}'::jsonb,
        now(), now())
ON CONFLICT ("key") DO NOTHING;
