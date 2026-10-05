// Live-DB coverage for the GREENFIELD path of the v2_municipios migration
// (S1.3, REQ-CAT-04): the catalog does not exist anywhere yet, so the branch
// that runs in every environment is CREATE TABLE + the two unique indexes.
//
// Unlike the strategic-lines migration, this one SEEDS NOTHING. N-21 asked for
// the catalog to be filled from the normalised legacy `territorio` values, but
// no `territorio` field or enum exists in this repository: there is nothing to
// normalise and a national list of municipios would be invented data. The demo
// rows live in prisma/seed.ts, never in the migration.
//
// Like the rubro and línea migration tests, this file runs the REAL migration
// SQL inside a throwaway schema and always rolls back, so the local database
// keeps no trace of the test.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db"

import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { db } from "@/lib/db"

const MIGRATION_SQL = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20261005120000_v2_municipios/migration.sql"),
  "utf8",
)

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

/** Thrown to force a rollback even when the body succeeded. */
class IntentionalRollback extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

async function runAndRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let captured: T | undefined
  try {
    await db.$transaction(async (tx) => {
      captured = await fn(tx)
      throw new IntentionalRollback()
    }, TX_OPTIONS)
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  return captured as T
}

/** Isolated schema with the REAL migration applied. */
async function withGreenfieldSchema<T>(fn: (tx: Tx, schema: string) => Promise<T>): Promise<T> {
  const schema = `municipios_mig_inv_${randomUUID().replace(/-/g, "")}`

  return runAndRollback(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
    await tx.$executeRawUnsafe(MIGRATION_SQL)

    return fn(tx, schema)
  })
}

type IndexRow = { indexname: string; indexdef: string }

const EXPECTED_INDEXES = [
  "municipios_codigo_dane_key",
  "municipios_nombre_departamento_key",
]

async function uniqueIndexes(tx: Tx, schema: string): Promise<IndexRow[]> {
  return tx.$queryRawUnsafe<IndexRow[]>(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = 'municipios'
        AND indexname IN ('municipios_codigo_dane_key', 'municipios_nombre_departamento_key')
      ORDER BY indexname`,
    schema,
  )
}

async function municipioCount(tx: Tx, schema: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "${schema}"."municipios"`,
  )
  return rows[0].n
}

