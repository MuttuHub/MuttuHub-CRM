-- T4 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S8, S9): a posición propia project has no
-- single client; its clients are linked as allies in `proyecto_clientes`.
-- Existing rows are untouched: every current project has a client, so the CHECK holds for all of them.
-- The FK `proyectos_cliente_id_fkey` keeps ON DELETE RESTRICT.

-- S8: the client is optional only for a posición propia project. `origen` is nullable, so a plain
-- `=` would yield NULL (and pass) for a row with no origin and no client: IS NOT DISTINCT FROM is
-- false there instead.
ALTER TABLE "proyectos" ALTER COLUMN "cliente_id" DROP NOT NULL;
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_cliente_por_origen_check"
  CHECK ("origen" IS NOT DISTINCT FROM 'POSICION_PROPIA' OR "cliente_id" IS NOT NULL);

-- S9: allies.
CREATE TYPE "RolAliado" AS ENUM ('FINANCIADOR', 'ALIADO', 'PROSPECTO');
CREATE TYPE "EstadoAliado" AS ENUM ('EN_GESTION', 'COMPROMETIDO', 'DESCARTADO');

CREATE TABLE "proyecto_clientes" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "rol" "RolAliado" NOT NULL,
    "estado" "EstadoAliado" NOT NULL DEFAULT 'EN_GESTION',
    "aporte_cop" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proyecto_clientes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proyecto_clientes_cliente_id_idx" ON "proyecto_clientes"("cliente_id");
CREATE UNIQUE INDEX "proyecto_clientes_proyecto_id_cliente_id_key" ON "proyecto_clientes"("proyecto_id", "cliente_id");

ALTER TABLE "proyecto_clientes" ADD CONSTRAINT "proyecto_clientes_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proyecto_clientes" ADD CONSTRAINT "proyecto_clientes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
