-- v2 projects module — expense Subtotal + IVA = Total (AJ-04, PO document v1.1, 2026-10-28).
--
-- `monto_cop` stays the expense TOTAL: every executed-amount aggregate (E, overspend alert,
-- queues, KPIs) keeps summing it unchanged. This migration only splits it into `subtotal_cop`
-- and `iva_cop`. Existing rows are backfilled with subtotal = monto_cop and iva = 0, so no
-- stored total changes. The database then enforces the arithmetic itself:
--   monto_cop = subtotal_cop + iva_cop, iva_cop >= 0, subtotal_cop > 0.
-- `iva_cop` may be 0 (for example natural-person payment accounts not responsible for IVA).
--
-- Idempotent: every statement is IF NOT EXISTS, a guarded backfill, or wrapped in a
-- duplicate_object block, so re-running it is safe.

ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "subtotal_cop" DECIMAL(15,2);
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "iva_cop" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Backfill: every pre-existing expense had no IVA, so its subtotal is its total.
UPDATE "gastos" SET "subtotal_cop" = "monto_cop" WHERE "subtotal_cop" IS NULL;

ALTER TABLE "gastos" ALTER COLUMN "subtotal_cop" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_iva_no_negativo_ck" CHECK ("iva_cop" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_subtotal_positivo_ck" CHECK ("subtotal_cop" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "gastos" ADD CONSTRAINT "gastos_total_cuadra_ck"
    CHECK ("monto_cop" = "subtotal_cop" + "iva_cop");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