async function publicMunicipiosSnapshot(): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, nombre, departamento, codigo_dane, activo, fecha_suspension, orden, created_at, updated_at
       FROM public.municipios ORDER BY id`,
  )
  return JSON.stringify(rows)
}

let publicBefore = ""

beforeAll(async () => {
  publicBefore = await publicMunicipiosSnapshot()
})

describe("v2_municipios migration: greenfield path (live DB)", () => {
  it("creates the table with both unique indexes and seeds no rows", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      expect(await municipioCount(tx, schema)).toBe(0)

      const indexes = await uniqueIndexes(tx, schema)
      expect(indexes.map((row) => row.indexname)).toEqual(EXPECTED_INDEXES)
      // `indexdef` (not just the name) pins that both are UNIQUE indexes.
      for (const index of indexes) {
        expect(index.indexdef).toContain("UNIQUE INDEX")
      }
      expect(
        indexes.find((row) => row.indexname === "municipios_nombre_departamento_key")?.indexdef,
      ).toContain("(nombre, departamento)")
      expect(
        indexes.find((row) => row.indexname === "municipios_codigo_dane_key")?.indexdef,
      ).toContain("(codigo_dane)")
    })
  })

  it("rejects a duplicate (nombre, departamento) pair through its own index", async () => {
    const schema = `municipios_mig_inv_${randomUUID().replace(/-/g, "")}`

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
        await tx.$executeRawUnsafe(MIGRATION_SQL)

        await tx.$executeRawUnsafe(
          `INSERT INTO municipios (id, nombre, departamento, updated_at)
           VALUES ('m1', 'Medellín', 'Antioquia', CURRENT_TIMESTAMP)`,
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO municipios (id, nombre, departamento, updated_at)
           VALUES ('m2', 'Medellín', 'Antioquia', CURRENT_TIMESTAMP)`,
        )
      }, TX_OPTIONS),
    ).rejects.toThrow(/municipios_nombre_departamento_key/)
  })

  it("rejects a duplicate codigo_dane when present through its own index", async () => {
    const schema = `municipios_mig_inv_${randomUUID().replace(/-/g, "")}`

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
        await tx.$executeRawUnsafe(MIGRATION_SQL)

        await tx.$executeRawUnsafe(
          `INSERT INTO municipios (id, nombre, departamento, codigo_dane, updated_at)
           VALUES ('m1', 'Medellín', 'Antioquia', '05001', CURRENT_TIMESTAMP)`,
        )
        await tx.$executeRawUnsafe(
          `INSERT INTO municipios (id, nombre, departamento, codigo_dane, updated_at)
           VALUES ('m2', 'Soacha', 'Cundinamarca', '05001', CURRENT_TIMESTAMP)`,
        )
      }, TX_OPTIONS),
    ).rejects.toThrow(/municipios_codigo_dane_key/)
  })

  it("allows several NULL codigo_dane and the same nombre in a different departamento", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      // Postgres treats NULLs as distinct in a unique index, which is exactly
      // what "optional, unique only when present" requires.
      await tx.$executeRawUnsafe(
        `INSERT INTO "${schema}"."municipios" (id, nombre, departamento, updated_at) VALUES
           ('m1', 'La Unión', 'Antioquia', CURRENT_TIMESTAMP),
           ('m2', 'La Unión', 'Valle del Cauca', CURRENT_TIMESTAMP),
           ('m3', 'Sin Código A', 'Caldas', CURRENT_TIMESTAMP),
           ('m4', 'Sin Código B', 'Caldas', CURRENT_TIMESTAMP)`,
      )

      expect(await municipioCount(tx, schema)).toBe(4)
    })
  })

  it("is idempotent: running the same migration SQL a second time changes nothing", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "${schema}"."municipios" (id, nombre, departamento, codigo_dane, updated_at)
         VALUES ('keep', 'Medellín', 'Antioquia', '05001', CURRENT_TIMESTAMP)`,
      )
      const indexesBefore = await uniqueIndexes(tx, schema)

      await tx.$executeRawUnsafe(MIGRATION_SQL)

      // Re-running must not duplicate the row, add rows of its own or rebuild
      // the indexes.
      expect(await municipioCount(tx, schema)).toBe(1)
      expect(await uniqueIndexes(tx, schema)).toEqual(indexesBefore)
    })
  })

  it("adopts a pre-existing municipios table without failing", async () => {
    const schema = `municipios_mig_inv_${randomUUID().replace(/-/g, "")}`

    await runAndRollback(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
      // A partial table: every ADD COLUMN IF NOT EXISTS in the migration has to
      // work, the columns already present must be left alone and the indexes
      // still have to be installed.
      await tx.$executeRawUnsafe(
        `CREATE TABLE municipios (
           id TEXT NOT NULL,
           nombre TEXT NOT NULL,
           CONSTRAINT municipios_pkey PRIMARY KEY (id)
         )`,
      )

      await tx.$executeRawUnsafe(MIGRATION_SQL)

      const columns = await tx.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'municipios'
          ORDER BY column_name`,
        schema,
      )
      expect(columns.map((column) => column.column_name)).toEqual([
        "activo",
        "codigo_dane",
        "created_at",
        "departamento",
        "fecha_suspension",
        "id",
        "nombre",
        "orden",
        "updated_at",
      ])
      expect((await uniqueIndexes(tx, schema)).map((row) => row.indexname)).toEqual(EXPECTED_INDEXES)
    })
  })

  it("leaves public.municipios untouched after the rolled-back migration runs", async () => {
    expect(await publicMunicipiosSnapshot()).toBe(publicBefore)
  })
})
