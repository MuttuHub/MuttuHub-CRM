// Live-DB coverage for the two migrations that adopt the production v1 leftovers
// (rehearsal R4, 2026-10-16):
//   - 20260930000000_v2_adopt_production_v1_shape  (phantom FK names, empty v1 tables/enums)
//   - 20261016120000_v2_reconcile_adopted_v1_drift (rubros/lineas drift)
//
// Production carries a phantom applied migration (commit 6e4c6c8) that no branch
// contains, so the local greenfield database never sees that shape. Every case
// rebuilds it in an isolated, throwaway schema and runs the REAL migration SQL in
// a transaction that always rolls back. The dev database is never reset and no
// object outside the throwaway schema is touched.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db"

import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8")

const ADOPT_SQL = read("20260930000000_v2_adopt_production_v1_shape")
const RECONCILE_SQL = read("20261016120000_v2_reconcile_adopted_v1_drift")

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Runs `fn` inside a throwaway schema and always rolls back. */
async function inThrowawaySchema<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const schema = `v1_shape_inv_${randomUUID().replace(/-/g, "")}`
  let captured: T | undefined
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
      captured = await fn(tx)
      throw new IntentionalRollback()
    }, TX_OPTIONS)
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return captured as T
}

/** Error message of a statement that is expected to fail (the tx is poisoned afterwards). */
async function failure(tx: Tx, sql: string): Promise<string> {
  try {
    await tx.$executeRawUnsafe(sql)
  } catch (error) {
    const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } }).meta
    return meta?.driverAdapterError?.cause?.originalMessage ?? String(error)
  }
  return ""
}

const PHANTOM_APPLIED = `INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
  VALUES ('x', 'x', '20260930181056_v2_auditoria_cambios', now(), now(), 1)`

/** Tables of the rest of the schema that the v1 / v2 shapes reference. */
async function baseTables(tx: Tx, fkNames: "phantom" | "original" | "v2") {
  await tx.$executeRawUnsafe(`
    CREATE TABLE "_prisma_migrations" (
      id TEXT PRIMARY KEY, checksum TEXT, migration_name TEXT, started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ, rolled_back_at TIMESTAMPTZ, applied_steps_count INT);
    CREATE TABLE "clientes" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "usuarios" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "documentos" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "oportunidades" ("id" TEXT PRIMARY KEY, "cliente_id" TEXT NOT NULL,
      UNIQUE ("id", "cliente_id"));
    CREATE TABLE "bitacora_entradas" ("id" TEXT PRIMARY KEY, "oportunidad_id" TEXT, "cliente_id" TEXT);
    CREATE TABLE "tareas" ("id" TEXT PRIMARY KEY, "oportunidad_id" TEXT, "cliente_id" TEXT);
  `)
  // The phantom migration ALREADY renamed these two FKs; the original (v2-expected
  // old) names are what 20260930181056 renames from.
  const [bitacora, tareas] =
    fkNames === "original"
      ? ["bitacora_oportunidad_cliente_fkey", "tareas_oportunidad_cliente_fkey"]
      : ["bitacora_entradas_oportunidad_id_cliente_id_fkey", "tareas_oportunidad_id_cliente_id_fkey"]
  await tx.$executeRawUnsafe(`
    ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "${bitacora}"
      FOREIGN KEY ("oportunidad_id", "cliente_id") REFERENCES "oportunidades"("id", "cliente_id");
    ALTER TABLE "tareas" ADD CONSTRAINT "${tareas}"
      FOREIGN KEY ("oportunidad_id", "cliente_id") REFERENCES "oportunidades"("id", "cliente_id");
  `)
}

