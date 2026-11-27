-- V8 (odd/tasks/producto-pendientes-2026-11.md, S4): the «sin contacto» notification type.
-- ALTER TYPE ... ADD VALUE cannot share a transaction with a statement that uses the new value,
-- so it lives alone in its own migration (the column that keys it comes in the next one).
-- Additive and idempotent.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SIN_CONTACTO';
