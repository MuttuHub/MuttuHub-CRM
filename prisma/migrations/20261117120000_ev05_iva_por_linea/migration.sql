-- EV-05 (Propuesto, aceptado en D4): «el IVA de cada línea se calcula en proporción a su subtotal y se puede
-- corregir».
--
-- Una columna NUEVA y nulable sobre `gastos_reparto`:
--   * `iva` — el IVA que le toca a esa línea de la factura. NULL = la fila se escribió antes de esta
--             migración y su IVA se lee en proporción a su valor (la misma regla con que se escribe ahora).
--
-- Puramente aditiva: ninguna columna existente cambia, no se toca ningún dato, no hay DEFAULT ni backfill.
-- El CHECK solo rechaza un IVA negativo; que no supere el valor de la línea y que las líneas sumen el IVA de
-- la factura lo valida la aplicación (`repartirIva`). Revertir es
-- `ALTER TABLE "gastos_reparto" DROP CONSTRAINT "gastos_reparto_iva_no_negativo", DROP COLUMN "iva"`.

ALTER TABLE "gastos_reparto" ADD COLUMN "iva" DECIMAL(15,2);

ALTER TABLE "gastos_reparto"
  ADD CONSTRAINT "gastos_reparto_iva_no_negativo" CHECK ("iva" IS NULL OR "iva" >= 0);
