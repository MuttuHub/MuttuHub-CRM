-- Adoptive + idempotent migration (S2.2, SDD §4.2): the per-year counter that
-- issues the `PRY-AAAA-NNN` project codes.
--
-- `anio` is the primary key. The allocator in `src/lib/api/project-code.ts`
-- upserts a single row per year, so Postgres's row lock on `anio` serialises
-- concurrent creations and two of them can never receive the same sequence.
--
-- NO seed rows and NO foreign keys: `anio` is not a project column, and the
-- first allocation initialises the counter from the maximum code already
-- present in `proyectos` for that year (a legacy year keeps its series instead
-- of colliding with `proyectos_codigo_key`).

CREATE TABLE IF NOT EXISTS "proyecto_secuencias" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proyecto_secuencias_pkey" PRIMARY KEY ("anio")
);

-- Adoption of a pre-existing table: every column is added only when missing.
-- On the greenfield creation path above both are no-ops; there is no legacy
-- counter data to backfill.
ALTER TABLE "proyecto_secuencias" ADD COLUMN IF NOT EXISTS "anio" INTEGER NOT NULL;
ALTER TABLE "proyecto_secuencias" ADD COLUMN IF NOT EXISTS "ultimo" INTEGER NOT NULL DEFAULT 0;
