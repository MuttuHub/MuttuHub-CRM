-- v2 projects module — project-origin documents (decided 2026-10-17, pre-launch).
--
-- The Documentos tab of the project ficha lets the team attach general project documents
-- (contract, agreement, kickoff minutes) as a file or a link. Such a soporte belongs to the
-- project itself, so it has no avance, medicion or gasto parent. Until now
-- `soportes_proyecto_padre_check` required exactly one parent and rejected those rows.
-- It now allows at most one: zero parents means origin "proyecto", and a row with two or more
-- parents is still rejected. Same constraint name, so the invariant tests keep asserting it.
--
-- Idempotent: dropping and re-adding the constraint is safe to re-run.

ALTER TABLE "soportes_proyecto" DROP CONSTRAINT IF EXISTS "soportes_proyecto_padre_check";
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_proyecto_padre_check"
  CHECK (num_nonnulls("avance_id", "medicion_id", "gasto_id") <= 1);
