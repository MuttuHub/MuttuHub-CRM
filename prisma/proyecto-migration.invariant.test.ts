// Live-DB coverage for the v2_proyecto_general migration (S2.1). The project
// aggregate is greenfield on this branch — no `proyectos` table exists in any
// environment — so the branch that runs is CREATE TABLE for the three tables,
// the two enums and the indexes, including the hand-written partial unique
// index `proyecto_lineas_principal_uq` (exactly one principal strategic line
// per project; Prisma cannot express a partial index).
//
// No CHECK constraints and no seed rows: none are specified for these tables.
//
// Like the municipio and línea migration tests, this file runs the REAL
// migration SQL inside a throwaway schema and always rolls back, so the local
// database keeps no trace of the test.
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
  resolve(process.cwd(), "prisma/migrations/20261006120000_v2_proyecto_general/migration.sql"),
  "utf8",
)

const TABLES = ["proyecto_lineas", "proyecto_municipios", "proyectos"] as const

const EXPECTED_INDEXES = [
  "proyecto_lineas_pkey",
  "proyecto_lineas_principal_uq",
  "proyecto_municipios_pkey",
  "proyectos_cliente_id_idx",
  "proyectos_codigo_key",
  "proyectos_estado_idx",
  "proyectos_oportunidad_id_cliente_id_key",
  "proyectos_oportunidad_id_key",
  "proyectos_pkey",
] as const

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
  const schema = `proyecto_mig_inv_${randomUUID().replace(/-/g, "")}`

  return runAndRollback(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`)
    await tx.$executeRawUnsafe(MIGRATION_SQL)

    return fn(tx, schema)
  })
}

type IndexRow = { tablename: string; indexname: string; indexdef: string }

async function indexes(tx: Tx, schema: string): Promise<IndexRow[]> {
  return tx.$queryRawUnsafe<IndexRow[]>(
    `SELECT tablename, indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = $1
        AND tablename IN ('proyectos', 'proyecto_lineas', 'proyecto_municipios')
        AND indexname = ANY($2)
      ORDER BY indexname`,
    schema,
    [...EXPECTED_INDEXES],
  )
}

async function existingTables(tx: Tx, schema: string): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = $1 AND tablename = ANY($2)
      ORDER BY tablename`,
    schema,
    [...TABLES],
  )
  return rows.map((row) => row.tablename)
}

async function enumLabels(tx: Tx, schema: string, name: string): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<Array<{ label: string }>>(
    `SELECT e.enumlabel AS label
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1 AND t.typname = $2
      ORDER BY e.enumsortorder`,
    schema,
    name,
  )
  return rows.map((row) => row.label)
}

async function publicProyectosSnapshot(): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, codigo, nombre, cliente_id, oportunidad_id, estado, origen, deleted_at
       FROM public.proyectos ORDER BY id`,
  )
  return JSON.stringify(rows)
}

let publicBefore = ""

beforeAll(async () => {
  publicBefore = await publicProyectosSnapshot()
})

describe("v2_proyecto_general migration: greenfield path (live DB)", () => {
  it("creates the three tables, the two enums and every index", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      expect(await existingTables(tx, schema)).toEqual([...TABLES])

      expect(await enumLabels(tx, schema, "EstadoProyecto")).toEqual([
        "PLANIFICACION",
        "BORRADOR",
        "EN_EJECUCION",
        "SUSPENDIDO",
        "CERRADO",
        "CANCELADO",
      ])
      expect(await enumLabels(tx, schema, "OrigenProyecto")).toEqual(["OPORTUNIDAD", "INDEPENDIENTE"])

      const rows = await indexes(tx, schema)
      expect(rows.map((row) => row.indexname)).toEqual([...EXPECTED_INDEXES])

      const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]))
      expect(byName.get("proyectos_codigo_key")).toContain("UNIQUE INDEX")
      expect(byName.get("proyectos_codigo_key")).toContain("(codigo)")
      expect(byName.get("proyectos_oportunidad_id_key")).toContain("UNIQUE INDEX")
      expect(byName.get("proyectos_oportunidad_id_key")).toContain("(oportunidad_id)")
      // The partial index is the only DB-level guard for "exactly one principal
      // line per project"; `indexdef` must keep its WHERE predicate.
      expect(byName.get("proyecto_lineas_principal_uq")).toContain("UNIQUE INDEX")
      expect(byName.get("proyecto_lineas_principal_uq")).toContain("(proyecto_id)")
      expect(byName.get("proyecto_lineas_principal_uq")).toContain("WHERE principal")
    })
  })

  it("installs the composite FK onto oportunidades(id, cliente_id)", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      const rows = await tx.$queryRawUnsafe<Array<{ constraint_name: string; detail: string }>>(
        `SELECT con.conname AS constraint_name,
                pg_get_constraintdef(con.oid) AS detail
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = rel.relnamespace
          WHERE n.nspname = $1 AND rel.relname = 'proyectos'
            AND con.contype = 'f'
          ORDER BY con.conname`,
        schema,
      )

      const composite = rows.find(
        (row) => row.constraint_name === "proyectos_oportunidad_id_cliente_id_fkey",
      )
      expect(composite).toBeTruthy()
      expect(composite?.detail).toContain("FOREIGN KEY (oportunidad_id, cliente_id)")
      expect(composite?.detail).toContain("REFERENCES oportunidades(id, cliente_id)")
    })
  })

  it("is idempotent: running the same migration SQL a second time changes nothing", async () => {
    await withGreenfieldSchema(async (tx, schema) => {
      const tablesBefore = await existingTables(tx, schema)
      const indexesBefore = await indexes(tx, schema)
      const enumBefore = await enumLabels(tx, schema, "EstadoProyecto")

      await tx.$executeRawUnsafe(MIGRATION_SQL)

      expect(await existingTables(tx, schema)).toEqual(tablesBefore)
      expect(await indexes(tx, schema)).toEqual(indexesBefore)
      expect(await enumLabels(tx, schema, "EstadoProyecto")).toEqual(enumBefore)
    })
  })

  it("leaves public.proyectos untouched after the rolled-back migration runs", async () => {
    expect(await publicProyectosSnapshot()).toBe(publicBefore)
  })
})
