-- M7: the rejected-expense notification type. ALTER TYPE ... ADD VALUE cannot share a
-- transaction with a statement that uses the new value, so it lives alone. Idempotent.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'GASTO_RECHAZADO';
