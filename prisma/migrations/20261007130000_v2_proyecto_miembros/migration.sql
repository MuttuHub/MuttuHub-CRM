-- Adoptive + idempotent migration (S2.6, ADR-09, DP-06): project team
-- membership.
--
-- A membership is never hard-deleted. `removed_at` soft-revokes access while
-- the row is kept for history, and a removed member can be re-added later; that
-- is why `id` is a surrogate primary key and `(proyecto_id, usuario_id)` is not
-- unique by itself — the same pair legitimately repeats over time.
--
-- The partial unique index `proyecto_miembros_activo_uq` enforces at most ONE
-- active membership per pair. Prisma cannot express a partial index, so it is
-- hand-written here, and it is the only DB-level guard for the invariant.
--
-- No seed rows and no CHECK constraints: none are specified for this table.
-- `puede_ver_tablero_gerencial` is deliberately absent: the managerial-board
-- flag belongs to a later slice.

-- 1. Table.
CREATE TABLE IF NOT EXISTS "proyecto_miembros" (
    "id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "agregado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removido_por_id" TEXT,

    CONSTRAINT "proyecto_miembros_pkey" PRIMARY KEY ("id")
);

-- 2. Adoption of a pre-existing table: every column is added only when missing.
-- On the greenfield creation path above all of these are no-ops. The NOT NULL
-- adds are safe because the only table this migration can meet is either the
-- one it just created or an empty one; there is no legacy membership data to
-- backfill.
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "proyecto_id" TEXT NOT NULL;
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "usuario_id" TEXT NOT NULL;
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "agregado_por_id" TEXT NOT NULL;
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMP(3);
ALTER TABLE "proyecto_miembros" ADD COLUMN IF NOT EXISTS "removido_por_id" TEXT;

-- 3. Indexes, exactly as declared in schema.prisma: one on the project FK and
-- the composite the `es_miembro` probe uses. `agregado_por_id` and
-- `removido_por_id` are audit-only and deliberately carry no index and no FK.
CREATE INDEX IF NOT EXISTS "proyecto_miembros_proyecto_id_idx" ON "proyecto_miembros"("proyecto_id");
CREATE INDEX IF NOT EXISTS "proyecto_miembros_usuario_id_removed_at_idx" ON "proyecto_miembros"("usuario_id", "removed_at");

-- S2.6: at most ONE ACTIVE membership per (proyecto, usuario). Partial unique
-- index — Prisma cannot express it, and it is the only DB-level guard for the
-- invariant. A removed row (`removed_at IS NOT NULL`) falls outside the
-- predicate, so re-adding a removed member is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "proyecto_miembros_activo_uq"
  ON "proyecto_miembros"("proyecto_id", "usuario_id") WHERE "removed_at" IS NULL;

-- 4. Foreign keys, each guarded so a re-run is a no-op. Required relations use
-- Postgres's default Prisma actions (RESTRICT / CASCADE), same as the other
-- bridge tables.
DO $$ BEGIN
  ALTER TABLE "proyecto_miembros" ADD CONSTRAINT "proyecto_miembros_proyecto_id_fkey"
    FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proyecto_miembros" ADD CONSTRAINT "proyecto_miembros_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