/** Production's v1 shape, trimmed from commit 6e4c6c8 to the markers, keys and FKs that matter. */
async function v1Tables(tx: Tx) {
  await tx.$executeRawUnsafe(`
    CREATE TYPE "LineaEstrategica" AS ENUM ('EMPLEABILIDAD', 'SOCIAL');
    CREATE TYPE "EstadoProyecto" AS ENUM ('PLANIFICACION', 'EN_EJECUCION', 'SUSPENDIDO', 'CERRADO', 'CANCELADO');
    CREATE TYPE "TipoSoporte" AS ENUM ('VERIFICACION', 'LEGALIZACION');

    CREATE TABLE "proyectos" (
      "id" TEXT PRIMARY KEY, "codigo" TEXT NOT NULL, "cliente_id" TEXT NOT NULL REFERENCES "clientes"("id"),
      "territorio" TEXT NOT NULL, "linea_estrategica" "LineaEstrategica" NOT NULL,
      "estado" "EstadoProyecto" NOT NULL DEFAULT 'PLANIFICACION', "deleted_at" TIMESTAMP(3));
    CREATE TABLE "metas" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL REFERENCES "proyectos"("id"),
      UNIQUE ("id", "proyecto_id"));
    CREATE TABLE "actividades" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL REFERENCES "proyectos"("id"),
      "meta_id" TEXT NOT NULL, UNIQUE ("id", "proyecto_id"),
      FOREIGN KEY ("meta_id", "proyecto_id") REFERENCES "metas"("id", "proyecto_id"));
    CREATE TABLE "rubros" ("id" TEXT PRIMARY KEY, "nombre" TEXT NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true,
      "orden" INT NOT NULL DEFAULT 0, "deleted_at" TIMESTAMP(3));
    CREATE UNIQUE INDEX "rubros_nombre_key" ON "rubros"("nombre");
    CREATE TABLE "lineas_presupuestales" (
      "id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "rubro_id" TEXT NOT NULL,
      "monto_proyectado_cop" DECIMAL(15,2) NOT NULL, "deleted_at" TIMESTAMP(3),
      UNIQUE ("id", "proyecto_id"),
      CONSTRAINT "lineas_presupuestales_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id"),
      CONSTRAINT "lineas_presupuestales_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros"("id"),
      CONSTRAINT "lineas_monto_no_negativo" CHECK ("monto_proyectado_cop" >= 0));
    CREATE TABLE "gastos" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "linea_id" TEXT NOT NULL,
      "concepto" TEXT NOT NULL, UNIQUE ("id", "proyecto_id"),
      FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id"),
      FOREIGN KEY ("linea_id", "proyecto_id") REFERENCES "lineas_presupuestales"("id", "proyecto_id"));
    CREATE TABLE "indicadores" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL REFERENCES "proyectos"("id"),
      "meta_id" TEXT, "meta_valor" DECIMAL(15,2) NOT NULL);
    CREATE TABLE "soportes_proyecto" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL,
      "actividad_id" TEXT, "gasto_id" TEXT, "tipo" "TipoSoporte" NOT NULL,
      FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id"),
      FOREIGN KEY ("actividad_id", "proyecto_id") REFERENCES "actividades"("id", "proyecto_id"),
      FOREIGN KEY ("gasto_id", "proyecto_id") REFERENCES "gastos"("id", "proyecto_id"));
    INSERT INTO "rubros" ("id", "nombre", "orden") VALUES ('r1', 'Personal', 1), ('r2', 'Transporte', 2);
  `)
}

/** A v2-shaped schema: what a fresh or already-migrated database looks like around these tables. */
async function v2Tables(tx: Tx) {
  await tx.$executeRawUnsafe(`
    CREATE TYPE "EstadoProyecto" AS ENUM ('PLANIFICACION', 'BORRADOR', 'EN_EJECUCION', 'SUSPENDIDO', 'CERRADO', 'CANCELADO');
    CREATE TABLE "proyectos" ("id" TEXT PRIMARY KEY, "cliente_id" TEXT NOT NULL REFERENCES "clientes"("id"),
      "estado" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR', "deleted_at" TIMESTAMP(3));
    CREATE TABLE "objetivos" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, UNIQUE ("id", "proyecto_id"));
    CREATE TABLE "actividades" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "objetivo_id" TEXT NOT NULL);
    CREATE TABLE "gastos" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "linea_id" TEXT NOT NULL, "monto_cop" DECIMAL(15,2));
    CREATE TABLE "indicadores" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "meta" DECIMAL(15,2));
    CREATE TABLE "soportes_proyecto" ("id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL, "avance_id" TEXT);
    CREATE TABLE "rubros" ("id" TEXT PRIMARY KEY, "codigo" TEXT UNIQUE, "nombre" TEXT NOT NULL,
      "activo" BOOLEAN NOT NULL DEFAULT true, "orden" INT NOT NULL DEFAULT 0);
    CREATE TABLE "lineas_presupuestales" (
      "id" TEXT PRIMARY KEY, "proyecto_id" TEXT NOT NULL REFERENCES "proyectos"("id"), "rubro_id" TEXT NOT NULL,
      "monto_proyectado_cop" DECIMAL(15,2) NOT NULL,
      CONSTRAINT "lineas_monto_no_negativo_ck" CHECK ("monto_proyectado_cop" >= 0));
  `)
}

