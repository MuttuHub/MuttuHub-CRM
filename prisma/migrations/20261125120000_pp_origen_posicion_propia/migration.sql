-- T4 (odd/tasks/reportes-etiqueta-y-posicion-propia.md, S8): the «posición propia» project origin.
-- ALTER TYPE ... ADD VALUE cannot share a transaction with a statement that uses the new value
-- (the CHECK in the next migration), so it lives alone. Additive and idempotent.
ALTER TYPE "OrigenProyecto" ADD VALUE IF NOT EXISTS 'POSICION_PROPIA';
