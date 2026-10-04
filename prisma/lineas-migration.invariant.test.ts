// Live-DB coverage for the GREENFIELD path of the v2_lineas_estrategicas
// migration: the table does not exist anywhere yet, so the branch that runs in
// every environment is CREATE TABLE + seed + trigger.
//
// Like the rubro migration test, this file runs the REAL migration SQL text
// inside a throwaway schema and always rolls back, so the local database keeps
// no trace of the test.
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
  resolve(process.cwd(), "prisma/migrations/20261002120000_v2_lineas_estrategicas/migration.sql"),
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
  const schema = `lineas_mig_inv_${randomUUID().replace(/-/g, "")}`

  return runAndRollback(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
    await tx.$executeRawUnsafe(MIGRATION_SQL)

    return fn(tx, schema)
  })
}

type LineaRow = { codigo: string; nombre: string; activo: boolean; orden: number }

async function lineaRows(tx: Tx, schema: string): Promise<LineaRow[]> {
  return tx.$queryRawUnsafe<LineaRow[]>(
    `SELECT codigo, nombre, activo, orden FROM "${schema}"."lineas_estrategicas" ORDER BY orden`,
  )
}

async function publicLineasSnapshot(): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, codigo, nombre, activo, fecha_suspension, orden, created_at, updated_at
       FROM public.lineas_estrategicas ORDER BY id`,
  )
  return JSON.stringify(rows)
}

const EXPECTED: ReadonlyArray<[string, string]> = [
  ["LE01", "Empleabilidad"],
  ["LE02", "Emprendimiento"],
  ["LE03", "Productividad"],
  ["LE04", "Cultural"],
  ["LE05", "Social"],
  ["LE06", "Cívico-político"],
  ["LE07", "Método Muttu"],
  ["LE08", "Ambiental"],
]

let publicBefore = ""

beforeAll(async () => {
  publicBefore = await publicLineasSnapshot()
})

describe("v2_lineas_estrategicas migration: greenfield path (live DB)", () => {
  it("creates the table, seeds the 8 RF-02 lines in LE01..LE08 order and installs index and trigger", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      expect(await lineaRows(tx, schema)).toEqual(
        EXPECTED.map(([codigo, nombre], index) => ({
          codigo,
          nombre,
          activo: true,
          orden: index + 1,
        })),
      )

      const indexes = await tx.$queryRawUnsafe<Array<{ indexname: string; indisunique: boolean }>>(
        `SELECT c.relname AS indexname, i.indisunique
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = 'lineas_estrategicas_codigo_key'`,
        schema,
      )
      // `indisunique` pins the uniqueness the code index promises; a name-only
      // check would pass for a non-unique index. Mirrors the rubros migration.
      expect(indexes).toEqual([{ indexname: "lineas_estrategicas_codigo_key", indisunique: true }])

      const triggers = await tx.$queryRawUnsafe<Array<{ tgname: string }>>(
        `SELECT tgname FROM pg_trigger
          WHERE tgrelid = to_regclass($1) AND NOT tgisinternal`,
        `${schema}.lineas_estrategicas`,
      )
      expect(triggers.map((row) => row.tgname)).toContain("lineas_estrategicas_codigo_no_update")

      // A rename and a suspension (with the timestamp) are allowed by the
      // trigger, because neither touches `codigo`.
      await tx.$executeRawUnsafe(
        `UPDATE "${schema}"."lineas_estrategicas"
            SET nombre = 'Empleabilidad y talento', activo = false, fecha_suspension = CURRENT_TIMESTAMP
          WHERE codigo = 'LE01'`,
      )
      const afterAllowed = await lineaRows(tx, schema)
      expect(afterAllowed).toContainEqual({
        codigo: "LE01",
        nombre: "Empleabilidad y talento",
        activo: false,
        orden: 1,
      })
    })
  })

  it("rejects a change to an existing codigo with the immutability trigger", async () => {
    const schema = `lineas_mig_inv_${randomUUID().replace(/-/g, "")}`

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
        await tx.$executeRawUnsafe(MIGRATION_SQL)

        await tx.$executeRawUnsafe(
          `UPDATE "${schema}"."lineas_estrategicas" SET codigo = 'LE99' WHERE codigo = 'LE01'`,
        )
      }, TX_OPTIONS),
    ).rejects.toThrow(/inmutable/i)
  })

  it("is idempotent: running the same migration SQL a second time changes nothing", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      const snapshot = JSON.stringify(await lineaRows(tx, schema))
      const count = await tx.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "${schema}"."lineas_estrategicas"`,
      )

      await tx.$executeRawUnsafe(MIGRATION_SQL)

      expect(JSON.stringify(await lineaRows(tx, schema))).toBe(snapshot)
      expect(
        await tx.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM "${schema}"."lineas_estrategicas"`,
        ),
      ).toEqual(count)
    })
  })

  it("leaves public.lineas_estrategicas untouched after the rolled-back migration runs", async () => {
    expect(await publicLineasSnapshot()).toBe(publicBefore)
  })
})