/** Deterministic dump of every catalog object that either migration could change. */
async function catalog(tx: Tx): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ kind: string; item: string }>>(`
    SELECT 'column' AS kind, table_name || '.' || column_name || ':' || udt_name AS item
      FROM information_schema.columns WHERE table_schema = current_schema()
    UNION ALL
    SELECT 'constraint', t.relname || '.' || c.conname || ':' || pg_get_constraintdef(c.oid)
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relnamespace = current_schema()::regnamespace
    UNION ALL
    SELECT 'index', indexname || ':' || indexdef FROM pg_indexes WHERE schemaname = current_schema()
    UNION ALL
    SELECT 'enum', t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typnamespace = current_schema()::regnamespace GROUP BY t.typname
    ORDER BY 1, 2`)
  return JSON.stringify(rows)
}

async function names(tx: Tx, sql: string): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ n: string }>>(sql)
  return rows.map((row) => row.n)
}

const tablesNow = (tx: Tx) =>
  names(tx, `SELECT table_name AS n FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY 1`)
const enumsNow = (tx: Tx) =>
  names(tx, `SELECT typname AS n FROM pg_type WHERE typnamespace = current_schema()::regnamespace AND typtype = 'e' ORDER BY 1`)
const constraintsOn = (tx: Tx, table: string) =>
  names(
    tx,
    `SELECT c.conname AS n FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relnamespace = current_schema()::regnamespace AND t.relname = '${table}' ORDER BY 1`,
  )

const V1_TABLES = ["actividades", "gastos", "indicadores", "metas", "proyectos", "soportes_proyecto"]

describe("v1 production shape adoption (20260930000000)", () => {
  it("renames the phantom FKs back while 20260930181056 has not run", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "phantom")
      await tx.$executeRawUnsafe(ADOPT_SQL)

      expect(await constraintsOn(tx, "bitacora_entradas")).toContain("bitacora_oportunidad_cliente_fkey")
      expect(await constraintsOn(tx, "bitacora_entradas")).not.toContain(
        "bitacora_entradas_oportunidad_id_cliente_id_fkey",
      )
      expect(await constraintsOn(tx, "tareas")).toContain("tareas_oportunidad_cliente_fkey")
      expect(await constraintsOn(tx, "tareas")).not.toContain("tareas_oportunidad_id_cliente_id_fkey")

      // The rename that 20260930181056 performs now succeeds.
      await tx.$executeRawUnsafe(
        `ALTER TABLE "bitacora_entradas" RENAME CONSTRAINT "bitacora_oportunidad_cliente_fkey" TO "bitacora_entradas_oportunidad_id_cliente_id_fkey";
         ALTER TABLE "tareas" RENAME CONSTRAINT "tareas_oportunidad_cliente_fkey" TO "tareas_oportunidad_id_cliente_id_fkey"`,
      )
    })
  })

  it("does not touch the FK names once 20260930181056 is applied", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "phantom")
      await tx.$executeRawUnsafe(PHANTOM_APPLIED)
      const before = await catalog(tx)

      await tx.$executeRawUnsafe(ADOPT_SQL)

      expect(await catalog(tx)).toBe(before)
    })
  })

  it("leaves a database that already has the original FK names alone", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "original")
      const before = await catalog(tx)

      await tx.$executeRawUnsafe(ADOPT_SQL)

      expect(await catalog(tx)).toBe(before)
    })
  })

  it("drops the six empty v1 tables and three v1 enums, keeping rubros and lineas_presupuestales", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "phantom")
      await v1Tables(tx)
      expect(await tablesNow(tx)).toEqual(expect.arrayContaining(V1_TABLES))

      await tx.$executeRawUnsafe(ADOPT_SQL)

      const tables = await tablesNow(tx)
      for (const table of V1_TABLES) expect(tables).not.toContain(table)
      expect(tables).toEqual(expect.arrayContaining(["rubros", "lineas_presupuestales"]))
      expect(await enumsNow(tx)).toEqual([])
      // Only the FK to the v1 proyectos went; the table, its rubro FK and rows stay.
      const lineas = await constraintsOn(tx, "lineas_presupuestales")
      expect(lineas).not.toContain("lineas_presupuestales_proyecto_id_fkey")
      expect(lineas).toContain("lineas_presupuestales_rubro_id_fkey")
      expect(await names(tx, `SELECT id AS n FROM "rubros" ORDER BY 1`)).toEqual(["r1", "r2"])
    })
  })

  it("is idempotent: a second run changes nothing", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "phantom")
      await v1Tables(tx)
      await tx.$executeRawUnsafe(ADOPT_SQL)
      const afterFirst = await catalog(tx)

      await tx.$executeRawUnsafe(ADOPT_SQL)

      expect(await catalog(tx)).toBe(afterFirst)
    })
  })

  it.each([
    ["proyectos", false],
    ["metas", true],
  ])("raises naming v1 table %s when it holds rows", async (table, withMeta) => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "phantom")
      await v1Tables(tx)
      await tx.$executeRawUnsafe(`INSERT INTO "clientes" ("id") VALUES ('c1')`)
      await tx.$executeRawUnsafe(
        `INSERT INTO "proyectos" ("id","codigo","cliente_id","territorio","linea_estrategica") VALUES ('p','c','c1','t','SOCIAL')`,
      )
      if (withMeta) await tx.$executeRawUnsafe(`INSERT INTO "metas" ("id","proyecto_id") VALUES ('m','p')`)

      const message = await failure(tx, ADOPT_SQL)

      expect(message).toContain(`v1 table "${table}" is not empty`)
    })
  })

  it("keeps a v2-shaped database untouched (no-op), including the v2 EstadoProyecto enum", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "v2")
      await v2Tables(tx)
      await tx.$executeRawUnsafe(PHANTOM_APPLIED)
      const before = await catalog(tx)

      await tx.$executeRawUnsafe(ADOPT_SQL)

      expect(await catalog(tx)).toBe(before)
    })
  })
})

