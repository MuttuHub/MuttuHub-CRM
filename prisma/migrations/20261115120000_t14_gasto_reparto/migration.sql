-- T14 (S9, EV-05): factura distribuida. La cabecera sigue siendo `gastos` (tercero, documento,
-- soportes, periodo, estado); el reparto del total entre actividades+rubro vive en `gastos_reparto`,
-- una fila por línea. La suma de las filas de un gasto es su `monto_cop`.
--
-- Riesgo 1 (datos existentes): cada gasto se convierte en una factura con UNA fila de reparto que
-- reproduce su `linea_id` y su `monto_cop`. No se altera ninguna columna de `gastos`; `linea_id`
-- sigue NOT NULL porque los lectores del ejecutado lo usan hasta T14.2-B.
--
-- `proyecto_id` se repite a propósito (igual que en `programacion_periodo`): permite las dos claves
-- compuestas y hace imposible que la línea del reparto o el propio gasto queden en otro proyecto.
-- Revertir es `DROP TABLE "gastos_reparto"`: no toca ninguna otra tabla.

CREATE TABLE "gastos_reparto" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "gasto_id" TEXT NOT NULL,
    "linea_id" TEXT NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_reparto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gastos_reparto_gasto_id_idx" ON "gastos_reparto"("gasto_id");
CREATE INDEX "gastos_reparto_linea_id_idx" ON "gastos_reparto"("linea_id");
CREATE INDEX "gastos_reparto_proyecto_id_idx" ON "gastos_reparto"("proyecto_id");

-- Un reparto en cero no reparte nada; mismo criterio que `gastos_monto_positivo_ck`.
ALTER TABLE "gastos_reparto" ADD CONSTRAINT "gastos_reparto_valor_positivo_ck" CHECK ("valor" > 0);

-- Backfill: una factura de una sola línea. `id` se genera aquí porque Prisma lo genera en el cliente.
INSERT INTO "gastos_reparto" ("id", "proyecto_id", "gasto_id", "linea_id", "valor", "created_at", "updated_at")
SELECT gen_random_uuid()::text, g."proyecto_id", g."id", g."linea_id", g."monto_cop", now(), now()
  FROM "gastos" g;

ALTER TABLE "gastos_reparto" ADD CONSTRAINT "gastos_reparto_gasto_id_proyecto_id_fkey"
  FOREIGN KEY ("gasto_id", "proyecto_id") REFERENCES "gastos"("id", "proyecto_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gastos_reparto" ADD CONSTRAINT "gastos_reparto_linea_id_proyecto_id_fkey"
  FOREIGN KEY ("linea_id", "proyecto_id") REFERENCES "lineas_presupuestales"("id", "proyecto_id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
