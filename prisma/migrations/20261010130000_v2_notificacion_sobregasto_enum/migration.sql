-- S6 U4: the overspend notification type. ALTER TYPE ... ADD VALUE cannot share a
-- transaction with a statement that uses the new value, so it lives alone in its own
-- migration (the columns that use it come in the next one). Idempotent.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOBREGASTO_RUBRO';
