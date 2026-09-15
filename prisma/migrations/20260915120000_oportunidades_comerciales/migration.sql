-- oportunidades-comerciales (PR 1): additive, reversible. Every new column is
-- nullable or defaulted, so the Kanban and existing CRM routes keep working
-- with zero code changes until Phase 2+ lands.

-- FaseOportunidad: PROSPECCION (default) -> EJECUCION on explicit, audited
-- conversion of a GANADA opportunity (D2/D5). Nothing else reads this enum
-- yet in PR 1.
CREATE TYPE "FaseOportunidad" AS ENUM ('PROSPECCION', 'EJECUCION');

ALTER TABLE "oportunidades"
  ADD COLUMN "fase" "FaseOportunidad" NOT NULL DEFAULT 'PROSPECCION',
  ADD COLUMN "fecha_adjudicacion" TIMESTAMP(3),
  ADD COLUMN "fecha_envio_propuesta" TIMESTAMP(3);

-- Composite unique index: required by Postgres as the target of the composite
-- FK below (an FK must reference a unique key), and doubles as the index
-- backing Oportunidad.tareas / Oportunidad.bitacora (D1).
CREATE UNIQUE INDEX "oportunidades_id_cliente_id_key" ON "oportunidades"("id", "cliente_id");

ALTER TABLE "tareas" ADD COLUMN "oportunidad_id" TEXT;
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_cliente_fkey"
  FOREIGN KEY ("oportunidad_id", "cliente_id")
  REFERENCES "oportunidades"("id", "cliente_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- D2: Postgres FKs default to MATCH SIMPLE — if ANY referencing column is
-- NULL, the FK is not checked at all. So oportunidad_id = 'X', cliente_id =
-- NULL would pass the FK above and produce a commercial task outside every
-- client scope. This CHECK closes that hole; Prisma cannot emit MATCH FULL
-- and does not model CHECK constraints, so it is hand-written here.
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_requiere_cliente"
  CHECK ("oportunidad_id" IS NULL OR "cliente_id" IS NOT NULL);

CREATE INDEX "tareas_oportunidad_id_idx" ON "tareas"("oportunidad_id");

-- BitacoraEntrada.cliente_id is already NOT NULL, so the MATCH SIMPLE hole
-- above does not exist here — no CHECK needed on this table.
ALTER TABLE "bitacora_entradas" ADD COLUMN "oportunidad_id" TEXT;
ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "bitacora_oportunidad_cliente_fkey"
  FOREIGN KEY ("oportunidad_id", "cliente_id")
  REFERENCES "oportunidades"("id", "cliente_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- D3: orthogonal commercial-access flag, independent of RolUsuario. Defaults
-- to false for everyone, then the seed below restores today's effective
-- access so the deploy does not lock anyone out.
ALTER TABLE "usuarios"
  ADD COLUMN "gestiona_oportunidades" BOOLEAN NOT NULL DEFAULT false;

-- Seed: flag exactly the COLABORADORES who are responsable of a client with
-- at least one live (non-deleted) Oportunidad. Non-COLABORADOR roles need no
-- seed — hasCommercialAccess (Phase 2) short-circuits on canManageAny(rol).
UPDATE "usuarios" u SET "gestiona_oportunidades" = true
WHERE u."rol" = 'COLABORADOR'
  AND EXISTS (
    SELECT 1 FROM "clientes" c
    JOIN "oportunidades" o ON o."cliente_id" = c."id" AND o."deleted_at" IS NULL
    WHERE c."responsable_id" = u."id" AND c."deleted_at" IS NULL
  );