describe("adopted v1 drift reconciliation (20261016120000)", () => {
  async function adoptedV1(tx: Tx) {
    await baseTables(tx, "phantom")
    await v1Tables(tx)
    await tx.$executeRawUnsafe(ADOPT_SQL)
  }

  it("drops rubros_nombre_key and the v1 deleted_at columns, and renames the amount CHECK", async () => {
    await inThrowawaySchema(async (tx) => {
      await adoptedV1(tx)

      await tx.$executeRawUnsafe(RECONCILE_SQL)

      expect(await names(tx, `SELECT indexname AS n FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'rubros'`)).toEqual(["rubros_pkey"])
      expect(
        await names(
          tx,
          `SELECT table_name AS n FROM information_schema.columns
            WHERE table_schema = current_schema() AND column_name = 'deleted_at'`,
        ),
      ).toEqual([])
      const lineas = await constraintsOn(tx, "lineas_presupuestales")
      expect(lineas).toContain("lineas_monto_no_negativo_ck")
      expect(lineas).not.toContain("lineas_monto_no_negativo")
      expect(await names(tx, `SELECT id AS n FROM "rubros" ORDER BY 1`)).toEqual(["r1", "r2"])
    })
  })

  it("drops the v1 CHECK when the v2 migration already added its own copy", async () => {
    await inThrowawaySchema(async (tx) => {
      await adoptedV1(tx)
      await tx.$executeRawUnsafe(
        `ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_monto_no_negativo_ck" CHECK ("monto_proyectado_cop" >= 0)`,
      )

      await tx.$executeRawUnsafe(RECONCILE_SQL)

      const lineas = await constraintsOn(tx, "lineas_presupuestales")
      expect(lineas).toContain("lineas_monto_no_negativo_ck")
      expect(lineas).not.toContain("lineas_monto_no_negativo")
    })
  })

  it("is idempotent: a second run changes nothing", async () => {
    await inThrowawaySchema(async (tx) => {
      await adoptedV1(tx)
      await tx.$executeRawUnsafe(RECONCILE_SQL)
      const afterFirst = await catalog(tx)

      await tx.$executeRawUnsafe(RECONCILE_SQL)

      expect(await catalog(tx)).toBe(afterFirst)
    })
  })

  it("refuses to drop deleted_at while a rubro is soft-deleted", async () => {
    await inThrowawaySchema(async (tx) => {
      await adoptedV1(tx)
      await tx.$executeRawUnsafe(`UPDATE "rubros" SET "deleted_at" = now() WHERE "id" = 'r2'`)

      const message = await failure(tx, RECONCILE_SQL)

      expect(message).toContain("soft-deleted")
    })
  })

  it("is a no-op on a v2-shaped database", async () => {
    await inThrowawaySchema(async (tx) => {
      await baseTables(tx, "v2")
      await v2Tables(tx)
      const before = await catalog(tx)

      await tx.$executeRawUnsafe(RECONCILE_SQL)

      expect(await catalog(tx)).toBe(before)
    })
  })
})
