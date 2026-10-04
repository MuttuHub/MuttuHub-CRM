// Live-DB coverage for the ADOPTION branch of the v2_rubros_codigo migration.
//
// The entire reason the migration is adoptive is that production already carries
// the abandoned v1 `rubros` table (Personal, Transporte, Material POP, Operación
// logística — created by a migration that lives in no branch of this repo). The
// local greenfield database only ever takes the CREATE TABLE branch, so this file
// rebuilds a production-shaped legacy table in an isolated, throwaway schema and
// runs the REAL migration SQL text in a transaction that always rolls back.
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
  resolve(process.cwd(), "prisma/migrations/20261001185211_v2_rubros_codigo/migration.sql"),
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

/** Isolated schema with a production-shaped legacy table and the REAL migration applied. */
async function withAdoptedLegacySchema<T>(fn: (tx: Tx, schema: string) => Promise<T>): Promise<T> {
  const schema = `rubros_mig_inv_${randomUUID().replace(/-/g, "")}`

  return runAndRollback(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)

    // Production's abandoned v1 shape, recovered from the phantom migration
    // (commit 6e4c6c8): id/nombre/activo/orden/created_at/updated_at/deleted_at,
    // a PK, a unique index on `nombre`, and NO `codigo` column.
    await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."rubros" (
      "id" TEXT NOT NULL,
      "nombre" TEXT NOT NULL,
      "activo" BOOLEAN NOT NULL DEFAULT true,
      "orden" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      "deleted_at" TIMESTAMP(3),
      CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
    )`)
    await tx.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "rubros_nombre_key" ON "${schema}"."rubros"("nombre")`,
    )
    await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."rubros"
      ("id", "nombre", "orden", "created_at", "updated_at")
      VALUES
      (gen_random_uuid(), 'Personal', 1, now(), now()),
      (gen_random_uuid(), 'Transporte', 2, now(), now()),
      (gen_random_uuid(), 'Material POP', 3, now(), now()),
      (gen_random_uuid(), 'Operación logística', 4, now(), now())`)

    await tx.$executeRawUnsafe(MIGRATION_SQL)

    return fn(tx, schema)
  })
}

type RubroRow = { nombre: string; codigo: string | null; activo: boolean }

async function rubroRows(tx: Tx, schema: string): Promise<RubroRow[]> {
  return tx.$queryRawUnsafe<RubroRow[]>(
    `SELECT nombre, codigo, activo FROM "${schema}"."rubros" ORDER BY nombre`,
  )
}

/**
 * Full surface the migration could leak into `public`: rows, the immutable-code
 * function and the trigger. Snapshotting only rows could not see a function or
 * trigger accidentally created outside the throwaway schema, so this also
 * records every `public` function and trigger by name and definition.
 */
async function publicRubrosSnapshot(): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, codigo, nombre, activo, orden, created_at, updated_at
       FROM public.rubros ORDER BY id`,
  )
  const functions = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS identity,
            p.prosrc AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  )
  const triggers = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT t.tgname AS name,
            c.relname AS table_name,
            pg_get_triggerdef(t.oid) AS definition
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY t.tgname`,
  )
  return JSON.stringify({ rows, functions, triggers })
}

let publicBefore = ""

beforeAll(async () => {
  publicBefore = await publicRubrosSnapshot()
})

describe("v2_rubros_codigo migration: adoption path (live DB)", () => {
  it("adopts the legacy table: backfills R01/R12, suspends the code-less rows, installs index and trigger", async () => {
    await withAdoptedLegacySchema(async (tx, schema) => {
      expect(await rubroRows(tx, schema)).toEqual([
        { nombre: "Material POP", codigo: null, activo: false },
        { nombre: "Operación logística", codigo: null, activo: false },
        { nombre: "Personal", codigo: "R01", activo: true },
        { nombre: "Transporte", codigo: "R12", activo: true },
      ])

      const indexes = await tx.$queryRawUnsafe<Array<{ indexname: string; indisunique: boolean }>>(
        `SELECT c.relname AS indexname, i.indisunique
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = 'rubros_codigo_key'`,
        schema,
      )
      // `indisunique` is the assertion that matters: checking the index by name
      // alone would pass for a non-unique index.
      expect(indexes).toEqual([{ indexname: "rubros_codigo_key", indisunique: true }])

      const triggers = await tx.$queryRawUnsafe<Array<{ tgname: string }>>(
        `SELECT tgname FROM pg_trigger
          WHERE tgrelid = to_regclass($1) AND NOT tgisinternal`,
        `${schema}.rubros`,
      )
      expect(triggers.map((row) => row.tgname)).toContain("rubros_codigo_no_update")

      // A rename and a NULL-code -> code assignment are allowed by the trigger.
      await tx.$executeRawUnsafe(
        `UPDATE "${schema}"."rubros" SET nombre = 'Transporte terrestre' WHERE codigo = 'R12'`,
      )
      await tx.$executeRawUnsafe(
        `UPDATE "${schema}"."rubros" SET codigo = 'R13'
          WHERE nombre = 'Material POP' AND codigo IS NULL`,
      )
      const afterAllowed = await rubroRows(tx, schema)
      expect(afterAllowed).toContainEqual({ nombre: "Transporte terrestre", codigo: "R12", activo: true })
      expect(afterAllowed).toContainEqual({ nombre: "Material POP", codigo: "R13", activo: false })
    })
  })

  it("enforces codigo uniqueness: a duplicate non-NULL code is rejected", async () => {
    await expect(
      withAdoptedLegacySchema(async (tx, schema) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "${schema}"."rubros"
             ("id", "nombre", "codigo", "orden", "created_at", "updated_at")
           VALUES (gen_random_uuid(), 'Duplicado de Personal', 'R01', 9, now(), now())`,
        )
      }),
    ).rejects.toThrow(/rubros_codigo_key|duplicate key/i)
  })

  it("rejects a change to an existing codigo with the immutability trigger", async () => {
    const schema = `rubros_mig_inv_${randomUUID().replace(/-/g, "")}`

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
        await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."rubros" (
          "id" TEXT NOT NULL,
          "nombre" TEXT NOT NULL,
          "activo" BOOLEAN NOT NULL DEFAULT true,
          "orden" INTEGER NOT NULL DEFAULT 0,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL,
          "deleted_at" TIMESTAMP(3),
          CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
        )`)
        await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."rubros"
          ("id", "nombre", "orden", "created_at", "updated_at")
          VALUES (gen_random_uuid(), 'Personal', 1, now(), now())`)
        await tx.$executeRawUnsafe(MIGRATION_SQL)

        await tx.$executeRawUnsafe(
          `UPDATE "${schema}"."rubros" SET codigo = 'R99' WHERE codigo = 'R01'`,
        )
      }, TX_OPTIONS),
    ).rejects.toThrow(/inmutable/i)
  })

  it("is idempotent: running the same migration SQL a second time changes nothing", async () => {
    await withAdoptedLegacySchema(async (tx, schema) => {
      const snapshot = JSON.stringify(await rubroRows(tx, schema))
      const count = await tx.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM "${schema}"."rubros"`,
      )

      await tx.$executeRawUnsafe(MIGRATION_SQL)

      expect(JSON.stringify(await rubroRows(tx, schema))).toBe(snapshot)
      expect(
        await tx.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM "${schema}"."rubros"`,
        ),
      ).toEqual(count)
    })
  })

  it("leaves public.rubros untouched after the rolled-back migration runs", async () => {
    expect(await publicRubrosSnapshot()).toBe(publicBefore)
  })
})
