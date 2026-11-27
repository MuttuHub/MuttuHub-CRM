-- V2 (odd/tasks/producto-pendientes-2026-11.md, S2, decision L6 «Campo proyecto_id»): a task can link
-- directly to a project. Additive: one nullable column, one extra unique key on `proyectos` (its `id` is
-- already unique, so no existing row can collide) and two FKs. The only row change is the backfill below.
--
-- Consistency: when a task has both `oportunidad_id` and `proyecto_id`, the project must be that
-- opportunity's project. Enforced declaratively by the composite FK
-- (proyecto_id, oportunidad_id) -> proyectos(id, oportunidad_id), the same technique as the D1 FK
-- (oportunidad_id, cliente_id) -> oportunidades(id, cliente_id). MATCH SIMPLE skips the check when
-- either column is NULL: a task with no opportunity can link any project, and a task with no project
-- is untouched. An INDEPENDIENTE project (oportunidad_id NULL) never matches a task that has one.
--
-- Revert: ALTER TABLE "tareas" DROP CONSTRAINT "tareas_proyecto_id_oportunidad_id_fkey";
--         ALTER TABLE "tareas" DROP CONSTRAINT "tareas_proyecto_id_fkey";
--         DROP INDEX "tareas_proyecto_id_idx";
--         DROP INDEX "proyectos_id_oportunidad_id_key";
--         ALTER TABLE "tareas" DROP COLUMN "proyecto_id";

-- AlterTable
ALTER TABLE "tareas" ADD COLUMN "proyecto_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_id_oportunidad_id_key" ON "proyectos"("id", "oportunidad_id");

-- CreateIndex
CREATE INDEX "tareas_proyecto_id_idx" ON "tareas"("proyecto_id");

-- Backfill: tasks of opportunities that were ALREADY converted join their project, with the same rule
-- as the conversion route: open and completed tasks (every state but CANCELADA), non-deleted; a
-- soft-deleted project is skipped.
-- Runs before the FKs, and every value it writes satisfies both of them by construction.
UPDATE "tareas" AS t
SET "proyecto_id" = p."id"
FROM "proyectos" AS p
WHERE p."oportunidad_id" = t."oportunidad_id"
  AND p."deleted_at" IS NULL
  AND t."deleted_at" IS NULL
  AND t."estado" <> 'CANCELADA'
  AND t."proyecto_id" IS NULL;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_proyecto_id_oportunidad_id_fkey" FOREIGN KEY ("proyecto_id", "oportunidad_id") REFERENCES "proyectos"("id", "oportunidad_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
