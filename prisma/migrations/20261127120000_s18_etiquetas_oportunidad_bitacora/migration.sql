-- S18: optional tags on opportunities and bitácora entries, from the same admin catalogue as clients, tasks
-- and projects (`task_tags` setting). Additive: existing rows end with an empty list.
ALTER TABLE "oportunidades" ADD COLUMN "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "bitacora_entradas" ADD COLUMN "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
