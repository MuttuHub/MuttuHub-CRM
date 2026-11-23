-- T1 (S1): project tags, from the same admin catalogue as clients and tasks (`task_tags` setting).
-- Additive: existing projects end with an empty list.
ALTER TABLE "proyectos" ADD COLUMN "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
