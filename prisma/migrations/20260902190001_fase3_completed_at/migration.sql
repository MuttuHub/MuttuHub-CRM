-- Plan Fase 3 (3B): completed_at = la marca REAL de cierre.
-- Aditiva y nullable. Backfill que CONGELA el proxy histórico (updated_at)
-- en lugar de dejarlo derivar: las COMPLETADA existentes copian su
-- updated_at, así el reporte deja de volverse retroactivamente "tarde"
-- cuando alguien renombra/comenta una tarea ya cerrada.
ALTER TABLE "tareas" ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "tareas" SET "completed_at" = "updated_at" WHERE "estado" = 'COMPLETADA';